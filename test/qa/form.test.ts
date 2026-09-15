import { describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { QA_ROWS, humanCell, renderForm } from "../../scripts/qa/form.mjs";

/**
 * The form is the artifact a release decision reads. What it must never do is let a row that
 * nobody performed and nothing measured read like one that somebody did — so the assertions below
 * are mostly about what the rendered text says in the cases where a friendlier renderer would
 * round up.
 */

interface CatalogueRow {
  id: string;
  lane: string;
  title: string;
  proves: string;
}

const PAGE_INPUTS = {
  "website/build/index.html": "1".repeat(64),
  "website/build/docs/capability-matrix/index.html": "2".repeat(64),
};

const evidence = {
  sha: "949bde928e0ce3298015e35937594775e897a670",
  timestamp: "2026-09-15T00:11:02.000Z",
  harness: {
    name: "playwright",
    version: "1.63.0",
    browser: "153.0.8010.12",
    scanner: "axe-core",
    scannerVersion: "4.13.0",
  },
  rows: [
    {
      row: "H1a",
      automated: true,
      status: "passed",
      reason: "the hook recorded 2 call(s): 1 denied and 1 allowed",
      inputHashes: { "fixture(claude)/.claude/settings.json": "a".repeat(64) },
      rowHash: "a1".repeat(32),
    },
    {
      row: "H1b",
      automated: true,
      status: "failed",
      reason: "the hook recorded no call at all",
      inputHashes: { "fixture(codex)/.codex/hooks.json": "b".repeat(64) },
      rowHash: "b1".repeat(32),
    },
    {
      row: "H1c",
      automated: false,
      status: "performed",
      reason: "walked by hand in the Cursor editor",
      inputHashes: { "fixture(cursor)/.cursor/hooks.json": "c".repeat(64) },
      rowHash: "c1".repeat(32),
      performedAt: "2026-09-13",
      performedBy: "the maintainer",
    },
    {
      row: "H1d",
      automated: false,
      status: "not-run",
      reason: "not on PATH",
      inputHashes: { "fixture(copilot)/.github/hooks/stamity.json": "d".repeat(64) },
      rowHash: "d1".repeat(32),
    },
    {
      row: "H2",
      automated: true,
      status: "passed",
      reason: "5 page(s) | scanner: 0 violation(s)",
      inputHashes: PAGE_INPUTS,
      rowHash: "e1".repeat(32),
    },
    {
      row: "H3a",
      automated: true,
      status: "passed",
      reason: "18 stop(s), every one with a visible indicator",
      inputHashes: PAGE_INPUTS,
      rowHash: "f1".repeat(32),
    },
    {
      row: "H3b",
      automated: true,
      status: "passed",
      reason: "18 stop(s), every one with a visible indicator",
      inputHashes: PAGE_INPUTS,
      rowHash: "f2".repeat(32),
    },
    {
      row: "H3c",
      automated: true,
      status: "passed",
      reason: "24 stop(s), every one with a visible indicator",
      inputHashes: PAGE_INPUTS,
      rowHash: "f3".repeat(32),
    },
    {
      row: "H3d",
      automated: false,
      status: "unperformed",
      reason: "reopened: performed against rowHash f4f4, and this run's inputs hash to f5f5",
      inputHashes: PAGE_INPUTS,
      rowHash: "f5".repeat(32),
    },
  ],
};

describe("renderForm", () => {
  it("renders all nine rows, in catalogue order", () => {
    const markdown = renderForm(evidence) as string;

    const ids = (QA_ROWS as CatalogueRow[]).map((row) => row.id);
    expect(ids).toEqual(["H1a", "H1b", "H1c", "H1d", "H2", "H3a", "H3b", "H3c", "H3d"]);
    for (const id of ids) expect(markdown).toContain(`**${id}**`);

    const positions = ids.map((id) => markdown.indexOf(`| **${id}**`));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect(positions.toSorted((a, b) => a - b)).toEqual(positions);
  });

  it("marks a human row UNPERFORMED and shows the hash it is bound to", () => {
    const markdown = renderForm(evidence) as string;

    const notRunRow = markdown.split("\n").find((line) => line.startsWith("| **H1d**")) ?? "";
    expect(notRunRow).toContain("UNPERFORMED");
    expect(notRunRow).toContain("not on PATH");
    expect(notRunRow).toContain("d1d1d1d1d1d1");

    const reopened = markdown.split("\n").find((line) => line.startsWith("| **H3d**")) ?? "";
    expect(reopened).toContain("UNPERFORMED");
    expect(reopened).not.toContain("PERFORMED 2026");

    expect(markdown).toContain("### H1d — `" + "d1".repeat(32) + "`");
    expect(markdown).toContain("- `fixture(copilot)/.github/hooks/stamity.json` — `" + "d".repeat(64) + "`");
  });

  it("shows a carried-forward performed row with its ORIGINAL date, not tonight's", () => {
    const markdown = renderForm(evidence) as string;

    const row = markdown.split("\n").find((line) => line.startsWith("| **H1c**")) ?? "";
    expect(row).toContain("PERFORMED 2026-09-13");
    expect(row).toContain("the maintainer");
    expect(row).toContain("carried forward: inputs unchanged");
    expect(row).not.toContain("2026-09-15");
  });

  it("never renders a measured failure as anything but a failure", () => {
    const markdown = renderForm(evidence) as string;

    const row = markdown.split("\n").find((line) => line.startsWith("| **H1b**")) ?? "";
    expect(row).toContain("| failed |");
    expect(row).toContain("the hook recorded no call at all");
    expect(row).not.toContain("UNPERFORMED");
  });

  it("reports a row the harness never wrote instead of omitting it", () => {
    const markdown = renderForm({ ...evidence, rows: evidence.rows.filter((row) => row.row !== "H2") }) as string;

    const row = markdown.split("\n").find((line) => line.startsWith("| **H2**")) ?? "";
    expect(row).toContain("not-run");
    expect(row).toContain("the harness wrote no row for this id");
    expect(markdown).toContain("No inputs recorded, so this row is bound to nothing");
  });

  it("escapes a pipe in a reason so one long row cannot break the table", () => {
    const markdown = renderForm({
      ...evidence,
      rows: [{ ...evidence.rows[0], reason: "/: 3 stops || /docs/customization: 4 stops" }],
    }) as string;

    const row = markdown.split("\n").find((line) => line.startsWith("| **H1a**")) ?? "";
    expect(row).toContain("\\|\\|");
    // Seven columns means eight UNESCAPED delimiters; the escaped pair inside the reason is not
    // one of them, which is the whole point of the escape.
    expect(row.match(/(?<!\\)\|/g)?.length).toBe(8);
  });

  it("names the harness and the run, so a stale form is visibly stale", () => {
    const markdown = renderForm(evidence) as string;

    expect(markdown).toContain("# QA form — 949bde928e0ce3298015e35937594775e897a670");
    expect(markdown).toContain("2026-09-15T00:11:02.000Z");
    expect(markdown).toContain("playwright 1.63.0");
    expect(markdown).toContain("browser 153.0.8010.12");
    expect(markdown).toContain("axe-core 4.13.0");
  });
});

describe("humanCell", () => {
  it("says UNPERFORMED for every human row that carries no signature", () => {
    expect(humanCell({ automated: false, status: "not-run" })).toBe("UNPERFORMED");
    expect(humanCell({ automated: false, status: "unperformed" })).toBe("UNPERFORMED");
  });

  it("says what the automation found for a measured row, rather than claiming a person did it", () => {
    expect(humanCell({ automated: true, status: "passed" })).toBe("automated (passed)");
    expect(humanCell({ automated: true, status: "failed" })).toBe("automated (failed)");
  });

  it("reports a signature with no recorded date as undated rather than inventing one", () => {
    expect(humanCell({ automated: false, status: "performed" })).toContain("date not recorded");
  });
});
