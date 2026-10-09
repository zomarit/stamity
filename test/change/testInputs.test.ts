import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractReadPaths, isTestSource, selectTests } from "../../src/change/testInputs.ts";

/**
 * p2b-test-inputs (REQ-FLOW-062): the declared reads of a test source and the
 * test selection a change gets.
 *
 * Pure module, no filesystem and no git: a test source is a string and the
 * tracked set is a list, so no double stands in for anything here. Every case
 * that expects a narrow selection asserts the named files AND `full: false`,
 * because `full: true` with no files is what every fail-safe branch returns: a
 * selector that selected nothing would pass any case expecting it. The last
 * block is the exception: it reads this repository's own test sources.
 */

const TRACKED = new Set([
  "docs/guide.md",
  "docs/specs/flow.md",
  "docs/img/logo.png",
  "website/index.html",
  "LICENSE",
  "src/x.ts",
  "test/a.test.ts",
]);

describe("extractReadPaths", () => {
  it("reads a string literal naming a tracked non-code file, in any quote", () => {
    const source = [
      `const a = readFileSync("docs/guide.md", "utf8");`,
      `const b = read('docs/specs/flow.md');`,
      "const c = read(`website/index.html`);",
    ].join("\n");

    expect(extractReadPaths(source, TRACKED)).toEqual(["docs/guide.md", "docs/specs/flow.md", "website/index.html"]);
  });

  it("does not read a scratch literal that names no tracked file", () => {
    const source = `await seed({ "content/x.md": "body", "docs/guide.md": "seeded" });`;

    expect(extractReadPaths(source, TRACKED)).toEqual(["docs/guide.md"]);
  });

  it("does not read a code file", () => {
    expect(extractReadPaths(`import "src/x.ts"; read("LICENSE");`, TRACKED)).toEqual(["LICENSE"]);
  });

  it("reads a path written relative to the test, its leading ./ and ../ segments dropped", () => {
    const source = `new URL("../../docs/guide.md", import.meta.url); read("./docs/specs/flow.md");`;

    expect(extractReadPaths(source, TRACKED)).toEqual(["docs/guide.md", "docs/specs/flow.md"]);
  });

  it("reads a glob literal as every tracked non-code file it matches", () => {
    // Fixture data kept out of the test-input census: the glob is built at run time, as a literal it names every docs page.
    const glob = ["docs/", "**/*", ".md"].join("");
    expect(extractReadPaths(`for (const page of glob("${glob}")) check(page);`, TRACKED)).toEqual([
      "docs/guide.md",
      "docs/specs/flow.md",
    ]);
  });

  // review/62, review/64 (signed off): a literal over the class file's cost bound gives no reads, so skipping it
  // could narrow the selection; it is refused instead, and the caller runs every test.
  it.each([
    // Built at run time, so this file's own text holds no literal over the bound, which would widen every selection.
    ["more than four **", `${["docs", "a", "b", "c", "d"].join("/**/")}/**/*.md`],
    ["longer than 200 characters", `docs/${"a".repeat(200)}/*.md`],
  ])("refuses a glob literal holding %s, naming it", (_label, glob) => {
    const result = extractReadPaths(`for (const page of glob("${glob}")) check(page);`, TRACKED);

    expect(result).toEqual({ refused: glob, error: expect.any(String) as string });
  });

  it("does not read a glob made only of wildcards, which names no path of its own", () => {
    expect(extractReadPaths(`expect(match("x", "**")).toBe(true); match("y", "**/*");`, TRACKED)).toEqual([]);
  });

  it("keeps a literal that follows an apostrophe inside another string", () => {
    const source = `it("doesn't drift", () => read('docs/guide.md'));`;

    expect(extractReadPaths(source, TRACKED)).toEqual(["docs/guide.md"]);
  });

  it("does not read a path a comment line names", () => {
    const source = ["/**", " * Pins `docs/guide.md` and \"docs/specs/flow.md\".", " */", "// see 'LICENSE'"].join("\n");

    expect(extractReadPaths(source, TRACKED)).toEqual([]);
  });
});

describe("isTestSource", () => {
  it("is a code file under a test glob, helpers included", () => {
    expect(isTestSource("test/a.test.ts", [])).toBe(true);
    expect(isTestSource("test/support.ts", [])).toBe(true);
    expect(isTestSource("test/fixtures/page.md", [])).toBe(false);
    expect(isTestSource("src/x.ts", [])).toBe(false);
    expect(isTestSource("evals/check.ts", ["evals/**"])).toBe(true);
  });
});

// TEST CHANGE, justified: 2026-10-09, review/66 (signed off) — the input no longer carries the class file's test
// globs (rule (1) binds the built-in ones only), so the cases pass the input as it is, with no helper filling them.
describe("selectTests", () => {
  const MAP = [
    // Fixture data kept out of the test-input census: the globs are built at run time, as literals they name every docs and site file.
    { glob: ["docs", "**"].join("/"), tests: ["test/docsPages.test.ts"] },
    { glob: ["website", "**"].join("/"), tests: ["test/site.test.ts", "test/docsPages.test.ts"] },
  ];

  it("selects the tests the map lists for a changed docs page, not zero", () => {
    const selection = selectTests({ paths: ["docs/guide.md"], class: "docs", map: MAP });

    expect(selection).toMatchObject({ full: false, files: ["test/docsPages.test.ts"] });
  });

  it("unions every matching entry, each test once, sorted", () => {
    const selection = selectTests({ paths: ["docs/guide.md", "website/index.html"], class: "docs", map: MAP });

    expect(selection).toMatchObject({ full: false, files: ["test/docsPages.test.ts", "test/site.test.ts"] });
  });

  it("adds a test whose source names a changed page that no entry lists", () => {
    const selection = selectTests(
      {
        paths: ["notes/plan.md"],
        class: "docs",
        map: MAP,
        testSources: [
          { test: "test/notes.test.ts", reads: ["notes/plan.md"] },
          { test: "test/other.test.ts", reads: ["notes/other.md"] },
        ],
      },
    );

    expect(selection).toMatchObject({ full: false, files: ["test/notes.test.ts"] });
  });

  it("selects zero for a docs file no test names, and does not run every test", () => {
    const selection = selectTests({ paths: ["notes/plan.md"], class: "docs", map: MAP, testSources: [] });

    expect(selection).toMatchObject({ full: false, files: [] });
    expect(selection.reason).toContain("no test");
  });

  it("selects zero for a records change no test names", () => {
    expect(selectTests({ paths: [".stamity/runs/x/ledger.jsonl"], class: "records", map: MAP })).toMatchObject({
      full: false,
      files: [],
    });
  });

  // review/60 (signed off): from config up every class runs the full gates, so its selection is every test,
  // even where the map, a test source or a changed test file would select a few.
  it.each(["config", "product", "public-contract", "security-sensitive"] as const)(
    "runs every test for a %s change, even with a narrow selection at hand",
    (cls) => {
      const selection = selectTests(
        {
          paths: ["src/auth/login.ts", "test/auth/login.test.ts", "docs/guide.md"],
          class: cls,
          map: MAP,
          testSources: [{ test: "test/a.test.ts", reads: ["docs/guide.md"] }],
        },
      );

      expect(selection).toMatchObject({ full: true, files: [] });
      expect(selection.reason).toContain(`a ${cls} change`);
    },
  );

  // review/61 (signed off): every name bound for files passes the map entries' argument check, or every test runs.
  it.each([
    ["a changed test file led by -", { paths: ["--bail.test.ts"] }, "--bail.test.ts"],
    ["a changed test file holding a space", { paths: ["test/a b.test.ts"] }, "test/a b.test.ts"],
    ["a changed test file holding a glob character", { paths: ["test/[a].test.ts"] }, "test/[a].test.ts"],
    ["a changed test file with a .. segment", { paths: ["test/../../x.test.ts"] }, "test/../../x.test.ts"],
    [
      "a test source led by - that names a changed page",
      { paths: ["docs/x.md"], testSources: [{ test: "-r.test.ts", reads: ["docs/x.md"] }] },
      "-r.test.ts",
    ],
  ])("runs every test when %s would reach the runner, naming it", (_label, overrides, named) => {
    const selection = selectTests({ class: "tests", map: MAP, ...overrides });

    expect(selection).toMatchObject({ full: true, files: [] });
    expect(selection.reason).toContain(named);
  });

  it("runs every test for a product path with zero selected", () => {
    const selection = selectTests({ paths: ["src/x.ts"], class: "product", map: MAP });

    expect(selection).toMatchObject({ full: true, files: [] });
    expect(selection.reason).toContain("product");
  });

  it("runs every test with no map (S4), even where a source names the path", () => {
    const selection = selectTests(
      { paths: ["docs/guide.md"], class: "docs", testSources: [{ test: "test/a.test.ts", reads: ["docs/guide.md"] }] },
    );

    expect(selection).toMatchObject({ full: true, files: [] });
    // review/67: no map read covers no base, an unresolved base, a refused copy and a base with none; the reason fits all.
    expect(selection.reason).toBe("no test-input map was read from the base, so every test runs");
  });

  it("reads an empty map as no map", () => {
    expect(selectTests({ paths: ["docs/guide.md"], class: "docs", map: [] }).full).toBe(true);
  });

  it("runs every test for a changed helper under a test glob", () => {
    const selection = selectTests({ paths: ["docs/guide.md", "test/support.ts"], class: "tests", map: MAP });

    expect(selection).toMatchObject({ full: true, files: [] });
    expect(selection.reason).toContain("test/support.ts");
  });

  /*
   * TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, review/66 (signed off). This pinned every
   * test for a fixture under a class-file test glob (`evals/**`). Rule (1) now binds the built-in test globs only,
   * so a path the class file places in tests follows the map: an entry selects its tests, and none selected for
   * a tests change still runs every test.
   */
  it("lets the map select for a path under a test glob the class file adds", () => {
    const map = [...MAP, { glob: "evals/cases/**", tests: ["test/evals.test.ts"] }];
    const selection = selectTests({ paths: ["evals/cases/x.md"], class: "tests", map });

    expect(selection).toMatchObject({ full: false, files: ["test/evals.test.ts"] });
  });

  it("runs every test for a tests change under a class-file test glob that no entry selects", () => {
    const selection = selectTests({ paths: ["evals/cases/x.md"], class: "tests", map: MAP });

    expect(selection).toMatchObject({ full: true, files: [] });
    expect(selection.reason).toContain("no test was selected for a tests change");
  });

  it("keeps rule (1) for a helper under a built-in test glob", () => {
    expect(selectTests({ paths: ["test/support.ts"], class: "tests", map: MAP }).full).toBe(true);
  });

  it("runs every test when a matching entry says all", () => {
    const selection = selectTests(
      // TEST CHANGE, justified: 2026-10-09, review/60 — a product change now runs every test by its class before any
      // entry is read, so the all entry is shown on a docs change (was product).
      { paths: ["content/commands/st-work.md"], class: "docs", map: [...MAP, { glob: "content/**", tests: "all" }] },
    );

    expect(selection).toMatchObject({ full: true, files: [] });
    expect(selection.reason).toContain("content/**");
  });

  it("does not run every test for an all entry no changed path matches", () => {
    const selection = selectTests(
      { paths: ["docs/guide.md"], class: "docs", map: [...MAP, { glob: "content/**", tests: "all" }] },
    );

    expect(selection).toMatchObject({ full: false, files: ["test/docsPages.test.ts"] });
  });

  it("selects a changed test file itself", () => {
    const selection = selectTests({ paths: ["test/a.test.ts"], class: "tests", map: MAP });

    expect(selection).toMatchObject({ full: false, files: ["test/a.test.ts"] });
  });

  it("runs every test when a helper's source names a changed path, since no importer of it can be named", () => {
    const selection = selectTests(
      {
        paths: ["docs/guide.md"],
        class: "docs",
        map: MAP,
        testSources: [{ test: "test/support/pages.ts", reads: ["docs/guide.md"] }],
      },
    );

    expect(selection.full).toBe(true);
    expect(selection.reason).toContain("test/support/pages.ts");
  });
});

// review/73: one refused literal in any test source makes every selection here full (review/62), so none may hold one.
describe("this repository's test sources", () => {
  it("hold no glob literal over the cost bound", () => {
    const root = new URL("../../", import.meta.url);
    const refused: string[] = [];
    for (const top of ["test", "evals"]) {
      for (const entry of readdirSync(new URL(`${top}/`, root), { recursive: true, encoding: "utf8" })) {
        const path = `${top}/${entry.replaceAll("\\", "/")}`;
        if (!isTestSource(path, ["test/**", "evals/**"])) continue;
        const result = extractReadPaths(readFileSync(new URL(path, root), "utf8"), new Set());
        if (!Array.isArray(result)) refused.push(`${path}: ${result.refused} ${result.error}`);
      }
    }
    expect(refused).toEqual([]);
  });
});
