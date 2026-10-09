import type * as ChildProcessModule from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { gateCommand, toProjectPath } from "../../../src/cli/commands/gate.ts";
import { gitCheckRunner } from "../../../src/cli/engine/gitStatus.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { NO_GIT_CONFIG } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

// Fixture data kept out of the test-input census: these globs are built at run time, as literals they name this repository's docs, site and top-level .md files.
const DOCS_GLOB = ["docs", "**"].join("/");
const SITE_GLOB = ["website", "**"].join("/");
const TOP_MD_GLOB = ["*", "md"].join(".");

/**
 * p1a-classifier-verb (REQ-FLOW-061): `stamity gate classify --paths`, through
 * the in-process funnel, so each case also covers the 0/1/2 exit contract and
 * the one JSON document. `--paths` classifies by path rules alone and reads no
 * file and no git, so no fixture repository is needed and nothing is stubbed.
 *
 * p1c-classify-git-reads: without `--paths` the verb reads the change from git.
 * Those cases run real git in scratch repositories, never a scripted runner:
 * the hardened runner and the NUL-separated parse are the thing under test.
 *
 * One seam watches that git: every argv the verb's runner hands `execFileSync`
 * is recorded (so a test can pin what never reaches git), and a test can make
 * one step fail with a real Node error — a 60-second timeout and a 64 MiB
 * output are out of a unit test's reach, the reason each produces is not.
 */

/** The verb's git calls (the runner's `-c safe.bareRepository=explicit` marks them), and one planted failure. */
const gitSpy = vi.hoisted(() => ({
  calls: [] as string[][],
  fault: undefined as { step: string; error: unknown } | undefined,
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof ChildProcessModule>();
  const original = actual.execFileSync as unknown as (...args: unknown[]) => unknown;
  return {
    ...actual,
    execFileSync: (...args: unknown[]): unknown => {
      if (args[0] === "git" && Array.isArray(args[1]) && args[1][1] === "safe.bareRepository=explicit") {
        const argv = args[1].map(String);
        gitSpy.calls.push(argv);
        const { fault } = gitSpy;
        if (fault !== undefined && argv.includes(fault.step)) {
          gitSpy.fault = undefined;
          throw fault.error;
        }
      }
      return original(...args);
    },
  };
});

/** The error Node really throws for a child that fails this way: a timeout, an output bound, an exit status. */
function realFailure(script: string, bounds: { timeout?: number; maxBuffer?: number } = {}): unknown {
  try {
    execFileSync(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "ignore"], ...bounds });
  } catch (err) {
    return err;
  }
  throw new Error("the child was meant to fail");
}

const run = (argv: readonly string[], opts?: { cwd?: string }) =>
  runInProcess([gateCommand], ["gate", ...argv], opts);

/** Runs `body` with `process.platform` reading `platform`, restored after (review/43). */
async function onPlatform<T>(platform: NodeJS.Platform, body: () => Promise<T>): Promise<T> {
  const real = process.platform;
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try {
    return await body();
  } finally {
    Object.defineProperty(process, "platform", { value: real, configurable: true });
  }
}

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
      byPath: [{ path: "docs/x.md", class: "docs", rule: DOCS_GLOB }],
      // TEST CHANGE, justified: 2026-10-09, p2b-test-inputs — the document gains `tests`, the selection
      // (REQ-FLOW-062); with no base no map is read, so every test runs (S4).
      tests: { full: true, files: [], reason: expect.stringContaining("no test-input map") as string },
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
    // TEST CHANGE, justified: 2026-10-09, p2b-test-inputs — the person's lines gain the selection; no map, so all.
    expect(result.stdout).toContain("tests: all (");
    expect(result.stdout).toContain("reason: ");
    expect(result.stdout).toMatch(/^ {2}docs\/x\.md {2}docs {2}\(docs\/\*\*\)$/m);
    expect(result.stdout).toMatch(/^ {2}src\/x\.ts {2}product /m);
  });

  it("strips control characters from a path before it reaches the terminal", async () => {
    const result = await run(["classify", "--paths", "docs/a\u001b[31m.md"]);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("\u001b");
  });

  // review/10: the JSON document is read by an agent session, so it carries what the terminal lines carry.
  it("keeps C1, bidi and tag characters out of every JSON string field", async () => {
    const hostile = "docs/a\u009b31m\u202egnp\u{E0041}\u2066.md";
    const result = await run(["classify", "--paths", hostile, "--json"]);

    expect(result.code).toBe(0);
    for (const char of ["\u009b", "\u202e", "\u{E0041}", "\u2066"]) expect(result.stdout).not.toContain(char);
    const doc = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(doc["paths"]).toEqual(["docs/a31mgnp.md"]);
    expect(doc["byPath"]).toEqual([{ path: "docs/a31mgnp.md", class: "docs", rule: DOCS_GLOB }]);
    expect(doc["reason"]).toContain("docs/a31mgnp.md");
  });

  // review/36: a listed name the report has to strip is no longer the file's own name.
  it.each([
    ["a C1", 0x9b],
    ["a bidi", 0x202e],
    ["a tag", 0xe0041],
  ])("says at least product and names a listed path holding %s character the report strips", async (_label, point) => {
    const hostile = `docs/a${String.fromCodePoint(point)}.md`;
    const result = await run(["classify", "--paths", hostile, "docs/x.md", "--json"]);

    expect(result.code).toBe(0);
    const doc = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(doc["class"]).toBe("product");
    expect(doc["checks"]).toEqual(["scan", "gates-all", "review"]);
    expect(doc["reason"]).toContain("names the report cannot show as they are, so the class is at least product: docs/a.md");
    expect(JSON.parse((await run(["classify", "--paths", "docs/x.md", "--json"])).stdout)).toMatchObject({ class: "docs" });
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
    return gateIn(cwd, ["classify", ...argv, "--json"], env);
  }

  /** Runs `gate <argv>` in `cwd` under the same isolation; the document is parsed when stdout holds one. */
  async function gateIn(cwd: string, argv: readonly string[], env: Record<string, string> = {}): Promise<Classified> {
    const home = getRoot().path("home");
    await mkdir(home, { recursive: true });
    const overrides: Record<string, string> = { HOME: home, XDG_CONFIG_HOME: home, ...env };
    const previous = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));
    Object.assign(process.env, overrides);
    try {
      const result = await run(argv, { cwd });
      const doc = argv.includes("--json") && result.stdout !== "" ? (JSON.parse(result.stdout) as Record<string, unknown>) : {};
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

  // review/15: the parser's refusal is the guard, so `rev-parse` runs without
  // `--end-of-options`, which git before 2.43 refuses for every ref.
  it("never hands git a ref that starts with '-', and resolves a base without --end-of-options", async () => {
    const repo = await seedRepo("repo", { "docs/a.md": "base\n" });

    gitSpy.calls.length = 0;
    const refused = await classifyIn(repo, ["--base", "-x"]);
    expect(refused.code).toBe(2);
    expect(gitSpy.calls).toEqual([]);

    const resolved = await classifyIn(repo, ["--base", "HEAD"]);
    const verify = gitSpy.calls.find((argv) => argv.includes("--verify"));
    expect(resolved.code).toBe(0);
    expect(verify).toBeDefined();
    expect(verify).not.toContain("--end-of-options");
    expect(verify?.at(-1)).toBe("HEAD^{commit}");
  });

  // review/17, review/18: a failed read names its cause, never "does not resolve".
  it.each([
    ["a timeout", "--verify", () => realFailure("setTimeout(() => {}, 10000)", { timeout: 200 }), "git rev-parse --verify did not finish within 60 seconds"],
    ["the output bound", "--verify", () => realFailure("process.stdout.write('x'.repeat(4096))", { maxBuffer: 16 }), "git rev-parse --verify printed more than 64 MiB"],
    ["a git failure", "--verify", () => realFailure("process.exit(128)"), "git rev-parse --verify failed, exit 128"],
    ["a timeout on the diff", "diff", () => realFailure("setTimeout(() => {}, 10000)", { timeout: 200 }), "git diff --name-status did not finish within 60 seconds"],
    ["the output bound on the diff", "diff", () => realFailure("process.stdout.write('x'.repeat(4096))", { maxBuffer: 16 }), "git diff --name-status printed more than 64 MiB"],
  ])("says product and names %s as the cause", async (_label, step, failure, cause) => {
    const repo = await seedRepo("repo", { "docs/a.md": "base\n" });
    await getRoot().seedFiles({ "repo/docs/a.md": "changed\n" });

    gitSpy.fault = { step, error: failure() };
    const { code, doc } = await classifyIn(repo, ["--base", "HEAD"]);
    gitSpy.fault = undefined;

    expect(code).toBe(0);
    expect(doc["class"]).toBe("product");
    expect(doc["base"]).toBeNull();
    expect(doc["reason"]).toContain(cause);
    expect(doc["reason"]).not.toContain("does not resolve");
  });

  it("keeps bidi and tag characters of an unresolved base out of the JSON reason", async () => {
    const repo = await seedRepo("repo", { "docs/a.md": "base\n" });

    const { code, stdout, doc } = await classifyIn(repo, ["--base", "no\u202esuch\u{E0041}ref"]);

    expect(code).toBe(0);
    expect(stdout).not.toContain("\u202e");
    expect(stdout).not.toContain("\u{E0041}");
    expect(doc["reason"]).toContain("nosuchref");
  });

  // review/14: a committed `.gitmodules` or a local setting must not hide a submodule bump.
  it("lists a submodule pointer change whatever the submodule ignore settings say", async () => {
    const repo = await seedRepo("repo", { "docs/x.md": "base\n" });
    const before = "1".repeat(40);
    const after = "2".repeat(40);
    await getRoot().seedFiles({
      "repo/.gitmodules": '[submodule "lib"]\n\tpath = vendor/lib\n\turl = ./lib\n\tignore = all\n',
    });
    await mkdir(join(repo, "vendor", "lib"), { recursive: true });
    git(repo, ["update-index", "--add", "--cacheinfo", `160000,${before},vendor/lib`]);
    git(repo, ["add", "--", ".gitmodules"]);
    git(repo, ["commit", "-q", "-m", "a submodule marked ignore = all"]);
    git(repo, ["config", "diff.ignoreSubmodules", "all"]);
    git(repo, ["update-index", "--cacheinfo", `160000,${after},vendor/lib`]);
    await getRoot().seedFiles({ "repo/docs/x.md": "changed\n" });

    const { code, doc } = await classifyIn(repo, ["--base", "HEAD"]);

    expect(code).toBe(0);
    expect((doc["paths"] as string[]).toSorted()).toEqual(["docs/x.md", "vendor/lib"]);
    expect(doc["class"]).not.toBe("docs");
  });

  // review/19: git's -z names are bytes; one that is not UTF-8 cannot be read back by name.
  it("says at least product and names the path when a changed file name is not valid UTF-8", async () => {
    const repo = await seedRepo("repo", { "docs/a.md": "base\n" });
    const blob = git(repo, ["hash-object", "-w", "--", "docs/a.md"]).trim();
    execFileSync("git", ["update-index", "-z", "--index-info"], {
      cwd: repo,
      input: Buffer.concat([Buffer.from(`100644 ${blob}\tdocs/`), Buffer.from([0xff]), Buffer.from(".md\0")]),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...SEED_ENV },
    });
    git(repo, ["commit", "-q", "-m", "a name that is not UTF-8"]);
    // The work tree never held the file, so the diff against HEAD reads it as deleted.

    const { code, doc } = await classifyIn(repo, ["--base", "HEAD"]);

    expect(code).toBe(0);
    expect(doc["paths"]).toEqual(["docs/\uFFFD.md"]);
    expect(doc["class"]).toBe("product");
    expect(doc["reason"]).toContain("not valid UTF-8");
    expect(doc["reason"]).toContain("docs/\uFFFD.md");
  });

  /**
   * Commits `names`, each holding `docs/a.md`'s blob, and leaves them out of the index and the work tree: each
   * reads as deleted. The trees are built with `git mktree` and committed with `commit-tree`, never through the
   * index or the file system: Git for Windows refuses a backslash in an index path, so an index route committed
   * nothing there (prove/1, CI windows-1), and no such name can be a file on Windows.
   */
  function commitNamesOnly(repo: string, names: readonly string[]): void {
    const blob = git(repo, ["rev-parse", "HEAD:docs/a.md"]).trim();
    const mktree = (entries: readonly string[]): string =>
      execFileSync("git", ["mktree", "-z"], {
        cwd: repo,
        input: entries.map((entry) => `${entry}\0`).join(""),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...SEED_ENV },
      }).trim();
    /** `tree` with a blob entry at `segments`, the folders on the way made or rebuilt. */
    const insert = (tree: string | undefined, segments: readonly string[]): string => {
      const [name = "", ...rest] = segments;
      const entries = tree === undefined ? [] : git(repo, ["ls-tree", "-z", tree]).split("\0").filter((entry) => entry !== "");
      const nameOf = (entry: string): string => entry.slice(entry.indexOf("\t") + 1);
      const folder = entries.find((entry) => nameOf(entry) === name && entry.includes(" tree "));
      const added =
        rest.length === 0 ? `100644 blob ${blob}\t${name}` : `040000 tree ${insert(folder?.split(" ")[2]?.split("\t")[0], rest)}\t${name}`;
      return mktree([...entries.filter((entry) => nameOf(entry) !== name), added]);
    };
    let tree = git(repo, ["rev-parse", "HEAD^{tree}"]).trim();
    for (const name of names) tree = insert(tree, name.split("/"));
    git(repo, ["update-ref", "HEAD", git(repo, ["commit-tree", tree, "-p", "HEAD", "-m", "names only"]).trim()]);
  }

  // prove/1: Git for Windows refuses a backslash in an index path, so the names must never pass through the index.
  it("commits backslash git names as tree objects, never through the index", async () => {
    const repo = await seedRepo("repo", { "docs/a.md": "base\n" });
    commitNamesOnly(repo, ["docs/a\\b.md", "x\\y.md"]);

    const tree = git(repo, ["ls-tree", "-r", "-z", "--name-only", "HEAD"]).split("\0");
    const index = git(repo, ["ls-files", "-z"]).split("\0");

    expect(tree).toEqual(expect.arrayContaining(["docs/a\\b.md", "x\\y.md"]));
    expect(index).not.toContain("docs/a\\b.md");
    expect(index).not.toContain("x\\y.md");
  });

  // review/20 (a): git never separates on a backslash, so its name is read and reported as it is.
  it("reports a git name holding a backslash as git names it, read literally", async () => {
    const repo = await seedRepo("repo", { "docs/a.md": "base\n" });
    commitNamesOnly(repo, ["docs/a\\b.md", "docs\\..\\.stamity\\manifest.json"]);

    const { code, doc } = await onPlatform("linux", () => classifyIn(repo, ["--base", "HEAD"]));

    expect(code).toBe(0);
    expect((doc["paths"] as string[]).toSorted()).toEqual(["docs/a\\b.md", "docs\\..\\.stamity\\manifest.json"].toSorted());
    expect(doc["byPath"]).toContainEqual({ path: "docs/a\\b.md", class: "docs", rule: DOCS_GLOB });
    expect(doc["class"]).toBe("product");
  });

  // review/43: on win32 a backslash in a git name is a separator at checkout, so there the name is read both ways.
  it("reads a git name holding a backslash both ways on win32, keeping the stronger class, and literally elsewhere", async () => {
    const repo = await seedRepo("repo", { "docs/a.md": "base\n" });
    commitNamesOnly(repo, [".stamity\\overrides\\x.md"]);

    const windows = await onPlatform("win32", () => classifyIn(repo, ["--base", "HEAD"]));
    const posix = await onPlatform("linux", () => classifyIn(repo, ["--base", "HEAD"]));

    expect(windows.code).toBe(0);
    expect(windows.doc["class"]).toBe("security-sensitive");
    expect(windows.doc["lenses"]).toContain("stamity-security");
    expect(windows.doc["byPath"]).toEqual([
      { path: ".stamity/overrides/x.md", class: "security-sensitive", rule: ".stamity/overrides/**" },
    ]);
    expect(posix.code).toBe(0);
    expect(posix.doc["class"]).toBe("docs");
    expect(posix.doc["byPath"]).toEqual([{ path: ".stamity\\overrides\\x.md", class: "docs", rule: TOP_MD_GLOB }]);
  });

  // review/36: the report strips these code points, so the name it prints is no longer the file's own.
  it("says at least product and names the path when a changed file name holds a bidi or tag character", async () => {
    const repo = await seedRepo("repo", { "docs/a.md": "base\n" });
    const name = `docs/a${String.fromCodePoint(0x202e)}b${String.fromCodePoint(0xe0041)}.md`;
    commitNamesOnly(repo, [name]);

    const { code, doc } = await classifyIn(repo, ["--base", "HEAD"]);

    expect(code).toBe(0);
    expect(doc["paths"]).toEqual(["docs/ab.md"]);
    expect(doc["byPath"]).toEqual([{ path: "docs/ab.md", class: "docs", rule: DOCS_GLOB }]);
    expect(doc["class"]).toBe("product");
    expect(doc["reason"]).toContain("names the report cannot show as they are, so the class is at least product: docs/ab.md");
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

  // review/18, its remaining half: a spawn in a missing directory fails ENOENT too, and is no missing binary.
  it("says product, naming the missing directory, when the directory git runs in does not exist", async () => {
    const missing = getRoot().path("gone");

    const { code, doc } = await classifyIn(missing, []);

    expect(code).toBe(0);
    expect(doc["class"]).toBe("product");
    expect(doc["reason"]).toContain(`the directory git runs in, ${missing}, does not exist`);
    expect(doc["reason"]).not.toContain("no git binary");
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

  // review/13 (a): a `.stamity/` the change itself adds under the working
  // directory is no project root, so it cannot leave the real root's paths out.
  it.each([["untracked"], ["staged"]])(
    "ignores a %s .stamity/ planted under the working directory when choosing the project root",
    async (how) => {
      const repo = await seedRepo("repo", { ".stamity/manifest.json": "{}\n", "work/a.md": "base\n" });
      await getRoot().seedFiles({
        "repo/.stamity/manifest.json": '{"changed":true}\n',
        "repo/work/.stamity/runs/note.md": "planted\n",
      });
      if (how === "staged") git(repo, ["add", "--", "work/.stamity/runs/note.md"]);

      const { code, doc } = await classifyIn(join(repo, "work"), ["--base", "HEAD"]);

      expect(code).toBe(0);
      expect(doc["class"]).toBe("security-sensitive");
      expect((doc["paths"] as string[]).toSorted()).toEqual([".stamity/manifest.json", "work/.stamity/runs/note.md"]);
      expect(doc["reason"]).not.toContain("outside the project");
    },
  );

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

    // review/13 (c): a change spanning projects runs this project's full gates.
    it("says at least product when a path outside the project changed beside a docs edit", async () => {
      const repo = await seedRepo("repo", PROJECT_FILES);
      await getRoot().seedFiles({ "repo/app/docs/x.md": "changed\n", "repo/other/x.ts": "export const x = 1;\n" });

      const { code, doc } = await classifyIn(join(repo, "app"), ["--base", "HEAD"]);

      expect(code).toBe(0);
      expect(doc["paths"]).toEqual(["docs/x.md"]);
      expect(doc["class"]).toBe("product");
      expect(doc["checks"]).toEqual(["scan", "gates-all", "review"]);
      expect(doc["reason"]).toContain("1 changed path outside the project left out, so the class is at least product");
    });

    // review/21: the project's class file never reads an outside path, but the
    // built-in security floor and the trigger roster's security row still do.
    it.each([
      ["a workspace-root lockfile bump", "package-lock.json", "security row package-lock.json"],
      ["a top-level engine state file", ".stamity/manifest.json", "built-in .stamity/manifest.json"],
    ])("says security-sensitive with the lens for %s outside the project", async (_label, outsidePath, rule) => {
      const repo = await seedRepo("repo", {
        "packages/app/.stamity/manifest.json": "{}\n",
        "packages/app/docs/x.md": "base\n",
        [outsidePath]: "{}\n",
      });
      await getRoot().seedFiles({ [`repo/${outsidePath}`]: '{"changed":true}\n' });

      const { code, doc } = await classifyIn(join(repo, "packages", "app"), ["--base", "HEAD"]);

      expect(code).toBe(0);
      expect(doc["paths"]).toEqual([]);
      expect(doc["class"]).toBe("security-sensitive");
      expect(doc["lenses"]).toContain("stamity-security");
      expect(doc["reason"]).toContain(`${outsidePath} outside the project matches ${rule}`);
    });

    // review/34: untracked files are listed from the top-level, so an untracked outside path meets the raise rule.
    it("says security-sensitive with the lens for an untracked lockfile outside the project", async () => {
      const repo = await seedRepo("repo", { "packages/app/.stamity/manifest.json": "{}\n", "packages/app/docs/x.md": "base\n" });
      await getRoot().seedFiles({ "repo/package-lock.json": "{}\n", "repo/packages/app/docs/x.md": "changed\n" });

      const { code, doc } = await classifyIn(join(repo, "packages", "app"), ["--base", "HEAD"]);

      expect(code).toBe(0);
      expect(doc["paths"]).toEqual(["docs/x.md"]);
      expect(doc["class"]).toBe("security-sensitive");
      expect(doc["lenses"]).toContain("stamity-security");
      expect(doc["reason"]).toContain("package-lock.json outside the project matches security row package-lock.json");
    });

    // review/20 (a): an outside name from git is matched as git names it, so a backslash name stays under its folder.
    it("reads an outside git name literally against the built-in security floor", async () => {
      const repo = await seedRepo("repo", { "packages/app/.stamity/manifest.json": "{}\n", "docs/a.md": "base\n" });
      const outside = ".stamity/overrides/a\\..\\..\\..\\docs\\x.md";
      commitNamesOnly(repo, [outside]);

      const { code, doc } = await onPlatform("linux", () => classifyIn(join(repo, "packages", "app"), ["--base", "HEAD"]));

      expect(code).toBe(0);
      expect(doc["paths"]).toEqual([]);
      expect(doc["class"]).toBe("security-sensitive");
      expect(doc["reason"]).toContain(`${outside} outside the project matches built-in .stamity/overrides/**`);
    });

    // review/43: on win32 a name outside the project by its literal reading may check out inside it, or as a state file.
    it("on win32 reads an outside git name both ways: under the project's prefix and against the built-in floor", async () => {
      const repo = await seedRepo("repo", { "packages/app/.stamity/manifest.json": "{}\n", "docs/a.md": "base\n" });
      commitNamesOnly(repo, ["packages\\app\\.stamity\\overrides\\x.md", ".stamity\\manifest.json"]);
      const cwd = join(repo, "packages", "app");

      const windows = await onPlatform("win32", () => classifyIn(cwd, ["--base", "HEAD"]));
      const posix = await onPlatform("linux", () => classifyIn(cwd, ["--base", "HEAD"]));

      expect(windows.code).toBe(0);
      expect(windows.doc["class"]).toBe("security-sensitive");
      expect(windows.doc["paths"]).toEqual([".stamity/overrides/x.md"]);
      expect(windows.doc["reason"]).toContain("2 changed paths outside the project left out");
      expect(windows.doc["reason"]).toContain(
        ".stamity\\manifest.json outside the project matches built-in .stamity/manifest.json",
      );
      expect(posix.code).toBe(0);
      expect(posix.doc["class"]).toBe("product");
      expect(posix.doc["paths"]).toEqual([]);
      expect(posix.doc["reason"]).not.toContain("matches built-in");
    });

    // review/42: outside matches are grouped by rule, each group naming at most five paths and counting the rest.
    it("names at most five outside paths per security rule and counts the rest", async () => {
      const repo = await seedRepo("repo", { "packages/app/.stamity/manifest.json": "{}\n", "packages/app/docs/x.md": "base\n" });
      const scaffold = Object.fromEntries(
        Array.from({ length: 7 }, (_, at) => [`repo/packages/api/a${at + 1}.ts`, "export {};\n"]),
      );
      await getRoot().seedFiles({ ...scaffold, "repo/package-lock.json": "{}\n", "repo/packages/app/docs/x.md": "changed\n" });

      const { code, doc } = await classifyIn(join(repo, "packages", "app"), ["--base", "HEAD"]);
      const reason = doc["reason"] as string;

      expect(code).toBe(0);
      expect(doc["class"]).toBe("security-sensitive");
      expect(reason).toContain("8 changed paths outside the project left out");
      expect(reason).toContain(
        "packages/api/a1.ts, packages/api/a2.ts, packages/api/a3.ts, packages/api/a4.ts, packages/api/a5.ts and 2 more " +
          "outside the project match security row api/, so the class is security-sensitive",
      );
      expect(reason).toContain("package-lock.json outside the project matches security row package-lock.json");
      expect(reason.split("outside the project match").length - 1).toBe(2);
      expect(reason).not.toContain("a6.ts");
    });

    it("says at least product for an untracked file outside the project beside a docs edit", async () => {
      const repo = await seedRepo("repo", PROJECT_FILES);
      await getRoot().seedFiles({ "repo/app/docs/x.md": "changed\n", "repo/other/new.ts": "export {};\n" });

      const { code, doc } = await classifyIn(join(repo, "app", "docs"), ["--base", "HEAD"]);

      expect(code).toBe(0);
      expect(doc["paths"]).toEqual(["docs/x.md"]);
      expect(doc["class"]).toBe("product");
      expect(doc["reason"]).toContain("1 changed path outside the project left out, so the class is at least product");
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

  // ── The base's class file (p2a-class-file) ────────────────────────────────

  describe("the class file, read from the base", () => {
    const CLASS_FILE = ".stamity/change-classes.json";
    const fileOf = (classes: Record<string, string[]>): string => `${JSON.stringify({ classes })}\n`;
    const classOfPath = (doc: Record<string, unknown>, path: string): unknown =>
      (doc["byPath"] as { path: string; class: string }[]).find((entry) => entry.path === path)?.class;

    it("places a path by the base's class file, and keeps the floor for code under its glob", async () => {
      // TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, review/70 — a docs folder glob is now refused,
      // so the base copy names the .md and .tsx extensions; the floor still holds website/src/x.tsx at product.
      const repo = await seedRepo("repo", { [CLASS_FILE]: fileOf({ docs: ["website/**/*.md", "website/**/*.tsx"] }), "website/x.md": "base\n" });
      await getRoot().seedFiles({ "repo/website/x.md": "changed\n", "repo/website/src/x.tsx": "export {};\n" });

      const { code, doc } = await classifyIn(repo, ["--base", "HEAD"]);

      expect(code).toBe(0);
      expect(classOfPath(doc, "website/x.md")).toBe("docs");
      expect(classOfPath(doc, "website/src/x.tsx")).toBe("product");
    });

    it("reads no map from a base copy that matches every path below product, and says at least product", async () => {
      const repo = await seedRepo("repo", { [CLASS_FILE]: fileOf({ records: ["**"] }), "docs/x.md": "base\n" });
      await getRoot().seedFiles({ "repo/docs/x.md": "changed\n" });

      const { code, doc } = await classifyIn(repo, ["--base", "HEAD"]);

      expect(code).toBe(0);
      expect(doc["class"]).toBe("product");
      expect(classOfPath(doc, "docs/x.md")).toBe("docs");
      expect(doc["reason"]).toContain(`the base copy of ${CLASS_FILE} is invalid`);
      expect(doc["reason"]).toContain('"**"');
      expect(doc["reason"]).toContain("no map was read from it, so the class is at least product");
    });

    // TEST CHANGE, justified: 2026-10-09, review/49 — the built-in rule now places the class file security-sensitive
    // (it decides every later change's checks), so a change editing it is security-sensitive, not config.
    it("applies the base copy's rules when the change edits the file, and the change is security-sensitive", async () => {
      // TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, review/70 — a docs folder glob is now refused,
      // so the base copy names the .md extension; the paths and classes asserted are unchanged.
      const repo = await seedRepo("repo", { [CLASS_FILE]: fileOf({ docs: ["notes/*.md"] }), "notes/x.md": "base\n" });
      // The head copy drops the docs glob: read, it would leave notes/x.md unplaced (product).
      await getRoot().seedFiles({ [`repo/${CLASS_FILE}`]: fileOf({ records: ["notes/**"] }), "repo/notes/x.md": "changed\n" });

      const { doc } = await classifyIn(repo, ["--base", "HEAD"]);

      expect(classOfPath(doc, "notes/x.md")).toBe("docs");
      expect(classOfPath(doc, CLASS_FILE)).toBe("security-sensitive");
      expect(doc["class"]).toBe("security-sensitive");
      expect(doc["lenses"]).toContain("stamity-security");
    });

    it("reads built-ins only when the base holds no class file, whatever the head copy says", async () => {
      const repo = await seedRepo("repo", { "notes/x.md": "base\n" });
      await getRoot().seedFiles({ [`repo/${CLASS_FILE}`]: fileOf({ docs: ["notes/**"] }), "repo/notes/x.md": "changed\n" });

      const { doc } = await classifyIn(repo, ["--base", "HEAD"]);

      expect(classOfPath(doc, "notes/x.md")).toBe("product");
      // TEST CHANGE, justified: 2026-10-09, review/49 — the change adds the class file, which the built-in rule now
      // places security-sensitive (was config, so the change read product).
      expect(doc["class"]).toBe("security-sensitive");
      expect(doc["reason"]).toContain(`the base holds no ${CLASS_FILE}, so only the built-in rules apply`);
    });

    it("reads no class file with no base, as D5 says", async () => {
      const repo = await seedRepo("repo", { [CLASS_FILE]: fileOf({ docs: [SITE_GLOB] }), "website/x.md": "base\n" });
      await getRoot().seedFiles({ "repo/website/x.md": "changed\n" });

      const { doc } = await classifyIn(repo, []);

      expect(classOfPath(doc, "website/x.md")).toBe("product");
      expect(doc["reason"]).toContain("no base was given");
    });

    it("never reads the class file from the head or the work tree: only the base commit's blob", async () => {
      const repo = await seedRepo("repo", { [CLASS_FILE]: fileOf({ docs: [SITE_GLOB] }), "website/x.md": "base\n" });
      const head = git(repo, ["rev-parse", "HEAD"]).trim();
      await getRoot().seedFiles({ "repo/website/x.md": "changed\n" });
      gitSpy.calls.length = 0;

      await classifyIn(repo, ["--base", "HEAD"]);

      const reads = gitSpy.calls.filter((argv) => argv.some((arg) => arg.endsWith(CLASS_FILE)));
      expect(reads.some((argv) => argv.includes("blob"))).toBe(true);
      for (const argv of reads) {
        // The entry is looked up in the base commit's tree, then its blob is read from the same commit.
        if (argv.includes("ls-tree")) expect(argv.slice(argv.indexOf("ls-tree"))).toEqual(["ls-tree", "-z", "--full-tree", head, "--", CLASS_FILE]);
        else expect(argv).toContain(`${head}:${CLASS_FILE}`);
      }
    });

    it("says product, naming the failure, when the class file read fails", async () => {
      const repo = await seedRepo("repo", { [CLASS_FILE]: fileOf({ docs: [SITE_GLOB] }), "website/x.md": "base\n" });
      await getRoot().seedFiles({ "repo/website/x.md": "changed\n" });

      gitSpy.fault = { step: "blob", error: realFailure("process.exit(3)") };
      const { code, doc } = await classifyIn(repo, ["--base", "HEAD"]);
      gitSpy.fault = undefined;

      expect(code).toBe(0);
      expect(doc["class"]).toBe("product");
      expect(doc["reason"]).toContain("git cat-file blob failed, exit 3");
    });

    /** Overwrites the loose object `oid` of `repo` with bytes that do not inflate: a corrupt object store. */
    async function corruptObject(repo: string, oid: string): Promise<void> {
      const file = join(repo, ".git", "objects", oid.slice(0, 2), oid.slice(2));
      await chmod(file, 0o644);
      await writeFile(file, "not a zlib stream");
    }

    // p2a M-2 (reviewer W-1): only git's clean "nothing there" answer is an absent file; any other failure fails closed.
    it("says product, naming the failed read, when the base tree holding the class file is corrupt", async () => {
      const repo = await seedRepo("repo", { [CLASS_FILE]: fileOf({ docs: [SITE_GLOB] }), "docs/x.md": "base\n" });
      await corruptObject(repo, git(repo, ["rev-parse", "HEAD:.stamity"]).trim());

      const { code, doc } = await classifyIn(repo, ["--base", "HEAD", "--paths", "docs/x.md"]);

      expect(code).toBe(0);
      expect(doc["class"]).toBe("product");
      expect(doc["reason"]).toContain("git ls-tree failed");
      expect(doc["reason"]).not.toContain("the base holds no");
    });

    it("says product, naming the failed read, when the base tree the project root is looked up in is corrupt", async () => {
      const repo = await seedRepo("repo", { "app/.stamity/manifest.json": "{}\n", "app/docs/x.md": "base\n" });
      await corruptObject(repo, git(repo, ["rev-parse", "HEAD:app"]).trim());

      const { code, doc } = await classifyIn(join(repo, "app"), ["--base", "HEAD", "--paths", "docs/x.md"]);

      expect(code).toBe(0);
      expect(doc["class"]).toBe("product");
      expect(doc["reason"]).toContain("git ls-tree failed");
    });

    // review/48: a refused base copy still raises by its raising entries, and the class is at least product.
    it("keeps a refused base copy's security entry beside a bad lowering entry, naming the invalid file", async () => {
      const repo = await seedRepo("repo", {
        [CLASS_FILE]: fileOf({ "security-sensitive": ["lib/**"], records: ["**"] }),
        "lib/x.ts": "export {};\n",
      });
      await getRoot().seedFiles({ "repo/lib/x.ts": "export const x = 1;\n" });

      const { code, doc } = await classifyIn(repo, ["--base", "HEAD"]);

      expect(code).toBe(0);
      expect(doc["class"]).toBe("security-sensitive");
      expect(doc["lenses"]).toContain("stamity-security");
      expect(classOfPath(doc, "lib/x.ts")).toBe("security-sensitive");
      expect(doc["reason"]).toContain(`the base copy of ${CLASS_FILE} is invalid`);
      expect(doc["reason"]).toContain("only its product, public-contract and security-sensitive entries were read");
    });

    // p2a reviewer M-1: a folder or a submodule at the class file's path is refused, never read as absent.
    it.each([
      ["a folder", "tree"],
      ["a submodule", "commit"],
    ])("reads no map and says at least product when the base holds %s at the class file's path", async (_label, type) => {
      const repo = await seedRepo("repo", { "docs/x.md": "base\n" });
      if (type === "tree") {
        await getRoot().seedFiles({ [`repo/${CLASS_FILE}/inner.json`]: "{}\n" });
        git(repo, ["add", "--", `${CLASS_FILE}/inner.json`]);
      } else {
        // A gitlink whose commit is not in this object store: ls-tree names it without reading it.
        const missing = git(repo, ["rev-parse", "HEAD"]).trim().replace(/^./, (first) => (first === "0" ? "1" : "0"));
        git(repo, ["update-index", "--add", "--cacheinfo", `160000,${missing},${CLASS_FILE}`]);
      }
      git(repo, ["commit", "-q", "-m", `a ${type} at the class file's path`]);

      const { code, doc } = await classifyIn(repo, ["--base", "HEAD", "--paths", "docs/x.md"]);

      expect(code).toBe(0);
      expect(doc["class"]).toBe("product");
      expect(doc["reason"]).toContain(`the base copy of ${CLASS_FILE} is invalid (the base holds a ${type} there, not a file)`);
    });

    it("reads the base copy for --paths with --base too", async () => {
      // TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, review/70 — a docs folder glob is now refused,
      // so the base copy names the .md extension; the paths and classes asserted are unchanged.
      const repo = await seedRepo("repo", { [CLASS_FILE]: fileOf({ docs: ["website/**/*.md"] }) });

      const given = await classifyIn(repo, ["--base", "HEAD", "--paths", "website/x.md"]);
      const bare = await classifyIn(repo, ["--paths", "website/x.md"]);

      expect(given.doc["class"]).toBe("docs");
      expect(given.doc["checks"]).toEqual(["scan", "tests-selected", "review-once"]);
      expect(bare.doc["class"]).toBe("product");
    });

    // p2b-test-inputs (REQ-FLOW-062): the base copy's test-input map and the work tree's test sources.
    describe("the test selection", () => {
      const mapOf = (testInputs: unknown[]): string => `${JSON.stringify({ testInputs })}\n`;
      const MAP = mapOf([{ glob: "docs/guide.md", tests: ["test/guide.test.ts"] }]);
      const SOURCES = {
        "test/guide.test.ts": 'it("reads", () => read("docs/guide.md"));\n',
        "test/other.test.ts": 'it("reads", () => read("docs/other.md"));\n',
        "test/unrelated.test.ts": 'it("reads", () => read("docs/third.md"));\n',
      };
      const PAGES = { "docs/guide.md": "base\n", "docs/other.md": "base\n", "docs/third.md": "base\n" };

      it("selects the map's tests and the tests whose source names a changed page", async () => {
        const repo = await seedRepo("repo", { [CLASS_FILE]: MAP, ...SOURCES, ...PAGES });
        await getRoot().seedFiles({ "repo/docs/guide.md": "changed\n", "repo/docs/other.md": "changed\n" });

        const { code, doc, stdout } = await classifyIn(repo, ["--base", "HEAD"]);

        expect(code).toBe(0);
        expect(doc["class"]).toBe("docs");
        expect(doc["tests"]).toMatchObject({ full: false, files: ["test/guide.test.ts", "test/other.test.ts"] });
        expect(stdout).not.toContain("test/unrelated.test.ts");
      });

      it("runs every test when the base holds no map, whatever the head copy says", async () => {
        const repo = await seedRepo("repo", { ...SOURCES, ...PAGES });
        await getRoot().seedFiles({ [`repo/${CLASS_FILE}`]: MAP, "repo/docs/guide.md": "changed\n" });

        const { doc } = await classifyIn(repo, ["--base", "HEAD"]);

        expect(doc["tests"]).toMatchObject({ full: true, files: [] });
        // TEST CHANGE, justified: 2026-10-09, review/60 (signed off) — the change adds the class file, so it is
        // security-sensitive and runs every test by its class before any map is looked for; the reason names the class.
        expect(doc["class"]).toBe("security-sensitive");
        expect((doc["tests"] as { reason: string }).reason).toContain("a security-sensitive change runs the full gates");
      });

      it("runs every test when a selected test is not in the work tree, naming it", async () => {
        const repo = await seedRepo("repo", { [CLASS_FILE]: mapOf([{ glob: DOCS_GLOB, tests: ["test/gone.test.ts"] }]), ...PAGES });
        await getRoot().seedFiles({ "repo/docs/guide.md": "changed\n" });

        const { doc } = await classifyIn(repo, ["--base", "HEAD"]);

        expect(doc["tests"]).toMatchObject({ full: true, files: [] });
        expect((doc["tests"] as { reason: string }).reason).toContain("test/gone.test.ts");
      });

      it("runs every test when a test source is no regular file, naming it", async () => {
        const repo = await seedRepo("repo", { [CLASS_FILE]: MAP, ...SOURCES, ...PAGES });
        // Tracked as a file, a folder in the work tree: the read refuses what it cannot read as one file.
        const blob = git(repo, ["hash-object", "-w", "--", "docs/guide.md"]).trim();
        git(repo, ["update-index", "--add", "--cacheinfo", `100644,${blob},test/dir.test.ts`]);
        await mkdir(join(repo, "test", "dir.test.ts"));
        await getRoot().seedFiles({ "repo/docs/guide.md": "changed\n" });

        const { doc } = await classifyIn(repo, ["--base", "HEAD"]);

        expect(doc["tests"]).toMatchObject({ full: true, files: [] });
        expect((doc["tests"] as { reason: string }).reason).toContain("test/dir.test.ts");
      });

      /*
       * TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, review/63 (signed off). This pinned
       * `product` for a failed tracked-file read. That read serves the selection only, so its failure now runs
       * every test and keeps the class the change was given (here docs), with the failure named in the tests reason.
       */
      it("keeps the class and runs every test when the tracked-file read fails", async () => {
        const repo = await seedRepo("repo", { [CLASS_FILE]: MAP, ...SOURCES, ...PAGES });
        await getRoot().seedFiles({ "repo/docs/guide.md": "changed\n" });

        gitSpy.fault = { step: "--cached", error: realFailure("process.exit(3)") };
        const { doc } = await classifyIn(repo, ["--base", "HEAD"]);
        gitSpy.fault = undefined;

        expect(doc["class"]).toBe("docs");
        expect(doc["tests"]).toMatchObject({ full: true, files: [] });
        expect((doc["tests"] as { reason: string }).reason).toContain("git ls-files --cached failed, exit 3");
      });

      it("keeps a security-sensitive class and its lens when the tracked-file read fails (review/63)", async () => {
        const repo = await seedRepo("repo", { [CLASS_FILE]: MAP, ...SOURCES, ...PAGES, ".stamity/manifest.json": "{}\n" });
        await getRoot().seedFiles({ "repo/.stamity/manifest.json": "{ }\n" });

        gitSpy.fault = { step: "--cached", error: realFailure("process.exit(3)") };
        const { doc } = await classifyIn(repo, ["--base", "HEAD"]);
        gitSpy.fault = undefined;

        expect(doc["class"]).toBe("security-sensitive");
        expect(doc["lenses"]).toEqual(["stamity-security"]);
        expect(doc["checks"]).toEqual(["scan", "gates-all", "review"]);
        expect(doc["tests"]).toMatchObject({ full: true, files: [] });
      });

      it("runs every test when a test source holds a glob literal over the cost bound, naming it (review/62)", async () => {
        // Built at run time, so this file's own text holds no literal over the bound, which would widen every selection.
        const hostile = `it("reads", () => glob("${["docs", "a", "b", "c", "d"].join("/**/")}/**/*.md"));\n`;
        const repo = await seedRepo("repo", { [CLASS_FILE]: MAP, ...SOURCES, ...PAGES, "test/glob.test.ts": hostile });
        await getRoot().seedFiles({ "repo/docs/guide.md": "changed\n" });

        const { doc } = await classifyIn(repo, ["--base", "HEAD"]);

        expect(doc["class"]).toBe("docs");
        expect(doc["tests"]).toMatchObject({ full: true, files: [] });
        expect((doc["tests"] as { reason: string }).reason).toContain("test/glob.test.ts");
      });
    });

    // plan/61, plan/63: the file is read under the project's prefix, from the project root found by `.stamity/`.
    it.each([["app"], ["app/lib"]])("reads a subfolder project's class file under its prefix, run from %s", async (from) => {
      const repo = await seedRepo("repo", {
        "app/.stamity/change-classes.json": fileOf({ "security-sensitive": ["lib/**"] }),
        "app/lib/x.ts": "export {};\n",
      });
      await getRoot().seedFiles({ "repo/app/lib/x.ts": "export const x = 1;\n" });

      const read = await classifyIn(join(repo, ...from.split("/")), ["--base", "HEAD"]);
      const listed = await classifyIn(join(repo, ...from.split("/")), ["--base", "HEAD", "--paths", "lib/x.ts"]);

      expect(read.doc["class"]).toBe("security-sensitive");
      expect(read.doc["paths"]).toEqual(["lib/x.ts"]);
      expect(read.doc["lenses"]).toContain("stamity-security");
      expect(listed.doc["class"]).toBe("security-sensitive");
    });
  });

  /**
   * p5a-security-classifier (REQ-FLOW-065, plan/59, plan/62, plan/63): the
   * changed lines come from one hardened read, and the line rules run over them.
   * Every dangerous-call line is built at run time with `~` cut out of it (the
   * run's fixture rule), so no line of this file is itself a call shape.
   */
  describe("the changed lines and the security line rules (p5a)", () => {
    const built = (text: string): string => text.replaceAll("~", "");
    const RM = built('rm~Sync("build", { recursive: true });\n');
    const GUARDED = built('export function clean(safe: boolean): void {\n\n  if (safe) {\n    rm~Sync("build");\n  }\n}\n');
    const UNGUARDED = built('export function clean(safe: boolean): void {\n\n    rm~Sync("build");\n}\n');
    const ruleOf = (doc: Record<string, unknown>, path: string): string | undefined =>
      (doc["byPath"] as { path: string; rule: string }[]).find((entry) => entry.path === path)?.rule;

    it("reads a new, unstaged, untracked src/cleanup.ts whole", async () => {
      const repo = await seedRepo("repo", { "docs/a.md": "base\n" });
      await getRoot().seedFiles({ "repo/src/cleanup.ts": `export {};\n${RM}` });

      const { code, doc, stdout } = await classifyIn(repo, ["--base", "HEAD"]);

      expect(code).toBe(0);
      expect(doc["class"]).toBe("security-sensitive");
      expect(doc["lenses"]).toEqual(["stamity-security"]);
      expect(ruleOf(doc, "src/cleanup.ts")).toBe("line rule delete-or-overwrite at src/cleanup.ts:2");
      expect(stdout).not.toContain("build");
    });

    it("hits a staged and an unstaged line in two tracked files, whatever diff.external says", async () => {
      const repo = await seedRepo("repo", { "src/a.ts": "export {};\n", "src/b.ts": "export {};\n" });
      await getRoot().seedFiles({ "repo/src/a.ts": `export {};\n${RM}`, "repo/src/b.ts": `export {};\n\n${RM}` });
      git(repo, ["add", "--", "src/a.ts"]);
      const script = getRoot().path("external-diff.sh");
      await getRoot().seedFiles({ "external-diff.sh": "#!/bin/sh\nexit 0\n" });
      await chmod(script, 0o755);
      git(repo, ["config", "diff.external", script.replaceAll("\\", "/")]);

      const { doc } = await classifyIn(repo, ["--base", "HEAD"]);

      expect(doc["class"]).toBe("security-sensitive");
      expect(ruleOf(doc, "src/a.ts")).toBe("line rule delete-or-overwrite at src/a.ts:2");
      expect(ruleOf(doc, "src/b.ts")).toBe("line rule delete-or-overwrite at src/b.ts:3");
    });

    it("reads the context of a hunk that only removes a guard, whatever diff.context and blank-line settings say", async () => {
      const repo = await seedRepo("repo", { "src/x.ts": GUARDED });
      await getRoot().seedFiles({ "repo/src/x.ts": UNGUARDED });
      git(repo, ["config", "diff.context", "0"]);
      git(repo, ["config", "diff.interHunkContext", "0"]);
      git(repo, ["config", "diff.suppressBlankEmpty", "true"]);

      const { doc } = await classifyIn(repo, ["--base", "HEAD"]);

      expect(doc["class"]).toBe("security-sensitive");
      expect(ruleOf(doc, "src/x.ts")).toBe("line rule delete-or-overwrite at src/x.ts, a context line of a hunk that removes one");
    });

    it.each([
      ["a committed -diff attribute", { ".gitattributes": "*.ts -diff\n" }, {}, []],
      ["a -diff attribute the change adds", {}, { ".gitattributes": "*.ts -diff\n" }, []],
      ["a diff driver marked binary", { ".gitattributes": "*.ts diff=x\n" }, {}, ["diff.x.binary", "true"]],
    ] as const)("reads a tracked code file's lines through %s", async (_label, committed, added, config) => {
      const repo = await seedRepo("repo", { "src/x.ts": "export {};\n", ...committed });
      await getRoot().seedFiles(Object.fromEntries(Object.entries({ "src/x.ts": `export {};\n${RM}`, ...added }).map(([k, v]) => [`repo/${k}`, v])));
      if (config.length === 2) git(repo, ["config", config[0], config[1]]);

      const { doc } = await classifyIn(repo, ["--base", "HEAD"]);

      expect(doc["class"]).toBe("security-sensitive");
      expect(ruleOf(doc, "src/x.ts")).toBe("line rule delete-or-overwrite at src/x.ts:2");
    });

    it("lists a tracked code file whose head side holds a NUL as unscanned, and skips a binary image", async () => {
      const repo = await seedRepo("repo", { "src/x.ts": "export {};\n", "assets/x.png": "png\n" });
      await getRoot().seedFiles({ "repo/src/x.ts": `export {};\0\n${RM}`, "repo/assets/x.png": "png\0\n" });

      const { doc } = await classifyIn(repo, ["--base", "HEAD"]);

      expect(doc["class"]).toBe("product");
      expect(ruleOf(doc, "src/x.ts")).toBe("unplaced");
      expect(doc["reason"]).toContain("1 tracked code file the read could not show is unscanned, so the class is at least product: src/x.ts");
      expect(doc["reason"]).toContain("1 changed file not read line by line (binary, over 1 MiB, or not a regular file)");
    });

    it.skipIf(process.platform === "win32")("skips an oversized file and a symlink, counted, and never opens a FIFO", async () => {
      const repo = await seedRepo("repo", { "docs/a.md": "base\n" });
      await getRoot().seedFiles({ "repo/src/big.ts": `${"// pad\n".repeat(300_000)}${RM}` });
      await symlink("big.ts", join(repo, "src", "link.ts"));
      execFileSync("mkfifo", [join(repo, "src", "pipe.ts")]);

      const { code, doc } = await classifyIn(repo, ["--base", "HEAD"]);

      expect(code).toBe(0);
      expect(doc["class"]).toBe("product");
      expect(doc["reason"]).toContain("2 changed files not read line by line");
    });

    it.skipIf(process.platform === "win32")("reads past a type change: the walk keeps its names in order", async () => {
      const repo = await seedRepo("repo", { "src/x.ts": "export {};\n", "src/y.ts": "export {};\n", "src/z.ts": "export {};\n" });
      await rm(join(repo, "src", "y.ts"));
      await symlink("x.ts", join(repo, "src", "y.ts"));
      await getRoot().seedFiles({ "repo/src/z.ts": `export {};\n${RM}` });

      const { doc } = await classifyIn(repo, ["--base", "HEAD"]);

      expect(doc["class"]).toBe("security-sensitive");
      expect(ruleOf(doc, "src/z.ts")).toBe("line rule delete-or-overwrite at src/z.ts:2");
      expect(doc["reason"]).not.toContain("could not be read");
    });

    it.each([
      ["docs/a.md", "product"],
      [".stamity/manifest.json", "security-sensitive"],
    ])("keeps the path class of %s and says at least product when the line read fails", async (path, cls) => {
      const repo = await seedRepo("repo", { [path]: "{}\n" });
      await getRoot().seedFiles({ [`repo/${path}`]: '{"changed":true}\n' });

      gitSpy.fault = { step: "--text", error: realFailure("process.exit(3)") };
      const { doc } = await classifyIn(repo, ["--base", "HEAD"]);
      gitSpy.fault = undefined;

      expect(doc["class"]).toBe(cls);
      expect(doc["paths"]).toEqual([path]);
      expect(doc["reason"]).toContain("the changed lines could not be read (git diff --text failed, exit 3), so the class is at least product");
    });

    it.skipIf(process.platform === "win32")("reads a quoted name by its real name, from the project in app/", async () => {
      const repo = await seedRepo("repo", { "app/.stamity/manifest.json": "{}\n", 'app/a"b.ts': "export {};\n" });
      await getRoot().seedFiles({ 'repo/app/a"b.ts': `export {};\n${RM}` });

      const { doc } = await classifyIn(join(repo, "app"), ["--base", "HEAD"]);

      expect(doc["class"]).toBe("security-sensitive");
      expect(ruleOf(doc, 'a"b.ts')).toBe('line rule delete-or-overwrite at a"b.ts:2');
    });

    it("reads the project's lines from app/docs/, as from its root", async () => {
      const repo = await seedRepo("repo", { "app/.stamity/manifest.json": "{}\n", "app/docs/x.md": "base\n", "app/src/x.ts": "export {};\n" });
      await getRoot().seedFiles({ "repo/app/src/x.ts": `export {};\n${RM}` });

      const { doc } = await classifyIn(join(repo, "app", "docs"), ["--base", "HEAD"]);

      expect(doc["class"]).toBe("security-sensitive");
      expect(ruleOf(doc, "src/x.ts")).toBe("line rule delete-or-overwrite at src/x.ts:2");
    });

    it("pins every flag of the line read", async () => {
      const repo = await seedRepo("repo", { "docs/a.md": "base\n" });
      await getRoot().seedFiles({ "repo/docs/a.md": "changed\n" });

      gitSpy.calls.length = 0;
      await classifyIn(repo, ["--base", "HEAD"]);
      const read = gitSpy.calls.find((argv) => argv.includes("--text"));

      expect(read).toEqual(
        expect.arrayContaining(["core.quotePath=false", "-U3", "-M", "--no-relative", "--no-ext-diff", "--no-color", "--no-textconv", "--src-prefix=a/", "--dst-prefix=b/", "--inter-hunk-context=0", "--submodule=short", "--ignore-submodules=none"]),
      );
    });
  });

  /**
   * p5e-secret-scan (REQ-FLOW-066; plan/56, plan/57, plan/62, plan/63): `gate
   * scan` over p5a's one hardened read. The token is built at run time from
   * fragments (the sign-off on plan/57), so no line of this file carries one.
   */
  describe("gate scan (p5e)", () => {
    const PARTS = ["Q7ZK4M2T", "W9XRB3NH", "C6VJ8PDL", "F5YG2S7A", "KE4U"];
    const TOKEN = ["gh", "p", "_", ...PARTS].join("");
    const LINE = `export const t = "${TOKEN}";\n`;
    /** Every six-character run of the token's body: none may reach any output. */
    const FRAGMENTS = Array.from({ length: PARTS.join("").length - 5 }, (_, at) => PARTS.join("").slice(at, at + 6));
    const expectNoFragment = (...outputs: string[]): void => {
      for (const output of outputs) for (const fragment of FRAGMENTS) expect(output).not.toContain(fragment);
    };

    it("stops on a staged token and its twin in a new untracked file, naming rule, path and line, and no fragment of it", async () => {
      const repo = await seedRepo("repo", { "src/a.ts": "export {};\n" });
      await getRoot().seedFiles({ "repo/src/a.ts": `export {};\n${LINE}`, "repo/src/new.ts": LINE });
      git(repo, ["add", "--", "src/a.ts"]);

      const json = await gateIn(repo, ["scan", "--json"]);
      const human = await gateIn(repo, ["scan"]);

      expect(json.code).toBe(1);
      expect(json.doc).toEqual({
        ok: false,
        command: "gate",
        version: expect.any(String) as string,
        subcommand: "scan",
        base: null,
        scope: "uncommitted",
        hits: [
          { path: "src/a.ts", line: 2, rule: "github-token" },
          { path: "src/new.ts", line: 1, rule: "github-token" },
        ],
        scanned: 2,
        skipped: 0,
        outside: 0,
        unscanned: [],
      });
      expect(human.code).toBe(1);
      expect(human.stdout).toContain("src/a.ts:2  github-token");
      expect(human.stdout).toContain("src/new.ts:1  github-token");
      expectNoFragment(json.stdout, json.stderr, human.stdout, human.stderr);
    });

    it("exits 0 with the whole document for a change with no hit", async () => {
      const repo = await seedRepo("repo", { "docs/a.md": "base\n" });
      await getRoot().seedFiles({ "repo/docs/a.md": "changed\n" });

      const { code, doc } = await gateIn(repo, ["scan", "--json"]);

      expect(code).toBe(0);
      expect(doc).toEqual({
        ok: true,
        command: "gate",
        version: expect.any(String) as string,
        subcommand: "scan",
        base: null,
        scope: "uncommitted",
        hits: [],
        scanned: 1,
        skipped: 0,
        outside: 0,
        unscanned: [],
      });
    });

    it("finds a staged token whatever diff.external says", async () => {
      const repo = await seedRepo("repo", { "src/a.ts": "export {};\n" });
      await getRoot().seedFiles({ "repo/src/a.ts": `export {};\n${LINE}`, "external-diff.sh": "#!/bin/sh\nexit 0\n" });
      git(repo, ["add", "--", "src/a.ts"]);
      const script = getRoot().path("external-diff.sh");
      await chmod(script, 0o755);
      git(repo, ["config", "diff.external", script.replaceAll("\\", "/")]);

      const { code, doc } = await gateIn(repo, ["scan", "--json"]);

      expect(code).toBe(1);
      expect(doc["hits"]).toEqual([{ path: "src/a.ts", line: 2, rule: "github-token" }]);
    });

    it.skipIf(process.platform === "win32")("skips and counts an untracked binary, a file over 1 MiB and a FIFO, without a hang", async () => {
      const repo = await seedRepo("repo", { "docs/a.md": "base\n" });
      await getRoot().seedFiles({
        "repo/src/bin.ts": `\0${LINE}`,
        "repo/src/big.ts": `${"// pad\n".repeat(160_000)}${LINE}`,
      });
      execFileSync("mkfifo", [join(repo, "src", "pipe.ts")]);

      const { code, doc } = await gateIn(repo, ["scan", "--json"]);

      expect(code).toBe(0);
      expect(doc["hits"]).toEqual([]);
      // git lists no FIFO as untracked, so the binary and the oversized file are the two counted; the FIFO is never opened.
      expect(doc["skipped"]).toBe(2);
      expect(doc["scanned"]).toBe(0);
    });

    it("exits 1 with ok false and the reason when the line read fails, never 0", async () => {
      const repo = await seedRepo("repo", { "src/a.ts": "export {};\n" });
      await getRoot().seedFiles({ "repo/src/a.ts": `export {};\n${LINE}` });

      gitSpy.fault = { step: "--text", error: realFailure("process.exit(3)") };
      const { code, doc } = await gateIn(repo, ["scan", "--json"]);
      gitSpy.fault = undefined;

      expect(code).toBe(1);
      expect(doc["ok"]).toBe(false);
      expect(doc["reason"]).toContain("git diff --text failed, exit 3");
      expect(doc).not.toHaveProperty("hits");
    });

    it("exits 1 with the reason in a directory that is no git work tree, and for a base that does not resolve", async () => {
      const plain = getRoot().path("plain");
      await mkdir(plain, { recursive: true });
      const repo = await seedRepo("repo", { "docs/a.md": "base\n" });

      const outside = await gateIn(plain, ["scan", "--json"]);
      const unresolved = await gateIn(repo, ["scan", "--base", "no-such-ref", "--json"]);

      expect(outside.code).toBe(1);
      expect(outside.doc["reason"]).toContain("no git work tree was found here");
      expect(unresolved.code).toBe(1);
      expect(unresolved.doc).toMatchObject({ ok: false, base: null, scope: "since-base" });
      expect(unresolved.doc["reason"]).toContain("the base no-such-ref does not resolve to a commit here");
    });

    it("reads only the uncommitted change with no --base, and the committed work since the base with one", async () => {
      const repo = await seedRepo("repo", { "src/a.ts": "export {};\n" });
      const branchPoint = git(repo, ["rev-parse", "HEAD"]).trim();
      git(repo, ["switch", "-q", "-c", "work"]);
      await getRoot().seedFiles({ "repo/src/a.ts": `export {};\n${LINE}` });
      git(repo, ["commit", "-q", "-am", "work"]);

      const uncommitted = await gateIn(repo, ["scan", "--json"]);
      const sinceBase = await gateIn(repo, ["scan", "--base", branchPoint, "--json"]);

      expect(uncommitted.code).toBe(0);
      expect(uncommitted.doc).toMatchObject({ base: null, scope: "uncommitted", hits: [] });
      expect(sinceBase.code).toBe(1);
      expect(sinceBase.doc).toMatchObject({
        base: branchPoint,
        scope: "since-base",
        hits: [{ path: "src/a.ts", line: 2, rule: "github-token" }],
      });
    });

    it("finds a token in a tracked code file a committed -diff attribute marks binary", async () => {
      const repo = await seedRepo("repo", { "src/x.ts": "export {};\n", ".gitattributes": "*.ts -diff\n" });
      await getRoot().seedFiles({ "repo/src/x.ts": `export {};\n${LINE}` });

      const { code, doc } = await gateIn(repo, ["scan", "--json"]);

      expect(code).toBe(1);
      expect(doc["hits"]).toEqual([{ path: "src/x.ts", line: 2, rule: "github-token" }]);
    });

    it("lists a tracked code file whose head side holds a NUL as unscanned, and exits 0", async () => {
      const repo = await seedRepo("repo", { "src/x.ts": "export {};\n" });
      await getRoot().seedFiles({ "repo/src/x.ts": `export {};\0\n${LINE}` });

      const { code, doc } = await gateIn(repo, ["scan", "--json"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ hits: [], unscanned: ["src/x.ts"] });
    });

    it.skipIf(process.platform === "win32")("names a hit in a file git would quote by its real name", async () => {
      const repo = await seedRepo("repo", { 'a"b.ts': "export {};\n" });
      await getRoot().seedFiles({ 'repo/a"b.ts': `export {};\n${LINE}` });

      const { doc } = await gateIn(repo, ["scan", "--json"]);

      expect(doc["hits"]).toEqual([{ path: 'a"b.ts', line: 2, rule: "github-token" }]);
    });

    it("scans the whole project from a run folder under .stamity/", async () => {
      const repo = await seedRepo("repo", { ".stamity/manifest.json": "{}\n", ".stamity/runs/x/record.md": "run\n", "src/x.ts": "export {};\n" });
      await getRoot().seedFiles({ "repo/src/x.ts": `export {};\n${LINE}` });

      const { code, doc } = await gateIn(join(repo, ".stamity", "runs", "x"), ["scan", "--json"]);

      expect(code).toBe(1);
      expect(doc["hits"]).toEqual([{ path: "src/x.ts", line: 2, rule: "github-token" }]);
    });

    it("names hits by project path and leaves out, counted, the lines outside the project", async () => {
      const repo = await seedRepo("repo", { "app/.stamity/manifest.json": "{}\n", "app/src/x.ts": "export {};\n", "other/y.ts": "export {};\n" });
      await getRoot().seedFiles({ "repo/app/src/x.ts": `export {};\n${LINE}`, "repo/other/y.ts": `export {};\n${LINE}` });

      const { code, doc } = await gateIn(join(repo, "app"), ["scan", "--json"]);

      expect(code).toBe(1);
      expect(doc["hits"]).toEqual([{ path: "src/x.ts", line: 2, rule: "github-token" }]);
      expect(doc["outside"]).toBe(1);
    });

    it.each([
      ["--paths, which only classify takes", ["scan", "--paths", "src/x.ts", "--json"]],
      ["a base that starts with '-'", ["scan", "--base", "-x", "--json"]],
    ])("exits 2 on %s, before git runs", async (_label, argv) => {
      const repo = await seedRepo("repo", { "docs/a.md": "base\n" });

      gitSpy.calls.length = 0;
      const { code, stdout } = await gateIn(repo, argv);

      expect(code).toBe(2);
      expect(stdout).toBe("");
      expect(gitSpy.calls).toEqual([]);
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
