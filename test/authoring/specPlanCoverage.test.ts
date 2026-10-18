import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  it("rejects a malformed shorthand beside a valid ID instead of reading the valid ID alone", () => {
    const result = check(plan.replace("- **requirements**: REQ-DEMO-002.", "- **requirements**: REQ-DEMO-002, -00X."));
    expect(result.status).toBe("fail");
    expect(result.findings).toContainEqual(expect.objectContaining({ code: "invalid-reference", message: "Malformed requirement reference: -00X" }));
  });
  it("checks every removed ID and expands removed ranges", () => {
    const removal = "## Spec delta\nREMOVED REQ-DEMO-001–002 — retired with disposition: replaced externally.\n## Units\n### U1\n- **requirements**: REQ-DEMO-001.\n- **depends_on**: none.\n";
    expect(check(removal).status).toBe("pass");
    expect(check(removal.replace("001–002", "001–003")).findings.some((row) => row.code === "dangling-requirement" && row.message.includes("003"))).toBe(true);
  });
  // TEST CHANGE, justified (2026-10-14, r1b-records-suite-eval-cases): "reads the persisted candidate plan with all
  // ten requirements" reads plan 006, a record that leaves `main`; it moved unchanged to
  // test/records/specPlanCoverage.test.ts, under this describe's name.

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

  // TEST CHANGE, justified (2026-10-14, r1b-records-suite-eval-cases): this case read plan 007 and its spec, and plan
  // 007 is a record that leaves `main`. It is synthetic now, written in the two shapes plan 007 adds over the prose
  // range case above: the colon form (`ADDED: … … …`) and a second ADDED clause on the same line, over table-form
  // units. The scope is asserted as the exact four ids, which neither an endpoints-only reading (no REQ-X-002) nor a
  // first-clause-only reading (no REQ-X-004) produces; the twenty-two of the real plan is no longer counted.
  it("scopes all four requirements of a Prove-shaped plan, not its range endpoints", () => {
    const unit = (id: string, requirements: string, dependsOn: string) =>
      `### ${id} — a unit\n\n| Field | Content |\n|---|---|\n| \`id\` | ${id} |\n| \`requirements\` | ${requirements} |\n| \`depends_on\` | ${dependsOn} |\n`;
    const prove = "## Spec delta\n\nThe spec is the source. ADDED: REQ-X-001 … REQ-X-003, one per numbered requirement. " +
      `ADDED at the merge: REQ-X-004, landed by a follow-up unit.\n\n## Units\n\n${unit("u1", "REQ-X-001, REQ-X-002", "none")}\n` +
      unit("u2", "REQ-X-003, REQ-X-004", "u1");
    const proveSpec = ["## Requirements", "", ...[1, 2, 3, 4].map((n) => `### REQ-X-00${n}\nRule ${n}.`)].join("\n") + "\n";
    const result = check(prove, proveSpec);
    expect(result.status).toBe("pass");
    expect(result.scope).toEqual(["REQ-X-001", "REQ-X-002", "REQ-X-003", "REQ-X-004"]);
  });
});

describe("REQ-FLOW-091 — a cycle reported once and the bare shorthand, through the skill's command", () => {
  const units = (rows: string[]) => rows.map((row) => {
    const [id, dependsOn] = row.split(": ");
    return `### ${id}\n- **requirements**: spec carries no ids.\n- **depends_on**: ${dependsOn}.\n`;
  }).join("\n");
  const covered = (requirements: string) =>
    `## Spec delta\n\nADDED REQ-DEMO-001, REQ-DEMO-002.\n\n## Units\n\n### U1 — guard\n- **requirements**: ${requirements}.\n- **depends_on**: none.\n`;

  it("reports one dependency-cycle from the unit found on the stack, whatever leads into it", () => {
    const result = check(`## Spec delta\n\nNone.\n\n## Units\n\n${units(["a: b", "b: a", "x: a", "y: x, b"])}`);
    expect(result.status).toBe("fail");
    expect(result.findings).toEqual([expect.objectContaining({ code: "dependency-cycle", message: "Dependency cycle: a -> b -> a." })]);
  });
  it("reads `REQ-DEMO-001, 002` in a unit's requirements as covering REQ-DEMO-002", () => {
    // Read as REQ-DEMO-001 alone, U1 would leave REQ-DEMO-002 uncovered.
    expect(check(covered("REQ-DEMO-001, 002"))).toMatchObject({ status: "pass", findings: [] });
    expect(check(covered("REQ-DEMO-001, 002, 009")).findings).toEqual([expect.objectContaining({ code: "dangling-requirement",
      message: expect.stringContaining("REQ-DEMO-009") })]);
  });
  it("reads a number in delta prose, and a negative measurement after a comma, as today", () => {
    expect(check(covered("REQ-DEMO-001, REQ-DEMO-002").replace("ADDED REQ-DEMO-001, REQ-DEMO-002.", "ADDED REQ-DEMO-001, 002 cases.")))
      .toMatchObject({ status: "pass", scope: ["REQ-DEMO-001"] });
    expect(check(plan.replace("ADDED REQ-DEMO-001, REQ-DEMO-002.", "ADDED REQ-DEMO-001, REQ-DEMO-002. A budget of 300ms, -50ms.")).findings)
      .toEqual([expect.objectContaining({ code: "invalid-reference", message: "Malformed requirement reference: -50ms" })]);
  });
});

// REQ-FLOW-070 — plan-lint L5. The size codes are advisory: each one names a unit or a delta entry
// and its line, and none of them turns the status to `fail`.
describe("REQ-FLOW-070 — plan size, advisory (L5)", () => {
  const L5 = new Set(["unit-size", "unit-oversize", "unit-prewritten", "delta-verbose"]);
  /** U1 grown to `span` lines (its heading and two fields included), one blank line before `### U2`. */
  const grown = (span: number, filler = (n: number) => `Note ${n}.`) => plan.replace("- **depends_on**: none.\n",
    `- **depends_on**: none.\n${Array.from({ length: span - 3 }, (_, n) => filler(n)).join("\n")}\n`);

  it("starts a unit only at an unindented `### ` line, so an indented heading-like line is no unit", () => {
    for (const written of ["  ### X", "  `### Item text is data` naming the rule"]) {
      const result = check(plan.replace("- **depends_on**: none.\n", `- **depends_on**: none.\n${written}\n`));
      expect(result, written).toMatchObject({ status: "pass", units: ["U1", "U2"], findings: [] });
    }
  });
  // TEST CHANGE, justified (2026-10-14, r1b-records-suite-eval-cases): the four cases that read a persisted plan
  // (015 twice, 013-02, 017-01) moved unchanged, with the checkRepo and planRows helpers they used, to
  // test/records/specPlanCoverage.test.ts under this describe's name: those plans are records that leave `main`.
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
