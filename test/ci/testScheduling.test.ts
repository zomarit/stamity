import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, utimesSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { createVitest } from "vitest/node";
import config, { fixtureScheduling, privateTempRoot } from "../../vitest.config.ts";
import setup, {
  PRIVATE_TMP_PREFIX,
  prepareTempRoot,
  removeTempRoot,
  STALE_AFTER_MS,
  sweepStaleRoots,
  tempVolumeWarning,
} from "../support/globalSetup.ts";
import { lazyCleanup } from "../support/lazyCleanup.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const HEAVY = [
  "test/ci/pluginLifecycle.test.ts",
  "test/cli/commands/syncMcpOwnership.test.ts",
  "test/emit/crossClientGoldens.test.ts",
  "test/pack/installSmoke.e2e.test.ts",
  "test/upstream/lane.test.ts",
];

// 2026-09-11: CI 34588320202 also timed out the all-four fresh-directory golden
// in the ordinary parallel group. That observed real-disk fixture extends the
// earlier three-suite scheduling contract; no golden assertion/budget changes.
// 2026-09-23: the contract moves again, from four suites to five — the plugin-
// lifecycle fixture build timed out under parallel-group contention in three
// Windows legs (CI 35837987995, 35845305397, 35852090952); its assertions and
// budgets stay.
// Check Vitest's resolved projects and actual discovery: grouping must lose or
// duplicate no test and must leave the remaining parallelism intact.
describe("Windows fixture scheduling", () => {
  it("isolates exactly the observed five suites without losing or repeating any test file", async () => {
    const runner = await createVitest(
      { watch: false, run: true, config: false, root: ROOT },
      { test: { ...config.test, ...fixtureScheduling("win32") } },
    );
    try {
      const specs = await runner.globTestSpecifications();
      const discovered = specs.map((spec) => relative(ROOT, spec.moduleId).replaceAll("\\", "/"));
      const files = (await readdir(new URL("../../test/", import.meta.url), { recursive: true }))
        .filter((file) => file.endsWith(".test.ts"))
        .map((file) => `test/${file.replaceAll("\\", "/")}`);
      expect(discovered.toSorted()).toEqual(files.toSorted());
      expect(new Set(discovered).size).toBe(discovered.length);

      const parallel = runner.projects.find((project) => project.name === "parallel");
      const heavy = runner.projects.find((project) => project.name === "windows-fixtures");
      expect(runner.projects.map((project) => project.name).toSorted())
        .toEqual(["parallel", "windows-fixtures"]);
      const fixtureFiles = specs.filter((spec) => spec.project === heavy)
        .map((spec) => relative(ROOT, spec.moduleId).replaceAll("\\", "/"));
      const parallelFiles = specs.filter((spec) => spec.project === parallel)
        .map((spec) => relative(ROOT, spec.moduleId).replaceAll("\\", "/"));
      expect(fixtureFiles.toSorted()).toEqual(HEAVY);
      expect(parallelFiles.toSorted()).toEqual(files.filter((file) => !HEAVY.includes(file)).toSorted());
      expect(parallelFiles.filter((file) => fixtureFiles.includes(file))).toEqual([]);
      expect(parallel?.config.maxWorkers).toBeUndefined();
      expect(parallel?.config.sequence.groupOrder).toBe(0);
      expect(heavy?.config.maxWorkers).toBe(1);
      expect(heavy?.config.sequence.groupOrder).toBe(1);
      for (const project of runner.projects) {
        expect(project.config.testTimeout).toBe(20_000);
        expect(project.config.hookTimeout).toBe(20_000);
        expect(project.config.isolate).toBe(true);
        expect(project.config.retry ?? 0).toBe(0);
        // TEST CHANGE, additive (plan 013 file 3, unit sw12-flake-unit): both Windows groups
        // inherit the private temp root, or one group's workers would write to the shared temp
        // root. Inline projects do not inherit `globalSetup`; vitest always sets up and tears
        // down the root project, so the setup runs once for both groups (asserted below).
        expect(project.config.env["TMPDIR"]).toBe(config.test?.env?.["TMPDIR"]);
        expect(project.config.globalSetup).toEqual([]);
      }
      expect([runner.getRootProject().config.globalSetup].flat().map((file) => file.replaceAll("\\", "/")))
        .toEqual([join(ROOT, "test/support/globalSetup.ts").replaceAll("\\", "/")]);
      // Coverage/reporting remain root-level and aggregate both projects.
      expect(runner.config.coverage.thresholds).toEqual(config.test?.coverage?.thresholds);
    } finally {
      await runner.close();
    }
  });

  it.each(["darwin", "linux"] as const)("keeps %s scheduling unchanged", (platform) => {
    expect(fixtureScheduling(platform)).toEqual({});
  });

  it("selects the actual host's scheduling without changing the root timeouts", () => {
    expect(config.test?.projects).toEqual(fixtureScheduling(process.platform).projects);
    expect(config.test?.testTimeout).toBe(20_000);
    expect(config.test?.hookTimeout).toBe(20_000);
  });
});

// ── The private temp root, its global setup, and the deferred cleanup ───────────────────────────

describe("the private temp root", () => {
  const SETUP = join(ROOT, "test/support/globalSetup.ts");

  it("points all three temp variables at <os temp>/stamity-vitest-<pid> and names the setup", () => {
    const root = join("/base", `stamity-vitest-${4242}`);
    expect(privateTempRoot(SETUP, "/base", 4242)).toEqual({
      env: { TMPDIR: root, TEMP: root, TMP: root },
      globalSetup: ["test/support/globalSetup.ts"],
    });
    // The config's own literal and the setup's prefix are one name, or setup skips the root.
    expect(basename(root).startsWith(PRIVATE_TMP_PREFIX)).toBe(true);
  });

  it("stays on the shared temp root when the setup file is not beside the config", () => {
    // A downstream fixture copies vitest.config.ts without the support tree.
    expect(privateTempRoot(join(ROOT, "test/support/absent.ts"), "/base", 4242)).toEqual({});
  });

  it("is live in this worker: tmpdir() is a private root", () => {
    // The config spreads the private root, so the env vitest handed this worker must name one.
    // Re-importing the config here evaluates it under this worker's pid and private tmpdir, so
    // what is compared is the shape, not the parent's literal path.
    expect(config.test?.globalSetup).toEqual(["test/support/globalSetup.ts"]);
    expect(basename(config.test?.env?.["TMPDIR"] ?? "")).toBe(`${PRIVATE_TMP_PREFIX}${process.pid}`);
    expect(basename(tmpdir()).startsWith(PRIVATE_TMP_PREFIX)).toBe(true);
    expect(existsSync(tmpdir())).toBe(true);
  });
});

describe("the global setup", () => {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "global-setup-")));
  afterAll(() => lazyCleanup(scratch));
  let cases = 0;
  const parentDir = (): string => {
    cases += 1;
    const dir = join(scratch, `p${cases}`);
    mkdirSync(dir);
    return dir;
  };

  const GIB = 1024 ** 3;
  /** A volume of `totalGib` with `freeGib` free, in 4 KiB blocks. */
  const volume = (totalGib: number, freeGib: number) => ({
    bsize: 4096,
    blocks: (totalGib * GIB) / 4096,
    bavail: (freeGib * GIB) / 4096,
  });

  it("warns on a temp volume under 10% free, under 2 GiB free, and not otherwise", () => {
    expect(tempVolumeWarning("/tmp", volume(100, 5))).toBe("warning: temp volume /tmp has 5.0 GiB free (5.0%)");
    expect(tempVolumeWarning("/tmp", volume(4, 1))).toBe("warning: temp volume /tmp has 1.0 GiB free (25.0%)");
    expect(tempVolumeWarning("/tmp", volume(100, 50))).toBeNull();
  });

  it("creates the root and prints the warning when a fake statfs reads 5% free", () => {
    // Justified fake: no real volume can be driven to 5% free inside a test.
    const parent = parentDir();
    const root = join(parent, `${PRIVATE_TMP_PREFIX}1`);
    const lines: string[] = [];
    const seen: string[] = [];
    prepareTempRoot({
      root,
      statfs: (path) => {
        seen.push(path);
        return volume(100, 5);
      },
      warn: (line) => lines.push(line),
    });
    expect(existsSync(root)).toBe(true);
    expect(seen).toEqual([parent]);
    expect(lines).toEqual([`warning: temp volume ${parent} has 5.0 GiB free (5.0%)`]);
    // Idempotent: a second project's setup changes nothing and removes nothing.
    writeFileSync(join(root, "kept"), "x");
    prepareTempRoot({ root, statfs: () => volume(100, 50), warn: (line) => lines.push(line) });
    expect(readFileSync(join(root, "kept"), "utf8")).toBe("x");
    expect(lines).toHaveLength(1);
  });

  it("sweeps a stale sibling root and keeps a fresh one, its own, and anything not its own", () => {
    const parent = parentDir();
    const now = Date.now();
    const old = (now - STALE_AFTER_MS - 60_000) / 1000;
    const own = join(parent, `${PRIVATE_TMP_PREFIX}1`);
    const make = (name: string, stale: boolean): string => {
      const dir = join(parent, name);
      mkdirSync(join(dir, "nested"), { recursive: true });
      writeFileSync(join(dir, "nested", "file"), "x");
      if (stale) utimesSync(dir, old, old);
      return dir;
    };
    make(`${PRIVATE_TMP_PREFIX}111`, true);
    make(`${PRIVATE_TMP_PREFIX}222`, true);
    make(`${PRIVATE_TMP_PREFIX}333`, false);
    make(basename(own), true);
    make("other-tool-tmp", true);
    const warnings: string[] = [];
    const removed = sweepStaleRoots(parent, own, now, (line) => warnings.push(line));
    expect(removed.toSorted()).toEqual([`${PRIVATE_TMP_PREFIX}111`, `${PRIVATE_TMP_PREFIX}222`]);
    expect(readdirSync(parent).toSorted()).toEqual(["other-tool-tmp", `${PRIVATE_TMP_PREFIX}1`, `${PRIVATE_TMP_PREFIX}333`]);
    expect(warnings).toEqual([]);
  });

  it("wires setup to the root the project's env names and tears it down, contents and all", () => {
    const root = join(parentDir(), `${PRIVATE_TMP_PREFIX}9`);
    // Justified stub: the setup reads one field of the project, and a real TestProject exists
    // only inside a running vitest whose own root this case must not remove.
    const teardown = setup({ config: { env: { TMPDIR: root } } });
    expect(existsSync(root)).toBe(true);
    mkdirSync(join(root, ".trash", "a", "b"), { recursive: true });
    writeFileSync(join(root, ".trash", "a", "b", "file"), "x");
    teardown();
    expect(existsSync(root)).toBe(false);
    // A second teardown (a second project's) is quiet.
    expect(() => removeTempRoot(root)).not.toThrow();
  });

  it("does nothing for a config without a private root", () => {
    const parent = parentDir();
    const shared = join(parent, "shared-tmp");
    mkdirSync(shared);
    const teardown = setup({ config: { env: { TMPDIR: shared } } });
    teardown();
    expect(existsSync(shared)).toBe(true);
  });
});

/** A two-level tree with a file at each level, so a move and a removal are told apart. */
function tree(parent: string, name: string): string {
  const dir = join(parent, name);
  mkdirSync(join(dir, "a", "b"), { recursive: true });
  writeFileSync(join(dir, "a", "one"), "1");
  writeFileSync(join(dir, "a", "b", "two"), "2");
  return dir;
}

describe("lazyCleanup", () => {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "lazy-cleanup-")));
  afterAll(() => lazyCleanup(scratch));

  it("moves each tree into the private root's trash, whole, and returns", () => {
    const root = join(scratch, `${PRIVATE_TMP_PREFIX}7`);
    mkdirSync(root);
    const first = tree(root, "suite-one");
    const second = tree(root, "suite-two");
    lazyCleanup(first, root);
    lazyCleanup(second, root);
    expect(existsSync(first)).toBe(false);
    expect(existsSync(second)).toBe(false);
    const trash = readdirSync(join(root, ".trash"));
    expect(trash).toHaveLength(2);
    // Moved, not removed: the teardown owns the removal.
    for (const entry of trash) {
      expect(readFileSync(join(root, ".trash", entry, "a", "b", "two"), "utf8")).toBe("2");
    }
    // Already gone is already clean.
    expect(() => lazyCleanup(first, root)).not.toThrow();
  });

  it("removes in place when the root is not a private one", () => {
    const shared = join(scratch, "shared-tmp");
    mkdirSync(shared);
    const dir = tree(shared, "suite");
    lazyCleanup(dir, shared);
    expect(existsSync(dir)).toBe(false);
    expect(readdirSync(shared)).toEqual([]);
  });

  it("defaults to this worker's private root", () => {
    const dir = tree(tmpdir(), `lazy-default-${process.pid}`);
    lazyCleanup(dir);
    expect(existsSync(dir)).toBe(false);
    expect(existsSync(join(tmpdir(), ".trash"))).toBe(true);
    expect(dirname(dir)).toBe(tmpdir());
  });
});
