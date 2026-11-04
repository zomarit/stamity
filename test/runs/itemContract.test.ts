import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { contractFromItem, parseItemBody, planFiles, planHash, type ItemBody } from "../../src/runs/itemContract.ts";
import { parseRunContract } from "../../src/runs/runContract.ts";

/**
 * item-contract (REQ-FLOW-155): the pure half of `stamity run contract`. An item body in, an
 * item's parts or a contract's text out. The verb's refusals are `test/cli/commands/runContract.test.ts`.
 */

const HASH = "0123456789ab";
const MARKER = "<!-- stamity:item docs/specs/demo.md#expired/5f3a9c01d2e4 -->";

/** The shape `content/commands/st-board.md` files for an item with a plan. */
const PLANNED = [
  "Expired values are refused. Retries keep their state.",
  "",
  "## Acceptance criteria",
  "",
  "- [ ] an expired value is refused",
  "- [ ] a retry keeps its state",
  "",
  "Branch: feat/expiry",
  `Plan: docs/plans/001-demo.md ${HASH}`,
  "Ref: docs/specs/demo.md",
  "",
  MARKER,
].join("\n");

/** The body an item with no plan keeps: criteria, a `Ref:`, the marker. */
const PLAIN = ["- [ ] an expired value is refused", "- [ ] a retry keeps its state", "", "Ref: docs/specs/demo.md", "", MARKER].join("\n");

const CRITERIA = "- [ ] an expired value is refused\n- [ ] a retry keeps its state";

const FACTS = { base: "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567", files: ["src/b.ts", "src/c.ts"], itemRef: "o/r#7", author: "a-person" };

describe("parseItemBody", () => {
  it("reads every part of an item with a plan", () => {
    expect(parseItemBody(PLANNED)).toEqual({
      summary: "Expired values are refused. Retries keep their state.",
      acceptance: CRITERIA,
      branch: "feat/expiry",
      plan: { path: "docs/plans/001-demo.md", hash: HASH },
      ref: "docs/specs/demo.md",
    });
  });

  it("reads the old body of an item with no plan: no summary, no branch, no plan", () => {
    expect(parseItemBody(PLAIN)).toEqual({ summary: "", acceptance: CRITERIA, branch: null, plan: null, ref: "docs/specs/demo.md" });
  });

  it("reads an old body under the heading the same way, and one with no `Ref:`", () => {
    const body = ["## Acceptance criteria", "", "- [ ] one", "", MARKER].join("\n");
    expect(parseItemBody(body)).toEqual({ summary: "", acceptance: "- [ ] one", branch: null, plan: null, ref: null });
  });

  it("reads a body a person saved in GitHub's web form, whose lines end in CRLF", () => {
    expect(parseItemBody(PLANNED.replaceAll("\n", "\r\n"))).toEqual(parseItemBody(PLANNED));
  });

  it("reads an empty body as an item with nothing in it", () => {
    expect(parseItemBody("")).toEqual({ summary: "", acceptance: "", branch: null, plan: null, ref: null });
  });

  it("keeps the first criterion's indent and every inner line as written", () => {
    const body = ["## Acceptance criteria", "", "  - [ ] one", "", "    detail: `x`  ", "- [ ] two", "", `Plan: docs/plans/a.md ${HASH}`].join("\n");
    expect(parseItemBody(body).acceptance).toBe("  - [ ] one\n\n    detail: `x`  \n- [ ] two");
  });

  it("reads a link only from the block closing the body, so a line in the criteria names no plan", () => {
    const body = ["## Acceptance criteria", "", `Plan: docs/plans/other.md ${HASH}`, "Branch: other", "- [ ] one", "", MARKER].join("\n");
    expect(parseItemBody(body)).toMatchObject({ plan: null, branch: null });
  });

  it("reads no plan where text follows the links", () => {
    expect(parseItemBody(`${PLANNED}\n\nA note a person added.`).plan).toBeNull();
  });

  it("reads no plan or branch from a repeated line: two answers name neither", () => {
    expect(parseItemBody(PLANNED.replace("Ref:", `Plan: docs/plans/002-other.md ${HASH}\nRef:`)).plan).toBeNull();
    expect(parseItemBody(PLANNED.replace("Ref:", "Branch: feat/other\nRef:")).branch).toBeNull();
  });

  it.each([
    ["no hash", "Plan: docs/plans/001-demo.md"],
    ["a short hash", "Plan: docs/plans/001-demo.md 0123456789a"],
    ["a hash in capitals", "Plan: docs/plans/001-demo.md 0123456789AB"],
    ["a path outside docs/plans", `Plan: src/cli.md ${HASH}`],
    ["a path climbing out", `Plan: docs/plans/../../secret.md ${HASH}`],
    ["a path in a deeper folder", `Plan: docs/plans/a/b.md ${HASH}`],
    ["a file that is not Markdown", `Plan: docs/plans/001-demo.yml ${HASH}`],
    ["words after the hash", `Plan: docs/plans/001-demo.md ${HASH} and more`],
    ["nothing", "Plan:"],
  ])("reads no plan from a `Plan:` line with %s", (_label, line) => {
    expect(parseItemBody(PLANNED.replace(`Plan: docs/plans/001-demo.md ${HASH}`, line)).plan).toBeNull();
  });

  it.each([
    ["two words", "Branch: feat expiry"],
    ["nothing", "Branch:"],
    ["a name past any ref's length", `Branch: ${"b".repeat(256)}`],
  ])("reads no branch from a `Branch:` line with %s", (_label, line) => {
    expect(parseItemBody(PLANNED.replace("Branch: feat/expiry", line)).branch).toBeNull();
  });

  it("reads a body of spaces at the read cap inside the suite's time limit: anyone with issue access writes this text", () => {
    const criteria = `${" ".repeat(262_000)}x`;
    expect(parseItemBody(`## Acceptance criteria\n${criteria}\n\nPlan: docs/plans/a.md ${HASH}`).acceptance).toBe(criteria);
  });

  it("reads no criteria from a planned body with no heading, so the summary never passes for them", () => {
    const body = ["Expired values are refused.", "", "Branch: feat/expiry", `Plan: docs/plans/001-demo.md ${HASH}`, MARKER].join("\n");
    expect(parseItemBody(body)).toMatchObject({ summary: "", acceptance: "", plan: { path: "docs/plans/001-demo.md", hash: HASH } });
  });
});

describe("planHash", () => {
  it("is the first twelve hex digits of the sha256 of the plan's text", () => {
    const text = "# Plan\n\nÜber alles.\n";
    expect(planHash(text)).toBe(createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex").slice(0, 12));
    expect(planHash(text)).toMatch(/^[0-9a-f]{12}$/);
    expect(planHash(`${text} `)).not.toBe(planHash(text));
  });
});

describe("planFiles", () => {
  const plan = (units: readonly string[]): string => ["# A plan", "", "## Units", "", ...units, "## Risks", "", "None.", ""].join("\n");

  it("is the union of every unit's files, each path once, in the order the units name them", () => {
    const text = plan([
      "### one — a unit",
      "",
      "- id: one",
      "- files: `src/a.ts`, `src/b.ts`",
      "",
      "### two — a unit",
      "",
      "- id: two",
      "- files: `src/b.ts`, `README.md`",
      "",
    ]);
    expect(planFiles(text)).toEqual(["src/a.ts", "src/b.ts", "README.md"]);
  });

  it("reads the paths out of a cell written in prose, across its continuation lines", () => {
    const text = plan([
      "### one — a unit",
      "",
      "- id: one",
      "- files: a new `src/runs/itemContract.ts`, `src/cli/commands/gate.ts` (`runPreflightVerb` only), `docs/cli-reference.md`",
      "  (generated), `src/emit/planner.ts` if the row is placed there, at most six new files under `evals/cases/golden/` and",
      "  `evals/cases/adversarial/`, the eval case `source:` ranges the shifts move.",
      "",
    ]);
    expect(planFiles(text)).toEqual([
      "src/runs/itemContract.ts",
      "src/cli/commands/gate.ts",
      "docs/cli-reference.md",
      "src/emit/planner.ts",
      "evals/cases/golden/",
      "evals/cases/adversarial/",
    ]);
  });

  it("reads a table's `files` row as it reads a bullet's", () => {
    const text = plan(["### one — a unit", "", "| Field | Content |", "|---|---|", "| `id` | one |", "| `files` | `src/b.ts` |", ""]);
    expect(planFiles(text)).toEqual(["src/b.ts"]);
  });

  it("is empty for a plan with no units, and for units whose files name no path", () => {
    expect(planFiles("# A plan\n")).toEqual([]);
    expect(planFiles(plan(["### one — a unit", "", "- id: one", "- files: none", "", "### two — a unit", "", "- id: two", ""]))).toEqual([]);
  });
});

describe("contractFromItem", () => {
  const item: ItemBody = parseItemBody(PLANNED);

  it("returns YAML the run contract parser accepts at version 1, each key from its one source", () => {
    const parsed = parseRunContract(contractFromItem(item, FACTS), "contract.yml");
    expect(parsed).toEqual({
      ok: true,
      contract: {
        version: 1,
        plan: "docs/plans/001-demo.md",
        item: "o/r#7",
        base: FACTS.base,
        acceptance: CRITERIA,
        scope: { in: FACTS.files, out: [] },
        prerequisites: [],
        budget: {},
        answerer: "@a-person",
        preview: "stop",
        move: "off",
      },
    });
  });

  it("writes the keys in the contract's order, and no other", () => {
    const keys = contractFromItem(item, FACTS).split("\n").filter((line) => /^[a-z-]+:/.test(line)).map((line) => line.slice(0, line.indexOf(":")));
    expect(keys).toEqual(["run-contract", "plan", "item", "base", "acceptance", "scope", "answerer"]);
  });

  it("carries none of the item's text but the criteria: no summary, no branch, no reference", () => {
    const text = contractFromItem(item, FACTS);
    expect(text).not.toContain("Retries keep their state");
    expect(text).not.toContain("feat/expiry");
    expect(text).not.toContain("docs/specs/demo.md");
  });

  it.each([
    ["YAML's own syntax", 'key: value\n- [x]: "quoted" # not a comment\n--- \n...\n&a *a {b: [c]}'],
    ["a leading indent and a trailing space", "  - [ ] one  \n\ttabbed"],
    ["one line ending in a colon", "plan: docs/plans/evil.md"],
    ["a line past any fold", `- [ ] ${"word ".repeat(100).trim()}`],
    ["text outside ASCII", "- [ ] überprüft → 完了 🎯"],
    ["a control character", "- [ ] one\u0007two"],
  ])("keeps criteria with %s verbatim", (_label, acceptance) => {
    const parsed = parseRunContract(contractFromItem({ ...item, acceptance }, FACTS), "contract.yml");
    expect(parsed).toMatchObject({ ok: true, contract: { acceptance, plan: "docs/plans/001-demo.md" } });
  });

  it("quotes a base YAML would read as a number, and a bot's login", () => {
    const parsed = parseRunContract(contractFromItem(item, { ...FACTS, base: "1234567", author: "a-bot[bot]" }), "contract.yml");
    expect(parsed).toMatchObject({ ok: true, contract: { base: "1234567", answerer: "@a-bot[bot]" } });
  });

  it("makes no contract from an item with no plan", () => {
    expect(() => contractFromItem(parseItemBody(PLAIN), FACTS)).toThrow("Plan:");
  });
});
