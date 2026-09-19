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

  it("scopes all twenty-two requirements of the persisted Prove plan, not its range endpoints", () => {
    const result = check(readFileSync("docs/plans/007-prove-behavior-and-value.md", "utf8"),
      readFileSync("docs/specs/prove-behavior-and-value.md", "utf8"));
    expect(result.status).toBe("pass");
    expect(result.scope).toHaveLength(22);
  });
});
