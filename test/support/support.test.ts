import { spawnSync } from "node:child_process";
import { access, chmod, mkdir, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { devNull } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error — the build config is plain ESM JavaScript with no type
// declarations, and it stays that way on purpose: it is loaded with
// `--config-loader native`, so authoring it in TypeScript would reintroduce the
// loader choice its own header rules out. Same shape as the .mjs imports in
// test/ci/leakGate.test.ts and test/ci/workflow.test.ts; the exported
// surface is pinned by BuildConfigModule below, so nothing downstream is `any`.
import * as buildConfigModule from "../../tsdown.config.mjs";
import { buildChildEnv, makeCliFixture, spawnCollect, type CliFixture } from "./cliHarness.ts";
import { treeDigest } from "./packFixtures.ts";
import { makeTempDir, type TempDirHandle, useTempDir } from "./tempDir.ts";
import { makeVolume, type VirtualVolume } from "./vfs.ts";

const ENOENT = { code: "ENOENT" };

/** One file the build emitted, as the budget gate takes it. */
interface DistEntry {
  relPath: string;
  bytes: number;
}

/** The build config's budget surface, typed here because the module is untyped. */
interface BuildConfigModule {
  LOGIC_BUDGET_BYTES: number;
  CORPUS_BUDGET_BYTES: number;
  classifyDistEntry(relPath: string): "logic" | "corpus" | "other";
  checkSizeBudgets(files: readonly DistEntry[]): {
    logic: number;
    corpus: number;
    other: number;
    budgets: { half: string; bytes: number; budget: number }[];
    violations: { half: string; bytes: number; budget: number }[];
  };
}

const { LOGIC_BUDGET_BYTES, CORPUS_BUDGET_BYTES, checkSizeBudgets, classifyDistEntry } =
  buildConfigModule as BuildConfigModule;

describe("makeTempDir", () => {
  it("hands every caller its own directory, including under parallel construction", async () => {
    const handles = await Promise.all(Array.from({ length: 8 }, () => makeTempDir()));

    try {
      const dirs = handles.map((handle) => handle.dir);
      expect(new Set(dirs).size).toBe(dirs.length);

      const stats = await Promise.all(dirs.map((dir) => stat(dir)));
      expect(stats.every((entry) => entry.isDirectory())).toBe(true);
      expect(dirs.every((dir) => basename(dir).includes(`-${process.pid}-`))).toBe(true);
    } finally {
      await Promise.all(handles.map((handle) => handle.cleanup()));
    }
  });

  it("cleans up nested content", async () => {
    const handle = await makeTempDir("cleanup-case");
    await handle.seedFiles({ "nested/deep/file.md": "content" });

    await handle.cleanup();

    await expect(access(handle.dir)).rejects.toMatchObject(ENOENT);
  });

  it("cleans up idempotently when the directory is already gone", async () => {
    const handle = await makeTempDir();
    await rm(handle.dir, { recursive: true, force: true });

    await expect(handle.cleanup()).resolves.toBeUndefined();
    await expect(handle.cleanup()).resolves.toBeUndefined();
  });
});

describe("seedFiles", () => {
  it("creates parent directories implicitly and round-trips content byte-exact", async () => {
    const handle = await makeTempDir();
    const files = {
      "agents/nested/deep/a.md": "---\nid: a\n---\n\nbody\n",
      "top.txt": "no trailing newline",
      "unicode/π.md": "héllo — ✅\r\nCRLF preserved\r\n",
      "empty.md": "",
    };

    try {
      await handle.seedFiles(files);

      const entries = Object.entries(files);
      const written = await Promise.all(
        entries.map(([relative]) => readFile(handle.path(...relative.split("/")))),
      );
      entries.forEach(([, content], index) => {
        expect(written[index]?.equals(Buffer.from(content, "utf8"))).toBe(true);
      });
      expect((await readdir(handle.path("agents", "nested"))).toSorted()).toEqual(["deep"]);
    } finally {
      await handle.cleanup();
    }
  });

  it("rejects paths that escape the directory and writes nothing when it does", async () => {
    const handle = await makeTempDir();

    try {
      await expect(handle.seedFiles({ "../escape.md": "nope" })).rejects.toThrow(
        /escapes the temp dir/,
      );
      await expect(handle.seedFiles({ "a/../../escape.md": "nope" })).rejects.toThrow(/escapes/);
      await expect(handle.seedFiles({ "ok.md": "yes", "../escape.md": "nope" })).rejects.toThrow(
        /escapes/,
      );
      await expect(handle.seedFiles({ "": "nope" })).rejects.toThrow(/not a file path/);

      expect(await readdir(handle.dir)).toEqual([]);
    } finally {
      await handle.cleanup();
    }
  });

  it("guards path() with the same containment rule", async () => {
    const handle = await makeTempDir();

    try {
      expect(handle.path("a", "b.md")).toBe(join(handle.dir, "a", "b.md"));
      expect(handle.path("a", "..", "b.md")).toBe(join(handle.dir, "b.md"));
      expect(() => handle.path("..")).toThrow(/escapes the temp dir/);
      expect(() => handle.path("a", "..", "..", "b.md")).toThrow(/escapes/);
      expect(() => handle.path(join("/etc", "passwd"))).toThrow(/escapes/);
    } finally {
      await handle.cleanup();
    }
  });
});

describe("useTempDir", () => {
  const getDir = useTempDir("lane-real-fs");
  let firstDir = "";

  it("gives the running test a live directory", async () => {
    const handle: TempDirHandle = getDir();
    firstDir = handle.dir;

    await handle.seedFiles({ "scratch.md": "x" });
    expect(await readFile(handle.path("scratch.md"), "utf8")).toBe("x");
  });

  it("cleans the previous test's directory and hands out a different one", async () => {
    expect(firstDir).not.toBe("");
    await expect(access(firstDir)).rejects.toMatchObject(ENOENT);
    expect(getDir().dir).not.toBe(firstDir);
  });

  afterAll(() => {
    expect(() => getDir()).toThrow(/call the getter inside it\(\)\/test\(\)/);
  });
});

describe("makeVolume", () => {
  it("snapshots exactly the seeded map plus writes made through the wrapped API", async () => {
    const volume: VirtualVolume = makeVolume({
      "agents/a.md": "one",
      "rules/nested/b.md": "two",
    });

    await volume.fs.writeFile(`${volume.root}/rules/nested/c.md`, "three", "utf8");
    volume.seed({ "skills/d/SKILL.md": "four" });

    expect(volume.snapshot()).toEqual({
      "agents/a.md": "one",
      "rules/nested/b.md": "two",
      "rules/nested/c.md": "three",
      "skills/d/SKILL.md": "four",
    });
  });

  it("starts empty with a readable root when seeded with nothing", async () => {
    const volume = makeVolume();

    expect(volume.snapshot()).toEqual({});
    expect(await volume.fs.readdir(volume.root)).toEqual([]);
  });

  it("serves reads through the promises seam the engine modules take", async () => {
    const volume = makeVolume({ "agents/a.md": "body" });

    expect(await volume.fs.readFile(`${volume.root}/agents/a.md`, "utf8")).toBe("body");
    expect((await volume.fs.stat(`${volume.root}/agents`)).isDirectory()).toBe(true);

    const entries = await volume.fs.readdir(volume.root, { withFileTypes: true });
    expect(entries.map((entry) => [entry.name, entry.isDirectory()])).toEqual([["agents", true]]);
  });

  it("isolates volumes from each other and from the real filesystem", async () => {
    const seeded = makeVolume({ "x.md": "a" });
    const other = makeVolume();

    other.seed({ "y.md": "b" });

    expect(seeded.snapshot()).toEqual({ "x.md": "a" });
    expect(other.snapshot()).toEqual({ "y.md": "b" });
    await expect(access(`${seeded.root}/x.md`)).rejects.toMatchObject(ENOENT);
  });

  it("rejects seed keys that escape the volume root and seeds nothing when they do", () => {
    const volume = makeVolume();

    expect(() => volume.seed({ "../escape.md": "nope" })).toThrow(
      /must be a relative path inside the volume root/,
    );
    expect(() => volume.seed({ "a/../../escape.md": "nope" })).toThrow(/relative path/);
    expect(() => volume.seed({ "/absolute.md": "nope" })).toThrow(/relative path/);
    expect(() => volume.seed({ "ok.md": "yes", "../escape.md": "nope" })).toThrow(/relative path/);
    expect(() => volume.seed({ "": "nope" })).toThrow(/relative path/);

    expect(volume.snapshot()).toEqual({});
  });
});

/**
 * The one support module that reaches into `src/` on purpose.
 *
 * `inProcess.ts` IS the in-process CLI runner: it imports `runCli` and the
 * types its callers pass, which is the whole point of the lane. Naming it here
 * rather than leaving the list hand-written is what keeps the exception a
 * decision instead of an omission.
 */
const SRC_IMPORTING_MODULES = new Set(["inProcess.ts"]);

/** Every support module on disk, `.test.ts` files excluded. */
async function supportModules(): Promise<string[]> {
  const dir = fileURLToPath(new URL("./", import.meta.url));
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
    .map((entry) => entry.name)
    .toSorted();
}

describe("support lane discipline", () => {
  it("imports nothing from src/", async () => {
    // DERIVED, not enumerated. The list used to name two modules while five
    // others advertised the same invariant in their own headers — including one
    // claiming parity with "the modules the test enforces" and one that
    // deliberately mirrors a production function. A module added to this
    // directory tomorrow is covered by construction, and one that starts
    // importing src/ has to be added to SRC_IMPORTING_MODULES in the same diff.
    const modules = (await supportModules()).filter((name) => !SRC_IMPORTING_MODULES.has(name));
    expect(modules.length).toBeGreaterThan(4);

    const sources = await Promise.all(
      modules.map(async (module) => ({
        module,
        source: await readFile(fileURLToPath(new URL(`./${module}`, import.meta.url)), "utf8"),
      })),
    );

    for (const { module, source } of sources) {
      const specifiers = [...source.matchAll(/\bfrom\s+"([^"]+)"/g)].map((match) => match[1] ?? "");

      expect(specifiers.length, module).toBeGreaterThan(0);
      expect(specifiers.filter((specifier) => specifier.includes("src/")), module).toEqual([]);
      // Sibling modules are allowed: the lane's rule is "nothing from src/", and
      // cliHarness/packFixtures/inProcess compose each other by design. A `../`
      // specifier is still refused — that is how a src/ import would sneak back
      // in without the literal "src/" substring.
      expect(
        specifiers.filter(
          (specifier) => !/^(node:|vitest$|memfs$|\.\/[A-Za-z0-9]+\.ts$)/.test(specifier),
        ),
        module,
      ).toEqual([]);
    }
  });

  it("covers every module in the directory, exception included", async () => {
    // The derivation's own guard: if the exception set names a module that no
    // longer exists, the list silently shrinks and the suite still passes.
    const onDisk = await supportModules();

    for (const name of SRC_IMPORTING_MODULES) expect(onDisk).toContain(name);
    expect(onDisk).toContain("cliHarness.ts");
    expect(onDisk).toContain("packFixtures.ts");
    expect(onDisk.every((name) => /^[A-Za-z0-9]+\.ts$/.test(name))).toBe(true);
  });

  it("keeps the declared exception genuinely exceptional", async () => {
    // inProcess.ts is excused from the rule, not from review: it may reach into
    // src/, and this pins WHAT it reaches for, so the exception cannot quietly
    // grow into a second engine dependency.
    const source = await readFile(
      fileURLToPath(new URL("./inProcess.ts", import.meta.url)),
      "utf8",
    );
    const specifiers = [...source.matchAll(/\bfrom\s+"([^"]+)"/g)].map((match) => match[1] ?? "");

    expect(specifiers.filter((specifier) => specifier.includes("src/")).toSorted()).toEqual([
      "../../src/cli/kit/program.ts",
      "../../src/cli/kit/terminal.ts",
    ]);
  });
});

describe("cliHarness child env", () => {
  /**
   * These assertions live here rather than in cliHarness.test.ts because the
   * git-isolation contract is a support-lane property and this suite owns the
   * lane's discipline checks.
   */
  it("cuts both halves of git's config search path", async () => {
    const fixture = await makeCliFixture();
    try {
      const env = buildChildEnv(fixture.home);

      expect(env["GIT_CONFIG_NOSYSTEM"]).toBe("1");
      expect(env["GIT_CONFIG_GLOBAL"]).toBe(devNull);
      // HOME already moves, but on its own it only relocates the global file —
      // a fixture that writes into the pseudo-home would re-open that half.
      expect(env["HOME"]).toBe(fixture.home.home);
    } finally {
      await fixture.cleanup();
    }
  });

  it("keeps a hostile global gitconfig out of a git-touching run", async (ctx) => {
    // The failure this closes: every git the harness spawned read the
    // developer's ~/.gitconfig, so a machine-local setting decided the outcome
    // of assertions about porcelain status. `showUntrackedFiles = no` is the
    // setting that blanks it — planted here, it must have no effect.
    let fixture: CliFixture;
    try {
      fixture = await makeCliFixture({ git: true });
    } catch (error) {
      if (error instanceof Error && error.name === "GitUnavailableError") ctx.skip();
      throw error;
    }
    try {
      await writeFile(
        join(fixture.home.home, ".gitconfig"),
        "[status]\n\tshowUntrackedFiles = no\n[stamity]\n\tprobe = leaked\n",
        "utf8",
      );
      await writeFile(join(fixture.repoDir, "untracked.md"), "not committed\n", "utf8");
      const env = buildChildEnv(fixture.home);

      const probe = await spawnCollect("git", ["config", "--get", "stamity.probe"], {
        cwd: fixture.repoDir,
        env,
      });
      // `--get` on a key no config defines exits 1 with no output.
      expect(probe.stdout.trim()).toBe("");
      expect(probe.code).toBe(1);

      const status = await spawnCollect("git", ["status", "--porcelain"], {
        cwd: fixture.repoDir,
        env,
      });
      expect(status.code).toBe(0);
      // The planted setting would have blanked this line.
      expect(status.stdout).toContain("?? untracked.md");
    } finally {
      await fixture.cleanup();
    }
  });
});

describe("cliHarness stdin delivery", () => {
  it("delivers a payload past the pipe buffer to a child that drains it", async () => {
    // The non-degenerate baseline for the failure case below: the same size of
    // payload, delivered in full, so the rejection there is about the closed
    // read end and not about the size.
    const fixture = await makeCliFixture();
    try {
      const payload = "x".repeat(1_000_000);
      const echo = await spawnCollect(
        process.execPath,
        [
          "-e",
          'let n = 0; process.stdin.on("data", (c) => { n += c.length; }); process.stdin.on("end", () => { process.stdout.write(String(n)); });',
        ],
        { cwd: fixture.repoDir, env: buildChildEnv(fixture.home), stdin: payload },
      );

      expect(echo.code).toBe(0);
      expect(echo.stdout).toBe(String(payload.length));
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects with the child named when the stdin write fails, instead of killing the worker", async () => {
    // A child that closes its read end and stays alive: the parent's write goes
    // past the 64 KB pipe buffer and takes EPIPE. Unhandled, that `error` event
    // on child.stdin is an uncaught exception at PROCESS level — it takes down
    // the whole vitest worker and blames whichever test was running. The
    // assertion is therefore that this rejects (the run reports its own
    // failure) and that the rejection names the command.
    const fixture = await makeCliFixture();
    try {
      const child = spawnCollect(
        process.execPath,
        ["-e", 'process.stdin.destroy(); setTimeout(() => process.exit(0), 3000);'],
        {
          cwd: fixture.repoDir,
          env: buildChildEnv(fixture.home),
          stdin: "y".repeat(4_000_000),
        },
      );

      await expect(child).rejects.toThrow(/\[cliHarness\] failed to pipe stdin to/);
      await expect(child).rejects.toThrow(new RegExp(process.execPath.replace(/\\/g, "\\\\")));
    } finally {
      await fixture.cleanup();
    }
  });
});

/** Two sibling trees under one temp root, so a digest pair is comparable. */
async function trees(): Promise<{ handle: TempDirHandle; a: string; b: string }> {
  const handle = await makeTempDir("tree-digest");
  return { handle, a: handle.path("a"), b: handle.path("b") };
}

describe("treeDigest", () => {
  it("sees a symlink a file-only walk skipped entirely", async () => {
    // The blind spot this closes, and the one that matters for the assertions
    // it backs: the digest hashed regular files only, so a tree that GAINED a
    // symlink digested identically to the tree without it — "a refused install
    // must write nothing" passing over exactly the artifact that was written.
    const { handle, a, b } = await trees();
    try {
      await handle.seedFiles({ "a/target.md": "payload", "b/target.md": "payload" });
      await symlink("target.md", join(a, "link"));

      expect(await treeDigest(a)).not.toBe(await treeDigest(b));
      // ...and each tree still digests equal to itself: the change adds
      // discrimination, not nondeterminism.
      expect(await treeDigest(a)).toBe(await treeDigest(a));
    } finally {
      await handle.cleanup();
    }
  });

  it("separates a symlink from a regular file holding the link's target bytes", async () => {
    const { handle, a, b } = await trees();
    try {
      await handle.seedFiles({ "a/target.md": "payload", "b/target.md": "payload" });
      await symlink("target.md", join(a, "link"));
      // Same path, same bytes on the wire, different KIND — which the type row
      // in the digest is what separates.
      await writeFile(join(b, "link"), "target.md", "utf8");

      expect(await treeDigest(a)).not.toBe(await treeDigest(b));
    } finally {
      await handle.cleanup();
    }
  });

  it("follows no symlink when it walks", async () => {
    // A link to an ancestor would loop a following walk; the digest reads the
    // link's own target string instead of descending through it.
    const { handle, a } = await trees();
    try {
      await handle.seedFiles({ "a/nested/deep.md": "payload" });
      await symlink(a, join(a, "nested", "loop"));

      await expect(treeDigest(a)).resolves.toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await handle.cleanup();
    }
  });

  it("sees an empty directory that a file-only walk cannot", async () => {
    const { handle, a, b } = await trees();
    try {
      await handle.seedFiles({ "a/keep.md": "same", "b/keep.md": "same" });
      await mkdir(join(a, "scratch"), { recursive: true });

      expect(await treeDigest(a)).not.toBe(await treeDigest(b));
    } finally {
      await handle.cleanup();
    }
  });

  it.skipIf(process.platform === "win32")("sees a mode change on identical bytes", async () => {
    const { handle, a, b } = await trees();
    try {
      await handle.seedFiles({ "a/run.sh": "echo hi\n", "b/run.sh": "echo hi\n" });
      await chmod(join(a, "run.sh"), 0o755);
      await chmod(join(b, "run.sh"), 0o644);

      expect(await treeDigest(a)).not.toBe(await treeDigest(b));
    } finally {
      await handle.cleanup();
    }
  });

  it("still reports equal for trees that really are identical, .git excluded", async () => {
    // The property every "zero filesystem delta" assertion depends on: two
    // trees built the same way digest the same, and .git churn never moves it.
    const { handle, a, b } = await trees();
    try {
      await handle.seedFiles({
        "a/one.md": "first",
        "a/nested/two.md": "second",
        "b/one.md": "first",
        "b/nested/two.md": "second",
        "a/.git/HEAD": "ref: refs/heads/main\n",
      });
      await mkdir(join(a, "empty"), { recursive: true });
      await mkdir(join(b, "empty"), { recursive: true });

      expect(await treeDigest(a)).toBe(await treeDigest(b));
    } finally {
      await handle.cleanup();
    }
  });

  it("moves when a file's bytes move, which is the original claim", async () => {
    const { handle, a, b } = await trees();
    try {
      await handle.seedFiles({ "a/one.md": "first", "b/one.md": "second" });

      expect(await treeDigest(a)).not.toBe(await treeDigest(b));
    } finally {
      await handle.cleanup();
    }
  });
});

describe("build size budgets", () => {
  /**
   * The build config's gate, tested here because it is repo infrastructure with
   * no suite of its own and this unit's surface reaches it. `checkSizeBudgets`
   * is pure over a listing, so the measurement is provable without running a
   * build — a build-derived assertion would only ever prove that today's output
   * happens to fit.
   */
  const listing = [
    { relPath: "cli.js", bytes: 300_000 },
    { relPath: "src.js", bytes: 1_300_000 },
    { relPath: "index.js", bytes: 1_300 },
    { relPath: "content/agents/a.md", bytes: 400_000 },
    { relPath: "packs/ops/pack.json", bytes: 100_000 },
  ];

  it("sorts each emitted path into the half it belongs to", () => {
    expect(classifyDistEntry("cli.js")).toBe("logic");
    expect(classifyDistEntry("content/agents/a.md")).toBe("corpus");
    expect(classifyDistEntry("packs/ops/pack.json")).toBe("corpus");
    // A sourcemap counts against NEITHER budget: it is not emitted, and one that
    // reappeared should surface as unbudgeted rather than eat the logic half.
    expect(classifyDistEntry("cli.js.map")).toBe("other");
  });

  it("totals both halves and passes a build inside them", () => {
    const report = checkSizeBudgets(listing);

    expect(report.logic).toBe(1_601_300);
    expect(report.corpus).toBe(500_000);
    expect(report.violations).toEqual([]);
    expect(LOGIC_BUDGET_BYTES).toBeGreaterThan(report.logic);
    expect(CORPUS_BUDGET_BYTES).toBeGreaterThan(report.corpus);
  });

  it("fires on a seeded oversize logic half, naming that half alone", () => {
    // The measurement has to be falsifiable: one seeded row past the budget.
    const oversize = [...listing, { relPath: "bloat.js", bytes: LOGIC_BUDGET_BYTES }];
    const report = checkSizeBudgets(oversize);

    expect(report.violations.map((row) => row.half)).toEqual(["logic"]);
    expect(report.violations[0]?.bytes).toBeGreaterThan(LOGIC_BUDGET_BYTES);
  });

  it("fires on a seeded oversize corpus half independently of the logic one", () => {
    const oversize = [...listing, { relPath: "content/huge.bin", bytes: CORPUS_BUDGET_BYTES }];
    const report = checkSizeBudgets(oversize);

    expect(report.violations.map((row) => row.half)).toEqual(["corpus"]);
  });

  it("reports both halves when both are over", () => {
    const report = checkSizeBudgets([
      { relPath: "cli.js", bytes: LOGIC_BUDGET_BYTES + 1 },
      { relPath: "content/huge.bin", bytes: CORPUS_BUDGET_BYTES + 1 },
    ]);

    expect(report.violations.map((row) => row.half)).toEqual(["logic", "corpus"]);
  });

  /**
   * The same two numbers, through the gate a pull request runs.
   *
   * `tsdown.config.mjs` enforces them in its own `build:done` hook, which means a violation
   * surfaces as "the build broke" on a step whose job is to produce output.
   * `scripts/size-budget.mjs` is the second caller: it reads the SAME exported classification and
   * budgets — asserted in test/ci/workflow.test.ts, so a second set of numbers cannot appear
   * there — and reports both halves on every run. What is tested here is its behaviour on the
   * three trees it can be handed, including the one that must never read as a pass.
   */
  describe("the standalone gate the pull-request check runs", () => {
    const SCRIPT = fileURLToPath(new URL("../../scripts/size-budget.mjs", import.meta.url));

    function run(dir: string): { status: number | null; out: string } {
      const result = spawnSync(process.execPath, [SCRIPT, dir], {
        encoding: "utf8",
        // Emptied rather than inherited: a summary file belongs to the run that opened it.
        env: { ...process.env, GITHUB_STEP_SUMMARY: "" },
      });
      return { status: result.status, out: `${result.stdout}${result.stderr}` };
    }

    it("reports both halves and passes a tree inside them", async () => {
      const handle = await makeTempDir("size-budget-pass");
      try {
        await handle.seedFiles({
          "cli.js": "x".repeat(1_000),
          "content/agents/a.md": "y".repeat(500),
          "packs/ops/pack.json": "{}",
        });

        const result = run(handle.dir);

        expect(result.status, result.out).toBe(0);
        expect(result.out).toContain("logic:");
        expect(result.out).toContain("corpus:");
        expect(result.out).toContain("both halves inside budget");
      } finally {
        await handle.cleanup();
      }
    });

    it("fails on a seeded oversize half, naming that half and not the other", async () => {
      const handle = await makeTempDir("size-budget-over");
      try {
        await handle.seedFiles({
          "cli.js": "x".repeat(LOGIC_BUDGET_BYTES + 1),
          "content/agents/a.md": "y".repeat(500),
        });

        const result = run(handle.dir);

        expect(result.status).toBe(1);
        expect(result.out).toContain("size budget exceeded");
        expect(result.out).toContain("logic:");
        expect(result.out).not.toContain("corpus: 1");
      } finally {
        await handle.cleanup();
      }
    });

    it("exits 2 on a missing build, because an unmeasured tree is not a pass", async () => {
      const handle = await makeTempDir("size-budget-missing");
      try {
        const result = run(join(handle.dir, "never-built"));

        expect(result.status).toBe(2);
        expect(result.out).toContain("npm run build");
        expect(result.out).not.toContain("inside budget");
      } finally {
        await handle.cleanup();
      }
    });

    it("exits 2 on an empty build directory, which measures the same as a small one", async () => {
      const handle = await makeTempDir("size-budget-empty");
      try {
        const result = run(handle.dir);

        expect(result.status).toBe(2);
        expect(result.out).toContain("holds no files");
      } finally {
        await handle.cleanup();
      }
    });
  });

  it("declares budgets a real build has room inside, and no sourcemap in the config", async () => {
    // The numbers are constants with a stated basis, not a high-water mark, so
    // they must sit above the measured build rather than on it.
    expect(LOGIC_BUDGET_BYTES).toBe(2 * 1024 * 1024);
    expect(CORPUS_BUDGET_BYTES).toBe(1536 * 1024);

    const config = await readFile(
      fileURLToPath(new URL("../../tsdown.config.mjs", import.meta.url)),
      "utf8",
    );
    // 2.54 MiB of the measured 4.05 MiB unpacked tree was sourcemaps, under
    // neither budget; `files: ["dist"]` ships whatever lands there.
    expect(config).toContain("sourcemap: false");
  });
});
