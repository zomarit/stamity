import { describe, expect, it } from "vitest";
import { compactOutput, truncateAt } from "../../src/guard/outputBounds.ts";
import { CHARS_PER_TOKEN, estimateTokens } from "../../src/guard/tokenEstimate.ts";
import { EngineError } from "../../src/types/errors.ts";

/** Grin emoji U+1F600 — two UTF-16 code units, so any odd cut splits the pair. */
const EMOJI = "\u{1F600}";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function descend(value: unknown, key: string, times: number): unknown {
  let current = value;
  for (let step = 0; step < times; step += 1) {
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** True when any surrogate code unit is unpaired — invalid UTF-16. */
function hasLoneSurrogate(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

function caught(run: () => unknown): unknown {
  try {
    run();
    return null;
  } catch (error) {
    return error;
  }
}

describe("truncateAt", () => {
  it("returns the whole string when it fits and nothing when the cap is zero", () => {
    expect(truncateAt("abcdef", 6)).toBe("abcdef");
    expect(truncateAt("abcdef", 99)).toBe("abcdef");
    expect(truncateAt("abcdef", 0)).toBe("");
    expect(truncateAt("abcdef", -1)).toBe("");
  });

  it("drops the orphaned high surrogate rather than splitting a pair", () => {
    const text = `a${EMOJI.repeat(3)}`;

    expect(truncateAt(text, 2)).toBe("a");
    expect(truncateAt(text, 3)).toBe(`a${EMOJI}`);
    expect(hasLoneSurrogate(truncateAt(text, 2))).toBe(false);
    expect(hasLoneSurrogate(truncateAt(text, 4))).toBe(false);
  });
});

describe("compactOutput", () => {
  it("truncates strings and marks the cut", () => {
    expect(compactOutput("x".repeat(10), { maxStringLength: 4 })).toBe("xxxx…");
    expect(compactOutput("xxxx", { maxStringLength: 4 })).toBe("xxxx");
  });

  it("truncates arrays and reports the remainder", () => {
    const value: Record<string, unknown> = { items: [0, 1, 2, 3, 4] };

    expect(compactOutput(value, { maxArrayItems: 2 }).items).toEqual([0, 1, "… 3 more items"]);
    expect(compactOutput(value, { maxArrayItems: 4 }).items).toEqual([0, 1, 2, 3, "… 1 more item"]);
    expect(compactOutput(value, { maxArrayItems: 5 }).items).toEqual([0, 1, 2, 3, 4]);
  });

  it("replaces containers past the depth limit", () => {
    const value: Record<string, unknown> = { a: { b: { c: { d: "leaf" } } } };
    const bounded = compactOutput(value, { maxDepth: 2 });

    expect(descend(bounded, "a", 1)).toEqual({ b: "… max depth 2" });
    expect(compactOutput(value, { maxDepth: 0 })).toBe("… max depth 0");
  });

  it("bounds every level of a nested structure at once", () => {
    const value: Record<string, unknown> = {
      note: "y".repeat(12),
      rows: [{ note: "z".repeat(12) }, { note: "z" }, { note: "z" }],
    };

    expect(compactOutput(value, { maxStringLength: 4, maxArrayItems: 2, maxDepth: 5 })).toEqual({
      note: "yyyy…",
      rows: [{ note: "zzzz…" }, { note: "z" }, "… 1 more item"],
    });
  });

  it("applies the module defaults when no options are given", () => {
    const value: Record<string, unknown> = {
      items: Array.from({ length: 51 }, () => 0),
      note: "y".repeat(501),
    };
    const bounded = compactOutput(value);
    const items = bounded.items as unknown[];

    expect(items).toHaveLength(51);
    expect(items[50]).toBe("… 1 more item");
    expect(bounded.note).toBe(`${"y".repeat(500)}…`);
  });

  it("never mutates the input, even a deeply frozen one", () => {
    const value = deepFreeze({
      note: "y".repeat(20),
      rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
      nested: { deep: { deeper: { deepest: "leaf" } } },
    });
    const before = JSON.stringify(value);

    compactOutput(value, { maxStringLength: 4, maxArrayItems: 1, maxDepth: 2 });

    expect(JSON.stringify(value)).toBe(before);
  });

  it("returns a copy, not the input container", () => {
    const value: Record<string, unknown> = { rows: [1, 2] };
    const bounded = compactOutput(value);

    expect(bounded).not.toBe(value);
    expect(bounded.rows).not.toBe(value.rows);
    expect(bounded).toEqual(value);
  });

  it("carries non-plain objects by reference rather than emptying them", () => {
    const when = new Date(0);
    const bounded = compactOutput({ when });

    expect(bounded.when).toBe(when);
  });

  it("does not split a surrogate pair at the truncation edge", () => {
    const value: Record<string, unknown> = { text: `a${EMOJI.repeat(5)}` };

    expect(compactOutput(value, { maxStringLength: 2 }).text).toBe("a…");
    expect(compactOutput(value, { maxStringLength: 3 }).text).toBe(`a${EMOJI}…`);
    expect(hasLoneSurrogate(String(compactOutput(value, { maxStringLength: 4 }).text))).toBe(false);
  });

  it("throws a typed validation error on a circular structure", () => {
    const node: Record<string, unknown> = { name: "root" };
    node.self = node;

    const error = caught(() => compactOutput(node));

    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe("VALIDATION_ERROR");
    expect((error as EngineError).exitCode).toBe(1);
  });

  it("throws on a cycle reached through an array", () => {
    const rows: unknown[] = [];
    rows.push({ rows });

    expect(caught(() => compactOutput({ rows }))).toBeInstanceOf(EngineError);
  });

  it("accepts a shared reference that is not an ancestor", () => {
    const shared: Record<string, unknown> = { id: 1 };
    const bounded = compactOutput({ left: shared, right: shared });

    expect(bounded).toEqual({ left: { id: 1 }, right: { id: 1 } });
  });

  it("bounds a structure deeper than the call stack without overflowing", () => {
    let chain: Record<string, unknown> = { leaf: true };
    for (let level = 0; level < 20_000; level += 1) chain = { next: chain };

    const bounded = compactOutput(chain, { maxDepth: 3 });

    expect(descend(bounded, "next", 3)).toBe("… max depth 3");
  });
});

/**
 * The token kernel ships no test file of its own in this unit; it is part of
 * the same output-size surface, so its contract is pinned here.
 */
describe("estimateTokens", () => {
  it("treats absent and empty input as zero", () => {
    expect(estimateTokens(undefined)).toBe(0);
    expect(estimateTokens("")).toBe(0);
  });

  it("divides by the character-per-token constant, rounding up", () => {
    expect(CHARS_PER_TOKEN).toBe(4);
    expect(estimateTokens("a".repeat(4000))).toBe(1000);
    expect(estimateTokens("a".repeat(4))).toBe(1);
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("a".repeat(5))).toBe(2);
  });
});
