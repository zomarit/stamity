import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  facetOf,
  filterByLanguages,
  isContextTag,
  isFloorTag,
  isLanguageTag,
  languageOf,
  primaryTag,
  tagsByFacet,
  type TagFacet,
  type Tagged,
} from "../../src/content/tags.ts";

interface Item extends Tagged {
  id: string;
}

const item = (id: string, ...tags: string[]): Item => ({ id, tags });
const ids = (items: readonly Item[]): string[] => items.map((i) => i.id);

describe("facet classification", () => {
  const CASES: readonly (readonly [string, TagFacet])[] = [
    ["implementation", "capability"],
    ["review", "capability"],
    ["ctx:team-only", "context"],
    ["floor:security", "floor"],
    ["lang:python", "language"],
  ];

  it("covers all four facets, defaulting to capability for bare tags", () => {
    for (const [tag, facet] of CASES) {
      expect(facetOf(tag), tag).toBe(facet);
      expect(isContextTag(tag), tag).toBe(facet === "context");
      expect(isFloorTag(tag), tag).toBe(facet === "floor");
      expect(isLanguageTag(tag), tag).toBe(facet === "language");
    }

    // The table itself must exercise the closed facet set, or the assertions
    // above could pass while a facet goes unclassified.
    const covered = [...new Set(CASES.map(([, facet]) => facet))].toSorted();
    expect(covered).toEqual(["capability", "context", "floor", "language"]);
  });

  it("classifies by prefix only, not by substring", () => {
    expect(facetOf("my-lang:python")).toBe("capability");
    expect(facetOf("")).toBe("capability");
    expect(isLanguageTag("Lang:python")).toBe(false);
  });

  it("classifies a valueless prefix by facet even though it carries no value", () => {
    expect(isLanguageTag("lang:")).toBe(true);
    expect(facetOf("lang:")).toBe("language");
    expect(languageOf("lang:")).toBeNull();
  });
});

describe("languageOf", () => {
  it("normalises the value and rejects non-languages and empty values", () => {
    expect(languageOf("lang:python")).toBe("python");
    expect(languageOf("lang:Python")).toBe("python");
    expect(languageOf("lang:  Go  ")).toBe("go");
    expect(languageOf("lang:")).toBeNull();
    expect(languageOf("lang:   ")).toBeNull();
    expect(languageOf("implementation")).toBeNull();
    expect(languageOf("ctx:team-only")).toBeNull();
  });
});

describe("primaryTag", () => {
  it("returns the first capability tag regardless of position", () => {
    expect(primaryTag(["ctx:team-only", "implementation", "review"])).toBe("implementation");
    expect(primaryTag(["implementation", "review"])).toBe("implementation");
  });

  it("falls back to the first tag when no capability tag exists", () => {
    expect(primaryTag(["floor:security", "lang:python"])).toBe("floor:security");
  });

  it("returns null for an untagged artifact", () => {
    expect(primaryTag([])).toBeNull();
  });
});

describe("tagsByFacet", () => {
  it("groups into all four keys, preserving input order", () => {
    expect(tagsByFacet(["lang:go", "review", "ctx:team-only", "implementation", "floor:security"]))
      .toEqual({
        capability: ["review", "implementation"],
        context: ["ctx:team-only"],
        floor: ["floor:security"],
        language: ["lang:go"],
      });
  });

  it("returns every facet key for an empty tag list", () => {
    expect(tagsByFacet([])).toEqual({ capability: [], context: [], floor: [], language: [] });
  });
});

describe("filterByLanguages", () => {
  const agnostic = item("agnostic", "implementation", "floor:security");
  const python = item("python", "review", "lang:python");
  const go = item("go", "review", "lang:go");

  it("passes a language-agnostic item for any language set, including empty", () => {
    for (const languages of [[], ["python"], ["go", "rust"]]) {
      expect(ids(filterByLanguages([agnostic], languages))).toEqual(["agnostic"]);
    }
  });

  it("admits a matching language tag and rejects a mismatching one", () => {
    expect(ids(filterByLanguages([python], ["python"]))).toEqual(["python"]);
    expect(ids(filterByLanguages([python], ["go"]))).toEqual([]);
  });

  it("passes language-tagged items when detection found nothing (fail-open)", () => {
    // Empty detection means no signal to filter against; dropping every
    // language-tagged item would hide content on an unrecognised repo.
    expect(ids(filterByLanguages([agnostic, python, go], []))).toEqual(["agnostic", "python", "go"]);
    expect(ids(filterByLanguages([python, go], ["", "   "]))).toEqual(["python", "go"]);
  });

  it("treats a malformed lang: tag as untagged", () => {
    const malformed = item("malformed", "review", "lang:");
    expect(ids(filterByLanguages([malformed], ["go"]))).toEqual(["malformed"]);
  });

  it("matches case-insensitively on both sides", () => {
    expect(ids(filterByLanguages([item("mixed", "lang:Python")], ["python"]))).toEqual(["mixed"]);
    expect(ids(filterByLanguages([python], ["Python"]))).toEqual(["python"]);
    expect(ids(filterByLanguages([item("padded", "lang: Rust ")], ["RUST"]))).toEqual(["padded"]);
  });

  it("admits a multi-language item when any tag matches", () => {
    const both = item("both", "lang:python", "lang:go");
    expect(ids(filterByLanguages([both], ["go"]))).toEqual(["both"]);
    expect(ids(filterByLanguages([both], ["rust"]))).toEqual([]);
  });

  it("preserves order, returns a fresh array, and does not mutate the input", () => {
    const input = [python, agnostic, go];
    const result = filterByLanguages(input, ["python"]);

    expect(ids(result)).toEqual(["python", "agnostic"]);
    expect(result).not.toBe(input);
    expect(ids(input)).toEqual(["python", "agnostic", "go"]);
  });
});

describe("filterByLanguages properties", () => {
  const TAG_POOL: readonly string[] = [
    "implementation",
    "review",
    "ctx:team-only",
    "floor:security",
    "lang:python",
    "lang:Python",
    "lang:go",
    "lang:  Rust  ",
    "lang:",
  ];
  const LANGUAGE_POOL: readonly string[] = ["python", "Go", "rust", "java", "", "   "];

  const itemArb = fc.record({
    id: fc.string({ maxLength: 4 }),
    tags: fc.array(fc.constantFrom(...TAG_POOL), { maxLength: 5 }),
  });
  const itemsArb = fc.array(itemArb, { maxLength: 12 });
  const languagesArb = fc.array(fc.constantFrom(...LANGUAGE_POOL), { maxLength: 4 });

  // Fixed seed: the suite must be deterministic run-to-run (CI contract).
  const FC_PARAMS = { seed: 20260813, numRuns: 300 } as const;

  it("is idempotent and order-preserving", () => {
    fc.assert(
      fc.property(itemsArb, languagesArb, (items, languages) => {
        const once = filterByLanguages(items, languages);
        const twice = filterByLanguages(once, languages);

        expect(twice).toEqual(once);
        // A subsequence of the input: nothing added, nothing reordered.
        expect(once).toEqual(items.filter((i) => once.includes(i)));
      }),
      FC_PARAMS,
    );
  });

  it("keeps every item whose tags resolve to no language", () => {
    fc.assert(
      fc.property(itemsArb, languagesArb, (items, languages) => {
        const kept = new Set(filterByLanguages(items, languages));
        for (const candidate of items) {
          if (candidate.tags.every((tag) => languageOf(tag) === null)) {
            expect(kept.has(candidate)).toBe(true);
          }
        }
      }),
      FC_PARAMS,
    );
  });
});
