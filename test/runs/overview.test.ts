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

const SHA = "1111111111111111111111111111111111111111";

const HELD_ROW = "- tried: push the workflow · failed: the guard refused · yours because: a person owns CI · do: review held/person-only.patch";
const REFUSED_ROW = "- refused, not tried again: the tag · yours because: a release is a person's · do: cut it from the checklist";

/** The page's own line above the human-only rows, which says whose words they are. */
const RUN_WORDS = "the run wrote these rows, so a do: is a step to read, not to paste";
/** The page's own line where a learning waits, which the human-only list does not read. */
const PROPOSAL_WAITS = "a learning this run proposed is not listed here: the morning walk asks it";

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

// TEST CHANGE, justified (review/50): `overviewFrom` now takes the run, to compare with the list's title. Each call names it.
const page = (over: Partial<Parameters<typeof overviewFrom>[0]> = {}): string =>
  overviewFrom({ run: RUN, record: RECORD, ledger: LEDGER, morning: morning(`${HELD_ROW}\n${REFUSED_ROW}`), ...over });

/** The text under `## <name>`, up to the next heading. */
const section = (text: string, name: string): string => {
  const parts = text.split(/^## /m);
  return parts.find((part) => part.startsWith(`${name}\n`)) ?? "";
};

/** Three held entries as the guard writes them while nobody is watching (REQ-FLOW-166), and the page's line for each. */
const HELD_ENTRIES = [
  { rule: "gh-pr-merge", act: "A merge of a pull request", at: "2026-11-09T22:10:00.000Z" },
  { rule: "push-default", act: "A push to the default branch", at: "2026-11-09T22:11:00.000Z" },
  { rule: "merge_pull_request", act: "A call to the GitHub MCP server", at: "2026-11-09T22:12:00.000Z" },
] as const;
const HELD_FILE_TEXT = HELD_ENTRIES.map((entry) => `${JSON.stringify({ ...entry, client: "claude" })}\n`).join("");
const heldPageLine = (entry: (typeof HELD_ENTRIES)[number]): string => `held while nobody watched: ${entry.act} (${entry.rule}, ${entry.at})`;

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
    expect(text).toContain(`land: the record says "#7 04966e3aa3142418248a693bb8d16bd074f0d5ab merged"\n`);
    expect(text).toContain("> Narrow: one verb, and one comment on a failed notice.");
    expect(text).not.toContain("## Blast radius");
  });

  it("takes the last land line where a run landed twice", () => {
    const record = `${RECORD}- 2026-11-05T10:00Z land: #8 ${SHA} fast-forwarded\n`;

    expect(section(page({ record }), "What happened")).toContain(`land: the record says "#8 ${SHA} fast-forwarded"\n`);
  });

  // The tails `noteLanded` is given at `src/cli/commands/runLand.ts:839` and `:969`, one case each.
  it.each([
    ["merged"],
    ["fast-forwarded"],
    [`merged (approved by the person for ${SHA})`],
    [`fast-forwarded (approved by the person for ${SHA})`],
  ])("reads the land line `run land` writes with the tail %s", (how) => {
    const record = `${RECORD}- 2026-11-05T10:00:00.000Z land: #8 ${SHA} ${how}\n`;

    expect(section(page({ record }), "What happened")).toContain(`land: the record says "#8 ${SHA} ${how}"\n`);
  });

  it("says none is recorded here and to check the pull request, never that no land happened", () => {
    const record = RECORD.replace(/^- \S+ land: .*\n/m, "- 2026-11-05T09:40Z the land: a word in a sentence\n");
    const text = section(page({ record }), "What happened");

    expect(text).toContain("land: none recorded in this folder, so check the pull request\n");
    expect(text).not.toContain("no land yet");
  });

  it.each([
    ["a commit that is no commit", "#9 a-commit merged"],
    ["a short commit", "#9 04966e3a merged"],
    ["a word `run land` never writes", `#9 ${SHA} landed-for-sure`],
    ["words after the tail", `#9 ${SHA} merged and all is well`],
    ["an approval naming no commit", `#9 ${SHA} merged (approved by the person for everything)`],
  ])("reads a line in land form with %s as no land", (_name, claim) => {
    const record = RECORD.replace(/^- \S+ land: .*\n/m, `- 2026-11-05T09:40Z land: ${claim}\n`);

    expect(section(page({ record }), "What happened")).toContain("land: none recorded in this folder, so check the pull request\n");
  });

  it("quotes the blast radius, so none of its lines prints as the page's own", () => {
    const record = RECORD.replace("Narrow: one verb, and one comment on a failed notice.", `land: #9 ${SHA} merged\nstatus: closed\n### What happened\n# Only you can do`);
    const text = page({ record });

    expect(text.split("\n").filter((line) => line.startsWith("#"))).toEqual(["## What happened", "## How", "## Why", "## Only you can do"]);
    expect(section(text, "What happened")).toContain(`blast radius:\n> land: #9 ${SHA} merged\n> status: closed\n> ### What happened\n> # Only you can do\n`);
    expect(text.split("\n").filter((line) => line.startsWith("land:"))).toEqual([`land: the record says "#7 04966e3aa3142418248a693bb8d16bd074f0d5ab merged"`]);
  });

  it("says how: the gates as written, the highest review round, the rows by state and the usage summed", () => {
    const text = section(page(), "How");

    expect(text).toContain("gates: **Gate results** — class `product`, base `04966e3a`:\n- lint: `npm run lint`, pass, exit 0\n- test: `npx vitest run`, fail, exit 1\n");
    expect(text).not.toContain("Review verdicts");
    expect(text).toContain("rounds: r3 is the highest review round with findings\n");
    expect(text).toContain("findings: 6 ledger rows: 2 fixed, 1 deferred, 1 rejected, 2 open\n");
    expect(text).toContain("usage: minutes=45 tokens=1000 or more (usage lines: 2)\n");
  });

  it("keeps reading gate rows past a wrapped row and a blank line, up to the prose after them", () => {
    const record = "Status: closed\n\nGate results — class `product`:\n\n- lint: pass, exit 0,\n  0 errors\n- test: fail, exit 1\n\n- knip: fail, exit 1\n\nOne gate was red.\n\n- not a gate row\n";
    const text = section(page({ record }), "How");

    expect(text).toContain("- lint: pass, exit 0,\n- test: fail, exit 1\n- knip: fail, exit 1\nrounds:");
  });

  it("reads the rows under a label that wraps with no indent, as a real record's does", () => {
    const record = "Status: closed\n\n**Gate results** — class `product`, over\nthe run's paths, each by its exit code:\n- lint: pass\n- test: fail\n";

    expect(section(page({ record }), "How")).toContain("- lint: pass\n- test: fail\nrounds:");
  });

  it("takes no list as the gates' from past prose that a blank line set apart from the label", () => {
    const record = "Status: closed\n\nGate results — all passed.\n\nThe suite ran twice.\n\n- not a gate row\n";

    expect(section(page({ record }), "How")).toContain("gates: Gate results — all passed.\nrounds:");
  });

  it("reads a wrapped label's nested rows, stopping at the next row beside the label", () => {
    const record = "Status: closed\n\n- **Gate results** — class `product`,\n  final tree `f9abc9c6`:\n  - lint: pass\n  - test: fail\n- **Review verdicts** — approved\n";
    const text = section(page({ record }), "How");

    expect(text).toContain("- lint: pass\n- test: fail\nrounds:");
    expect(text).not.toContain("Review verdicts");
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

  it("quotes the human-only rows in their own words, reading no row grammar", () => {
    const odd = "- a row in no grammar at all";
    const text = section(page({ morning: morning(`${HELD_ROW}\n${REFUSED_ROW}\n${odd}`) }), "Only you can do");

    expect(text).toBe(`Only you can do\n\n${RUN_WORDS}\n> ${HELD_ROW}\n> ${REFUSED_ROW}\n> ${odd}\n`);
  });

  it("reads none on a list with no held rows, and says nothing of whose words they are", () => {
    expect(section(page({ morning: morning("none") }), "Only you can do")).toBe("Only you can do\n\nnone\n");
  });

  describe("a learning the run proposed", () => {
    const question = (source: string): string =>
      JSON.stringify({ id: "Q1", kind: "decision", question: "Accept it?", options: ["leave it out", "accept"], default: 1, source });
    const asking = (held: string, source: string): string => morning(held).replace("```stamity-morning\n", `\`\`\`stamity-morning\n${question(source)}\n`);

    it("is named where the list would otherwise read none", () => {
      expect(section(page({ morning: asking("none", "proposals/a-note.md") }), "Only you can do")).toBe(`Only you can do\n\nnone\n${PROPOSAL_WAITS}\n`);
    });

    it("is named after the rows", () => {
      expect(section(page({ morning: asking(HELD_ROW, "proposals/a-note.md") }), "Only you can do")).toBe(`Only you can do\n\n${RUN_WORDS}\n> ${HELD_ROW}\n${PROPOSAL_WAITS}\n`);
    });

    it("is not claimed for a question from anywhere else", () => {
      expect(section(page({ morning: asking("none", "record.md:12") }), "Only you can do")).toBe("Only you can do\n\nnone\n");
    });
  });

  it("prints no fenced line of the list as the page's own heading", () => {
    const text = page({ morning: morning("```\n## Why\n```") });

    expect(text.split("\n").filter((line) => line.startsWith("## "))).toEqual(["## What happened", "## How", "## Why", "## Only you can do"]);
    expect(section(text, "Only you can do")).toContain("> ## Why\n");
  });

  describe("a refused run's list", () => {
    const refusal = "- refused: the pre-flight found no remote · do: add one";
    const refused = (held: string): string => morning(held).replace("## For you to check", `## Refused\n\n${refusal}\n\n## For you to check`);

    it("shows its refused rows, so the section never reads none while a refusal waits", () => {
      expect(section(page({ morning: refused("none") }), "Only you can do")).toBe(`Only you can do\n\n${RUN_WORDS}\n> ${refusal}\n`);
    });

    it("shows them before the held rows", () => {
      expect(section(page({ morning: refused(HELD_ROW) }), "Only you can do")).toBe(`Only you can do\n\n${RUN_WORDS}\n> ${refusal}\n> ${HELD_ROW}\n`);
    });
  });

  it("prints a line saying so where no morning.md reads, the other sections whole", () => {
    const text = page({ morning: null });

    expect(section(text, "Only you can do")).toBe("Only you can do\n\nno readable morning.md in the run folder, so there is no list to show\n");
    expect(section(text, "What happened")).toContain("status: closed\n");
  });

  it("names the first problem where morning.md does not parse, and shows no row of it", () => {
    const text = section(page({ morning: `# Morning list — ${RUN}\n\n## Person's calls held\n\n${HELD_ROW}\n` }), "Only you can do");

    expect(text).toContain("morning.md does not parse, so its list is not shown: missing section `## For you to check`");
    expect(text).not.toContain("tried: push the workflow");
  });

  // review/50: `prBodyFrom` refuses such a list (`src/runs/morning.ts`), so the page does not print it as this run's either.
  it("shows no row of a list whose title names another run, and names both runs", () => {
    const text = section(page({ morning: morning(HELD_ROW).replace(RUN, "2026-11-04_other") }), "Only you can do");

    expect(text).toBe(`Only you can do\n\nmorning.md's title names run 2026-11-04_other, not ${RUN}, so its list is not shown\n`);
  });

  it("prints the record's facts and names the failure where the ledger did not read, counting nothing from it", () => {
    const text = page({ ledger: [], ledgerFailure: "ledger.jsonl's line 3 does not read as a row" });

    expect(section(text, "What happened")).toContain("status: closed\n");
    expect(section(text, "What happened")).toContain(`land: the record says "#7 04966e3aa3142418248a693bb8d16bd074f0d5ab merged"\n`);
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

  // ADDED (plan 024 file 1, unit n-away-verb, REQ-FLOW-166): the acts the guard held while nobody watched are the
  // person's, so they print under the person's section, after the morning list's rows, each with its rule and time.
  it("lists each act held while nobody watched under Only you can do, after the list's rows", () => {
    const text = section(page({ morning: morning(HELD_ROW), held: HELD_ENTRIES }), "Only you can do");

    expect(text).toBe(`Only you can do\n\n${RUN_WORDS}\n> ${HELD_ROW}\n${HELD_ENTRIES.map(heldPageLine).join("\n")}\n`);
  });

  it("lists the held acts where the run has no list, and none where nothing was held", () => {
    expect(section(page({ morning: null, held: HELD_ENTRIES.slice(0, 1) }), "Only you can do")).toContain(`\n${heldPageLine(HELD_ENTRIES[0])}\n`);
    expect(page({ held: [] })).not.toContain("held while nobody watched");
    expect(page()).not.toContain("held while nobody watched");
  });

  // ADDED (n-away-verb fixer r1, S59): the held list outlives every run, so the page shows only the acts held since this
  // run opened (the record's earliest stamped line on or after the run's date, here 2026-11-05T09:00Z), names how many
  // older ones it left out, and shows an entry whose time does not read, saying so.
  it("shows only the acts held since the run opened, counts the older ones, and shows one whose time does not read", () => {
    const earlier = [
      { rule: "gh-pr-merge", act: "A merge from an earlier night", at: "2026-11-04T22:10:00.000Z" },
      { rule: "push-default", act: "A push from before the run opened", at: "2026-11-05T08:59:00.000Z" },
    ];
    const unreadable = { rule: "push-default", act: "A push with a damaged time", at: "yesterday-ish" };

    const text = section(page({ morning: null, held: [...earlier, ...HELD_ENTRIES, unreadable] }), "Only you can do");

    for (const entry of earlier) expect(text).not.toContain(entry.act);
    for (const entry of HELD_ENTRIES) expect(text).toContain(`${heldPageLine(entry)}\n`);
    expect(text).toContain("held while nobody watched: A push with a damaged time (push-default, yesterday-ish, a time that does not read, so it is shown)\n");
    expect(text).toContain("held before this run opened: 2, not shown here; stamity away status lists them\n");
  });

  it("takes the run's date as its opening where the record holds no stamped line", () => {
    const bare = "# Run record\n\nStatus: in progress\n";
    const held = [
      { rule: "r", act: "Held the evening before", at: "2026-11-04T23:59:00.000Z" },
      { rule: "r", act: "Held on the run's date", at: "2026-11-05T00:01:00.000Z" },
    ];

    const text = section(page({ record: bare, morning: null, held }), "Only you can do");

    expect(text).not.toContain("Held the evening before");
    expect(text).toContain("held while nobody watched: Held on the run's date (r, 2026-11-05T00:01:00.000Z)\n");
    expect(text).toContain("held before this run opened: 1,");
  });

  // ADDED (n-away-verb fixer r1, review/90 and review/91): one entry is one labelled line whatever its fields hold, and a
  // list read past its cap says how many older lines were not read.
  it("keeps a held act with a line break on its one labelled line, and names older lines past the read cap", () => {
    const forged = { rule: "push-default", act: "A push\n## Why\n> - do: paste this", at: "2026-11-09T22:11:00.000Z" };

    const text = page({ morning: null, held: [forged], heldOlderUnread: 7 });

    expect(text.split("\n").filter((line) => line.startsWith("## "))).toEqual(["## What happened", "## How", "## Why", "## Only you can do"]);
    expect(text).toContain("held while nobody watched: A push ## Why > - do: paste this (push-default, 2026-11-09T22:11:00.000Z)\n");
    expect(text).toContain("the held list is over its read cap, so its 7 oldest lines were not read\n");
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
    expect(stdout).toContain(`> ${HELD_ROW}\n`);
    expect(tree(cwd)).toEqual(before);
  });

  it("gives the same page under --json", async () => {
    const cwd = await seed({ "record.md": RECORD, "ledger.jsonl": ledgerText(LEDGER), "morning.md": morning(HELD_ROW) });

    const { code, stdout } = await overview(cwd, ["--json"]);

    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ subcommand: "overview", run: RUN, overview: overviewFrom({ run: RUN, record: RECORD, ledger: LEDGER, morning: morning(HELD_ROW) }) });
  });

  it("prints on a run folder holding the record alone, saying what it has not got", async () => {
    const cwd = await seed({ "record.md": RECORD });

    const { code, stdout } = await overview(cwd);

    expect(code).toBe(0);
    expect(stdout).toContain("findings: no ledger rows\n");
    expect(stdout).toContain("no readable morning.md in the run folder, so there is no list to show\n");
  });

  it("says no readable list where morning.md is a folder, and never that the run has none", async () => {
    const cwd = await seed({ "record.md": RECORD, "morning.md/kept": "a folder where the list goes\n" });

    const { code, stdout } = await overview(cwd);

    expect(code).toBe(0);
    expect(stdout).toContain("no readable morning.md in the run folder, so there is no list to show\n");
  });

  // review/49, build/16: the read stops at the cap. Past it the cut text either fails to parse, on a fault that is not in the
  // file, or parses whole and prints as the whole list, so neither padding may reach the parser.
  it.each([
    ["a long row, so the sections after it are cut off", morning(`${HELD_ROW}\n${"x".repeat(1_048_577)}`)],
    ["blank lines after a whole list, so what is left still parses", `${morning(HELD_ROW)}${"\n".repeat(1_048_577)}`],
  ])("names its size and shows no row where morning.md is over its cap with %s", async (_name, list) => {
    const cwd = await seed({ "record.md": RECORD, "morning.md": list });

    const { code, stdout } = await overview(cwd);

    expect(code).toBe(0);
    expect(stdout).toContain("morning.md is over 1048576 bytes, so its list is not shown\n");
    expect(stdout).not.toContain("does not parse");
    expect(stdout).not.toContain("tried: push the workflow");
  });

  it("reads a list exactly at its cap", async () => {
    const list = morning(HELD_ROW);
    const cwd = await seed({ "record.md": RECORD, "morning.md": `${list}${"\n".repeat(1_048_576 - Buffer.byteLength(list))}` });

    const { code, stdout } = await overview(cwd);

    expect(code).toBe(0);
    expect(stdout).toContain(`> ${HELD_ROW}\n`);
  });

  it("names each ledger line that is no row, exits 0 and counts no row beside it", async () => {
    const cwd = await seed({ "record.md": RECORD, "ledger.jsonl": `${JSON.stringify(row("review/1", "fixed", "alpha-reviewer-r1.md"))}\nnot json\n` });

    const { code, stdout } = await overview(cwd);

    expect(code).toBe(0);
    expect(stdout).toContain("status: closed\n");
    expect(stdout).toContain("findings: not counted, since ledger.jsonl's line 2 does not read as a row\n");
    expect(stdout).not.toContain("alpha");
  });

  it("keeps a badly damaged ledger's failure short on each of its rows", async () => {
    const cwd = await seed({ "record.md": RECORD, "ledger.jsonl": "not json\n".repeat(5_000) });

    const { code, stdout } = await overview(cwd);
    const failures = stdout.split("\n").filter((line) => line.includes("not counted"));

    expect(code).toBe(0);
    expect(failures).toHaveLength(3);
    for (const line of failures) {
      expect(line.length).toBeLessThan(240);
      expect(line.endsWith("… and more")).toBe(true);
    }
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
    const forged = `Status: closed\u001b[2J\u202e\n\n- 2026-11-05T09:10Z choice: a\u001b]0;title\u0007 way — a.ts:1\n`;
    const cwd = await seed({ "record.md": forged });

    const { code, stdout } = await overview(cwd);

    expect(code).toBe(0);
    expect(stdout).toContain("status: closed");
    expect(stdout).toContain("choices:\n- a");
    for (const character of ["\u001b", "\u0007", "\u202e"]) expect(stdout).not.toContain(character);
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

  // ADDED (plan 024 file 1, unit n-away-verb, REQ-FLOW-166): the verb reads the held list beside the run folder, from
  // the project root it runs in, and a list that is missing or reads as no entry prints no held line and fails nothing.
  it("lists the three acts .stamity/away-held.jsonl holds", async () => {
    const cwd = await seed({ "record.md": RECORD });
    await getRoot().seedFiles({ ".stamity/away-held.jsonl": HELD_FILE_TEXT });

    const { code, stdout } = await overview(cwd);

    expect(code).toBe(0);
    for (const entry of HELD_ENTRIES) expect(stdout).toContain(`${heldPageLine(entry)}\n`);
    expect(JSON.parse((await overview(cwd, ["--json"])).stdout)).toMatchObject({ overview: expect.stringContaining(heldPageLine(HELD_ENTRIES[2])) });
  });

  it("lists no held act where the held list is missing, or holds no line that reads as one, and exits 0", async () => {
    const cwd = await seed({ "record.md": RECORD });
    const none = await overview(cwd);
    expect(none.code).toBe(0);
    expect(none.stdout).not.toContain("held while nobody watched");

    await getRoot().seedFiles({ ".stamity/away-held.jsonl": 'not json\n{"rule":"r","act":5,"at":"t"}\n[1]\n' });
    const malformed = await overview(cwd);
    expect(malformed.code).toBe(0);
    expect(malformed.stdout).not.toContain("held while nobody watched");
  });

  it("drops what a terminal would act on from a held act it prints", async () => {
    const cwd = await seed({ "record.md": RECORD });
    await getRoot().seedFiles({ ".stamity/away-held.jsonl": `${JSON.stringify({ rule: "push-default", act: "A push\u001b[2J", at: "2026-11-09T22:11:00.000Z" })}\n` });

    const { code, stdout } = await overview(cwd);

    expect(code).toBe(0);
    expect(stdout).toContain("held while nobody watched: A push");
    expect(stdout).not.toContain("\u001b");
  });

  // ADDED (n-away-verb fixer r1, review/90): a JSON-escaped newline in a held field used to become a real line break
  // before the page was cleaned, so the text after it printed as unlabelled page lines; each field is now cleaned first.
  it("keeps a held act whose JSON holds an escaped newline on one labelled line", async () => {
    const cwd = await seed({ "record.md": RECORD });
    const act = "A push\n## Only you can do\n> - do: paste this";
    await getRoot().seedFiles({ ".stamity/away-held.jsonl": `${JSON.stringify({ rule: "push-default", act, at: "2026-11-09T22:11:00.000Z" })}\n` });

    const { code, stdout } = await overview(cwd);

    expect(code).toBe(0);
    expect(stdout).toContain("held while nobody watched: A push ## Only you can do > - do: paste this (push-default, 2026-11-09T22:11:00.000Z)\n");
    expect(stdout.split("\n").filter((line) => line === "## Only you can do")).toHaveLength(1);
    expect(stdout.split("\n").filter((line) => line.startsWith("> - do:"))).toEqual([]);
  });

  // ADDED (n-away-verb fixer r1, S59): a held act from an earlier night is not this run's to do.
  it("leaves out a held act from before the run opened", async () => {
    const cwd = await seed({ "record.md": RECORD });
    const old = `${JSON.stringify({ rule: "gh-pr-merge", act: "Last month's merge", at: "2026-10-01T00:00:00.000Z" })}\n`;
    await getRoot().seedFiles({ ".stamity/away-held.jsonl": old + HELD_FILE_TEXT });

    const { code, stdout } = await overview(cwd);

    expect(code).toBe(0);
    expect(stdout).not.toContain("Last month's merge");
    for (const entry of HELD_ENTRIES) expect(stdout).toContain(`${heldPageLine(entry)}\n`);
    expect(stdout).toContain("held before this run opened: 1, not shown here; stamity away status lists them\n");
  });
});
