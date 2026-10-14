import { describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { QA_ROWS, RETIRED_ROWS, humanCell, renderForm } from "../../scripts/qa/form.mjs";

/**
 * The form is the artifact a release decision reads. What it must never do is let a row that
 * nobody performed and nothing measured read like one that somebody did — so the assertions below
 * are mostly about what the rendered text says in the cases where a friendlier renderer would
 * round up.
 */

interface CatalogueRow {
  id: string;
  lane: string;
  client?: string;
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
      // TEST CHANGE, justified (2026-10-08, unit b3-qa-carry-suffix, inbox row 315): the form now
      // prints the carry suffix only beside a row `carryForward` marked `carried: true`, so this
      // fixture, which stands for a carried row, gains the mark the real carry writes. The case
      // "shows a carried-forward performed row" keeps every assertion it had.
      carried: true,
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
    // The four plugin-route rows an evidence file written before 1.15.0 still carries. TEST CHANGE,
    // justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): kept in the fixture on
    // purpose, now standing for an old evidence file; the form lists them as retired below.
    {
      row: "H4a",
      automated: true,
      status: "passed",
      reason: "structure PASS || install PASS || discovery PASS || invocation PASS",
      inputHashes: { "dist/claude/stamity-plugin.json": "1a".repeat(32) },
      rowHash: "a4".repeat(32),
    },
    {
      row: "H4b",
      automated: false,
      status: "not-run",
      reason: "install SKIPPED: a Cursor run is a model call; pass --invoke",
      inputHashes: { "dist/cursor/stamity-plugin.json": "2a".repeat(32) },
      rowHash: "b4".repeat(32),
    },
    {
      row: "H4c",
      automated: true,
      status: "failed",
      reason: "install FAIL: nothing was deployed under installed-plugins/stamity/stamity",
      inputHashes: { "dist/copilot/stamity-plugin.json": "3a".repeat(32) },
      rowHash: "c4".repeat(32),
    },
    {
      row: "H4d",
      automated: false,
      status: "not-run",
      reason: "invocation SKIPPED: needs --invoke",
      inputHashes: { "dist/codex/stamity-plugin.json": "4a".repeat(32) },
      rowHash: "d4".repeat(32),
    },
  ],
};

describe("renderForm", () => {
  // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): fourteen rows
  // become nine. `H4a`–`H4d` (the plugin route, one per client) and `H5` (its upgrade-and-rollback
  // walk) leave the catalogue with the plugin route, which 1.15.0 deletes; the nine left keep their
  // ids and their order, which is the join key the form, the harness and the run record share.
  it("renders all nine rows, in catalogue order", () => {
    const markdown = renderForm(evidence) as string;

    const ids = (QA_ROWS as CatalogueRow[]).map((row) => row.id);
    expect(ids).toEqual([
      "H1a", "H1b", "H1c", "H1d",
      "H2",
      "H3a", "H3b", "H3c", "H3d",
    ]);
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

  it("claims no carry for a performed row a person walked this run", () => {
    // A performed, dated, named row explicitly marked `carried: false`. The row `recordHumanAnswers`
    // writes for a walk drops the key instead; that absent-key shape is pinned on `humanCell` below.
    const markdown = renderForm({
      ...evidence,
      rows: evidence.rows.map((row) => (row.row === "H1c" ? { ...row, carried: false } : row)),
    }) as string;

    const row = markdown.split("\n").find((line) => line.startsWith("| **H1c**")) ?? "";
    expect(row).toContain("| PERFORMED 2026-09-13 by the maintainer |");
    expect(row).not.toContain("carried forward");
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

// TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit d3-ci-qa): "the plugin-route
// rows" pinned `H4a`–`H4d` and `H5` in the catalogue. They leave it with the plugin route, which
// 1.15.0 deletes, so the three cases become the ones below: no catalogue row is on a plugins lane,
// and an evidence file that still carries the old rows renders, listing them as retired.
describe("the retired plugin-route rows", () => {
  const RETIRED = ["H4a", "H4b", "H4c", "H4d", "H5"];

  it("leaves no catalogue row on the plugins lane, and names each retired id", () => {
    expect((QA_ROWS as CatalogueRow[]).filter((row) => row.lane === "plugins")).toEqual([]);
    expect((QA_ROWS as CatalogueRow[]).filter((row) => RETIRED.includes(row.id))).toEqual([]);
    expect(Object.keys(RETIRED_ROWS as Record<string, string>)).toEqual(RETIRED);
  });

  it("renders an evidence file that still carries H4a–H4d and H5, listing them as retired", () => {
    const old = {
      ...evidence,
      rows: [
        ...evidence.rows,
        { row: "H5", automated: false, status: "performed", reason: "walked", inputHashes: {}, rowHash: "e5".repeat(32), performedAt: "2026-09-21", performedBy: "the maintainer" },
      ],
    };
    let markdown = "";
    expect(() => {
      markdown = renderForm(old) as string;
    }).not.toThrow();
    // Not in the table: a retired row is no row of this form.
    for (const id of RETIRED) expect(markdown, id).not.toContain(`| **${id}**`);
    const at = markdown.indexOf("## Retired rows");
    expect(at, "the form names no retired section").toBeGreaterThan(0);
    const section = markdown.slice(at);
    for (const id of RETIRED) {
      const line = section.split("\n").find((entry) => entry.startsWith(`- **${id}**`)) ?? "";
      expect(line, id).toContain("retired in 1.15.0");
    }
    // The status it was recorded with reads as history, never as this run's pass or signature.
    const failed = section.split("\n").find((entry) => entry.startsWith("- **H4c**")) ?? "";
    expect(failed).toContain("recorded `failed`");
    const performed = section.split("\n").find((entry) => entry.startsWith("- **H5**")) ?? "";
    expect(performed).toContain("recorded `performed`");
    expect(section).toContain("carries no signature forward");
    // The input lists are the catalogue's alone.
    expect(markdown).not.toContain("### H4a");
    expect(markdown).not.toContain("dist/codex/stamity-plugin.json");
  });

  it("prints no retired section for an evidence file that carries none", () => {
    const markdown = renderForm({
      ...evidence,
      rows: evidence.rows.filter((row) => !RETIRED.includes(row.row)),
    }) as string;
    expect(markdown).not.toContain("## Retired rows");
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

  it("appends the carry suffix only to a row marked carried, so a fresh walk reads as one", () => {
    const signed = { automated: false, status: "performed", performedAt: "2026-09-13", performedBy: "the maintainer" };
    // No `carried` key (an evidence file written before the mark existed, or a row
    // `recordHumanAnswers` answered): no carry is claimed for it.
    expect(humanCell(signed)).toBe("PERFORMED 2026-09-13 by the maintainer");
    // An explicit `carried: false` claims none either.
    expect(humanCell({ ...signed, carried: false })).toBe("PERFORMED 2026-09-13 by the maintainer");
    expect(humanCell({ ...signed, carried: true })).toBe(
      "PERFORMED 2026-09-13 by the maintainer (carried forward: inputs unchanged)",
    );
  });
});

/**
 * `accepted-unwalked` (plan 013-02, unit qa-harness-accepted-unwalked): a row a person signed off
 * without walking renders as exactly that — never as PERFORMED, and never as a carry, because an
 * acceptance holds for the run that recorded it only (census S8).
 */
describe("the accepted-unwalked row", () => {
  const acceptedRow = {
    row: "H1d",
    automated: false,
    status: "accepted-unwalked",
    reason: "not on PATH",
    inputHashes: { "fixture(copilot)/.github/hooks/stamity.json": "d".repeat(64) },
    rowHash: "d1".repeat(32),
    acceptedAt: "2026-09-13",
    acceptedBy: "the maintainer",
  };

  it("renders ACCEPTED UNWALKED with its date and name, and says it was not walked", () => {
    const markdown = renderForm({
      ...evidence,
      rows: evidence.rows.map((row) => (row.row === "H1d" ? acceptedRow : row)),
    }) as string;

    const row = markdown.split("\n").find((line) => line.startsWith("| **H1d**")) ?? "";
    expect(row).toContain("ACCEPTED UNWALKED 2026-09-13 by the maintainer");
    expect(row).toContain("not walked");
    expect(row).not.toContain("PERFORMED");
    expect(row).not.toContain("carried forward");
    expect(row).toContain("| accepted-unwalked |");
  });

  it("reads undated rather than inventing a date, and wins over the automated label", () => {
    expect(humanCell({ automated: true, status: "accepted-unwalked" })).toContain("ACCEPTED UNWALKED date not recorded");
  });

  it("says in the footer that an acceptance reopens on the next run", () => {
    const markdown = renderForm(evidence) as string;

    expect(markdown).toContain("A human row stays PERFORMED only while its `rowHash` holds");
    expect(markdown).toContain("An ACCEPTED UNWALKED row holds for the run that recorded it and reopens on the next run");
  });
});
