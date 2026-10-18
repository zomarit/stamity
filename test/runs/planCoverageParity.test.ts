import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
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
/** The two-requirement plan covered by one unit whose requirements field is `requirements`. */
const bare = (requirements: string) =>
  `## Spec delta\n\nADDED REQ-DEMO-001, REQ-DEMO-002.\n\n## Units\n\n### U1 — guard\n- **requirements**: ${requirements}.\n- **depends_on**: none.\n`;
/** Units written `id: depends_on`, each carrying no ids. */
const chained = (rows: string[]) => rows.map((row) => {
  const [id, dependsOn] = row.split(": ");
  return `### ${id}\n- **requirements**: spec carries no ids.\n- **depends_on**: ${dependsOn}.\n`;
});
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
  fx("malformed shorthand", plan.replace("- **requirements**: REQ-DEMO-002.", "- **requirements**: REQ-DEMO-002, -00X.")),
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
  fx("unit with neither field", plan + "\n### U3 — bare\nA unit with no requirements and no depends_on.\n"),
  fx("empty fields", plan.replace("- **requirements**: REQ-DEMO-002.", "- **requirements**:").replace("- **depends_on**: U1.", "- **depends_on**:")),
  fx("no units, long notes", `## Spec delta\n\nNone.\n\n## Notes\n### N1\n${Array.from({ length: 70 }, (_, n) => `Note ${n}.`).join("\n")}\n\`\`\`\nx\n\`\`\`\n`),
  // REQ-FLOW-091: a bare number after `, ` that follows an id reads as that id's area, in a unit's requirements only.
  fx("bare shorthand", bare("REQ-DEMO-001, 002")),
  fx("bare shorthand chained", bare("REQ-DEMO-001, 002, 003"), wideSpec),
  fx("bare shorthand range", bare("REQ-DEMO-001, 002–003"), wideSpec),
  fx("bare shorthand, undefined id", bare("REQ-DEMO-001, 002, 009")),
  fx("bare number not after an id", bare("REQ-DEMO-001 (the guard), 002")),
  fx("bare number with a unit", bare("REQ-DEMO-001, 002ms")),
  fx("bare number in delta prose", plan.replace("ADDED REQ-DEMO-001, REQ-DEMO-002.", "ADDED REQ-DEMO-001, 002 cases.")),
  fx("negative measurement after a comma", plan.replace("ADDED REQ-DEMO-001, REQ-DEMO-002.", "ADDED REQ-DEMO-001, REQ-DEMO-002. A budget of 300ms, -50ms.")),
  fx("negative measurement in requirements", bare("REQ-DEMO-001, REQ-DEMO-002, 300ms, -50ms")),
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
      "missing-coverage", "missing-dependencies", "missing-requirements", "missing-retirement", "missing-spec-delta", "missing-spec-input", "missing-units", "partial-scope",
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
    // TEST CHANGE, justified (2026-10-18, v22-plan-check, REQ-FLOW-091): the one U1 <-> U2 cycle was reported twice,
    // once per unit the walk started from; the three-colour walk reports a cycle once, from the unit found on the stack.
    expect(port.findings.map((row) => row.code)).toEqual(["duplicate-field", "dependency-cycle"]);
    expect(port.findings[1]?.message).toBe("Dependency cycle: U1 -> U2 -> U1.");
  });

  it("reports a cycle once, from the unit found on the stack, however many units lead into it", () => {
    const leading = `## Spec delta\n\nNone.\n\n## Units\n\n${chained(["u0: lead", "lead: c1", "c1: c2", "c2: c1"]).join("\n")}`;
    const { port, copy } = both(fx("cycle behind a unit leading into it", leading));
    expect(port).toEqual(copy);
    expect(port.status).toBe("fail");
    expect(port.findings).toEqual([{ code: "dependency-cycle", path: "plan.md", line: 1, message: "Dependency cycle: c1 -> c2 -> c1." }]);
  });

  it("reads a bare number after an id's comma in a unit's requirements as that id's area, and nowhere else", () => {
    const result = (name: string) => both(FIXTURES.find((fixture) => fixture.name === name) as Fixture).port;
    // Read as REQ-DEMO-001 alone, U1 would leave REQ-DEMO-002 uncovered: the pass is the shorthand's reading.
    expect(result("bare shorthand")).toMatchObject({ status: "pass", findings: [] });
    expect(result("bare shorthand chained").findings).toEqual([]);
    expect(result("bare shorthand range").findings).toEqual([]);
    expect(result("bare shorthand, undefined id").findings).toEqual([expect.objectContaining({ code: "dangling-requirement",
      message: "U1 cites undefined REQ-DEMO-009; supply its spec or correct the ID." })]);
    for (const name of ["bare number not after an id", "bare number with a unit"]) {
      expect(result(name).findings, name).toEqual([expect.objectContaining({ code: "missing-coverage",
        message: "REQ-DEMO-002 is in the spec delta but no unit covers it." })]);
    }
    // Delta prose reads as today: the number after the comma is no id, so only REQ-DEMO-001 is in scope.
    expect(result("bare number in delta prose")).toMatchObject({ status: "pass", scope: ["REQ-DEMO-001"] });
    // A negative measurement after a comma reads as today: still a malformed shorthand.
    for (const name of ["negative measurement after a comma", "negative measurement in requirements"]) {
      expect(result(name).findings, name).toContainEqual(expect.objectContaining({ code: "invalid-reference",
        message: "Malformed requirement reference: -50ms" }));
    }
  });

  it("refuses a malformed shorthand beside a valid ID instead of reading the valid ID alone", () => {
    const { port, copy } = both(fx("malformed shorthand", plan.replace("- **requirements**: REQ-DEMO-002.", "- **requirements**: REQ-DEMO-002, -00X.")));
    expect(port).toEqual(copy);
    expect(port.status).toBe("fail");
    expect(port.findings).toContainEqual(expect.objectContaining({ code: "invalid-reference", message: "Malformed requirement reference: -00X" }));
  });

  // A walk per path made this plan about fib(60) calls, a run that never ends. The twins run in a child
  // process because a synchronous loop never yields to vitest's own timeout; the child's is a kill.
  it("checks a 60-unit plan where each unit depends on the two before it, in both twins, within a short bound", () => {
    const units = Array.from({ length: 60 }, (_, k) => {
      const dependsOn = k === 0 ? "none" : k === 1 ? "u0" : `u${k - 1}, u${k - 2}`;
      return `### u${k}\n- **requirements**: spec carries no ids.\n- **depends_on**: ${dependsOn}.\n`;
    });
    const dense = `## Spec delta\n\nNone.\n\n## Units\n\n${units.join("\n")}`;
    const program = [
      'import { readFileSync } from "node:fs";',
      `const { checkCoverage } = await import(${JSON.stringify(pathToFileURL(resolve("src/runs/planCoverage.ts")).href)});`,
      `const { checkCoverage: copy } = await import(${JSON.stringify(pathToFileURL(resolve("content/skills/st-verify/scripts/spec-plan-coverage.mjs")).href)});`,
      'const doc = { path: "plan.md", text: readFileSync(0, "utf8") };',
      'const options = { exists: () => false, cwd: "/repo" };',
      "process.stdout.write(JSON.stringify({ port: checkCoverage(doc, [], options), copy: copy(doc, [], options) }));",
    ].join("\n");
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", program], { input: dense, encoding: "utf8", timeout: 10_000 });
    const { port, copy } = JSON.parse(output) as { port: CoverageResult; copy: CoverageResult };
    expect(port).toEqual(copy);
    expect(port).toMatchObject({ status: "pass", findings: [] });
    expect(port.units).toHaveLength(60);
  }, 20_000);

  // The acyclic memo above skipped only a unit whose walk found nothing, so a chain leading into a cycle was walked
  // once per path again, about fib(60) calls; the same child process and kill bound the three-colour walk.
  it("checks the 60-unit chain leading into a two-unit cycle, in both twins, within a short bound and with one finding", () => {
    const units = Array.from({ length: 60 }, (_, k) => {
      const dependsOn = k === 0 ? "lead" : k === 1 ? "u0" : `u${k - 1}, u${k - 2}`;
      return `### u${k}\n- **requirements**: spec carries no ids.\n- **depends_on**: ${dependsOn}.\n`;
    });
    const dense = `## Spec delta\n\nNone.\n\n## Units\n\n${[...units, ...chained(["lead: c1", "c1: c2", "c2: c1"])].join("\n")}`;
    const program = [
      'import { readFileSync } from "node:fs";',
      `const { checkCoverage } = await import(${JSON.stringify(pathToFileURL(resolve("src/runs/planCoverage.ts")).href)});`,
      `const { checkCoverage: copy } = await import(${JSON.stringify(pathToFileURL(resolve("content/skills/st-verify/scripts/spec-plan-coverage.mjs")).href)});`,
      'const doc = { path: "plan.md", text: readFileSync(0, "utf8") };',
      'const options = { exists: () => false, cwd: "/repo" };',
      "process.stdout.write(JSON.stringify({ port: checkCoverage(doc, [], options), copy: copy(doc, [], options) }));",
    ].join("\n");
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", program], { input: dense, encoding: "utf8", timeout: 10_000 });
    const { port, copy } = JSON.parse(output) as { port: CoverageResult; copy: CoverageResult };
    expect(port).toEqual(copy);
    expect(port.status).toBe("fail");
    expect(port.findings).toEqual([{ code: "dependency-cycle", path: "plan.md", line: 1, message: "Dependency cycle: c1 -> c2 -> c1." }]);
    expect(port.units).toHaveLength(63);
  }, 20_000);

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

  it("reads the bare shorthand in a unit's requirements as the coverage check does", () => {
    const [unit] = parsePlanUnits("## Units\n### U1\n- **requirements**: REQ-DEMO-001, 002, 004–005.\n- **depends_on**: none.\n");
    expect(unit?.requirements).toEqual(["REQ-DEMO-001", "REQ-DEMO-002", "REQ-DEMO-004", "REQ-DEMO-005"]);
  });

  it("reads a requirement it cannot parse as no requirement, and no units section as no unit", () => {
    expect(parsePlanUnits("## Units\n### U1\n- **requirements**: REQ-DEMO-00X.\n- **depends_on**: none.\n")[0]?.requirements).toEqual([]);
    expect(parsePlanUnits("## Notes\n### N1\n- **requirements**: REQ-DEMO-001.\n")).toEqual([]);
  });
});
