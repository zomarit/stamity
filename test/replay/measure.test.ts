import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { attributePass, measureRun } from "../../scripts/replay/measure.mjs";
import { type CaptureLayout, type CaptureSpec, type SubagentFile, mainLine, subagentFile, writeCapture } from "./synth.ts";

/**
 * The replay's per-run measurement (REPLAY-v1 §8) over whole capture directories: every capture
 * here is written by `writeCapture`, the builder of the run-directory layout the driver emits, and
 * every path a case asserts on comes from the `CaptureLayout` it returns. Two shapes of the same
 * pass — the 1.9.1 baseline (a free-text return, a heredoc ledger write) and the changed shape (a
 * report with a `stamity-findings` block, a digest return, the ledger verb, a report read) — carry
 * one reviewer finding on a seed, one on a decoy and one on neither, a fixer round and one forced
 * compaction, so the two shapes must score alike where their decisions are alike.
 *
 * Report-local ids stay single-digit: an id of the `C-` class with two or more digits is a
 * private-ledger spelling the leak gate refuses.
 */

interface PassRow {
  id: string;
  loopChars: number;
  breakdown: Record<string, number>;
  subagentTokens: number;
  verdict: { finalClass: string | null; rounds: number; approvedWithSeedUnfixed: boolean };
  seeds: { id: string; present: boolean | null; caughtByImplementer: boolean; found: boolean; foundRound1: boolean; stage: string | null; oracle: string | null }[];
  decoysFlagged: string[];
}
interface Sample {
  n: number;
  placement: string | null;
  trigger: string | null;
  atRisk: number;
  lost: number;
  valid: boolean;
  reason?: string;
}
interface Measurement {
  schema: string;
  runId: string | null;
  shape: string | null;
  kind: string | null;
  invalid: string[];
  notes: string[];
  passes: PassRow[];
  totals: {
    loopChars: number;
    loopCharsPerPass: number;
    breakdown: Record<string, number>;
    unattributedShare: number;
    perPassUnreliable: boolean;
    ledgerBeside: Record<string, { calls: number; chars: number }>;
    subagentTokens: number;
    subagentTokensPerPass: number;
    compactionsAuto: number;
    recall: { found: number; denominator: number; byClass: Record<string, { found: number; denominator: number }> };
    readerSkips: { unreadFreeText: Record<string, number>; digestErrors: number; findingsBlockErrors: number };
    unjoinedSubagents: number;
    decoyFalseFlags: number;
    unmatched: number;
    oraclePass: number;
  };
  compactionSamples: Sample[];
  wholeBranch: { finalClass: string | null; rounds: number };
  adjudication: { item: string; locator: string }[];
  models: { init: string | null };
}

const measure = (runDir: string, forbid: string[] = []): Promise<Measurement> => measureRun(runDir, { seeds: SEEDS, forbid }) as Promise<Measurement>;

const MEASURE_MJS = resolve(import.meta.dirname, "../../scripts/replay/measure.mjs");
const RUN = "2026-09-24_replay";
const REPORT_REL = `.stamity/runs/${RUN}/reports/u1-p1-reviewer-r1.md`;

const SEEDS = {
  schema: "stamity/replay-seeds/v1",
  matcher: { lineTolerance: 3, severities: ["Critical", "Warning"] },
  seeds: [
    {
      id: "sec-sql-sort",
      class: "security",
      severity: "Critical",
      pass: "u1-p1",
      file: "src/store/query.ts",
      locate: { text: "ORDER BY ${sort}", from: 0, to: 0 },
      present: { contains: "ORDER BY ${sort}" },
      span: [11, 11],
      terms: ["inject", "concatenat", "interpolat", "parameteri", "allowlist"],
      oracle: { kind: "vitest", file: "test/__oracle__/sec-sql-sort.test.ts" },
    },
  ],
  decoys: [
    {
      id: "dec-internal-rename",
      pass: "u1-p1",
      file: "src/orders/format.ts",
      locate: { text: "function formatCents", from: 0, to: 0 },
      present: { contains: "function formatCents" },
      span: [5, 5],
      terms: ["rename", "breaking", "consumer", "export"],
    },
  ],
};

/** `line` at 1-based `at` in a file of `size` filler lines. */
const fileWith = (at: number, line: string, size = at + 5): string =>
  Array.from({ length: size }, (_, i) => (i + 1 === at ? line : `// line ${i + 1}`)).join("\n") + "\n";
const QUERY_AT = (at: number): string => fileWith(at, "  const sql = `SELECT id FROM orders ORDER BY ${sort} DESC LIMIT ? OFFSET ?`;");
const FORMAT = fileWith(5, "function formatCents(cents: number): string {");
const SNAPSHOT_U1P1 = { main: { "src/store/query.ts": QUERY_AT(11), "src/orders/format.ts": FORMAT } };

interface Row {
  id: string;
  severity: "Critical" | "Warning";
  locator: string;
  summary: string;
}
const SEED_FINDING: Row = { id: "C-1", severity: "Critical", locator: "src/store/query.ts:11", summary: "sort value concatenated into SQL" };
const DECOY_FINDING: Row = { id: "W-1", severity: "Warning", locator: "src/orders/format.ts:5", summary: "renaming fmt is a breaking change for a consumer" };
const LOOSE_FINDING: Row = { id: "W-2", severity: "Warning", locator: "src/http/app.ts:30", summary: "the error handler logs the whole request body" };
const THREE = [SEED_FINDING, DECOY_FINDING, LOOSE_FINDING];

const freeTextReturn = (rows: Row[], verdict: string, locate: (r: Row) => string = (r) => r.locator): string =>
  [`**Verdict:** ${verdict}`, "", "| Severity | Locator | Finding |", "|---|---|---|", ...rows.map((r) => `| ${r.severity} | ${locate(r)} | ${r.summary} |`)].join("\n");

const digestReturn = (rows: Row[], verdict: string, report: string): string =>
  [
    "status: DONE",
    `verdict: ${verdict}`,
    "confidence: high — read the diff",
    `report: ${report}`,
    rows.length === 0 ? "findings: none" : "findings:",
    ...rows.map((r) => `${r.id} ${r.locator} — ${r.summary}`),
    "security: none",
    "contract delta: none",
  ].join("\n");

const reportText = (rows: Row[]): string =>
  ["# Review of u1-p1", "", "```stamity-findings", ...rows.map((r) => JSON.stringify({ id: r.id, severity: r.severity, locator: r.locator, summary: r.summary })), "```", ""].join("\n");

const ledgerRows = (rows: Row[], report?: string): Record<string, unknown>[] =>
  rows.map((r, i) => ({
    id: `${RUN}/build/${i + 1}`,
    phase: "build",
    source: "reviewer",
    severity: r.severity,
    evidence: `${r.locator} — ${r.summary}`,
    state: "open",
    rationale: "",
    ...(report ? { report } : {}),
  }));

const VERB_CMD = `npx @zomarit/stamity ledger append --run ${RUN} --phase build --source reviewer --report ${REPORT_REL}`;
const VERB_RESULT = `${RUN}/build/1 Critical C-1\n${RUN}/build/2 Warning W-1\n${RUN}/build/3 Warning W-2`;

const temps: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "stamity-replay-measure-"));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface AgentSpec {
  id: string;
  agentId: string;
  type: string;
  description: string;
  prompt: string;
  result: string;
  tokens: number;
  requestedModel?: string;
  answeredOn?: string;
}

/** An Agent dispatch run in the background: the tool_use, its launch ack, and the delivered notification. */
function dispatch(a: AgentSpec): string[] {
  return [
    mainLine.agentToolUse({ id: a.id, subagentType: a.type, description: a.description, prompt: a.prompt, background: true }),
    mainLine.toolResult(a.id, `Async agent launched successfully.\nagentId: ${a.agentId}`),
    mainLine.taskNotification({ taskId: `task-${a.agentId}`, toolUseId: a.id, result: a.result }),
  ];
}

function subagentOf(a: AgentSpec): SubagentFile {
  const input = Math.round(a.tokens * 0.9);
  return subagentFile({
    agentId: a.agentId,
    agentType: a.type,
    prompt: a.prompt,
    requestedModel: a.requestedModel ?? "opus",
    toolUseId: a.id,
    description: a.description,
    requests: [{ id: `msg_${a.agentId}`, model: a.answeredOn ?? "claude-opus-5-5", usage: { input, output: a.tokens - input } }],
  });
}

type Shape = "baseline" | "changed";

interface PassCaptureOptions {
  shape: Shape;
  /** Lines added to the main transcript after the ledger write, before the compaction. */
  extra?: string[];
  /** How the first review cites a locator, given the fixture root (an absolute spelling of it, say). */
  locate?: (r: Row, fixture: string) => string;
  /** The first review's rows. */
  rows?: Row[];
  run?: Record<string, unknown>;
  snapshots?: CaptureSpec["snapshots"];
  oracle?: "pass" | "fail";
  init?: Record<string, unknown> | null;
  /** Agents dispatched after the second review. */
  after?: AgentSpec[];
  /** Replaces the pre-compaction ledger (defaults to the rows the first review filed). */
  preLedger?: Record<string, unknown>[];
  endLedger?: Record<string, unknown>[];
  /** Lines appended to the main transcript after every dispatch. */
  tail?: string[];
  /** Sub-agent files with no dispatch in the main transcript. */
  extraSubagents?: SubagentFile[];
}

interface Built {
  layout: CaptureLayout;
  fixture: string;
  agents: AgentSpec[];
}

/**
 * One pass of the run, u1-p1, in either shape: implementer, reviewer (three findings), the
 * orchestrator's ledger write, a forced compaction, fixer, reviewer approving, plus a researcher
 * whose role is outside the loop.
 */
function passCapture(options: PassCaptureOptions): Built {
  const dir = scratch();
  const fixture = join(dir, "fx");
  mkdirSync(fixture);
  const { shape } = options;
  const rows = options.rows ?? THREE;
  const locate = (r: Row): string => (options.locate ? options.locate(r, fixture) : r.locator);
  const firstReview =
    shape === "baseline" ? freeTextReturn(rows, "request-changes", locate) : digestReturn(rows.map((r) => ({ ...r, locator: locate(r) })), "request-changes", REPORT_REL);
  const secondReview =
    shape === "baseline" ? "**Verdict:** approve\n\nNo findings." : digestReturn([], "approve", `.stamity/runs/${RUN}/reports/u1-p1-reviewer-r2.md`);
  const agents: AgentSpec[] = [
    { id: "tu_impl", agentId: "aimpl", type: "stamity-implementer", description: "Implement u1-p1", prompt: "Build unit u1-p1 of the plan.", result: "status: DONE", tokens: 1100 },
    { id: "tu_rsch", agentId: "arsch", type: "stamity-researcher", description: "Research the API", prompt: "Map the order routes.", result: "The routes are in src/http.", tokens: 9900 },
    { id: "tu_rev1", agentId: "arev1", type: "stamity-reviewer", description: "Review u1-p1", prompt: "Review unit u1-p1.", result: firstReview, tokens: 2200 },
    { id: "tu_fix", agentId: "afix", type: "stamity-fixer", description: "Fix u1-p1", prompt: "Fix the findings of u1-p1.", result: "status: DONE", tokens: 1650 },
    { id: "tu_rev2", agentId: "arev2", type: "stamity-reviewer", description: "Re-review u1-p1", prompt: "Re-review unit u1-p1.", result: secondReview, tokens: 880 },
    ...(options.after ?? []),
  ];
  const [impl, rsch, rev1, fix, rev2, ...after] = agents as [AgentSpec, AgentSpec, AgentSpec, AgentSpec, AgentSpec, ...AgentSpec[]];
  const filed = shape === "baseline" ? ledgerRows(rows) : ledgerRows(rows, REPORT_REL);
  const ledgerWrite =
    shape === "baseline"
      ? [
          mainLine.bashToolUse({ id: "tu_led", command: `cat >> .stamity/runs/${RUN}/ledger.jsonl <<'EOF'\n${filed.map((r) => JSON.stringify(r)).join("\n")}\nEOF` }),
          mainLine.toolResult("tu_led", ""),
        ]
      : [
          mainLine.bashToolUse({ id: "tu_led", command: VERB_CMD }),
          mainLine.toolResult("tu_led", VERB_RESULT),
          mainLine.readToolUse({ id: "tu_read", filePath: `${fixture}/${REPORT_REL}` }),
          mainLine.toolResult("tu_read", reportText(rows)),
        ];
  const transcript = [
    mainLine.userText("/st-work docs/plans/001-replay.md --effort deep"),
    ...dispatch(impl),
    ...dispatch(rsch),
    ...dispatch(rev1),
    ...ledgerWrite,
    ...(options.extra ?? []),
    mainLine.compactBoundary({ trigger: "manual", preTokens: 120_000 }),
    mainLine.userText("Continue the /st-work run from where it stopped."),
    ...dispatch(fix),
    ...dispatch(rev2),
    ...after.flatMap(dispatch),
    ...(options.tail ?? []),
  ];
  const reports = shape === "changed" ? { "u1-p1-reviewer-r1.md": reportText(rows) } : undefined;
  const layout = writeCapture(dir, {
    run: { runId: "2026-09-24-replay-1", shape, kind: "scored", ...options.run },
    stdout: options.init === null ? [] : [JSON.stringify({ type: "system", subtype: "init", model: "claude-opus-5-5", cwd: fixture, ...options.init })],
    transcript,
    subagents: [...agents.map(subagentOf), ...(options.extraSubagents ?? [])],
    snapshots: options.snapshots ?? { "u1-p1": SNAPSHOT_U1P1 },
    state: {
      "compaction-1-pre": { runId: RUN, ledger: options.preLedger ?? filed, ...(reports ? { reports } : {}) },
      end: { runId: RUN, ledger: options.endLedger ?? filed, ...(reports ? { reports } : {}) },
    },
    oracle: { schema: "stamity/replay-oracle/v1", results: [{ seed: "sec-sql-sort", kind: "vitest", status: options.oracle ?? "pass", detail: "" }] },
  });
  return { layout, fixture, agents };
}

/** A main-transcript tool_use of any tool, in the client's line shape. */
function toolUseLine(name: string, id: string, input: Record<string, unknown>): string {
  const line = JSON.parse(mainLine.readToolUse({ id, filePath: "unused" })) as { message: { content: { name: string; input: unknown }[] } };
  line.message.content[0]!.name = name;
  line.message.content[0]!.input = input;
  return JSON.stringify(line);
}

/** An Agent tool_use's characters, the walk's rule: key lengths plus leaf-string lengths. */
const inputChars = (input: Record<string, string>): number => Object.entries(input).reduce((a, [k, v]) => a + k.length + v.length, 0);

/** A third review of u1-p1, after the approving second one. */
const thirdReview = (result: string): AgentSpec => ({
  id: "tu_rev3", agentId: "arev3", type: "stamity-reviewer", description: "Review u1-p1", prompt: "Review unit u1-p1.", result, tokens: 10,
});

describe("measureRun — the two shapes score alike", () => {
  it.each<Shape>(["baseline", "changed"])("(1)(2) %s: recall 1/1, one decoy flagged, one unmatched finding", async (shape) => {
    const { layout } = passCapture({ shape });
    const m = await measure(layout.runDir);
    expect(m.invalid).toEqual([]);
    expect(m.schema).toBe("stamity/replay-measurement/v1");
    expect([m.runId, m.shape, m.kind]).toEqual(["2026-09-24-replay-1", shape, "scored"]);
    expect(m.totals.recall).toEqual({ found: 1, denominator: 1, byClass: { security: { found: 1, denominator: 1 } } });
    expect(m.totals.decoyFalseFlags).toBe(1);
    expect(m.totals.unmatched).toBe(1);
    const u1p1 = m.passes.find((p) => p.id === "u1-p1")!;
    expect(u1p1.seeds).toEqual([
      expect.objectContaining({ id: "sec-sql-sort", present: true, caughtByImplementer: false, found: true, foundRound1: true, stage: "pass", oracle: "pass" }),
    ]);
    expect(u1p1.decoysFlagged).toEqual(["dec-internal-rename"]);
    expect(u1p1.verdict).toEqual({ finalClass: "approve-after-fixes", rounds: 2, approvedWithSeedUnfixed: false });
    expect(m.passes.filter((p) => p.id !== "u1-p1").map((p) => p.verdict.finalClass)).toEqual([null, null, null, null, null]);
  });

  it("counts sub-agent tokens over the loop-function agents only, per the six passes", async () => {
    const { layout } = passCapture({ shape: "baseline" });
    const m = await measure(layout.runDir);
    // implementer 1100 + reviewer 2200 + fixer 1650 + reviewer 880; the researcher's 9900 is outside the loop.
    expect(m.totals.subagentTokens).toBe(5830);
    expect(m.totals.subagentTokensPerPass).toBeCloseTo(5830 / 6);
    expect(m.passes.find((p) => p.id === "u1-p1")!.subagentTokens).toBe(5830);
  });

  it("classes a pass blocked when its last review is a BLOCKED_* return, and not on a mention of one", async () => {
    const blocked = await measure(passCapture({ shape: "baseline", after: [thirdReview( "status: BLOCKED_DEPENDENCY\nThe fixture's lockfile is missing.")] }).layout.runDir);
    expect(blocked.passes.find((p) => p.id === "u1-p1")!.verdict).toEqual(expect.objectContaining({ finalClass: "blocked", rounds: 3 }));
    const mention = await measure(passCapture({ shape: "baseline", after: [thirdReview( "**Verdict:** approve\n\nNo BLOCKED_DEPENDENCY remains from round 1.")] }).layout.runDir);
    expect(mention.passes.find((p) => p.id === "u1-p1")!.verdict).toEqual(expect.objectContaining({ finalClass: "approve-after-fixes", rounds: 3 }));
  });

  it("approves with a seed unfixed when the pass's seed oracle does not pass", async () => {
    const { layout } = passCapture({ shape: "baseline", oracle: "fail" });
    const m = await measure(layout.runDir);
    expect(m.passes.find((p) => p.id === "u1-p1")!.verdict.approvedWithSeedUnfixed).toBe(true);
  });
});

describe("measureRun — loop characters", () => {
  it("(3) counts the ledger verb and a report read with their results under (c) and (e)", async () => {
    const { layout, fixture } = passCapture({ shape: "changed" });
    const m = await measure(layout.runDir);
    const readPath = `${fixture}/${REPORT_REL}`;
    expect(m.totals.breakdown["ledger"]).toBe(VERB_CMD.length + VERB_RESULT.length);
    expect(m.totals.breakdown["reportReads"]).toBe("file_path".length + readPath.length + reportText(THREE).length);
    expect(m.totals.loopCharsPerPass).toBeCloseTo(m.totals.loopChars / 6);
    expect(m.totals.unattributedShare).toBe(0);
  });

  it("(3) reports a code heredoc and a helper write beside the gated figure, never inside it", async () => {
    const without = passCapture({ shape: "changed" });
    const extra = [
      mainLine.bashToolUse({ id: "tu_code", command: `node <<'EOF'\nconst fs = require('node:fs')\nfs.appendFileSync('.stamity/runs/${RUN}/ledger.jsonl', rows)\nEOF` }),
      mainLine.toolResult("tu_code", "ok"),
      mainLine.writeToolUse({ id: "tu_help", filePath: "/tmp/scratch/ledger-helper.cjs", content: "module.exports = (rows) => rows" }),
      mainLine.toolResult("tu_help", "File created successfully"),
    ];
    const withCalls = passCapture({ shape: "changed", extra });
    const [a, b] = [await measure(without.layout.runDir), await measure(withCalls.layout.runDir)];
    expect(b.totals.ledgerBeside["codeHeredoc"]?.calls).toBe(1);
    expect(b.totals.ledgerBeside["helperWriteEdit"]?.calls).toBe(1);
    expect(b.totals.ledgerBeside["codeHeredoc"]!.chars).toBeGreaterThan(0);
    expect(a.totals.ledgerBeside).toEqual({});
    expect(b.totals.loopChars).toBe(a.totals.loopChars);
    expect(b.totals.breakdown).toEqual(a.totals.breakdown);
  });

  it("keeps a researcher's prompt and delivery out of the loop, and counts the baseline heredoc under (c)", async () => {
    const { layout, agents } = passCapture({ shape: "baseline" });
    const m = await measure(layout.runDir);
    const researcher = agents.find((a) => a.type === "stamity-researcher")!;
    expect(m.totals.breakdown["prompts"]).toBe(sumPromptChars(agents.filter((a) => a !== researcher)));
    expect(m.totals.breakdown["ledger"]).toBeGreaterThan(0);
    expect(m.totals.breakdown["reportReads"]).toBe(0);
    const u1p1 = m.passes.find((p) => p.id === "u1-p1")!;
    expect(u1p1.loopChars).toBe(m.totals.loopChars);
  });

  it("reports a resume prompt separately and keeps it out of the loop total", async () => {
    const resume: AgentSpec = {
      id: "tu_res", agentId: "ares", type: "stamity-reviewer", description: "Review u1-p1", prompt: "Resume the review of u1-p1 after the rate limit.", result: "**Verdict:** approve", tokens: 10,
    };
    const base = await measure(passCapture({ shape: "baseline" }).layout.runDir);
    const m = await measure(passCapture({ shape: "baseline", after: [resume] }).layout.runDir);
    expect(m.totals.breakdown["resumes"]).toBeGreaterThan(0);
    expect(m.totals.breakdown["prompts"]).toBe(base.totals.breakdown["prompts"]);
    // Only the resumed agent's delivery joins the loop total; its resume prompt stays out of it.
    expect(m.totals.loopChars - base.totals.loopChars).toBe(m.totals.breakdown["returns"]! - base.totals.breakdown["returns"]!);
  });

  it("(5) attributes a dispatch naming two passes in its prompt to multi, which no pass receives", async () => {
    expect(attributePass("Review the lanes", "Review u2-p1 and then u3-p1.")).toBe("multi");
    expect(attributePass("Review u2-p2", "Review u2-p1 and then u3-p1.")).toBe("u2-p2");
    expect(attributePass("Review the lane", "Review u3-p1 again: u3-p1.")).toBe("u3-p1");
    expect(attributePass("Review the lane", "No pass named.")).toBeNull();
    const multi: AgentSpec = {
      id: "tu_multi", agentId: "amulti", type: "stamity-security", description: "Security lens over the lanes", prompt: "Look at u2-p1 and u3-p1.", result: "No findings.", tokens: 10,
    };
    const base = await measure(passCapture({ shape: "baseline" }).layout.runDir);
    const m = await measure(passCapture({ shape: "baseline", after: [multi] }).layout.runDir);
    const perPassSum = m.passes.reduce((a, p) => a + p.loopChars, 0);
    expect(m.passes.reduce((a, p) => a + p.loopChars, 0)).toBe(base.passes.reduce((a, p) => a + p.loopChars, 0));
    expect(m.totals.loopChars).toBeGreaterThan(perPassSum);
    expect(m.totals.unattributedShare).toBeGreaterThan(0);
  });

  it("flags the per-pass split unreliable when more than 20% is unattributed", async () => {
    const big: AgentSpec = {
      id: "tu_big", agentId: "abig", type: "stamity-reviewer", description: "Review the lanes", prompt: "Look at u2-p1 and u3-p1.", result: "x".repeat(40_000), tokens: 10,
    };
    const m = await measure(passCapture({ shape: "baseline", after: [big] }).layout.runDir);
    expect(m.totals.unattributedShare).toBeGreaterThan(0.2);
    expect(m.totals.perPassUnreliable).toBe(true);
  });

  it("keeps a whole-branch review out of the loop and reads its verdict apart", async () => {
    const branch: AgentSpec = {
      id: "tu_branch", agentId: "abranch", type: "stamity-reviewer", description: "Whole-branch review", prompt: "Review the whole branch.", result: "**Verdict:** approve", tokens: 10,
    };
    const base = await measure(passCapture({ shape: "baseline" }).layout.runDir);
    const m = await measure(passCapture({ shape: "baseline", after: [branch] }).layout.runDir);
    expect(m.totals.loopChars).toBe(base.totals.loopChars);
    expect(m.wholeBranch).toEqual({ finalClass: "approve", rounds: 1 });
    expect(base.wholeBranch).toEqual({ finalClass: null, rounds: 0 });
  });
});

function sumPromptChars(agents: AgentSpec[]): number {
  // An Agent tool_use's characters: key lengths plus leaf lengths of its input (the walk's rule).
  return agents.reduce((a, x) => a + "description".length + x.description.length + "prompt".length + x.prompt.length + "subagent_type".length + x.type.length + "run_in_background".length + "true".length, 0);
}

describe("measureRun — recall edges", () => {
  it("(7) a seed whose present rule fails in every snapshot copy is caught by the implementer and leaves the denominator", async () => {
    const fixed = { "src/store/query.ts": fileWith(11, "  const sql = `SELECT id FROM orders ORDER BY created_at DESC`;"), "src/orders/format.ts": FORMAT };
    const { layout } = passCapture({ shape: "baseline", snapshots: { "u1-p1": { main: fixed, "lane-u1-p1": fixed } } });
    const m = await measure(layout.runDir);
    const seed = m.passes.find((p) => p.id === "u1-p1")!.seeds[0]!;
    expect(seed).toEqual(expect.objectContaining({ present: false, caughtByImplementer: true }));
    expect(m.totals.recall.denominator).toBe(0);
    expect(m.totals.recall.found).toBe(0);
  });

  it("(7) a seed present in one worktree copy only stays in the denominator", async () => {
    const fixed = { "src/store/query.ts": fileWith(11, "  const sql = `SELECT id FROM orders ORDER BY created_at DESC`;"), "src/orders/format.ts": FORMAT };
    const { layout } = passCapture({ shape: "baseline", snapshots: { "u1-p1": { main: fixed, "lane-u1-p1": SNAPSHOT_U1P1.main } } });
    const m = await measure(layout.runDir);
    expect(m.totals.recall).toEqual(expect.objectContaining({ found: 1, denominator: 1 }));
  });

  it("keeps a seed in the denominator, with presence unknown, when its pass has no snapshot at all", async () => {
    const { layout } = passCapture({ shape: "baseline", snapshots: {} });
    const m = await measure(layout.runDir);
    expect(m.passes.find((p) => p.id === "u1-p1")!.seeds[0]).toEqual(expect.objectContaining({ present: null, caughtByImplementer: false }));
    expect(m.totals.recall.denominator).toBe(1);
    expect(m.notes.join("\n")).toMatch(/captures\/snapshots\/u1-p1\//);
  });

  it("matches a finding at the line the reviewed snapshot holds the seed on, not only the seeded tree's span", async () => {
    const moved = { main: { "src/store/query.ts": QUERY_AT(20), "src/orders/format.ts": FORMAT } };
    const rows = [{ ...SEED_FINDING, locator: "src/store/query.ts:20" }];
    const { layout } = passCapture({ shape: "baseline", rows, snapshots: { "u1-p1": moved } });
    const m = await measure(layout.runDir);
    expect(m.totals.recall.found).toBe(1);
  });

  it("(build/112) reads a locator in the resolved spelling of the fixture root", async () => {
    const baseline = passCapture({ shape: "baseline", locate: (r, fixture) => `${realpathSync(fixture)}/${r.locator}` });
    const m = await measure(baseline.layout.runDir);
    // The ledger rows cite relative paths, so round 1 at the pass is the return's own read.
    expect(m.passes.find((p) => p.id === "u1-p1")!.seeds[0]).toEqual(expect.objectContaining({ found: true, foundRound1: true, stage: "pass" }));
    expect(m.totals.decoyFalseFlags).toBe(1);
  });

  it("(build/112) reads a changed-shape digest locator in the resolved spelling of the fixture root", async () => {
    const changed = passCapture({ shape: "changed", locate: (r, fixture) => `${realpathSync(fixture)}/${r.locator}`, rows: [SEED_FINDING] });
    const m = await measure(changed.layout.runDir);
    expect(m.totals.readerSkips.digestErrors).toBe(0);
    expect(m.totals.unmatched).toBe(0);
  });

  it("(build/91) keeps a finding with no file out of the unmatched count", async () => {
    const rows: Row[] = [...THREE, { id: "W-3", severity: "Warning", locator: "npm run lint", summary: "the lint gate fails on the new file" }];
    const { layout } = passCapture({ shape: "changed", rows });
    const m = await measure(layout.runDir);
    expect(m.totals.unmatched).toBe(1);
  });

  it("puts a location match without a term on the adjudication list, not in the score", async () => {
    const rows: Row[] = [{ ...SEED_FINDING, summary: "style nit on the query builder" }];
    const { layout } = passCapture({ shape: "baseline", rows });
    const m = await measure(layout.runDir);
    expect(m.totals.recall.found).toBe(0);
    expect(m.adjudication).toEqual([expect.objectContaining({ item: "sec-sql-sort", locator: "src/store/query.ts:11" })]);
  });

  it("(build/109) reports unread free-text blocks and digest errors beside recall, per shape", async () => {
    const note: AgentSpec = {
      id: "tu_note", agentId: "anote", type: "stamity-security", description: "Security lens u1-p1", prompt: "Lens u1-p1.",
      result: "## Query\nWarning: the query builder in query.ts line 12 trusts its input.\n\n## Store\nsrc/store/db.ts:4 opens the file read-write.", tokens: 10,
    };
    const baseline = await measure(passCapture({ shape: "baseline", after: [note] }).layout.runDir);
    expect(baseline.totals.readerSkips.unreadFreeText).toEqual({ "severity-without-locator": 1, "locator-without-severity": 1 });
    const bad: AgentSpec = {
      id: "tu_bad", agentId: "abad", type: "stamity-security", description: "Security lens u1-p1", prompt: "Lens u1-p1.",
      result: "status: DONE\nmode: advisory\nreport: .stamity/runs/r/reports/u1-p1-security-r1.md\nfindings: see the report\nsecurity: none", tokens: 10,
    };
    const changed = await measure(passCapture({ shape: "changed", after: [bad] }).layout.runDir);
    expect(changed.totals.readerSkips.digestErrors).toBe(1);
    expect(changed.totals.readerSkips.unreadFreeText).toEqual({ "severity-without-locator": 0, "locator-without-severity": 0 });
  });
});

describe("measureRun — compaction samples", () => {
  const one = [SEED_FINDING];

  it("records the forced compaction with its placement, and no sample is valid when every finding had its row", async () => {
    const m = await measure(passCapture({ shape: "changed" }).layout.runDir);
    expect(m.compactionSamples).toEqual([expect.objectContaining({ n: 1, placement: "u1-p1", trigger: "manual", atRisk: 0, lost: 0, valid: false })]);
  });

  it.each<Shape>(["baseline", "changed"])("(4) %s: a finding with no pre-compaction row is at risk, and not lost when the row lands later", async (shape) => {
    // The seed's oracle fails, so only the run-end row keeps the finding from being lost.
    const m = await measure(passCapture({ shape, rows: one, preLedger: [], oracle: "fail" }).layout.runDir);
    expect(m.compactionSamples[0]).toEqual(expect.objectContaining({ atRisk: 1, lost: 0, valid: true }));
  });

  it.each<Shape>(["baseline", "changed"])("(4) %s: with no row at run end and the seed's oracle failing, the finding is lost", async (shape) => {
    const m = await measure(passCapture({ shape, rows: one, preLedger: [], endLedger: [], oracle: "fail" }).layout.runDir);
    expect(m.compactionSamples[0]).toEqual(expect.objectContaining({ atRisk: 1, lost: 1, valid: true }));
  });

  it("does not count a finding lost when its seed's oracle passes at run end", async () => {
    const m = await measure(passCapture({ shape: "baseline", rows: one, preLedger: [], endLedger: [], oracle: "pass" }).layout.runDir);
    expect(m.compactionSamples[0]).toEqual(expect.objectContaining({ atRisk: 1, lost: 0 }));
  });

  it("counts automatic compactions apart from the driver's", async () => {
    const auto = [mainLine.compactBoundary({ trigger: "auto", preTokens: 900_000 })];
    const m = await measure(passCapture({ shape: "baseline", extra: auto }).layout.runDir);
    expect(m.totals.compactionsAuto).toBe(1);
    expect(m.compactionSamples.map((s) => s.trigger)).toEqual(["manual"]);
  });
});

describe("measureRun — validity", () => {
  it("(6) a --forbid path in any tool input marks the run invalid, named without the path", async () => {
    const dir = scratch();
    const checkout = join(dir, "checkout");
    mkdirSync(checkout);
    const extra = [mainLine.readToolUse({ id: "tu_peek", filePath: join(checkout, "src", "x.ts") }), mainLine.toolResult("tu_peek", "x")];
    const m = await measure(passCapture({ shape: "baseline", extra }).layout.runDir, [checkout]);
    expect(m.invalid).toEqual([expect.stringMatching(/^forbidden --forbid\[0\] in a Read input/)]);
    expect(m.invalid.join("\n")).not.toContain(dir);
  });

  it("(6) seeds.json or __oracle__ in a tool input marks the run invalid without any --forbid", async () => {
    const extra = [mainLine.bashToolUse({ id: "tu_seeds", command: "cat evals/replay/v1/seeds.json" }), mainLine.toolResult("tu_seeds", "{}")];
    const m = await measure(passCapture({ shape: "baseline", extra }).layout.runDir);
    expect(m.invalid).toEqual([expect.stringMatching(/^forbidden seeds\.json in a Bash input/)]);
  });

  it("marks the run invalid when it did not end complete", async () => {
    const m = await measure(passCapture({ shape: "baseline", run: { end: { reason: "wall-cap" } } }).layout.runDir);
    expect(m.invalid).toEqual(['run.json end.reason is "wall-cap", not "complete"']);
  });

  it("marks the run invalid on an init model outside the pin, or no init event", async () => {
    const other = await measure(passCapture({ shape: "baseline", init: { model: "claude-sonnet-5" } }).layout.runDir);
    expect(other.invalid).toEqual(['init model "claude-sonnet-5" is not the pin claude-opus-5-5']);
    const none = await measure(passCapture({ shape: "baseline", init: null }).layout.runDir);
    expect(none.invalid).toEqual([expect.stringMatching(/^no init event/)]);
  });

  it("marks the run invalid when a sub-agent's alias resolves to another model family", async () => {
    const drift: AgentSpec = {
      id: "tu_drift", agentId: "adrift", type: "stamity-performance", description: "Performance lens u1-p1", prompt: "Lens u1-p1.", result: "No findings.", tokens: 10,
      requestedModel: "sonnet", answeredOn: "claude-opus-5-5",
    };
    const fine: AgentSpec = { ...drift, id: "tu_fine", agentId: "afine", answeredOn: "claude-sonnet-5" };
    const m = await measure(passCapture({ shape: "baseline", after: [fine, drift] }).layout.runDir);
    expect(m.invalid).toEqual(["sub-agent stamity-performance (adrift) answered on claude-opus-5-5, outside the pin for sonnet"]);
  });

  it("refuses a seeds document of another schema", async () => {
    const { layout } = passCapture({ shape: "baseline" });
    await expect(measureRun(layout.runDir, { seeds: { ...SEEDS, schema: "other" } })).rejects.toThrow(/stamity\/replay-seeds\/v1/);
  });
});

describe("measureRun — review round 1 fixes", () => {
  it("(build/164) keeps an unjoined sub-agent's tokens in the sum, counted and noted", async () => {
    const orphan = subagentFile({ agentId: "aorphan", agentType: "x", prompt: "Do the thing.", requests: [{ id: "msg_orphan", usage: { input: 600, output: 100 } }] });
    orphan.meta = { description: "" };
    const m = await measure(passCapture({ shape: "baseline", extraSubagents: [orphan] }).layout.runDir);
    expect(m.totals.subagentTokens).toBe(5830 + 700);
    expect(m.totals.unjoinedSubagents).toBe(1);
    expect(m.notes.join("\n")).toMatch(/aorphan/);
    const base = await measure(passCapture({ shape: "baseline" }).layout.runDir);
    expect(base.totals.unjoinedSubagents).toBe(0);
  });

  it("(build/165) reads a short SendMessage digest as the reviewer's delivery: a round and its verdict", async () => {
    const digest = digestReturn([SEED_FINDING], "request-changes", `.stamity/runs/${RUN}/reports/u1-p1-reviewer-r3.md`);
    expect(digest.length).toBeLessThan(1500);
    const tail = [mainLine.sendMessage({ id: "tu_send", to: "arev1", message: "Re-review u1-p1 after the fix." }), mainLine.toolResult("tu_send", digest)];
    const m = await measure(passCapture({ shape: "changed", tail }).layout.runDir);
    expect(m.passes.find((p) => p.id === "u1-p1")!.verdict).toEqual(expect.objectContaining({ finalClass: "blocked", rounds: 3 }));
  });

  it("(build/165) names a long SendMessage result read as an acknowledgement beside the figure", async () => {
    const tail = [mainLine.sendMessage({ id: "tu_send", to: "arev1", message: "Hold on." }), mainLine.toolResult("tu_send", `Message queued. ${"x".repeat(1600)}`)];
    const m = await measure(passCapture({ shape: "changed", tail }).layout.runDir);
    expect(m.notes.join("\n")).toMatch(/SendMessage result/);
  });

  it("(build/166) a baseline free-text return under a Findings: heading keeps its unread count and adds no digest error", async () => {
    const lens: AgentSpec = {
      id: "tu_lens", agentId: "alens", type: "stamity-security", description: "Security lens u1-p1", prompt: "Lens u1-p1.",
      result: "**Verdict:** request-changes\n\nFindings:\n\n## Query\nWarning: the query builder in query.ts line 12 trusts its input.", tokens: 10,
    };
    const m = await measure(passCapture({ shape: "baseline", after: [lens] }).layout.runDir);
    expect(m.totals.readerSkips.unreadFreeText["severity-without-locator"]).toBe(1);
    expect(m.totals.readerSkips.digestErrors).toBe(0);
  });

  it("(build/167) a seed whose file is absent from every copy of an existing snapshot has presence unknown and stays in the denominator", async () => {
    const without = { "src/orders/format.ts": FORMAT };
    const m = await measure(passCapture({ shape: "baseline", snapshots: { "u1-p1": { main: without, "lane-u1-p1": without } } }).layout.runDir);
    expect(m.passes.find((p) => p.id === "u1-p1")!.seeds[0]).toEqual(expect.objectContaining({ present: null, caughtByImplementer: false, found: true }));
    expect(m.totals.recall).toEqual(expect.objectContaining({ found: 1, denominator: 1 }));
    expect(m.notes.join("\n")).toMatch(/u1-p1[^\n]*src\/store\/query\.ts/);
    // Absent from one copy and failing in the other is the implementer's catch.
    const fixed = { "src/store/query.ts": fileWith(11, "  const sql = `SELECT id FROM orders ORDER BY created_at DESC`;"), "src/orders/format.ts": FORMAT };
    const mixed = await measure(passCapture({ shape: "baseline", snapshots: { "u1-p1": { main: without, "lane-u1-p1": fixed } } }).layout.runDir);
    expect(mixed.passes.find((p) => p.id === "u1-p1")!.seeds[0]).toEqual(expect.objectContaining({ present: false, caughtByImplementer: true }));
  });

  it("(build/168) classes a pass blocked on a baseline blocked verdict the digest reader does not take", async () => {
    // A heading-led verdict is no digest label, so only the free-text reader can read it.
    const m = await measure(passCapture({ shape: "baseline", after: [thirdReview("## Verdict: blocked\n\nThe fixture does not build.")] }).layout.runDir);
    expect(m.passes.find((p) => p.id === "u1-p1")!.verdict).toEqual(expect.objectContaining({ finalClass: "blocked", rounds: 3 }));
  });

  it("(build/169) counts Grep and Glob results on report paths inside term (e)", async () => {
    const grep = { pattern: "Critical", path: `.stamity/runs/${RUN}/reports/` };
    const glob = { pattern: ".stamity/runs/*/reports/*.md" };
    const grepOut = `.stamity/runs/${RUN}/reports/u1-p1-reviewer-r1.md:3:{"id":"C-1","severity":"Critical"}`;
    const globOut = `.stamity/runs/${RUN}/reports/u1-p1-reviewer-r1.md`;
    const extra = [toolUseLine("Grep", "tu_grep", grep), mainLine.toolResult("tu_grep", grepOut), toolUseLine("Glob", "tu_glob", glob), mainLine.toolResult("tu_glob", globOut)];
    const [a, b] = [await measure(passCapture({ shape: "changed" }).layout.runDir), await measure(passCapture({ shape: "changed", extra }).layout.runDir)];
    expect(b.totals.breakdown["reportReads"]! - a.totals.breakdown["reportReads"]!).toBe(inputChars(grep) + grepOut.length + inputChars(glob) + globOut.length);
  });

  it("(build/170) keeps a verdict-source ledger row with no locator out of the unmatched count", async () => {
    const filed = ledgerRows(THREE);
    const noLocator = { ...filed[0]!, id: `${RUN}/build/9`, severity: "Warning", evidence: "the lint gate fails on the new file" };
    const m = await measure(passCapture({ shape: "baseline", endLedger: [...filed, noLocator] }).layout.runDir);
    expect(m.totals.unmatched).toBe(1);
  });

  it("(build/173) keeps a brief heredoc's body in term (d) beside a gated ledger heredoc in the same command", async () => {
    const row = JSON.stringify(ledgerRows([LOOSE_FINDING])[0]);
    const brief = "Fix the findings of u1-p1: C-1 and W-2.";
    const command = `cat >> .stamity/runs/${RUN}/ledger.jsonl <<'EOF'\n${row}\nEOF\ncat > /tmp/scratch/briefs/u1-p1-fixer.md <<'EOF'\n${brief}\nEOF`;
    const extra = [mainLine.bashToolUse({ id: "tu_both", command }), mainLine.toolResult("tu_both", "")];
    const [a, b] = [await measure(passCapture({ shape: "changed" }).layout.runDir), await measure(passCapture({ shape: "changed", extra }).layout.runDir)];
    expect(b.totals.breakdown["briefs"]! - a.totals.breakdown["briefs"]!).toBe(brief.length);
    expect(b.totals.breakdown["ledger"]! - a.totals.breakdown["ledger"]!).toBe(row.length);
  });

  it("(build/174) reads the init event from the head of a long stdout stream", async () => {
    const { layout } = passCapture({ shape: "baseline" });
    const init = JSON.stringify({ type: "system", subtype: "init", model: "claude-opus-5-5" });
    const noise = Array.from({ length: 20_000 }, (_, i) => JSON.stringify({ type: "assistant", n: i }));
    writeFileSync(join(layout.runDir, "captures", "stdout.jsonl"), [init, ...noise, "{broken"].join("\n") + "\n");
    const m = await measure(layout.runDir);
    expect(m.models.init).toBe("claude-opus-5-5");
    expect(m.invalid).toEqual([]);
  });

  it("(build/175) counts neither a TaskOutput re-read nor a failed notification as a round", async () => {
    const reread = [toolUseLine("TaskOutput", "tu_out", { task_id: "task-arev2" }), mainLine.toolResult("tu_out", "**Verdict:** approve\n\nNo findings.")];
    const failed = [
      mainLine.agentToolUse({ id: "tu_rev4", subagentType: "stamity-reviewer", description: "Review u1-p1", prompt: "Review unit u1-p1.", background: true }),
      mainLine.toolResult("tu_rev4", "Async agent launched successfully.\nagentId: arev4"),
      mainLine.taskNotification({ taskId: "task-arev4", toolUseId: "tu_rev4", status: "failed", result: "API error" }),
    ];
    const m = await measure(passCapture({ shape: "baseline", tail: [...reread, ...failed] }).layout.runDir);
    expect(m.passes.find((p) => p.id === "u1-p1")!.verdict.rounds).toBe(2);
    const once = await measure(passCapture({ shape: "baseline", tail: reread }).layout.runDir);
    expect(once.passes.find((p) => p.id === "u1-p1")!.verdict).toEqual(expect.objectContaining({ finalClass: "approve-after-fixes", rounds: 2 }));
  });
});

describe("measure.mjs — the CLI", () => {
  it("writes the measurement for --run-dir, --seeds and --out", () => {
    const { layout } = passCapture({ shape: "baseline" });
    const out = join(scratch(), "measurement.json");
    const seeds = join(scratch(), "seeds.json");
    writeFileSync(seeds, JSON.stringify(SEEDS));
    const run = spawnSync(process.execPath, [MEASURE_MJS, "--run-dir", layout.runDir, "--seeds", seeds, "--out", out], { encoding: "utf8" });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/recall 1\/1, valid/);
    const m = JSON.parse(readFileSync(out, "utf8")) as Measurement;
    expect(m.totals.recall.found).toBe(1);
  });

  it("refuses a missing required option with the usage line", () => {
    const run = spawnSync(process.execPath, [MEASURE_MJS, "--run-dir", scratch()], { encoding: "utf8" });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/--seeds is required[\s\S]*Usage: node scripts\/replay\/measure\.mjs/);
  });
});
