import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCommand } from "../../src/cli/commands/run.ts";
import type { LedgerRow } from "../../src/runs/ledgerStore.ts";
import { overviewFrom } from "../../src/runs/overview.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * run-overview (REQ-FLOW-161): the one short page a person reads after a run. `overviewFrom` is pure, text in and
 * text out; the verb's cases run through the in-process funnel over a real run folder in a scratch directory, and
 * nothing is mocked: the verb reads three files and calls neither git nor GitHub.
 */

const RUN = "2026-11-05_sample";
const RUN_DIR = `.stamity/runs/${RUN}`;
const REPORTS = `${RUN_DIR}/reports`;

const RECORD = [
  "# Run record: a sample",
  "",
  "Status: closed",
  "Mode: unattended",
  "Branch: stamity/2026-11-05_sample",
  "Base: 04966e3a",
  "",
  "## Blast radius",
  "",
  "Narrow: one verb, and one comment on a failed notice.",
  "",
  "## Decisions",
  "",
  "- Default applied: plan gate → option 1, execute now",
  "- 22:38Z Default applied: review cap → stop at three",
  "",
  "## Log",
  "",
  "- 2026-11-05T09:00Z usage: build minutes=40 tokens=1000 (Claude Code)",
  "- 2026-11-05T09:30Z usage: review r1 minutes=5 tokens=unreported (Claude Code)",
  "- 2026-11-05T09:10Z choice: run-overview dropped a status line — src/cli/commands/run.ts:1535",
  "- 2026-11-05T09:40Z land: #7 04966e3aa3142418248a693bb8d16bd074f0d5ab merged",
  "",
  "## Proof block",
  "",
  "**Gate results** — class `product`, base `04966e3a`:",
  "",
  "- lint: `npm run lint`, pass, exit 0",
  "- test: `npx vitest run`, fail, exit 1",
  "",
  "Review verdicts: approved.",
  "",
].join("\n");

const HELD_ROW = "- tried: push the workflow · failed: the guard refused · yours because: a person owns CI · do: review held/person-only.patch";
const REFUSED_ROW = "- refused, not tried again: the tag · yours because: a release is a person's · do: cut it from the checklist";

const morning = (held: string): string =>
  [
    `# Morning list — ${RUN}`,
    "",
    "## For you to check",
    "",
    "none",
    "",
    "## Decisions",
    "",
    "none",
    "",
    "## Prerequisites",
    "",
    "none",
    "",
    "## Person's calls held",
    "",
    held,
    "",
    "## Not done:",
    "",
    "none",
    "",
    "## How to answer",
    "",
    "```stamity-morning",
    "```",
    "",
  ].join("\n");

const row = (id: string, state: string, report?: string): LedgerRow => ({
  id: `${RUN}/${id}`,
  phase: id.split("/")[0] ?? "",
  source: "reviewer",
  severity: "Warning",
  evidence: "a.ts:1 — a finding",
  state,
  rationale: "",
  ...(report === undefined ? {} : { report: `${REPORTS}/${report}` }),
});

const LEDGER: LedgerRow[] = [
  row("build/1", "fixed", "alpha-implementer-r1.md"),
  row("review/1", "fixed", "alpha-reviewer-r1.md"),
  row("review/2", "rejected", "beta-gamma-reviewer-r3.md"),
  row("review/3", "deferred", "branch-reviewer-r2.md"),
  row("review/4", "open", "plan-spec-author-r1.md"),
  row("review/5", "open"),
];

const page = (over: Partial<Parameters<typeof overviewFrom>[0]> = {}): string =>
  overviewFrom({ record: RECORD, ledger: LEDGER, morning: morning(`${HELD_ROW}\n${REFUSED_ROW}`), ...over });

/** The text under `## <name>`, up to the next heading. */
const section = (text: string, name: string): string => {
  const parts = text.split(/^## /m);
  return parts.find((part) => part.startsWith(`${name}\n`)) ?? "";
};

describe("overviewFrom", () => {
  it("prints the four sections in order, and nothing before the first", () => {
    const headings = page()
      .split("\n")
      .filter((line) => line.startsWith("## "));

    expect(headings).toEqual(["## What happened", "## How", "## Why", "## Only you can do"]);
    expect(page().startsWith("## What happened\n")).toBe(true);
  });

  it("says what happened: the status, the units the ledger names, the land and the blast radius", () => {
    const text = section(page(), "What happened");

    expect(text).toContain("status: closed\n");
    // `branch` and `plan` are whole-run passes, so of the five reports only two name a unit.
    expect(text).toContain("units: 2 named in the ledger: alpha, beta-gamma\n");
    expect(text).toContain("land: #7 04966e3aa3142418248a693bb8d16bd074f0d5ab merged\n");
    expect(text).toContain("Narrow: one verb, and one comment on a failed notice.");
    expect(text).not.toContain("## Blast radius");
  });

  it("takes the last land line where a run landed twice", () => {
    const record = `${RECORD}- 2026-11-05T10:00Z land: #8 1111111111111111111111111111111111111111 fast-forwarded\n`;

    expect(section(page({ record }), "What happened")).toContain("land: #8 1111111111111111111111111111111111111111 fast-forwarded\n");
  });

  it("says a run with no land yet has none, and reads no prose mention of one as a land", () => {
    const record = RECORD.replace(/^- \S+ land: .*\n/m, "- 2026-11-05T09:40Z the land: a word in a sentence\n");

    expect(section(page({ record }), "What happened")).toContain("land: no land yet\n");
  });

  it("says how: the gates as written, the highest review round, the rows by state and the usage summed", () => {
    const text = section(page(), "How");

    expect(text).toContain("gates: **Gate results** — class `product`, base `04966e3a`:\n- lint: `npm run lint`, pass, exit 0\n- test: `npx vitest run`, fail, exit 1\n");
    expect(text).not.toContain("Review verdicts");
    expect(text).toContain("rounds: r3 is the highest review round with findings\n");
    expect(text).toContain("findings: 6 ledger rows: 2 open, 2 fixed, 1 rejected, 1 deferred\n");
    expect(text).toContain("usage: minutes=45 tokens=1000 or more (usage lines: 2)\n");
  });

  it("takes the last gate label, and prints one with no list under it alone", () => {
    const record = `${RECORD}\n### Gate results (the final tree)\n\nThe full gate passed.\n`;
    const text = section(page({ record }), "How");

    expect(text).toContain("gates: ### Gate results (the final tree)\nrounds:");
  });

  it("counts a row in a state it does not know, so the states add up to the rows", () => {
    expect(section(page({ ledger: [row("review/1", "fixed"), row("review/2", "pending")] }), "How")).toContain("findings: 2 ledger rows: 1 fixed, 1 other\n");
  });

  it("says so where the record holds no gates, no usage and the ledger no rows", () => {
    const text = section(page({ record: "# Run\n\nStatus: in progress\n", ledger: [] }), "How");

    expect(text).toContain("gates: no gate results in the record yet\n");
    expect(text).toContain("rounds: no review round with findings\n");
    expect(text).toContain("findings: no ledger rows\n");
    expect(text).toContain("usage: no usage lines\n");
  });

  it("says why: each default and each choice", () => {
    const text = section(page(), "Why");

    expect(text).toContain("defaults:\n- plan gate → option 1, execute now\n- review cap → stop at three\n");
    expect(text).toContain("choices:\n- run-overview dropped a status line — src/cli/commands/run.ts:1535\n");
  });

  it("says none where a run recorded no default and no choice", () => {
    const text = section(page({ record: "Status: closed\n" }), "Why");

    expect(text).toContain("defaults: none recorded\n");
    expect(text).toContain("choices: none recorded\n");
  });

  it("keeps a long list short and names how many the record still holds", () => {
    const choices = Array.from({ length: 15 }, (_unused, at) => `- 2026-11-05T09:10Z choice: unit-${at} tried a way — a.ts:${at}`);
    const text = section(page({ record: `Status: closed\n${choices.join("\n")}\n` }), "Why");

    expect(text).toContain("- unit-11 tried a way — a.ts:11\n");
    expect(text).not.toContain("unit-12");
    expect(text).toContain("- and 3 more in the record\n");
  });

  it("prints the human-only rows as written, reading no row grammar", () => {
    const odd = "- a row in no grammar at all";
    const text = section(page({ morning: morning(`${HELD_ROW}\n${REFUSED_ROW}\n${odd}`) }), "Only you can do");

    expect(text).toBe(`Only you can do\n\n${HELD_ROW}\n${REFUSED_ROW}\n${odd}\n`);
  });

  it("reads none on a list with no held rows", () => {
    expect(section(page({ morning: morning("none") }), "Only you can do")).toBe("Only you can do\n\nnone\n");
  });

  it("prints a line saying so where morning.md is missing, the other sections whole", () => {
    const text = page({ morning: null });

    expect(section(text, "Only you can do")).toBe("Only you can do\n\nno morning.md in the run folder, so there is no list yet\n");
    expect(section(text, "What happened")).toContain("status: closed\n");
  });

  it("names the first problem where morning.md does not parse, and shows no row of it", () => {
    const text = section(page({ morning: `# Morning list — ${RUN}\n\n## Person's calls held\n\n${HELD_ROW}\n` }), "Only you can do");

    expect(text).toContain("morning.md does not parse, so its list is not shown: missing section `## For you to check`");
    expect(text).not.toContain("tried: push the workflow");
  });

  it("prints the record's facts and names the failure where the ledger did not read, counting nothing from it", () => {
    const text = page({ ledger: [], ledgerFailure: "ledger.jsonl's line 3 does not read as a row" });

    expect(section(text, "What happened")).toContain("status: closed\n");
    expect(section(text, "What happened")).toContain("land: #7 04966e3aa3142418248a693bb8d16bd074f0d5ab merged\n");
    expect(section(text, "What happened")).toContain("units: not counted, since ledger.jsonl's line 3 does not read as a row\n");
    expect(section(text, "How")).toContain("rounds: not counted, since ledger.jsonl's line 3 does not read as a row\n");
    expect(section(text, "How")).toContain("findings: not counted, since ledger.jsonl's line 3 does not read as a row\n");
    expect(section(text, "How")).not.toContain("no ledger rows");
    expect(section(text, "How")).toContain("usage: minutes=45");
  });

  it("says the record names no status where its head holds none", () => {
    expect(section(page({ record: "# Run\n" }), "What happened")).toContain("status: the record names none\n");
  });

  it("leaves the blast radius out where the record holds none", () => {
    expect(section(page({ record: "Status: closed\n" }), "What happened")).not.toContain("Narrow");
  });
});

describe("stamity run overview", () => {
  const getRoot = useTempDir("run-overview");

  /** Every file under `dir` with its bytes, so a case can hold the whole tree still. */
  const tree = (dir: string): Record<string, string> =>
    Object.fromEntries(
      readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => {
          const path = join(entry.parentPath, entry.name);
          return [path, readFileSync(path, "latin1")];
        }),
    );

  const ledgerText = (rows: readonly LedgerRow[]): string => rows.map((entry) => `${JSON.stringify(entry)}\n`).join("");

  async function seed(files: Record<string, string>): Promise<string> {
    const root = getRoot();
    await root.seedFiles(Object.fromEntries(Object.entries(files).map(([name, text]) => [`${RUN_DIR}/${name}`, text])));
    return root.dir;
  }

  const overview = async (cwd: string, extra: readonly string[] = []) => runInProcess([runCommand], ["run", "overview", "--run", RUN, ...extra], { cwd });

  it("prints the page under the run's name, and writes no file", async () => {
    const cwd = await seed({ "record.md": RECORD, "ledger.jsonl": ledgerText(LEDGER), "morning.md": morning(HELD_ROW) });
    const before = tree(cwd);

    const { code, stdout } = await overview(cwd);

    expect(code).toBe(0);
    expect(stdout.startsWith(`run: ${RUN}\n\n## What happened\n`)).toBe(true);
    expect(stdout).toContain("units: 2 named in the ledger: alpha, beta-gamma\n");
    expect(stdout).toContain(`${HELD_ROW}\n`);
    expect(tree(cwd)).toEqual(before);
  });

  it("gives the same page under --json", async () => {
    const cwd = await seed({ "record.md": RECORD, "ledger.jsonl": ledgerText(LEDGER), "morning.md": morning(HELD_ROW) });

    const { code, stdout } = await overview(cwd, ["--json"]);

    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ subcommand: "overview", run: RUN, overview: overviewFrom({ record: RECORD, ledger: LEDGER, morning: morning(HELD_ROW) }) });
  });

  it("prints on a run folder holding the record alone, saying what it has not got", async () => {
    const cwd = await seed({ "record.md": RECORD });

    const { code, stdout } = await overview(cwd);

    expect(code).toBe(0);
    expect(stdout).toContain("findings: no ledger rows\n");
    expect(stdout).toContain("no morning.md in the run folder, so there is no list yet\n");
  });

  it("names each ledger line that is no row, exits 0 and counts no row beside it", async () => {
    const cwd = await seed({ "record.md": RECORD, "ledger.jsonl": `${JSON.stringify(row("review/1", "fixed", "alpha-reviewer-r1.md"))}\nnot json\n` });

    const { code, stdout } = await overview(cwd);

    expect(code).toBe(0);
    expect(stdout).toContain("status: closed\n");
    expect(stdout).toContain("findings: not counted, since ledger.jsonl's line 2 does not read as a row\n");
    expect(stdout).not.toContain("alpha");
  });

  it("names a ledger over its cap rather than count part of it", async () => {
    const cwd = await seed({ "record.md": RECORD, "ledger.jsonl": "x".repeat(4_194_305) });

    const { code, stdout } = await overview(cwd);

    expect(code).toBe(0);
    expect(stdout).toContain("findings: not counted, since ledger.jsonl is over 4194304 bytes\n");
  });

  it("names a ledger path that holds no file it can read", async () => {
    const cwd = await seed({ "record.md": RECORD, "ledger.jsonl/kept": "a folder where the ledger goes\n" });

    const { code, stdout } = await overview(cwd);

    expect(code).toBe(0);
    expect(stdout).toContain("findings: not counted, since ledger.jsonl could not be read\n");
  });

  it("drops what a terminal would act on from every line it prints", async () => {
    const forged = `Status: closed\u001b[2J‮\n\n- 2026-11-05T09:10Z choice: a\u001b]0;title\u0007 way — a.ts:1\n`;
    const cwd = await seed({ "record.md": forged });

    const { code, stdout } = await overview(cwd);

    expect(code).toBe(0);
    expect(stdout).toContain("status: closed");
    expect(stdout).toContain("choices:\n- a");
    for (const character of ["\u001b", "\u0007", "‮"]) expect(stdout).not.toContain(character);
  });

  it("refuses with exit 1 where the record is missing", async () => {
    const cwd = await seed({ "morning.md": morning(HELD_ROW) });

    const { code, stderr } = await overview(cwd);

    expect(code).toBe(1);
    expect(stderr).toContain(`run overview found no record at ${RUN_DIR}/record.md`);
  });

  it("refuses with exit 1 where the record is over its cap, since a land line past it could not be seen", async () => {
    const cwd = await seed({ "record.md": `Status: closed\n${"x".repeat(4_194_304)}` });

    const { code, stderr } = await overview(cwd);

    expect(code).toBe(1);
    expect(stderr).toContain(`run overview will not read ${RUN_DIR}/record.md`);
  });

  it("refuses a value that is no run id", async () => {
    const { code, stderr } = await runInProcess([runCommand], ["run", "overview", "--run", "../elsewhere"], { cwd: getRoot().dir });

    expect(code).toBe(1);
    expect(stderr).toContain("is not a run id");
  });

  it("takes no option of the other subcommands, and needs --run", async () => {
    const cwd = await seed({ "record.md": RECORD });

    const stray = await overview(cwd, ["--title", "x"]);
    const bare = await runInProcess([runCommand], ["run", "overview"], { cwd });

    expect(stray.code).toBe(2);
    expect(stray.stderr).toContain("--title does not apply to overview");
    expect(bare.code).toBe(2);
    expect(bare.stderr).toContain("run overview needs --run <run-id>");
  });
});
