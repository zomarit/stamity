import { describe, expect, it } from "vitest";
import { FINDING_TEXT_MAX, parseFindingsBlock } from "../../src/runs/blocks.ts";

/**
 * The findings block's text caps, as the refusal names them (REQ-CTX-005): an
 * over-cap `locator` or `summary` is refused with its own measured length beside
 * the cap, so the author knows how far to cut without counting by hand.
 *
 * Pure parser lane: the block is a string and the verdict a value, so no
 * filesystem and no CLI are involved.
 */

/** A findings block holding one Minor finding with `fields` over the defaults. */
function block(fields: Record<string, unknown>): string {
  const line = JSON.stringify({ id: "M-1", severity: "Minor", locator: "src/a.ts:1", summary: "s", ...fields });
  return ["```stamity-findings", line, "```", ""].join("\n");
}

describe("parseFindingsBlock text caps", () => {
  it("names a 350-character summary's length beside the 300-character cap", () => {
    const parsed = parseFindingsBlock(block({ summary: "x".repeat(350) }));

    expect(parsed).toEqual({
      ok: false,
      problems: [{ line: 2, message: "summary is 350 characters, over the 300-character cap" }],
    });
  });

  it("counts code points, not UTF-16 units, in the length it names", () => {
    // 301 astral characters are 602 UTF-16 units; the cap and the figure are both code points.
    const parsed = parseFindingsBlock(block({ locator: "\u{1F600}".repeat(301) }));

    expect(parsed).toEqual({
      ok: false,
      problems: [{ line: 2, message: "locator is 301 characters, over the 300-character cap" }],
    });
  });

  it("admits a summary of exactly the cap", () => {
    const parsed = parseFindingsBlock(block({ summary: "y".repeat(FINDING_TEXT_MAX) }));

    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.items.map((item) => item.summary.length) : []).toEqual([FINDING_TEXT_MAX]);
  });
});
