import { describe, expect, it } from "vitest";
import { autoShipVerdict, type AutoShipFacts, type AutoShipRules, type AutoShipVerdict } from "../../src/change/autoShip.ts";
import { classifyChange, type ClassifyResult } from "../../src/change/classify.ts";

/**
 * auto-ship-rules (REQ-FLOW-152): whether a change fits the declared rules for
 * merging onto a deploying branch with nobody asked.
 *
 * Pure module, so no double stands in for anything: each `ClassifyResult` comes
 * from the real classifier over git names, and a case that needs a result the
 * built-in rules cannot give spreads one of those. Every refusal asserts the whole
 * reason list, so a rule that fired twice, or one that stayed silent, fails.
 */

// Fixture data kept out of the test-input census: these globs are built at run time, as literals they name this repository's docs and .md files.
const DOCS_GLOB = ["docs", "**"].join("/");
const ANY_MD_GLOB = ["**/*", "md"].join(".");

/** The preset `config set autonomy.autoShip low-risk` writes. */
const LOW_RISK: AutoShipRules = { maxFiles: 10, maxLines: 200, classes: ["records", "docs", "tests"] };

const classified = (...paths: string[]): ClassifyResult => classifyChange({ paths, base: "given", source: "git" });

const DOCS = classified("docs/a.md", "docs/b.md", "docs/c.md");

/** A docs change of `count` files, so a size case keeps `files` and `byPath` in step. */
const docsOf = (count: number): ClassifyResult => classified(...Array.from({ length: count }, (_, index) => `docs/${index}.md`));

const facts = (over: Partial<AutoShipFacts> = {}): AutoShipFacts => ({ result: DOCS, files: 3, lines: 40, complete: true, ...over });

const refused = (...reasons: string[]): AutoShipVerdict => ({ eligible: false, reasons });

describe("autoShipVerdict (REQ-FLOW-152)", () => {
  it("lets a docs-only change of 3 files and 40 lines ship under low-risk, the evidence naming each rule it met", () => {
    expect(autoShipVerdict(facts(), LOW_RISK)).toEqual({
      eligible: true,
      evidence: "auto-ship rules met: 3 of at most 10 files; 40 of at most 200 lines; class docs among records, docs, tests; no specialist lens",
    });
  });

  it("holds a change sitting exactly on both limits as eligible", () => {
    expect(autoShipVerdict(facts({ result: docsOf(10), files: 10, lines: 200 }), LOW_RISK).eligible).toBe(true);
  });

  it("names the path limit it met when the rules carry one", () => {
    expect(autoShipVerdict(facts(), { ...LOW_RISK, paths: ["site-notes/**", DOCS_GLOB] })).toEqual({
      eligible: true,
      evidence:
        "auto-ship rules met: 3 of at most 10 files; 40 of at most 200 lines; class docs among records, docs, tests; every path under site-notes/**, docs/**; no specialist lens",
    });
  });

  it.each<[string, Partial<AutoShipFacts>, AutoShipRules, string]>([
    ["11 files", { result: docsOf(11), files: 11 }, LOW_RISK, "11 files are over autonomy.autoShip.maxFiles (10)"],
    ["201 lines", { lines: 201 }, LOW_RISK, "201 lines are over autonomy.autoShip.maxLines (200)"],
    ["a product class", { result: classified("src/a.ts"), files: 1 }, LOW_RISK, "product is outside autonomy.autoShip.classes (records, docs, tests)"],
    ["a path outside paths", {}, { ...LOW_RISK, paths: ["docs/a.md", "docs/b.md"] }, "docs/c.md is outside autonomy.autoShip.paths"],
    ["a non-empty lenses", { result: { ...DOCS, lenses: ["security", "ux"] } }, LOW_RISK, "a specialist lens is asked for: security, ux"],
  ])("gives one named reason for %s", (_name, over, rules, reason) => {
    expect(autoShipVerdict(facts(over), rules)).toEqual(refused(reason));
  });

  it("is not eligible with no rules, whatever the change", () => {
    expect(autoShipVerdict(facts(), null)).toEqual(refused("autonomy.autoShip is off"));
  });

  it("names an unknown line count and an incomplete classification apart, and both when both hold", () => {
    expect(autoShipVerdict(facts({ lines: null }), LOW_RISK)).toEqual(refused("the line count is incomplete"));
    expect(autoShipVerdict(facts({ complete: false }), LOW_RISK)).toEqual(refused("the classification is incomplete"));
    expect(autoShipVerdict(facts({ lines: null, complete: false }), LOW_RISK)).toEqual(
      refused("the classification is incomplete", "the line count is incomplete"),
    );
  });

  it("refuses an empty change by its own check, even when the rules admit the product class it reads as", () => {
    const empty = classified();
    expect(empty.class).toBe("product");
    expect(empty.byPath).toEqual([]);
    const rules = { ...LOW_RISK, classes: ["product"] };
    expect(autoShipVerdict(facts({ result: empty, files: 0, lines: 0 }), rules)).toEqual(refused("the change is empty"));
    expect(autoShipVerdict(facts({ result: empty, files: 0, lines: 0 }), LOW_RISK)).toEqual(refused("the change is empty"));
    // A count that claims files while the classifier saw none is as empty: nothing was classified.
    expect(autoShipVerdict(facts({ result: empty, files: 2 }), rules)).toEqual(refused("the change is empty"));
    // And a count of none beside named paths: the two reads disagree, so nothing vouches for the change.
    expect(autoShipVerdict(facts({ files: 0 }), LOW_RISK)).toEqual(refused("the change is empty"));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("reads a line count of %s as not eligible, in one named reason", (lines) => {
    expect(autoShipVerdict(facts({ lines }), LOW_RISK)).toEqual(refused("the line count is not a finite number"));
  });

  describe("the file count must agree with the paths classified", () => {
    it.each<[string, number, string]>([
      ["fewer files than paths", 2, "the file count (2) disagrees with the classified paths (3)"],
      ["more files than paths", 4, "the file count (4) disagrees with the classified paths (3)"],
      ["a count that is no number", Number.NaN, "the file count (NaN) disagrees with the classified paths (3)"],
    ])("refuses %s", (_name, files, reason) => {
      expect(autoShipVerdict(facts({ files }), LOW_RISK)).toEqual(refused(reason));
    });

    it("gives both reasons for a count that disagrees and is over the limit", () => {
      expect(autoShipVerdict(facts({ files: 11 }), LOW_RISK)).toEqual(
        refused("the file count (11) disagrees with the classified paths (3)", "11 files are over autonomy.autoShip.maxFiles (10)"),
      );
    });

    it("reads a rename as its two paths, so a range counting it once does not agree", () => {
      const result = classifyChange({ paths: [], renames: [{ from: "docs/a.md", to: "docs/b.md" }], base: "given", source: "git" });
      expect(autoShipVerdict(facts({ result, files: 2 }), LOW_RISK).eligible).toBe(true);
      expect(autoShipVerdict(facts({ result, files: 1 }), LOW_RISK)).toEqual(refused("the file count (1) disagrees with the classified paths (2)"));
    });
  });

  describe("the docs class means plain text, under any rules", () => {
    const notPlain = (named: string): string => `${named} is docs-class but not plain text (.md, .txt)`;

    it.each(["docs/index.html", "docs/logo.svg", "docs/page.mdx", "docs/main.tf", "docs/AUTHORS", "docs/a.md.html"])("refuses %s, which reads docs with no lens", (path) => {
      const result = classified(path);
      expect(result.class).toBe("docs");
      expect(result.lenses).toEqual([]);
      expect(autoShipVerdict(facts({ result, files: 1 }), LOW_RISK)).toEqual(refused(notPlain(path)));
    });

    it.each(["docs/notes.txt", "docs/NOTES.MD", "docs/Notes.Txt"])("lets %s ship, matching the ending lower-cased", (path) => {
      const result = classified(path);
      expect(result.class).toBe("docs");
      expect(autoShipVerdict(facts({ result, files: 1 }), LOW_RISK).eligible).toBe(true);
    });

    it("holds under rules that name the file itself, not only under the preset", () => {
      const result = classified("docs/index.html");
      const rules = { maxFiles: 1000, maxLines: 100000, classes: ["docs"], paths: ["docs/index.html"] };
      expect(autoShipVerdict(facts({ result, files: 1 }), rules)).toEqual(refused(notPlain("docs/index.html")));
    });

    it("reads a rename's two sides, so a page cannot arrive or leave as a text file", () => {
      const into = classifyChange({ paths: [], renames: [{ from: "docs/a.md", to: "docs/a.html" }], base: "given", source: "git" });
      const outOf = classifyChange({ paths: [], renames: [{ from: "docs/a.html", to: "docs/a.md" }], base: "given", source: "git" });
      expect(autoShipVerdict(facts({ result: into, files: 2 }), LOW_RISK)).toEqual(refused(notPlain("docs/a.html")));
      expect(autoShipVerdict(facts({ result: outOf, files: 2 }), LOW_RISK)).toEqual(refused(notPlain("docs/a.html")));
    });

    it("reads only docs-class paths: a record of any type still ships", () => {
      const result = classified("docs/a.md", ".stamity/runs/x/a.log");
      expect(result.byPath.map((entry) => entry.class)).toEqual(["docs", "records"]);
      expect(autoShipVerdict(facts({ result, files: 2 }), LOW_RISK).eligible).toBe(true);
    });

    it("names every path when no more than five are not plain text", () => {
      const result = classified("docs/a.html", "docs/b.svg", "docs/c.md");
      expect(autoShipVerdict(facts({ result, files: 3 }), LOW_RISK)).toEqual(refused("docs/a.html, docs/b.svg are docs-class but not plain text (.md, .txt)"));
    });

    it("names five paths and counts the rest", () => {
      const result = classified("docs/1.html", "docs/2.html", "docs/3.html", "docs/4.html", "docs/5.html", "docs/6.html", "docs/7.html");
      expect(autoShipVerdict(facts({ result, files: 7 }), LOW_RISK)).toEqual(
        refused("docs/1.html, docs/2.html, docs/3.html, docs/4.html, docs/5.html and 2 more are docs-class but not plain text (.md, .txt)"),
      );
    });
  });

  it("returns every failed rule, not the first", () => {
    const result = { ...classified("src/a.ts"), lenses: ["security"] };
    expect(autoShipVerdict({ result, files: 11, lines: null, complete: false }, { ...LOW_RISK, paths: [DOCS_GLOB] })).toEqual(
      refused(
        "the classification is incomplete",
        "the line count is incomplete",
        "the file count (11) disagrees with the classified paths (1)",
        "11 files are over autonomy.autoShip.maxFiles (10)",
        "product is outside autonomy.autoShip.classes (records, docs, tests)",
        "src/a.ts is outside autonomy.autoShip.paths",
        "a specialist lens is asked for: security",
      ),
    );
  });

  describe("the class rule reads the change's class and every path's, in one reason", () => {
    it("refuses a class raised above every path: a rename crossing docs and records reads product", () => {
      const result = classifyChange({ paths: [], renames: [{ from: "docs/a.md", to: ".stamity/runs/x/a.md" }], base: "given", source: "git" });
      expect(result.class).toBe("product");
      expect(result.byPath.map((entry) => entry.class)).toEqual(["docs", "records"]);
      expect(autoShipVerdict(facts({ result, files: 2 }), LOW_RISK)).toEqual(refused("product is outside autonomy.autoShip.classes (records, docs, tests)"));
    });

    it("refuses a path weaker than the change's class when its class is not named", () => {
      const result = classified("src/a.ts", "docs/a.md");
      expect(result.class).toBe("product");
      expect(autoShipVerdict(facts({ result, files: 2 }), { ...LOW_RISK, classes: ["product"] })).toEqual(refused("docs is outside autonomy.autoShip.classes (product)"));
    });

    it("names each class outside the list once, in one reason", () => {
      const result = classified("src/a.ts", "src/b.ts", "package.json", "docs/a.md");
      expect(autoShipVerdict(facts({ result, files: 4 }), { ...LOW_RISK, classes: ["docs"] })).toEqual(
        refused("security-sensitive, product are outside autonomy.autoShip.classes (docs)", "a specialist lens is asked for: stamity-security"),
      );
    });

    it("lets several named classes ship, naming them all", () => {
      const result = classified("docs/a.md", ".stamity/runs/x/a.md");
      expect(autoShipVerdict(facts({ result, files: 2 }), LOW_RISK)).toEqual({
        eligible: true,
        evidence: "auto-ship rules met: 2 of at most 10 files; 40 of at most 200 lines; class docs, records among records, docs, tests; no specialist lens",
      });
    });
  });

  describe("the path rule", () => {
    // Each path outside docs/ reads product under the built-in rules, so product is named here and the path rule stands alone.
    const INSIDE_DOCS: AutoShipRules = { ...LOW_RISK, classes: ["docs", "product"], paths: [DOCS_GLOB] };

    it("reads a rename's two sides, so a change cannot leave the limit by moving a file out of it", () => {
      const result = classifyChange({ paths: [], renames: [{ from: "docs/a.md", to: "site-notes/a.md" }], base: "given", source: "git" });
      const verdict = autoShipVerdict(facts({ result, files: 2 }), INSIDE_DOCS);
      expect(verdict).toEqual(refused("site-notes/a.md is outside autonomy.autoShip.paths"));
    });

    it("does not widen a limit by case: DOCS/a.md is outside docs/**", () => {
      const verdict = autoShipVerdict(facts({ result: classified("DOCS/a.md"), files: 1 }), INSIDE_DOCS);
      expect(verdict).toEqual(refused("DOCS/a.md is outside autonomy.autoShip.paths"));
    });

    it("reads a git name literally: a backslash in docs\\a.md is a filename character, not a separator", () => {
      const verdict = autoShipVerdict(facts({ result: classified("docs\\a.md"), files: 1 }), INSIDE_DOCS);
      expect(verdict).toEqual(refused("docs\\a.md is outside autonomy.autoShip.paths"));
    });

    it("matches a root file through a leading **/", () => {
      const verdict = autoShipVerdict(facts({ result: classified("a.md"), files: 1 }), { ...LOW_RISK, paths: [ANY_MD_GLOB] });
      expect(verdict.eligible).toBe(true);
    });

    it("admits nothing under an empty list", () => {
      expect(autoShipVerdict(facts({ result: classified("docs/a.md"), files: 1 }), { ...LOW_RISK, paths: [] })).toEqual(refused("docs/a.md is outside autonomy.autoShip.paths"));
    });

    it("names every path when no more than five fall outside", () => {
      const result = classified("a/1.md", "a/2.md", "docs/a.md");
      expect(autoShipVerdict(facts({ result, files: 3 }), INSIDE_DOCS)).toEqual(refused("a/1.md, a/2.md are outside autonomy.autoShip.paths"));
    });

    it("names five paths and counts the rest", () => {
      const result = classified("a/1.md", "a/2.md", "a/3.md", "a/4.md", "a/5.md", "a/6.md", "a/7.md");
      expect(autoShipVerdict(facts({ result, files: 7 }), INSIDE_DOCS)).toEqual(
        refused("a/1.md, a/2.md, a/3.md, a/4.md, a/5.md and 2 more are outside autonomy.autoShip.paths"),
      );
    });
  });
});
