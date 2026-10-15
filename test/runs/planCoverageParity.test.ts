import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — the skill's standalone native ESM copy, shipped as content with no declaration file.
import { checkCoverage as skillCheckCoverage } from "../../content/skills/st-verify/scripts/spec-plan-coverage.mjs";
import { checkCoverage, parsePlanUnits, type CoverageOptions, type CoverageResult } from "../../src/runs/planCoverage.ts";

/**
 * The structural coverage check has two twins: the skill's standalone `.mjs`
 * (`content/skills/st-verify/scripts/spec-plan-coverage.mjs`), which a client
 * runs with plain `node`, and the engine's port (`src/runs/planCoverage.ts`),
 * which `stamity plan check` reads. Every fixture of
 * `test/authoring/specPlanCoverage.test.ts` runs through both, the same
 * `exists` injected into each, and the two results must deep-equal: codes,
 * messages, lines and their order. No mock of either side: the contract is that
 * the two readers agree on the same text, so both read the same text. The only
 * stand-in is `exists`, a recorded set of paths, because the dependency check's
 * file-system look is the option both twins expose for exactly this.
 */

type Doc = { path: string; text: string };
const skill = skillCheckCoverage as (plan: Doc, specs: Doc[], options?: CoverageOptions) => CoverageResult;

const spec = "## Requirements\n\n### REQ-DEMO-001\nReject expired values.\n### REQ-DEMO-002\nKeep retry state.\n";
const plan = "## Spec delta\n\nADDED REQ-DEMO-001, REQ-DEMO-002.\n\n## Units\n\n### U1 — guard\n- **requirements**: REQ-DEMO-001.\n- **depends_on**: none.\n\n### U2 — retry\n- **requirements**: REQ-DEMO-002.\n- **depends_on**: U1.\n";
const wideSpec = ["## Requirements", "", ...[1, 2, 3].map((n) => `### REQ-DEMO-00${n}\nRule ${n}.`)].join("\n") + "\n";
const noIds = "## Spec delta\n\nNone: this plan changes no requirement.\n\n## Units\n\n### U1 — guard\n- **requirements**: spec carries no ids.\n- **depends_on**: none.\n";
const numbered = plan.replace("## Spec delta", "## 2. Spec delta").replace("## Units", "## 3. Units — engine");
const removal = "## Spec delta\nREMOVED REQ-DEMO-002 — retired; superseded by REQ-DEMO-001.\n## Units\n### U1\n- **requirements**: REQ-DEMO-001.\n- **depends_on**: none.\n";
const removedRange = "## Spec delta\nREMOVED REQ-DEMO-001–002 — retired with disposition: replaced externally.\n## Units\n### U1\n- **requirements**: REQ-DEMO-001.\n- **depends_on**: none.\n";
const mixed = "## Spec delta\nADDED REQ-DEMO-001. REMOVED REQ-DEMO-002 — retired; superseded by REQ-DEMO-001.\n## Units\n### U1\n- **requirements**: REQ-DEMO-001.\n- **depends_on**: none.\n";
const unspecified = "## Spec delta\n\n### REQ-NEW-001\nGiven a fresh plan, Then the heading defines it.\n\n## Units\n### U1\n- **requirements**: REQ-NEW-001.\n- **depends_on**: none.\n";
const tableUnit = (id: string, requirements: string, dependsOn: string) =>
  `### ${id} — a unit\n\n| Field | Content |\n|---|---|\n| \`id\` | ${id} |\n| \`requirements\` | ${requirements} |\n| \`depends_on\` | ${dependsOn} |\n`;
const prove = "## Spec delta\n\nThe spec is the source. ADDED: REQ-X-001 … REQ-X-003, one per numbered requirement. " +
  `ADDED at the merge: REQ-X-004, landed by a follow-up unit.\n\n## Units\n\n${tableUnit("u1", "REQ-X-001, REQ-X-002", "none")}\n` +
  tableUnit("u2", "REQ-X-003, REQ-X-004", "u1");
const proveSpec = ["## Requirements", "", ...[1, 2, 3, 4].map((n) => `### REQ-X-00${n}\nRule ${n}.`)].join("\n") + "\n";
const grown = (span: number, filler = (n: number) => `Note ${n}.`) => plan.replace("- **depends_on**: none.\n",
  `- **depends_on**: none.\n${Array.from({ length: span - 3 }, (_, n) => filler(n)).join("\n")}\n`);
const quoted = (count: number) => plan.replace("- **depends_on**: none.\n",
  `- **depends_on**: none.\nIntro.\n${Array.from({ length: count }, (_, n) => (n === 1 ? "   >" : `   > Line ${n}.`)).join("\n")}\n`);
const deltaEntry = (heading: string, cited: string, count: number) => `## Spec delta\n\n### ${heading}\n${
  Array.from({ length: count }, (_, n) => `Given value ${n}, Then it holds.`).join("\n\n")
}\n\n## Units\n### U1\n- **requirements**: ${cited}.\n- **depends_on**: none.\n`;
/** A path a dependency may name that the injected `exists` reports present, so the activated look is in the set. */
const PRESENT = "docs/present.md";

/** One fixture: a plan, its spec inputs (the CLI's `spec.md`, or none for a missing spec directory) and the missing inputs. */
interface Fixture { name: string; plan: string; specs?: string[]; missing?: string[] }
const fx = (name: string, planText: string, specText: string = spec): Fixture => ({ name, plan: planText, specs: [specText] });

const FIXTURES: Fixture[] = [
  fx("complete plan", plan),
  fx("uncovered in-scope requirement", plan.replace("- **requirements**: REQ-DEMO-002.", "- **requirements**: REQ-DEMO-001.")),
  fx("dangling requirement and dependency", plan.replace("- **requirements**: REQ-DEMO-002.", "- **requirements**: REQ-DEMO-999.").replace("- **depends_on**: U1.", "- **depends_on**: U9.")),
  fx("duplicates", plan + "\n### U2 — other\n- **requirements**: REQ-DEMO-001, REQ-DEMO-001.\n- **depends_on**: U1, U1.\n", spec + "\n### REQ-DEMO-001\nDuplicate.\n"),
  fx("shared coverage", plan.replace("- **requirements**: REQ-DEMO-002.", "- **requirements**: REQ-DEMO-001, REQ-DEMO-002.")),
  fx("table fields and legacy ranges", "## Spec delta\nMODIFIED REQ-DEMO-001–002.\n## Units\n### unit-one\n| Field | Value |\n| id | unit-one |\n| requirements | REQ-DEMO-001, -002 |\n| depends_on | none |\n"),
  fx("removal with disposition", removal),
  fx("removal without disposition", removal.replace("— retired; superseded by REQ-DEMO-001", "")),
  fx("vague spec", plan, spec.replace("Reject expired values.", "Expire promptly or retain indefinitely, whichever is appropriate.")),
  fx("freeform note", "A freeform legacy note."),
  fx("fenced example in the spec", plan, spec + "\n```md\n### REQ-DEMO-001\n```\n"),
  ...["U1, missing-unit", "U1, docs/missing.md", "U1 and missing-unit", `U1, ${PRESENT}`, "U1, external (owner: ops)"].map((value) =>
    fx(`mixed dependencies ${value}`, plan.replace("- **depends_on**: U1.", `- **depends_on**: ${value}.`))),
  fx("malformed token", plan.replace("REQ-DEMO-002.", "REQ-DEMO-002, REQ-DEMO-00X.")),
  fx("removed range", removedRange),
  fx("removed range past the spec", removedRange.replace("001–002", "001–003")),
  fx("prose range", "## Spec delta\nADDED REQ-DEMO-001 … REQ-DEMO-003.\n## Units\n### U1\n- **requirements**: REQ-DEMO-001, REQ-DEMO-003.\n- **depends_on**: none.\n", wideSpec),
  ...["to", "through", "-"].map((connector) => fx(`range ${connector}`,
    `## Spec delta\nADDED REQ-DEMO-001 ${connector} REQ-DEMO-003.\n## Units\n### U1\n- **requirements**: REQ-DEMO-001, -002, -003.\n- **depends_on**: none.\n`, wideSpec)),
  fx("cross-area range", "## Spec delta\nADDED REQ-DEMO-001 … REQ-OTHER-003.\n## Units\n### U1\n- **requirements**: REQ-DEMO-001.\n- **depends_on**: none.\n", wideSpec),
  fx("open range", "## Spec delta\nADDED REQ-DEMO-001 … and the rest of that area.\n## Units\n### U1\n- **requirements**: REQ-DEMO-001.\n- **depends_on**: none.\n", wideSpec),
  fx("no spec delta", plan.replace("## Spec delta\n\nADDED REQ-DEMO-001, REQ-DEMO-002.\n\n", "")),
  fx("suffixed spec delta", plan.replace("## Spec delta", "## Spec delta (proposed)")),
  fx("mixed keywords", mixed),
  fx("mixed keywords, addition uncovered", mixed.replace("- **requirements**: REQ-DEMO-001.", "- **requirements**: spec carries no ids.")),
  ...["[REQ-DEMO-001](#req-demo-001)", "REQ-DEMO-001: the guard", "(REQ-DEMO-001)"].map((written) =>
    fx(`reference shape ${written}`, plan.replace("ADDED REQ-DEMO-001, REQ-DEMO-002.", `ADDED ${written}, REQ-DEMO-002.`))),
  fx("negative measurement", plan.replace("ADDED REQ-DEMO-001, REQ-DEMO-002.", "ADDED REQ-DEMO-001, REQ-DEMO-002. The budget -200ms stays.")),
  fx("colon headings", plan.replace("### U1 — guard", "### U1: guard").replace("### U2 — retry", "### U2: retry")),
  fx("provisional definition", unspecified),
  fx("second provisional definition", unspecified.replace("## Units", "### REQ-NEW-001\nStated twice.\n\n## Units")),
  fx("spec wins over the delta heading", "## Spec delta\n\n### REQ-DEMO-001\nRestated from the spec.\n\n## Units\n### U1\n- **requirements**: REQ-DEMO-001.\n- **depends_on**: none.\n"),
  fx("numbered headings", numbered),
  fx("numbered headings, uncovered", numbered.replace("- **requirements**: REQ-DEMO-002.", "- **requirements**: REQ-DEMO-001.")),
  fx("## 10. Units", plan.replace("## Units", "## 10. Units")),
  fx("## Unitsafety", plan.replace("## Units", "## Unitsafety")),
  { name: "missing spec directory, no ids", plan: noIds, missing: ["docs/specs"] },
  { name: "missing spec directory, dangling", missing: ["docs/specs"], plan: plan.replace("ADDED REQ-DEMO-001, REQ-DEMO-002.", "None.")
    .replace("### U2 — retry\n- **requirements**: REQ-DEMO-002.\n- **depends_on**: U1.\n", "") },
  { name: "missing spec directory, provisional", plan: unspecified, missing: ["docs/specs"] },
  { name: "missing spec directory, repeated", plan: noIds, missing: ["docs/specs", "docs/specs"] },
  fx("Prove-shaped plan", prove, proveSpec),
  ...["  ### X", "  `### Item text is data` naming the rule"].map((written) =>
    fx(`indented heading ${written}`, plan.replace("- **depends_on**: none.\n", `- **depends_on**: none.\n${written}\n`))),
  fx("fenced `## ` inside a unit", plan.replace("- **depends_on**: none.\n",
    `- **depends_on**: none.\n\`\`\`md\n## Inside the fence\n${Array.from({ length: 57 }, (_, n) => `Note ${n}.`).join("\n")}\n\`\`\`\n`)),
  ...[60, 61, 100, 101].map((span) => fx(`unit of ${span} lines`, grown(span))),
  fx("#### sub-heading", grown(61, (n) => (n === 10 ? "#### U1 text" : `Note ${n}.`))),
  fx("fenced prewritten", plan.replace("- **depends_on**: none.\n", "- **depends_on**: none.\n```md\n### REQ-DEMO-001\n```\n")),
  fx("four quoted lines", quoted(4)),
  fx("five quoted lines", quoted(5)),
  ...[6, 7].map((count) => fx(`delta entry of ${count}`, deltaEntry("REQ-DEMO-001 — the guard", "REQ-DEMO-001", count))),
  ...[["ADDED REQ-DEMO-001 — the guard", "REQ-DEMO-001"], ["MODIFIED REQ-DEMO-001 — the guard", "REQ-DEMO-001"],
    ["REMOVED REQ-DEMO-001 — retired", "REQ-DEMO-002"]].flatMap(([heading = "", cited = ""]) =>
    [6, 7].map((count) => fx(`${heading} × ${count}`, deltaEntry(heading, cited, count)))),
  fx("### ADDED REQ- defines nothing", "## Spec delta\n\n### ADDED REQ-NEW-001 — the guard\nGiven a fresh plan, Then it holds.\n\n## Units\n### U1\n- **requirements**: REQ-NEW-001.\n- **depends_on**: none.\n"),
  fx("no units, long notes", `## Spec delta\n\nNone.\n\n## Notes\n### N1\n${Array.from({ length: 70 }, (_, n) => `Note ${n}.`).join("\n")}\n\`\`\`\nx\n\`\`\`\n`),
];

/** The same recorded `exists` for both twins; `cwd` pinned so the resolved paths do not depend on where vitest runs. */
function options(missing: string[] | undefined, seen: string[]): CoverageOptions {
  const exists = (path: string) => { seen.push(path); return path === resolve("/repo", PRESENT); };
  return missing ? { missingSpecInputs: missing, exists, cwd: "/repo" } : { exists, cwd: "/repo" };
}

function both(fixture: Fixture, crlf = false) {
  const eol = (text: string) => (crlf ? text.replaceAll("\n", "\r\n") : text);
  const planDoc = { path: "plan.md", text: eol(fixture.plan) };
  const specDocs = (fixture.specs ?? []).map((text) => ({ path: "spec.md", text: eol(text) }));
  const portSeen: string[] = [];
  const skillSeen: string[] = [];
  const port = checkCoverage(planDoc, specDocs, options(fixture.missing, portSeen));
  const copy = skill(planDoc, specDocs, options(fixture.missing, skillSeen));
  return { port, copy, portSeen, skillSeen };
}

describe("REQ-FLOW-091 — the engine's coverage check equals the skill's copy", () => {
  it.each(FIXTURES.map((fixture) => [fixture.name, fixture] as const))("%s", (_name, fixture) => {
    const { port, copy, portSeen, skillSeen } = both(fixture);
    expect(port).toEqual(copy);
    expect(portSeen).toEqual(skillSeen);
  });

  it("is not a parity of two empty results: the set activates findings, both statuses and the file-system look", () => {
    const results = FIXTURES.map((fixture) => both(fixture));
    const codes = new Set(results.flatMap(({ port }) => port.findings.map((row) => row.code)));
    expect([...codes].toSorted()).toEqual(["dangling-dependency", "dangling-requirement", "delta-verbose",
      "duplicate-dependency", "duplicate-reference", "duplicate-requirement", "duplicate-unit", "invalid-reference",
      "missing-coverage", "missing-retirement", "missing-spec-delta", "missing-spec-input", "missing-units", "partial-scope",
      "provisional-definition", "unit-oversize", "unit-prewritten", "unit-size"]);
    expect(new Set(results.map(({ port }) => port.status))).toEqual(new Set(["pass", "fail"]));
    const looked = results.flatMap(({ portSeen }) => portSeen);
    expect(looked).toContain(resolve("/repo", PRESENT));
    expect(looked).toContain(resolve("/repo", "docs/missing.md"));
  });

  it("matches the skill's copy on a dependency cycle and a repeated field", () => {
    const cycle = plan.replace("- **depends_on**: none.", "- **depends_on**: U2.").replace("- **requirements**: REQ-DEMO-002.",
      "- **requirements**: REQ-DEMO-002.\n- **requirements**: REQ-DEMO-002.");
    const { port, copy } = both(fx("cycle", cycle));
    expect(port).toEqual(copy);
    expect(port.findings.map((row) => row.code)).toEqual(["duplicate-field", "dependency-cycle", "dependency-cycle"]);
  });

  it("reads CRLF line endings exactly as LF, in both twins", () => {
    for (const fixture of FIXTURES) {
      const lf = both(fixture);
      const crlf = both(fixture, true);
      expect(crlf.port, fixture.name).toEqual(lf.port);
      expect(crlf.copy, fixture.name).toEqual(crlf.port);
    }
  });

  it("fails a plan with no `## Units` section with the skill's code", () => {
    const { port, copy } = both(fx("no units", "## Spec delta\n\nADDED REQ-DEMO-001.\n"));
    expect(port).toEqual(copy);
    expect(port.status).toBe("fail");
    expect(port.findings.map((row) => row.code)).toEqual(["missing-units", "missing-coverage"]);
  });

  it("raises no finding for a unit table with an extra field", () => {
    const extra = prove.replace("| `depends_on` | none |", "| `depends_on` | none |\n| `edgeCases` | an empty list |\n| `owner` | the ops team |");
    const { port, copy } = both(fx("extra field", extra, proveSpec));
    expect(port).toEqual(copy);
    expect(port).toMatchObject({ status: "pass", findings: [] });
  });
});

describe("parsePlanUnits — each unit's fields, read as the coverage check reads them", () => {
  const units = [
    "## Spec delta\n\nADDED REQ-DEMO-001 to REQ-DEMO-003.\n\n## Units\n\n",
    "### u1-guard — the guard\n\n| Field | Content |\n|---|---|\n| `id` | u1-guard |\n| `requirements` | REQ-DEMO-001, -002 |\n",
    "| `depends_on` | none |\n| `edgeCases` | An expired value → refused |\n| `verify` | `npx vitest run test/a.test.ts` |\n",
    "| `threat` | Boundary: the **input** |\n\n",
    "```md\n### not-a-unit\n```\n\n",
    "### U2: retry\n- **requirements**: REQ-DEMO-003.\n- **depends_on**: u1-guard, docs/x.md (a note), U9 — the reason; and more\n",
    "- **verify**: npx vitest run\n  test/b.test.ts\n",
  ].join("");

  it("reads table and bullet units with every field, the extra ones kept", () => {
    expect(parsePlanUnits(units)).toEqual([
      { id: "u1-guard", line: 7, requirements: ["REQ-DEMO-001", "REQ-DEMO-002"], dependsOn: [],
        edgeCases: "An expired value → refused", verify: "npx vitest run test/a.test.ts",
        fields: { id: "u1-guard", requirements: "REQ-DEMO-001, -002", depends_on: "none", edgeCases: "An expired value → refused",
          verify: "npx vitest run test/a.test.ts", threat: "Boundary: the input" } },
      { id: "U2", line: 22, requirements: ["REQ-DEMO-003"], dependsOn: ["u1-guard", "docs/x.md", "U9"], edgeCases: "",
        verify: "npx vitest run test/b.test.ts",
        fields: { requirements: "REQ-DEMO-003.", depends_on: "u1-guard, docs/x.md (a note), U9 — the reason; and more",
          verify: "npx vitest run test/b.test.ts" } },
    ]);
  });

  it("names the same units, in the same order, as the coverage check", () => {
    for (const fixture of FIXTURES) {
      expect(parsePlanUnits(fixture.plan).map((unit) => unit.id), fixture.name).toEqual(checkCoverage({ path: "plan.md", text: fixture.plan },
        [], { exists: () => true }).units);
    }
  });

  it("reads CRLF line endings exactly as LF", () => {
    expect(parsePlanUnits(units.replaceAll("\n", "\r\n"))).toEqual(parsePlanUnits(units));
  });

  it("reads a requirement it cannot parse as no requirement, and no units section as no unit", () => {
    expect(parsePlanUnits("## Units\n### U1\n- **requirements**: REQ-DEMO-00X.\n- **depends_on**: none.\n")[0]?.requirements).toEqual([]);
    expect(parsePlanUnits("## Notes\n### N1\n- **requirements**: REQ-DEMO-001.\n")).toEqual([]);
  });
});
