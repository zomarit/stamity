import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { UNATTRIBUTED_MAX, measureRun } from "../../scripts/replay/measure.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { NOTE_ROWS, TOTALS_KEYS, checkRuns, parseThresholds, renderResults, summarize, validateSummary, writeRunFolder } from "../../scripts/replay/score.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import * as scoreModule from "../../scripts/replay/score.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import * as protocolsModule from "../../scripts/replay/protocols.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import * as summaryModule from "../../scripts/replay/summary.mjs";
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
    stdout: [JSON.stringify({ type: "system", subtype: "init", model: "claude-opus-5-5", claude_code_version: "2.1.280", skills: ["st-work"], agents: [], slash_commands: ["st-work"], plugins: [], mcp_servers: [], cwd: fixture })],
    transcript,
    subagents: agents.map(subagentOf),
    snapshots: { "u1-p1": { main: SNAPSHOT } },
    state: { "compaction-1-pre": { runId: RUN, ledger: [] }, end: { runId: RUN, ledger: rows } },
    oracle: { schema: "stamity/replay-oracle/v1", run: { status: "ok", detail: "" }, results: [{ seed: "sec-sql-sort", kind: "vitest", status: "pass", detail: "" }, { seed: "cor-page-offset", kind: "vitest", status: "fail", detail: "" }] },
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

  // build/226: a string threshold names a reading; the scorer implements exactly one per key, so a
  // fence edit that names another reading is refused rather than printed beside unchanged arithmetic.
  it.each(["decoyFlags", "approvedUnfixed", "loopCharsReference", "loopCharsScope", "subagentTokensScope", "subagentTokensReference", "securityExemption", "evalSetFloors"])(
    "refuses %s set to a reading the scorer does not implement (build/226)",
    (key) => {
      const other = block.replace(new RegExp(`"${key}":"[^"]*"`), `"${key}":"other-reading"`);
      expect(other).not.toBe(block);
      expect(() => parseThresholds(withBlock(other))).toThrow(new RegExp(`"${key}" is "other-reading"; this scorer implements only "${R1_THRESHOLDS[key as keyof typeof R1_THRESHOLDS]}"`));
    },
  );

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
  { rule: "invalid run", protocol: ["`seeds.json` or `__oracle__`) in any tool input; or a run whose end reason is not `complete`"], code: ["const ALWAYS_FORBIDDEN = ['seeds.json', '__oracle__', 'reference-fixes']", "if (endReason !== 'complete')"] },
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

  it("(build/250) carries the init event's client version and ambient lists into the client block", async () => {
    const { m, runJson } = await measured();
    const s = summarize(m, runJson, PROTOCOL_SHA) as Summary & { client: Record<string, unknown> };
    expect(s.client).toEqual(expect.objectContaining({ version: "2.1.280", initVersion: "2.1.280", ambient: { skills: ["st-work"], agents: [], slashCommands: ["st-work"], plugins: [], mcpServers: [] } }));
    expect(validateSummary(s)).toEqual([]);
    expect(validateSummary({ ...s, client: { ...s.client, ambient: { skills: ["st-work"] } } })).toContain("client is not {version, binarySha256, orchestratorModel, resolvedModels, initVersion, ambient}");
    expect(validateSummary({ ...s, client: { ...s.client, initVersion: undefined } })).toContain("client is not {version, binarySha256, orchestratorModel, resolvedModels, initVersion, ambient}");
    expect(() => summarize({ ...m, client: undefined }, runJson, PROTOCOL_SHA)).toThrow(/measurement: client is not \{version, ambient\}/);
  });

  it("(build/289) names in notDone each ambient list an existing init event does not carry, so a vacuous §3 check is visible", async () => {
    const { m, runJson } = await measured();
    const client = m["client"] as { version: string; ambient: Record<string, string[] | null> };
    const s = summarize({ ...m, client: { ...client, ambient: { ...client.ambient, skills: null, mcpServers: null } } }, runJson, PROTOCOL_SHA) as Summary;
    expect(s.notDone).toEqual([
      "the init event carries no skills list, so the ambient-list check (§3) holds nothing for it",
      "the init event carries no mcp_servers list, so the ambient-list check (§3) holds nothing for it",
    ]);
    // With no init event at all the run is already invalid; no per-list line is added.
    const none = summarize({ ...m, client: { version: null, ambient: null } }, runJson, PROTOCOL_SHA) as Summary;
    expect(none.notDone.filter((x) => x.includes("ambient-list check"))).toEqual([]);
  });

  it("(build/257) names a run.json with no fixture.root in notDone", async () => {
    const { m, runJson } = await measured();
    const s = summarize(m, runJson, PROTOCOL_SHA) as Summary;
    expect(s.notDone).toEqual([]);
    const fixture = runJson["fixture"] as Record<string, unknown>;
    const bare = summarize(m, { ...runJson, fixture: { ...fixture, root: undefined } }, PROTOCOL_SHA) as Summary;
    expect(bare.notDone).toEqual(["run.json records no fixture.root, so no fixture path is redacted from the excerpts and notes"]);
  });

  it("refuses a malformed pass row, seed row, compaction sample or whole-branch row instead of coercing it (build/232)", async () => {
    const { m, runJson } = await measured();
    const passes = m["passes"] as Record<string, unknown>[];
    const u1 = passes[0]!;
    const withPass = (over: Record<string, unknown>): Record<string, unknown> => ({ ...m, passes: [{ ...u1, ...over }, ...passes.slice(1)] });
    const verdict = u1["verdict"] as Record<string, unknown>;
    const seeds = u1["seeds"] as Record<string, unknown>[];
    expect(() => summarize(withPass({ verdict: { ...verdict, rounds: undefined } }), runJson, PROTOCOL_SHA)).toThrow(/measurement: pass u1-p1: verdict\.rounds is not a number/);
    expect(() => summarize(withPass({ verdict: { ...verdict, approvedWithSeedUnfixed: "yes" } }), runJson, PROTOCOL_SHA)).toThrow(/pass u1-p1: verdict\.approvedWithSeedUnfixed is not a boolean/);
    expect(() => summarize(withPass({ breakdown: { ...(u1["breakdown"] as object), briefs: undefined } }), runJson, PROTOCOL_SHA)).toThrow(/pass u1-p1: breakdown\.briefs is not a number/);
    expect(() => summarize(withPass({ seeds: [{ ...seeds[0]!, found: undefined }] }), runJson, PROTOCOL_SHA)).toThrow(/pass u1-p1: seed sec-sql-sort: found is not a boolean/);
    expect(() => summarize(withPass({ decoysFlagged: undefined }), runJson, PROTOCOL_SHA)).toThrow(/pass u1-p1: decoysFlagged is not a list of strings/);
    const samples = m["compactionSamples"] as Record<string, unknown>[];
    expect(() => summarize({ ...m, compactionSamples: [{ ...samples[0]!, valid: undefined }] }, runJson, PROTOCOL_SHA)).toThrow(/compaction sample 1: valid is not a boolean/);
    expect(() => summarize({ ...m, wholeBranch: { finalClass: null } }, runJson, PROTOCOL_SHA)).toThrow(/wholeBranch\.rounds is not a number/);
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

/** The approved-unfixed qualifiers of a RESULTS file. */
const besideApproved = (md: string): string => md.slice(md.indexOf("#### Beside `approved-unfixed`"), md.indexOf("#### Beside `loop-chars`"));

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

  it("words the unreliable split from measure.mjs's UNATTRIBUTED_MAX and eval-set-floors from the fence's reading (build/231)", async () => {
    const { m, runJson } = await measured();
    const s = summarize(m, runJson, PROTOCOL_SHA) as Summary;
    const md = renderResults({ ...s, totals: { ...s.totals, perPassUnreliable: true } }, parseThresholds(PROTOCOL_TEXT)) as string;
    expect(md).toContain(`the per-pass split is UNRELIABLE (over ${(UNATTRIBUTED_MAX as number) * 100}% unattributed)`);
    const floors = md.slice(md.indexOf("#### Beside `eval-set-floors`"), md.indexOf("#### Other measurement notes"));
    expect(floors).toContain("evalSetFloors carried-to-session-2");
  });

  it("(build/289) prints each ambient list's size on the Client line, and an absent list as absent", async () => {
    const { m, runJson } = await measured();
    const md = renderResults(summarize(m, runJson, PROTOCOL_SHA), parseThresholds(PROTOCOL_TEXT)) as string;
    expect(md).toContain("ambient lists: skills 1, agents 0, slash commands 1, plugins 0, MCP servers 0");
    const client = m["client"] as { version: string; ambient: Record<string, string[] | null> };
    const absent = renderResults(summarize({ ...m, client: { ...client, ambient: { ...client.ambient, plugins: null } } }, runJson, PROTOCOL_SHA), parseThresholds(PROTOCOL_TEXT)) as string;
    expect(absent).toContain("plugins absent");
    const none = renderResults(summarize({ ...m, client: { version: null, ambient: null } }, runJson, PROTOCOL_SHA), parseThresholds(PROTOCOL_TEXT)) as string;
    expect(none).toContain("ambient lists: none recorded");
  });

  it("renders the oracle run's own status beside approved-unfixed (build/230)", async () => {
    const { m, runJson } = await measured();
    const s = summarize(m, runJson, PROTOCOL_SHA) as Summary;
    expect(s.totals["oracleRun"]).toEqual({ status: "ok", detail: "" });
    expect(besideApproved(renderResults(s, parseThresholds(PROTOCOL_TEXT)) as string)).toContain("- oracle run: ok");
    const killed = summarize({ ...m, totals: { ...(m["totals"] as object), oracleRun: { status: "killed", detail: "the oracle run was killed by SIGKILL" } } }, runJson, PROTOCOL_SHA);
    expect(besideApproved(renderResults(killed, parseThresholds(PROTOCOL_TEXT)) as string)).toMatch(/- oracle run: killed — the oracle run was killed by SIGKILL — the run itself did not complete/);
    expect(validateSummary({ ...s, totals: { ...s.totals, oracleRun: { status: 3 } } })).toContain("totals.oracleRun is not {status, detail}");
  });

  it("heads a pilot 'pilot — not scored' and lists it under Not done", async () => {
    const { m, runJson } = await measured({ kind: "pilot" });
    const s = summarize(m, runJson, PROTOCOL_SHA) as Summary;
    expect(s.kind).toBe("pilot");
    const md = renderResults(s, parseThresholds(PROTOCOL_TEXT)) as string;
    expect(md.split("\n")[0]).toContain("pilot — not scored");
    expect(md).toMatch(/Not done:\n\n- pilot — not scored/);
  });

  it("(build/313) words a pilot's part in the comparison as compare.mjs reads it: the head and the ambient lists, never the variance", async () => {
    const { m, runJson } = await measured({ kind: "pilot" });
    const s = summarize(m, runJson, PROTOCOL_SHA) as Summary;
    expect(s.notDone[0]).toBe(
      "pilot — not scored: the comparison takes it only as --pilot-baseline or --pilot-changed, names it in its head and holds each scored run of its shape to its ambient lists (§3); it is not read for the sample's variance (§10)",
    );
    expect(renderResults(s, parseThresholds(PROTOCOL_TEXT)) as string).toContain(
      "This run is a pilot. It is never scored: the comparison takes it only as `--pilot-baseline` or `--pilot-changed`, names it in its head, and holds each scored run of its shape to its ambient lists (§3); a shape given no pilot leaves every row it feeds not evaluated. It is not read for the sample's variance, which its shape's scored runs decide (§10).",
    );
    // compare.mjs::sampleOf reads the scored runs only (R28), so no instrument file may still claim a pilot-variance check.
    const dir = join(REPO, "scripts/replay");
    for (const file of readdirSync(dir)) expect(readFileSync(join(dir, file), "utf8"), file).not.toMatch(/pilot[- ]variance/i);
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

    it("(build/283) loop-chars reads the bar exactly: a changed run at exactly 0.5 × an even-count baseline median passes", async () => {
      const { changed, baseline } = await pair();
      // Two references of 30000 and 36008 characters in all: the median is 33004 ÷ 6 per pass, and a changed
      // run of 16502 characters is exactly half of it, which the floating-point product reads as over.
      const refs = [withLoop(baseline[0]!, 30_000 / 6), withLoop(baseline[1]!, 36_008 / 6)];
      const at = (chars: number): string => lastCell(renderResults(withLoop(changed, chars / 6), T(), refs) as string, "loop-chars");
      expect(at(16_502)).toMatch(/^PASS/);
      expect(at(16_503)).toMatch(/^FAIL/);
    });

    it("security-seeds: a miss the baseline always found fails; one baseline run missing it exempts it", async () => {
      const { changed, baseline } = await pair();
      expect(lastCell(renderResults(miss(changed), T(), baseline) as string, "security-seeds")).toMatch(/^FAIL.*sec-sql-sort/);
      expect(lastCell(renderResults(miss(changed), T(), [miss(baseline[0]!), baseline[1]!, baseline[2]!]) as string, "security-seeds")).toMatch(/^PASS.*exempt: sec-sql-sort/);
      expect(lastCell(renderResults(changed, T(), baseline) as string, "security-seeds")).toMatch(/^PASS/);
    });

    it("refuses an invalid baseline as a reference, and renders an invalid run's per-run column not evaluated (build/229)", async () => {
      const { changed, baseline } = await pair();
      expect(() => renderResults(changed, T(), [{ ...baseline[0]!, invalid: ["run.json end.reason is \"stalled\", not \"complete\""] }, baseline[1]!])).toThrow(/reference 1 \(2026-09-24-replay-1\) is an invalid run \(§10\)/);
      const md = renderResults({ ...miss(changed), invalid: ["a stall"] }, T(), baseline) as string;
      for (const row of ["security-seeds", "loop-chars", "compaction-loss", "pooled-recall"]) expect(lastCell(md, row), row).toBe("not evaluated — invalid (§10) |");
      expect(md).not.toMatch(/\| (PASS|FAIL)\b/);
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

  // Assembled from fragments, so this file spells none of the names the leak gate refuses.
  const PRIVATE_NAME = ["stam", "ity", "-gov", "ernance"].join("");

  it("run refuses to write a summary or RESULTS the leak gate would refuse, naming the rule and the file (build/227)", async () => {
    const built = await measured();
    const measurement = join(built.layout.runDir, "measurement.json");
    writeFileSync(measurement, JSON.stringify({ ...built.m, notes: [...built.m.notes, `see the ${PRIVATE_NAME} checkout`] }));
    const outDir = join(scratch(), "runs", RUN_ID);
    const result = score(["run", "--measurement", measurement, "--run-json", built.layout.runJson, "--protocol", PROTOCOL, "--run-id", RUN_ID, "--kind", "scored", "--out-dir", outDir]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/nothing written: summary\.json matches the leak gate's rule private-repo-name; RESULTS\.md matches the leak gate's rule private-repo-name/);
    expect(result.stderr).not.toContain(PRIVATE_NAME);
    expect(existsSync(outDir)).toBe(false);
  });

  it("check fails on a summary or RESULTS the leak gate would refuse, naming the rule and the file (build/227)", async () => {
    const { runsDir, outDir } = await runInto();
    const s = JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8")) as Summary;
    writeFileSync(join(outDir, "summary.json"), JSON.stringify({ ...s, notes: [`the ${PRIVATE_NAME} layer`] }));
    writeFileSync(join(outDir, "RESULTS.md"), `row ${["A", "D"].join("")}-137\n`);
    expect(checkRuns(runsDir, PROTOCOL).problems).toEqual([
      `${RUN_ID}/summary.json matches the leak gate's rule private-repo-name`,
      `${RUN_ID}/RESULTS.md matches the leak gate's rule private-ledger-id`,
    ]);
  });

  it("check refuses a summary whose protocol path is not the committed evals/replay/REPLAY-v1.md (build/233)", async () => {
    const { runsDir, outDir } = await runInto();
    const s = JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8")) as Summary;
    writeFileSync(join(outDir, "summary.json"), JSON.stringify({ ...s, protocol: { ...s.protocol, path: "REPLAY-v1.md" } }));
    expect(checkRuns(runsDir, PROTOCOL).problems).toEqual([`${RUN_ID}: protocol path "REPLAY-v1.md" is not evals/replay/REPLAY-v1.md`]);
  });

  it("run refuses a --protocol other than the committed evals/replay/REPLAY-v1.md, since check would refuse its folder (build/233)", async () => {
    const copy = join(scratch(), "REPLAY-v1.md");
    writeFileSync(copy, PROTOCOL_TEXT);
    const built = await runInto({ extra: [] });
    rmSync(built.outDir, { recursive: true });
    const args = built.args.map((a) => (a === PROTOCOL ? copy : a));
    const result = score(args);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--protocol must be the committed evals\/replay\/REPLAY-v1\.md, not REPLAY-v1\.md/);
    expect(existsSync(built.outDir)).toBe(false);
  });

  describe("invalid runs per shape (§10, build/228)", () => {
    /** A runs folder holding `good` under each run id, with the ids in `invalid` marked invalid and `shape` set. */
    function folder(good: Summary, runs: { id: string; shape: string; kind?: string; invalid?: boolean }[]): string {
      const dir = join(scratch(), "runs");
      for (const r of runs) {
        mkdirSync(join(dir, r.id), { recursive: true });
        writeFileSync(join(dir, r.id, "summary.json"), JSON.stringify({ ...good, runId: r.id, shape: r.shape, kind: r.kind ?? "scored", invalid: r.invalid ? ["run.json end.reason is \"stalled\", not \"complete\""] : [] }));
        writeFileSync(join(dir, r.id, "RESULTS.md"), "No threshold moved.\n");
      }
      return dir;
    }

    it("lists the invalid runs of each shape, and passes at two replacements", async () => {
      const { outDir } = await runInto();
      const good = JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8")) as Summary;
      const dir = folder(good, [
        { id: "2026-09-24-replay-1", shape: "baseline", invalid: true },
        { id: "2026-09-24-replay-2", shape: "baseline", kind: "pilot", invalid: true },
        { id: "2026-09-24-replay-3", shape: "baseline" },
        { id: "2026-09-24-replay-4", shape: "changed" },
      ]);
      const r = checkRuns(dir, PROTOCOL);
      expect(r.problems).toEqual([]);
      expect(r.invalid).toEqual({ baseline: ["2026-09-24-replay-1 (scored)", "2026-09-24-replay-2 (pilot)"], changed: [] });
      const cli = score(["check", "--runs", dir, "--protocol", PROTOCOL]);
      expect(cli.status).toBe(0);
      expect(cli.stdout).toContain("invalid runs (§10, at most 2 replacements per shape): baseline 2 — 2026-09-24-replay-1 (scored), 2026-09-24-replay-2 (pilot); changed 0 — none");
    });

    it("refuses a shape with more than two replacements, and lists them in its output", async () => {
      const { outDir } = await runInto();
      const good = JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8")) as Summary;
      const dir = folder(good, [1, 2, 3].map((n) => ({ id: `2026-09-24-replay-${n}`, shape: "changed", invalid: true })));
      expect(checkRuns(dir, PROTOCOL).problems).toEqual([
        "changed: 3 invalid runs, over the 2 replacements §10 allows per shape — the rows they feed are not evaluated and the merge gate fails",
      ]);
      const cli = score(["check", "--runs", dir, "--protocol", PROTOCOL]);
      expect(cli.status).toBe(1);
      expect(cli.stderr).toContain("invalid runs (§10, at most 2 replacements per shape): baseline 0 — none; changed 3 — 2026-09-24-replay-1 (scored), 2026-09-24-replay-2 (scored), 2026-09-24-replay-3 (scored)");
    });

    it("§10 states the two replacements the check enforces", () => {
      expect(PROTOCOL_TEXT.replace(/\s+/g, " ")).toContain("An incomplete, contaminated or pin-drifted run is invalid and replaced, at most 2 replacements per shape.");
    });
  });

  it("writes the run folder whole or not at all (build/235)", () => {
    const parent = join(scratch(), "runs");
    mkdirSync(parent);
    const outDir = join(parent, RUN_ID);
    expect(() => writeRunFolder(outDir, [["summary.json", "{}\n"], ["missing/RESULTS.md", "x\n"]])).toThrow(/ENOENT/);
    expect(existsSync(outDir)).toBe(false);
    expect(readdirSync(parent)).toEqual([]);
    writeRunFolder(outDir, [["summary.json", "{}\n"], ["RESULTS.md", "x\n"]]);
    expect(readdirSync(outDir).toSorted()).toEqual(["RESULTS.md", "summary.json"]);
    expect(readdirSync(parent)).toEqual([RUN_ID]);
    expect(() => writeRunFolder(outDir, [["summary.json", "{}\n"]])).toThrow();
    expect(readdirSync(parent)).toEqual([RUN_ID]);
  });

  it("(build/256) check names a leftover staging folder of an interrupted run as such", async () => {
    const { runsDir } = await runInto();
    mkdirSync(join(runsDir, `.${RUN_ID}.partial-Ab12Cd`));
    expect(checkRuns(runsDir, PROTOCOL).problems).toEqual([
      `.${RUN_ID}.partial-Ab12Cd: a leftover staging folder of an interrupted score run for ${RUN_ID} — remove it`,
    ]);
  });

  it("check refuses a folder with no run in it", () => {
    const empty = join(scratch(), "runs");
    mkdirSync(empty);
    expect(checkRuns(empty, PROTOCOL).problems).toEqual(["no run directory under the runs folder"]);
  });
});

// ---------- protocol versions (plan 011 v2-protocol-paths; build/273) ----------

/** The module specifiers a replay script names: static imports, re-exports and dynamic imports. */
function specifiersOf(file: string): string[] {
  const src = readFileSync(join(REPO, "scripts/replay", file), "utf8");
  return [...src.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => (m[1] ?? m[2] ?? m[3])!);
}

/**
 * A copy of the instrument in a scratch root: the scripts `score.mjs` loads, REPLAY-v1.md as
 * committed, and a REPLAY-v2.md that is v1's text plus one line — so its sha256 differs and its
 * one thresholds block still parses. `score.mjs` resolves `--protocol v2` against its own checkout,
 * and REPLAY-v2.md is not committed until the v2-protocol unit; a copy is the real CLI over a real
 * tree, where a file written into this checkout would collide with that unit's.
 */
function instrumentCopy(): { root: string; scoreMjs: string; v2Sha: string } {
  // The real path: `score.mjs` runs its CLI only when argv[1] resolves to its own module path, and
  // the OS temp root is a symlink on macOS.
  const root = realpathSync(scratch());
  for (const part of ["scripts/replay", "scripts/qa"]) cpSync(join(REPO, part), join(root, part), { recursive: true });
  cpSync(join(REPO, "scripts/leak-gate.mjs"), join(root, "scripts/leak-gate.mjs"));
  cpSync(PROTOCOL, join(root, "evals/replay/REPLAY-v1.md"));
  const v2Text = `${PROTOCOL_TEXT}\n<!-- a scratch REPLAY-v2 for the scorer's tests -->\n`;
  writeFileSync(join(root, "evals/replay/REPLAY-v2.md"), v2Text);
  return { root, scoreMjs: join(root, "scripts/replay/score.mjs"), v2Sha: createHash("sha256").update(v2Text).digest("hex") };
}

/** `score.mjs` of an instrument copy, run with `args`. */
const scoreIn = (copy: ReturnType<typeof instrumentCopy>, args: string[]) => spawnSync(process.execPath, [copy.scoreMjs, ...args], { encoding: "utf8" });

describe("the protocol table and the import graph (plan 011 v2-protocol-paths, build/273)", () => {
  it("compare.mjs names no score.mjs; protocols.mjs imports nothing under scripts/replay/; summary.mjs names neither script", () => {
    // Non-degenerate: the reader sees the relative imports each file does carry.
    expect(specifiersOf("compare.mjs")).toEqual(expect.arrayContaining(["./protocols.mjs", "./summary.mjs"]));
    expect(specifiersOf("score.mjs")).toContain("./compare.mjs");
    expect(specifiersOf("compare.mjs").filter((s) => s.endsWith("score.mjs"))).toEqual([]);
    expect(specifiersOf("protocols.mjs").filter((s) => s.startsWith("."))).toEqual([]);
    expect(specifiersOf("summary.mjs").filter((s) => /(score|compare)\.mjs$/.test(s))).toEqual([]);
  });

  it("score.mjs re-exports every moved name as the same binding, so its importers read them where they always did", () => {
    const pairs = [
      [scoreModule.MAX_REPLACEMENTS_PER_SHAPE, protocolsModule.MAX_REPLACEMENTS_PER_SHAPE],
      [scoreModule.ROW_IDS, protocolsModule.ROW_IDS],
      [scoreModule.median, protocolsModule.median],
      [scoreModule.securityHeld, protocolsModule.securityHeld],
      [scoreModule.SUMMARY_SCHEMA, summaryModule.SUMMARY_SCHEMA],
      [scoreModule.TOTALS_KEYS, summaryModule.TOTALS_KEYS],
      [scoreModule.validateSummary, summaryModule.validateSummary],
    ];
    for (const [fromScore, moved] of pairs) {
      expect(moved).toBeDefined();
      expect(fromScore).toBe(moved);
    }
  });

  it("PROTOCOLS is the plan's table, and v1 is the default", () => {
    expect(protocolsModule.PROTOCOLS).toEqual({
      v1: { path: "evals/replay/REPLAY-v1.md", data: "evals/replay/v1", runs: "evals/replay/runs", comparison: "evals/replay/COMPARISON-v1.md" },
      v2: { path: "evals/replay/REPLAY-v2.md", data: "evals/replay/v2", runs: "evals/replay/v2/runs", comparison: "evals/replay/COMPARISON-v2.md" },
    });
    expect(protocolsModule.DEFAULT_PROTOCOL).toBe("v1");
  });

  it("checkRuns reads the path of the version it is given: a v2 summary passes under v2 and is refused under v1", async () => {
    const { runsDir, outDir } = await runInto();
    const copy = instrumentCopy();
    const s = JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8")) as Summary;
    writeFileSync(join(outDir, "summary.json"), JSON.stringify({ ...s, protocol: { ...s.protocol, path: "evals/replay/REPLAY-v2.md", sha256: copy.v2Sha } }));
    const v2File = join(copy.root, "evals/replay/REPLAY-v2.md");
    expect(checkRuns(runsDir, v2File, "v2").problems).toEqual([]);
    expect(checkRuns(runsDir, PROTOCOL).problems).toEqual([
      expect.stringMatching(/protocol sha256 [0-9a-f]{64} is not the sha256 of the protocol/),
      `${RUN_ID}: protocol path "evals/replay/REPLAY-v2.md" is not evals/replay/REPLAY-v1.md`,
    ]);
  });

  describe("the CLI under --protocol, over a copy of the instrument", () => {
    /** `run` in the copy: the capture's run.json declares `sha`, the flags name `protocol`. */
    async function runIn(copy: ReturnType<typeof instrumentCopy>, protocol: string, sha: string, runsDir: string, runId = RUN_ID) {
      const built = await measured({ runId, instrument: { commit: COMMIT, protocolSha256: sha, files: { "scripts/replay/measure.mjs": "b".repeat(64) } } });
      const measurement = join(built.layout.runDir, "measurement.json");
      writeFileSync(measurement, JSON.stringify(built.m));
      const outDir = join(runsDir, runId);
      const args = ["run", "--measurement", measurement, "--run-json", built.layout.runJson, "--protocol", protocol, "--run-id", runId, "--kind", "scored", "--out-dir", outDir];
      return { outDir, result: spawnSync(process.execPath, [copy.scoreMjs, ...args], { encoding: "utf8" }) };
    }

    it("run --protocol v2 records REPLAY-v2's path and names REPLAY-v2 and COMPARISON-v2 in RESULTS", async () => {
      const copy = instrumentCopy();
      const { outDir, result } = await runIn(copy, "v2", copy.v2Sha, join(copy.root, "evals/replay/v2/runs"));
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      const s = JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8")) as Summary;
      expect(s.protocol).toEqual({ path: "evals/replay/REPLAY-v2.md", sha256: copy.v2Sha, commit: COMMIT });
      const results = readFileSync(join(outDir, "RESULTS.md"), "utf8");
      expect(results).toContain("- Protocol: REPLAY-v2 (`evals/replay/REPLAY-v2.md`)");
      expect(results).not.toMatch(/REPLAY-v1|COMPARISON-v1/);
    });

    it("check --protocol v2 passes over the v2 runs folder while a v1 run stands in evals/replay/runs/, and each version refuses the other's folder", async () => {
      const copy = instrumentCopy();
      const v1Runs = join(copy.root, "evals/replay/runs");
      const v2Runs = join(copy.root, "evals/replay/v2/runs");
      expect((await runIn(copy, "v1", PROTOCOL_SHA, v1Runs)).result.status).toBe(0);
      expect((await runIn(copy, "v2", copy.v2Sha, v2Runs, "2026-09-24-replay-2")).result.status).toBe(0);
      // --runs defaults to the version's runs folder; the path form of --protocol names the same version.
      const v2 = scoreIn(copy, ["check", "--protocol", "v2"]);
      expect(v2.stderr).toBe("");
      expect(v2.status).toBe(0);
      expect(v2.stdout).toMatch(/1 run\(s\) checked/);
      expect(scoreIn(copy, ["check", "--protocol", join(copy.root, "evals/replay/REPLAY-v2.md"), "--runs", v2Runs]).status).toBe(0);
      expect(scoreIn(copy, ["check"]).status).toBe(0);
      const crossed = scoreIn(copy, ["check", "--protocol", "v2", "--runs", v1Runs]);
      expect(crossed.status).toBe(1);
      expect(crossed.stderr).toContain(`${RUN_ID}: protocol path "evals/replay/REPLAY-v1.md" is not evals/replay/REPLAY-v2.md`);
    });

    it("run --protocol v2 refuses a run.json whose protocol sha256 is REPLAY-v1's, and writes nothing", async () => {
      const copy = instrumentCopy();
      const { outDir, result } = await runIn(copy, "v2", PROTOCOL_SHA, join(copy.root, "evals/replay/v2/runs"));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`run.json instrument.protocolSha256 ${PROTOCOL_SHA} is not the sha256 of the protocol (${copy.v2Sha})`);
      expect(existsSync(outDir)).toBe(false);
    });

    it("an unknown --protocol version exits 1 with the usage in every command, and nothing is written (review/48: exit 2 is compare's FAIL alone)", () => {
      const copy = instrumentCopy();
      const out = join(scratch(), "COMPARISON-v3.md");
      const outDir = join(scratch(), RUN_ID);
      const commands = [
        ["check", "--protocol", "v3"],
        ["run", "--protocol", "v9", "--measurement", "m.json", "--run-json", "run.json", "--run-id", RUN_ID, "--kind", "scored", "--out-dir", outDir],
        ["compare", "--protocol", "v3", "--out", out],
      ];
      for (const args of commands) {
        const result = scoreIn(copy, args);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/--protocol v\d is not a protocol version: v1 or v2, or the committed protocol path/);
        expect(result.stderr).toContain("Usage: node scripts/replay/score.mjs run");
        expect(result.stderr).toContain("An unknown --protocol version exits 1 with this usage: refused, nothing written. Exit 2 means only compare's FAIL.");
      }
      expect(existsSync(out)).toBe(false);
      expect(existsSync(outDir)).toBe(false);
    });

    it("run refuses an --out-dir inside the other version's runs folder, writing nothing, and keeps its own folder and a scratch folder allowed (review/47)", async () => {
      const copy = instrumentCopy();
      const v1Runs = join(copy.root, "evals/replay/runs");
      const v2Runs = join(copy.root, "evals/replay/v2/runs");
      const v2InV1 = await runIn(copy, "v2", copy.v2Sha, v1Runs);
      expect(v2InV1.result.status).toBe(1);
      expect(v2InV1.result.stderr).toContain("--out-dir is inside v1's runs folder evals/replay/runs: a v2 run is written under evals/replay/v2/runs or a scratch folder");
      expect(existsSync(v2InV1.outDir)).toBe(false);
      // Nested deeper under the other version's folder is refused the same way.
      const nested = await runIn(copy, "v2", copy.v2Sha, join(v1Runs, "extra"));
      expect(nested.result.status).toBe(1);
      expect(existsSync(nested.outDir)).toBe(false);
      const v1InV2 = await runIn(copy, "v1", PROTOCOL_SHA, v2Runs);
      expect(v1InV2.result.status).toBe(1);
      expect(v1InV2.result.stderr).toContain("--out-dir is inside v2's runs folder evals/replay/v2/runs: a v1 run is written under evals/replay/runs or a scratch folder");
      expect(existsSync(v1InV2.outDir)).toBe(false);
      // The path form of --protocol resolves to the same version and meets the same refusal.
      const byPath = await runIn(copy, join(copy.root, "evals/replay/REPLAY-v2.md"), copy.v2Sha, v1Runs, "2026-09-24-replay-4");
      expect(byPath.result.status).toBe(1);
      expect(byPath.result.stderr).toContain("--out-dir is inside v1's runs folder");
      const cases = [["v2", copy.v2Sha, v2Runs], ["v2", copy.v2Sha, scratch()], ["v1", PROTOCOL_SHA, v1Runs], ["v1", PROTOCOL_SHA, scratch()]] as const;
      // Each case writes to a folder of its own, so they run side by side.
      for (const allowed of await Promise.all(cases.map(([protocol, sha, dir]) => runIn(copy, protocol, sha, dir, "2026-09-24-replay-5")))) {
        expect(allowed.result.stderr).toBe("");
        expect(allowed.result.status).toBe(0);
        expect(existsSync(join(allowed.outDir, "summary.json"))).toBe(true);
      }
    });

    it("check --protocol v2 before v2's runs folder exists reports the missing folder as a problem, not a raw ENOENT (review/49)", () => {
      const copy = instrumentCopy();
      const result = scoreIn(copy, ["check", "--protocol", "v2"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("[replay] check failed over 0 run folder(s):");
      expect(result.stderr).toContain("no run directory: the runs folder does not exist");
      expect(result.stderr).not.toContain("ENOENT");
    });
  });
});
