import { describe, expect, it } from "vitest";
import { BUILT_IN_TEST_GLOBS } from "../../src/change/classify.ts";
import { extractReadPaths, isTestSource, selectTests, type TestSelectionInput } from "../../src/change/testInputs.ts";

/**
 * p2b-test-inputs (REQ-FLOW-062): the declared reads of a test source and the
 * test selection a change gets.
 *
 * Pure module, no filesystem and no git: a test source is a string and the
 * tracked set is a list, so no double stands in for anything here. Every case
 * that expects a narrow selection asserts the named files AND `full: false`,
 * because `full: true` with no files is what every fail-safe branch returns: a
 * selector that selected nothing would pass any case expecting it.
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

/** A selection input over the built-in test globs; each case names only what it varies. */
function input(overrides: Partial<TestSelectionInput> & Pick<TestSelectionInput, "paths" | "class">): TestSelectionInput {
  return { testGlobs: BUILT_IN_TEST_GLOBS, ...overrides };
}

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

  it("does not read a code file, which the import graph reaches", () => {
    expect(extractReadPaths(`import "src/x.ts"; read("LICENSE");`, TRACKED)).toEqual(["LICENSE"]);
  });

  it("reads a path written relative to the test, its leading ./ and ../ segments dropped", () => {
    const source = `new URL("../../docs/guide.md", import.meta.url); read("./docs/specs/flow.md");`;

    expect(extractReadPaths(source, TRACKED)).toEqual(["docs/guide.md", "docs/specs/flow.md"]);
  });

  it("reads a glob literal as every tracked non-code file it matches", () => {
    expect(extractReadPaths(`for (const page of glob("docs/**/*.md")) check(page);`, TRACKED)).toEqual([
      "docs/guide.md",
      "docs/specs/flow.md",
    ]);
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

describe("selectTests", () => {
  const MAP = [
    { glob: "docs/**", tests: ["test/docsPages.test.ts"] },
    { glob: "website/**", tests: ["test/site.test.ts", "test/docsPages.test.ts"] },
  ];

  it("selects the tests the map lists for a changed docs page, not zero", () => {
    const selection = selectTests(input({ paths: ["docs/guide.md"], class: "docs", map: MAP }));

    expect(selection).toMatchObject({ full: false, files: ["test/docsPages.test.ts"] });
  });

  it("unions every matching entry, each test once, sorted", () => {
    const selection = selectTests(input({ paths: ["docs/guide.md", "website/index.html"], class: "docs", map: MAP }));

    expect(selection).toMatchObject({ full: false, files: ["test/docsPages.test.ts", "test/site.test.ts"] });
  });

  it("adds a test whose source names a changed page that no entry lists", () => {
    const selection = selectTests(
      input({
        paths: ["notes/plan.md"],
        class: "docs",
        map: MAP,
        testSources: [
          { test: "test/notes.test.ts", reads: ["notes/plan.md"] },
          { test: "test/other.test.ts", reads: ["notes/other.md"] },
        ],
      }),
    );

    expect(selection).toMatchObject({ full: false, files: ["test/notes.test.ts"] });
  });

  it("selects zero for a docs file no test names, and does not run every test", () => {
    const selection = selectTests(input({ paths: ["notes/plan.md"], class: "docs", map: MAP, testSources: [] }));

    expect(selection).toMatchObject({ full: false, files: [] });
    expect(selection.reason).toContain("no test");
  });

  it("selects zero for a records change no test names", () => {
    expect(selectTests(input({ paths: [".stamity/runs/x/ledger.jsonl"], class: "records", map: MAP }))).toMatchObject({
      full: false,
      files: [],
    });
  });

  it("runs every test for a product path with zero selected", () => {
    const selection = selectTests(input({ paths: ["src/x.ts"], class: "product", map: MAP }));

    expect(selection).toMatchObject({ full: true, files: [] });
    expect(selection.reason).toContain("product");
  });

  it("runs every test with no map (S4), even where a source names the path", () => {
    const selection = selectTests(
      input({ paths: ["docs/guide.md"], class: "docs", testSources: [{ test: "test/a.test.ts", reads: ["docs/guide.md"] }] }),
    );

    expect(selection).toMatchObject({ full: true, files: [] });
    expect(selection.reason).toContain("no test-input map");
  });

  it("reads an empty map as no map", () => {
    expect(selectTests(input({ paths: ["docs/guide.md"], class: "docs", map: [] })).full).toBe(true);
  });

  it("runs every test for a changed helper under a test glob", () => {
    const selection = selectTests(input({ paths: ["docs/guide.md", "test/support.ts"], class: "tests", map: MAP }));

    expect(selection).toMatchObject({ full: true, files: [] });
    expect(selection.reason).toContain("test/support.ts");
  });

  it("runs every test for a changed fixture under a test glob the class file adds", () => {
    const selection = selectTests(input({ paths: ["evals/cases/x.md"], class: "tests", map: MAP, testGlobs: ["evals/**"] }));

    expect(selection.full).toBe(true);
    expect(selection.reason).toContain("evals/cases/x.md");
  });

  it("keeps the built-in test globs whatever globs the caller passes", () => {
    expect(selectTests(input({ paths: ["test/support.ts"], class: "tests", map: MAP, testGlobs: [] })).full).toBe(true);
  });

  it("runs every test when a matching entry says all", () => {
    const selection = selectTests(
      input({ paths: ["content/commands/st-work.md"], class: "product", map: [...MAP, { glob: "content/**", tests: "all" }] }),
    );

    expect(selection).toMatchObject({ full: true, files: [] });
    expect(selection.reason).toContain("content/**");
  });

  it("does not run every test for an all entry no changed path matches", () => {
    const selection = selectTests(
      input({ paths: ["docs/guide.md"], class: "docs", map: [...MAP, { glob: "content/**", tests: "all" }] }),
    );

    expect(selection).toMatchObject({ full: false, files: ["test/docsPages.test.ts"] });
  });

  it("selects a changed test file itself", () => {
    const selection = selectTests(input({ paths: ["test/a.test.ts"], class: "tests", map: MAP }));

    expect(selection).toMatchObject({ full: false, files: ["test/a.test.ts"] });
  });

  it("runs every test when a helper's source names a changed path, since no importer of it can be named", () => {
    const selection = selectTests(
      input({
        paths: ["docs/guide.md"],
        class: "docs",
        map: MAP,
        testSources: [{ test: "test/support/pages.ts", reads: ["docs/guide.md"] }],
      }),
    );

    expect(selection.full).toBe(true);
    expect(selection.reason).toContain("test/support/pages.ts");
  });
});
