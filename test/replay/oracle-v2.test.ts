import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { PASS_IDS, applyPatch, createReplayFixture, dataDirOf } from "../../scripts/replay/fixture.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { applyOraclePatch, runOracles } from "../../scripts/replay/oracle.mjs";

/**
 * REPLAY-v2's hidden oracles over its clean chain and its injections (plan 011, v2-fixture). A file
 * of its own, so `oracle.test.ts` stays v1's alone (contract S4).
 *
 * The default half is git only: the oracle and reference-fix patches against the injected tree, and
 * the static oracles, which spawn no vitest. The `STAMITY_REPLAY_SUITE=1` half runs the service's
 * own gates after every clean pass and on the injected tree, then the twelve oracles: every one red
 * on the injected tree, every one green once the reference fixes give back the clean tree.
 *
 * The injected tree is built the way a run meets it: the fixture's S0, every pass applied with
 * `git apply --3way` as a unit does, and then every seed's `injection` (`find` → `replace`, once).
 */

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const V2 = dataDirOf("v2") as string;
const ORACLES_PATCH = join(V2, "oracle", "oracles.patch");
const FIXES_PATCH = join(V2, "oracle", "reference-fixes.patch");
const VITEST_ENTRY = join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs");
const REPLAY_SUITE = process.env["STAMITY_REPLAY_SUITE"] === "1";
const PASSES = PASS_IDS as readonly string[];

type Oracle = { kind: "vitest"; file: string } | { kind: "static"; file: string; mustMatch: string[]; mustNotMatch: string[] };

interface Seed {
  id: string;
  class: string;
  file: string;
  oracle: Oracle;
  injection: { file: string; find: string; replace: string };
}

interface Run {
  run: { status: string; detail: string };
  results: { seed: string; status: "pass" | "fail" | "error"; detail: string }[];
}

const SEEDS = (JSON.parse(readFileSync(join(V2, "seeds.json"), "utf8")) as { seeds: Seed[] }).seeds;
const BEHAVIOUR = SEEDS.filter((seed) => seed.oracle.kind === "vitest");
const STATIC = SEEDS.filter((seed) => seed.oracle.kind === "static");

let root: string;
let cleanGlobal: string;

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "stamity-replay-oracle-v2-")));
  cleanGlobal = join(root, "empty.gitconfig");
  writeFileSync(cleanGlobal, "", "utf8");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

/** `git apply --check`, under an empty global config and no system config, so no operator setting decides it. */
function applyCheck(dir: string, patch: string): void {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: cleanGlobal, GIT_CONFIG_NOSYSTEM: "1" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_COMMON_DIR", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT"]) {
    delete env[key];
  }
  // Exits non-zero (and execFileSync throws with git's output) on any hunk that does not apply.
  execFileSync("git", ["-c", "core.autocrlf=false", "apply", "--check", "--whitespace=nowarn", patch], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
}

/** A fresh fixture from the v2 data with every clean pass applied in chain order: the clean chain's end. */
function cleanTree(depsLink?: string): string {
  const built = createReplayFixture({ out: root, v1Dir: V2, units: PASS_IDS, setup: false, install: false, ...(depsLink ? { depsLink } : {}) }) as { dir: string };
  for (const id of PASSES) applyPatch(built.dir, join(built.dir, "vendor", "contrib", `${id}.patch`), { threeWay: true });
  return built.dir;
}

/** Every seed's injection over the tree at `dir`, as the driver's hook applies one: `find` → `replace`, once. */
function injectAll(dir: string): void {
  for (const seed of SEEDS) {
    const path = join(dir, ...seed.injection.file.split("/"));
    const text = readFileSync(path, "utf8");
    expect(text.split(seed.injection.find).length - 1, `${seed.id}: injection.find occurrences`).toBe(1);
    writeFileSync(path, text.replace(seed.injection.find, () => seed.injection.replace), "utf8");
  }
}

const statuses = (run: Run) => Object.fromEntries(run.results.map((result) => [result.seed, result.status]));
const all = (status: string) => Object.fromEntries(SEEDS.map((seed) => [seed.id, status]));

/** The `diff --git` paths of a patch, and how many of them it creates. */
function patchFiles(path: string): { files: string[]; created: number } {
  const text = readFileSync(path, "utf8");
  const files = [...text.matchAll(/^diff --git a\/(\S+) b\/\1$/gm)].map((match) => match[1] as string);
  return { files, created: (text.match(/^new file mode 100644$/gm) ?? []).length };
}

describe("the v2 oracle patches", () => {
  let injected: string;

  beforeAll(() => {
    injected = cleanTree();
    injectAll(injected);
  }, 60_000);

  it("both apply to the injected tree with git apply --check", () => {
    applyCheck(injected, ORACLES_PATCH);
    applyCheck(injected, FIXES_PATCH);
  });

  it("carry one oracle file per behaviour seed beside the harness and the run's own config, all new, and nothing else", () => {
    expect(BEHAVIOUR).toHaveLength(9);
    const { files, created } = patchFiles(ORACLES_PATCH);
    expect(files.toSorted()).toEqual(["test/__oracle__/harness.ts", "test/__oracle__/vitest.config.ts", ...BEHAVIOUR.map((seed) => seed.oracle.file)].toSorted());
    expect(created).toBe(files.length);
    for (const seed of BEHAVIOUR) expect(seed.oracle.file, seed.id).toBe(`test/__oracle__/${seed.id}.test.ts`);
  });

  it("fix every seed's file with an edit and add no file, so the fixes carry no oracle", () => {
    const { files, created } = patchFiles(FIXES_PATCH);
    expect(created).toBe(0);
    expect(files.toSorted()).toEqual([...new Set(SEEDS.map((seed) => seed.file))].toSorted());
  });

  it("compile every static pattern, and the static oracles read fail on the injected tree, pass on the clean chain and after the fixes", () => {
    expect(STATIC.map((seed) => seed.class)).toEqual(["test-weakening", "test-weakening", "test-weakening"]);
    for (const seed of STATIC) {
      if (seed.oracle.kind !== "static") continue;
      for (const source of [...seed.oracle.mustMatch, ...seed.oracle.mustNotMatch]) expect(() => new RegExp(source), source).not.toThrow();
    }
    // Static seeds only: the runner spawns no vitest, so this half needs no dependencies.
    expect(statuses(runOracles(injected, { seeds: STATIC }) as Run)).toEqual(Object.fromEntries(STATIC.map((seed) => [seed.id, "fail"])));
    expect(statuses(runOracles(cleanTree(), { seeds: STATIC }) as Run)).toEqual(Object.fromEntries(STATIC.map((seed) => [seed.id, "pass"])));
    const fixed = cleanTree();
    injectAll(fixed);
    applyPatch(fixed, FIXES_PATCH);
    expect(statuses(runOracles(fixed, { seeds: STATIC }) as Run)).toEqual(Object.fromEntries(STATIC.map((seed) => [seed.id, "pass"])));
  }, 60_000); // two fixtures and a chain each; v1's compile case took 21.1 s on main's Windows leg against the 20 s default
});

describe.skipIf(!REPLAY_SUITE)("the v2 oracles in a real fixture (set STAMITY_REPLAY_SUITE=1 to run)", () => {
  const deps = join(REPO_ROOT, "node_modules");
  let tree: string;

  beforeAll(() => {
    const built = createReplayFixture({ out: root, v1Dir: V2, units: PASS_IDS, setup: false, depsLink: deps }) as { dir: string };
    tree = built.dir;
  }, 60_000);

  const npm = (args: string[]) => {
    const result = spawnSync("npm", args, { cwd: tree, encoding: "utf8", shell: process.platform === "win32" });
    return { exitCode: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}` };
  };

  /** The service's lint, typecheck and test over the tree, green, with `skipped` tests skipped and no other. */
  const expectGreen = (label: string, skipped: number) => {
    const lint = npm(["run", "lint"]);
    expect(lint.exitCode, `${label} lint\n${lint.output}`).toBe(0);
    // oxlint prints no summary when it detects an agent, so no diagnostic line is what a clean run shows.
    expect(lint.output, `${label} lint`).not.toMatch(/\b(?:warning|error)\b/i);
    const typecheck = npm(["run", "typecheck"]);
    expect(typecheck.exitCode, `${label} typecheck\n${typecheck.output}`).toBe(0);
    const test = npm(["test"]);
    expect(test.exitCode, `${label} test\n${test.output}`).toBe(0);
    expect(test.output, label).toMatch(/Tests\s+\d+ passed/);
    expect(test.output, label).not.toMatch(/^\s*(?:Test Files|Tests)\s[^\n]*\bfailed\b/m);
    expect(/^\s*Tests\s[^\n]*\|\s*(\d+) skipped/m.exec(test.output)?.[1] ?? "0", label).toBe(String(skipped));
    return test.output;
  };

  const run = () => runOracles(tree, { seeds: SEEDS, vitestEntry: VITEST_ENTRY }) as Run;

  // The cases share one tree and run in file order: the clean chain, the injections, the oracles, the fixes.
  it(
    "keeps lint, typecheck and test green after every cumulative clean pass, nothing skipped",
    () => {
      for (const id of PASSES) {
        applyPatch(tree, join(tree, "vendor", "contrib", `${id}.patch`), { threeWay: true });
        expectGreen(id, 0);
      }
    },
    600_000,
  );

  it(
    "keeps the gates green on the injected tree, the one skipped test being the injected skip",
    () => {
      injectAll(tree);
      expectGreen("injected", 1);
    },
    300_000,
  );

  it(
    "reports all twelve oracles fail on the injected tree, none error",
    () => {
      applyOraclePatch(tree, ORACLES_PATCH);
      const result = run();
      expect(result.run).toEqual({ status: "ok", detail: "" });
      expect(result.results).toHaveLength(12);
      expect(statuses(result), JSON.stringify(result.results, null, 2)).toEqual(all("fail"));
    },
    180_000,
  );

  it(
    "reports all twelve pass once the reference fixes give back the clean tree, and the gates stay green with the oracles in it",
    () => {
      applyPatch(tree, FIXES_PATCH);
      const result = run();
      expect(statuses(result), JSON.stringify(result.results, null, 2)).toEqual(all("pass"));
      // The service's six test files and the nine behaviour oracles, nothing skipped.
      expect(expectGreen("fixed", 0)).toMatch(/Test Files\s+15 passed \(15\)/);
    },
    300_000,
  );
});
