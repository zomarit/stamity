import { describe, expect, it } from "vitest";
import {
  ANY_FENCE_LINE,
  FINDING_TEXT_MAX,
  isNearFindingsInfo,
  nearFindingsFences,
  parseFindingsBlock,
} from "../../src/runs/blocks.ts";

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

/**
 * A near findings fence (REQ-FLOW-157, REQ-CTX-005): a fence whose info string is close to `stamity-findings` but is not
 * its exact opening. No row reads the block under it, so a finding written there would reach no ledger; the parser
 * refuses the report in its place, and `run end` writes no empty ledger beside it.
 */
const NEAR =
  "this fence's info string is close to stamity-findings but is not its exact opening, so no row reads it; write the opening as ```stamity-findings";
const WARNING = JSON.stringify({ id: "W-1", severity: "Warning", locator: "src/a.ts:1", summary: "b is wrong" });

describe("isNearFindingsInfo", () => {
  // The info string alone: lower-cased, whitespace, `-`, `_` and `.` removed, then near when it names `finding` or is
  // within two edits of `stamityfindings`. Whether the line is the exact opening is the line's question, not this one's.
  it.each([
    ["stamity-finding", true],
    ["stamity-findngs", true],
    ["stamity-findiings", true],
    ["stamity_findings", true],
    ["Stamity-Findings", true],
    ["STAMITY-FINDNGS", true],
    ["stamity findings", true],
    ["stamity.findings", true],
    [" stamity-findings ", true],
    ["stamity-findings", true],
    ["stamity-findings-v2", true],
    ["findings", true],
    // Two edits from `stamityfindings` (a letter dropped from each word), naming no `finding`.
    ["stamty-findigs", true],
    ["", false],
    ["   ", false],
    ["text", false],
    ["sh", false],
    ["json", false],
    ["stamity-morning", false],
    ["stamity-closures", false],
    // Three edits from `stamityfindings` at the same length, naming no `finding`.
    ["stamity-fxndxngx", false],
    ["stmty-findigs", false],
  ])("reads %j as near: %s", (info, near) => {
    expect(isNearFindingsInfo(info)).toBe(near);
  });
});

describe("ANY_FENCE_LINE", () => {
  it("takes a fence line's info string at any indentation, in a blockquote or a list item, and no prose line", () => {
    expect(ANY_FENCE_LINE.exec("> ```stamity-findings")?.[1]).toBe("stamity-findings");
    expect(ANY_FENCE_LINE.exec("1. ~~~~text")?.[1]).toBe("text");
    expect(ANY_FENCE_LINE.exec("      ````json")?.[1]).toBe("json");
    expect(ANY_FENCE_LINE.exec("Write the opening as ```stamity-findings")).toBeNull();
  });
});

describe("nearFindingsFences", () => {
  it.each([
    ["a fence one letter short", "# r1\n\n```stamity-finding\n```\n", [3]],
    ["a misspelt fence", "# r1\n\n```stamity-findngs\n```\n", [3]],
    ["an empty exact block beside a near one", `# r1\n\n\`\`\`stamity-findings\n\`\`\`\n\n\`\`\`stamity-finding\n${WARNING}\n\`\`\`\n`, [6]],
    ["four backticks", "````stamity-findings\n````\n", [1]],
    ["four spaces of indentation", "    ```stamity-findings\n    ```\n", [1]],
    ["a tilde fence", "~~~stamity-findings\n~~~\n", [1]],
    ["a blockquote", "> ```stamity-findngs\n> ```\n", [1]],
    ["a list item", "- ```stamity_findings\n  ```\n", [1]],
    ["a diff patch's context line", ` \`\`\`stamity-finding\n ${WARNING}\n \`\`\`\n`, [1]],
    ["CRLF line ends", "a\r\n```stamity-finding\r\n```\r\n", [2]],
  ])("names the line of %s", (_case, text, lines) => {
    expect(nearFindingsFences(text)).toEqual(lines);
  });

  it.each([
    ["an exact block alone", `\`\`\`stamity-findings\n${WARNING}\n\`\`\`\n`],
    ["an exact block indented three spaces, trailing blanks after its info string", "   ```stamity-findings  \n```\n"],
    [
      "other fences beside an exact block",
      "```text\nx\n```\n```sh\nx\n```\n```json\n{}\n```\n```stamity-morning\n```\n```stamity-closures\n```\n```stamity-findings\n```\n",
    ],
    [
      "the grammar quoted in prose outside a fence",
      "Write the opening as ```stamity-findings, never ```stamity-finding.\nThe `stamity-findngs` spelling reads as no block.\n",
    ],
    ["no fence at all", "# r1\n\nall green\n"],
  ])("names no line for %s", (_case, text) => {
    expect(nearFindingsFences(text)).toEqual([]);
  });
});

describe("parseFindingsBlock near fences", () => {
  it("refuses an empty exact block beside a near block holding a Warning, naming the near fence's line", () => {
    const text = `# r1\n\n\`\`\`stamity-findings\n\`\`\`\n\n\`\`\`stamity-finding\n${WARNING}\n\`\`\`\n`;

    expect(parseFindingsBlock(text)).toEqual({ ok: false, problems: [{ line: 6, message: NEAR }] });
  });

  it("refuses a near fence beside an exact block that reads, so its findings are not taken as the whole report", () => {
    // Without the rule this parses: the exact block's one Warning, and nothing of the near block below it.
    const text = `\`\`\`stamity-findings\n${WARNING}\n\`\`\`\n\n\`\`\`Stamity-Findings\n\`\`\`\n`;

    expect(parseFindingsBlock(text)).toEqual({ ok: false, problems: [{ line: 5, message: NEAR }] });
  });

  it("refuses a near fence first, in place of the no-block refusal", () => {
    expect(parseFindingsBlock(`\`\`\`stamity-findngs\n${WARNING}\n\`\`\`\n`)).toEqual({
      ok: false,
      problems: [{ line: 1, message: NEAR }],
    });
  });

  it("reads an exact block beside text, sh, json, stamity-morning and stamity-closures fences", () => {
    const text = [
      "# r1",
      "```text",
      "x",
      "```",
      "```sh",
      "npm test",
      "```",
      "```json",
      '{"findings":1}',
      "```",
      "```stamity-morning",
      "```",
      "```stamity-closures",
      "```",
      "```stamity-findings",
      WARNING,
      "```",
      "",
    ].join("\n");

    const parsed = parseFindingsBlock(text);

    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.items.map((item) => [item.id, item.line]) : []).toEqual([["W-1", 16]]);
  });

  it("reads a report that quotes the grammar in prose outside a fence", () => {
    const text = `Write the opening as \`\`\`stamity-findings, never \`\`\`stamity-finding.\n\n\`\`\`stamity-findings\n${WARNING}\n\`\`\`\n`;

    const parsed = parseFindingsBlock(text);

    expect(parsed.ok ? parsed.items.map((item) => item.id) : parsed.problems).toEqual(["W-1"]);
  });
});
