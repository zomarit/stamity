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
