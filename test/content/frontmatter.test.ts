import { describe, expect, it } from "vitest";
import {
  composeFrontmatter,
  extractToolsFrontmatter,
  frontmatterField,
  type ParsedFrontmatter,
  parseFrontmatter,
} from "../../src/content/frontmatter.ts";
import { EngineError } from "../../src/types/errors.ts";

const SOURCE = "rules/stamity-security.md";

/** Asserts the thrown value is an EngineError of `code` and returns it for message checks. */
function expectEngineError(run: () => unknown, code: EngineError["code"]): EngineError {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(EngineError);
  const error = thrown as EngineError;
  expect(error.code).toBe(code);
  return error;
}

/**
 * Top-level keys of a composed document's head, in the order they were written.
 * Read off the text rather than off a parsed map, because the order a document
 * carries is the thing under assertion.
 */
function headKeys(document: string): string[] {
  const [, block = ""] = /^---\n([\s\S]*?)\n---\n/.exec(document) ?? [];
  return block
    .split("\n")
    .map((line) => /^([A-Za-z_][\w-]*):/.exec(line)?.[1])
    .filter((key): key is string => key !== undefined);
}

/** Fence lines in a composed document, ignoring the trailing whitespace the grammar tolerates. */
function fenceLines(document: string): string[] {
  return document.split("\n").filter((line) => line.trim() === "---");
}

const ARTIFACT = [
  "---",
  "id: stamity-implementer",
  "type: agent",
  "description: Implements one unit of work",
  "tags:",
  "  - implementation",
  "  - review",
  "limits:",
  "  files: 12",
  "  nested:",
  "    deep: true",
  "---",
  "# Body",
  "",
  "Prose.",
  "",
].join("\n");

const ARTIFACT_MAP = {
  id: "stamity-implementer",
  type: "agent",
  description: "Implements one unit of work",
  tags: ["implementation", "review"],
  limits: { files: 12, nested: { deep: true } },
};

describe("parseFrontmatter", () => {
  it("splits the YAML head from the body", () => {
    const parsed = parseFrontmatter(ARTIFACT, SOURCE);

    expect(parsed.hadFrontmatter).toBe(true);
    expect(parsed.frontmatter).toEqual(ARTIFACT_MAP);
    expect(parsed.body).toBe("# Body\n\nProse.\n");
  });

  it("returns the whole document as the body when there is no fence", () => {
    const raw = "# Just markdown\n\nid: not-frontmatter\n";
    const parsed = parseFrontmatter(raw, SOURCE);

    expect(parsed.hadFrontmatter).toBe(false);
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe(raw);
  });

  it("treats an unterminated opening fence as no frontmatter", () => {
    const raw = "---\nid: a\nnever closed\n";
    const parsed = parseFrontmatter(raw, SOURCE);

    expect(parsed.hadFrontmatter).toBe(false);
    expect(parsed.body).toBe(raw);
  });

  it("does not re-split on `---` lines further down the document", () => {
    const raw = "---\nid: a\n---\nintro\n\n---\n\ntrailer\n";
    const parsed = parseFrontmatter(raw, SOURCE);

    expect(parsed.frontmatter).toEqual({ id: "a" });
    expect(parsed.body).toBe("intro\n\n---\n\ntrailer\n");

    // The mid-document rule survives a re-emission untouched.
    const reparsed = parseFrontmatter(composeFrontmatter(parsed.frontmatter, parsed.body), SOURCE);
    expect(reparsed.body).toBe(parsed.body);
  });

  it("stops the block at a line-leading fence, not at a mid-line `---`", () => {
    const parsed = parseFrontmatter("---\nid: a---b\ntype: rule\n---\nbody\n", SOURCE);

    expect(parsed.frontmatter).toEqual({ id: "a---b", type: "rule" });
    expect(parsed.body).toBe("body\n");
  });

  it("accepts fence lines with trailing spaces and tabs", () => {
    const parsed = parseFrontmatter("--- \nid: a\n---\t \nbody\n", SOURCE);

    expect(parsed.hadFrontmatter).toBe(true);
    expect(parsed.frontmatter).toEqual({ id: "a" });
    expect(parsed.body).toBe("body\n");
  });

  it("reads an empty block as present-but-empty", () => {
    const parsed = parseFrontmatter("---\n---\nbody\n", SOURCE);

    expect(parsed.hadFrontmatter).toBe(true);
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe("body\n");
  });

  it("reads a whitespace-only block as present-but-empty", () => {
    expect(parseFrontmatter("---\n\n---\nbody\n", SOURCE).frontmatter).toEqual({});
    expect(parseFrontmatter("---\n   \n---\nbody\n", SOURCE).frontmatter).toEqual({});
  });

  it("handles a document that ends at the closing fence", () => {
    const parsed = parseFrontmatter("---\nid: a\n---", SOURCE);

    expect(parsed.hadFrontmatter).toBe(true);
    expect(parsed.frontmatter).toEqual({ id: "a" });
    expect(parsed.body).toBe("");
  });

  it("detects the fence behind a leading BOM and keeps the mark out of the body", () => {
    const parsed = parseFrontmatter("﻿---\nid: a\n---\nbody\n", SOURCE);

    expect(parsed.hadFrontmatter).toBe(true);
    expect(parsed.frontmatter).toEqual({ id: "a" });
    expect(parsed.body).toBe("body\n");

    const noFence = parseFrontmatter("﻿# Just markdown\n", SOURCE);
    expect(noFence.hadFrontmatter).toBe(false);
    expect(noFence.body).toBe("# Just markdown\n");
  });

  it("throws VALIDATION_ERROR naming the source on malformed YAML", () => {
    const error = expectEngineError(
      () => parseFrontmatter("---\nid: [unclosed\n---\nbody\n", SOURCE),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain(SOURCE);
    expect(error.exitCode).toBe(1);
    // Re-coded from the config layer's CONFIG_ERROR: broken artifact content is a
    // different operator next-step than a broken config document.
    expect(error.cause).toBeInstanceOf(EngineError);
    expect((error.cause as EngineError).code).toBe("CONFIG_ERROR");
  });

  it("throws VALIDATION_ERROR when the block is not a map", () => {
    const error = expectEngineError(
      () => parseFrontmatter("---\n- a\n- b\n---\nbody\n", SOURCE),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain(SOURCE);
  });
});

describe("composeFrontmatter", () => {
  it("leads with the identity keys regardless of the caller's key order", () => {
    const composed = composeFrontmatter(
      { tags: ["a"], extra: 1, description: "d", id: "x", type: "agent" },
      "body\n",
    );

    expect(composed).toBe(
      "---\nid: x\ntype: agent\ndescription: d\ntags:\n  - a\nextra: 1\n---\nbody\n",
    );
  });

  it("drops undefined values instead of emitting them as null", () => {
    expect(composeFrontmatter({ id: "x", precedence: undefined }, "")).toBe("---\nid: x\n---\n");
  });

  it("composes an empty map to an empty block, not a YAML map literal", () => {
    const composed = composeFrontmatter({}, "body\n");

    expect(composed).toBe("---\n---\nbody\n");
    expect(parseFrontmatter(composed, SOURCE)).toEqual({
      frontmatter: {},
      body: "body\n",
      hadFrontmatter: true,
    });
  });

  it("passes the body through byte-for-byte", () => {
    expect(composeFrontmatter({ id: "x" }, "")).toBe("---\nid: x\n---\n");
    expect(composeFrontmatter({ id: "x" }, "\nleading blank line\n")).toBe(
      "---\nid: x\n---\n\nleading blank line\n",
    );
  });

  it("does not fold a long description across lines", () => {
    const description = `${"long ".repeat(40)}end`;
    const composed = composeFrontmatter({ description }, "");

    expect(composed).toContain(`description: ${description}`);
    expect(parseFrontmatter(composed, SOURCE).frontmatter).toEqual({ description });
  });
});

describe("parse -> compose -> parse", () => {
  it("round-trips maps with arrays and nested objects", () => {
    const parsed = parseFrontmatter(ARTIFACT, SOURCE);
    const composed = composeFrontmatter(parsed.frontmatter, parsed.body);
    const reparsed = parseFrontmatter(composed, SOURCE);

    expect(reparsed.frontmatter).toEqual(ARTIFACT_MAP);
    expect(reparsed.body).toBe(parsed.body);
    // Second pass is a fixpoint: re-emitting an already-composed document is a no-op.
    expect(composeFrontmatter(reparsed.frontmatter, reparsed.body)).toBe(composed);
  });

  /**
   * The identity REQ-OVERLAY-008 rests on, over the map shape REQ-OVERLAY-005
   * produces (docs/specs/overlay-layers.md).
   *
   * An overlay's merged map is not a hand-authored one: a base key the overlay
   * nulled is GONE, and the keys the overlay introduced are APPENDED after every
   * key the base declared, whatever they are named. The merged artifact is then
   * composed and handed back to the walk's own item builder, so if this trip
   * were not an identity the overlay layer would re-validate a document that is
   * not the one it merged.
   *
   * The map is written as a literal rather than produced by the catalog's merge:
   * this suite owns the frontmatter guarantee, and `test/content/catalog.test.ts`
   * owns the claim that the merge emits this shape. Reaching across would make
   * one failure red in two places and neither of them the cause.
   */
  it("round-trips a merged overlay map — removed key gone, overlay-only keys appended", () => {
    // Base order: two lead keys, then three the base declared after them.
    // `precedence` is the key the overlay removed with a null.
    const merged = {
      id: "security",
      type: "rule",
      load: "always",
      obsolete_when: "never",
      // Overlay-only keys, appended in the order the overlay declared them —
      // two of which are LEAD_KEYS, which is what makes the hoist observable.
      description: "The house security floor.",
      tags: ["floor:security"],
      scope: "conditional",
    };
    const body = "Base body.\nLast line.\n\nHouse addendum.\n";

    // The merge's own claim: base order first, overlay-only keys appended, and
    // no trace of the removed key.
    expect(Object.keys(merged)).toEqual([
      "id",
      "type",
      "load",
      "obsolete_when",
      "description",
      "tags",
      "scope",
    ]);
    expect(Object.hasOwn(merged, "precedence")).toBe(false);

    const composed = composeFrontmatter(merged, body);
    const reparsed = parseFrontmatter(composed, SOURCE);

    // Values survive whole — the identity the merged artifact is re-validated
    // against — and the removed key never reappears from the base.
    expect(reparsed.frontmatter).toEqual(merged);
    expect(reparsed.body).toBe(body);
    expect(composed).not.toContain("precedence");

    // Order is where the map and the DOCUMENT part company, and the line is
    // drawn here rather than left to be discovered: the map appends overlay-only
    // keys at the end, and composing hoists the identity keys back to the front,
    // so a re-emitted head reads like every other artifact instead of carrying
    // the accident of which keys an overlay happened to add.
    expect(headKeys(composed)).toEqual([
      "id",
      "type",
      "description",
      "tags",
      "load",
      "obsolete_when",
      "scope",
    ]);
    expect(Object.keys(reparsed.frontmatter)).toEqual(headKeys(composed));

    // And the hoist settles: re-emitting the parsed-back map reproduces the same
    // bytes, so an overlay does not shuffle its artifact's head on every sync.
    expect(composeFrontmatter(reparsed.frontmatter, reparsed.body)).toBe(composed);
  });

  it("round-trips a CRLF document without duplicating the fence", () => {
    const raw = "---\r\nid: a\r\ntags:\r\n  - x\r\n---\r\nline one\r\nline two\r\n";
    const parsed = parseFrontmatter(raw, SOURCE);

    expect(parsed.frontmatter).toEqual({ id: "a", tags: ["x"] });
    expect(parsed.body).toBe("line one\r\nline two\r\n");

    const composed = composeFrontmatter(parsed.frontmatter, parsed.body);
    expect(fenceLines(composed)).toHaveLength(2);

    const reparsed = parseFrontmatter(composed, SOURCE);
    expect(reparsed.frontmatter).toEqual(parsed.frontmatter);
    expect(reparsed.body).toBe(parsed.body);
    expect(fenceLines(composeFrontmatter(reparsed.frontmatter, reparsed.body))).toHaveLength(2);
  });
});

describe("extractToolsFrontmatter", () => {
  it("reads an absent key as no restriction", () => {
    expect(extractToolsFrontmatter(ARTIFACT)).toBeUndefined();
    expect(extractToolsFrontmatter("# No frontmatter here\n")).toBeUndefined();
  });

  it("returns the declared tools", () => {
    expect(extractToolsFrontmatter("---\nid: a\ntools:\n  - claude\n  - cursor\n---\nbody\n")).toEqual(
      ["claude", "cursor"],
    );
    expect(extractToolsFrontmatter("---\nid: a\ntools: [copilot, codex]\n---\n")).toEqual([
      "copilot",
      "codex",
    ]);
  });

  it("keeps an explicit empty list as a restriction to no tool", () => {
    expect(extractToolsFrontmatter("---\nid: a\ntools: []\n---\n")).toEqual([]);
  });

  it("deduplicates, first occurrence winning", () => {
    expect(extractToolsFrontmatter("---\ntools: [claude, claude, cursor, claude]\n---\n")).toEqual([
      "claude",
      "cursor",
    ]);
  });

  it("rejects an unknown tool name and lists the valid ones", () => {
    const error = expectEngineError(
      () => extractToolsFrontmatter("---\nid: a\ntools: [gemini]\n---\n", SOURCE),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain(SOURCE);
    expect(error.message).toContain('"gemini"');
    for (const tool of ["claude", "cursor", "copilot", "codex"]) {
      expect(error.message).toContain(tool);
    }
  });

  it("names every unknown tool in one message", () => {
    const error = expectEngineError(
      () => extractToolsFrontmatter("---\ntools: [gemini, claude, windsurf]\n---\n", SOURCE),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain('"gemini", "windsurf"');
  });

  it("rejects a value that is not an array of strings", () => {
    const scalar = expectEngineError(
      () => extractToolsFrontmatter("---\ntools: claude\n---\n", SOURCE),
      "VALIDATION_ERROR",
    );
    expect(scalar.message).toContain("tools");
    expect(scalar.message).toContain(SOURCE);

    expectEngineError(
      () => extractToolsFrontmatter("---\ntools: [1, claude]\n---\n", SOURCE),
      "VALIDATION_ERROR",
    );
  });

  it("propagates a malformed frontmatter block", () => {
    expectEngineError(
      () => extractToolsFrontmatter("---\ntools: [unclosed\n---\n", SOURCE),
      "VALIDATION_ERROR",
    );
  });
});

describe("frontmatterField", () => {
  it("reads own keys and returns undefined for absent ones", () => {
    const parsed = parseFrontmatter(ARTIFACT, SOURCE);

    expect(frontmatterField(parsed, "id")).toBe("stamity-implementer");
    expect(frontmatterField(parsed, "tags")).toEqual(["implementation", "review"]);
    expect(frontmatterField(parsed, "absent")).toBeUndefined();
  });

  it("never reports a prototype member as a declared value", () => {
    const parsed: ParsedFrontmatter = { frontmatter: {}, body: "", hadFrontmatter: false };

    expect(frontmatterField(parsed, "constructor")).toBeUndefined();
    expect(frontmatterField(parsed, "toString")).toBeUndefined();
  });
});
