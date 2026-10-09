import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_RULES,
  BUILT_IN_TEST_GLOBS,
  classifyChange,
  matchGlob,
  mergeRules,
  parseClassFile,
  type ClassRule,
} from "../../src/change/classify.ts";
import { extractReadPaths, isTestSource, type TestInputEntry } from "../../src/change/testInputs.ts";
// @ts-expect-error — import-safe native ESM CI helper with no type declarations, outside the product package.
import * as lanes from "../../scripts/ci/records-only.mjs";

/**
 * p2d-test-input-census (REQ-FLOW-062): the guard over this repository's test-input map,
 * `.stamity/change-classes.json`'s `testInputs`.
 *
 * A narrow selection is only as good as the map behind it (S4), so every read a test source
 * declares in its own text ({@link extractReadPaths}) is held against the map: for each (test,
 * path) pair, the path must be covered when it classifies `records` or `docs`, or when some entry's
 * glob matches it. Covered means an entry whose glob matches the path lists the test, lists a
 * folder holding it, or says `"all"`. A helper's reads count for every test file that imports it,
 * directly or through other helpers, since the map can only name test files. A path under a
 * built-in test glob needs no entry: a change to it runs every test (rule (1), review/66). A glob
 * literal over the cost bound gives no declarable reads and fails here, naming it (review/62,
 * review/75: the tests globs come from the class file, not from this file).
 *
 * The guard is pure over its input, so the synthetic cases feed it strings and sets, no double;
 * the last blocks read this repository's tracked files through `git ls-files`.
 */

interface CensusInput {
  /** Test-source path → its text. */
  sources: ReadonlyMap<string, string>;
  tracked: ReadonlySet<string>;
  map: readonly TestInputEntry[];
  rules: readonly ClassRule[];
}

const TEST_FILE_GLOBS = ["**/*.test.*", "**/*.spec.*"];

/**
 * `<folder>/**`, built at run time: written as a literal, a folder glob here would make this file a
 * declared reader of every tracked file under that folder (review/68), which the map would then have to list.
 */
function under(folder: string): string {
  return [folder, "**"].join("/");
}

function isTestFile(path: string): boolean {
  return TEST_FILE_GLOBS.some((glob) => matchGlob(path, glob));
}

/** A relative import specifier in a source: `from "./x.ts"`, `import("../y.js")`, `import "./z.ts"`. */
const IMPORT = /\b(?:from|import)\s*\(?\s*(["'])(\.{1,2}\/[^"']+)\1/g;

/** The test source a relative specifier names, trying the TypeScript twin of a `.js`-family name. */
function resolveImport(from: string, specifier: string, known: ReadonlySet<string>): string | undefined {
  const joined = posix.normalize(posix.join(posix.dirname(from), specifier));
  const candidates = [
    joined,
    joined.replace(/\.js$/, ".ts"),
    joined.replace(/\.mjs$/, ".mts"),
    joined.replace(/\.cjs$/, ".cts"),
    `${joined}.ts`,
    `${joined}/index.ts`,
  ];
  return candidates.find((candidate) => known.has(candidate));
}

/** For each source, the test sources it imports. */
function importsOf(sources: ReadonlyMap<string, string>): Map<string, Set<string>> {
  const known = new Set(sources.keys());
  const edges = new Map<string, Set<string>>();
  for (const [path, text] of sources) {
    const targets = new Set<string>();
    for (const match of text.matchAll(IMPORT)) {
      const target = resolveImport(path, match[2] ?? "", known);
      if (target !== undefined && target !== path) targets.add(target);
    }
    edges.set(path, targets);
  }
  return edges;
}

/** The test files that reach `helper` through their imports, transitively through other helpers. */
function testsReaching(helper: string, edges: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  const reached = new Set<string>([helper]);
  const queue = [helper];
  const tests = new Set<string>();
  while (queue.length > 0) {
    const target = queue.shift() as string;
    for (const [source, targets] of edges) {
      if (!targets.has(target) || reached.has(source)) continue;
      reached.add(source);
      if (isTestFile(source)) tests.add(source);
      else queue.push(source);
    }
  }
  return [...tests].toSorted();
}

/** An entry's test covers `test` when it names it, names a folder holding it, or is `"all"`. */
function covers(entry: TestInputEntry, test: string): boolean {
  if (entry.tests === "all") return true;
  return entry.tests.some((listed) => listed === test || test.startsWith(`${listed}/`));
}

/** Every gap between the sources' declared reads and the map, one message each, sorted. */
function censusGaps(input: CensusInput): string[] {
  const gaps = new Set<string>();
  const classes = new Map<string, string>();
  const classOf = (path: string): string => {
    let cls = classes.get(path);
    if (cls === undefined) {
      cls = classifyChange({ paths: [path], base: "given" }, input.rules).class;
      classes.set(path, cls);
    }
    return cls;
  };
  const needsEntry = (path: string): boolean => {
    if (BUILT_IN_TEST_GLOBS.some((glob) => matchGlob(path, glob))) return false;
    const cls = classOf(path);
    return cls === "records" || cls === "docs" || input.map.some((entry) => matchGlob(path, entry.glob));
  };
  const edges = importsOf(input.sources);

  for (const [source, text] of input.sources) {
    const reads = extractReadPaths(text, input.tracked);
    if (!Array.isArray(reads)) {
      gaps.add(`${source} holds the glob literal ${JSON.stringify(reads.refused)}, which ${reads.error}, so every test runs`);
      continue;
    }
    for (const path of reads.filter(needsEntry)) {
      const via = isTestFile(source) ? "" : ` through ${source}`;
      const tests = isTestFile(source) ? [source] : testsReaching(source, edges);
      if (tests.length === 0) gaps.add(`${source} reads ${path}, and no test file imports it, so no entry can name its test`);
      const matching = input.map.filter((entry) => matchGlob(path, entry.glob));
      for (const test of tests) {
        if (matching.some((entry) => covers(entry, test))) continue;
        gaps.add(`${test} reads ${path}${via}, and no map entry matching ${path} lists ${test}`);
      }
    }
  }
  return [...gaps].toSorted();
}

describe("censusGaps (synthetic)", () => {
  const TRACKED = new Set([
    "docs/guide.md",
    "docs/new.md",
    "website/site.json",
    "test/fixtures/page.md",
    "src/x.ts",
    "LICENSE",
  ]);
  const rules = BUILT_IN_RULES;
  const one = (text: string, path = "test/a.test.ts") => new Map([[path, text]]);

  it("fails on a test reading an undeclared docs page, naming both", () => {
    const map = [{ glob: "docs/guide.md", tests: ["test/a.test.ts"] }];
    const gaps = censusGaps({ sources: one(`read("docs/new.md");`), tracked: TRACKED, map, rules });

    expect(gaps).toEqual(["test/a.test.ts reads docs/new.md, and no map entry matching docs/new.md lists test/a.test.ts"]);
    expect(censusGaps({ sources: one(`read("docs/guide.md");`), tracked: TRACKED, map, rules })).toEqual([]);
  });

  it("fails on a test reading a docs page whose entry does not list it, naming the pair", () => {
    const map = [{ glob: under("docs"), tests: ["test/b.test.ts"] }];

    expect(censusGaps({ sources: one(`read("docs/guide.md");`), tracked: TRACKED, map, rules })).toEqual([
      "test/a.test.ts reads docs/guide.md, and no map entry matching docs/guide.md lists test/a.test.ts",
    ]);
  });

  it("does not fail on a scratch literal naming an untracked path", () => {
    const sources = one(`seed({ "docs/scratch.md": "x" });`);

    expect(censusGaps({ sources, tracked: TRACKED, map: [], rules })).toEqual([]);
    expect(censusGaps({ sources, tracked: new Set([...TRACKED, "docs/scratch.md"]), map: [], rules })).toHaveLength(1);
  });

  it("holds a path no class places in docs once an entry's glob matches it", () => {
    const sources = one(`read("website/site.json");`);
    const map = [{ glob: under("website"), tests: ["test/site.test.ts"] }];

    expect(censusGaps({ sources, tracked: TRACKED, map: [], rules })).toEqual([]);
    expect(censusGaps({ sources, tracked: TRACKED, map, rules })).toEqual([
      "test/a.test.ts reads website/site.json, and no map entry matching website/site.json lists test/a.test.ts",
    ]);
  });

  it("needs no entry for a path under a built-in test glob, even one an entry matches", () => {
    const map = [{ glob: under("test"), tests: ["test/guard.test.ts"] }];

    expect(censusGaps({ sources: one(`read("test/fixtures/page.md");`), tracked: TRACKED, map, rules })).toEqual([]);
  });

  it("counts an all entry and a listed folder as covering, and a folder-name prefix as not", () => {
    const sources = one(`read("docs/guide.md");`, "test/records/a.test.ts");
    const gapsWith = (tests: TestInputEntry["tests"]) =>
      censusGaps({ sources, tracked: TRACKED, map: [{ glob: under("docs"), tests }], rules });

    expect(gapsWith("all")).toEqual([]);
    expect(gapsWith(["test/records"])).toEqual([]);
    expect(gapsWith(["test/rec"])).toHaveLength(1);
  });

  it("charges a helper's read to every test file importing it, through other helpers too", () => {
    const sources = new Map([
      ["test/support/pages.ts", `export const page = read("docs/guide.md");`],
      ["test/support/index.ts", `export { page } from "./pages.js";`],
      ["test/a.test.ts", `import { page } from "./support/index.ts";`],
      ["test/b.test.ts", `import {\n  page,\n} from "./support/pages.ts";`],
      ["test/c.test.ts", `import { other } from "./other.ts";`],
    ]);
    const gapsWith = (tests: string[]) =>
      censusGaps({ sources, tracked: TRACKED, map: [{ glob: under("docs"), tests }], rules });

    expect(gapsWith([])).toEqual([
      "test/a.test.ts reads docs/guide.md through test/support/pages.ts, and no map entry matching docs/guide.md lists test/a.test.ts",
      "test/b.test.ts reads docs/guide.md through test/support/pages.ts, and no map entry matching docs/guide.md lists test/b.test.ts",
    ]);
    expect(gapsWith(["test/a.test.ts", "test/b.test.ts"])).toEqual([]);
  });

  it("fails on a helper read no test file imports", () => {
    const sources = one(`export const page = read("docs/guide.md");`, "test/support/orphan.ts");

    expect(censusGaps({ sources, tracked: TRACKED, map: [], rules })).toEqual([
      "test/support/orphan.ts reads docs/guide.md, and no test file imports it, so no entry can name its test",
    ]);
  });

  it("fails on a refused glob literal, naming the source", () => {
    // Built at run time, so this file's own text holds no literal over the bound (review/73).
    const glob = `${["docs", "a", "b", "c", "d"].join("/**/")}/**/*.md`;
    const gaps = censusGaps({ sources: one(`glob("${glob}");`), tracked: TRACKED, map: [], rules });

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain(`test/a.test.ts holds the glob literal ${JSON.stringify(glob)}`);
  });
});

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const parsed = parseClassFile(readFileSync(posix.join(ROOT, ".stamity/change-classes.json"), "utf8"));
const map = parsed.ok ? parsed.testInputs : [];
const tracked = new Set(
  execFileSync("git", ["ls-files", "--cached", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter((path) => path !== ""),
);

describe("this repository's test-input map", () => {
  it("is in a valid class file", () => {
    expect(parsed.ok ? [] : parsed.errors).toEqual([]);
  });

  it("declares every read of every tracked test source", () => {
    const testGlobs = parsed.ok ? parsed.testGlobs : [];
    const sources = new Map<string, string>();
    for (const path of tracked) {
      if (!isTestSource(path, testGlobs) || !existsSync(posix.join(ROOT, path))) continue;
      sources.set(path, readFileSync(posix.join(ROOT, path), "utf8"));
    }
    const rules = parsed.ok ? mergeRules(BUILT_IN_RULES, parsed.rules) : BUILT_IN_RULES;

    expect(sources.size).toBeGreaterThan(100);
    expect(censusGaps({ sources, tracked, map, rules })).toEqual([]);
  }, 120_000);

  it("lists only tests that exist: a tracked test file, or a folder holding one", () => {
    const missing = map.flatMap((entry) =>
      entry.tests === "all"
        ? []
        : entry.tests.filter((test) => ![...tracked].some((path) => isTestFile(path) && (path === test || path.startsWith(`${test}/`)))),
    );

    expect(map.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it("selects every test for a corpus change, which CLI-spawning tests read outside the import graph", () => {
    expect(map).toContainEqual({ glob: under("content"), tests: "all" });
  });

  // review/65: a tests change selects the changed file and the map's matches, so the guard rides along.
  it("selects this guard for a change to any file under test/", () => {
    const guard = "test/ci/testInputsGuard.test.ts";

    expect(map.some((entry) => matchGlob("test/x/new.test.ts", entry.glob) && covers(entry, guard))).toBe(true);
  });

  const laneSuites = (lanes as Record<string, unknown>)["LANE_SUITES"] as Record<string, readonly string[]> | undefined;
  const lanePaths = (lanes as Record<string, unknown>)["LANE_PATHS"] as Record<string, readonly string[]>;

  // While records-only.mjs still spells its lanes' suites, the map gives each lane path that lane's suites, so CI's
  // lanes keep theirs when they read the map (p2c). After p2c the map is the one list, and there is nothing to compare.
  it.runIf(laneSuites !== undefined)("gives every lane path an entry listing that lane's suites", () => {
    const gaps: string[] = [];
    for (const [lane, patterns] of Object.entries(lanePaths)) {
      for (const pattern of patterns) {
        const entry = map.find((candidate) => candidate.glob === pattern);
        if (entry === undefined) {
          gaps.push(`${lane}: no entry for ${pattern}`);
          continue;
        }
        for (const suite of laneSuites?.[lane] ?? []) {
          if (!covers(entry, suite)) gaps.push(`${lane}: ${pattern} does not list ${suite}`);
        }
      }
    }
    expect(gaps).toEqual([]);
  });
});
