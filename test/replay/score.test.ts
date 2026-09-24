import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { measureRun } from "../../scripts/replay/measure.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { NOTE_ROWS, TOTALS_KEYS, checkRuns, parseThresholds, renderResults, summarize, validateSummary } from "../../scripts/replay/score.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { LEDGER_GATED_KINDS, roleFunction } from "../../scripts/replay/transcript.mjs";
import { type CaptureLayout, type SubagentFile, mainLine, subagentFile, writeCapture } from "./synth.ts";

/**
 * The replay's per-run scorer (REPLAY-v1 §12, §14): `summary.json` and `RESULTS.md` from one r7
 * measurement, the thresholds read from the committed protocol, and `check` over a runs folder.
 *
 * The measurement every case scores is a real one: a synthetic capture written by `writeCapture`
 * and measured by `measureRun`, so the scorer is driven by the document r7 emits, never by a hand
 * copy of its shape. The committed protocol is read as it stands — its thresholds, its four
 * invocation messages (r1's criteria) and its §8 metric definitions, which are pinned against
 * `measure.mjs` here (build/5) so the protocol text and the code cannot drift apart silently.
 */

const REPO = resolve(import.meta.dirname, "../..");
const SCORE_MJS = join(REPO, "scripts/replay/score.mjs");
const PROTOCOL = join(REPO, "evals/replay/REPLAY-v1.md");
const PROTOCOL_TEXT = readFileSync(PROTOCOL, "utf8");
const PROTOCOL_SHA = createHash("sha256").update(readFileSync(PROTOCOL)).digest("hex");
const MEASURE_SRC = readFileSync(join(REPO, "scripts/replay/measure.mjs"), "utf8");
const TRANSCRIPT_SRC = readFileSync(join(REPO, "scripts/replay/transcript.mjs"), "utf8");
const RUN = "2026-09-24_replay";
const RUN_ID = "2026-09-24-replay-1";
const COMMIT = "a".repeat(40);

/** The r1 cell's machine block, key for key. */
const R1_THRESHOLDS = {
  schema: "stamity/replay-thresholds/v1",
  lineTolerance: 3,
  securityAllRuns: true,
  recallMargin: 1,
  recallOpportunities: 36,
  decoyFlags: "<=baseline",
  lossPerValidSample: 0,
  minValidSamplesChanged: 1,
  verdictClassMinPasses: 5,
  roundsTolerance: 1,
  approvedUnfixed: "<=baseline",
  loopCharsRatioMax: 0.5,
  loopCharsReference: "baseline-median",
  loopCharsScope: "every-scored-run",
  subagentTokensRatioMax: 1.2,
  subagentTokensScope: "pooled-mean",
  subagentTokensReference: "baseline-mean",
  scoredRunsPerShape: 3,
  scoredSpreadSeeds: 2,
  scoredRunsIfVariance: 5,
  securityExemption: "any-baseline-scored-run-missed",
  evalSetFloors: "carried-to-session-2",
};

// ---------- a synthetic run, measured by r7 ----------

const SEEDS = {
  schema: "stamity/replay-seeds/v1",
  matcher: { lineTolerance: 3, severities: ["Critical", "Warning"] },
  seeds: [
    {
      id: "sec-sql-sort", class: "security", severity: "Critical", pass: "u1-p1", file: "src/store/query.ts",
      locate: { text: "ORDER BY ${sort}", from: 0, to: 0 }, present: { contains: "ORDER BY ${sort}" }, span: [11, 11],
      terms: ["inject", "concatenat", "interpolat"],
    },
    {
      id: "cor-page-offset", class: "correctness", severity: "Warning", pass: "u1-p1", file: "src/store/page.ts",
      locate: { text: "offset = page * size", from: 0, to: 0 }, present: { contains: "offset = page * size" }, span: [4, 4],
      terms: ["off-by-one", "offset"],
    },
  ],
  decoys: [
    {
      id: "dec-internal-rename", pass: "u1-p1", file: "src/orders/format.ts",
      locate: { text: "function formatCents", from: 0, to: 0 }, present: { contains: "function formatCents" }, span: [5, 5],
      terms: ["rename", "breaking"],
    },
  ],
};

const fileWith = (at: number, line: string, size = at + 5): string =>
  Array.from({ length: size }, (_, i) => (i + 1 === at ? line : `// line ${i + 1}`)).join("\n") + "\n";
const SNAPSHOT = {
  "src/store/query.ts": fileWith(11, "  const sql = `SELECT id FROM orders ORDER BY ${sort} DESC`;"),
  "src/store/page.ts": fileWith(4, "  const offset = page * size;"),
  "src/orders/format.ts": fileWith(5, "function formatCents(cents: number): string {"),
};

/** A free-text review: the seed, the decoy, one finding on neither, and a location match with no term. */
const FIRST_REVIEW = [
  "**Verdict:** request-changes",
  "",
  "| Severity | Locator | Finding |",
  "|---|---|---|",
  "| Critical | src/store/query.ts:11 | sort value concatenated into SQL |",
  "| Warning | src/orders/format.ts:5 | renaming fmt is a breaking change |",
  "| Warning | src/http/app.ts:30 | the error handler logs the whole request body |",
  "| Warning | src/store/page.ts:4 | the paging arithmetic reads oddly |",
].join("\n");

interface AgentSpec {
  id: string;
  agentId: string;
  type: string;
  description: string;
  prompt: string;
  result: string;
  tokens: number;
}

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
    agentId: a.agentId, agentType: a.type, prompt: a.prompt, requestedModel: "opus", toolUseId: a.id, description: a.description,
    requests: [{ id: `msg_${a.agentId}`, model: "claude-opus-5-5", usage: { input, output: a.tokens - input } }],
  });
}

const temps: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "stamity-replay-score-"));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Built {
  layout: CaptureLayout;
  fixture: string;
  runJson: Record<string, unknown>;
}

/** The run.json keys the scorer reads, beside the ones r7 reads. */
function provenance(fixture: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runId: RUN_ID,
    shape: "baseline",
    kind: "scored",
    mechanism: "interrupt",
    instrument: { commit: COMMIT, protocolSha256: PROTOCOL_SHA, files: { "scripts/replay/measure.mjs": "b".repeat(64) } },
    cli: { commit: "c".repeat(40), version: "1.9.1", tarballSha256: "d".repeat(64) },
    client: { version: "2.1.280", binarySha256: "e".repeat(64) },
    fixture: { root: fixture, baseCommit: "f".repeat(40), planSha256: "1".repeat(64), depsSha256: "2".repeat(64) },
    timing: { activeMs: 7_200_000, pausedMs: 0, capacityHolds: 0, nudges: 1, restarts: 0 },
    ...over,
  };
}

/**
 * u1-p1 of a baseline run: implementer, reviewer (four findings), a heredoc ledger write, a forced
 * compaction with the rows not yet in the pre-compaction ledger, fixer, reviewer approving.
 */
function capture(runOver: Record<string, unknown> = {}): Built {
  const dir = scratch();
  const fixture = join(dir, "fx");
  mkdirSync(fixture);
  const agents: AgentSpec[] = [
    { id: "tu_impl", agentId: "aimpl", type: "stamity-implementer", description: "Implement u1-p1", prompt: "Build unit u1-p1.", result: "status: DONE", tokens: 1100 },
    { id: "tu_rev1", agentId: "arev1", type: "stamity-reviewer", description: "Review u1-p1", prompt: "Review unit u1-p1.", result: FIRST_REVIEW, tokens: 2200 },
    { id: "tu_fix", agentId: "afix", type: "stamity-fixer", description: "Fix u1-p1", prompt: "Fix the findings of u1-p1.", result: "status: DONE", tokens: 1650 },
    { id: "tu_rev2", agentId: "arev2", type: "stamity-reviewer", description: "Re-review u1-p1", prompt: "Re-review unit u1-p1.", result: "**Verdict:** approve\n\nNo findings.", tokens: 880 },
  ];
  const [impl, rev1, fix, rev2] = agents as [AgentSpec, AgentSpec, AgentSpec, AgentSpec];
  const rows = [
    ["Critical", "src/store/query.ts:11 — sort value concatenated into SQL"],
    ["Warning", "src/orders/format.ts:5 — renaming fmt is a breaking change"],
    ["Warning", "src/http/app.ts:30 — the error handler logs the whole request body"],
  ].map(([severity, evidence], i) => ({ id: `${RUN}/build/${i + 1}`, phase: "build", source: "reviewer", severity, evidence, state: "open", rationale: "" }));
  const transcript = [
    mainLine.userText("/st-work docs/plans/001-replay.md --effort deep"),
    ...dispatch(impl),
    ...dispatch(rev1),
    mainLine.bashToolUse({ id: "tu_led", command: `cat >> .stamity/runs/${RUN}/ledger.jsonl <<'EOF'\n${rows.map((r) => JSON.stringify(r)).join("\n")}\nEOF` }),
    mainLine.toolResult("tu_led", ""),
    mainLine.compactBoundary({ trigger: "manual", preTokens: 120_000 }),
    mainLine.userText("Continue the /st-work run from where it stopped."),
    ...dispatch(fix),
    ...dispatch(rev2),
  ];
  const runJson = provenance(fixture, runOver);
  const layout = writeCapture(dir, {
    run: runJson,
    stdout: [JSON.stringify({ type: "system", subtype: "init", model: "claude-opus-5-5", cwd: fixture })],
    transcript,
    subagents: agents.map(subagentOf),
    snapshots: { "u1-p1": { main: SNAPSHOT } },
    state: { "compaction-1-pre": { runId: RUN, ledger: [] }, end: { runId: RUN, ledger: rows } },
    oracle: { schema: "stamity/replay-oracle/v1", results: [{ seed: "sec-sql-sort", kind: "vitest", status: "pass", detail: "" }, { seed: "cor-page-offset", kind: "vitest", status: "fail", detail: "" }] },
  });
  return { layout, fixture, runJson: JSON.parse(readFileSync(layout.runJson, "utf8")) as Record<string, unknown> };
}

interface Summary {
  schema: string;
  runId: string;
  kind: string;
  shape: string;
  protocol: { path: string; sha256: string; commit: string };
  instrument: { commit: string; files: Record<string, string> };
  client: { orchestratorModel: string | null; resolvedModels: string[] };
  mechanism: string;
  passes: { id: string; loopChars: number; verdict: { finalClass: string | null; rounds: number; approvedWithSeedUnfixed: boolean }; seeds: { id: string; class: string | null; found: boolean; caughtByImplementer: boolean }[]; decoysFlagged: string[] }[];
  totals: Record<string, unknown> & { loopCharsPerPass: number; subagentTokensPerPass: number; recall: { found: number; denominator: number }; decoyFalseFlags: number; unmatched: number };
  compactionSamples: { atRisk: number; lost: number; valid: boolean }[];
  adjudication: { item: string; locator: string; excerpt: string }[];
  notes: string[];
  invalid: string[];
  notDone: string[];
}

async function measured(runOver: Record<string, unknown> = {}): Promise<Built & { m: Record<string, unknown> & { notes: string[]; adjudication: { excerpt: string }[] } }> {
  const built = capture(runOver);
  const m = (await measureRun(built.layout.runDir, { seeds: SEEDS })) as Record<string, unknown> & { notes: string[]; adjudication: { excerpt: string }[] };
  return { ...built, m };
}

const score = (args: string[]): { status: number | null; stdout: string; stderr: string } =>
  spawnSync(process.execPath, [SCORE_MJS, ...args], { encoding: "utf8" });

/** `run` over a measured capture into `<scratch>/runs/<runId>`; the measurement is written beside it. */
async function runInto(opts: { runsDir?: string; runId?: string; kind?: string; runOver?: Record<string, unknown>; extra?: string[] } = {}) {
  const built = await measured(opts.runOver);
  const runsDir = opts.runsDir ?? join(scratch(), "runs");
  const measurement = join(built.layout.runDir, "measurement.json");
  writeFileSync(measurement, JSON.stringify(built.m));
  const runId = opts.runId ?? RUN_ID;
  const outDir = join(runsDir, runId);
  const args = ["run", "--measurement", measurement, "--run-json", built.layout.runJson, "--protocol", PROTOCOL, "--run-id", runId, "--kind", opts.kind ?? "scored", "--out-dir", outDir, ...(opts.extra ?? [])];
  return { ...built, runsDir, outDir, measurement, args, result: score(args) };
}

// ---------- the protocol as committed ----------

describe("REPLAY-v1 as committed — the thresholds and the invocation bytes (r1)", () => {
  it("parseThresholds reads exactly the r1 values from the one replay-thresholds block", () => {
    expect(parseThresholds(PROTOCOL_TEXT)).toEqual(R1_THRESHOLDS);
  });

  const block = PROTOCOL_TEXT.match(/```replay-thresholds\n(.*)\n```/)![1]!;
  const withBlock = (json: string): string => PROTOCOL_TEXT.replace(block, json);

  it("refuses a duplicated key, naming it, although JSON.parse would keep the last value", () => {
    expect(() => parseThresholds(withBlock(block.replace('"recallMargin":1,', '"recallMargin":1,"recallMargin":0,')))).toThrow(/duplicated key "recallMargin"/);
  });

  it("refuses an unknown key and a missing key, naming each", () => {
    expect(() => parseThresholds(withBlock(block.replace('"lineTolerance":3,', '"lineTolerance":3,"loopCharsFloor":0.4,')))).toThrow(/unknown key "loopCharsFloor"/);
    expect(() => parseThresholds(withBlock(block.replace('"roundsTolerance":1,', "")))).toThrow(/missing key "roundsTolerance"/);
  });

  it("refuses a value of the wrong type and a second or absent block", () => {
    expect(() => parseThresholds(withBlock(block.replace('"recallMargin":1', '"recallMargin":"1"')))).toThrow(/"recallMargin" must be a number/);
    expect(() => parseThresholds(`${PROTOCOL_TEXT}\n\`\`\`replay-thresholds\n${block}\n\`\`\`\n`)).toThrow(/exactly one replay-thresholds block, found 2/);
    expect(() => parseThresholds("# no block")).toThrow(/exactly one replay-thresholds block, found 0/);
  });

  // r1's criteria: the file holds the four messages byte-for-byte, and each sha256 and byte count it
  // prints is the hash and length of exactly those bytes.
  const MESSAGES: [string, string][] = [
    [
      "Start message",
      "/st-work docs/plans/001-replay.md --effort deep\n\nUnattended run: no operator will answer. At every question, execute its declared default (plan gate: execute now). At the QA checkpoint, emit the what-to-verify summary and record the human sign-off as not performed. Do not open a pull request.",
    ],
    ["Resume message", "Continue the /st-work run from where it stopped."],
    ["Nudge", "This run is unattended; no reply will come. Apply the declared default and continue the /st-work run."],
    ["Capacity resume", "The usage limit has reset. Continue the /st-work run from where it stopped."],
  ];
  it.each(MESSAGES)("§6 %s: the fenced bytes, their count and their sha256 as printed", (label, text) => {
    const at = PROTOCOL_TEXT.indexOf(`**${label}**`);
    expect(at, `§6 has no **${label}** paragraph`).toBeGreaterThan(-1);
    const section = PROTOCOL_TEXT.slice(at, PROTOCOL_TEXT.indexOf("```\n", PROTOCOL_TEXT.indexOf("```text\n", at) + 8) + 4);
    expect(section).toContain(`\`\`\`text\n${text}\n\`\`\``);
    const bytes = Buffer.from(text, "utf8");
    expect(section).toMatch(new RegExp(`${bytes.length} bytes\\.\\s+sha256\\s+\`${createHash("sha256").update(bytes).digest("hex")}\``));
  });
});

// ---------- §8 pinned against measure.mjs (build/5) ----------

/** §8 with its line wrapping folded, so a pinned phrase survives a re-wrap of the protocol. */
const SECTION_8 = PROTOCOL_TEXT.slice(PROTOCOL_TEXT.indexOf("## §8 Metrics"), PROTOCOL_TEXT.indexOf("## §9 Matcher")).replace(/\s+/g, " ");
const fold = (s: string): string => s.replace(/\s+/g, " ");
/** Whether `src` holds `literal` ending at a token boundary, so `= 0.2` never passes for `= 0.25`. */
const holds = (src: string, literal: string): boolean => new RegExp(`${literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w.])`).test(src);

/**
 * Each row pairs one definition §8 states with the code that implements it, both verbatim. A
 * change to either side fails the row by name, so an amendment of §8 or of `measure.mjs` has to
 * move its twin in the same change.
 */
const PINS: { rule: string; protocol: string[]; code: string[] }[] = [
  { rule: "pass attribution", protocol: ["The first `\\bu[1-3]-p[12]\\b` in the dispatch description", "several distinct ids attribute to `multi`"], code: ["const PASS_ID = /\\bu[1-3]-p[12]\\b/", "return ids.size > 1 ? 'multi' : null"] },
  { rule: "branch-level dispatches", protocol: ["`u3-p2`'s last reviewer approval", "`/whole[- ]branch/i`"], code: ["const WHOLE_BRANCH = /whole[- ]branch/i", "d.agent.pass === 'u3-p2' && d.verdict === 'approve'"] },
  { rule: "the loop functions", protocol: ["The loop functions are build, fix, verdict and gate."], code: ["const LOOP_FUNCTIONS = new Set(['build', 'fix', 'verdict', 'gate'])"] },
  { rule: "resumes reported apart", protocol: ["excluding resumes (`/^Resume|after the (?:rate limit|stall)/i`, reported separately)"], code: ["const RESUME = /^Resume|after the (?:rate limit|stall)/i", "[a.resume ? 'resumes' : 'prompts']"] },
  { rule: "term (d) brief files", protocol: ["(`/\\/briefs?\\/|brief[-\\w]*\\.md|\\/lanes\\//`)"], code: ["const BRIEF = /\\/briefs?\\/|brief[-\\w]*\\.md|\\/lanes\\//"] },
  {
    rule: "term (e) report reads",
    protocol: ["(`.stamity/runs/*/reports/` or `/tasks/*.output`)", "a Bash call of class read or search", "a Grep or Glob call whose path, pattern, file glob or result names one"],
    code: ["const REPORT_READ = /\\.stamity\\/runs\\/[^/\\s'\"]+\\/reports\\/|\\/tasks\\/[^/\\s'\"]+\\.output/", "const READ_CLASSES = new Set(['read', 'rs', 'mixed', 'search'])", "const SEARCH_TOOLS = new Set(['Grep', 'Glob'])", "const spellings = [path, i.pattern, i.glob,"],
  },
  { rule: "loop characters ÷ 6", protocol: ["**Loop characters per pass = the total ÷ 6.**"], code: ["const PASS_COUNT = 6", "loopCharsPerPass: loopChars / PASS_COUNT"] },
  { rule: "the unreliable split", protocol: ["flagged unreliable when more than 20% is unattributed"], code: ["const UNATTRIBUTED_MAX = 0.2", "perPassUnreliable: unattributedShare > UNATTRIBUTED_MAX"] },
  { rule: "sub-agent tokens ÷ 6", protocol: ["**Sub-agent tokens per pass** = Σ `processed` over the loop-function agents ÷ 6"], code: ["subagentTokensPerPass: usage.tokens / PASS_COUNT"] },
  { rule: "recall: caught by implementer", protocol: ["otherwise it is \"caught by implementer\" and leaves the denominator"], code: ["caughtByImplementer: present === false"] },
  { rule: "recall: unknown presence stays in", protocol: ["A seed whose presence is unknown stays in the denominator"], code: ["const inDenominator = seedRows.filter((s) => s.present !== false)", "const present = held.has(true) ? true : held.has(false) ? false : null"] },
  { rule: "precision", protocol: ["A decoy is flagged when a Critical or Warning finding matches it."], code: ["const FLAG_SEVERITIES = ['Critical', 'Warning']", "const flagMatch = matchByPass(all, items, snapshots, { tolerance, severities: FLAG_SEVERITIES })"] },
  {
    rule: "loss: coverage by a ledger row",
    protocol: ["a finding with no file is covered by the report-path match or by a row that itself has no file and whose text contains the finding's trimmed text, and a row with a file covers only its own location"],
    code: ["const text = f.file == null ? String(f.text ?? '').trim() : ''", "(text !== '' && r.file == null && String(r.text ?? '').includes(text))"],
  },
  { rule: "loss: validity", protocol: ["A sample is valid iff at-risk ≥ 1."], code: ["sample.valid = sample.atRisk >= 1"] },
  { rule: "automatic compactions and the projection", protocol: ["Automatic compactions (`trigger:\"auto\"`) are counted", "10 × context tokens per pass ÷ 947,000"], code: ["compactionsAuto: walk.compactions.filter((c) => c.trigger === 'auto').length", "const COMPACTION_TOKENS = 947_000", "projectedPer10: (10 * contextTokensPerPass) / COMPACTION_TOKENS"] },
  {
    rule: "verdicts: rounds",
    protocol: ["Rounds = the reviewer's completed deliveries: each one is a round, including one whose text carries no verdict word", "a re-read of an earlier delivery and a failed notification (a status other than completed) are not rounds"],
    code: ["d.round = !d.failed && !d.reread", "const failed = typeof d.status === 'string' && d.status !== 'completed'"],
  },
  {
    rule: "verdicts: the final class",
    protocol: ["`approve` (one round, approve), `approve-after-fixes` (more rounds, approve) or `blocked` (the last verdict request-changes, or a `BLOCKED_*` return)"],
    code: ["if (last === 'approve') return rounds <= 1 ? 'approve' : 'approve-after-fixes'", "if (last === 'request-changes' || last === 'blocked') return 'blocked'"],
  },
  { rule: "verdicts: an erroring oracle is unfixed", protocol: ["an oracle that errors counts as unfixed"], code: ["approvedWithSeedUnfixed: approved && ownSeeds.some((s) => s.oracle !== 'pass')"] },
  { rule: "invalid run", protocol: ["`seeds.json` or `__oracle__`) in any tool input; or a run whose end reason is not `complete`"], code: ["const ALWAYS_FORBIDDEN = ['seeds.json', '__oracle__']", "if (endReason !== 'complete')"] },
];

describe("REPLAY-v1 §8 pinned against measure.mjs (build/5)", () => {
  it.each(PINS)("$rule: the protocol states it and measure.mjs implements it, both verbatim", ({ protocol, code }) => {
    for (const phrase of protocol) expect(SECTION_8.includes(fold(phrase)), `§8 no longer states: ${phrase}`).toBe(true);
    for (const literal of code) expect(holds(MEASURE_SRC, literal), `measure.mjs no longer holds: ${literal}`).toBe(true);
  });

  it("every regular expression §8 spells is a regular-expression literal in measure.mjs", () => {
    const literals = [...SECTION_8.matchAll(/`(\/[^`]+\/[a-z]*)`/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(3);
    for (const literal of literals) expect(holds(MEASURE_SRC, `= ${literal}`), `measure.mjs has no literal ${literal}`).toBe(true);
  });

  it("the role functions and the gated ledger kinds are the ones §8 names", () => {
    expect(SECTION_8).toContain(fold("implementer → build; fixer → fix; reviewer, security, performance, design-quality → verdict; test-runner → gate; everything else → other"));
    const roles: [string, string][] = [["implementer", "build"], ["fixer", "fix"], ["reviewer", "verdict"], ["security", "verdict"], ["performance", "verdict"], ["design-quality", "verdict"], ["test-runner", "gate"], ["researcher", "other"]];
    for (const [role, fn] of roles) expect(roleFunction(`stamity-${role}`), role).toBe(fn);
    // (c): a heredoc, redirect or script body into the ledger, a Write/Edit/MultiEdit on it, the verb.
    expect(SECTION_8).toContain(fold("a heredoc, redirect or script body targeting `ledger.jsonl`; a Write, Edit or MultiEdit on `*ledger.jsonl`; or a `stamity ledger append|close|status` call"));
    expect([...(LEDGER_GATED_KINDS as Set<string>)].toSorted()).toEqual(["echo", "heredoc", "verb", "writeEdit"]);
    expect(TRANSCRIPT_SRC).toContain("ledger\\s+(?:append|close|status)\\b");
    expect(MEASURE_SRC).toContain("if (LEDGER_GATED_KINDS.has(call.ledger.kind))");
  });

  it("the matcher's ±3 lines is the thresholds' lineTolerance and the seeds document's", () => {
    expect(SECTION_8).toContain("a line within ±3");
    expect(PROTOCOL_TEXT).toContain("the item's span widened by ±3 lines");
    expect(parseThresholds(PROTOCOL_TEXT).lineTolerance).toBe(3);
    const seeds = JSON.parse(readFileSync(join(REPO, "evals/replay/v1/seeds.json"), "utf8")) as { matcher: { lineTolerance: number } };
    expect(seeds.matcher.lineTolerance).toBe(3);
  });

  it("every notes line RESULTS files beside a figure is a line measure.mjs writes", () => {
    for (const { includes } of NOTE_ROWS as { includes: string }[]) expect(MEASURE_SRC, includes).toContain(includes);
  });
});

// ---------- summarize ----------

describe("summarize — the measurement into stamity/replay-summary/v1", () => {
  it("carries every total r7 measures, so no qualifier is folded away", async () => {
    const { m } = await measured();
    expect([...(TOTALS_KEYS as string[])].toSorted()).toEqual(Object.keys(m["totals"] as object).toSorted());
  });

  it("scores the synthetic run: the security seed found, the term-less one not, one decoy flagged, one loss", async () => {
    const { m, runJson } = await measured();
    const s = summarize(m, runJson, PROTOCOL_SHA) as Summary;
    expect(validateSummary(s)).toEqual([]);
    expect([s.schema, s.runId, s.kind, s.shape, s.mechanism]).toEqual(["stamity/replay-summary/v1", RUN_ID, "scored", "baseline", "interrupt"]);
    expect(s.protocol).toEqual({ path: "evals/replay/REPLAY-v1.md", sha256: PROTOCOL_SHA, commit: COMMIT });
    expect(s.totals.recall).toEqual({ found: 1, denominator: 2, byClass: { security: { found: 1, denominator: 1 }, correctness: { found: 0, denominator: 1 } } });
    expect(s.totals.decoyFalseFlags).toBe(1);
    // app.ts:30 matches nothing; page.ts:4 meets the seed's span with no accepted term.
    expect(s.totals.unmatched).toBe(2);
    const u1p1 = s.passes.find((p) => p.id === "u1-p1")!;
    expect(u1p1.seeds.map((x) => [x.id, x.class, x.found])).toEqual([["sec-sql-sort", "security", true], ["cor-page-offset", "correctness", false]]);
    expect(u1p1.verdict).toEqual({ finalClass: "approve-after-fixes", rounds: 2, approvedWithSeedUnfixed: true });
    expect(u1p1.decoysFlagged).toEqual(["dec-internal-rename"]);
    // Four findings delivered before the boundary with no pre-compaction row; page.ts:4 never gets
    // a row and its seed's oracle fails, so it is lost.
    expect(s.compactionSamples).toEqual([expect.objectContaining({ n: 1, placement: "u1-p1", trigger: "manual", atRisk: 4, lost: 1, valid: true })]);
    expect(s.client).toEqual(expect.objectContaining({ orchestratorModel: "claude-opus-5-5", resolvedModels: ["claude-opus-5-5"] }));
    expect(s.notDone).toEqual([]);
  });

  it("puts a location match without a term on the adjudication list with its excerpt", async () => {
    const { m, runJson } = await measured();
    const s = summarize(m, runJson, PROTOCOL_SHA) as Summary;
    // "the paging arithmetic reads oddly" meets cor-page-offset's span and names none of its terms.
    expect(s.adjudication).toEqual(expect.arrayContaining([expect.objectContaining({ item: "cor-page-offset", locator: "src/store/page.ts:4" })]));
  });

  it("redacts a home path and the fixture root, in both spellings, from every excerpt and note, and cuts excerpts at 200", async () => {
    const { m, runJson, fixture } = await measured();
    const real = realpathSync(fixture);
    const adjudication = m.adjudication.map((a) => ({ ...a, excerpt: `see /Users/x/notes.md and ${real}/src/a.ts and ${fixture}/src/b.ts` }));
    const long = { ...m.adjudication[0]!, excerpt: `${fixture}/${"y".repeat(300)}` };
    const s = summarize({ ...m, adjudication: [...adjudication, long], notes: [...m.notes, `a note naming ${fixture}/src/c.ts`] }, runJson, PROTOCOL_SHA) as Summary;
    expect(s.adjudication[0]!.excerpt).toBe("see <home>/notes.md and <fixture>/src/a.ts and <fixture>/src/b.ts");
    expect([...s.adjudication.at(-1)!.excerpt].length).toBe(200);
    expect(s.notes.at(-1)).toBe("a note naming <fixture>/src/c.ts");
    const text = JSON.stringify(s);
    for (const shape of ["/Users/", "/home/", "/private/var/", "/var/folders/"]) expect(text).not.toContain(shape);
  });

  it("names every provenance field run.json does not record in notDone, and an invalid run too", async () => {
    const { m, runJson } = await measured();
    const bare = { ...runJson, cli: {}, timing: undefined };
    const s = summarize({ ...m, invalid: ["run.json end.reason is \"stalled\", not \"complete\""] }, bare, PROTOCOL_SHA) as Summary;
    expect(s.notDone).toEqual(
      expect.arrayContaining([
        "run.json records no cli.commit",
        "run.json records no cli.tarballSha256",
        "run.json records no timing.activeMs",
        expect.stringMatching(/^invalid run — run\.json end\.reason is "stalled".*replace it/),
      ]),
    );
  });

  it("refuses a document that is not an r7 measurement", () => {
    expect(() => summarize({ schema: "other" }, {}, PROTOCOL_SHA)).toThrow(/not stamity\/replay-measurement\/v1/);
  });
});

// ---------- renderResults ----------

const withLoop = (s: Summary, v: number): Summary => ({ ...s, totals: { ...s.totals, loopCharsPerPass: v } });
/** The last cell (the per-run check) of a per-metric table row. */
const lastCell = (md: string, row: string): string => md.split("\n").find((l) => l.startsWith(`| \`${row}\` |`))!.split(" | ").at(-1)!;
/** `s` with the security seed not found. */
const miss = (s: Summary): Summary => ({ ...s, passes: s.passes.map((p) => ({ ...p, seeds: p.seeds.map((x) => (x.id === "sec-sql-sort" ? { ...x, found: false } : x)) })) });

describe("renderResults — RESULTS.md", () => {
  it("opens with the pins and the protocol sha, and closes with the closing line and Not done", async () => {
    const { m, runJson } = await measured();
    const s = summarize(m, runJson, PROTOCOL_SHA);
    const md = renderResults(s, parseThresholds(PROTOCOL_TEXT)) as string;
    expect(md.split("\n")[0]).toBe(`# Replay run \`${RUN_ID}\` — baseline shape, scored`);
    expect(md).toContain(`sha256 \`${PROTOCOL_SHA}\``);
    expect(md).toContain("Compaction mechanism (§7): `interrupt`");
    expect(md).toContain("claude-opus-5-5");
    const tail = md.trimEnd().split("\n");
    const closing = tail.indexOf("No threshold moved.");
    expect(closing).toBeGreaterThan(0);
    expect(tail.slice(closing + 1)).toEqual(["", "Not done:", "", "- none"]);
    // Every §12 row stands in the per-metric table with its threshold keys from the protocol.
    for (const row of ["security-seeds", "pooled-recall", "decoy-flags", "compaction-loss", "verdict-class", "verdict-rounds", "approved-unfixed", "loop-chars", "subagent-tokens", "eval-set-floors"]) expect(md).toContain(`| \`${row}\` |`);
    expect(md).toContain("loopCharsRatioMax 0.5");
    // No per-run column without a baseline reference.
    expect(md).not.toContain("Per-run check");
  });

  it("renders every qualifier beside the figure it qualifies, and every notes line verbatim", async () => {
    const { m, runJson } = await measured();
    const s = summarize(m, runJson, PROTOCOL_SHA) as Summary;
    const md = renderResults(s, parseThresholds(PROTOCOL_TEXT)) as string;
    const beside = (row: string): string => md.slice(md.indexOf(`#### Beside \`${row}\``), md.indexOf("####", md.indexOf(`#### Beside \`${row}\``) + 4));
    expect(beside("pooled-recall")).toMatch(/severity-without-locator 0, locator-without-severity 0; digest errors 0; findings-block errors 0; ledger parse errors 0/);
    expect(beside("pooled-recall")).toContain("a changed-shape report is read for its `stamity-findings` block only");
    expect(beside("loop-chars")).toMatch(/unattributed share 0\.0%/);
    expect(beside("loop-chars")).toMatch(/unresolved deliveries and sends: 0/);
    expect(beside("loop-chars")).toMatch(/walk skipped: /);
    expect(beside("subagent-tokens")).toMatch(/sub-agents joined to no dispatch: 0/);
    expect(beside("subagent-tokens")).toMatch(/dispatched agents with no transcript: 0/);
    expect(beside("subagent-tokens")).toMatch(/unparseable sub-agent lines: 0 over 4 sub-agent\(s\)/);
    expect(beside("subagent-tokens")).toContain(s.notes.find((n) => n.startsWith("sub-agent tokens reconciled"))!);
    expect(s.notes.length).toBeGreaterThan(0);
    for (const note of s.notes) expect(md).toContain(note);
  });

  it("files a notes line of each kind beside its row, and an unknown one under the other notes", async () => {
    const { m, runJson } = await measured();
    const notes = [
      "reviewer round with no readable verdict: main transcript line 9, 12 characters — counted as a round",
      "no snapshot under captures/snapshots/u2-p1/: its seeds stay in the recall denominator with presence unknown",
      "pass u3-p2 has no loop dispatch: its loop characters and sub-agent tokens are 0 and still count in the ÷ 6",
      "a kind of note this scorer has never seen",
    ];
    const md = renderResults(summarize({ ...m, notes }, runJson, PROTOCOL_SHA), parseThresholds(PROTOCOL_TEXT)) as string;
    const section = (head: string): string => md.slice(md.indexOf(head), md.indexOf("####", md.indexOf(head) + 4));
    expect(section("#### Beside `verdict-rounds`")).toContain(notes[0]);
    expect(section("#### Beside `pooled-recall`")).toContain(notes[1]);
    expect(section("#### Beside `loop-chars`")).toContain(notes[2]);
    expect(section("#### Beside `subagent-tokens`")).toContain(notes[2]);
    expect(section("#### Other measurement notes")).toContain(notes[3]);
  });

  it("heads a pilot 'pilot — not scored' and lists it under Not done", async () => {
    const { m, runJson } = await measured({ kind: "pilot" });
    const s = summarize(m, runJson, PROTOCOL_SHA) as Summary;
    expect(s.kind).toBe("pilot");
    const md = renderResults(s, parseThresholds(PROTOCOL_TEXT)) as string;
    expect(md.split("\n")[0]).toContain("pilot — not scored");
    expect(md).toMatch(/Not done:\n\n- pilot — not scored/);
  });

  describe("per-run rows against baseline references", () => {
    async function pair(): Promise<{ changed: Summary; baseline: Summary[] }> {
      const { m, runJson } = await measured();
      const base = summarize(m, runJson, PROTOCOL_SHA) as Summary;
      const changed = summarize({ ...m, shape: "changed", runId: "2026-09-24-replay-4" }, { ...runJson, shape: "changed", runId: "2026-09-24-replay-4" }, PROTOCOL_SHA) as Summary;
      return { changed, baseline: [withLoop(base, 900), withLoop(base, 1000), withLoop(base, 5000)] };
    }
    const T = (): Record<string, unknown> => parseThresholds(PROTOCOL_TEXT) as Record<string, unknown>;

    it("loop-chars: at 0.5 × the baseline median a changed run passes, at 0.51 × it fails", async () => {
      const { changed, baseline } = await pair();
      const at = (v: number): string => lastCell(renderResults({ ...changed, totals: { ...changed.totals, loopCharsPerPass: v } }, T(), baseline) as string, "loop-chars");
      expect(at(500)).toMatch(/^PASS/);
      expect(at(510)).toMatch(/^FAIL/);
      expect(renderResults(changed, T(), baseline)).toContain("Per-run check");
    });

    it("security-seeds: a miss the baseline always found fails; one baseline run missing it exempts it", async () => {
      const { changed, baseline } = await pair();
      expect(lastCell(renderResults(miss(changed), T(), baseline) as string, "security-seeds")).toMatch(/^FAIL.*sec-sql-sort/);
      expect(lastCell(renderResults(miss(changed), T(), [miss(baseline[0]!), baseline[1]!, baseline[2]!]) as string, "security-seeds")).toMatch(/^PASS.*exempt: sec-sql-sort/);
      expect(lastCell(renderResults(changed, T(), baseline) as string, "security-seeds")).toMatch(/^PASS/);
    });

    it("refuses a reference on a baseline-shape run and a reference that is no baseline scored run", async () => {
      const { changed, baseline } = await pair();
      expect(() => renderResults(baseline[0], T(), baseline)).toThrow(/references apply to a changed-shape scored run/);
      expect(() => renderResults(changed, T(), [changed])).toThrow(/is not a baseline scored run/);
      expect(() => renderResults(changed, T(), [{ ...baseline[0]!, protocol: { ...baseline[0]!.protocol, sha256: "0".repeat(64) } }])).toThrow(/protocol sha256/);
    });
  });
});

// ---------- the CLI: run and check ----------

describe("score.mjs run and check", () => {
  it("run writes summary.json and RESULTS.md, and check passes on them", async () => {
    const { result, outDir, runsDir } = await runInto();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const s = JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8")) as Summary;
    expect(s.runId).toBe(RUN_ID);
    expect(s.protocol.sha256).toBe(PROTOCOL_SHA);
    expect(readFileSync(join(outDir, "RESULTS.md"), "utf8")).toContain("No threshold moved.");
    const check = score(["check", "--runs", runsDir, "--protocol", PROTOCOL]);
    expect(check.stderr).toBe("");
    expect(check.status).toBe(0);
    expect(check.stdout).toMatch(/1 run\(s\) checked/);
  });

  it("refuses a second run into the same directory", async () => {
    const first = await runInto();
    expect(first.result.status).toBe(0);
    const again = score(first.args);
    expect(again.status).toBe(1);
    expect(again.stderr).toMatch(/already exists/);
  });

  it("refuses a malformed run id, a run.json protocol sha that differs, and a run id run.json contradicts", async () => {
    const badId = await runInto({ runId: "2026-09-24-run-1" });
    expect(badId.result.status).toBe(1);
    expect(badId.result.stderr).toMatch(/--run-id "2026-09-24-run-1" does not match/);
    const badSha = await runInto({ runOver: { instrument: { commit: COMMIT, protocolSha256: "0".repeat(64), files: {} } } });
    expect(badSha.result.status).toBe(1);
    expect(badSha.result.stderr).toMatch(/instrument\.protocolSha256 0{64} is not the sha256 of the protocol/);
    const other = await runInto({ runId: "2026-09-24-replay-2" });
    expect(other.result.status).toBe(1);
    expect(other.result.stderr).toMatch(/run\.json names run "2026-09-24-replay-1", not "2026-09-24-replay-2"/);
  });

  it("check refuses a leaked absolute path, two instrument commits, a stale protocol sha and a misnamed folder", async () => {
    const { runsDir, outDir } = await runInto();
    const summaryPath = join(outDir, "summary.json");
    const good = readFileSync(summaryPath, "utf8");
    const s = JSON.parse(good) as Summary;

    writeFileSync(summaryPath, JSON.stringify({ ...s, notes: ["read /Users/someone/fx/src/a.ts"] }));
    expect(checkRuns(runsDir, PROTOCOL).problems).toEqual([expect.stringMatching(/2026-09-24-replay-1\/summary\.json carries "\/Users\/"/)]);

    writeFileSync(summaryPath, JSON.stringify({ ...s, protocol: { ...s.protocol, sha256: "0".repeat(64) } }));
    expect(checkRuns(runsDir, PROTOCOL).problems).toEqual([expect.stringMatching(/protocol sha256 0{64} is not the sha256 of the protocol/)]);
    writeFileSync(summaryPath, good);

    const second = await runInto({ runsDir, runId: "2026-09-24-replay-2", runOver: { runId: "2026-09-24-replay-2", instrument: { commit: "9".repeat(40), protocolSha256: PROTOCOL_SHA, files: {} } } });
    expect(second.result.status).toBe(0);
    const cli = score(["check", "--runs", runsDir, "--protocol", PROTOCOL]);
    expect(cli.status).toBe(1);
    expect(cli.stderr).toMatch(/2 instrument commits across the runs/);

    const misnamed = join(scratch(), "runs");
    mkdirSync(join(misnamed, "2026-09-24-replay-7"), { recursive: true });
    writeFileSync(join(misnamed, "2026-09-24-replay-7", "summary.json"), good);
    writeFileSync(join(misnamed, "2026-09-24-replay-7", "RESULTS.md"), "No threshold moved.\n");
    expect(checkRuns(misnamed, PROTOCOL).problems).toEqual([expect.stringMatching(/2026-09-24-replay-7: summary\.json names run "2026-09-24-replay-1"/)]);
  });

  it("check refuses a folder with no run in it", () => {
    const empty = join(scratch(), "runs");
    mkdirSync(empty);
    expect(checkRuns(empty, PROTOCOL).problems).toEqual(["no run directory under the runs folder"]);
  });
});
