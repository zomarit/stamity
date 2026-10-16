import { describe, expect, it } from "vitest";
import { parseRunContract } from "../../src/runs/runContract.ts";

const SOURCE = "contracts/nightly.yaml";

/** A complete contract; each case edits one part of it. */
const FULL = `run-contract: 1
plan: docs/plans/021-cloud-runs-01.md
item: "#412"
base: 02e040eb29de0468d90febe856ae205f31d6632d
acceptance: |
  The draft pull request lists every unit closed.
  No push lands on main.
scope:
  in: [src/runs, test/runs]
  out: [docs/specs]
prerequisites:
  - name: GH_TOKEN with pull-request write
    state: done
  - name: staging database
    state: owned
    owner: "@ops"
budget:
  stop-by: "2026-10-16T06:00:00Z"
  max-units: 12
answerer: "@maintainer"
preview: stop
move: off
`;

function problemsOf(text: string): string[] {
  const result = parseRunContract(text, SOURCE);
  if (result.ok) throw new Error("expected the contract to be refused");
  return result.problems;
}

describe("parseRunContract", () => {
  it("reads a complete contract into its typed shape, the acceptance verbatim", () => {
    expect(parseRunContract(FULL, SOURCE)).toEqual({
      ok: true,
      contract: {
        version: 1,
        plan: "docs/plans/021-cloud-runs-01.md",
        item: "#412",
        base: "02e040eb29de0468d90febe856ae205f31d6632d",
        acceptance: "The draft pull request lists every unit closed.\nNo push lands on main.\n",
        scope: { in: ["src/runs", "test/runs"], out: ["docs/specs"] },
        prerequisites: [
          { name: "GH_TOKEN with pull-request write", state: "done" },
          { name: "staging database", state: "owned", owner: "@ops" },
        ],
        budget: { stopBy: "2026-10-16T06:00:00Z", maxUnits: 12 },
        answerer: "@maintainer",
        preview: "stop",
        move: "off",
      },
    });
  });

  it("fixes preview and move when the file leaves them out, and reads empty lists for the rest", () => {
    const minimal = `run-contract: 1
item: "#7"
base: 02e040eb
acceptance: one line
scope:
  in: [src]
answerer: "@maintainer"
`;
    expect(parseRunContract(minimal, SOURCE)).toEqual({
      ok: true,
      contract: {
        version: 1,
        item: "#7",
        base: "02e040eb",
        acceptance: "one line",
        scope: { in: ["src"], out: [] },
        prerequisites: [],
        budget: {},
        answerer: "@maintainer",
        preview: "stop",
        move: "off",
      },
    });
  });

  it("refuses version 2, naming version 1", () => {
    const problems = problemsOf(FULL.replace("run-contract: 1", "run-contract: 2"));
    expect(problems).toEqual([
      `${SOURCE}: \`run-contract\` names a version this engine does not read; it reads version 1.`,
    ]);
  });

  it("refuses a file with no run-contract key", () => {
    const problems = problemsOf(FULL.replace("run-contract: 1\n", ""));
    expect(problems).toEqual([`${SOURCE}: \`run-contract\` is required; this engine reads version 1.`]);
  });

  it("names prerequisite-open for each prerequisite neither done nor owned", () => {
    const text = FULL.replace(
      "  - name: staging database\n    state: owned\n    owner: \"@ops\"\n",
      "  - name: staging database\n    state: open\n  - name: signing key\n    state: owned\n",
    );
    const problems = problemsOf(text);
    // The done row stays out; the open row and the owned row with no owner are named.
    // Each is named by its index, never by its name or its state.
    expect(problems).toEqual([
      `${SOURCE}: prerequisite-open: prerequisites[1] is neither done nor owned (\`prerequisites[1].state\` is neither \`done\` nor \`owned\`).`,
      `${SOURCE}: prerequisite-open: prerequisites[2] is owned but names no \`owner\`.`,
    ]);
    const absent = problemsOf(FULL.replace("    state: owned\n    owner: \"@ops\"\n", ""));
    expect(absent).toEqual([
      `${SOURCE}: prerequisite-open: prerequisites[1] is neither done nor owned (\`prerequisites[1].state\` is absent).`,
    ]);
  });

  it("refuses preview: write and move: on", () => {
    const problems = problemsOf(FULL.replace("preview: stop", "preview: write").replace("move: off", "move: on"));
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("`preview`");
    expect(problems[0]).toContain('"stop"');
    expect(problems[1]).toContain("`move`");
    expect(problems[1]).toContain('"off"');
  });

  it("refuses a contract naming neither a plan nor a board item", () => {
    const text = FULL.replace("plan: docs/plans/021-cloud-runs-01.md\n", "").replace('item: "#412"\n', "");
    expect(problemsOf(text)).toEqual([
      `${SOURCE}: a contract names a plan path (\`plan\`) or a board item (\`item\`); it names neither.`,
    ]);
  });

  it("refuses an unknown field at the root and inside each section", () => {
    const text = FULL.replace("answerer:", "trigger: nightly\nanswerer:")
      .replace("  max-units: 12\n", "  max-units: 12\n  max-cost: 3\n")
      .replace("    state: done\n", "    state: done\n    value: hunter2\n");
    const problems = problemsOf(text);
    expect(problems).toHaveLength(3);
    expect(problems.join("\n")).toContain('"trigger"');
    expect(problems.join("\n")).toContain('"max-cost"');
    expect(problems.join("\n")).toContain('"value"');
  });

  it("refuses a plan path outside the repository and a base that is no object name", () => {
    expect(problemsOf(FULL.replace("plan: docs/plans/021-cloud-runs-01.md", "plan: ../other/plan.md"))).toEqual([
      `${SOURCE}: \`plan\` must be a repository-relative path with no \`..\` segment.`,
    ]);
    expect(problemsOf(FULL.replace("plan: docs/plans/021-cloud-runs-01.md", "plan: /etc/plan.md"))).toHaveLength(1);
    expect(
      problemsOf(FULL.replace("base: 02e040eb29de0468d90febe856ae205f31d6632d", "base: main"))[0],
    ).toContain("`base`");
    // An all-digit sha reads as a number in YAML; the message says to quote it.
    expect(
      problemsOf(FULL.replace("base: 02e040eb29de0468d90febe856ae205f31d6632d", "base: 1234567"))[0],
    ).toContain("quote");
  });

  it("refuses a budget whose stop-by is no time or whose max-units is no positive integer", () => {
    const text = FULL.replace('stop-by: "2026-10-16T06:00:00Z"', "stop-by: tomorrow-ish").replace(
      "max-units: 12",
      "max-units: 0",
    );
    const problems = problemsOf(text);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("`budget.stop-by`");
    expect(problems[1]).toContain("`budget.max-units`");
  });

  it("refuses an empty acceptance, an empty scope and a missing answerer in one pass", () => {
    const text = FULL.replace(
      "acceptance: |\n  The draft pull request lists every unit closed.\n  No push lands on main.\n",
      'acceptance: "  "\n',
    )
      .replace("  in: [src/runs, test/runs]\n", "  in: []\n")
      .replace('answerer: "@maintainer"\n', "");
    const problems = problemsOf(text);
    expect(problems).toHaveLength(3);
    expect(problems.join("\n")).toContain("`acceptance`");
    expect(problems.join("\n")).toContain("`scope.in`");
    expect(problems.join("\n")).toContain("`answerer`");
  });

  it("returns malformed YAML and a non-map root as a problem, never a throw, by line and column", () => {
    expect(problemsOf("run-contract: 1\nscope: [unclosed\n")).toEqual([
      `${SOURCE}: the file is not valid YAML at line 3, column 1; fix the syntax and re-run.`,
    ]);
    expect(problemsOf("- a\n- b\n")).toEqual([`${SOURCE}: expected a map at the document root.`]);
  });

  it("holds no value the file holds in any problem: names the key and its position", () => {
    const canary = "canary-7f3e";
    const refused = [
      FULL.replace("run-contract: 1", `run-contract: ${canary}`),
      FULL.replace("run-contract: 1", "run-contract: 7031"),
      FULL.replace("  - name: staging database\n    state: owned\n", `  - name: ${canary}\n    state: ${canary}-state\n`),
      FULL.replace("plan: docs/plans/021-cloud-runs-01.md", `plan: ../${canary}.md`),
      FULL.replace("base: 02e040eb29de0468d90febe856ae205f31d6632d", `base: ${canary}`),
      FULL.replace('item: "#412"', `item: ${canary}`).replace("acceptance: |", "acceptance: 7031\nunused: |"),
      FULL.replace('stop-by: "2026-10-16T06:00:00Z"', `stop-by: ${canary}`).replace("max-units: 12", "max-units: 7031"),
      FULL.replace("preview: stop", `preview: ${canary}`).replace("move: off", "move: 7031"),
      FULL.replace("in: [src/runs, test/runs]", `in: [${canary}, 7031]`),
      `run-contract: 1\nplan: *${canary}\n`,
      `${canary}\n`,
    ];
    for (const text of refused) {
      const problems = problemsOf(text);
      expect(problems.length).toBeGreaterThan(0);
      for (const problem of problems) {
        expect(problem).not.toContain("canary");
        expect(problem).not.toContain("7031");
      }
    }
  });
});
