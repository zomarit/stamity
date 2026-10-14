import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * The spec/plan coverage cases that read this repository's persisted plans (REQ-PROVE-025): the
 * plans are records, so these cases run in the records suite (`npm run test:records`) and
 * `npm test` runs the synthetic cases of `test/authoring/specPlanCoverage.test.ts` alone. The
 * describe names are that file's, so each moved case keeps its full name.
 */

const script = resolve("content/skills/st-verify/scripts/spec-plan-coverage.mjs");
const dirs: string[] = [];
function check(planText: string, specText: string) {
  const dir = mkdtempSync(join(tmpdir(), "stamity-plan-"));
  dirs.push(dir);
  writeFileSync(join(dir, "plan.md"), planText);
  writeFileSync(join(dir, "spec.md"), specText);
  let output: string;
  try {
    output = execFileSync(process.execPath, [script, "plan.md", "spec.md"], { cwd: dir, encoding: "utf8" });
  } catch (error) {
    output = String((error as { stdout?: string }).stdout ?? "");
  }
  return JSON.parse(output) as { status: string; semanticReview: string; scope: string[]; units: string[];
    findings: { code: string; message: string }[] };
}
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("REQ-FINISH-003 — structural spec/plan coverage", () => {
  // TEST CHANGE, justified (2026-10-14, r1b-records-suite-eval-cases): moved unchanged from
  // test/authoring/specPlanCoverage.test.ts, because it reads plan 006, a record that leaves `main`.
  it("reads the persisted candidate plan with all ten requirements", () => {
    expect(check(readFileSync("docs/plans/006-finish-implementation.md", "utf8"), readFileSync("docs/specs/implementation-finish.md", "utf8")).status).toBe("pass");
  });
});

describe("REQ-FLOW-070 — plan size, advisory (L5)", () => {
  type Finding = { code: string; path: string; line: number; message: string };
  /** The persisted plans are read against the real spec tree, from the repository root. */
  function checkRepo(planPath: string) {
    let output: string;
    try {
      output = execFileSync(process.execPath, [script, planPath, "docs/specs"], { encoding: "utf8", stdio: "pipe" });
    } catch (error) {
      output = String((error as { stdout?: string }).stdout ?? "");
    }
    return JSON.parse(output) as { status: string; units: string[]; findings: Finding[] };
  }
  /**
   * A persisted plan read by quoted line, so a case names a heading and not the line it sat on when the case was
   * written: `lineOf` is the 1-based line of the one row reading exactly `text`, and `span` runs from a unit's
   * heading to its last non-blank line before the heading that ends it.
   */
  function planRows(planPath: string) {
    const rows = readFileSync(planPath, "utf8").split(/\r?\n/);
    const lineOf = (text: string) => {
      const at = rows.flatMap((row, index) => (row === text ? [index + 1] : []));
      expect(at, `${planPath} holds one line reading: ${text}`).toHaveLength(1);
      return at[0] ?? 0;
    };
    const span = (heading: string, next: string) => {
      const line = lineOf(heading);
      let last = lineOf(next) - 1;
      while (last > line && !rows[last - 1]?.trim()) last -= 1;
      return { line, lines: last - line + 1, rows: rows.slice(line - 1, last) };
    };
    return { lineOf, span };
  }

  // TEST CHANGE, justified (2026-10-14, r1b-records-suite-eval-cases): the four cases below moved unchanged from
  // test/authoring/specPlanCoverage.test.ts with the two helpers above, because each reads a persisted plan (015,
  // 013-02, 017-01), a record that leaves `main`.
  it("reads plan 015's continuation line as no unit, and measures b1 whole", () => {
    const path = "docs/plans/015-board-writes.md";
    const result = checkRepo(path);
    expect(result.status).toBe("pass");
    expect(result.units).not.toContain("Item");
    // TEST CHANGE, justified (2026-10-10, q3a-plan-size-script, review/13): the case pinned the numbers measured at
    // 1987ed01 (the heading at :361, a span of 228 lines, the first `>` run at :467) on a plan that is still edited,
    // so one line added to the unit turned it red. The same two exact findings are asserted; their numbers are now
    // read from the plan by quoted line: the unit's heading, the heading that ends it, the first line of its `>` run.
    const { lineOf, span } = planRows(path);
    const b1 = span("### b1-board-contract — the board's write contract",
      "### b2-pr-resolve-replies — PR-thread replies need no board setup");
    expect(b1.rows.some((row) => row.startsWith("  `### Item text is data`"))).toBe(true);
    expect(result.findings.filter((row) => row.message.startsWith("b1-board-contract "))).toEqual([
      { code: "unit-oversize", path, line: b1.line, message: `b1-board-contract spans ${b1.lines} lines` },
      { code: "unit-prewritten", path, line: b1.line,
        message: `b1-board-contract carries prewritten text at line ${lineOf("    > ## Write-back contract")}` },
    ]);
  });
  it("finds no unit-size, unit-oversize or unit-prewritten code in plan 013-02", () => {
    const codes = checkRepo("docs/plans/013-optimization-sweep-02.md").findings.map((row) => row.code);
    expect(codes.filter((code) => code.startsWith("unit-"))).toEqual([]);
  });
  it("counts plan 017-01's a1-docs-contract whole, past the `##` headings inside its fence", () => {
    // TEST CHANGE, justified (2026-10-10, q3a-plan-size-script, review/13): the case pinned the numbers measured at
    // 1987ed01 (the heading at :274, a span of 105 lines, the first fence at :289). The same two exact findings are
    // asserted, their numbers read from the plan by quoted heading. Cut at the unit's first fenced `## ` the span
    // would stop short of the heading that ends it, and the first assertion below keeps such a line in the unit.
    const path = "docs/plans/017-docs-overhaul-01.md";
    const a1 = planRows(path).span("### a1-docs-contract — the docs contract every agent here loads when it opens a docs page",
      "### a2-prose-checks — the counter, the budgets, and the checks that keep pages short");
    const fence = a1.rows.findIndex((row) => row.startsWith("```"));
    expect(a1.rows.findIndex((row) => row.startsWith("## "))).toBeGreaterThan(fence);
    expect(fence).toBeGreaterThan(0);
    expect(checkRepo(path).findings.filter((row) => row.message.startsWith("a1-docs-contract "))).toEqual([
      { code: "unit-oversize", path, line: a1.line, message: `a1-docs-contract spans ${a1.lines} lines` },
      { code: "unit-prewritten", path, line: a1.line, message: `a1-docs-contract carries prewritten text at line ${a1.line + fence}` },
    ]);
  });
  it("reports the first `### ADDED REQ-` entry of plan 015 as delta-verbose", () => {
    // The plan is a fixture of the heading form here, so the entry is found by that form and its numbers are read
    // from the plan. No id of the plan's spec is written in this file: the spec-status gate reads an id cited by a
    // test as that requirement's proof, and this case proves nothing about the board.
    const path = "docs/plans/015-board-writes.md";
    const rows = readFileSync(path, "utf8").split(/\r?\n/);
    const at = rows.findIndex((row) => row.startsWith("### ADDED REQ-"));
    const next = rows.findIndex((row, index) => index > at && /^#{1,6}\s/.test(row));
    const id = /^### ADDED (\S+)/.exec(rows[at] ?? "")?.[1];
    const below = rows.slice(at + 1, next).filter((row) => row.trim()).length;
    expect(at).toBeGreaterThan(-1);
    expect(below).toBeGreaterThan(6);
    const result = checkRepo(path);
    expect(result.status).toBe("pass");
    expect(result.findings.find((row) => row.code === "delta-verbose"))
      .toEqual({ code: "delta-verbose", path, line: at + 1, message: `${id} runs ${below} lines` });
  });
});
