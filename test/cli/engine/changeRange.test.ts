import { execFileSync } from "node:child_process";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { CLASS_FILE } from "../../../src/change/classify.ts";
import { gateCommand } from "../../../src/cli/commands/gate.ts";
import { classifyRange, type RangeFacts } from "../../../src/cli/engine/changeRange.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { NO_GIT_CONFIG } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * change-range (REQ-FLOW-152): what a committed range classifies as. Every case runs real git in a scratch repository
 * and nothing is stubbed: the object-store read is the thing under test, and a failed read comes from a real missing
 * object or a real shallow clone.
 */

const gitAvailable = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/** Seeding isolation, as in `test/cli/commands/gate.test.ts`. The reads themselves are isolated by {@link isolated}. */
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
  return execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...SEED_ENV } });
}

const fileOf = (classes: Record<string, string[]>): string => `${JSON.stringify({ classes })}\n`;

/** A source file that starts a process: the line rules read the call, the import names it. */
const SPAWNS = 'import { execSync } from "node:child_process";\nexport const run = (): string => execSync("ls").toString();\n';

/** Bytes git and the sniff both call binary: a NUL in the first 8,000. */
const BINARY = Buffer.from([0x89, 0x50, 0x00, 0x01, 0x0a]);
const BINARY_AGAIN = Buffer.from([0x89, 0x50, 0x00, 0x02, 0x0a]);

const LOCK_NAME = ["package-lock", "json"].join(".");
const MANIFEST_NAME = ["package", "json"].join(".");

/** An npm lockfile-version-3 copy with `a` at `version`, as npm writes it. */
const lock = (version: string): string =>
  `${JSON.stringify(
    {
      name: "x",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": { name: "x" },
        "node_modules/a": { version, resolved: `https://registry.npmjs.org/a/-/a-${version}.tgz`, integrity: `sha512-a${version}` },
      },
    },
    null,
    2,
  )}\n`;

type Files = Record<string, string | Buffer>;

describe.skipIf(!gitAvailable)("classifyRange", () => {
  const getRoot = useTempDir("change-range");

  async function put(repo: string, files: Files): Promise<void> {
    await Promise.all(
      Object.entries(files).map(async ([path, body]) => {
        const file = join(repo, path);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, body);
      }),
    );
  }

  /** Writes `files`, removes `removed`, and commits all of it; returns the commit id. */
  async function commit(repo: string, files: Files, removed: readonly string[] = []): Promise<string> {
    await put(repo, files);
    await Promise.all(removed.map((path) => rm(join(repo, path))));
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "--allow-empty", "-m", "change"]);
    return git(repo, ["rev-parse", "HEAD"]).trim();
  }

  /** A repository at `<root>/<name>` holding `files`, committed once; returns its path and the base commit. */
  async function seed(files: Files, name = "repo"): Promise<{ repo: string; base: string }> {
    const repo = getRoot().path(name);
    await mkdir(repo, { recursive: true });
    git(repo, ["init", "-q"]);
    return { repo, base: await commit(repo, files) };
  }

  /** Runs `body` with `HOME` at an empty folder, so no global config of the host reaches the read's git. */
  async function isolated<T>(body: () => Promise<T>, env: Record<string, string> = {}): Promise<T> {
    const home = getRoot().path("home");
    await mkdir(home, { recursive: true });
    const overrides = { HOME: home, XDG_CONFIG_HOME: home, ...env };
    const previous = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));
    Object.assign(process.env, overrides);
    try {
      return await body();
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  const range = (cwd: string, base: string, head: string): Promise<RangeFacts> => isolated(() => classifyRange(cwd, base, head));

  /** What `gate classify --base` says in `cwd`, in the fields a {@link RangeFacts} result carries. */
  async function gateSays(cwd: string, base: string): Promise<Record<string, unknown>> {
    const { stdout } = await isolated(() => runInProcess([gateCommand], ["gate", "classify", "--base", base, "--json"], { cwd }));
    const { class: cls, byPath, checks, lenses, reason } = JSON.parse(stdout) as Record<string, unknown>;
    return { class: cls, byPath, checks, lenses, reason };
  }

  describe("reads committed objects, never the work tree or the index", () => {
    it("classifies a product edit committed and then reverted in the work tree as product", async () => {
      const { repo, base } = await seed({ "src/a.ts": "export const a = 1;\n", "docs/x.md": "base\n" });
      const head = await commit(repo, { "src/a.ts": "export const a = 2;\n" });
      await put(repo, { "src/a.ts": "export const a = 1;\n" });

      const facts = await range(repo, base, head);

      expect(facts.result.class).toBe("product");
      expect(facts.result.byPath).toEqual([{ path: "src/a.ts", class: "product", rule: "unplaced" }]);
      expect(facts.files).toBe(1);
      expect(facts.lines).toBe(2);
    });

    it("keeps a committed change a staged revert hides from the index", async () => {
      const { repo, base } = await seed({ "src/a.ts": "export const a = 1;\n" });
      const head = await commit(repo, { "src/a.ts": SPAWNS });
      await put(repo, { "src/a.ts": "export const a = 1;\n" });
      git(repo, ["add", "src/a.ts"]);

      const facts = await range(repo, base, head);

      expect(facts.result.class).toBe("security-sensitive");
    });

    it("leaves out what no commit holds: an uncommitted, a staged and an untracked file", async () => {
      const { repo, base } = await seed({ "docs/x.md": "base\n", "src/a.ts": "export const a = 1;\n" });
      const head = await commit(repo, { "docs/x.md": "changed\n" });
      await put(repo, { "src/a.ts": SPAWNS, "src/staged.ts": SPAWNS, "src/untracked.ts": SPAWNS });
      git(repo, ["add", "src/staged.ts"]);

      const facts = await range(repo, base, head);

      expect(facts.result.class).toBe("docs");
      expect(facts.result.byPath.map((entry) => entry.path)).toEqual(["docs/x.md"]);
      expect(facts).toMatchObject({ files: 1, lines: 2, complete: true });
    });

    it("reads a commit that is not the checked-out one", async () => {
      const { repo, base } = await seed({ "src/a.ts": "export const a = 1;\n" });
      const head = await commit(repo, { "src/a.ts": SPAWNS });
      git(repo, ["checkout", "-q", base]);

      const facts = await range(repo, base, head);

      expect(facts.result.class).toBe("security-sensitive");
    });

    // Git reads a diff's attributes from the work tree even between two commits, so its binary verdict decides nothing.
    it("never reads a binary as text by an uncommitted attribute", async () => {
      const { repo, base } = await seed({ "assets/a.bin": BINARY, "docs/x.md": "base\n" });
      const head = await commit(repo, { "assets/a.bin": BINARY_AGAIN, "docs/x.md": "changed\n" });
      const clean = await range(repo, base, head);
      await put(repo, { ".gitattributes": "*.bin diff\n" });

      const planted = await range(repo, base, head);

      expect(clean).toMatchObject({ files: 2, lines: null, complete: false });
      expect(planted).toEqual(clean);
    });

    /** A guard removed from a function that starts a process above a blank line: only the hunk's context shows the call. */
    const GUARDED = [
      "export function f(): void {",
      '  const out = execSync("ls");',
      "",
      "  class Local {}",
      ...Array.from({ length: 5 }, (_, at) => `  const pad${at} = ${at};`),
      "  guard(out);",
      "  const last = 1;",
      "}",
      "",
    ].join("\n");
    const UNGUARDED = GUARDED.replace("  guard(out);\n", "");
    /** The Python driver's function lines make `class Local` start a function, so `-W` stops short of the call. */
    const NARROWS = "*.ts diff=python\n";

    it("keeps a hunk's whole-function context under an uncommitted attribute that narrows it", async () => {
      const { repo, base } = await seed({ "src/a.ts": GUARDED });
      const head = await commit(repo, { "src/a.ts": UNGUARDED });
      const clean = await range(repo, base, head);
      await put(repo, { ".gitattributes": NARROWS });

      const planted = await range(repo, base, head);

      expect(clean.result.class).toBe("security-sensitive");
      expect(planted).toEqual(clean);
    });

    it("keeps the context under a user attributes file, named by config or found by its default place", async () => {
      const { repo, base } = await seed({ "src/a.ts": GUARDED });
      const head = await commit(repo, { "src/a.ts": UNGUARDED });
      const clean = await range(repo, base, head);
      await put(getRoot().dir, { "home/git/attributes": NARROWS, "named-attributes": NARROWS });

      const byDefaultPlace = await range(repo, base, head);
      git(repo, ["config", "core.attributesFile", getRoot().path("named-attributes")]);
      const byConfig = await range(repo, base, head);

      expect(clean.result.class).toBe("security-sensitive");
      expect(byDefaultPlace).toEqual(clean);
      expect(byConfig).toEqual(clean);
    });

    it("reads complete false, with a reason, when the git directory's attributes file holds anything", async () => {
      const { repo, base } = await seed({ "src/a.ts": GUARDED });
      const head = await commit(repo, { "src/a.ts": UNGUARDED });
      await put(repo, { ".git/info/attributes": NARROWS });

      const facts = await range(repo, base, head);

      expect(facts.complete).toBe(false);
      expect(facts.result.reason).toContain("info/attributes");
    });

    it("finds that file from a project in a subfolder and from a linked work tree", async () => {
      const { repo, base } = await seed({ "app/.stamity/runs/.keep": "", "app/docs/x.md": "a\n" });
      const head = await commit(repo, { "app/docs/x.md": "b\n" });
      const linked = getRoot().path("linked");
      git(repo, ["worktree", "add", "-q", "--detach", linked, head]);
      await put(repo, { ".git/info/attributes": NARROWS });

      expect((await range(join(repo, "app"), base, head)).complete).toBe(false);
      expect((await range(join(linked, "app"), base, head)).complete).toBe(false);
    });

    it("stays complete with an empty attributes file in the git directory", async () => {
      const { repo, base } = await seed({ "docs/x.md": "a\n" });
      const head = await commit(repo, { "docs/x.md": "b\n" });
      await put(repo, { ".git/info/attributes": "" });

      expect(await range(repo, base, head)).toMatchObject({ lines: 2, complete: true });
    });

    it("reads a range's hunks by the base's attributes, so a range cannot narrow its own context", async () => {
      const { repo, base } = await seed({ "src/a.ts": GUARDED });
      const head = await commit(repo, { "src/a.ts": UNGUARDED, ".gitattributes": NARROWS });

      const facts = await range(repo, base, head);

      expect(facts.result.byPath.find((entry) => entry.path === "src/a.ts")?.class).toBe("security-sensitive");
    });

    it("counts a file's lines whatever an uncommitted attribute says", async () => {
      const { repo, base } = await seed({ "src/a.ts": "export const a = 1;\n" });
      const head = await commit(repo, { "src/a.ts": "export const a = 2;\n" });
      await put(repo, { ".gitattributes": "*.ts -diff\n" });

      const facts = await range(repo, base, head);

      expect(facts).toMatchObject({ lines: 2, complete: true });
    });

    it("keeps reading a source file an uncommitted attribute marks binary", async () => {
      const { repo, base } = await seed({ "src/a.ts": "export const a = 1;\n" });
      const head = await commit(repo, { "src/a.ts": SPAWNS });
      await put(repo, { ".gitattributes": "*.ts -diff\n" });

      const facts = await range(repo, base, head);

      expect(facts.result.class).toBe("security-sensitive");
      expect(facts.result.byPath[0]?.rule).toMatch(/^line rule /);
    });
  });

  describe("the line rules and the lockfile audit run", () => {
    it("raises a process spawn in a src/ hunk by its line rule", async () => {
      const { repo, base } = await seed({ "src/a.ts": "export const a = 1;\n" });
      const head = await commit(repo, { "src/a.ts": SPAWNS });

      const facts = await range(repo, base, head);

      expect(facts.result.class).toBe("security-sensitive");
      expect(facts.result.byPath[0]?.rule).toMatch(/^line rule /);
      expect(facts.result.lenses).toContain("stamity-security");
    });

    it("reads a call an earlier line of the head blob named, past the hunk's context", async () => {
      const filler = Array.from({ length: 40 }, (_, at) => `export const f${at} = ${at};`).join("\n");
      const body = `import { exec as e } from "node:child_process";\n${filler}\n`;
      const { repo, base } = await seed({ "src/a.ts": body });
      const head = await commit(repo, { "src/a.ts": `${body}e("ls");\n` });

      const facts = await range(repo, base, head);

      expect(facts.result.class).toBe("security-sensitive");
    });

    it("takes a proven lockfile-only bump off the security lens, reading both copies from blobs", async () => {
      const { repo, base } = await seed({ [MANIFEST_NAME]: "{}\n", [LOCK_NAME]: lock("1.0.0") });
      const head = await commit(repo, { [LOCK_NAME]: lock("1.0.1") });
      await put(repo, { [LOCK_NAME]: lock("9.9.9") });

      const facts = await range(repo, base, head);

      expect(facts.result.class).toBe("security-sensitive");
      expect(facts.result.checks).toContain("dependency-audit");
      expect(facts.result.lenses).not.toContain("stamity-security");
    });

    it("keeps the lens for a lockfile the base does not hold, naming it", async () => {
      const { repo, base } = await seed({ [MANIFEST_NAME]: "{}\n" });
      const head = await commit(repo, { [LOCK_NAME]: lock("1.0.1") });

      const facts = await range(repo, base, head);

      expect(facts.result.lenses).toContain("stamity-security");
      expect(facts.result.reason).toContain(`the security lens stays: ${LOCK_NAME} has no base copy (git show failed`);
    });
  });

  describe("on a clean tree the class is gate classify's on the same change", () => {
    const cases: [string, Files, Files, readonly string[], string][] = [
      ["docs alone", { "docs/x.md": "a\n" }, { "docs/x.md": "b\n", "docs/y.md": "c\n" }, [], "docs"],
      ["a mix with a deletion", { "docs/x.md": "a\n", "src/a.ts": "export const a = 1;\n", "src/b.ts": "export const b = 1;\n" }, { "docs/x.md": "b\n", "src/a.ts": "export const a = 2;\n" }, ["src/b.ts"], "product"],
      ["a process spawn", { "src/a.ts": "export const a = 1;\n" }, { "src/a.ts": SPAWNS }, [], "security-sensitive"],
      ["a spawn removed with its file", { "src/a.ts": SPAWNS, "docs/x.md": "a\n" }, { "docs/x.md": "b\n" }, ["src/a.ts"], "security-sensitive"],
      ["a lockfile-only bump", { [MANIFEST_NAME]: "{}\n", [LOCK_NAME]: lock("1.0.0") }, { [LOCK_NAME]: lock("1.0.1") }, [], "security-sensitive"],
      ["a binary asset", { "assets/a.bin": BINARY, "docs/x.md": "a\n" }, { "assets/a.bin": BINARY_AGAIN, "docs/x.md": "b\n" }, [], "product"],
      ["a binary source file", { "src/a.ts": "export const a = 1;\n" }, { "src/a.ts": BINARY }, [], "security-sensitive"],
      ["a rename across classes", { "docs/x.md": "one\ntwo\nthree\n" }, { "src/x.md": "one\ntwo\nthree\n" }, ["docs/x.md"], "product"],
      ["a base class file", { [CLASS_FILE]: fileOf({ tests: ["test/**"] }), "test/a.test.ts": "export {};\n" }, { "test/a.test.ts": "export const a = 1;\n" }, [], "tests"],
      // No newline in the bytes: the error quotes them, and the verb's printed reason is sanitised where this read's is not.
      ["an invalid base class file", { [CLASS_FILE]: "not json", "docs/x.md": "a\n" }, { "docs/x.md": "b\n" }, [], "product"],
      ["a binary script, code by its shebang", { "bin/tool": "#!/usr/bin/env node\nconsole.log(1);\n" }, { "bin/tool": Buffer.from("#!/usr/bin/env node\n\0\n") }, [], "security-sensitive"],
      ["a binary a base attribute calls text", { ".gitattributes": "*.bin diff\n", "assets/a.bin": BINARY, "docs/x.md": "a\n" }, { "assets/a.bin": BINARY_AGAIN, "docs/x.md": "b\n" }, [], "product"],
      ["a binary rename, its bytes unchanged", { "assets/a.bin": BINARY, "docs/x.md": "a\n" }, { "assets/b.bin": BINARY, "docs/x.md": "b\n" }, ["assets/a.bin"], "product"],
    ];

    it.each(cases)("%s", async (_name, before, after, removed, expected) => {
      const { repo, base } = await seed(before);
      const head = await commit(repo, after, removed);

      const facts = await range(repo, base, head);
      const live = await gateSays(repo, base);

      expect(facts.result.class).toBe(expected);
      expect(facts.result).toEqual(live);
    });

    it("a deleted binary git records executable, code by its mode", async () => {
      const { repo } = await seed({ "bin/tool": BINARY, "docs/x.md": "a\n" });
      git(repo, ["update-index", "--chmod=+x", "bin/tool"]);
      git(repo, ["commit", "-q", "-m", "executable"]);
      const base = git(repo, ["rev-parse", "HEAD"]).trim();
      const head = await commit(repo, { "docs/x.md": "b\n" }, ["bin/tool"]);

      const facts = await range(repo, base, head);
      const live = await gateSays(repo, base);

      expect(facts.result.class).toBe("security-sensitive");
      expect(facts.result).toEqual(live);
    });

    it("from a project in a subfolder, with a changed path outside it", async () => {
      const { repo, base } = await seed({ "app/.stamity/runs/.keep": "", "app/docs/x.md": "a\n", "other/y.md": "a\n" });
      const head = await commit(repo, { "app/docs/x.md": "b\n", "other/y.md": "b\n" });

      const facts = await range(join(repo, "app"), base, head);
      const live = await gateSays(join(repo, "app"), base);

      expect(facts.result.class).toBe("product");
      expect(facts.result).toEqual(live);
      expect(facts).toMatchObject({ files: 2, lines: 4, complete: false });
    });
  });

  describe("the class file is the base commit's", () => {
    it("gives a test file product by the built-in rules alone, with no class file at the base", async () => {
      const { repo, base } = await seed({ "docs/x.md": "a\n" });
      const head = await commit(repo, { "test/change/x.test.ts": "export {};\n" });

      const facts = await range(repo, base, head);

      expect(facts.result.byPath).toEqual([{ path: "test/change/x.test.ts", class: "product", rule: "unplaced" }]);
    });

    it("gives a test file and its helper tests when the base's file places them", async () => {
      const { repo, base } = await seed({ [CLASS_FILE]: fileOf({ tests: ["test/**"] }) });
      const head = await commit(repo, { "test/change/x.test.ts": "export {};\n", "test/support/helper.ts": "export {};\n" });

      const facts = await range(repo, base, head);

      expect(facts.result.class).toBe("tests");
      expect(facts.result.byPath.map((entry) => entry.class)).toEqual(["tests", "tests"]);
    });

    it("holds a code file out of tests outside a built-in test glob, whatever the file says", async () => {
      const { repo, base } = await seed({ [CLASS_FILE]: fileOf({ tests: ["e2e/**"] }) });
      const head = await commit(repo, { "e2e/flow.ts": "export {};\n" });

      const facts = await range(repo, base, head);

      expect(facts.result.byPath).toEqual([{ path: "e2e/flow.ts", class: "product", rule: expect.stringMatching(/^floor: /) as string }]);
    });

    it("ignores a class file the range itself adds, and classifies that file security-sensitive", async () => {
      const { repo, base } = await seed({ "docs/x.md": "a\n" });
      const head = await commit(repo, { [CLASS_FILE]: fileOf({ tests: ["test/**"] }), "test/a.test.ts": "export {};\n" });

      const facts = await range(repo, base, head);

      expect(facts.result.class).toBe("security-sensitive");
      expect(facts.result.byPath.find((entry) => entry.path === "test/a.test.ts")?.class).toBe("product");
    });

    it("ignores a lowering edit to the class file in the head and in the work tree", async () => {
      const { repo, base } = await seed({ [CLASS_FILE]: fileOf({ "security-sensitive": ["guarded/**"] }), "guarded/a.md": "a\n" });
      const head = await commit(repo, { [CLASS_FILE]: fileOf({ docs: ["guarded/**"] }), "guarded/a.md": "b\n" });
      await put(repo, { [CLASS_FILE]: fileOf({ docs: ["guarded/**"] }) });

      const facts = await range(repo, base, head);

      expect(facts.result.byPath.find((entry) => entry.path === "guarded/a.md")?.class).toBe("security-sensitive");
    });
  });

  describe("files, lines and complete", () => {
    it("sums numstat's added and deleted lines over every file", async () => {
      const { repo, base } = await seed({ "docs/x.md": "1\n2\n3\n", "docs/y.md": "1\n" });
      const head = await commit(repo, { "docs/x.md": "1\nchanged\n3\n4\n", "docs/y.md": "1\n2\n3\n" });

      const facts = await range(repo, base, head);

      // x: one changed line is one added and one deleted, plus line 4; y: lines 2 and 3.
      expect(facts).toMatchObject({ files: 2, lines: 5, complete: true });
    });

    it("leaves lines null and complete false for a binary file, counting the file", async () => {
      const { repo, base } = await seed({ "assets/a.bin": BINARY, "docs/x.md": "a\n" });
      const head = await commit(repo, { "assets/a.bin": BINARY_AGAIN, "docs/x.md": "b\n" });

      const facts = await range(repo, base, head);

      expect(facts).toMatchObject({ files: 2, lines: null, complete: false });
      expect(facts.result.reason).toContain("1 changed file not read line by line");
    });

    it("counts a deleted binary as unread too", async () => {
      const { repo, base } = await seed({ "assets/a.bin": BINARY, "docs/x.md": "a\n" });
      const head = await commit(repo, { "docs/x.md": "b\n" }, ["assets/a.bin"]);

      const facts = await range(repo, base, head);

      expect(facts).toMatchObject({ files: 2, lines: null, complete: false });
    });

    /** Sets or, with no `id`, drops the gitlink at `path` and commits it; `git add -A` would drop one with no folder behind it. */
    function pointer(repo: string, path: string, id?: string): string {
      git(repo, ["update-index", ...(id === undefined ? ["--force-remove", path] : ["--add", "--cacheinfo", `160000,${id},${path}`])]);
      git(repo, ["commit", "-q", "-m", "pointer"]);
      return git(repo, ["rev-parse", "HEAD"]).trim();
    }

    it("reads complete false for a submodule bump, naming the path, under a class file that places it in tests", async () => {
      const { repo, base } = await seed({ [CLASS_FILE]: fileOf({ tests: ["test/**"] }) });
      const other = await commit(repo, { "docs/x.md": "b\n" });
      const from = pointer(repo, "test/vendored", base);
      const to = pointer(repo, "test/vendored", other);

      const facts = await range(repo, from, to);

      expect(facts).toMatchObject({ files: 1, lines: null, complete: false });
      expect(facts.result.reason).toContain("test/vendored");
    });

    it("reads complete false for a submodule the range adds or removes", async () => {
      const { repo, base } = await seed({ "docs/x.md": "a\n" });
      const added = pointer(repo, "vendored", base);
      const removed = pointer(repo, "vendored");

      const adds = await range(repo, base, added);
      const removes = await range(repo, added, removed);

      expect(adds.complete).toBe(false);
      expect(removes.complete).toBe(false);
      expect(removes.result.reason).toContain("vendored");
    });

    it("reads complete false for a text file past the read bound, whose head no line rule saw", { timeout: 60_000 }, async () => {
      const big = `${"x".repeat(1024 * 1024)}\n`.repeat(65);
      const { repo, base } = await seed({ "docs/big.txt": big });
      const head = await commit(repo, { "docs/big.txt": `${big}changed\n` });

      const facts = await range(repo, base, head);

      expect(facts).toMatchObject({ files: 1, lines: null, complete: false });
    });

    it("counts both paths of a rename", async () => {
      const { repo, base } = await seed({ "docs/old.md": "one\ntwo\nthree\nfour\n" });
      const head = await commit(repo, { "docs/new.md": "one\ntwo\nthree\nfour\n" }, ["docs/old.md"]);

      const facts = await range(repo, base, head);

      expect(facts).toMatchObject({ files: 2, lines: 0, complete: true });
      expect(facts.result.byPath.map((entry) => entry.path)).toEqual(["docs/old.md", "docs/new.md"]);
    });

    it("returns zero files for an empty range, its class as gate classify gives none", async () => {
      const { repo, base } = await seed({ "docs/x.md": "a\n" });

      const facts = await range(repo, base, base);

      expect(facts).toMatchObject({ files: 0, lines: 0, complete: true });
      expect(facts.result).toMatchObject({ class: "product", byPath: [] });
      expect(facts.result).toEqual(await gateSays(repo, base));
    });
  });

  describe("a read that cannot be made", () => {
    const ABSENT = "0123456789abcdef0123456789abcdef01234567";

    it("refuses a base or a head the object store does not hold, with a coded error", async () => {
      const { repo, base } = await seed({ "docs/x.md": "a\n" });

      await expect(range(repo, ABSENT, base)).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining(`base ${ABSENT}`) as string });
      await expect(range(repo, base, ABSENT)).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining(`head ${ABSENT}`) as string });
    });

    it("refuses a base a shallow clone left out", async () => {
      const { repo, base } = await seed({ "docs/x.md": "a\n" });
      const head = await commit(repo, { "docs/x.md": "b\n" });
      const shallow = getRoot().path("shallow");
      git(getRoot().dir, ["clone", "-q", "--depth", "1", pathToFileURL(repo).href, shallow]);

      await expect(range(shallow, base, head)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("refuses a ref git would read as an option", async () => {
      const { repo, base } = await seed({ "docs/x.md": "a\n" });

      await expect(range(repo, "--all", base)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("says security-sensitive, lines null and complete false when a changed blob is gone", async () => {
      const { repo, base } = await seed({ "docs/x.md": "a\n" });
      const head = await commit(repo, { "docs/x.md": "b\n" });
      const blob = git(repo, ["rev-parse", `${head}:docs/x.md`]).trim();
      await rm(join(repo, ".git", "objects", blob.slice(0, 2), blob.slice(2)), { force: true });

      const facts = await range(repo, base, head);

      expect(facts.result.class).toBe("security-sensitive");
      expect(facts.result.reason).toContain("the changed lines could not be read");
      expect(facts).toMatchObject({ files: 1, lines: null, complete: false });
    });

    // A stand-in for git, because the suite runs one git and an old one is the thing to reach: it answers
    // `--attr-source` as a git before 2.41 does, exit 129, and hands every other call to the real program.
    it.skipIf(process.platform === "win32")("fails closed on a git too old for --attr-source, naming what it lacks", async () => {
      const { repo, base } = await seed({ "docs/x.md": "a\n" });
      const head = await commit(repo, { "docs/x.md": "b\n" });
      const real = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
      const shim = getRoot().path("old-git");
      await put(shim, { git: `#!/bin/sh\ncase "$*" in *--attr-source*) exit 129;; esac\nexec "${real}" "$@"\n` });
      await chmod(join(shim, "git"), 0o755);

      const facts = await isolated(() => classifyRange(repo, base, head), { PATH: `${shim}:${process.env["PATH"] ?? ""}` });

      expect(facts.result.class).toBe("product");
      expect(facts.result.reason).toContain("git 2.41 or later");
      expect(facts).toMatchObject({ files: 0, lines: null, complete: false });
    });

    // A stand-in for git, because the system attributes file sits in git's install prefix, which a test must not write:
    // it fails a range diff that reaches it with the switch off, and hands every call to the real program otherwise.
    it.skipIf(process.platform === "win32")("turns the system attributes file off for every range diff", async () => {
      const { repo, base } = await seed({ "docs/x.md": "a\n" });
      const head = await commit(repo, { "docs/x.md": "b\n" });
      const real = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
      const shim = getRoot().path("checking-git");
      await put(shim, { git: `#!/bin/sh\ncase "$*" in *--attr-source*) [ "$GIT_ATTR_NOSYSTEM" = 1 ] || exit 97;; esac\nexec "${real}" "$@"\n` });
      await chmod(join(shim, "git"), 0o755);

      const facts = await isolated(() => classifyRange(repo, base, head), { PATH: `${shim}:${process.env["PATH"] ?? ""}` });

      expect(facts).toMatchObject({ files: 1, lines: 2, complete: true });
    });

    it("raises a name the report cannot show to at least product", async () => {
      const name = `docs/a${String.fromCodePoint(0x202e)}b.md`;
      const { repo, base } = await seed({ "docs/x.md": "a\n" });
      const head = await commit(repo, { [name]: "a\n" });

      const facts = await range(repo, base, head);

      expect(facts.result.class).toBe("product");
      expect(facts.result.reason).toContain("names the report cannot show as they are");
    });

    it("fails closed outside a work tree: product, nothing counted, never complete", async () => {
      const outside = getRoot().path("no-repo");
      await mkdir(outside, { recursive: true });

      const facts = await range(outside, "HEAD", "HEAD");

      expect(facts.result.class).toBe("product");
      expect(facts.result.reason).toContain("the change could not be read");
      expect(facts).toMatchObject({ files: 0, paths: [], lines: null, complete: false });
    });
  });

  describe("the file set, for a caller to hold beside another list", () => {
    it("names each changed path from the top level, a rename's two sides among them", async () => {
      const { repo, base } = await seed({ "app/.stamity/manifest.json": "{}\n", "app/docs/old.md": "one\ntwo\nthree\nfour\n", "app/docs/x.md": "a\n" });
      git(join(repo, "app"), ["mv", "docs/old.md", "docs/new.md"]);
      const head = await commit(repo, { "app/docs/x.md": "b\n" });

      const facts = await range(join(repo, "app"), base, head);

      expect(facts.paths.toSorted()).toEqual(["app/docs/new.md", "app/docs/old.md", "app/docs/x.md"]);
      expect(facts.files).toBe(3);
    });
  });

  describe("a local parent override (review/52)", () => {
    it("is read by no call: a planted one cannot shrink a range named by a parent", async () => {
      const { repo, base } = await seed({ "docs/x.md": "a\n", "docs/y.md": "a\n" });
      const planted = await commit(repo, { "docs/x.md": "b\n", "docs/y.md": "b\n" });
      git(repo, ["reset", "-q", "--hard", base]);
      const head = await commit(repo, { "docs/x.md": "b\n", "docs/y.md": "b\n", "docs/z.md": "c\n" });
      await put(repo, { ".git/info/grafts": `${head} ${planted}\n` });
      // The override is live for git as anything else runs it, so the case below proves the read does not take it.
      expect(git(repo, ["rev-parse", `${head}~1`]).trim()).toBe(planted);

      const facts = await range(repo, `${head}~1`, head);

      expect(facts.paths.toSorted()).toEqual(["docs/x.md", "docs/y.md", "docs/z.md"]);
      expect(facts).toMatchObject({ files: 3, lines: 5, complete: true });
    });
  });

  // TEST CHANGE, justified (review/69, signed off): the land reads the tip's class file from GitHub, so what it hands in is the
  // file's text and no longer a commit of the clone's. The two cases naming a commit go with that, and these pin the text.
  describe("the class file a caller read itself (review/53, review/69)", () => {
    const raised = fileOf({ "security-sensitive": ["docs/x.md"] });

    /** A change to a docs path, and beside it on another line of history a commit whose class file raises that path. */
    async function forked(): Promise<{ repo: string; base: string; head: string }> {
      const { repo, base } = await seed({ "docs/x.md": "a\n" });
      const head = await commit(repo, { "docs/x.md": "b\n" });
      git(repo, ["switch", "-q", "--detach", base]);
      await commit(repo, { [CLASS_FILE]: raised });
      return { repo, base, head };
    }

    it("is the base's with none handed in, as `gate` and every other caller read it", async () => {
      const { repo, base, head } = await forked();

      expect((await range(repo, base, head)).result.class).toBe("docs");
    });

    it("judges by the text handed in, the store's copy read by no call, and the range stays base to head", async () => {
      const { repo, base, head } = await forked();

      const facts = await isolated(() => classifyRange(repo, base, head, raised));

      expect(facts.result.class).toBe("security-sensitive");
      expect(facts.paths).toEqual(["docs/x.md"]);
    });

    it("reads `null` as no class file, whatever the base's copy holds", async () => {
      const { repo, base } = await seed({ [CLASS_FILE]: raised, "docs/x.md": "a\n" });
      const head = await commit(repo, { "docs/x.md": "b\n" });

      const facts = await isolated(() => classifyRange(repo, base, head, null));

      expect(facts.result.class).toBe("docs");
      expect(facts.complete).toBe(true);
    });

    it("reads a text the validator refuses as a refused base copy reads: its raising rows, the class at least product", async () => {
      const { repo, base } = await seed({ "docs/x.md": "a\n" });
      const head = await commit(repo, { "docs/x.md": "b\n" });

      const facts = await isolated(() => classifyRange(repo, base, head, "not a class file"));

      expect(facts.result.class).toBe("product");
      expect(facts.result.reason).toContain("is invalid");
    });

    it("places the project at the cwd with no tree read, so the store cannot move what the rows are read against", async () => {
      const { repo, base } = await seed({ "app/docs/x.md": "a\n" });
      const head = await commit(repo, { "app/docs/x.md": "b\n" });
      const app = join(repo, "app");

      // No commit holds `app/.stamity`, so the walk the base's read takes ends at the top, where the row below names nothing.
      expect((await range(app, base, head)).result.class).toBe("product");

      const facts = await isolated(() => classifyRange(app, base, head, raised));

      expect(facts.result.class).toBe("security-sensitive");
      expect(facts.paths).toEqual(["app/docs/x.md"]);
    });
  });
});
