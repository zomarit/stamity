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
  return JSON.parse(output) as { status: string; semanticReview: string; findings: { code: string; message: string }[] };
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
});
