import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve("content/skills/st-verify/scripts/spec-plan-coverage.mjs");
const dirs: string[] = [];
const spec = "## Requirements\n\n### REQ-DEMO-001\nReject expired values.\n### REQ-DEMO-002\nKeep retry state.\n";
const plan = "## Spec delta\n\nADDED REQ-DEMO-001, REQ-DEMO-002.\n\n## Units\n\n### U1 — guard\n- **requirements**: REQ-DEMO-001.\n- **depends_on**: none.\n\n### U2 — retry\n- **requirements**: REQ-DEMO-002.\n- **depends_on**: U1.\n";
function check(planText = plan, specText = spec) {
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
  it("passes complete plans while requiring independent semantic review", () => {
    expect(check()).toMatchObject({ status: "pass", semanticReview: "required", findings: [] });
  });
  it("finds an uncovered in-scope requirement even when every unit cites a valid id", () => {
    expect(check(plan.replace("- **requirements**: REQ-DEMO-002.", "- **requirements**: REQ-DEMO-001.")).findings)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "missing-coverage" })]));
  });
  it("finds dangling requirement and dependency references", () => {
    const result = check(plan.replace("- **requirements**: REQ-DEMO-002.", "- **requirements**: REQ-DEMO-999.").replace("- **depends_on**: U1.", "- **depends_on**: U9."));
    expect(result.findings.map((row) => row.code)).toEqual(expect.arrayContaining(["dangling-requirement", "dangling-dependency"]));
  });
  it("rejects duplicate definitions, units and repeated references without forbidding shared coverage", () => {
    expect(check(plan + "\n### U2 — other\n- **requirements**: REQ-DEMO-001, REQ-DEMO-001.\n- **depends_on**: U1, U1.\n", spec + "\n### REQ-DEMO-001\nDuplicate.\n").findings.map((row) => row.code))
      .toEqual(expect.arrayContaining(["duplicate-requirement", "duplicate-unit", "duplicate-reference", "duplicate-dependency"]));
    expect(check(plan.replace("- **requirements**: REQ-DEMO-002.", "- **requirements**: REQ-DEMO-001, REQ-DEMO-002.")).status).toBe("pass");
  });
  it("supports table fields and legacy shortened requirement ranges", () => {
    const legacy = "## Spec delta\nMODIFIED REQ-DEMO-001–002.\n## Units\n### unit-one\n| Field | Value |\n| id | unit-one |\n| requirements | REQ-DEMO-001, -002 |\n| depends_on | none |\n";
    expect(check(legacy).status).toBe("pass");
  });
  it("requires retirement disposition without demanding implementation coverage for removed ids", () => {
    const removal = "## Spec delta\nREMOVED REQ-DEMO-002 — retired; superseded by REQ-DEMO-001.\n## Units\n### U1\n- **requirements**: REQ-DEMO-001.\n- **depends_on**: none.\n";
    expect(check(removal).status).toBe("pass");
    expect(check(removal.replace("— retired; superseded by REQ-DEMO-001", "")).findings.map((row) => row.code)).toContain("missing-retirement");
  });
  it("does not certify semantic clarity or silently pass absent structure", () => {
    expect(check(plan, spec.replace("Reject expired values.", "Expire promptly or retain indefinitely, whichever is appropriate.")).semanticReview).toBe("required");
    expect(check("A freeform legacy note.").findings.map((row) => row.code)).toContain("missing-units");
  });
  it("ignores requirement-like examples in fenced blocks", () => {
    expect(check(plan, spec + "\n```md\n### REQ-DEMO-001\n```\n").status).toBe("pass");
  });
  it("rejects mixed valid and unknown dependencies instead of dropping the unknown token", () => {
    for (const value of ["U1, missing-unit", "U1, docs/missing.md", "U1 and missing-unit"]) {
      expect(check(plan.replace("- **depends_on**: U1.", `- **depends_on**: ${value}.`)).findings.map((row) => row.code)).toContain("dangling-dependency");
    }
  });
  it("rejects malformed requirement tokens beside valid IDs", () => {
    expect(check(plan.replace("REQ-DEMO-002.", "REQ-DEMO-002, REQ-DEMO-00X.")).findings.map((row) => row.code)).toContain("invalid-reference");
  });
  it("checks every removed ID and expands removed ranges", () => {
    const removal = "## Spec delta\nREMOVED REQ-DEMO-001–002 — retired with disposition: replaced externally.\n## Units\n### U1\n- **requirements**: REQ-DEMO-001.\n- **depends_on**: none.\n";
    expect(check(removal).status).toBe("pass");
    expect(check(removal.replace("001–002", "001–003")).findings.some((row) => row.code === "dangling-requirement" && row.message.includes("003"))).toBe(true);
  });
  it("reads the persisted candidate plan with all ten requirements", () => {
    expect(check(readFileSync("docs/plans/006-finish-implementation.md", "utf8"), readFileSync("docs/specs/implementation-finish.md", "utf8")).status).toBe("pass");
  });

  // CHECK-1, the three false-pass classes. Each one let a plan through with requirements out of
  // scope, so the checker reported a clean structure over work nobody had assigned.
  describe("prose delta shapes that used to pass with requirements out of scope", () => {
    const wideSpec = ["## Requirements", "", ...[1, 2, 3].map((n) => `### REQ-DEMO-00${n}\nRule ${n}.`)].join("\n") + "\n";
    it("expands a prose range and finds the middle ID nobody covers", () => {
      const prose = "## Spec delta\nADDED REQ-DEMO-001 … REQ-DEMO-003.\n## Units\n### U1\n- **requirements**: REQ-DEMO-001, REQ-DEMO-003.\n- **depends_on**: none.\n";
      const result = check(prose, wideSpec);
      expect(result.scope).toEqual(["REQ-DEMO-001", "REQ-DEMO-002", "REQ-DEMO-003"]);
      expect(result.findings).toEqual([expect.objectContaining({ code: "missing-coverage", message: expect.stringContaining("REQ-DEMO-002") })]);
    });
    it.each(["to", "through", "-"])("expands the %s range form as well", (connector) => {
      expect(check(`## Spec delta\nADDED REQ-DEMO-001 ${connector} REQ-DEMO-003.\n## Units\n### U1\n- **requirements**: REQ-DEMO-001, -002, -003.\n- **depends_on**: none.\n`, wideSpec))
        .toMatchObject({ status: "pass", scope: ["REQ-DEMO-001", "REQ-DEMO-002", "REQ-DEMO-003"] });
    });
    it("refuses a range whose endpoints name two areas instead of reading it as one ID", () => {
      const crossing = check("## Spec delta\nADDED REQ-DEMO-001 … REQ-OTHER-003.\n## Units\n### U1\n- **requirements**: REQ-DEMO-001.\n- **depends_on**: none.\n", wideSpec);
      expect(crossing.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "invalid-reference",
        message: expect.stringContaining("spans two areas") })]));
    });
    it("reports a range nothing closes rather than silently scoping its opening ID", () => {
      const open = check("## Spec delta\nADDED REQ-DEMO-001 … and the rest of that area.\n## Units\n### U1\n- **requirements**: REQ-DEMO-001.\n- **depends_on**: none.\n", wideSpec);
      expect(open.status).toBe("fail");
      expect(open.findings).toEqual([expect.objectContaining({ code: "partial-scope" })]);
    });
    it("reports an absent or suffixed Spec delta heading instead of passing with nothing in scope", () => {
      expect(check(plan.replace("## Spec delta\n\nADDED REQ-DEMO-001, REQ-DEMO-002.\n\n", "")).findings.map((row) => row.code))
        .toContain("missing-spec-delta");
      expect(check(plan.replace("## Spec delta", "## Spec delta (proposed)")))
        .toMatchObject({ status: "pass", scope: ["REQ-DEMO-001", "REQ-DEMO-002"] });
    });
    it("classifies each keyword on a line carrying both an addition and a removal", () => {
      const mixed = "## Spec delta\nADDED REQ-DEMO-001. REMOVED REQ-DEMO-002 — retired; superseded by REQ-DEMO-001.\n## Units\n### U1\n- **requirements**: REQ-DEMO-001.\n- **depends_on**: none.\n";
      expect(check(mixed)).toMatchObject({ status: "pass", scope: ["REQ-DEMO-001"] });
      // The addition is in scope, so dropping its unit is now caught; before the split the whole
      // line read as a removal and the added ID was never scoped at all.
      expect(check(mixed.replace("- **requirements**: REQ-DEMO-001.", "- **requirements**: spec carries no ids.")).findings.map((row) => row.code))
        .toContain("missing-coverage");
    });
  });

  describe("reference and heading shapes the checker used to reject with a misleading message", () => {
    it("reads a linked, suffixed or parenthesised ID as the ID it carries", () => {
      for (const written of ["[REQ-DEMO-001](#req-demo-001)", "REQ-DEMO-001: the guard", "(REQ-DEMO-001)"]) {
        const result = check(plan.replace("ADDED REQ-DEMO-001, REQ-DEMO-002.", `ADDED ${written}, REQ-DEMO-002.`));
        expect(result.findings, written).toEqual([]);
        expect(result.scope, written).toContain("REQ-DEMO-001");
      }
    });
    it("does not read a negative measurement in prose as a requirement", () => {
      const measured = check(plan.replace("ADDED REQ-DEMO-001, REQ-DEMO-002.", "ADDED REQ-DEMO-001, REQ-DEMO-002. The budget -200ms stays."));
      expect(measured.status).toBe("pass");
      expect(measured.scope).toEqual(["REQ-DEMO-001", "REQ-DEMO-002"]);
    });
    it("takes the unit ID off a colon-suffixed heading", () => {
      expect(check(plan.replace("### U1 — guard", "### U1: guard").replace("### U2 — retry", "### U2: retry")))
        .toMatchObject({ status: "pass", units: ["U1", "U2"] });
    });
  });

  describe("a plan whose spec is not written yet", () => {
    const unspecified = "## Spec delta\n\n### REQ-NEW-001\nGiven a fresh plan, Then the heading defines it.\n\n## Units\n### U1\n- **requirements**: REQ-NEW-001.\n- **depends_on**: none.\n";
    it("reads the plan's own delta headings as provisional definitions and stays a pass", () => {
      const result = check(unspecified);
      expect(result.status).toBe("pass");
      expect(result.findings).toEqual([expect.objectContaining({ code: "provisional-definition",
        message: expect.stringContaining("REQ-NEW-001") })]);
      expect(result.scope).toEqual(["REQ-NEW-001"]);
    });
    it("still refuses a second provisional definition of one ID", () => {
      expect(check(unspecified.replace("## Units", "### REQ-NEW-001\nStated twice.\n\n## Units")).findings.map((row) => row.code))
        .toContain("duplicate-requirement");
    });
    it("lets the spec win where one exists, with no provisional reading", () => {
      expect(check("## Spec delta\n\n### REQ-DEMO-001\nRestated from the spec.\n\n## Units\n### U1\n- **requirements**: REQ-DEMO-001.\n- **depends_on**: none.\n"))
        .toMatchObject({ status: "pass", findings: [] });
    });
  });

  // `/st-plan` writes numbered and suffixed section headings (`## 2. Spec delta`, `## 3. Units — engine`),
  // and a repository with no spec tree passes `docs/specs` that does not exist. Both used to stop the
  // checker: the first read no unit at all, the second exited 2 before reading the plan.
  describe("plans written by /st-plan and a repository with no spec tree", () => {
    type Report = ReturnType<typeof check>;
    function run(args: string[], planText = plan, specText?: string) {
      const dir = mkdtempSync(join(tmpdir(), "stamity-plan-"));
      dirs.push(dir);
      writeFileSync(join(dir, "plan.md"), planText);
      if (specText !== undefined) writeFileSync(join(dir, "spec.md"), specText);
      try {
        const stdout = execFileSync(process.execPath, [script, ...args], { cwd: dir, encoding: "utf8", stdio: "pipe" });
        return { code: 0, report: JSON.parse(stdout) as Report };
      } catch (error) {
        const failed = error as { status?: number; stdout?: string };
        const stdout = String(failed.stdout ?? "");
        return { code: failed.status ?? -1, report: stdout ? JSON.parse(stdout) as Report : undefined };
      }
    }
    const numbered = plan.replace("## Spec delta", "## 2. Spec delta").replace("## Units", "## 3. Units — engine");
    const noIds = "## Spec delta\n\nNone: this plan changes no requirement.\n\n## Units\n\n### U1 — guard\n- **requirements**: spec carries no ids.\n- **depends_on**: none.\n";

    it("reads numbered and suffixed Spec delta and Units headings", () => {
      expect(check(numbered)).toMatchObject({ status: "pass", scope: ["REQ-DEMO-001", "REQ-DEMO-002"], units: ["U1", "U2"], findings: [] });
      // The activated reading is distinguishable from the old one: an uncovered ID is now caught under the numbered heading.
      expect(check(numbered.replace("- **requirements**: REQ-DEMO-002.", "- **requirements**: REQ-DEMO-001.")).findings.map((row) => row.code))
        .toEqual(["missing-coverage"]);
    });
    it("matches `## 10. Units` but not a heading that only starts with the letters", () => {
      expect(check(plan.replace("## Units", "## 10. Units"))).toMatchObject({ status: "pass", units: ["U1", "U2"] });
      expect(check(plan.replace("## Units", "## Unitsafety")).findings.map((row) => row.code)).toContain("missing-units");
    });
    it("reads a missing spec directory as no spec and passes a plan whose units carry no ids", () => {
      const { code, report } = run(["plan.md", "docs/specs"], noIds);
      expect(code).toBe(0);
      expect(report).toMatchObject({ status: "pass", scope: [], units: ["U1"] });
      expect(report?.findings).toEqual([expect.objectContaining({ code: "missing-spec-input", path: "docs/specs", line: 1,
        message: expect.stringContaining("docs/specs does not exist; read as no spec") })]);
    });
    it("still fails a unit citing an ID nothing defines when the spec directory is missing", () => {
      const { code, report } = run(["plan.md", "docs/specs"], plan.replace("ADDED REQ-DEMO-001, REQ-DEMO-002.", "None.")
        .replace("### U2 — retry\n- **requirements**: REQ-DEMO-002.\n- **depends_on**: U1.\n", ""));
      expect(code).toBe(1);
      expect(report?.findings.map((row) => row.code)).toEqual(["missing-spec-input", "dangling-requirement"]);
    });
    it("passes a provisional delta heading over a missing spec directory with both advisories", () => {
      const provisional = "## Spec delta\n\n### REQ-NEW-001\nGiven a fresh plan, Then the heading defines it.\n\n## Units\n### U1\n- **requirements**: REQ-NEW-001.\n- **depends_on**: none.\n";
      const { code, report } = run(["plan.md", "docs/specs"], provisional);
      expect(code).toBe(0);
      expect(report?.findings.map((row) => row.code).toSorted()).toEqual(["missing-spec-input", "provisional-definition"]);
    });
    it("keeps exit 2 for a missing Markdown spec and for a missing plan", () => {
      expect(run(["plan.md", "missing.md"]).code).toBe(2);
      expect(run(["absent-plan.md", "spec.md"], plan, spec).code).toBe(2);
    });
    it("keeps exit 2 for a missing spec named with any file extension, not only `.md`", () => {
      for (const name of ["spec.txt", "spec.markdown", "Spec.MD", "docs/specs/auth.md"]) expect(run(["plan.md", name], noIds).code).toBe(2);
    });
    it("reports a repeated missing spec directory once", () => {
      const { code, report } = run(["plan.md", "docs/specs", "docs/specs"], noIds);
      expect(code).toBe(0);
      expect(report?.findings.map((row) => row.code)).toEqual(["missing-spec-input"]);
    });
  });

  it("scopes all twenty-two requirements of the persisted Prove plan, not its range endpoints", () => {
    const result = check(readFileSync("docs/plans/007-prove-behavior-and-value.md", "utf8"),
      readFileSync("docs/specs/prove-behavior-and-value.md", "utf8"));
    expect(result.status).toBe("pass");
    expect(result.scope).toHaveLength(22);
  });
});

// REQ-FLOW-070 — plan-lint L5. The size codes are advisory: each one names a unit or a delta entry
// and its line, and none of them turns the status to `fail`.
describe("REQ-FLOW-070 — plan size, advisory (L5)", () => {
  type Finding = { code: string; path: string; line: number; message: string };
  const L5 = new Set(["unit-size", "unit-oversize", "unit-prewritten", "delta-verbose"]);
  /** U1 grown to `span` lines (its heading and two fields included), one blank line before `### U2`. */
  const grown = (span: number, filler = (n: number) => `Note ${n}.`) => plan.replace("- **depends_on**: none.\n",
    `- **depends_on**: none.\n${Array.from({ length: span - 3 }, (_, n) => filler(n)).join("\n")}\n`);
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

  it("starts a unit only at an unindented `### ` line, so an indented heading-like line is no unit", () => {
    for (const written of ["  ### X", "  `### Item text is data` naming the rule"]) {
      const result = check(plan.replace("- **depends_on**: none.\n", `- **depends_on**: none.\n${written}\n`));
      expect(result, written).toMatchObject({ status: "pass", units: ["U1", "U2"], findings: [] });
    }
  });
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
  it("counts a unit whole past a `## ` line inside its fence", () => {
    // Heading, two fields, the opening fence, the fenced `## ` line, 57 notes and the closing fence: 63 lines. Read
    // as a section heading, the fenced line would end the Units section at five lines and lose U2 with it.
    const fenced = check(plan.replace("- **depends_on**: none.\n",
      `- **depends_on**: none.\n\`\`\`md\n## Inside the fence\n${Array.from({ length: 57 }, (_, n) => `Note ${n}.`).join("\n")}\n\`\`\`\n`));
    expect(fenced).toMatchObject({ status: "pass", units: ["U1", "U2"], findings: [
      { code: "unit-size", path: "plan.md", line: 7, message: "U1 spans 63 lines" },
      { code: "unit-prewritten", path: "plan.md", line: 7, message: "U1 carries prewritten text at line 10" },
    ] });
  });
  it("reports a unit past 60 lines as unit-size and past 100 as unit-oversize, counting no trailing blank line", () => {
    const sized = (span: number) => check(grown(span));
    expect(sized(60)).toMatchObject({ status: "pass", findings: [] });
    expect(sized(61)).toMatchObject({ status: "pass",
      findings: [{ code: "unit-size", path: "plan.md", line: 7, message: "U1 spans 61 lines" }] });
    expect(sized(100)).toMatchObject({ status: "pass",
      findings: [{ code: "unit-size", path: "plan.md", line: 7, message: "U1 spans 100 lines" }] });
    expect(sized(101)).toMatchObject({ status: "pass",
      findings: [{ code: "unit-oversize", path: "plan.md", line: 7, message: "U1 spans 101 lines" }] });
  });
  it("keeps a `####` sub-heading inside the unit's span", () => {
    expect(check(grown(61, (n) => (n === 10 ? "#### U1 text" : `Note ${n}.`))).findings)
      .toEqual([expect.objectContaining({ code: "unit-size", message: "U1 spans 61 lines" })]);
  });
  it("reports a fence, or a run of five `>` lines, inside a unit as unit-prewritten", () => {
    const fenced = check(plan.replace("- **depends_on**: none.\n", "- **depends_on**: none.\n```md\n### REQ-DEMO-001\n```\n"));
    expect(fenced).toMatchObject({ status: "pass", units: ["U1", "U2"],
      findings: [{ code: "unit-prewritten", path: "plan.md", line: 7, message: "U1 carries prewritten text at line 10" }] });
    const quoted = (count: number) => check(plan.replace("- **depends_on**: none.\n",
      `- **depends_on**: none.\nIntro.\n${Array.from({ length: count }, (_, n) => (n === 1 ? "   >" : `   > Line ${n}.`)).join("\n")}\n`));
    expect(quoted(4)).toMatchObject({ status: "pass", findings: [] });
    expect(quoted(5)).toMatchObject({ status: "pass",
      findings: [{ code: "unit-prewritten", path: "plan.md", line: 7, message: "U1 carries prewritten text at line 11" }] });
  });
  it("reports a delta entry holding more than six non-blank lines below its heading as delta-verbose", () => {
    const entry = (count: number) => check(`## Spec delta\n\n### REQ-DEMO-001 — the guard\n${
      Array.from({ length: count }, (_, n) => `Given value ${n}, Then it holds.`).join("\n\n")
    }\n\n## Units\n### U1\n- **requirements**: REQ-DEMO-001.\n- **depends_on**: none.\n`);
    expect(entry(6)).toMatchObject({ status: "pass", findings: [] });
    expect(entry(7)).toMatchObject({ status: "pass",
      findings: [{ code: "delta-verbose", path: "plan.md", line: 3, message: "REQ-DEMO-001 runs 7 lines" }] });
  });
  it("reads an entry headed `ADDED`, `MODIFIED` or `REMOVED` before its id as a delta entry too", () => {
    // A retired id needs no unit, so the REMOVED plan's one unit cites the other requirement.
    for (const [heading, cited] of [["ADDED REQ-DEMO-001 — the guard", "REQ-DEMO-001"],
      ["MODIFIED REQ-DEMO-001 — the guard", "REQ-DEMO-001"], ["REMOVED REQ-DEMO-001 — retired", "REQ-DEMO-002"]]) {
      const entry = (count: number) => check(`## Spec delta\n\n### ${heading}\n${
        Array.from({ length: count }, (_, n) => `Given value ${n}, Then it holds.`).join("\n\n")
      }\n\n## Units\n### U1\n- **requirements**: ${cited}.\n- **depends_on**: none.\n`);
      expect(entry(6), heading).toMatchObject({ status: "pass", findings: [] });
      expect(entry(7), heading).toMatchObject({ status: "pass",
        findings: [{ code: "delta-verbose", path: "plan.md", line: 3, message: "REQ-DEMO-001 runs 7 lines" }] });
    }
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
  it("still reads no `### ADDED REQ-` heading as a provisional definition", () => {
    // The definition reading is a separate rule and keeps its shape: only a bare `### REQ-` heading defines an id for
    // a plan whose spec is not written, so a `### REMOVED REQ-` heading can never define the id it retires.
    const result = check("## Spec delta\n\n### ADDED REQ-NEW-001 — the guard\nGiven a fresh plan, Then it holds.\n\n## Units\n### U1\n- **requirements**: REQ-NEW-001.\n- **depends_on**: none.\n");
    expect(result.status).toBe("fail");
    expect(result.findings.map((row) => row.code)).not.toContain("provisional-definition");
    expect(result.findings.map((row) => row.code)).toContain("dangling-requirement");
  });
  it("adds no L5 code to a plan with no units section", () => {
    expect(check("A freeform legacy note.").findings.map((row) => row.code).filter((code) => L5.has(code))).toEqual([]);
    // A long, fenced `###` block outside any Units section is no unit, so only the existing finding is raised.
    const noUnits = `## Spec delta\n\nNone.\n\n## Notes\n### N1\n${Array.from({ length: 70 }, (_, n) => `Note ${n}.`).join("\n")}\n\`\`\`\nx\n\`\`\`\n`;
    expect(check(noUnits).findings.map((row) => row.code)).toEqual(["missing-units"]);
  });
});
