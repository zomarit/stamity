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
import { extractReadPaths, isTestSource, selectTests, type TestInputEntry } from "../../src/change/testInputs.ts";
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
 * built-in test glob needs no entry of its own: a changed helper or fixture there runs every test
 * (rule (1), review/66), and a changed test file runs itself plus the `test/**` entry, which lists
 * this guard and the whole-tree scanners that read test files at run time (p2d security W-1). A glob
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

/**
 * `<folder>/**`, built at run time: written as a literal, a folder glob here would make this file a
 * declared reader of every tracked file under that folder (review/68), which the map would then have to list.
 */
function under(folder: string): string {
  return [folder, "**"].join("/");
}

const testFiles = new Map<string, boolean>();

/**
 * A test file as {@link selectTests} splits them (p2d M-1): changed alone, a test file is selected by
 * name, while a helper or fixture runs every test and any other path selects nothing. The module keeps
 * its test-file globs private, so the guard asks it rather than spelling a second copy that could drift.
 */
function isTestFile(path: string): boolean {
  let answer = testFiles.get(path);
  if (answer === undefined) {
    const map = [{ glob: under("never-a-changed-path"), tests: [] }];
    answer = selectTests({ paths: [path], class: "tests", map }).files.includes(path);
    testFiles.set(path, answer);
  }
  return answer;
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

  // p2d security W-1: a tests change selects only itself and the test/** entry, so the scanners that walk the whole
  // tree (private-layer ids, reserved names, emails, canonical literals) ride on that entry, and an evals change keeps them.
  it("selects the whole-tree scanners for a change under test/ or evals/", () => {
    const scanners = ["test/ci/leakGate.test.ts", "test/docsPages.test.ts", "test/ci/forkIdentity.test.ts"];
    for (const path of ["test/x/new.test.ts", "evals/x/new.md"]) {
      const matching = map.filter((entry) => matchGlob(path, entry.glob));
      for (const scanner of scanners) {
        expect(
          matching.some((entry) => covers(entry, scanner)),
          `${scanner} for ${path}`,
        ).toBe(true);
      }
    }
  });

  // p2d W-1 (option a): the census reads the tracked set, so a records or docs change that adds a file an existing
  // test string names opens a gap. Every entry such a path matches lists this guard, so the gap fails on that change,
  // whether the selection unions the matching entries or takes one of them (review/77).
  it("selects this guard from every entry a records or docs path matches", () => {
    const guard = "test/ci/testInputsGuard.test.ts";
    const rules = parsed.ok ? mergeRules(BUILT_IN_RULES, parsed.rules) : BUILT_IN_RULES;
    const gaps = new Set<string>();
    let narrowed = 0;
    for (const path of tracked) {
      const cls = classifyChange({ paths: [path], base: "given" }, rules).class;
      if (cls !== "records" && cls !== "docs") continue;
      narrowed += 1;
      const matching = map.filter((entry) => matchGlob(path, entry.glob));
      if (matching.length === 0) gaps.add(`no entry matches ${path}`);
      for (const entry of matching) if (!covers(entry, guard)) gaps.add(`${entry.glob} does not list ${guard}`);
    }

    expect(narrowed).toBeGreaterThan(0);
    expect([...gaps].toSorted()).toEqual([]);
  });

  const laneOf = (lanes as Record<string, unknown>)["laneOf"] as (path: string) => string | null;
  const decide = (lanes as Record<string, unknown>)["decide"] as (input: {
    event: string;
    base: string;
    paths: readonly string[];
    map: readonly TestInputEntry[] | null;
  }) => { full: boolean; suites: readonly string[]; reason: string };

  // TEST CHANGE, justified (2026-10-09, run 2026-10-08_product-core, unit p2c-ci-lanes-from-map, build/45): this case
  // compared each lane pattern's entry with `LANE_SUITES` and ran only while the classifier exported it, so p2c's removal
  // would have skipped it silently. The map is now the one list CI's lanes read, so the case reads the map through the
  // lanes' own `decide`: every tracked path in a lane takes a narrow answer (an entry matches it and none says "all"),
  // and its suites are the ones `selectTests` gives it (review/77, the union). The per-lane floor of the suites
  // `LANE_SUITES` listed is pinned in `recordsOnly.test.ts`.
  it("gives every tracked lane path a narrow lane answer from the map, the suites selectTests gives it", () => {
    const gaps: string[] = [];
    let laned = 0;
    for (const path of tracked) {
      if (laneOf(path) === null) continue;
      laned += 1;
      const decision = decide({ event: "pull_request", base: "a".repeat(40), paths: [path], map });
      if (decision.full) {
        gaps.push(`${path}: ${decision.reason}`);
        continue;
      }
      const selected = selectTests({ paths: [path], class: "records", map }).files;
      if (decision.suites.join(" ") !== selected.join(" ")) gaps.push(`${path}: lanes ${decision.suites.join(" ")} != ${selected.join(" ")}`);
    }

    expect(laned).toBeGreaterThan(100);
    expect(gaps).toEqual([]);
  });

  // ADDED by run 2026-10-08_product-core, unit p2c-ci-lanes-from-map (the close-list notes of p2d-security-r1 and
  // lanea-security-r5): the leak gate walks the whole tree, so `extractReadPaths` cannot derive it and a regenerated map
  // could drop it with the census still green. Every entry a records or docs path matches carries both whole-tree
  // leak-gate suites, so neither a narrow local selection nor a CI lane skips the gate on such a change.
  it("lists both whole-tree leak-gate suites on every entry a records or docs path matches", () => {
    const leakGate = ["test/ci/leakGate.test.ts", "test/docsPages.test.ts"];
    const rules = parsed.ok ? mergeRules(BUILT_IN_RULES, parsed.rules) : BUILT_IN_RULES;
    const gaps = new Set<string>();
    const entries = new Set<string>();
    for (const path of tracked) {
      const cls = classifyChange({ paths: [path], base: "given" }, rules).class;
      if (cls !== "records" && cls !== "docs") continue;
      for (const entry of map.filter((candidate) => matchGlob(path, candidate.glob))) {
        entries.add(entry.glob);
        for (const suite of leakGate) if (!covers(entry, suite)) gaps.add(`${entry.glob} does not list ${suite}`);
      }
    }

    expect(entries.size).toBeGreaterThan(3);
    expect([...gaps].toSorted()).toEqual([]);
  });
});
