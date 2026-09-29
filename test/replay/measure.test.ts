import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { attributePass, checkSeeds, coverageOf, measureRun, passesOf, presentIn } from "../../scripts/replay/measure.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { securityHeld } from "../../scripts/replay/protocols.mjs";
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
  version?: string;
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
    readerSkips: { unreadFreeText: Record<string, number>; digestErrors: number; findingsBlockErrors: number; ledgerParseErrors: number };
    unjoinedSubagents: number;
    agentsWithoutTranscript: { toolUseId: string; role: string | null; pass: string | null }[];
    walkSkipped: { entryTypes: Record<string, number> };
    decoyFalseFlags: number;
    unmatched: number;
    oraclePass: number;
    oracleError: number;
    oracleRun: { status: string | null; detail: string };
  };
  compactionSamples: Sample[];
  wholeBranch: { finalClass: string | null; rounds: number };
  adjudication: { item: string; locator: string }[];
  models: { init: string | null; subagents: { agentId: string; unparseableLines: number }[] };
  client: { version: string | null; ambient: Record<string, string[] | null> | null };
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

/**
 * The init event's pinned fields (§3): the model, the client version and the five ambient lists.
 * A plugin and an MCP server are objects in the client's init event; only their names are recorded.
 */
const INIT_PINNED = {
  model: "claude-opus-5-5",
  claude_code_version: "2.1.280",
  skills: ["st-work", "dataviz"],
  agents: ["general-purpose", "stamity-reviewer"],
  slash_commands: ["st-work", "compact"],
  plugins: [{ name: "stamity", path: "/plugins/stamity" }],
  mcp_servers: [],
};

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
  /** Changed shape only: the rows the first review's digest shows, when they differ from its report's (defaults to `rows`). */
  digestRows?: Row[];
  run?: Record<string, unknown>;
  snapshots?: CaptureSpec["snapshots"];
  reviewSnapshots?: CaptureSpec["reviewSnapshots"];
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
  /** Agent ids whose sub-agent file is not written. */
  noTranscript?: string[];
  /** The implementer's description (defaults to `Implement u1-p1`): a v2 case names every pass so R6's injection point is reached. */
  builds?: string;
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
  const shown = options.digestRows ?? rows;
  const locate = (r: Row): string => (options.locate ? options.locate(r, fixture) : r.locator);
  const firstReview =
    shape === "baseline" ? freeTextReturn(rows, "request-changes", locate) : digestReturn(shown.map((r) => ({ id: r.id, severity: r.severity, locator: locate(r), summary: r.summary })), "request-changes", REPORT_REL);
  const secondReview =
    shape === "baseline" ? "**Verdict:** approve\n\nNo findings." : digestReturn([], "approve", `.stamity/runs/${RUN}/reports/u1-p1-reviewer-r2.md`);
  const agents: AgentSpec[] = [
    { id: "tu_impl", agentId: "aimpl", type: "stamity-implementer", description: options.builds ?? "Implement u1-p1", prompt: "Build unit u1-p1 of the plan.", result: "status: DONE", tokens: 1100 },
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
    // build/282: run.json's client.version is now held to the §3 pin like the init event's version, so the
    // pinned capture records it the way the driver does; a case moves it through `options.run`.
    run: { runId: "2026-09-24-replay-1", shape, kind: "scored", client: { version: "2.1.280" }, ...options.run },
    stdout: options.init === null ? [] : [JSON.stringify({ type: "system", subtype: "init", ...INIT_PINNED, cwd: fixture, ...options.init })],
    transcript,
    subagents: [...agents.filter((a) => !(options.noTranscript ?? []).includes(a.agentId)).map(subagentOf), ...(options.extraSubagents ?? [])],
    snapshots: options.snapshots ?? { "u1-p1": SNAPSHOT_U1P1 },
    ...(options.reviewSnapshots ? { reviewSnapshots: options.reviewSnapshots } : {}),
    state: {
      "compaction-1-pre": { runId: RUN, ledger: options.preLedger ?? filed, ...(reports ? { reports } : {}) },
      end: { runId: RUN, ledger: options.endLedger ?? filed, ...(reports ? { reports } : {}) },
    },
    oracle: { schema: "stamity/replay-oracle/v1", run: { status: "ok", detail: "" }, results: [{ seed: "sec-sql-sort", kind: "vitest", status: options.oracle ?? "pass", detail: "" }] },
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
    // (8) and build/203: recall is unchanged by the unread blocks and by the digest error.
    expect(baseline.totals.recall).toEqual({ found: 1, denominator: 1, byClass: { security: { found: 1, denominator: 1 } } });
    const bad: AgentSpec = {
      id: "tu_bad", agentId: "abad", type: "stamity-security", description: "Security lens u1-p1", prompt: "Lens u1-p1.",
      result: "status: DONE\nmode: advisory\nreport: .stamity/runs/r/reports/u1-p1-security-r1.md\nfindings: see the report\nsecurity: none", tokens: 10,
    };
    const changed = await measure(passCapture({ shape: "changed", after: [bad] }).layout.runDir);
    expect(changed.totals.readerSkips.digestErrors).toBe(1);
    expect(changed.totals.recall).toEqual({ found: 1, denominator: 1, byClass: { security: { found: 1, denominator: 1 } } });
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
    const init = JSON.stringify({ type: "system", subtype: "init", ...INIT_PINNED });
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

const notesOf = (m: Measurement): string => m.notes.join("\n");
const u1p1Of = (m: Measurement): PassRow => m.passes.find((p) => p.id === "u1-p1")!;
const reviewerFile = (agentId: string, toolUseId?: string): SubagentFile =>
  subagentFile({ agentId, agentType: "stamity-reviewer", description: "Review u1-p1", prompt: "Review unit u1-p1.", ...(toolUseId ? { toolUseId } : {}), requests: [{ id: `msg_${agentId}`, usage: { input: 90, output: 10 } }] });

describe("measureRun — review round 2 fixes", () => {
  const LANE = "/srv/replay/wt/lane-u1-p1";
  const inLane = (r: Row): Row => ({ ...r, locator: `${LANE}/${r.locator}` });

  it.each<Shape>(["baseline", "changed"])("(build/182) %s: a lane-worktree locator is read relative at the snapshot copy's name", async (shape) => {
    const snapshots = { "u1-p1": { main: SNAPSHOT_U1P1.main, "lane-u1-p1": SNAPSHOT_U1P1.main } };
    const m = await measure(passCapture({ shape, rows: THREE.map(inLane), snapshots }).layout.runDir);
    expect(m.totals.recall).toEqual(expect.objectContaining({ found: 1, denominator: 1 }));
    expect(m.totals.decoyFalseFlags).toBe(1);
    expect(m.totals.unmatched).toBe(1);
    expect(m.totals.readerSkips.digestErrors).toBe(0);
  });

  it("(build/182) strips a worktree run.json records, in a copy of another name", async () => {
    const tree = "/srv/replay/trees/feature-x";
    const rows = THREE.map((r) => ({ ...r, locator: `${tree}/${r.locator}` }));
    const m = await measure(passCapture({ shape: "baseline", rows, run: { worktrees: [tree] } }).layout.runDir);
    expect(m.totals.recall).toEqual(expect.objectContaining({ found: 1, denominator: 1 }));
    const without = await measure(passCapture({ shape: "baseline", rows }).layout.runDir);
    expect(without.totals.recall.found).toBe(0);
  });

  it("(build/183) never reads a digest as free text, so a Minor entry is not smeared into a Critical block", async () => {
    const lens: AgentSpec = {
      id: "tu_lens", agentId: "alens", type: "stamity-security", description: "Security lens u1-p1", prompt: "Lens u1-p1.", tokens: 10,
      result: ["status: DONE", "mode: posted 1", `report: .stamity/runs/${RUN}/reports/u1-p1-security-r1.md`, "findings:",
        "C-1 src/store/query.ts:11 — Critical: sort value concatenated into SQL", "M-1 src/orders/format.ts:5 — renaming fmt breaks a consumer", "security: see C-1"].join("\n"),
    };
    const m = await measure(passCapture({ shape: "changed", rows: [SEED_FINDING], after: [lens] }).layout.runDir);
    expect(m.totals.decoyFalseFlags).toBe(0);
    expect(m.totals.recall.found).toBe(1);
  });

  it("(build/184) joins a notification with no dispatch through its sub-agent file, and names one it cannot join", async () => {
    const tail = [
      mainLine.taskNotification({ taskId: "alost", toolUseId: "tu_lost", result: "**Verdict:** request-changes\n\nOne more thing." }),
      mainLine.taskNotification({ taskId: "ghost", toolUseId: "tu_ghost", result: "**Verdict:** approve" }),
    ];
    const m = await measure(passCapture({ shape: "baseline", tail, extraSubagents: [reviewerFile("alost", "tu_lost")] }).layout.runDir);
    expect(u1p1Of(m).verdict).toEqual(expect.objectContaining({ finalClass: "blocked", rounds: 3 }));
    expect(notesOf(m)).toMatch(/delivery joined to no agent: main transcript line \d+, task-notification/);
    expect(m.totals.unjoinedSubagents).toBe(0);
  });

  it("(build/185) counts a search-class Bash call on a report, by its command or its result, under (e)", async () => {
    const byCommand = `grep -n Critical .stamity/runs/${RUN}/reports/u1-p1-reviewer-r1.md`;
    const byResult = "rg -n Critical .stamity";
    const out = `.stamity/runs/${RUN}/reports/u1-p1-reviewer-r1.md:3:C-1`;
    const extra = [mainLine.bashToolUse({ id: "tu_g1", command: byCommand }), mainLine.toolResult("tu_g1", "3:C-1"), mainLine.bashToolUse({ id: "tu_g2", command: byResult }), mainLine.toolResult("tu_g2", out)];
    const [a, b] = [await measure(passCapture({ shape: "changed" }).layout.runDir), await measure(passCapture({ shape: "changed", extra }).layout.runDir)];
    const bash = (cmd: string): number => inputChars({ command: cmd, description: "" });
    expect(b.totals.breakdown["reportReads"]! - a.totals.breakdown["reportReads"]!).toBe(bash(byCommand) + 5 + bash(byResult) + out.length);
  });

  it("(build/186) lists a dispatched agent with no transcript file and reconciles notification tokens", async () => {
    const m = await measure(passCapture({ shape: "baseline", noTranscript: ["afix"] }).layout.runDir);
    expect(m.totals.agentsWithoutTranscript).toEqual([expect.objectContaining({ toolUseId: "tu_fix", role: "fixer", pass: "u1-p1" })]);
    expect(notesOf(m)).toMatch(/sub-agent tokens reconciled: Σ notification subagent_tokens \d+ against Σ processed \d+ over 4 loop agent\(s\); 1 dispatched agent\(s\) with no transcript file; notification tokens above processed for fixer/);
    const base = await measure(passCapture({ shape: "baseline" }).layout.runDir);
    expect(base.totals.agentsWithoutTranscript).toEqual([]);
  });

  it("(build/187) carries the walk's skips and each sub-agent's unparseable lines", async () => {
    const odd = reviewerFile("aodd");
    odd.lines.push("not json");
    const m = await measure(passCapture({ shape: "baseline", extra: ["{broken"], extraSubagents: [odd] }).layout.runDir);
    expect(m.totals.walkSkipped.entryTypes["PARSE_ERROR"]).toBe(1);
    expect(m.models.subagents.find((s) => s.agentId === "aodd")!.unparseableLines).toBe(1);
    expect(m.models.subagents.find((s) => s.agentId === "arev1")!.unparseableLines).toBe(0);
  });

  it("(build/189) counts a brief Write and a brief heredoc under (d), with their results", async () => {
    const path = "/tmp/scratch/briefs/u1-p1-fixer.md";
    const content = "Fix C-1 and W-2 of u1-p1.";
    const body = "Re-review u1-p1 after the fix.";
    const extra = [
      mainLine.writeToolUse({ id: "tu_bw", filePath: path, content }), mainLine.toolResult("tu_bw", "File created successfully"),
      mainLine.bashToolUse({ id: "tu_bh", command: `cat > /tmp/scratch/briefs/u1-p1-rev.md <<'EOF'\n${body}\nEOF` }), mainLine.toolResult("tu_bh", ""),
    ];
    const [a, b] = [await measure(passCapture({ shape: "baseline" }).layout.runDir), await measure(passCapture({ shape: "baseline", extra }).layout.runDir)];
    expect(a.totals.breakdown["briefs"]).toBe(0);
    expect(b.totals.breakdown["briefs"]).toBe(inputChars({ file_path: path, content }) + "File created successfully".length + body.length);
  });

  it("(build/189) counts a SendMessage delivery, a TaskOutput delivery and a sync Agent result under (a) and as rounds", async () => {
    const digest = digestReturn([], "approve", `.stamity/runs/${RUN}/reports/u1-p1-reviewer-r3.md`);
    const send = [mainLine.sendMessage({ id: "tu_send", to: "arev1", message: "Re-review u1-p1." }), mainLine.toolResult("tu_send", digest)];
    const polled = "**Verdict:** approve\n\nPolled.";
    const output = [
      mainLine.agentToolUse({ id: "tu_bg", subagentType: "stamity-reviewer", description: "Review u1-p1", prompt: "Review unit u1-p1.", background: true }),
      mainLine.toolResult("tu_bg", "Async agent launched successfully.\nagentId: abg"),
      toolUseLine("TaskOutput", "tu_poll", { task_id: "abg" }), mainLine.toolResult("tu_poll", polled),
    ];
    const syncText = "**Verdict:** approve\n\nSynchronous.";
    const sync = [mainLine.agentToolUse({ id: "tu_sync", subagentType: "stamity-reviewer", description: "Review u1-p1", prompt: "Review unit u1-p1." }), mainLine.toolResult("tu_sync", syncText)];
    const base = await measure(passCapture({ shape: "changed" }).layout.runDir);
    const cases = [["send", send, digest.length], ["output", output, polled.length], ["sync", sync, syncText.length]] as const;
    const measured = await Promise.all(cases.map(([, tail]) => measure(passCapture({ shape: "changed", tail: [...tail] }).layout.runDir)));
    for (const [k, [label, , chars]] of cases.entries()) {
      const m = measured[k]!;
      expect([label, u1p1Of(m).verdict]).toEqual([label, expect.objectContaining({ finalClass: "approve-after-fixes", rounds: 3 })]);
      expect(m.totals.breakdown["returns"]! - base.totals.breakdown["returns"]!).toBe(chars);
    }
  });

  it("(build/189) keeps an unresolved send in the loop, unattributed and named", async () => {
    const send = [mainLine.sendMessage({ id: "tu_lost", to: "nobody", message: "Anyone there?" }), mainLine.toolResult("tu_lost", "Message queued.")];
    const [a, b] = [await measure(passCapture({ shape: "baseline" }).layout.runDir), await measure(passCapture({ shape: "baseline", tail: send }).layout.runDir)];
    expect(b.totals.breakdown["prompts"]! - a.totals.breakdown["prompts"]!).toBe(inputChars({ to: "nobody", message: "Anyone there?", summary: "" }));
    expect(b.totals.unattributedShare).toBeGreaterThan(0);
    expect(notesOf(b)).toMatch(/SendMessage joined to no agent: main transcript line \d+/);
  });

  it("(build/190) matches a pass's finding against its own pass's relocated spans only", async () => {
    const seeds = {
      ...SEEDS,
      decoys: [{ id: "dec-other-pass", pass: "u2-p1", file: "src/store/query.ts", locate: { text: "function legacySort", from: 0, to: 0 }, present: { contains: "function legacySort" }, span: [40, 40], terms: ["legacy"] }],
    };
    const u2p1 = { main: { "src/store/query.ts": fileWith(14, "function legacySort(rows: Row[]): Row[] {", 45), "src/orders/format.ts": FORMAT } };
    const rows: Row[] = [SEED_FINDING, { id: "W-1", severity: "Warning", locator: "src/store/query.ts:14", summary: "the legacy sort helper is unused" }];
    // The changed shape, so every source of the finding (digest, report, ledger rows citing the report) is attributed to u1-p1.
    const { layout } = passCapture({ shape: "changed", rows, snapshots: { "u1-p1": SNAPSHOT_U1P1, "u2-p1": u2p1 } });
    const m = (await measureRun(layout.runDir, { seeds, forbid: [] })) as Measurement;
    expect(m.totals.decoyFalseFlags).toBe(0);
    expect(m.totals.recall.found).toBe(1);
  });

  it("(build/192) counts a state-ledger line that is no JSON object", async () => {
    const { layout } = passCapture({ shape: "baseline" });
    const ledger = join(layout.state, "end", "runs", RUN, "ledger.jsonl");
    writeFileSync(ledger, `${readFileSync(ledger, "utf8")}{broken\n`);
    const m = await measure(layout.runDir);
    expect(m.totals.readerSkips.ledgerParseErrors).toBe(1);
  });

  it("(build/196) names each pass with no loop dispatch", async () => {
    const notes = notesOf(await measure(passCapture({ shape: "baseline" }).layout.runDir));
    for (const id of ["u1-p2", "u2-p1", "u2-p2", "u3-p1", "u3-p2"]) expect(notes).toContain(`pass ${id} has no loop dispatch`);
    expect(notes).not.toContain("pass u1-p1 has no loop dispatch");
  });

  it("(build/197) names a seed present, not found, with a passing oracle", async () => {
    const m = await measure(passCapture({ shape: "baseline", rows: [DECOY_FINDING, LOOSE_FINDING], oracle: "pass" }).layout.runDir);
    expect(notesOf(m)).toMatch(/seed sec-sql-sort \(u1-p1\): present in the snapshot and not found/);
  });

  it("(build/201) counts a completed reviewer delivery with no verdict word as a round, and names it", async () => {
    const m = await measure(passCapture({ shape: "baseline", after: [thirdReview("Looks good to me.")] }).layout.runDir);
    expect(u1p1Of(m).verdict.rounds).toBe(3);
    expect(notesOf(m)).toMatch(/reviewer round with no readable verdict: main transcript line \d+, \d+ characters — counted as a round/);
  });

  it("(build/202) an inline C2 block in a return is covered by the rows citing the digest's report", async () => {
    const gate: Row = { id: "W-3", severity: "Warning", locator: "npm run lint", summary: "the lint gate fails on the new file" };
    const review = `${digestReturn([SEED_FINDING], "request-changes", REPORT_REL)}\n\n${reportText([gate])}`;
    const lens: AgentSpec = { id: "tu_inl", agentId: "ainl", type: "stamity-reviewer", description: "Review u1-p1", prompt: "Review unit u1-p1.", result: review, tokens: 10 };
    const m = await measure(passCapture({ shape: "changed", rows: [SEED_FINDING], extra: dispatch(lens), extraSubagents: [subagentOf(lens)] }).layout.runDir);
    expect(m.compactionSamples[0]).toEqual(expect.objectContaining({ atRisk: 0 }));
  });

  it("(build/202) a file-less finding with no report is covered by a row holding its text", async () => {
    const review = "status: DONE\nverdict: request-changes\nfindings:\nW-3 npm run lint — the lint gate fails on the new file";
    const lens: AgentSpec = { id: "tu_nor", agentId: "anor", type: "stamity-reviewer", description: "Review u1-p1", prompt: "Review unit u1-p1.", result: review, tokens: 10 };
    const filed = ledgerRows(THREE);
    const row = { ...filed[0]!, id: `${RUN}/build/9`, severity: "Warning", evidence: "npm run lint — the lint gate fails on the new file" };
    const covered = await measure(passCapture({ shape: "baseline", extra: dispatch(lens), extraSubagents: [subagentOf(lens)], preLedger: [...filed, row] }).layout.runDir);
    expect(covered.compactionSamples[0]).toEqual(expect.objectContaining({ atRisk: 0 }));
    const uncovered = await measure(passCapture({ shape: "baseline", extra: dispatch(lens), extraSubagents: [subagentOf(lens)] }).layout.runDir);
    expect(uncovered.compactionSamples[0]).toEqual(expect.objectContaining({ atRisk: 1 }));
  });
});

describe("measureRun — review round 3 fixes", () => {
  it("(build/206) a file-less finding is not covered by a row that has a file, even when that row holds its text", async () => {
    const review = "status: DONE\nverdict: request-changes\nfindings:\nW-3 npm run lint — the lint gate fails on the new file";
    const lens: AgentSpec = { id: "tu_nor", agentId: "anor", type: "stamity-reviewer", description: "Review u1-p1", prompt: "Review unit u1-p1.", result: review, tokens: 10 };
    const filed = ledgerRows(THREE);
    const withFile = { ...filed[0]!, id: `${RUN}/build/9`, severity: "Warning", evidence: "src/http/app.ts:30 — the lint gate fails on the new file" };
    const m = await measure(passCapture({ shape: "baseline", extra: dispatch(lens), extraSubagents: [subagentOf(lens)], preLedger: [...filed, withFile] }).layout.runDir);
    expect(m.compactionSamples[0]).toEqual(expect.objectContaining({ atRisk: 1 }));
  });

  it("(build/207) counts the dispatch prompt of an agent built from its sub-agent file in term (b), and names it", async () => {
    const tail = [mainLine.taskNotification({ taskId: "alost", toolUseId: "tu_lost", result: "**Verdict:** request-changes\n\nOne more thing." })];
    const [a, b] = [
      await measure(passCapture({ shape: "baseline", tail }).layout.runDir),
      await measure(passCapture({ shape: "baseline", tail, extraSubagents: [reviewerFile("alost", "tu_lost")] }).layout.runDir),
    ];
    expect(b.totals.breakdown["prompts"]! - a.totals.breakdown["prompts"]!).toBe("Review unit u1-p1.".length);
    expect(notesOf(b)).toMatch(/agent alost built from its sub-agent file \(reviewer, u1-p1\): its dispatch prompt of 18 characters counted in term \(b\)/);
  });
});

describe("measureRun — the oracle run's own status (build/230)", () => {
  it("carries the oracle document's run.{status, detail} as the oracleRun total", async () => {
    const ok = await measure(passCapture({ shape: "baseline" }).layout.runDir);
    expect(ok.totals.oracleRun).toEqual({ status: "ok", detail: "" });
    const { layout } = passCapture({ shape: "baseline" });
    const detail = "the oracle run was killed by SIGKILL after 600000 ms (limit 600000 ms)";
    writeFileSync(layout.oracle, JSON.stringify({ schema: "stamity/replay-oracle/v1", run: { status: "killed", detail }, results: [{ seed: "sec-sql-sort", kind: "vitest", status: "error", detail }] }));
    const killed = await measure(layout.runDir);
    expect(killed.totals.oracleRun).toEqual({ status: "killed", detail });
    expect(killed.totals.oracleError).toBe(1);
  });

  it("records a null status, with the reason, when the document or its run-level status is absent", async () => {
    const { layout } = passCapture({ shape: "baseline" });
    writeFileSync(layout.oracle, JSON.stringify({ schema: "stamity/replay-oracle/v1", results: [] }));
    expect((await measure(layout.runDir)).totals.oracleRun).toEqual({ status: null, detail: "the oracle document records no run-level status" });
    rmSync(layout.oracle);
    expect((await measure(layout.runDir)).totals.oracleRun).toEqual({ status: null, detail: "no captures/oracle.json" });
  });
});

describe("measureRun — the whole-branch review's fixes", () => {
  it("(build/250) records the init event's client version and its five ambient lists, by name and sorted", async () => {
    const m = await measure(passCapture({ shape: "baseline" }).layout.runDir);
    expect(m.invalid).toEqual([]);
    expect(m.client).toEqual({
      version: "2.1.280",
      ambient: { skills: ["dataviz", "st-work"], agents: ["general-purpose", "stamity-reviewer"], slashCommands: ["compact", "st-work"], plugins: ["stamity"], mcpServers: [] },
    });
    const bare = await measure(passCapture({ shape: "baseline", init: { skills: undefined } }).layout.runDir);
    expect(bare.client.ambient!["skills"]).toBeNull();
    const none = await measure(passCapture({ shape: "baseline", init: null }).layout.runDir);
    expect(none.client).toEqual({ version: null, ambient: null });
  });

  it("(build/250) marks the run invalid on a client version off the §3 pin, or none", async () => {
    const drift = await measure(passCapture({ shape: "baseline", init: { claude_code_version: "2.1.281" } }).layout.runDir);
    expect(drift.invalid).toEqual(['init claude_code_version "2.1.281" is not the pin 2.1.280']);
    const unset = await measure(passCapture({ shape: "baseline", init: { claude_code_version: undefined } }).layout.runDir);
    expect(unset.invalid).toEqual(["init claude_code_version null is not the pin 2.1.280"]);
  });

  it("(build/282) marks the run invalid on a run.json client.version (`claude --version`) off the §3 pin, or none", async () => {
    const drift = await measure(passCapture({ shape: "baseline", run: { client: { version: "2.1.281" } } }).layout.runDir);
    expect(drift.invalid).toEqual(['run.json client.version "2.1.281" is not the pin 2.1.280']);
    const unset = await measure(passCapture({ shape: "baseline", run: { client: {} } }).layout.runDir);
    expect(unset.invalid).toEqual(["run.json client.version null is not the pin 2.1.280"]);
  });

  it("(build/251) marks the run invalid when a verdict agent was dispatched for a pass whose snapshot is missing", async () => {
    const m = await measure(passCapture({ shape: "baseline", snapshots: {} }).layout.runDir);
    expect(m.invalid).toEqual(["capture defect: a verdict agent was dispatched for u1-p1, but captures/snapshots/u1-p1/ holds no copy"]);
    // A pass no verdict agent started has no snapshot by design: no reason for it.
    expect(m.invalid.join("\n")).not.toMatch(/u2-p1/);
  });

  it("(build/251) marks the run invalid when a seeded file is absent from every copy of its pass", async () => {
    const without = { "src/orders/format.ts": FORMAT };
    const m = await measure(passCapture({ shape: "baseline", snapshots: { "u1-p1": { main: without, "lane-u1-p1": without } } }).layout.runDir);
    expect(m.invalid).toEqual(["capture defect: seed sec-sql-sort (u1-p1): src/store/query.ts is absent from every snapshot copy of the pass"]);
  });

  it("(build/252) marks the run invalid when the oracle run's status is not ok, or none is recorded", async () => {
    const { layout } = passCapture({ shape: "baseline" });
    const detail = "the oracle run was killed by SIGKILL after 600000 ms (limit 600000 ms)";
    writeFileSync(layout.oracle, JSON.stringify({ schema: "stamity/replay-oracle/v1", run: { status: "killed", detail }, results: [{ seed: "sec-sql-sort", kind: "vitest", status: "error", detail }] }));
    expect((await measure(layout.runDir)).invalid).toEqual([`oracle run status "killed" (${detail}), not "ok": the run is re-run, never scored`]);
    rmSync(layout.oracle);
    expect((await measure(layout.runDir)).invalid).toEqual(['oracle run status null (no captures/oracle.json), not "ok": the run is re-run, never scored']);
  });

  it("(build/254) marks a read of the reference fixes invalid without any --forbid", async () => {
    const extra = [mainLine.bashToolUse({ id: "tu_ref", command: "cat ../evals/replay/v1/oracle/reference-fixes.patch" }), mainLine.toolResult("tu_ref", "diff")];
    const m = await measure(passCapture({ shape: "baseline", extra }).layout.runDir);
    expect(m.invalid).toEqual([expect.stringMatching(/^forbidden reference-fixes in a Bash input/)]);
  });

  it("(build/255) measures a capture with two main transcripts on the newest and marks it invalid, instead of throwing", async () => {
    const { layout } = passCapture({ shape: "baseline" });
    const base = await measure(layout.runDir);
    const stray = join(layout.captures, "transcript", "an-older-session.jsonl");
    writeFileSync(stray, `${mainLine.userText("hello")}\n`);
    const old = new Date("2026-09-01T00:00:00Z");
    utimesSync(stray, old, old);
    const m = await measure(layout.runDir);
    expect(m.invalid).toEqual(["2 main transcripts under captures/transcript/ (a restart or a stray file): measured on the newest, synth-session"]);
    expect(m.totals.loopChars).toBe(base.totals.loopChars);
    expect(m.totals.recall).toEqual(base.totals.recall);
  });
});

/** One review round of a multi-pass capture: the reviewer's dispatch and its delivery. */
interface RoundSpec {
  result: string;
  description?: string;
  prompt?: string;
}

/**
 * u1-p1 and u1-p2 built apart and reviewed together (build/366): two implementers, then each
 * round is one reviewer whose prompt names both passes and whose description names neither, with a
 * u1-p1 fixer between rounds. No compaction; the end ledger holds the seed's row.
 */
const implementerOf = (pass: string): AgentSpec => ({
  id: `tu_impl_${pass}`, agentId: `aimpl${pass.replace("-", "")}`, type: "stamity-implementer", description: `Implement ${pass}`, prompt: `Build unit ${pass}.`, result: "status: DONE", tokens: 100,
});

function multiCapture(options: { rounds: RoundSpec[]; snapshots?: CaptureSpec["snapshots"]; implementers?: AgentSpec[] }): Built {
  const dir = scratch();
  const fixture = join(dir, "fx");
  mkdirSync(fixture);
  const agents: AgentSpec[] = [...(options.implementers ?? [implementerOf("u1-p1"), implementerOf("u1-p2")])];
  options.rounds.forEach((round, k) => {
    if (k > 0) agents.push({ id: `tu_fix${k}`, agentId: `afix${k}`, type: "stamity-fixer", description: "Fix u1-p1", prompt: "Fix the findings of u1-p1.", result: "status: DONE", tokens: 100 });
    agents.push({
      id: `tu_rev${k + 1}`, agentId: `arev${k + 1}`, type: "stamity-reviewer", description: round.description ?? "Review the batch", prompt: round.prompt ?? "Review u1-p1 u1-p2.", result: round.result, tokens: 100,
    });
  });
  const layout = writeCapture(dir, {
    run: { runId: "2026-09-24-replay-v2-1", shape: "baseline", kind: "scored", client: { version: "2.1.280" } },
    stdout: [JSON.stringify({ type: "system", subtype: "init", ...INIT_PINNED, cwd: fixture })],
    transcript: [mainLine.userText("/st-work docs/plans/001-replay.md --effort deep"), ...agents.flatMap(dispatch)],
    subagents: agents.map(subagentOf),
    snapshots: options.snapshots ?? { "u1-p1": SNAPSHOT_U1P1, "u1-p2": SNAPSHOT_U1P1 },
    state: { end: { runId: RUN, ledger: ledgerRows([SEED_FINDING]) } },
    oracle: { schema: "stamity/replay-oracle/v1", run: { status: "ok", detail: "" }, results: [{ seed: "sec-sql-sort", kind: "vitest", status: "pass", detail: "" }] },
  });
  return { layout, fixture, agents };
}

const APPROVE = "**Verdict:** approve\n\nNo findings.";
const passOf = (m: Measurement, id: string): PassRow => m.passes.find((p) => p.id === id)!;
const seedOf = (m: Measurement): PassRow["seeds"][number] => passOf(m, "u1-p1").seeds[0]!;

describe("REPLAY-v2 — multi-pass review rounds (build/366)", () => {
  it("passesOf names the distinct passes a dispatch covers, by attributePass's precedence, while attributePass still reads multi", () => {
    expect(passesOf("Review the batch", "Review u1-p2 then u1-p1, and u1-p1 again.")).toEqual(["u1-p1", "u1-p2"]);
    expect(attributePass("Review the batch", "Review u1-p2 then u1-p1, and u1-p1 again.")).toBe("multi");
    // A description naming a pass wins over the prompt, as it does for attributePass.
    expect(passesOf("Review u2-p2", "Review u2-p1 and then u3-p1.")).toEqual(["u2-p2"]);
    expect(passesOf("Review the lane", "No pass named.")).toEqual([]);
  });

  it("review/38: a description naming several passes covers the one pass attributePass takes (first-wins), so pass and passes never disagree", () => {
    for (const [desc, prompt] of [["Review u1-p2 after u1-p1", "Review both."], ["Review u1-p1 and u1-p2", "Review u1-p1 u1-p2."]] as const) {
      expect([desc, passesOf(desc, prompt)]).toEqual([desc, [attributePass(desc, prompt)]]);
    }
    expect(passesOf("Review u1-p2 after u1-p1", "Review both.")).toEqual(["u1-p2"]);
  });

  it("review/38: a round whose description names u1-p2 first is u1-p2's verdict alone, and is no round of u1-p1", async () => {
    const rounds = [{ result: APPROVE, description: "Review u1-p2 after u1-p1" }];
    const m = await measure(multiCapture({ rounds }).layout.runDir);
    expect(passOf(m, "u1-p2").verdict).toEqual(expect.objectContaining({ finalClass: "approve", rounds: 1 }));
    expect(passOf(m, "u1-p1").verdict).toEqual(expect.objectContaining({ finalClass: null, rounds: 0 }));
  });

  it("review/42: a ledger row filed from a multi round's report (u1-p1-u1-p2-reviewer-r1.md) is a round-1 find at the pass stage of each pass the slug names", async () => {
    // The reviewer's own return cites no seed, so the ledger row is the seed's only finding. A slug is
    // no description: it covers every pass it names, not the first (a slug naming u1-p2 first included).
    const slugs = ["u1-p1-u1-p2", "u1-p2-u1-p1"];
    const runs = await Promise.all(
      slugs.map((slug) => measure(passCapture({ shape: "baseline", rows: [LOOSE_FINDING], endLedger: ledgerRows([SEED_FINDING], `.stamity/runs/${RUN}/reports/${slug}-reviewer-r1.md`) }).layout.runDir)),
    );
    runs.forEach((m, k) => expect([slugs[k], seedOf(m)]).toEqual([slugs[k], expect.objectContaining({ found: true, foundRound1: true, stage: "pass" })]));
  });

  it("(a) a seed found by a reviewer whose prompt names u1-p1 u1-p2 is a round-1 find at its own pass", async () => {
    const m = await measure(multiCapture({ rounds: [{ result: freeTextReturn([SEED_FINDING], "request-changes") }, { result: APPROVE }] }).layout.runDir);
    expect(m.invalid).toEqual([]);
    expect(seedOf(m)).toEqual(expect.objectContaining({ id: "sec-sql-sort", present: true, found: true, foundRound1: true, stage: "pass" }));
  });

  it("(b) one review round's final class and round count are recorded for every pass it covers", async () => {
    const m = await measure(multiCapture({ rounds: [{ result: freeTextReturn([SEED_FINDING], "request-changes") }, { result: APPROVE }] }).layout.runDir);
    for (const id of ["u1-p1", "u1-p2"]) expect([id, passOf(m, id).verdict]).toEqual([id, { finalClass: "approve-after-fixes", rounds: 2, approvedWithSeedUnfixed: false }]);
    expect(m.passes.filter((p) => !["u1-p1", "u1-p2"].includes(p.id)).map((p) => p.verdict.rounds)).toEqual([0, 0, 0, 0]);
  });

  it("counts a single-pass fixer of a covered pass toward the multi reviewer's round", async () => {
    // The seed is first cited in the round after the u1-p1 fixer, so it is no round-1 find.
    const loose = "**Verdict:** request-changes\n\n| Warning | src/http/app.ts:30 | the error handler logs the whole request body |";
    const m = await measure(multiCapture({ rounds: [{ result: loose }, { result: freeTextReturn([SEED_FINDING], "request-changes") }, { result: APPROVE }] }).layout.runDir);
    expect(seedOf(m)).toEqual(expect.objectContaining({ found: true, foundRound1: false, stage: "pass" }));
    expect(passOf(m, "u1-p2").verdict).toEqual(expect.objectContaining({ finalClass: "approve-after-fixes", rounds: 3 }));
  });

  it("a multi dispatch naming a pass with no snapshot is a capture defect for that pass", async () => {
    const m = await measure(multiCapture({ rounds: [{ result: freeTextReturn([SEED_FINDING], "request-changes") }, { result: APPROVE }], snapshots: { "u1-p1": SNAPSHOT_U1P1 } }).layout.runDir);
    expect(m.invalid).toEqual(["capture defect: a verdict agent was dispatched for u1-p2, but captures/snapshots/u1-p2/ holds no copy"]);
  });

  it("a whole-branch finding stays at the branch stage, and its round is no pass's verdict", async () => {
    const rounds = [{ result: APPROVE }, { result: freeTextReturn([SEED_FINDING], "request-changes"), description: "Whole-branch review", prompt: "Review u1-p1 u1-p2 as one branch." }];
    const m = await measure(multiCapture({ rounds }).layout.runDir);
    expect(seedOf(m)).toEqual(expect.objectContaining({ found: true, foundRound1: false, stage: "branch" }));
    expect(passOf(m, "u1-p2").verdict).toEqual(expect.objectContaining({ finalClass: "approve", rounds: 1 }));
    expect(m.wholeBranch).toEqual({ finalClass: "blocked", rounds: 1 });
  });
});

/** The allowlist guard's shape (`oracle/reference-fixes.patch`), which v1's contains-only rule read as the seed (build/365). */
const NOT_GUARDED = "\\.(has|includes)\\(\\s*sort\\s*\\)";
const SEEDED_LINE = "  const sql = `SELECT id FROM orders ORDER BY ${sort} DESC LIMIT ? OFFSET ?`;";
const GUARDED_QUERY = ["// line 1", "  if (!SORT_COLUMNS.has(sort)) throw new Error(\"unknown sort column\");", ...Array.from({ length: 8 }, (_, i) => `// line ${i + 3}`), SEEDED_LINE, "// line 12", ""].join("\n");
const SEED_V2 = { ...SEEDS.seeds[0]!, present: { contains: "ORDER BY ${sort}", notMatch: [NOT_GUARDED] } };
const INJECTION = { file: "src/store/query.ts", find: "ORDER BY ${column} DESC", replace: "ORDER BY ${sort} DESC" };
const seedsWith = (patch: Record<string, unknown>): Record<string, unknown> => ({ ...SEEDS, seeds: [{ ...SEEDS.seeds[0]!, ...patch }] });

function treeWith(files: Record<string, string>): string {
  const dir = scratch();
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

describe("REPLAY-v2 — the seeds schema (S1) and the presence rule (build/365)", () => {
  it("(c) a seed with present.notMatch reads absent on a tree holding the allowlist guard, and present on the seeded tree", async () => {
    expect(presentIn(treeWith({ "src/store/query.ts": QUERY_AT(11) }), SEED_V2)).toBe(true);
    expect(presentIn(treeWith({ "src/store/query.ts": GUARDED_QUERY }), SEED_V2)).toBe(false);
    // v1's rule, with no notMatch, still reads the guarded tree as present.
    expect(presentIn(treeWith({ "src/store/query.ts": GUARDED_QUERY }), SEEDS.seeds[0])).toBe(true);
    const seeds = { ...SEEDS, seeds: [SEED_V2] };
    const guarded = passCapture({ shape: "baseline", snapshots: { "u1-p1": { main: { "src/store/query.ts": GUARDED_QUERY, "src/orders/format.ts": FORMAT } } } });
    const g = (await measureRun(guarded.layout.runDir, { seeds, forbid: [] })) as Measurement;
    expect(seedOf(g)).toEqual(expect.objectContaining({ present: false, caughtByImplementer: true }));
    expect(g.totals.recall.denominator).toBe(0);
    const s = (await measureRun(passCapture({ shape: "baseline" }).layout.runDir, { seeds, forbid: [] })) as Measurement;
    expect(seedOf(s)).toEqual(expect.objectContaining({ present: true, found: true }));
  });

  it("(d) v1's committed seeds.json passes the schema check unchanged", () => {
    const v1 = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../evals/replay/v1/seeds.json"), "utf8")) as { seeds: Record<string, unknown>[] };
    expect(() => checkSeeds(v1)).not.toThrow();
    expect(v1.seeds.some((s) => "injection" in s || "notMatch" in (s["present"] as object))).toBe(false);
  });

  it("accepts an injection of one file with a find and a replace that differ, and a notMatch list", () => {
    expect(() => checkSeeds(seedsWith({ injection: INJECTION, present: SEED_V2.present }))).not.toThrow();
  });

  it.each<[string, Record<string, unknown>, RegExp]>([
    ["a find equal to its replace", { injection: { ...INJECTION, replace: INJECTION.find } }, /sec-sql-sort.*injection\.find equals injection\.replace/],
    ["an empty find", { injection: { ...INJECTION, find: "" } }, /sec-sql-sort.*injection\.find is empty/],
    ["an empty replace", { injection: { ...INJECTION, replace: "" } }, /sec-sql-sort.*injection\.replace is empty/],
    ["a replace that is no string", { injection: { ...INJECTION, replace: 3 } }, /sec-sql-sort.*injection\.replace is not a string/],
    ["an injection spanning a second file", { injection: { ...INJECTION, file: "src/store/paging.ts" } }, /sec-sql-sort.*injection\.file "src\/store\/paging\.ts" is not the item's file "src\/store\/query\.ts"/],
    ["an injection that is no object", { injection: "ORDER BY" }, /sec-sql-sort.*injection is not an object/],
    ["a notMatch that is no list", { present: { contains: "x", notMatch: NOT_GUARDED } }, /sec-sql-sort.*present\.notMatch is not a list of non-empty strings/],
    ["a notMatch pattern that does not compile", { present: { contains: "x", notMatch: ["(sort"] } }, /sec-sql-sort.*present\.notMatch "\(sort" is no regex/],
  ])("refuses %s", (_label, patch, reason) => {
    expect(() => checkSeeds(seedsWith(patch))).toThrow(reason);
  });
});

/** The two states the driver's hook records per seed in `run.json`'s `injection` (review/135). */
const INJECTED = "injected";
const NOT_INJECTED = "not injected (anchor missing)";
const V2_SEED_LIST = (JSON.parse(readFileSync(resolve(import.meta.dirname, "../../evals/replay/v2/seeds.json"), "utf8")) as { seeds: { id: string; pass: string; file: string }[] }).seeds;
const v2Seed = (id: string): { id: string; pass: string; file: string } => V2_SEED_LIST.find((s) => s.id === id)!;
/** The two deletion seeds, as committed: a negative presence rule each. */
const TRAVERSAL = v2Seed("sec-path-traversal");
const EXPECTATION = v2Seed("tw-expectation-deleted");
/** An injecting seeds document: the synthetic u1-p1 seed with an injection, beside the two deletion seeds. */
const INJECTING = { ...SEEDS, seeds: [{ ...SEEDS.seeds[0]!, injection: INJECTION }, TRAVERSAL, EXPECTATION] };
/** u3-p1's implementer restated the name guard as a helper: no injection anchor, and the negative rule reads present. */
const REWRITTEN_INVOICE = [
  "import { readFile } from \"node:fs/promises\";",
  "import { join } from \"node:path\";",
  "const isInvoiceName = (name: string): boolean => name.endsWith(\".pdf\") && !name.includes(\"/\");",
  "export async function readInvoice(dir: string, file: string): Promise<Buffer | null> {",
  "  if (!isInvoiceName(file)) return null;",
  "  try {",
  "    return await readFile(join(dir, file));",
  "  } catch {",
  "    return null;",
  "  }",
  "}",
  "",
].join("\n");
/** u3-p2's implementer wrote the total's assertion another way: no anchor, and the notContains rule reads present. */
const REWRITTEN_TEST = ["it(\"lists orders with their totals\", async () => {", "  expect(body.orders[0]).toMatchObject({ total_cents: 1250 });", "});", ""].join("\n");
const INJECTING_SNAPSHOTS = {
  "u1-p1": SNAPSHOT_U1P1,
  "u3-p1": { main: { [TRAVERSAL.file]: REWRITTEN_INVOICE } },
  "u3-p2": { main: { [EXPECTATION.file]: REWRITTEN_TEST } },
};
/** `run.json`'s `injection` as the driver's `readInjections` writes it, one state per seed id. */
function injectionRecord(states: Record<string, string>): Record<string, unknown> {
  const passes: Record<string, { pass: string; seeds: { id: string; file: string; state: string }[]; partial: boolean; snapshot: boolean }> = {};
  for (const seed of INJECTING.seeds) (passes[seed.pass] ??= { pass: seed.pass, seeds: [], partial: false, snapshot: true }).seeds.push({ id: seed.id, file: seed.file, state: states[seed.id]! });
  const all = Object.values(states);
  return { passes, injected: all.filter((s) => s === INJECTED).length, notInjected: all.filter((s) => s === NOT_INJECTED).length, partial: false, unreadable: [], unfinished: [] };
}
/**
 * R6 (review/167) moved v2's coverage: a review credits a seed only at or after the injection point, the first
 * verdict dispatch once a build description has named every pass. `passCapture`'s implementer names u1-p1 alone,
 * which under R6 leaves the point unreached and every finding uncredited; these v2 helpers name all six in the
 * implementer's description (its attributed pass stays u1-p1), so the injection record they read describes a run
 * whose reviewer reviewed the injected tree, as the driver's record of such a run does.
 */
const ALL_BUILT = "Implement u1-p1..u3-p2";
const injectingRun = (run: Record<string, unknown>): Promise<Measurement> =>
  measureRun(passCapture({ shape: "baseline", run, snapshots: INJECTING_SNAPSHOTS, builds: ALL_BUILT }).layout.runDir, { seeds: INJECTING, forbid: [] }) as Promise<Measurement>;
const rowOf = (m: Measurement, id: string): PassRow["seeds"][number] => m.passes.flatMap((p) => p.seeds).find((s) => s.id === id)!;

describe("REPLAY-v2 — the driver's injection record decides a seed that was not injected (review/135)", () => {
  it("the rewritten guard and assertion read present on the snapshot, so the snapshot alone cannot tell them from a seed", () => {
    expect(presentIn(treeWith({ [TRAVERSAL.file]: REWRITTEN_INVOICE }), TRAVERSAL)).toBe(true);
    expect(presentIn(treeWith({ [EXPECTATION.file]: REWRITTEN_TEST }), EXPECTATION)).toBe(true);
  });

  it("a seed recorded not injected leaves the pooled recall denominator and holds its security row, whatever the snapshot reads", async () => {
    const m = await injectingRun({ injection: injectionRecord({ "sec-sql-sort": INJECTED, "sec-path-traversal": NOT_INJECTED, "tw-expectation-deleted": NOT_INJECTED }) });
    expect(m.invalid).toEqual([]);
    for (const id of ["sec-path-traversal", "tw-expectation-deleted"]) {
      expect([id, rowOf(m, id)]).toEqual([id, expect.objectContaining({ present: false, caughtByImplementer: true, found: false })]);
      expect(m.notes).toContainEqual(expect.stringContaining(`seed ${id} (`));
    }
    expect(securityHeld(rowOf(m, "sec-path-traversal"))).toBe(true);
    // The security seed's note carries the suffix score.mjs files beside security-seeds; the other's does not.
    const noteOf = (id: string): string => m.notes.find((n) => n.startsWith(`seed ${id} (`))!;
    expect(noteOf("sec-path-traversal")).toContain("; a security seed, so it holds its security-seeds row");
    expect(noteOf("tw-expectation-deleted")).not.toContain("a security seed");
    expect(m.totals.recall).toEqual({ found: 1, denominator: 1, byClass: { security: { found: 1, denominator: 1 } } });
  });

  it("an injected seed keeps the snapshot's reading: the rewritten guard recorded injected is present, in the denominator, and a miss", async () => {
    const m = await injectingRun({ injection: injectionRecord({ "sec-sql-sort": INJECTED, "sec-path-traversal": INJECTED, "tw-expectation-deleted": INJECTED }) });
    expect(m.invalid).toEqual([]);
    expect(rowOf(m, "sec-sql-sort")).toEqual(expect.objectContaining({ present: true, caughtByImplementer: false, found: true }));
    expect(rowOf(m, "sec-path-traversal")).toEqual(expect.objectContaining({ present: true, caughtByImplementer: false, found: false }));
    expect(securityHeld(rowOf(m, "sec-path-traversal"))).toBe(false);
    expect(m.totals.recall.denominator).toBe(3);
  });

  it.each<[string, Record<string, unknown>, RegExp]>([
    ["no injection record", {}, /run\.json carries no injection record/],
    ["a record with no passes", { injection: { passes: 3 } }, /run\.json's injection record is malformed: passes is not an object/],
    ["a seed state the driver never writes", { injection: { passes: { "u1-p1": { pass: "u1-p1", seeds: [{ id: "sec-sql-sort", state: "skipped" }] } } } }, /run\.json's injection record is malformed: seed "sec-sql-sort" has state "skipped"/],
  ])("a v2 run with %s is invalid, with the reason named", async (_label, run, reason) => {
    const m = await injectingRun(run);
    expect(m.invalid).toContainEqual(expect.stringMatching(reason));
  });

  it("v1 is unchanged: a seeds document with no injection reads the snapshot, and ignores an injection record", async () => {
    const plain = await measure(passCapture({ shape: "baseline" }).layout.runDir);
    const withRecord = await measure(passCapture({ shape: "baseline", run: { injection: { passes: { "u1-p1": { pass: "u1-p1", seeds: [{ id: "sec-sql-sort", state: NOT_INJECTED }] } } } } }).layout.runDir);
    expect(plain.invalid).toEqual([]);
    expect(withRecord).toEqual(plain);
    expect(seedOf(withRecord)).toEqual(expect.objectContaining({ present: true, caughtByImplementer: false, found: true }));
  });
});

/** R4: u1-p1's tree with the seeded line reverted to the base's, so the contains rule reads absent. */
const REVERTED_QUERY = fileWith(11, "  const sql = `SELECT id FROM orders ORDER BY ${column} DESC LIMIT ? OFFSET ?`;");
/** R4: u3-p2's test with the deleted expectation restored, so the notContains rule reads absent. */
const RESTORED_TEST = ["it(\"lists orders with their totals\", async () => {", "    expect(body.orders).toHaveLength(1);", "    expect(body.orders[0].total_cents).toBe(1250);", "});", ""].join("\n");
const ALL_INJECTED = { "sec-sql-sort": INJECTED, "sec-path-traversal": INJECTED, "tw-expectation-deleted": INJECTED };
// R6 (review/167): the implementer names every pass, as `injectingRun` does and for the same reason.
const reviewedRun = (reviewSnapshots: CaptureSpec["reviewSnapshots"], snapshots: CaptureSpec["snapshots"] = INJECTING_SNAPSHOTS): Promise<Measurement> =>
  measureRun(passCapture({ shape: "baseline", run: { injection: injectionRecord(ALL_INJECTED) }, snapshots, reviewSnapshots, builds: ALL_BUILT }).layout.runDir, { seeds: INJECTING, forbid: [] }) as Promise<Measurement>;
const noteOf = (m: Measurement, id: string): string | undefined => m.notes.find((n) => n.startsWith(`seed ${id} (`));

describe("REPLAY-v2 R4 — an injected seed's presence is read at review time (review/162)", () => {
  it("a seed injected but absent from its pass's review snapshot was reverted before review: it leaves the denominator and holds its security row", async () => {
    const m = await reviewedRun({
      "u1-p1": { main: { "src/store/query.ts": REVERTED_QUERY, "src/orders/format.ts": FORMAT } },
      "u3-p2": { main: { [EXPECTATION.file]: RESTORED_TEST } },
    });
    expect(m.invalid).toEqual([]);
    for (const id of ["sec-sql-sort", "tw-expectation-deleted"]) {
      expect([id, rowOf(m, id)]).toEqual([id, expect.objectContaining({ present: false, caughtByImplementer: true })]);
      expect([id, noteOf(m, id)]).toEqual([id, expect.stringContaining("reverted before review")]);
    }
    expect(securityHeld(rowOf(m, "sec-sql-sort"))).toBe(true);
    expect(noteOf(m, "sec-sql-sort")).toContain("; a security seed, so it holds its security-seeds row");
    expect(noteOf(m, "tw-expectation-deleted")).not.toContain("a security seed");
    // u3-p1 has no review snapshot: its seed keeps the injection snapshot's reading, present and in the denominator.
    expect(rowOf(m, "sec-path-traversal")).toEqual(expect.objectContaining({ present: true, caughtByImplementer: false }));
    expect(noteOf(m, "sec-path-traversal")).toBeUndefined();
    expect(m.totals.recall).toEqual({ found: 0, denominator: 1, byClass: { security: { found: 0, denominator: 1 } } });
  });

  it("a seed present in the review snapshot is scored from the review copy, whatever the injection snapshot reads", async () => {
    const injectionTime = { ...INJECTING_SNAPSHOTS, "u1-p1": { main: { "src/store/query.ts": REVERTED_QUERY, "src/orders/format.ts": FORMAT } } };
    const m = await reviewedRun({ "u1-p1": SNAPSHOT_U1P1 }, injectionTime);
    expect(m.invalid).toEqual([]);
    expect(rowOf(m, "sec-sql-sort")).toEqual(expect.objectContaining({ present: true, caughtByImplementer: false, found: true }));
    expect(noteOf(m, "sec-sql-sort")).toBeUndefined();
    expect(m.totals.recall.denominator).toBe(3);
  });

  it("with no review snapshot for any pass, every seed falls back to the injection snapshot, as before R4", async () => {
    const without = await reviewedRun(undefined);
    const injected = await injectingRun({ injection: injectionRecord(ALL_INJECTED) });
    expect(without).toEqual(injected);
    expect(without.passes.flatMap((p) => p.seeds).map((r) => r.present)).toEqual([true, true, true]);
  });

  it("v1 is unchanged: a seeds document with no injection ignores a review snapshot that reverts the seed", async () => {
    const plain = await measure(passCapture({ shape: "baseline" }).layout.runDir);
    const reverted = await measure(passCapture({ shape: "baseline", reviewSnapshots: { "u1-p1": { main: { "src/store/query.ts": REVERTED_QUERY, "src/orders/format.ts": FORMAT } } } }).layout.runDir);
    expect(reverted).toEqual(plain);
    expect(seedOf(reverted)).toEqual(expect.objectContaining({ present: true, caughtByImplementer: false, found: true }));
  });
});

describe("REPLAY-v2 R4 — a compaction sample's placement falls back to the driver's record (review/164)", () => {
  /** A lens delivered after the ledger write, before the boundary, whose description and prompt name no pass. */
  const passless: AgentSpec = { id: "tu_lens", agentId: "alens", type: "stamity-security", description: "Security lens", prompt: "Review the diff for security.", result: "No findings.", tokens: 10 };
  const recorded = { compactions: [{ n: 1, placement: "u2-p1" }] };

  it("v2: the last lens delivery before the boundary names no pass, so the placement is the one run.json records", async () => {
    const m = (await measureRun(passCapture({ shape: "baseline", extra: dispatch(passless), run: { injection: injectionRecord(ALL_INJECTED), ...recorded }, snapshots: INJECTING_SNAPSHOTS }).layout.runDir, { seeds: INJECTING, forbid: [] })) as Measurement;
    expect(m.compactionSamples[0]).toEqual(expect.objectContaining({ n: 1, placement: "u2-p1" }));
  });

  it("v2: a lens delivery that names its pass keeps that pass over the record", async () => {
    const m = (await measureRun(passCapture({ shape: "baseline", run: { injection: injectionRecord(ALL_INJECTED), ...recorded }, snapshots: INJECTING_SNAPSHOTS }).layout.runDir, { seeds: INJECTING, forbid: [] })) as Measurement;
    expect(m.compactionSamples[0]).toEqual(expect.objectContaining({ n: 1, placement: "u1-p1" }));
  });

  it("v1 is unchanged: the placement stays null and run.json's record is not read", async () => {
    const m = await measure(passCapture({ shape: "baseline", extra: dispatch(passless), run: recorded }).layout.runDir);
    expect(m.compactionSamples[0]).toEqual(expect.objectContaining({ n: 1, placement: null }));
  });
});

describe("REPLAY-v2 — one term window in both shapes (inbox rows 228, 231)", () => {
  it("scores one finding identically as a free-text row and as a digest entry whose report row carries the term", async () => {
    // The digest's summary carries no accepted term; its report's `stamity-findings` entry does.
    const digestRows = [{ ...SEED_FINDING, summary: "the sort value reaches ORDER BY" }];
    const common = { rows: [SEED_FINDING], preLedger: [], endLedger: [], oracle: "pass" as const };
    const [free, structured] = [await measure(passCapture({ shape: "baseline", ...common }).layout.runDir), await measure(passCapture({ shape: "changed", ...common, digestRows }).layout.runDir)];
    for (const m of [free, structured]) {
      expect([m.shape, seedOf(m)]).toEqual([m.shape, expect.objectContaining({ found: true, foundRound1: true, stage: "pass" })]);
      expect([m.shape, m.totals.unmatched, m.adjudication]).toEqual([m.shape, 0, []]);
      expect([m.shape, m.compactionSamples[0]]).toEqual([m.shape, expect.objectContaining({ atRisk: 1, lost: 0, valid: true })]);
    }
  });

  it("review/41: a ledger row gains its report's entry only at the exact same locator", async () => {
    // The report's entry carries an accepted term; the ledger row's evidence does not.
    const termless = { ...SEED_FINDING, summary: "the sort value reaches ORDER BY" };
    const joined = await measure(passCapture({ shape: "changed", rows: [SEED_FINDING], endLedger: ledgerRows([termless], REPORT_REL) }).layout.runDir);
    expect([joined.totals.unmatched, joined.adjudication]).toEqual([0, []]);
    // Two lines off, inside the matcher's tolerance but not the same locator: the row is read as it is.
    const apart = await measure(passCapture({ shape: "changed", rows: [SEED_FINDING], endLedger: ledgerRows([{ ...termless, locator: "src/store/query.ts:13" }], REPORT_REL) }).layout.runDir);
    expect(apart.adjudication).toEqual([expect.objectContaining({ item: "sec-sql-sort", source: "ledger", locator: "src/store/query.ts:13" })]);
  });

  it("reads no more than the entry: a term only in the report's prose still goes to adjudication", async () => {
    const digestRows = [{ ...SEED_FINDING, summary: "the sort value reaches ORDER BY" }];
    const reportRows = [{ ...SEED_FINDING, summary: "the sort value reaches ORDER BY unchecked" }];
    const { layout } = passCapture({ shape: "changed", rows: reportRows, digestRows });
    const report = join(layout.state, "end", "runs", RUN, "reports", "u1-p1-reviewer-r1.md");
    writeFileSync(report, `${readFileSync(report, "utf8")}\nThe value is concatenated into the SQL text.\n`);
    const m = await measure(layout.runDir);
    expect(m.totals.recall.found).toBe(0);
    expect(m.adjudication).toEqual([expect.objectContaining({ item: "sec-sql-sort", locator: "src/store/query.ts:11" })]);
  });
});

describe("REPLAY-v2 — the auto-window compaction window (inbox row 230)", () => {
  const AUTO = mainLine.compactBoundary({ trigger: "auto", preTokens: 900_000 });
  const autoWindow = { mechanism: "auto-window" };

  it("keeps no sample for an auto boundary after the ledger write that closed the lens delivery's window", async () => {
    // `extra` lands after the first review's delivery and the ledger write that follows it.
    const m = await measure(passCapture({ shape: "baseline", run: autoWindow, extra: [AUTO] }).layout.runDir);
    expect(m.compactionSamples.map((s) => [s.n, s.trigger])).toEqual([[2, "manual"]]);
    expect(notesOf(m)).toMatch(/auto compaction 1 at main transcript line \d+ falls outside §7's window/);
  });

  it("keeps a sample for an auto boundary after a lens delivery with no ledger write since, a ledger status read included", async () => {
    const status = [mainLine.bashToolUse({ id: "tu_status", command: `npx @zomarit/stamity ledger status --run ${RUN}` }), mainLine.toolResult("tu_status", "0 open")];
    const m = await measure(passCapture({ shape: "baseline", run: autoWindow, tail: [...status, AUTO] }).layout.runDir);
    expect(m.compactionSamples.map((s) => [s.n, s.trigger])).toEqual([[1, "manual"], [2, "auto"]]);
  });

  it("applies no window under the interrupt mechanism, where an auto boundary is no driver compaction", async () => {
    const m = await measure(passCapture({ shape: "baseline", extra: [AUTO] }).layout.runDir);
    expect(m.compactionSamples.map((s) => [s.n, s.trigger])).toEqual([[1, "manual"]]);
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

// ---------- R3: a named pass range (review/150) ----------

/** The range marks beside `..`, spelled by code point so no raw or escaped character sits in this file. */
const ELLIPSIS = String.fromCodePoint(0x2026);
const EN_DASH = String.fromCodePoint(0x2013);
const EM_DASH = String.fromCodePoint(0x2014);
const ALL_SIX = ["u1-p1", "u1-p2", "u2-p1", "u2-p2", "u3-p1", "u3-p2"];

/**
 * Every text the measurement hands passesOf in the two committed v1 pilots (2026-09-24-replay-1 and
 * -2: the main transcripts' Agent dispatches and the sub-agent files' descriptions and first prompts,
 * 70 in all), reduced to the pass ids each names and the text between consecutive ids, a gap of more
 * than 24 characters written as " [long gap] ", and de-duplicated; with the passes the pre-R3
 * passesOf (2f8ac546) returned for the unreduced text. Three rows name a range (the round-1 review's
 * "u1-p1", an ellipsis and "u3-p2", and two "u1-p1..u3-p2"), so v1's measurement is unchanged only
 * because it reads no range.
 */
const V1_PILOT_TEXTS: [desc: string, prompt: string, passes: string[]][] = [
  ["", "u1-p1.patch, u1-p2.patch, u2-p1.patch, u2-p2.patch, u3-p1.patch, u3-p2", ALL_SIX],
  ["u1-p1", "u1-p1 [long gap] u1-p1", ["u1-p1"]],
  ["", "", []],
  ["u1-p2", "u1-p2 [long gap] u1-p1 [long gap] u1-p2 [long gap] u1-p1", ["u1-p2"]],
  ["u2-p1", "u2-p1 [long gap] u1-p1 [long gap] u1-p2 [long gap] u2-p1", ["u2-p1"]],
  ["u2-p2", "u2-p2 [long gap] u1-p1, u1-p2, u2-p1 [long gap] u2-p2", ["u2-p2"]],
  ["u3-p1", "u3-p1 [long gap] u1-p1..u2-p2 [long gap] u3-p1", ["u3-p1"]],
  ["u3-p2", "u3-p2 [long gap] u1-p1 through u3-p1 [long gap] u3-p2", ["u3-p2"]],
  ["", `u1-p1 ${ELLIPSIS} u3-p2 [long gap] u3-p1`, ["u1-p1", "u3-p1", "u3-p2"]],
  ["", "u1-p1..u3-p2", ["u1-p1", "u3-p2"]],
  ["", "u1-p1.patch .. u3-p2 [long gap] u1-p1..u3-p2", ["u1-p1", "u3-p2"]],
  ["u1-p1", "u1-p1 [long gap] u1-p1 [long gap] u1-p1 [long gap] u1-p1", ["u1-p1"]],
  ["u1-p2", "u1-p2 [long gap] u1-p2 [long gap] u1-p1 [long gap] u1-p2 [long gap] u1-p2", ["u1-p2"]],
  ["u2-p1", "u2-p1 [long gap] u2-p1 [long gap] u1-p1 and u1-p2 [long gap] u2-p1 [long gap] u2-p1", ["u2-p1"]],
  ["u2-p2", "u2-p2 [long gap] u2-p2 [long gap] u1-p1, u1-p2 and u2-p1 [long gap] u2-p2 [long gap] u2-p2", ["u2-p2"]],
  ["u3-p1", "u3-p1 [long gap] u3-p1 [long gap] u1-p1 through u2-p2 [long gap] u3-p1 [long gap] u3-p1", ["u3-p1"]],
  ["u3-p2", "u3-p2 [long gap] u3-p2 [long gap] u3-p2 [long gap] u1-p1 through u3-p1 [long gap] u3-p2 [long gap] u3-p2", ["u3-p2"]],
  ["", "u3-p1's `file` query; u3-p2", ["u3-p1", "u3-p2"]],
];

/** Each pass's review round count, in pass order. */
const roundsOf = (m: Measurement): number[] => m.passes.map((p) => p.verdict.rounds);

describe("R3 — a named pass range covers every pass in it (review/150)", () => {
  it("\"units u1-p1..u3-p2\" covers all six passes", () => {
    expect(passesOf("Review the change set", "Review units u1-p1..u3-p2.")).toEqual(ALL_SIX);
  });

  it("\"u2-p1 to u2-p2\" covers two, and every accepted range mark reads alike", () => {
    expect(passesOf("Review the lane", "Review u2-p1 to u2-p2.")).toEqual(["u2-p1", "u2-p2"]);
    for (const gap of ["..", "...", ` ${ELLIPSIS} `, ELLIPSIS, EN_DASH, ` ${EN_DASH} `, EM_DASH, ` ${EM_DASH} `, " to ", " through ", " .. "]) {
      expect([gap, passesOf("Review the lane", `Review u1-p2${gap}u2-p2 now.`)]).toEqual([gap, ["u1-p2", "u2-p1", "u2-p2"]]);
    }
  });

  it("a plain list stays a list: \"u1-p1, u3-p2\" covers two", () => {
    expect(passesOf("Review the lane", "Review u1-p1, u3-p2.")).toEqual(["u1-p1", "u3-p2"]);
    expect(passesOf("Review the lane", "Review u1-p1 and u3-p2.")).toEqual(["u1-p1", "u3-p2"]);
  });

  it("a range named backwards expands, in pass order: coverage is a set, and refusing it would leave only its two ends", () => {
    expect(passesOf("Review the change set", "Review u3-p2..u1-p1.")).toEqual(ALL_SIX);
    expect(passesOf("Review the lane", "Review u2-p2 through u2-p1.")).toEqual(["u2-p1", "u2-p2"]);
  });

  it("the hyphen inside an id, a slug's joint and a list bullet are no range, and neither is a line break", () => {
    for (const prompt of ["Review u1-p1-u3-p2.", "Review u1-p1 - u3-p2.", "Review:\n- u1-p1\n- u3-p2", "Review u1-p1\n..\nu3-p2", "Review u1-p1 and then to u3-p2."]) {
      expect([prompt, passesOf("Review the lane", prompt)]).toEqual([prompt, ["u1-p1", "u3-p2"]]);
    }
  });

  it("chains and mixes: each range covers its span, each listed id itself", () => {
    expect(passesOf("Review the lane", "Review u1-p1..u1-p2, then u3-p1 to u3-p2.")).toEqual(["u1-p1", "u1-p2", "u3-p1", "u3-p2"]);
    expect(passesOf("Review the lane", "Review u1-p1..u2-p1..u3-p2.")).toEqual(ALL_SIX);
  });

  it("the one-pass description rule stays: a description naming a pass, a range included, covers that one pass", () => {
    expect(passesOf("Review u2-p1", "Review units u1-p1..u3-p2.")).toEqual(["u2-p1"]);
    expect(passesOf("Review u1-p1..u3-p2", "Review both.")).toEqual(["u1-p1"]);
  });

  it("v1's measurement of its two committed pilots is unchanged: with ranges off, every pilot text keeps its pre-R3 passes", () => {
    for (const [desc, prompt, passes] of V1_PILOT_TEXTS) expect([desc, prompt, passesOf(desc, prompt, { ranges: false })]).toEqual([desc, prompt, passes]);
    // The pin has teeth: under the range rule the pilots' three range prompts would cover all six.
    const widened = V1_PILOT_TEXTS.filter(([desc, prompt, passes]) => JSON.stringify(passesOf(desc, prompt)) !== JSON.stringify(passes));
    expect(widened).toHaveLength(3);
    for (const [desc, prompt] of widened) expect(passesOf(desc, prompt)).toEqual(ALL_SIX);
  });

  it("measureRun reads ranges under REPLAY-v2 (an injecting seeds document) and not under v1", async () => {
    // R6 (review/167) moved v2's coverage off the prompt: a verdict dispatch covers nothing before the injection
    // point, and after it the passes its description names (a range included), never its prompt's. The range
    // therefore moves from the round's prompt to its description, and a build naming every pass reaches the point.
    const rounds = [{ result: APPROVE, description: "Review u1-p1..u2-p1", prompt: "Review the batch." }];
    const implementers = [{ ...implementerOf("u1-p1"), description: "Implement u1-p1..u3-p2" }];
    const v2 = (await measureRun(multiCapture({ rounds, implementers }).layout.runDir, { seeds: INJECTING, forbid: [] })) as Measurement;
    const v1 = await measure(multiCapture({ rounds, implementers }).layout.runDir);
    expect(roundsOf(v2)).toEqual([1, 1, 1, 0, 0, 0]);
    // v1 reads the description's first id only (review/38), and no range.
    expect(roundsOf(v1)).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it("(review/12) v1's measureRun reads no range from a round's prompt: its ends only", async () => {
    // The pre-R6 capture, kept as v1's own case: the range sits in the prompt, where v1's joinAgents reads passesOf
    // with no range, so u1-p2 between the two ends takes no round.
    const v1 = await measure(multiCapture({ rounds: [{ result: APPROVE, prompt: "Review u1-p1..u2-p1." }] }).layout.runDir);
    expect(roundsOf(v1)).toEqual([1, 0, 1, 0, 0, 0]);
  });
});

/**
 * R7 (review/168): the third K-inject-baseline canary's shape. The shape reviewed its whole change set in
 * one round whose prompt names only u3-p1, so the hook covered u3-p1 alone: u1-p1 got no entry in the
 * injection record and no snapshot, and its seed was never in any tree. The round's free-text Critical,
 * about another file, cites the clean allowlist line at sec-sql-sort's span beside "allowlist", one of the
 * seed's accepted terms, so the static span fallback meets it.
 */
const STRAY_REVIEW = [
  "**Verdict:** request-changes",
  "",
  "### F1: Critical. `GET /orders` hides store failures behind a 200 with an empty list",
  "- **Where:** `src/orders/handlers.ts:54-59`",
  "- **Why it matters:** `listOrders` can't throw on bad input (the `sort` allowlist is at `src/store/query.ts:11`), so this catch only hides real failures.",
].join("\n");
/** `run.json`'s `injection` with an entry only for the passes whose seeds `states` names. */
function coveredRecord(states: Record<string, string>): Record<string, unknown> {
  const passes: Record<string, { pass: string; seeds: { id: string; file: string; state: string }[]; partial: boolean; snapshot: boolean }> = {};
  for (const seed of INJECTING.seeds) {
    const state = states[seed.id];
    if (state !== undefined) (passes[seed.pass] ??= { pass: seed.pass, seeds: [], partial: false, snapshot: true }).seeds.push({ id: seed.id, file: seed.file, state });
  }
  return { passes, partial: false, unreadable: [], unfinished: [] };
}
function uncoveredCapture(injection: Record<string, unknown>, builds: AgentSpec[] = [implementerOf("u1-p1"), implementerOf("u3-p1")]): Built {
  const dir = scratch();
  const fixture = join(dir, "fx");
  mkdirSync(fixture);
  const agents: AgentSpec[] = [
    ...builds,
    { id: "tu_round1", agentId: "around1", type: "stamity-reviewer", description: "Review round 1", prompt: "Review the whole staged change set. The 404 body contract change is owned by u3-p1.", result: STRAY_REVIEW, tokens: 100 },
  ];
  const layout = writeCapture(dir, {
    run: { runId: "2026-09-27-replay-1", shape: "baseline", kind: "scored", client: { version: "2.1.280" }, injection },
    stdout: [JSON.stringify({ type: "system", subtype: "init", ...INIT_PINNED, cwd: fixture })],
    transcript: [mainLine.userText("/st-work docs/plans/001-replay.md --effort deep"), ...agents.flatMap(dispatch)],
    subagents: agents.map(subagentOf),
    snapshots: { "u3-p1": { main: { "src/store/query.ts": REVERTED_QUERY, [TRAVERSAL.file]: REWRITTEN_INVOICE } }, "u3-p2": { main: { [EXPECTATION.file]: REWRITTEN_TEST } } },
    state: { end: { runId: RUN, ledger: [] } },
    oracle: { schema: "stamity/replay-oracle/v1", run: { status: "ok", detail: "" }, results: INJECTING.seeds.map((s) => ({ seed: s.id, kind: "vitest", status: "pass", detail: "" })) },
  });
  return { layout, fixture, agents };
}
const UNCOVERED_ROW = { present: null, caughtByImplementer: false, found: false, foundRound1: false, stage: null };

describe("REPLAY-v2 R7 — an uncovered seed is never credited, and its run is invalid (review/168)", () => {
  it("(a) the third canary's shape: a stray finding at an uncovered seed's clean line credits nothing, and the one invalid reason names the pass and its seed", async () => {
    const record = coveredRecord({ "sec-path-traversal": NOT_INJECTED, "tw-expectation-deleted": NOT_INJECTED });
    const m = (await measureRun(uncoveredCapture(record).layout.runDir, { seeds: INJECTING, forbid: [] })) as Measurement;
    expect(m.invalid).toEqual(["uncovered pass u1-p1: no review dispatch covered it, so its seeds (sec-sql-sort) were never injected"]);
    expect(rowOf(m, "sec-sql-sort")).toEqual(expect.objectContaining(UNCOVERED_ROW));
    expect(securityHeld(rowOf(m, "sec-sql-sort"))).toBe(false);
    expect(m.totals.recall.found).toBe(0);
    expect(m.notes).toContainEqual("seed sec-sql-sort (u1-p1): uncovered — no state in run.json's injection record, so it was never injected and no finding can find it; the run is invalid (§8)");
    expect(m.notes.join("\n")).not.toContain("presence unknown");
    // review/4: the stray finding does meet the seed. The same capture with every pass built and u1-p1's seed
    // recorded injected credits it, so (a)'s row is the rule withholding a match, not a finding that missed.
    const control = coveredRecord({ "sec-sql-sort": INJECTED, "sec-path-traversal": NOT_INJECTED, "tw-expectation-deleted": NOT_INJECTED });
    const built = (await measureRun(uncoveredCapture(control, [{ ...implementerOf("u1-p1"), description: ALL_BUILT }]).layout.runDir, { seeds: INJECTING, forbid: [] })) as Measurement;
    expect(rowOf(built, "sec-sql-sort")).toEqual(expect.objectContaining({ found: true }));
  });

  it("(b) a pass entry that omits one of its seeds makes the run invalid for an uncovered pass, and the omitted seed is never found", async () => {
    const record = injectionRecord(ALL_INJECTED) as { passes: Record<string, { seeds: unknown[] }> };
    record.passes["u1-p1"]!.seeds = [];
    const m = await injectingRun({ injection: record });
    // review/1, review/6 (R7): an omitted seed is uncovered, so its reason begins UNCOVERED_REASON and §10 does not replace
    // a changed scored run invalid only this way.
    expect(m.invalid).toEqual(["uncovered pass u1-p1: its entry in run.json's injection record omits seed sec-sql-sort, so it was never injected"]);
    // The capture's reviewer cites the seed's line: the find the full record credits is not credited here.
    expect(rowOf(m, "sec-sql-sort")).toEqual(expect.objectContaining(UNCOVERED_ROW));
    expect(m.notes).toContainEqual(expect.stringMatching(/^seed sec-sql-sort \(u1-p1\): uncovered — /));
  });

  it("(e) a record with an entry for every pass of the seeds document leaves no seed uncovered, and the cited seed stays found", async () => {
    const m = await injectingRun({ injection: injectionRecord(ALL_INJECTED) });
    expect(m.invalid).toEqual([]);
    expect(rowOf(m, "sec-sql-sort")).toEqual(expect.objectContaining({ present: true, found: true }));
    expect(m.notes.join("\n")).not.toContain("uncovered");
  });

  it("two uncovered passes each get one reason, their seeds listed in document order", async () => {
    const m = await injectingRun({ injection: coveredRecord({ "sec-sql-sort": INJECTED }) });
    expect(m.invalid).toEqual([
      "uncovered pass u3-p1: no review dispatch covered it, so its seeds (sec-path-traversal) were never injected",
      "uncovered pass u3-p2: no review dispatch covered it, so its seeds (tw-expectation-deleted) were never injected",
    ]);
    expect(rowOf(m, "sec-sql-sort")).toEqual(expect.objectContaining({ present: true, found: true }));
  });

  it("(f) a pass with an injection entry and no injection snapshot is a capture defect, and no seed reads presence unknown", async () => {
    const { "u3-p2": _dropped, ...snapshots } = INJECTING_SNAPSHOTS;
    const m = (await measureRun(passCapture({ shape: "baseline", run: { injection: injectionRecord(ALL_INJECTED) }, snapshots }).layout.runDir, { seeds: INJECTING, forbid: [] })) as Measurement;
    expect(m.invalid).toEqual(["capture defect: pass u3-p2 has an entry in run.json's injection record, but captures/snapshots/u3-p2/ holds no copy"]);
    expect(m.notes.join("\n")).not.toContain("presence unknown");
  });

  it("(f) a seed recorded injected whose file is absent from every copy of its pass's injection snapshot is a capture defect, whatever the review snapshot holds", async () => {
    const without = { "src/orders/format.ts": FORMAT };
    const snapshots = { ...INJECTING_SNAPSHOTS, "u1-p1": { main: without, "lane-u1-p1": without } };
    const m = (await measureRun(passCapture({ shape: "baseline", run: { injection: injectionRecord(ALL_INJECTED) }, snapshots, reviewSnapshots: { "u1-p1": SNAPSHOT_U1P1 } }).layout.runDir, { seeds: INJECTING, forbid: [] })) as Measurement;
    expect(m.invalid).toEqual(["capture defect: seed sec-sql-sort (u1-p1): src/store/query.ts is absent from every copy of the pass's injection snapshot (captures/snapshots/u1-p1/)"]);
    expect(m.notes.join("\n")).not.toContain("presence unknown");
    // Without a review snapshot the same capture reads the same defect, still with no presence-unknown note.
    const plain = (await measureRun(passCapture({ shape: "baseline", run: { injection: injectionRecord(ALL_INJECTED) }, snapshots }).layout.runDir, { seeds: INJECTING, forbid: [] })) as Measurement;
    expect(plain.invalid).toEqual(m.invalid);
    expect(plain.notes.join("\n")).not.toContain("presence unknown");
  });

  it("(f) a seed whose file every review copy lacks, while the injection snapshot holds it, stays a capture defect and reads no presence unknown", async () => {
    const without = { "src/orders/format.ts": FORMAT };
    const m = await reviewedRun({ "u1-p1": { main: without } });
    expect(m.invalid).toEqual(["capture defect: seed sec-sql-sort (u1-p1): src/store/query.ts is absent from every copy of the pass's review snapshot (captures/review-snapshots/u1-p1/)"]);
    expect(m.notes.join("\n")).not.toContain("presence unknown");
  });

  it("a seed recorded not injected keeps its reading beside an uncovered pass: out of the denominator, its security row held", async () => {
    const m = (await measureRun(uncoveredCapture(coveredRecord({ "sec-path-traversal": NOT_INJECTED, "tw-expectation-deleted": NOT_INJECTED })).layout.runDir, { seeds: INJECTING, forbid: [] })) as Measurement;
    expect(rowOf(m, "sec-path-traversal")).toEqual(expect.objectContaining({ present: false, caughtByImplementer: true }));
    expect(securityHeld(rowOf(m, "sec-path-traversal"))).toBe(true);
    expect(m.totals.recall.denominator).toBe(1);
  });

  it.each<[string, Record<string, unknown>]>([
    ["a seed state the driver never writes", { injection: { ...coveredRecord(ALL_INJECTED), passes: { ...(coveredRecord(ALL_INJECTED).passes as object), "u1-p1": { pass: "u1-p1", seeds: [{ id: "sec-sql-sort", state: "skipped" }] } } } }],
    ["a pass entry with no seeds list", { injection: { ...coveredRecord(ALL_INJECTED), passes: { ...(coveredRecord(ALL_INJECTED).passes as object), "u1-p1": { pass: "u1-p1" } } } }],
    ["no injection record", {}],
  ])("(review/5, build/9) %s: the seed is never found, and its note names the unreadable record, not an uncovered pass", async (_label, run) => {
    const m = await injectingRun(run);
    expect(rowOf(m, "sec-sql-sort")).toEqual(expect.objectContaining(UNCOVERED_ROW));
    expect(m.notes).toContainEqual("seed sec-sql-sort (u1-p1): no readable state in run.json's injection record (the run's invalid reason names why), so it is filed never found, whatever a finding matches; the run is invalid (§8)");
    expect(m.notes.join("\n")).not.toContain("sec-sql-sort (u1-p1): uncovered");
    expect(m.invalid.filter((r) => r.startsWith("uncovered pass"))).toEqual([]);
  });

  it("a v1 seeds document never takes the rule: a pass with no snapshot and no record keeps presence unknown, and no reason names an uncovered pass", async () => {
    const m = await measure(passCapture({ shape: "baseline", snapshots: {} }).layout.runDir);
    expect(m.invalid.filter((r) => r.startsWith("uncovered pass"))).toEqual([]);
    expect(m.notes.join("\n")).toContain("presence unknown");
    expect(m.notes.join("\n")).not.toContain("uncovered");
  });
});

// ---------- R6 and R8: all built, then all seeded; branch level follows an approval (review/167) ----------

/** S2's event shape (`coverageOf`'s JSDoc), which the private driver mirrors from its marker log. */
type CoverageEvent = { kind: "dispatch"; id: string; role: string; description: string; prompt: string } | { kind: "stop"; id: string; returned: boolean };
interface Coverage {
  built: string[];
  passes: string[];
  injectionPoint: boolean;
}
const coverOf = (events: CoverageEvent[]): Map<string, Coverage> => coverageOf(events, ALL_SIX) as Map<string, Coverage>;
const sent = (id: string, role: string, description: string, prompt = ""): CoverageEvent => ({ kind: "dispatch", id, role, description, prompt });
const back = (id: string, returned = true): CoverageEvent => ({ kind: "stop", id, returned });
const passesAt = (events: CoverageEvent[]): Record<string, string[]> => Object.fromEntries([...coverOf(events)].map(([id, c]) => [id, c.passes]));
const pointsOf = (events: CoverageEvent[]): string[] => [...coverOf(events)].filter(([, c]) => c.injectionPoint).map(([id]) => id);

/**
 * The third K-inject-baseline canary (instrument 1bd6e571), reduced from its dispatch catalogue: every
 * description as dispatched, each prompt cut to the text around the pass ids it names. The fourth build's
 * prompt names the later u3-p1 and the last two name earlier units by an ellipsis range; round 1's prompt
 * names u3-p1 in passing, which `passesOf` read as the round's only pass (review/167).
 */
const CANARY_3: CoverageEvent[] = [
  sent("audit", "other", "Audit patches vs contract", `\`vendor/contrib/u1-p1.patch\` ${ELLIPSIS} \`u3-p2.patch\` (applied in that order)`), back("audit"),
  sent("gate0", "gate", "Baseline gate run"), back("gate0"),
  sent("b1", "build", "Build unit u1-p1", "You are building unit u1-p1 of docs/plans/001-replay.md."), back("b1"),
  sent("b2", "build", "Build unit u1-p2", "You are building unit u1-p2. Unit u1-p1 is already applied."), back("b2"),
  sent("b3", "build", "Build unit u2-p1", "You are building unit u2-p1. Units u1-p1 and u1-p2 are already applied. A later unit (u3-p1) owns reconciling your test."), back("b3"),
  sent("b4", "build", "Build unit u2-p2", "You are building unit u2-p2. Units u1-p1, u1-p2, u2-p1 are applied."), back("b4"),
  sent("b5", "build", "Build unit u3-p1", `You are building unit u3-p1. Units u1-p1 ${ELLIPSIS} u2-p2 are applied.`), back("b5"),
  sent("b6", "build", "Build unit u3-p2", `You are building unit u3-p2. Units u1-p1 ${ELLIPSIS} u3-p1 are applied.`), back("b6"),
  sent("gate1", "gate", "Prove pass 1 gates"), back("gate1"),
  sent("r1", "verdict", "Review round 1", "Review the staged change set: six units (404 body contract change owned by u3-p1; config shape gaining exportBatchSize)."),
  sent("sec", "verdict", "Security specialist lens"), sent("perf", "verdict", "Performance specialist lens"), sent("dq", "verdict", "Design-quality specialist lens"),
  back("r1"), back("sec"), back("perf"), back("dq"),
  sent("f1", "fix", "Fixer round 1", "Fix the round-1 findings."), back("f1"),
  sent("gate2", "gate", "Prove pass 2 gates"), back("gate2"),
  sent("r2", "verdict", "Review round 2", "Re-review the round-1 fixes."), back("r2"),
  sent("deep", "verdict", "Whole-branch deep review", "Review the whole branch."), back("deep"),
];

/** v1's changed pilot (2026-09-24-replay-2), reduced the same way: its only review round is named for the whole branch. */
const CHANGED_PILOT: CoverageEvent[] = [
  sent("census", "other", "Contract census consumers", "plan docs/plans/001-replay.md (units u1-p1..u3-p2) will touch"),
  sent("patches", "other", "Patches vs api.md contract", "audit each patch in vendor/contrib/ (u1-p1.patch .. u3-p2.patch)"),
  sent("b1", "build", "Build unit u1-p1", "Plan: docs/plans/001-replay.md, unit u1-p1."),
  sent("b2", "build", "Build unit u1-p2", "Plan: docs/plans/001-replay.md, unit u1-p2. The index holds u1-p1 staged."),
  sent("b3", "build", "Build unit u2-p1", "Plan: docs/plans/001-replay.md, unit u2-p1. The index holds u1-p1 and u1-p2 staged."),
  sent("b4", "build", "Build unit u2-p2", "Plan: docs/plans/001-replay.md, unit u2-p2. The index holds u1-p1, u1-p2 and u2-p1 staged."),
  sent("b5", "build", "Build unit u3-p1", "Plan: docs/plans/001-replay.md, unit u3-p1. The index holds u1-p1 through u2-p2 staged."),
  sent("b6", "build", "Build unit u3-p2", "Plan: docs/plans/001-replay.md, unit u3-p2. Reject the rename (u3-p2.patch lines 95-96)."),
  sent("gates", "gate", "Run full verification gates"),
  sent("wb", "verdict", "Whole-branch review round 1", "Review all six units. Recorded deviations: D8 removes u3-p1's `file` query; u3-p2 answers 400 on an unknown sort."),
  sent("sec", "verdict", "Security lens on branch"), sent("perf", "verdict", "Performance lens on branch"), sent("dq", "verdict", "Design-quality lens on branch"),
];

describe("R6 — coverageOf: all built, then all seeded (review/167)", () => {
  it("(a) the third canary: six builds build their own pass, round 1 is the one injection point, and every later verdict and the fixer cover all six", () => {
    const cov = coverOf(CANARY_3);
    expect(["b1", "b2", "b3", "b4", "b5", "b6"].map((id) => cov.get(id)!.built)).toEqual(ALL_SIX.map((p) => [p]));
    expect(pointsOf(CANARY_3)).toEqual(["r1"]);
    const at = passesAt(CANARY_3);
    for (const id of ["r1", "sec", "perf", "dq", "f1", "r2", "deep"]) expect([id, at[id]]).toEqual([id, ALL_SIX]);
    for (const id of ["audit", "gate0", "gate1", "gate2"]) expect([id, at[id], cov.get(id)!.built]).toEqual([id, [], []]);
    // The pass ids a prompt names are never read: today's rule gave round 1 u3-p1 alone.
    const round1 = CANARY_3.find((e) => e.kind === "dispatch" && e.id === "r1") as { prompt: string };
    expect(passesOf("Review round 1", round1.prompt)).toEqual(["u3-p1"]);
  });

  it("(a) v1's changed pilot: \"Whole-branch review round 1\" is the injection point and covers all six, and so does each lens", () => {
    expect(pointsOf(CHANGED_PILOT)).toEqual(["wb"]);
    const at = passesAt(CHANGED_PILOT);
    for (const id of ["wb", "sec", "perf", "dq"]) expect([id, at[id]]).toEqual([id, ALL_SIX]);
    expect([at["census"], at["patches"]]).toEqual([[], []]);
  });

  it.each<[string, string, string[]]>([
    ["Build units u1-p1..u3-p2", "Build every unit.", ALL_SIX],
    ["Build u1-p1, u3-p2", "Build both.", ["u1-p1", "u3-p2"]],
    ["Build u1-p1 and u1-p2", "Build both.", ["u1-p1", "u1-p2"]],
    ["Implement u0 lint scope fix", "Earlier work for unit u1-p1 is already staged.", []],
    ["Build the invoice route", "Build unit u3-p1 of the plan.", []],
  ])("(a) a build described %j builds the passes its description names, never its prompt's", (description, prompt, built) => {
    expect(coverOf([sent("b", "build", description, prompt)]).get("b")).toEqual({ built, passes: built, injectionPoint: false });
  });

  it("(a) one build naming the whole range reaches the injection point; a list of two leaves it unreached, so a review covers nothing", () => {
    const review = sent("r", "verdict", "Review the change set");
    expect(coverOf([sent("b", "build", "Build units u1-p1..u3-p2"), review]).get("r")).toEqual({ built: [], passes: ALL_SIX, injectionPoint: true });
    expect(coverOf([sent("b", "build", "Build u1-p1, u3-p2"), review]).get("r")).toEqual({ built: [], passes: [], injectionPoint: false });
  });

  it("a verdict before or between builds covers nothing, and only the first verdict after the sixth build is the injection point", () => {
    const builds = ALL_SIX.map((p) => sent(`b-${p}`, "build", `Build unit ${p}`));
    const events = [sent("plan", "verdict", "Plan review", "Review units u1-p1..u3-p2."), ...builds.slice(0, 3), sent("cell", "verdict", "Read the amended cell of u2-p1"), ...builds.slice(3), sent("r1", "verdict", "Review round 1"), sent("r2", "verdict", "Review u2-p1")];
    const at = passesAt(events);
    expect([at["plan"], at["cell"]]).toEqual([[], []]);
    expect(pointsOf(events)).toEqual(["r1"]);
    // At or after the point, a description naming a pass (a range included) covers what it names.
    expect(at["r2"]).toEqual(["u2-p1"]);
    expect(passesAt([...events, sent("r3", "verdict", "Review u1-p2..u2-p2")])["r3"]).toEqual(["u1-p2", "u2-p1", "u2-p2"]);
  });

  it("a fixer covers its description's passes, else the passes of the verdict agents that returned by themselves before it; before any returned review, nothing", () => {
    const builds = ALL_SIX.map((p) => sent(`b-${p}`, "build", `Build unit ${p}`));
    const events = [
      sent("b0", "build", "Build unit u1-p1"), sent("lint", "fix", "Scope lint away from generated hooks"), ...builds.slice(1),
      sent("r1", "verdict", "Review round 1"), back("r1", false), sent("early", "fix", "Restore tree to staged index"),
      sent("r2", "verdict", "Review u2-p1"), back("r2"), sent("f2", "fix", "Fixer round 1"), sent("named", "fix", "Fix u3-p2"),
      sent("r3", "verdict", "Review round 2"), back("r3"), sent("f3", "fix", "Fixer round 2"),
    ];
    const at = passesAt(events);
    // A TaskStop is no return: the round stopped in full leaves the next fixer covering nothing.
    expect([at["lint"], at["early"]]).toEqual([[], []]);
    expect([at["f2"], at["named"], at["f3"]]).toEqual([["u2-p1"], ["u3-p2"], ALL_SIX]);
  });

  it("a SendMessage re-review is no dispatch: its return adds no row and moves no injection point", () => {
    const resumed = [...CANARY_3, back("deep"), back("r1")];
    expect(coverOf(resumed)).toEqual(coverOf(CANARY_3));
  });

  it("is causal: the row of every dispatch in a prefix of the run equals its row over the whole run", () => {
    const whole = coverOf(CANARY_3);
    for (let k = 0; k <= CANARY_3.length; k++) {
      for (const [id, row] of coverOf(CANARY_3.slice(0, k))) expect([k, id, row]).toEqual([k, id, whole.get(id)]);
    }
  });
});

/** An implementer described by its pass, as 30 of the 32 captured build dispatches are. */
const builderOf = (pass: string): AgentSpec => ({
  id: `tu_build_${pass}`, agentId: `abuild${pass.replace("-", "")}`, type: "stamity-implementer", description: `Build unit ${pass}`, prompt: `You are building unit ${pass} of docs/plans/001-replay.md.`, result: "status: DONE", tokens: 100,
});
const BUILDERS = ALL_SIX.map(builderOf);
const agentOf = (id: string, type: string, description: string, prompt: string, result: string): AgentSpec => ({ id: `tu_${id}`, agentId: `a${id}`, type, description, prompt, result, tokens: 100 });
/** The synthetic u1-p1 seed alone, injecting: a v2 document whose record needs one entry. */
const ONE_SEED = { ...SEEDS, seeds: [{ ...SEEDS.seeds[0]!, injection: INJECTION }] };
const ONE_RECORD = { passes: { "u1-p1": { pass: "u1-p1", seeds: [{ id: "sec-sql-sort", file: "src/store/query.ts", state: INJECTED }], partial: false, snapshot: true } }, partial: false, unreadable: [], unfinished: [] };
/** Every pass holds an injection snapshot (the hook snapshots all six at the injection point); only u1-p1's holds the seed. */
const sixSnapshots = (u1p1: Record<string, string> = SNAPSHOT_U1P1.main): NonNullable<CaptureSpec["snapshots"]> =>
  Object.fromEntries(ALL_SIX.map((p) => [p, { main: p === "u1-p1" ? u1p1 : { "src/orders/format.ts": FORMAT } }]));
const SEC_REPORT = `.stamity/runs/${RUN}/reports/u1-p1-security-r1.md`;

/** A v2 run built from `agents` in dispatch order, each delivered before the next is dispatched. */
function featureCapture(agents: AgentSpec[], options: { snapshots?: CaptureSpec["snapshots"]; ledger?: Record<string, unknown>[]; reports?: Record<string, string>; tail?: string[]; extraSubagents?: SubagentFile[] } = {}): Built {
  const dir = scratch();
  const fixture = join(dir, "fx");
  mkdirSync(fixture);
  const layout = writeCapture(dir, {
    run: { runId: "2026-09-28-replay-v2-1", shape: "baseline", kind: "scored", client: { version: "2.1.280" }, injection: ONE_RECORD },
    stdout: [JSON.stringify({ type: "system", subtype: "init", ...INIT_PINNED, cwd: fixture })],
    transcript: [mainLine.userText("/st-work docs/plans/001-replay.md --effort deep"), ...agents.flatMap(dispatch), ...(options.tail ?? [])],
    subagents: [...agents.map(subagentOf), ...(options.extraSubagents ?? [])],
    snapshots: options.snapshots ?? sixSnapshots(),
    state: { end: { runId: RUN, ledger: options.ledger ?? [], ...(options.reports ? { reports: options.reports } : {}) } },
    oracle: { schema: "stamity/replay-oracle/v1", run: { status: "ok", detail: "" }, results: [{ seed: "sec-sql-sort", kind: "vitest", status: "pass", detail: "" }] },
  });
  return { layout, fixture, agents };
}
const featureRun = (agents: AgentSpec[], options?: Parameters<typeof featureCapture>[1]): Promise<Measurement> =>
  measureRun(featureCapture(agents, options).layout.runDir, { seeds: ONE_SEED, forbid: [] }) as Promise<Measurement>;

/** Round 1 named by feature, its prompt naming u3-p1 in passing (the third canary's shape). */
const ROUND_1 = agentOf("r1", "stamity-reviewer", "Review round 1", "Review the staged change set of six units. The 404 body contract change is owned by u3-p1.", freeTextReturn([LOOSE_FINDING], "request-changes"));
const APPROVING_1 = agentOf("r1", "stamity-reviewer", "Review round 1", "Review the staged change set of six units.", APPROVE);
const LENS = agentOf("lens", "stamity-security", "Security specialist lens", "Review the diff for security.", freeTextReturn([SEED_FINDING], "request-changes"));
const FIXER = agentOf("fix1", "stamity-fixer", "Fixer round 1", "Fix the round-1 findings.", "status: DONE");
const ROUND_2 = agentOf("r2", "stamity-reviewer", "Review round 2", "Re-review the round-1 fixes.", APPROVE);
const verdictsOf = (m: Measurement): Record<string, PassRow["verdict"]> => Object.fromEntries(m.passes.map((p) => [p.id, p.verdict]));
const everyPass = (verdict: PassRow["verdict"]): Record<string, PassRow["verdict"]> => Object.fromEntries(ALL_SIX.map((p) => [p, verdict]));

describe("R6 — the measurement reads coverageOf under v2 (review/167)", () => {
  it("(b) a feature-named capture: every pass reads approve-after-fixes over 2 rounds, and the lens's find counts in round 1 at the pass stage", async () => {
    const m = await featureRun([...BUILDERS, ROUND_1, LENS, FIXER, ROUND_2]);
    expect(m.invalid).toEqual([]);
    expect(verdictsOf(m)).toEqual(everyPass({ finalClass: "approve-after-fixes", rounds: 2, approvedWithSeedUnfixed: false }));
    expect(seedOf(m)).toEqual(expect.objectContaining({ present: true, found: true, foundRound1: true, stage: "pass" }));
  });

  it("(c) a finding by a verdict agent dispatched before the injection point credits nothing; the same finding at or after it credits the seed", async () => {
    const early = { ...LENS, description: "Security lens on the first units" };
    const before = await featureRun([...BUILDERS.slice(0, 5), early, BUILDERS[5]!, APPROVING_1]);
    expect(before.invalid).toEqual([]);
    expect(seedOf(before)).toEqual(expect.objectContaining({ present: true, found: false, foundRound1: false, stage: null }));
    expect(before.totals.recall).toEqual({ found: 0, denominator: 1, byClass: { security: { found: 0, denominator: 1 } } });
    const after = await featureRun([...BUILDERS, early, APPROVING_1]);
    expect(seedOf(after)).toEqual(expect.objectContaining({ present: true, found: true, foundRound1: true, stage: "pass" }));
  });

  it("(c) a report or ledger finding takes the agent whose digest names its report, and one no digest names credits only with no verdict agent before the injection point", async () => {
    const early = { ...LENS, description: "Security lens on the first units", result: digestReturn([SEED_FINDING], "request-changes", SEC_REPORT) };
    const reported = { ledger: ledgerRows([SEED_FINDING], SEC_REPORT), reports: { "u1-p1-security-r1.md": reportText([SEED_FINDING]) } };
    expect(seedOf(await featureRun([...BUILDERS.slice(0, 5), early, BUILDERS[5]!, APPROVING_1], reported)).found).toBe(false);
    expect(seedOf(await featureRun([...BUILDERS, early, APPROVING_1], reported)).found).toBe(true);
    // A ledger row naming no report no digest names: the verdict before the point withholds it; none before, and it credits.
    const quiet = { ...LENS, description: "Security lens on the first units", result: freeTextReturn([LOOSE_FINDING], "request-changes") };
    const orphan = { ledger: ledgerRows([SEED_FINDING]) };
    expect(seedOf(await featureRun([...BUILDERS.slice(0, 5), quiet, BUILDERS[5]!, APPROVING_1], orphan)).found).toBe(false);
    expect(seedOf(await featureRun([...BUILDERS, quiet, APPROVING_1], orphan)).found).toBe(true);
  });

  it("(review/15) a verdict agent built from its sub-agent file has no known dispatch line, so its finding credits nothing, even delivered after the injection point", async () => {
    const lost = { ...LENS, id: "tu_lost", agentId: "alost" };
    const tail = [mainLine.taskNotification({ taskId: "alost", toolUseId: "tu_lost", result: LENS.result })];
    const m = await featureRun([...BUILDERS, APPROVING_1], { tail, extraSubagents: [subagentOf(lost)] });
    expect(m.notes.join("\n")).toContain("agent alost built from its sub-agent file");
    expect(seedOf(m)).toEqual(expect.objectContaining({ present: true, found: false, stage: null }));
    // The same lens dispatched in the main transcript after the point credits the seed.
    expect(seedOf(await featureRun([...BUILDERS, APPROVING_1, LENS])).found).toBe(true);
  });

  it("a BLOCKED implementer still counts as built: the review after it is the injection point and credits the lens's find", async () => {
    const blocked = { ...BUILDERS[5]!, result: "status: BLOCKED_DEPENDENCY" };
    const m = await featureRun([...BUILDERS.slice(0, 5), blocked, APPROVING_1, LENS]);
    expect(seedOf(m)).toEqual(expect.objectContaining({ found: true, foundRound1: true, stage: "pass" }));
  });

  it("(g) v1 keeps its matcher key: a ledger row from a prefixed slug (lane-u1-p1) meets the union of every pass's copies", async () => {
    const lane = `.stamity/runs/${RUN}/reports/lane-u1-p1-reviewer-r1.md`;
    const snapshots = { "u1-p1": { main: { "src/orders/format.ts": FORMAT } }, "u1-p2": { main: { "src/store/query.ts": QUERY_AT(20) } } };
    const m = await measure(passCapture({ shape: "baseline", rows: [LOOSE_FINDING], endLedger: ledgerRows([{ ...SEED_FINDING, locator: "src/store/query.ts:20" }], lane), snapshots }).layout.runDir);
    expect(seedOf(m).found).toBe(true);
  });

  it("(d) a pass-less fixer dispatched before any review does not raise the round of the review or the lens after the builds", async () => {
    const lint = agentOf("lint", "stamity-fixer", "Scope lint away from generated hooks", "Scope lint away from generated hooks.", "status: DONE");
    const m = await featureRun([BUILDERS[0]!, lint, ...BUILDERS.slice(1), APPROVING_1, LENS]);
    expect(verdictsOf(m)).toEqual(everyPass({ finalClass: "approve", rounds: 1, approvedWithSeedUnfixed: false }));
    expect(seedOf(m)).toEqual(expect.objectContaining({ found: true, foundRound1: true, stage: "pass" }));
  });

  it("(e) a finding by a round whose prompt names one pass in passing matches the seed as every covered pass's copies locate it", async () => {
    // u1-p1's copy holds the seed at line 20, far outside the static span [11, 11]; u3-p1's copy holds no query.ts.
    const moved = { ...ROUND_1, result: freeTextReturn([{ ...SEED_FINDING, locator: "src/store/query.ts:20" }], "request-changes") };
    const m = await featureRun([...BUILDERS, moved, FIXER, ROUND_2], { snapshots: sixSnapshots({ "src/store/query.ts": QUERY_AT(20), "src/orders/format.ts": FORMAT }) });
    expect(m.invalid).toEqual([]);
    expect(seedOf(m)).toEqual(expect.objectContaining({ found: true, foundRound1: true, stage: "pass" }));
  });
});

describe("R6 — the credit guard reaches compaction loss and precision (review/14, review/16)", () => {
  /** passCapture under v2: its first review cites the seed; `builds` decides whether the injection point comes before it. */
  const guarded = (builds?: string): Promise<Measurement> =>
    measureRun(
      passCapture({ shape: "baseline", rows: [SEED_FINDING], preLedger: [], endLedger: [], oracle: "pass", run: { injection: injectionRecord(ALL_INJECTED) }, snapshots: INJECTING_SNAPSHOTS, ...(builds ? { builds } : {}) }).layout.runDir,
      { seeds: INJECTING, forbid: [] },
    ) as Promise<Measurement>;

  it("(review/14) an at-risk finding by an agent dispatched before the injection point never reads its seed as fixed, so with no row it is lost", async () => {
    expect((await guarded()).compactionSamples[0]).toEqual(expect.objectContaining({ atRisk: 1, lost: 1 }));
    expect((await guarded(ALL_BUILT)).compactionSamples[0]).toEqual(expect.objectContaining({ atRisk: 1, lost: 0 }));
  });

  it("(review/16) a finding before the injection point that meets only a seed's clean line counts unmatched for precision", async () => {
    expect((await guarded()).totals.unmatched).toBe(1);
    expect((await guarded(ALL_BUILT)).totals.unmatched).toBe(0);
  });
});

describe("R8 — branch level follows an approval (review/167)", () => {
  it("(review/21) a verdict agent built from its sub-agent file is never branch-level by position: delivered after a branch-level review, its characters stay in the loop", async () => {
    const deep = agentOf("deep", "stamity-reviewer", "Whole-branch deep review", "Review the whole branch.", APPROVE);
    const lost = { ...LENS, id: "tu_lost", agentId: "alost" };
    const tail = [mainLine.taskNotification({ taskId: "alost", toolUseId: "tu_lost", result: LENS.result })];
    const without = await featureRun([...BUILDERS, APPROVING_1, deep]);
    const m = await featureRun([...BUILDERS, APPROVING_1, deep], { tail, extraSubagents: [subagentOf(lost)] });
    expect(without.wholeBranch).toEqual({ finalClass: "approve", rounds: 1 });
    expect(m.notes.join("\n")).toContain("agent alost built from its sub-agent file");
    expect(m.totals.loopChars - without.totals.loopChars).toBeGreaterThanOrEqual(LENS.prompt.length + LENS.result.length);
  });

  it("(sweep) a fixer built from its sub-agent file counts as dispatched before every verdict agent sharing its passes, so it can only raise their round", async () => {
    const lostFixer = { ...FIXER, id: "tu_lostfix", agentId: "alostfix" };
    const tail = [mainLine.taskNotification({ taskId: "alostfix", toolUseId: "tu_lostfix", result: FIXER.result })];
    const plain = await featureRun([...BUILDERS, ROUND_1, LENS]);
    expect(seedOf(plain)).toEqual(expect.objectContaining({ found: true, foundRound1: true }));
    const m = await featureRun([...BUILDERS, ROUND_1, LENS], { tail, extraSubagents: [subagentOf(lostFixer)] });
    expect(m.notes.join("\n")).toContain("agent alostfix built from its sub-agent file");
    expect(seedOf(m)).toEqual(expect.objectContaining({ found: true, foundRound1: false }));
  });

  it("(review/20) an approval by a reviewer built from its sub-agent file does not make a later \"Whole-branch review round 1\" branch-level", async () => {
    // The review/15 fixture: the reviewer's dispatch is missing from the main transcript, so its line is its delivery's,
    // which lands after the injection point (the lens) though it may have been dispatched before it.
    const lost = agentOf("lost", "stamity-reviewer", "Plan review", "Review docs/plans/001-replay.md before the build.", APPROVE);
    const whole = agentOf("wb", "stamity-reviewer", "Whole-branch review round 1", "Review all six units.", APPROVE);
    const tail = [mainLine.taskNotification({ taskId: "alost", toolUseId: "tu_lost", result: APPROVE }), ...dispatch(whole)];
    const m = await featureRun([...BUILDERS, LENS], { tail, extraSubagents: [subagentOf(lost), subagentOf(whole)] });
    expect(m.notes.join("\n")).toContain("agent alost built from its sub-agent file");
    expect(m.wholeBranch).toEqual({ finalClass: null, rounds: 0 });
  });

  it("(review/13) an approving review before the injection point (a plan review) does not make a later \"Whole-branch review round 1\" branch-level", async () => {
    const planReview = agentOf("plan", "stamity-reviewer", "Plan review", "Review docs/plans/001-replay.md before the build.", APPROVE);
    const whole = agentOf("wb", "stamity-reviewer", "Whole-branch review round 1", "Review all six units.", APPROVE);
    const m = await featureRun([planReview, ...BUILDERS, whole]);
    expect(verdictsOf(m)).toEqual(everyPass({ finalClass: "approve", rounds: 1, approvedWithSeedUnfixed: false }));
    expect(m.wholeBranch).toEqual({ finalClass: null, rounds: 0 });
  });

  it("(f) \"Whole-branch review round 1\" with no earlier approving round is pass-level: its verdict counts for six passes and its characters count in the loop", async () => {
    const whole = agentOf("wb", "stamity-reviewer", "Whole-branch review round 1", "Review all six units. D8 removes u3-p1's `file` query; u3-p2 answers 400.", APPROVE);
    const v2 = await featureRun([...BUILDERS, whole]);
    expect(verdictsOf(v2)).toEqual(everyPass({ finalClass: "approve", rounds: 1, approvedWithSeedUnfixed: false }));
    expect(v2.wholeBranch).toEqual({ finalClass: null, rounds: 0 });
    // v1 keeps its reading of the same capture: branch-level, out of the loop figure.
    const v1 = await measure(featureCapture([...BUILDERS, whole]).layout.runDir);
    expect(v1.wholeBranch).toEqual({ finalClass: "approve", rounds: 1 });
    expect(v2.totals.loopChars - v1.totals.loopChars).toBeGreaterThan(whole.prompt.length + APPROVE.length);
  });

  it("(review/30) after an approval, a re-review whose prompt alone mentions the whole-branch review stays pass-level; one whose description names it is branch-level", async () => {
    const rereview = agentOf("r2", "stamity-reviewer", "Review round 2", "Re-review the round-1 fixes; the whole-branch review follows this round.", APPROVE);
    const without = await featureRun([...BUILDERS, APPROVING_1]);
    const m = await featureRun([...BUILDERS, APPROVING_1, rereview]);
    expect(verdictsOf(m)).toEqual(everyPass({ finalClass: "approve-after-fixes", rounds: 2, approvedWithSeedUnfixed: false }));
    expect(m.wholeBranch).toEqual({ finalClass: null, rounds: 0 });
    expect(m.totals.loopChars - without.totals.loopChars).toBeGreaterThanOrEqual(rereview.prompt.length + APPROVE.length);
    const deep = agentOf("deep", "stamity-reviewer", "Whole-branch deep review", "Review the branch as one change set.", APPROVE);
    const n = await featureRun([...BUILDERS, APPROVING_1, deep]);
    expect(verdictsOf(n)).toEqual(everyPass({ finalClass: "approve", rounds: 1, approvedWithSeedUnfixed: false }));
    expect(n.wholeBranch).toEqual({ finalClass: "approve", rounds: 1 });
    expect(n.totals.loopChars).toBe(without.totals.loopChars);
  });

  it("(f) a whole-branch review after an approving round is branch-level, and so is every verdict agent dispatched after it", async () => {
    const deep = agentOf("deep", "stamity-reviewer", "Whole-branch deep review", "Review the whole branch.", freeTextReturn([LOOSE_FINDING], "request-changes"));
    const late = { ...LENS, id: "tu_late", agentId: "alate", description: "Security lens" };
    const m = await featureRun([...BUILDERS, APPROVING_1, deep, late]);
    expect(m.invalid).toEqual([]);
    expect(verdictsOf(m)).toEqual(everyPass({ finalClass: "approve", rounds: 1, approvedWithSeedUnfixed: false }));
    expect(m.wholeBranch).toEqual({ finalClass: "blocked", rounds: 1 });
    expect(seedOf(m)).toEqual(expect.objectContaining({ found: true, foundRound1: false, stage: "branch" }));
  });
});

// ---------- REPLAY-v3: the seeds arrive in the units' own patches, one pass at a time (plan 012 v3-measure) ----------

const cover3 = (events: CoverageEvent[]): Map<string, Coverage> => coverageOf(events, ALL_SIX, { rule: "v3" }) as Map<string, Coverage>;
const at3 = (events: CoverageEvent[]): Record<string, string[]> => Object.fromEntries([...cover3(events)].map(([id, c]) => [id, c.passes]));

describe("REPLAY-v3 — coverageOf: swapped at the build dispatch, built at the builder's stop", () => {
  const builds = [sent("b1", "build", "Build unit u1-p1"), sent("b2", "build", "Build unit u1-p2")];

  it("(a) once both builders stop, a verdict naming no pass and one naming the whole range cover exactly those two; before any stop nothing; while u1-p2's builder runs, u1-p1 only", () => {
    const events = [...builds, back("b1"), sent("mid", "verdict", "Review round 1"), back("b2"), sent("r", "verdict", "Review round 2"), sent("range", "verdict", "Review u1-p1..u3-p2"), sent("u31", "verdict", "Review u3-p1")];
    expect(at3(events)).toEqual({ b1: ["u1-p1"], b2: ["u1-p2"], mid: ["u1-p1"], r: ["u1-p1", "u1-p2"], range: ["u1-p1", "u1-p2"], u31: [] });
    expect(at3([...builds, sent("early", "verdict", "Review round 1")])["early"]).toEqual([]);
    expect([...cover3(events).values()].some((c) => c.injectionPoint)).toBe(false);
    // v2's table is unchanged, by default and by name.
    expect(pointsOf(CANARY_3)).toEqual(["r1"]);
    expect(coverageOf(CANARY_3, ALL_SIX, { rule: "v2" })).toEqual(coverOf(CANARY_3));
  });

  it("a range builds every pass in it, a TaskStop builds, a second stop builds nothing new, fixers read as under v2, and every row is causal", () => {
    const events = [
      sent("all", "build", "Build units u1-p1..u1-p2"), sent("b3", "build", "Build unit u2-p1"), back("b3", false), back("all"), back("all"),
      sent("r", "verdict", "Review round 1"), back("r"), sent("f", "fix", "Fixer round 1"), sent("f2", "fix", "Fix u2-p1"),
    ];
    const whole = at3(events);
    expect(whole).toEqual({ all: ["u1-p1", "u1-p2"], b3: ["u2-p1"], r: ["u1-p1", "u1-p2", "u2-p1"], f: ["u1-p1", "u1-p2", "u2-p1"], f2: ["u2-p1"] });
    for (let k = 0; k <= events.length; k++) for (const [id, passes] of Object.entries(at3(events.slice(0, k)))) expect([k, id, passes]).toEqual([k, id, whole[id]]);
  });

  it("a pass is built at the stop of the builder whose dispatch swapped it: a repeat dispatch naming it neither swaps nor builds it", () => {
    const events = [sent("b1", "build", "Build unit u1-p1"), sent("again", "build", "Build unit u1-p1"), back("again"), sent("r1", "verdict", "Review round 1"), back("b1"), sent("r2", "verdict", "Review round 2")];
    expect(at3(events)).toEqual({ b1: ["u1-p1"], again: ["u1-p1"], r1: [], r2: ["u1-p1"] });
    // Both rows still name the pass in `built`, so the driver's hook records the repeat.
    expect([cover3(events).get("b1")!.built, cover3(events).get("again")!.built]).toEqual([["u1-p1"], ["u1-p1"]]);
  });
});

const HEX = (c: string): string => c.repeat(64);
const INVOICE_SEEDED = '  if (error.code === "EACCES") return notFound(res);';
const API_SEEDED = "| id | total | status |";
const U1P1_SEED = { ...SEEDS.seeds[0]!, injection: INJECTION };
const U3P1_SEED = {
  id: "cor-invoice-eacces", class: "correctness", severity: "Warning", pass: "u3-p1", file: "src/orders/invoice.ts", locate: { text: "EACCES", from: 0, to: 0 },
  present: { contains: '"EACCES") return notFound' }, span: [7, 7], terms: ["EACCES", "unreadable", "500"],
  injection: { file: "src/orders/invoice.ts", find: "return serverError(res)", replace: "return notFound(res)" }, oracle: { kind: "vitest", file: "test/__oracle__/cor-invoice-eacces.test.ts" },
};
const U3P2_SEED = {
  id: "con-export-doc-header", class: "contract", severity: "Warning", pass: "u3-p2", file: "docs/api.md", locate: { text: API_SEEDED, from: 0, to: 0 },
  present: { contains: API_SEEDED }, span: [3, 3], terms: ["total_cents", "header"], injection: { file: "docs/api.md", find: "| id | total_cents | status |", replace: API_SEEDED }, oracle: { kind: "static" },
};
/** A v3 seeds document (S1): `arrival: "patch"` beside each pass's clean and seeded digests. */
const seedsV3 = (seeds: unknown[] = [U1P1_SEED, U3P1_SEED]): Record<string, unknown> => ({
  ...SEEDS, arrival: "patch", patches: Object.fromEntries(ALL_SIX.map((p) => [p, { clean: HEX("a"), seeded: HEX("b") }])), seeds,
});
/** `run.json`'s v3 `injection` (S2): one entry per pass, naming the build dispatch whose hook call swapped it. */
const swapRecord = (swaps: Record<string, string>, over: Record<string, Record<string, unknown>> = {}): Record<string, unknown> => ({
  arrival: "patch", partial: false,
  passes: Object.fromEntries(Object.entries(swaps).map(([pass, toolUseId]) => [pass, { pass, at: "2026-09-29T10:00:00.000Z", toolUseId, state: "swapped", clean: HEX("a"), seeded: HEX("b"), mtimeKept: true, seeds: [], ...over[pass] }])),
});
const INVOICE_FINDING: Row = { id: "W-3", severity: "Warning", locator: "src/orders/invoice.ts:7", summary: "an unreadable invoice (EACCES) answers 404 where the contract asks for 500" };
const REVIEW_START = { "u1-p1": SNAPSHOT_U1P1, "u1-p2": { main: { "src/orders/format.ts": FORMAT } }, "u3-p1": { main: { "src/orders/invoice.ts": fileWith(7, INVOICE_SEEDED) } } };
const [B11, B12, B31, B32] = ["u1-p1", "u1-p2", "u3-p1", "u3-p2"].map(builderOf) as [AgentSpec, AgentSpec, AgentSpec, AgentSpec];
const REVIEW = agentOf("rv", "stamity-reviewer", "Review round 1", "Review the change set.", APPROVE);
const BOTH_LENS = agentOf("both", "stamity-security", "Security lens", "Review the diff for security.", freeTextReturn([SEED_FINDING, INVOICE_FINDING], "request-changes"));
const REVERTED_U1P1 = { "src/store/query.ts": REVERTED_QUERY, "src/orders/format.ts": FORMAT };

/** `captures/build-end/` (S3): one index row and one copy per build end, in order, each stamped after every swap here. */
function buildEnds(...ends: [AgentSpec, string[], Record<string, string>][]): NonNullable<CaptureSpec["buildEnd"]> {
  const rows = ends.map(([a, passes], k) => ({ at: `2026-09-29T10:${10 + k}:00.000Z`, agentId: a.agentId, dispatch: a.id, passes, dir: `20260929T10${10 + k}00Z-${a.agentId}` }));
  return { rows, copies: Object.fromEntries(ends.map(([, , files], k) => [rows[k]!.dir, { main: files }])) };
}

interface V3Options {
  seeds?: Record<string, unknown>;
  /** `null` writes no record at all. */
  record?: Record<string, unknown> | null;
  snapshots?: CaptureSpec["snapshots"];
  reviewSnapshots?: CaptureSpec["reviewSnapshots"];
  buildEnd?: CaptureSpec["buildEnd"];
  swaps?: CaptureSpec["swaps"];
  ledger?: Record<string, unknown>[];
  subagents?: SubagentFile[];
  forbid?: string[];
}

/** A v3 run whose main transcript is `lines`, with `agents`' sub-agent files; no line names a path of the harness. */
function v3Run(lines: string[], agents: AgentSpec[], o: V3Options = {}): Promise<Measurement> {
  const layout = writeCapture(scratch(), {
    run: { runId: "2026-09-29-replay-1", shape: "baseline", kind: "scored", client: { version: "2.1.280" }, ...(o.record === null ? {} : { injection: o.record ?? swapRecord({ "u1-p1": B11.id, "u3-p1": B31.id }) }) },
    stdout: [JSON.stringify({ type: "system", subtype: "init", ...INIT_PINNED, cwd: "/fixture" })],
    transcript: [mainLine.userText("/st-work docs/plans/001-replay.md --effort deep"), ...lines],
    subagents: [...agents.map(subagentOf), ...(o.subagents ?? [])],
    snapshots: o.snapshots ?? REVIEW_START,
    ...(o.reviewSnapshots ? { reviewSnapshots: o.reviewSnapshots } : {}),
    ...(o.buildEnd ? { buildEnd: o.buildEnd } : {}),
    ...(o.swaps ? { swaps: o.swaps } : {}),
    state: { end: { runId: RUN, ledger: o.ledger ?? [] } },
  });
  return measureRun(layout.runDir, { seeds: o.seeds ?? seedsV3(), forbid: o.forbid ?? [] }) as Promise<Measurement>;
}
/** Each agent dispatched and delivered before the next is dispatched. */
const inOrder = (...agents: AgentSpec[]): [string[], AgentSpec[]] => [agents.flatMap(dispatch), agents];

describe("REPLAY-v3 — the seeds document's arrival (S1) and the version switch", () => {
  it("accepts arrival \"patch\" with each pass's two digests; only a v3 measurement records a version", async () => {
    expect(() => checkSeeds(seedsV3())).not.toThrow();
    const v1 = await measure(passCapture({ shape: "baseline" }).layout.runDir);
    const v2 = await featureRun([...BUILDERS, APPROVING_1]);
    expect(["version" in v1, "version" in v2]).toEqual([false, false]);
    expect((await v3Run(...inOrder(B11, B31, REVIEW))).version).toBe("v3");
  });

  it.each<[string, Record<string, unknown>, RegExp]>([
    ["an arrival with no patches", { ...seedsV3(), patches: undefined }, /seeds: arrival and patches come together/],
    ["patches with no arrival", { ...seedsV3(), arrival: undefined }, /seeds: arrival and patches come together/],
    ["another arrival", { ...seedsV3(), arrival: "late" }, /seeds: arrival "late" is not "patch"/],
    ["patches that are no object", { ...seedsV3(), patches: [] }, /seeds: patches is not an object/],
    ["patches keyed by no pass", { ...seedsV3(), patches: { u9: { clean: HEX("a"), seeded: HEX("b") } } }, /seeds: patches\.u9 names no pass/],
    ["a digest that is no sha256", { ...seedsV3(), patches: { "u1-p1": { clean: "a", seeded: HEX("b") } } }, /seeds: patches\.u1-p1 is not \{ clean, seeded \} sha256 digests/],
  ])("refuses %s", (_label, seeds, reason) => {
    expect(() => checkSeeds(seeds)).toThrow(reason);
  });
});

describe("REPLAY-v3 — the per-pass credit guard (criterion 38)", () => {
  it("(b) a lens dispatched between u1-p1's and u3-p1's swaps, citing both seeds, credits the u1-p1 seed only; the same lens after u3-p1's swap credits both", async () => {
    const m = await v3Run(...inOrder(B11, BOTH_LENS, B31, REVIEW));
    expect(m.invalid).toEqual([]);
    expect([rowOf(m, "sec-sql-sort"), rowOf(m, "cor-invoice-eacces")]).toEqual([expect.objectContaining({ present: true, found: true }), expect.objectContaining({ present: true, found: false })]);
    expect(m.totals.recall).toEqual({ found: 1, denominator: 2, byClass: { security: { found: 1, denominator: 1 }, correctness: { found: 0, denominator: 1 } } });
    const after = await v3Run(...inOrder(B11, B31, BOTH_LENS, REVIEW));
    expect([rowOf(after, "sec-sql-sort").found, rowOf(after, "cor-invoice-eacces").found]).toEqual([true, true]);
  });

  it("the swap line is the dispatch the record names, else the first build dispatch naming the pass; a record entry with no tool_use id reads captures/swaps/", async () => {
    // Amendment 2: the swap line decides only a finding no digest names, so the finding here is a ledger row.
    const again = { ...B31, id: "tu_again", agentId: "aagain" };
    const quiet = agentOf("quiet", "stamity-security", "Security lens", "Review the diff for security.", APPROVE);
    const [lines, agents] = inOrder(B11, B31, quiet, again, REVIEW);
    const ledger = ledgerRows([INVOICE_FINDING]);
    const credited = async (record: Record<string, unknown>, swaps?: CaptureSpec["swaps"]): Promise<boolean> => rowOf(await v3Run(lines, agents, { record, ledger, ...(swaps ? { swaps } : {}) }), "cor-invoice-eacces").found;
    expect(await credited(swapRecord({ "u1-p1": B11.id, "u3-p1": again.id }))).toBe(false);
    expect(await credited(swapRecord({ "u1-p1": B11.id, "u3-p1": "tu_gone" }))).toBe(true);
    expect(await credited(swapRecord({ "u1-p1": B11.id, "u3-p1": "" }, { "u3-p1": { toolUseId: undefined } }), { "u3-p1": { pass: "u3-p1", toolUseId: again.id } })).toBe(false);
  });

  it("(38, amendment 3) a lens dispatched after u3-p1's swap that covers only u1-p1 credits no u3-p1 seed; the same finding from a lens covering u3-p1 credits it", async () => {
    const lensOn = (pass: string): AgentSpec => agentOf(`on${pass.replace("-", "")}`, "stamity-security", `Security lens ${pass}`, `Review unit ${pass} for security.`, freeTextReturn([INVOICE_FINDING], "request-changes"));
    const other = await v3Run(...inOrder(B11, B31, lensOn("u1-p1"), REVIEW));
    expect(other.invalid).toEqual([]);
    expect(rowOf(other, "cor-invoice-eacces")).toEqual(expect.objectContaining({ present: true, found: false }));
    expect(rowOf(await v3Run(...inOrder(B11, B31, lensOn("u3-p1"), REVIEW)), "cor-invoice-eacces").found).toBe(true);
  });

  it("(§9) a finding matches only the spans located in the copies of the passes its agent covers, and one of an agent covering nothing matches no span", async () => {
    const at = (line: number): Row => ({ ...INVOICE_FINDING, locator: `src/orders/invoice.ts:${line}` });
    const pair = (row: Row): AgentSpec => agentOf("pair", "stamity-reviewer", "Review u1-p1 and u3-p1", "Review units u1-p1 and u3-p1.", freeTextReturn([row], "request-changes"));
    // u1-p2's copy, which the pair does not cover, holds the seeded line at 20; u3-p1's holds it at 7.
    const snapshots = { ...REVIEW_START, "u1-p2": { main: { "src/orders/format.ts": FORMAT, "src/orders/invoice.ts": fileWith(20, INVOICE_SEEDED) } } };
    const elsewhere = await v3Run(...inOrder(B11, B31, pair(at(20))), { snapshots });
    expect(elsewhere.invalid).toEqual([]);
    expect(rowOf(elsewhere, "cor-invoice-eacces").found).toBe(false);
    expect(rowOf(await v3Run(...inOrder(B11, B31, pair(at(7))), { snapshots }), "cor-invoice-eacces").found).toBe(true);
    // A plan review before any build covers nothing: its term-less finding at the seed's line enters no adjudication row.
    const plan = agentOf("plan", "stamity-reviewer", "Review the plan", "Review the plan.", freeTextReturn([{ ...SEED_FINDING, summary: "this line is long" }], "request-changes"));
    const early = await v3Run(...inOrder(plan, B11, B31, REVIEW));
    expect(early.adjudication.map((a) => a.item)).not.toContain("sec-sql-sort");
    const covering = agentOf("cov", "stamity-reviewer", "Review u1-p1", "Review unit u1-p1.", freeTextReturn([{ ...SEED_FINDING, summary: "this line is long" }], "request-changes"));
    expect((await v3Run(...inOrder(B11, B31, covering))).adjudication.map((a) => a.item)).toContain("sec-sql-sort");
  });

  it("a ledger row no digest names credits a seed of P only when no verdict agent was dispatched before P's swap", async () => {
    const ledger = ledgerRows([INVOICE_FINDING]);
    const early = agentOf("early", "stamity-reviewer", "Review u1-p1", "Review unit u1-p1.", APPROVE);
    expect(rowOf(await v3Run(...inOrder(B11, early, B31, REVIEW), { ledger }), "cor-invoice-eacces").found).toBe(false);
    expect(rowOf(await v3Run(...inOrder(B11, B31, REVIEW), { ledger }), "cor-invoice-eacces").found).toBe(true);
  });
});

describe("REPLAY-v3 — every arrival state (criterion 39)", () => {
  const ONE = seedsV3([U1P1_SEED]);
  const ONE_SWAP = swapRecord({ "u1-p1": B11.id });

  it("(c) a seed absent from every review-start copy while a copy holds its file leaves the denominator and holds security-seeds; its note names the build end it went at", async () => {
    const never = await v3Run(...inOrder(B11, REVIEW), { seeds: ONE, record: ONE_SWAP, snapshots: { "u1-p1": { main: REVERTED_U1P1 } }, buildEnd: buildEnds([B11, ["u1-p1"], REVERTED_U1P1]) });
    expect(never.invalid).toEqual([]);
    expect(rowOf(never, "sec-sql-sort")).toEqual(expect.objectContaining({ present: false, caughtByImplementer: true, found: false }));
    expect(securityHeld(rowOf(never, "sec-sql-sort"))).toBe(true);
    expect(never.totals.recall.denominator).toBe(0);
    expect(noteOf(never, "sec-sql-sort")).toMatch(/: was not delivered — .*abuildu1p1 \("Build unit u1-p1"\)/);
    const went = await v3Run(...inOrder(B11, B12, REVIEW), {
      seeds: ONE, record: ONE_SWAP, snapshots: { ...REVIEW_START, "u1-p1": { main: REVERTED_U1P1 } }, buildEnd: buildEnds([B11, ["u1-p1"], SNAPSHOT_U1P1.main], [B12, ["u1-p2"], REVERTED_U1P1]),
    });
    expect(went.invalid).toEqual([]);
    expect(rowOf(went, "sec-sql-sort")).toEqual(expect.objectContaining({ present: false, caughtByImplementer: true, found: false }));
    expect(noteOf(went, "sec-sql-sort")).toMatch(/: caught before review — .*abuildu1p1 \("Build unit u1-p1"\).*abuildu1p2 \("Build unit u1-p2"\)/);
    // A build-end copy that lacks the seed's file says nothing of the seed: the interval ends at the first copy without the seed.
    const skipped = await v3Run(...inOrder(B11, B12, B31, REVIEW), {
      seeds: ONE, record: ONE_SWAP, snapshots: { ...REVIEW_START, "u1-p1": { main: REVERTED_U1P1 } },
      buildEnd: buildEnds([B11, ["u1-p1"], SNAPSHOT_U1P1.main], [B12, ["u1-p2"], { "src/orders/format.ts": FORMAT }], [B31, ["u3-p1"], REVERTED_U1P1]),
    });
    expect(skipped.invalid).toEqual([]);
    expect(noteOf(skipped, "sec-sql-sort")).toMatch(/: caught before review — .*between the build end of abuildu1p1 \("Build unit u1-p1"\) and the build end of abuildu3p1 \("Build unit u3-p1"\)/);
  });

  it("(d) a pass with no swap record makes the run invalid under UNCOVERED_REASON; its seed is never found, and a finding at its clean line credits nothing and enters no adjudication", async () => {
    const seeds = seedsV3([U1P1_SEED, U3P2_SEED]);
    const rows: Row[] = [{ id: "W-4", severity: "Warning", locator: "docs/api.md:3", summary: "the header names total where the code writes total_cents" }, { id: "W-5", severity: "Warning", locator: "docs/api.md:5", summary: "the table reads out of order" }];
    const api = agentOf("api", "stamity-reviewer", "Review round 1", "Review the change set.", freeTextReturn(rows, "request-changes"));
    const m = await v3Run(...inOrder(B11, api), { seeds, record: ONE_SWAP });
    expect(m.invalid).toEqual(["uncovered pass u3-p2: no build dispatch named it, so its patch was never swapped and its seeds (con-export-doc-header) never arrived"]);
    expect(rowOf(m, "con-export-doc-header")).toEqual(expect.objectContaining(UNCOVERED_ROW));
    expect(m.adjudication.map((a) => a.item)).not.toContain("con-export-doc-header");
    expect(noteOf(m, "con-export-doc-header")).toContain(": uncovered — no swap record for its pass");
    // Swapped, built and reviewed, the same review credits the seed and lists its term-less neighbour for adjudication.
    const covered = await v3Run(...inOrder(B11, B32, api), { seeds, record: swapRecord({ "u1-p1": B11.id, "u3-p2": B32.id }), snapshots: { ...REVIEW_START, "u3-p2": { main: { "docs/api.md": fileWith(3, API_SEEDED) } } } });
    expect(covered.invalid).toEqual([]);
    expect(rowOf(covered, "con-export-doc-header")).toEqual(expect.objectContaining({ present: true, found: true }));
    expect(covered.adjudication.map((a) => a.item)).toContain("con-export-doc-header");
  });

  it("(e) a swapped pass no review covered reads presence from its last build end: a present seed is a miss even when cited, and the pass's verdict class is null", async () => {
    const late = agentOf("late", "stamity-reviewer", "Review u1-p1", "Review unit u1-p1.", freeTextReturn([INVOICE_FINDING], "request-changes"));
    const m = await v3Run(...inOrder(B11, B31, late), {
      snapshots: { "u1-p1": SNAPSHOT_U1P1 }, buildEnd: buildEnds([B11, ["u1-p1"], SNAPSHOT_U1P1.main], [B31, ["u3-p1"], REVIEW_START["u3-p1"].main]),
    });
    expect(m.invalid).toEqual([]);
    expect(rowOf(m, "cor-invoice-eacces")).toEqual(expect.objectContaining({ present: true, caughtByImplementer: false, found: false }));
    expect(passOf(m, "u3-p1").verdict.finalClass).toBeNull();
    expect(m.totals.recall).toEqual(expect.objectContaining({ found: 0, denominator: 2 }));
    expect(noteOf(m, "cor-invoice-eacces")).toMatch(/: was never reviewed — .*abuildu3p1 \("Build unit u3-p1"\)/);
  });

  it("(e, review/11) a pass no review covered reads presence from the last build-end copy of any agent taken after it was built: a later builder that removed the seed makes it caught before review", async () => {
    const late = agentOf("late", "stamity-reviewer", "Review u1-p1", "Review unit u1-p1.", APPROVE);
    const invoiceClean = { "src/orders/invoice.ts": fileWith(7, "  if (error.code === \"EACCES\") return serverError(res);") };
    const m = await v3Run(...inOrder(B11, B31, B12, late), {
      snapshots: { "u1-p1": SNAPSHOT_U1P1 },
      buildEnd: buildEnds([B11, ["u1-p1"], SNAPSHOT_U1P1.main], [B31, ["u3-p1"], REVIEW_START["u3-p1"].main], [B12, ["u1-p2"], invoiceClean]),
    });
    expect(m.invalid).toEqual([]);
    expect(rowOf(m, "cor-invoice-eacces")).toEqual(expect.objectContaining({ present: false, caughtByImplementer: true, found: false }));
    expect(passOf(m, "u3-p1").verdict.finalClass).toBeNull();
    expect(noteOf(m, "cor-invoice-eacces")).toMatch(/: caught before review — absent from the last build-end copy taken after the pass was built, abuildu1p2 \("Build unit u1-p2"\)'s, as the pass was never reviewed; it went between the build end of abuildu3p1 \("Build unit u3-p1"\) and the build end of abuildu1p2/);
    // A build of the pass alone: the copy at the stop that built it is the one read.
    const own = await v3Run(...inOrder(B11, B31, late), { snapshots: { "u1-p1": SNAPSHOT_U1P1 }, buildEnd: buildEnds([B11, ["u1-p1"], SNAPSHOT_U1P1.main], [B31, ["u3-p1"], invoiceClean]) });
    expect(rowOf(own, "cor-invoice-eacces")).toEqual(expect.objectContaining({ present: false, caughtByImplementer: true }));
    expect(noteOf(own, "cor-invoice-eacces")).toMatch(/: was not delivered — absent from the last build-end copy taken after the pass was built, abuildu3p1 \("Build unit u3-p1"\)'s, as the pass was never reviewed/);
  });

  it("(e, review/17) a pass no review covered whose last build-end copy lacks the seed's file reads back to the last copy after its swap that holds the file; with none, a capture defect", async () => {
    const late = agentOf("late", "stamity-reviewer", "Review u1-p1", "Review unit u1-p1.", APPROVE);
    const noInvoice = { "src/orders/format.ts": FORMAT };
    const m = await v3Run(...inOrder(B11, B31, B12, late), {
      snapshots: { "u1-p1": SNAPSHOT_U1P1 },
      buildEnd: buildEnds([B11, ["u1-p1"], SNAPSHOT_U1P1.main], [B31, ["u3-p1"], REVIEW_START["u3-p1"].main], [B12, ["u1-p2"], noInvoice]),
    });
    expect(m.invalid).toEqual([]);
    expect(rowOf(m, "cor-invoice-eacces")).toEqual(expect.objectContaining({ present: true, caughtByImplementer: false, found: false }));
    expect(noteOf(m, "cor-invoice-eacces")).toMatch(/: was never reviewed — .*abuildu3p1 \("Build unit u3-p1"\)'s; it stays/);
    const none = await v3Run(...inOrder(B11, B31, late), { snapshots: { "u1-p1": SNAPSHOT_U1P1 }, buildEnd: buildEnds([B11, ["u1-p1"], SNAPSHOT_U1P1.main], [B31, ["u3-p1"], noInvoice]) });
    expect(none.invalid).toEqual(["capture defect: seed cor-invoice-eacces (u3-p1): src/orders/invoice.ts is absent from every build-end copy after the pass's swap, and no review covered the pass"]);
  });

  it("(e, review/18) a pass is built at the stop of the build agent whose dispatch swapped it: a repeat dispatch's build end does not build it", async () => {
    const late = agentOf("late", "stamity-reviewer", "Review u1-p1", "Review unit u1-p1.", APPROVE);
    const again = { ...B31, id: "tu_again", agentId: "aagain" };
    const m = await v3Run(...inOrder(B11, B31, again, late), {
      snapshots: { "u1-p1": SNAPSHOT_U1P1 },
      buildEnd: buildEnds([B11, ["u1-p1"], SNAPSHOT_U1P1.main], [again, ["u3-p1"], REVIEW_START["u3-p1"].main]),
    });
    expect(rowOf(m, "cor-invoice-eacces")).toEqual(expect.objectContaining({ present: null, caughtByImplementer: false, found: false }));
    expect(noteOf(m, "cor-invoice-eacces")).toMatch(/: was never reviewed — .*no build-end copy of the build agent whose dispatch swapped it, a capture defect/);
    // The swapping build's own stop builds it, whichever build end comes first.
    const built = await v3Run(...inOrder(B11, B31, again, late), {
      snapshots: { "u1-p1": SNAPSHOT_U1P1 },
      buildEnd: buildEnds([B11, ["u1-p1"], SNAPSHOT_U1P1.main], [again, ["u3-p1"], REVIEW_START["u3-p1"].main], [B31, ["u3-p1"], REVIEW_START["u3-p1"].main]),
    });
    expect(rowOf(built, "cor-invoice-eacces")).toEqual(expect.objectContaining({ present: true, caughtByImplementer: false }));
  });

  it("(e, review/26) a swapped pass no review covered whose swapping build never stopped is a capture defect: no seed's presence is left open", async () => {
    const late = agentOf("late", "stamity-reviewer", "Review u1-p1", "Review unit u1-p1.", APPROVE);
    const defect = "capture defect: seed cor-invoice-eacces (u3-p1): the build agent whose dispatch swapped the pass left no build-end copy, and no review covered the pass, so its presence would be left open";
    const m = await v3Run(...inOrder(B11, B31, late), { snapshots: { "u1-p1": SNAPSHOT_U1P1 }, buildEnd: buildEnds([B11, ["u1-p1"], SNAPSHOT_U1P1.main]) });
    expect(m.invalid).toEqual([defect]);
    expect(rowOf(m, "cor-invoice-eacces")).toEqual(expect.objectContaining({ present: null, found: false }));
    // A repeat dispatch's build end does not build the pass (review/18), so the defect stands.
    const again = { ...B31, id: "tu_again", agentId: "aagain" };
    const repeat = await v3Run(...inOrder(B11, B31, again, late), { snapshots: { "u1-p1": SNAPSHOT_U1P1 }, buildEnd: buildEnds([B11, ["u1-p1"], SNAPSHOT_U1P1.main], [again, ["u3-p1"], REVIEW_START["u3-p1"].main]) });
    expect(repeat.invalid).toEqual([defect]);
    // A reviewed pass reads its review-start copies, so a swapping build that never stopped leaves nothing open there.
    const reviewed = await v3Run(...inOrder(B11, B31, REVIEW), { buildEnd: buildEnds([B11, ["u1-p1"], SNAPSHOT_U1P1.main]) });
    expect(reviewed.invalid).toEqual([]);
  });

  it("(f) a seed file absent from every review-start copy is a capture defect", async () => {
    const m = await v3Run(...inOrder(B11, REVIEW), { seeds: ONE, record: ONE_SWAP, snapshots: { "u1-p1": { main: { "src/orders/format.ts": FORMAT } } } });
    expect(m.invalid).toEqual(["capture defect: seed sec-sql-sort (u1-p1): src/store/query.ts is absent from every copy of the pass's review-start snapshot (captures/snapshots/u1-p1/)"]);
  });

  it.each<[string, Record<string, unknown> | null, string]>([
    ["no record", null, "run.json carries no swap record (injection), so no pass can be read as swapped: a REPLAY-v3 run is invalid without it"],
    ["a record whose passes is no object", { arrival: "patch", passes: 3 }, "run.json's swap record is malformed: passes is not an object"],
    ["a seeded digest other than seeds.patches", swapRecord({ "u1-p1": B11.id }, { "u1-p1": { seeded: HEX("c") } }), `swap defect: pass u1-p1's seeded digest ${HEX("c")} is not seeds.patches["u1-p1"].seeded`],
    ["mtimeKept false", swapRecord({ "u1-p1": B11.id }, { "u1-p1": { mtimeKept: false } }), "swap defect: pass u1-p1's mtime was not kept (mtimeKept is false)"],
    ["a patch modified before its swap", swapRecord({ "u1-p1": B11.id }, { "u1-p1": { state: "patch-modified" } }), 'swap defect: pass u1-p1 reads state "patch-modified", not swapped or already-seeded'],
  ])("(g) %s makes the run invalid, naming why", async (_label, record, reason) => {
    const m = await v3Run(...inOrder(B11, REVIEW), { seeds: ONE, record });
    expect(m.invalid).toEqual([reason]);
  });

  it("(h) a seed present at review start and gone from every round-completion copy, credited by no finding, is noted removed during review and stays a miss", async () => {
    const removed = { "u1-p1": { main: { "src/store/query.ts": REVERTED_QUERY } } };
    const m = await v3Run(...inOrder(B11, REVIEW), { seeds: ONE, record: ONE_SWAP, reviewSnapshots: removed });
    expect(m.invalid).toEqual([]);
    expect(rowOf(m, "sec-sql-sort")).toEqual(expect.objectContaining({ present: true, found: false }));
    expect(m.totals.recall).toEqual(expect.objectContaining({ found: 0, denominator: 1 }));
    expect(m.notes).toContainEqual(expect.stringMatching(/^seed sec-sql-sort \(u1-p1\): removed during review, uncredited — /));
    // Two lenses credit it: the earliest stage and a round-1 find are read over both.
    const credited = await v3Run(...inOrder(B11, LENS, BOTH_LENS), { seeds: ONE, record: ONE_SWAP, reviewSnapshots: removed });
    expect(rowOf(credited, "sec-sql-sort")).toEqual(expect.objectContaining({ found: true, foundRound1: true, stage: "pass" }));
    expect(credited.notes.join("\n")).not.toContain("removed during review");
  });
});

/** The client's change notice for a file whose mtime moved after a read: an `edited_text_file` attachment. */
function notice(filename: string): string {
  const o = JSON.parse(mainLine.attachment({ type: "edited_text_file", rendered: null })) as { attachment: Record<string, unknown> };
  Object.assign(o.attachment, { filename, snippet: "1\t+x" });
  return JSON.stringify(o);
}

describe("REPLAY-v3 — contamination (C5, C6)", () => {
  it("a tool input naming patches-seeded voids a v3 run (REPLAY-v3 §8) and no v1 or v2 run", async () => {
    const read = [mainLine.readToolUse({ id: "tu_peek", filePath: "/opt/data/patches-seeded/u1-p1.patch" }), mainLine.toolResult("tu_peek", "diff")];
    const [lines, agents] = inOrder(B11, B31, REVIEW);
    expect((await v3Run([...lines, ...read], agents)).invalid).toEqual([expect.stringMatching(/^forbidden patches-seeded in a Read input \(main transcript line \d+\)$/)]);
    expect((await measure(passCapture({ shape: "baseline", tail: read }).layout.runDir)).invalid).toEqual([]);
    expect((await featureRun([...BUILDERS, APPROVING_1], { tail: read })).invalid).toEqual([]);
  });

  const [lines, agents] = inOrder(B11, B31, REVIEW);
  const hook = "PreCompact [REPLAY_SEEDS=/x/seeds.json node hook.mjs] completed successfully";

  it("(i) C5: a notice for vendor/contrib/u2-p1.patch invalidates and one for src/store/query.ts does not; C6: a harness string in any main or sub-agent line invalidates, naming the file and line", async () => {
    expect((await v3Run([...lines, notice("/fx/vendor/contrib/u2-p1.patch")], agents)).invalid).toEqual([expect.stringMatching(/^contamination \(C5\): a change notice for vendor\/contrib\/u2-p1\.patch \(main transcript line \d+\)$/)]);
    expect((await v3Run([...lines, notice("/fx/src/store/query.ts")], agents)).invalid).toEqual([]);
    expect((await v3Run([...lines, mainLine.userText(hook)], agents)).invalid).toEqual([expect.stringMatching(/^contamination \(C6\): a harness string \(REPLAY_\) in main transcript line \d+$/)]);
    const researcher = subagentFile({ agentId: "aextra", agentType: "stamity-researcher", prompt: "Read the marker-hook log.", requests: [{ id: "msg_aextra", usage: { input: 1, output: 1 } }] });
    expect((await v3Run(lines, agents, { subagents: [researcher] })).invalid).toEqual(["contamination (C6): a harness string (marker-hook) in sub-agent aextra line 1"]);
    expect((await v3Run([...lines, mainLine.userText("see /opt/instrument/notes")], agents, { forbid: ["/opt/instrument"] })).invalid).toEqual([expect.stringMatching(/^contamination \(C6\): a harness string \(--forbid\[0\]\) in main transcript line \d+$/)]);
  });

  it("v1 and v2 never read C5 or C6", async () => {
    const tail = [notice("/fx/vendor/contrib/u2-p1.patch"), mainLine.userText(hook)];
    expect((await measure(passCapture({ shape: "baseline", tail }).layout.runDir)).invalid).toEqual([]);
    expect((await featureRun([...BUILDERS, APPROVING_1], { tail })).invalid).toEqual([]);
  });
});

// ---------- REPLAY-v3: the reader treats both shapes' findings alike (plan 012 v3-reader) ----------

/** One `run.json` injection record both versions read: v2's per-seed states beside v3's swap fields, one entry per pass. */
function twinRecord(passes: Record<string, string[]>): Record<string, unknown> {
  return {
    arrival: "patch", partial: false, unreadable: [], unfinished: [],
    passes: Object.fromEntries(Object.entries(passes).map(([pass, ids]) => [pass, {
      pass, at: "2026-09-29T10:00:00.000Z", toolUseId: `tu_build_${pass}`, state: "swapped", clean: HEX("a"), seeded: HEX("b"), mtimeKept: true, partial: false, snapshot: true,
      seeds: ids.map((id) => ({ id, file: "src/store/query.ts", state: INJECTED })),
    }])),
  };
}

type TwinSeed = Record<string, unknown> & { id: string };
interface TwinOptions {
  seeds?: TwinSeed[];
  record?: Record<string, string[]>;
  snapshots?: CaptureSpec["snapshots"];
  /** Dispatched and delivered before the six builds. */
  before?: AgentSpec[];
  /** The main transcript after the six builds; defaults to each agent dispatched and delivered in turn. */
  lines?: string[];
  ledger?: Record<string, unknown>[];
  flatLedger?: Record<string, unknown>[];
  reports?: Record<string, string>;
  /** A `compaction-1-pre` state copy, under its own run id when one is given. */
  pre?: { ledger?: Record<string, unknown>[]; reports?: Record<string, string>; runId?: string };
}

/**
 * One capture measured twice: under REPLAY-v2 (an injecting seeds document) and under REPLAY-v3 (the same seeds with
 * `arrival: "patch"`), so every case reads v2's reading and v3's side by side from the same inputs. Six builds come first,
 * then `agents`; every pass holds a review-start copy, and every seed's oracle fails unless a case says otherwise.
 */
async function twin(agents: AgentSpec[], o: TwinOptions = {}): Promise<[Measurement, Measurement]> {
  const seeds = o.seeds ?? [U1P1_SEED];
  const before = o.before ?? [];
  const layout = writeCapture(scratch(), {
    run: { runId: "2026-09-29-replay-1", shape: "baseline", kind: "scored", client: { version: "2.1.280" }, injection: twinRecord(o.record ?? { "u1-p1": seeds.map((s) => s.id) }) },
    stdout: [JSON.stringify({ type: "system", subtype: "init", ...INIT_PINNED, cwd: "/fixture" })],
    transcript: [mainLine.userText("/st-work docs/plans/001-replay.md --effort deep"), ...before.flatMap(dispatch), ...BUILDERS.flatMap(dispatch), ...(o.lines ?? agents.flatMap(dispatch))],
    subagents: [...before, ...BUILDERS, ...agents].map(subagentOf),
    snapshots: o.snapshots ?? sixSnapshots(),
    state: {
      ...(o.pre ? { "compaction-1-pre": { runId: o.pre.runId ?? RUN, ledger: o.pre.ledger ?? [], ...(o.pre.reports ? { reports: o.pre.reports } : {}) } } : {}),
      end: { runId: RUN, ledger: o.ledger ?? [], ...(o.flatLedger ? { flatLedger: o.flatLedger } : {}), ...(o.reports ? { reports: o.reports } : {}) },
    },
    oracle: { schema: "stamity/replay-oracle/v1", run: { status: "ok", detail: "" }, results: seeds.map((s) => ({ seed: s.id, kind: "vitest", status: "fail", detail: "" })) },
  });
  const read = (doc: Record<string, unknown>): Promise<Measurement> => measureRun(layout.runDir, { seeds: doc, forbid: [] }) as Promise<Measurement>;
  const [v2, v3] = [await read({ ...SEEDS, seeds }), await read(seedsV3(seeds))];
  expect([v2.invalid, v3.invalid, "version" in v2, v3.version]).toEqual([[], [], false, "v3"]);
  return [v2, v3];
}

const launchOf = (a: AgentSpec): string[] => dispatch(a).slice(0, 2);
const deliverOf = (a: AgentSpec): string[] => dispatch(a).slice(2);
/** A digest return (C4) whose `findings:` value holds `entries` verbatim. */
const digestOf = (entries: string[], report: string, verdict = "request-changes"): string =>
  ["status: DONE", `verdict: ${verdict}`, "confidence: high — read the diff", `report: ${report}`, "findings:", ...entries, "security: none", "contract delta: none"].join("\n");
const reviewerOf = (result: string, description = "Review round 1"): AgentSpec => agentOf("r1", "stamity-reviewer", description, "Review the change set.", result);
const found = (m: Measurement, id = "sec-sql-sort"): Pick<PassRow["seeds"][number], "found" | "stage" | "foundRound1"> => {
  const { found: f, stage, foundRound1 } = rowOf(m, id);
  return { found: f, stage, foundRound1 };
};
/** Each pass's final class and round count, in pass order. */
const classesOf = (m: Measurement): [string | null, number][] => m.passes.map((p) => [p.verdict.finalClass, p.verdict.rounds]);
const sixOf = (finalClass: string | null, rounds: number): [string | null, number][] => ALL_SIX.map(() => [finalClass, rounds]);
/** The no-verdict notes of a measurement's reviewer rounds. */
const noVerdict = (m: Measurement): number => m.notes.filter((n) => n.startsWith("reviewer round with no readable verdict")).length;
/** The first compaction sample's at-risk and lost counts and validity. */
const sample = (m: Measurement): [number, number, boolean] => [m.compactionSamples[0]!.atRisk, m.compactionSamples[0]!.lost, m.compactionSamples[0]!.valid];
const NOT_FOUND = { found: false, stage: null, foundRound1: false };
const AT_PASS = { found: true, stage: "pass", foundRound1: true };
const AT_BRANCH = { found: true, stage: "branch", foundRound1: false };
const BRANCH_REPORT = "branch-reviewer-r1.md";
const BRANCH_ROW: Row = { id: "C-1", severity: "Critical", locator: "src/store/query.ts:11", summary: "sort reaches ORDER BY by string concatenation" };

describe("REPLAY-v3 — a structured finding's secondary locators (prove/6)", () => {
  it("(p6-a) a digest entry at app.ts:30 whose summary names src/store/query.ts:11 credits the seed at the pass stage in round 1, and unmatched goes 1 → 0; v2 reads neither", async () => {
    const [v2, v3] = await twin([reviewerOf(digestOf(["C-1 src/http/app.ts:30 — sort flows into the query: src/store/query.ts:11 concatenates it into SQL"], REPORT_REL))]);
    expect([found(v2), v2.totals.unmatched]).toEqual([NOT_FOUND, 1]);
    expect([found(v3), v3.totals.unmatched]).toEqual([AT_PASS, 0]);
  });

  it("(p6-b) the same seed named by a bare file name only credits nothing in either reading", async () => {
    const [v2, v3] = await twin([reviewerOf(digestOf(["C-1 src/http/app.ts:30 — sort flows into the query: query.ts:11 concatenates it into SQL"], REPORT_REL))]);
    expect([found(v2), v2.totals.unmatched, found(v3), v3.totals.unmatched]).toEqual([NOT_FOUND, 1, NOT_FOUND, 1]);
  });

  it("(p6-c) a bare name in the digest and the full path in its report row credit, once the relative report path joins its report (J)", async () => {
    const reports = { [BRANCH_REPORT]: reportText([{ id: "C-1", severity: "Critical", locator: "src/http/app.ts:30", summary: "sort flows into the query: src/store/query.ts:11 concatenates it into SQL" }]) };
    const [v2, v3] = await twin([reviewerOf(digestOf(["C-1 src/http/app.ts:30 — sort flows into the query: query.ts:11 concatenates it into SQL"], `reports/${BRANCH_REPORT}`))], { reports });
    expect([found(v2), v2.totals.unmatched]).toEqual([NOT_FOUND, 1]);
    expect([found(v3), v3.totals.unmatched]).toEqual([AT_PASS, 0]);
  });

  it("(p6-d) an unmatched entry with two secondaries counts once, and a secondary on a decoy's line goes to adjudication as a free-text locator does", async () => {
    const [v2, v3] = await twin([reviewerOf(digestOf(["W-1 src/http/app.ts:30 — the handler logs the body; see src/orders/format.ts:5 and src/http/router.ts:9"], REPORT_REL))]);
    expect([v2.totals.unmatched, v2.adjudication]).toEqual([1, []]);
    expect([v3.totals.unmatched, v3.adjudication.map((a) => [a.item, a.locator])]).toEqual([1, [["dec-internal-rename", "src/orders/format.ts:5"]]]);
  });

  it("(p6-e, p6-f) a secondary on a decoy's line with a decoy term flags it as its free-text twin does, and the flagged entry is not unmatched", async () => {
    const summary = "the logger import from src/orders/format.ts:5 is a breaking rename for a consumer";
    const [v2, v3] = await twin([reviewerOf(digestOf([`W-1 src/http/app.ts:30 — ${summary}`], REPORT_REL))]);
    expect([v2.totals.decoyFalseFlags, v2.totals.unmatched]).toEqual([0, 1]);
    expect([v3.totals.decoyFalseFlags, v3.totals.unmatched]).toEqual([1, 0]);
    const [f2, f3] = await twin([reviewerOf(freeTextReturn([{ id: "W-1", severity: "Warning", locator: "src/http/app.ts:30", summary }], "request-changes"))]);
    expect([f2.totals.decoyFalseFlags, f2.totals.unmatched]).toEqual([1, 1]);
    expect([f3.totals.decoyFalseFlags, f3.totals.unmatched]).toEqual([1, 0]);
  });

  it("(p6-g) a free-text block that credits a seed through one locator and cites another is one entry, not unmatched", async () => {
    const [v2, v3] = await twin([reviewerOf(freeTextReturn([{ ...SEED_FINDING, summary: "sort concatenated into SQL; the route at src/http/app.ts:30 passes it through" }], "request-changes"))]);
    expect([found(v2), v2.totals.unmatched]).toEqual([AT_PASS, 1]);
    expect([found(v3), v3.totals.unmatched]).toEqual([AT_PASS, 0]);
  });

  it("an inline stamity-findings block in a return that names no report is one entry per row: its secondary credits, and the row is not unmatched", async () => {
    const inline = ["**Verdict:** request-changes", "", reportText([{ id: "C-1", severity: "Critical", locator: "src/http/app.ts:30", summary: "sort flows into src/store/query.ts:11 by concatenation" }])].join("\n");
    const [v2, v3] = await twin([reviewerOf(inline)]);
    expect([found(v2), v2.totals.unmatched]).toEqual([NOT_FOUND, 1]);
    expect([found(v3), v3.totals.unmatched]).toEqual([AT_PASS, 0]);
  });

  it("(p6-h) a summary repeating its own locator, or its path:line:col spelling, adds no finding in either reading", async () => {
    const [v2, v3] = await twin([reviewerOf(digestOf(["C-1 src/store/query.ts:11 — src/store/query.ts:11 concatenates sort; src/store/query.ts:11:5 too"], REPORT_REL))]);
    for (const m of [v2, v3]) expect([found(m), m.totals.unmatched, m.adjudication]).toEqual([AT_PASS, 0, []]);
  });

  it("(41a) `W-1 src/x.ts:40 — the assertion at test/x.test.ts:22 was loosened` credits the test-weakening seed once, is never at risk by its secondary, and a bare x.test.ts is no locator", async () => {
    const tw = {
      id: "tw-assert-loosen", class: "test-weakening", severity: "Warning", pass: "u1-p1", file: "test/x.test.ts", locate: { text: "toBeGreaterThan(0)", from: 0, to: 0 },
      present: { contains: "toBeGreaterThan(0)" }, span: [22, 22], terms: ["loosen", "weaken"], oracle: { kind: "static" },
      injection: { file: "test/x.test.ts", find: "toBe(3)", replace: "toBeGreaterThan(0)" },
    };
    const snapshots = sixSnapshots({ ...SNAPSHOT_U1P1.main, "test/x.test.ts": fileWith(22, "  expect(count).toBeGreaterThan(0);") });
    const loosened = reviewerOf(digestOf(["W-1 src/x.ts:40 — the assertion at test/x.test.ts:22 was loosened"], REPORT_REL));
    const compacted = { lines: [...dispatch(loosened), mainLine.compactBoundary({ trigger: "manual", preTokens: 120_000 })], pre: {} };
    const [v2, v3] = await twin([loosened], { seeds: [tw], snapshots, ...compacted });
    expect([found(v2, tw.id), v2.totals.unmatched, v2.compactionSamples[0]?.atRisk]).toEqual([NOT_FOUND, 1, 1]);
    expect([found(v3, tw.id), v3.totals.unmatched, v3.compactionSamples[0]?.atRisk]).toEqual([AT_PASS, 0, 1]);
    // A pre-compaction row on the entry's own locator leaves nothing at risk: its secondary is never at risk on its own.
    const [, covered] = await twin([loosened], { seeds: [tw], snapshots, ...compacted, pre: { ledger: [{ id: `${RUN}/prove/1`, phase: "prove", source: "reviewer", severity: "Warning", evidence: "src/x.ts:40 — the assertion was loosened", state: "open", rationale: "" }] } });
    expect(covered.compactionSamples[0]).toEqual(expect.objectContaining({ atRisk: 0, valid: false }));
    const [, bare] = await twin([reviewerOf(digestOf(["W-1 src/x.ts:40 — the assertion at x.test.ts:22 was loosened"], REPORT_REL))], { seeds: [tw], snapshots });
    expect([found(bare, tw.id), bare.totals.unmatched]).toEqual([NOT_FOUND, 1]);
  });
});

describe("REPLAY-v3 — branch level (prove/7)", () => {
  const whole = (result = freeTextReturn([LOOSE_FINDING], "request-changes"), description = "Whole-branch review"): AgentSpec => agentOf("wb", "stamity-reviewer", description, "Review the whole branch.", result);
  const delta = agentOf("r3", "stamity-reviewer", "Review round 3 delta", "Re-review the fixes for the whole-branch review.", APPROVE);

  it("(p7-a) a re-review dispatched after the whole-branch review stopped is a loop round under v3, and branch-level under v2", async () => {
    const [v2, v3] = await twin([APPROVING_1, whole(undefined, "Whole-branch deep review"), FIXER, delta]);
    expect([classesOf(v2), v2.wholeBranch]).toEqual([sixOf("approve", 1), { finalClass: "approve-after-fixes", rounds: 2 }]);
    expect([classesOf(v3), v3.wholeBranch]).toEqual([sixOf("approve-after-fixes", 2), { finalClass: "blocked", rounds: 1 }]);
    expect(v3.totals.loopChars - v2.totals.loopChars).toBeGreaterThanOrEqual(delta.prompt.length + APPROVE.length);
  });

  it("(41b) after an approval, \"Whole-branch review\" and a lens dispatched while it runs are branch-level, and \"Review round 3 delta\" after it stops is a loop round", async () => {
    const lens = { ...LENS, id: "tu_wlens", agentId: "awlens", description: "Security lens" };
    const wb = whole();
    const lines = [...dispatch(APPROVING_1), ...launchOf(wb), ...launchOf(lens), ...deliverOf(wb), ...deliverOf(lens), ...dispatch(delta)];
    const [v2, v3] = await twin([APPROVING_1, wb, lens, delta], { lines });
    expect([classesOf(v2), v2.wholeBranch, found(v2)]).toEqual([sixOf("approve", 1), { finalClass: "approve-after-fixes", rounds: 2 }, AT_BRANCH]);
    expect([classesOf(v3), v3.wholeBranch, found(v3)]).toEqual([sixOf("approve-after-fixes", 2), { finalClass: "blocked", rounds: 1 }, AT_BRANCH]);
  });

  it("(p7-c) a whole-branch review before any approval stays a loop round in both readings", async () => {
    const [v2, v3] = await twin([whole(APPROVE, "Whole-branch review round 1")]);
    for (const m of [v2, v3]) expect([classesOf(m), m.wholeBranch]).toEqual([sixOf("approve", 1), { finalClass: null, rounds: 0 }]);
  });

  it("the v3 twin of R8 (f): a lens dispatched after the whole-branch review stopped is a loop round, so its find is at the pass stage in round 1", async () => {
    const late = { ...LENS, id: "tu_late", agentId: "alate", description: "Security lens" };
    const [v2, v3] = await twin([APPROVING_1, whole(undefined, "Whole-branch deep review"), late]);
    expect([v2.wholeBranch, found(v2)]).toEqual([{ finalClass: "blocked", rounds: 1 }, AT_BRANCH]);
    expect([v3.wholeBranch, found(v3)]).toEqual([{ finalClass: "blocked", rounds: 1 }, AT_PASS]);
  });
});

describe("REPLAY-v3 — the verdict grammar reaches the per-pass class (prove/8)", () => {
  it("(p8-a) rounds that say REQUEST_CHANGES read request-changes and need no no-verdict note; v2 reads no verdict", async () => {
    const r2 = agentOf("r2", "stamity-reviewer", "Review round 2", "Re-review the fixes.", `**Verdict: REQUEST_CHANGES.** The fix is incomplete.\n\n| Warning | ${LOOSE_FINDING.locator} | ${LOOSE_FINDING.summary} |`);
    const [v2, v3] = await twin([reviewerOf(freeTextReturn([LOOSE_FINDING], "REQUEST_CHANGES")), FIXER, r2]);
    expect([passOf(v2, "u1-p1").verdict.finalClass, passOf(v2, "u1-p1").verdict.rounds, noVerdict(v2)]).toEqual([null, 2, 2]);
    expect([passOf(v3, "u1-p1").verdict.finalClass, passOf(v3, "u1-p1").verdict.rounds, noVerdict(v3)]).toEqual(["blocked", 2, 0]);
  });

  it("a return quoting the brief's choice list before its own verdict reads its own verdict under v3, and the list's first word under v2", async () => {
    const r2 = agentOf("r2", "stamity-reviewer", "Review round 2", "Reply with Verdict: APPROVE | REQUEST_CHANGES.", `The brief asked for Verdict: APPROVE | REQUEST_CHANGES\n\n${freeTextReturn([LOOSE_FINDING], "REQUEST_CHANGES")}`);
    const [v2, v3] = await twin([reviewerOf(freeTextReturn([LOOSE_FINDING], "request-changes")), FIXER, r2]);
    expect([passOf(v2, "u1-p1").verdict.finalClass, passOf(v3, "u1-p1").verdict.finalClass]).toEqual(["approve-after-fixes", "blocked"]);
  });
});

describe("REPLAY-v3 — a ledger source names its verdict role by any token (prove/9)", () => {
  const onlyInLedger = (source: string): Record<string, unknown>[] => [{ id: `${RUN}/prove/1`, phase: "prove", source, severity: "Critical", evidence: "src/store/query.ts:11 — sort value concatenated into the ORDER BY", state: "fixed", rationale: "" }];
  it.each<[string, boolean]>([
    ["reviewer:r1", true],
    ["reviewer(frontier whole-branch)", true],
    ["stamity-reviewer(frontier)", true],
    ["fixer+reviewer(C7)+security(3)", true],
    ["test-runner+orchestrator-forensics", false],
    ["implementer:u1-p1", false],
  ])("a find that reached only a ledger row with source %j is a verdict source under v3: %s; under v2 never", async (source, verdict) => {
    const [v2, v3] = await twin([reviewerOf(freeTextReturn([LOOSE_FINDING], "request-changes"))], { ledger: onlyInLedger(source) });
    expect(found(v2)).toEqual(NOT_FOUND);
    expect(found(v3)).toEqual(verdict ? { found: true, stage: "unknown", foundRound1: false } : NOT_FOUND);
  });
});

describe("REPLAY-v3 — compaction loss counts entries, not locators (prove/10)", () => {
  const block = reviewerOf(freeTextReturn([{ ...LOOSE_FINDING, summary: "the handler logs the body; see src/http/app.ts:44 and src/http/router.ts:9" }], "request-changes"));
  const entry = reviewerOf(digestOf(["W-1 src/http/app.ts:30 — the handler logs the body; see src/http/app.ts:44"], REPORT_REL));
  const row = (loc: string): Record<string, unknown> => ({ id: `${RUN}/prove/1`, phase: "prove", source: "reviewer", severity: "Warning", evidence: `${loc} — the handler logs the body`, state: "open", rationale: "" });
  const sampled = (a: AgentSpec, pre: Record<string, unknown>[], end: Record<string, unknown>[]): Promise<[Measurement, Measurement]> =>
    twin([a], { lines: [...dispatch(a), mainLine.compactBoundary({ trigger: "manual", preTokens: 120_000 })], pre: { ledger: pre }, ledger: end });

  it("(41e) one free-text block with one finding at three locators and no ledger row puts 1 finding at risk, not 3", async () => {
    const [v2, v3] = await sampled(block, [], []);
    expect([sample(v2), sample(v3)]).toEqual([[3, 3, true], [1, 1, true]]);
  });

  it("(p10-a) the block with a pre-compaction row on one of its locators is not at risk", async () => {
    const [v2, v3] = await sampled(block, [row("src/http/app.ts:30")], [row("src/http/app.ts:30")]);
    expect([sample(v2), sample(v3)]).toEqual([[2, 2, true], [0, 0, false]]);
  });

  it("(p10-b) the block with no pre row and an end row on one cited locator is at risk once and not lost", async () => {
    const [v2, v3] = await sampled(block, [], [row("src/http/router.ts:9")]);
    expect([sample(v2), sample(v3)]).toEqual([[3, 2, true], [1, 0, true]]);
  });

  it("(p10-c) a digest entry whose pre and end rows sit only on its secondary stays at risk and lost: a secondary never covers", async () => {
    const [v2, v3] = await sampled(entry, [row("src/http/app.ts:44")], [row("src/http/app.ts:44")]);
    expect([sample(v2), sample(v3)]).toEqual([[1, 1, true], [1, 1, true]]);
  });

  it("(p10-d) a digest entry with a pre row on its own locator is not at risk", async () => {
    const [v2, v3] = await sampled(entry, [row("src/http/app.ts:30")], [row("src/http/app.ts:30")]);
    expect([sample(v2), sample(v3)]).toEqual([[0, 0, false], [0, 0, false]]);
  });
});

describe("REPLAY-v3 — report placement and the report key (prove/11, J)", () => {
  const namer = (report: string, description = "Review round 1"): AgentSpec => reviewerOf(digestOf(["C-1 src/store/query.ts:11 — sort reaches the query"], report), description);
  const reports = { [BRANCH_REPORT]: reportText([BRANCH_ROW]) };

  it("(p11-a) a round-1 find carried only by the report its digest names takes that agent's pass and round, not the report's file name", async () => {
    const [v2, v3] = await twin([namer(`reports/${BRANCH_REPORT}`)], { reports });
    expect([found(v2), found(v3)]).toEqual([AT_BRANCH, AT_PASS]);
  });

  it("(p11-b) after a plan review before the builds, the credit guard reads the naming agent's dispatch, so the find credits", async () => {
    const plan = agentOf("plan", "stamity-reviewer", "Plan review", "Review docs/plans/001-replay.md before the build.", APPROVE);
    const [v2, v3] = await twin([namer(`reports/${BRANCH_REPORT}`)], { reports, before: [plan] });
    expect([found(v2), found(v3)]).toEqual([NOT_FOUND, AT_PASS]);
  });

  it("(p11-c) a report no digest names keeps its file-name placement in both readings", async () => {
    const [v2, v3] = await twin([reviewerOf(APPROVE)], { reports });
    expect([found(v2), found(v3)]).toEqual([AT_BRANCH, AT_BRANCH]);
  });

  it("(41f) a report named by the digest of a u2-p1-only loop reviewer places its findings at u2-p1, pass stage, that agent's round", async () => {
    const u2 = { ...U1P1_SEED, pass: "u2-p1" };
    const snapshots = { ...sixSnapshots({ "src/orders/format.ts": FORMAT }), "u2-p1": SNAPSHOT_U1P1 };
    const [v2, v3] = await twin([namer(`reports/${BRANCH_REPORT}`, "Review u2-p1")], { seeds: [u2], record: { "u2-p1": [u2.id] }, snapshots, reports });
    expect([found(v2), found(v3)]).toEqual([AT_BRANCH, AT_PASS]);
    expect(v3.adjudication).toEqual([]);
  });

  it.each<[string, string, TwinOptions, typeof AT_PASS, typeof AT_PASS]>([
    ["reports/<f>", `reports/${BRANCH_REPORT}`, {}, AT_BRANCH, AT_PASS],
    ["./reports/<f>", `./reports/${BRANCH_REPORT}`, {}, AT_BRANCH, AT_PASS],
    [".stamity/runs/<run>/reports/<f>", `.stamity/runs/${RUN}/reports/${BRANCH_REPORT}`, {}, AT_PASS, AT_PASS],
    ["an absolute path", `/work/elsewhere/.stamity/runs/${RUN}/reports/${BRANCH_REPORT}`, {}, AT_BRANCH, AT_PASS],
    ["reports/<f> held by two run folders", `reports/${BRANCH_REPORT}`, { pre: { runId: "2026-09-24_other", reports } }, AT_BRANCH, AT_BRANCH],
    ["a refused write", `write refused — reports/${BRANCH_REPORT}`, {}, AT_BRANCH, AT_BRANCH],
  ])("(J) a digest's report: %s — joins its state report under v3 only when it names exactly one", async (_label, report, o, v2Reading, v3Reading) => {
    const [v2, v3] = await twin([namer(report)], { reports, ...o });
    expect([found(v2), found(v3)]).toEqual([v2Reading, v3Reading]);
  });
});

describe("REPLAY-v3 — the flat ledger (L) and a seed in no reviewed tree (build/7)", () => {
  it("(41g) a state copy's runs/<id>.ledger.jsonl is read like runs/<id>/ledger.jsonl", async () => {
    const flatLedger = [{ id: `${RUN}/prove/1`, phase: "prove", source: "reviewer", severity: "Critical", evidence: "src/store/query.ts:11 — sort value concatenated into the ORDER BY", state: "open", rationale: "" }];
    const [v2, v3] = await twin([reviewerOf(freeTextReturn([LOOSE_FINDING], "request-changes"))], { flatLedger });
    expect([found(v2), found(v3)]).toEqual([NOT_FOUND, { found: true, stage: "unknown", foundRound1: false }]);
  });

  it("(build/7) a seed not delivered is no matcher item: no credit, no adjudication row, no found", async () => {
    const ordered: Row = { id: "W-1", severity: "Warning", locator: "src/store/query.ts:11", summary: "the ORDER BY clause reads the column" };
    const agents = [reviewerOf(freeTextReturn([SEED_FINDING, ordered], "request-changes"))];
    const [v2, v3] = await twin(agents, { snapshots: sixSnapshots(REVERTED_U1P1) });
    expect([rowOf(v2, "sec-sql-sort").found, v2.adjudication.map((a) => a.item)]).toEqual([true, ["sec-sql-sort"]]);
    expect([rowOf(v3, "sec-sql-sort"), v3.adjudication]).toEqual([expect.objectContaining({ present: false, caughtByImplementer: true, found: false, stage: null }), []]);
  });

  // REPLAY-v3 §8 ("No matcher item"): four states keep a seed out of the matcher, through the one item filter
  // `arrivalsOf` feeds. Each case cites the seed with a term (a credit if it were an item) and without one (an
  // adjudication row if it were an item), by a lens dispatched after every swap.
  const ORDERED: Row = { id: "W-1", severity: "Warning", locator: "src/store/query.ts:11", summary: "the ORDER BY clause reads the column" };
  const INVOICE_READ: Row = { id: "W-4", severity: "Warning", locator: "src/orders/invoice.ts:7", summary: "the invoice read returns early" };
  const CITING = agentOf("cite", "stamity-security", "Security lens", "Review the diff for security.", freeTextReturn([SEED_FINDING, ORDERED, INVOICE_FINDING, INVOICE_READ], "request-changes"));
  const U1P1_ONLY = agentOf("u11", "stamity-reviewer", "Review u1-p1", "Review unit u1-p1.", APPROVE);
  it.each<[string, string, string, () => Promise<Measurement>]>([
    ["uncovered (no swap record for its pass)", "sec-sql-sort", ": uncovered — ", () => v3Run(...inOrder(B11, B31, CITING), { record: swapRecord({ "u3-p1": B31.id }) })],
    ["not delivered (absent at review start and from every build end)", "sec-sql-sort", ": was not delivered — ", () =>
      v3Run(...inOrder(B11, B31, CITING), { snapshots: { ...REVIEW_START, "u1-p1": { main: REVERTED_U1P1 } }, buildEnd: buildEnds([B11, ["u1-p1"], REVERTED_U1P1]) })],
    ["caught before review (a build end held it, the review start does not)", "sec-sql-sort", ": caught before review — ", () =>
      v3Run(...inOrder(B11, B31, CITING), { snapshots: { ...REVIEW_START, "u1-p1": { main: REVERTED_U1P1 } }, buildEnd: buildEnds([B11, ["u1-p1"], SNAPSHOT_U1P1.main], [B31, ["u3-p1"], REVERTED_U1P1]) })],
    ["of a pass no review covered", "cor-invoice-eacces", ": was never reviewed — ", () =>
      v3Run(...inOrder(B11, B31, U1P1_ONLY, { ...CITING, description: "Security lens on u1-p1" }), { snapshots: { "u1-p1": SNAPSHOT_U1P1 }, buildEnd: buildEnds([B11, ["u1-p1"], SNAPSHOT_U1P1.main], [B31, ["u3-p1"], REVIEW_START["u3-p1"].main]) })],
  ])("(build/7) a seed %s is no matcher item: no credit and no adjudication row", async (_label, id, state, run) => {
    const m = await run();
    expect(noteOf(m, id)).toContain(state);
    expect(rowOf(m, id)).toEqual(expect.objectContaining({ found: false, stage: null, foundRound1: false }));
    expect(m.adjudication.filter((a) => a.item === id)).toEqual([]);
    expect(m.passes.flatMap((p) => p.seeds).filter((s) => s.found).map((s) => s.id)).not.toContain(id);
  });
});
