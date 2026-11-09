import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCommand } from "../../src/cli/commands/run.ts";
import type { LedgerRow } from "../../src/runs/ledgerStore.ts";
import { metricsFrom, metricsText } from "../../src/runs/metrics.ts";
import { PRICES_ACCESS_DATE } from "../../src/runs/prices.ts";
import { transcriptUsageFromText, type TranscriptRead } from "../../src/runs/transcriptUsage.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * x-run-metrics (REQ-FLOW-183): each shipped item's first numbers. `metricsFrom` is pure, the record, the ledger and a
 * transcript's counts in and numbers out; the verb's cases run through the in-process funnel over a real run folder
 * in a scratch directory, and nothing is mocked: the verb reads files and starts no process.
 */

const RUN = "2026-11-05_sample";
const RUN_DIR = `.stamity/runs/${RUN}`;
const REPORTS = `${RUN_DIR}/reports`;

const RECORD = [
  "# Run record: a sample",
  "",
  "Status: closed",
  "Mode: attended",
  "",
  "## Log",
  "",
  "- 2026-11-05T09:00Z — Frame.",
  "- 2026-11-05T09:00Z usage: frame minutes=10 tokens=unreported (Claude Code)",
  "- 2026-11-05T10:00:30Z usage: build minutes=40 tokens=1000 (Claude Code)",
  "- 2026-11-05T10:12Z ask: phase asked=2026-11-05T10:00Z answered=2026-11-05T10:12Z questions=2",
  "- 2026-11-05T11:00Z usage: review r1 minutes=5 tokens=unreported (Claude Code)",
  "- 2026-11-05T12:00Z usage: review r2 and r3 minutes=7 tokens=unreported (Claude Code)",
  "- 2026-11-05T12:30Z ask: qa asked=2026-11-05T12:20Z answered=2026-11-05T12:26:30Z questions=1",
  "- 2026-11-05T12:40Z ask: close asked=2026-11-05T12:35Z answered=none questions=1",
  "- 22:38Z Default applied: a line with no date is no stamp",
  "- 2026-11-05T13:15Z — Close.",
  "",
].join("\n");

const row = (n: number, state: string, extra: Partial<LedgerRow> = {}): LedgerRow => ({
  id: `${RUN}/review/${n}`,
  phase: "review",
  source: "reviewer",
  severity: "Warning",
  evidence: `src/a.ts:${n} — a finding`,
  state,
  rationale: "",
  ...extra,
});

const LEDGER: readonly LedgerRow[] = [
  row(1, "fixed", { report: `${REPORTS}/alpha-reviewer-r1.md`, reopens: 2 }),
  row(2, "open", { report: `${REPORTS}/alpha-reviewer-r2.md`, reopens: 1, rationale: "re-review not-fixed: still there" }),
  row(3, "deferred", { rationale: `deferred after ${REPORTS}/alpha-fixer-r1.md` }),
  row(4, "rejected", { report: `${REPORTS}/beta-fixer-r1.md` }),
  row(5, "fixed", { rationale: `fixed by ${REPORTS}/alpha-fixer-r1.md and ${REPORTS}/alpha-fixer-r2.md` }),
];

/** The reports folder's names: alpha's fixer ran two rounds and beta's one, so 3; a reviewer's report or a stray file counts nothing. */
const REPORT_NAMES: readonly string[] = ["alpha-fixer-r1.md", "alpha-fixer-r2.md", "beta-fixer-r1.md", "alpha-reviewer-r1.md", "notes.md"];

/** What every count of tokens and its cost says it covers (S66). */
const SCOPE = "the transcript given only, not sub-agents' transcripts";

/** A message's text, which must never reach the output. */
const SECRET = "the person's private words";

const assistant = (id: string, model: string, usage: Record<string, unknown>): string =>
  JSON.stringify({ type: "assistant", timestamp: "2026-11-05T10:00:00.000Z", message: { id, model, content: [{ type: "text", text: SECRET }], usage } });

/** Opus 5.5 at $4 in, $20 out, $0.20 cache read and $8 a 1-hour cache write per million: $4 + $2 + $0.20 + $4 = $10.20. */
const TRANSCRIPT = [
  assistant("msg_a", "claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 10, cache_read_input_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 500_000, ephemeral_5m_input_tokens: 0 } }),
  assistant("msg_a", "claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 500_000, ephemeral_5m_input_tokens: 0 } }),
  assistant("msg_b", "claude-opus-5-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 }),
].join("\n");

const read = (text: string): TranscriptRead => ({ ok: true, usage: transcriptUsageFromText(text) });

describe("metricsFrom", () => {
  it("gives wall, agent and person minutes and the review rounds from the record", () => {
    const metrics = metricsFrom({ run: RUN, reports: REPORT_NAMES, record: RECORD, ledger: LEDGER, transcript: null });

    expect(metrics.wall).toEqual({ minutes: 255, from: "2026-11-05T09:00Z", to: "2026-11-05T13:15Z" });
    expect(metrics.agentMinutes).toEqual({ value: 62, complete: true, usageLines: 4 });
    // 12 minutes plus 6.5, the unanswered ask adding nothing.
    expect(metrics.person).toEqual({ minutes: 19, asks: 3, source: "ask: lines, the run's clock; 1 not answered" });
    expect(metrics.rework.reviewRounds).toBe(3);
  });

  it("gives reopened findings and the findings by state from the ledger, and fix rounds from the reports folder", () => {
    const { rework } = metricsFrom({ run: RUN, reports: REPORT_NAMES, record: RECORD, ledger: LEDGER, transcript: null });

    expect(rework).toEqual({ reviewRounds: 3, fixRounds: 3, reopened: 3, findings: { fixed: 2, deferred: 1, rejected: 1, open: 1 } });
  });

  // review/102 (S67): a fixer report reaches the ledger only where its fixer raised a finding, so the ledger undercounts.
  it("counts fix rounds from the reports folder where no ledger row names a fixer report", () => {
    const quiet = LEDGER.map((entry) => ({ ...entry, rationale: "", report: `${REPORTS}/alpha-reviewer-r1.md` }));

    expect(metricsFrom({ run: RUN, reports: REPORT_NAMES, record: RECORD, ledger: quiet, transcript: null }).rework.fixRounds).toBe(3);
  });

  it("sums each unit's highest fixer round, a unit whose name holds fixer still one unit", () => {
    const reports = ["k-fixer-tool-fixer-r1.md", "k-fixer-tool-fixer-r3.md", "beta-fixer-r2.md", "beta-fixer-r1.md", "report-fixer-r1.md"];

    // 3 for k-fixer-tool and 2 for beta; `report-…` is a name the client refuses to write, so no report.
    expect(metricsFrom({ run: RUN, reports, record: RECORD, ledger: [], transcript: null }).rework.fixRounds).toBe(5);
  });

  it("reads fix rounds unreported, not 0, where the reports folder did not read", () => {
    const metrics = metricsFrom({ run: RUN, reports: null, reportsFailure: `no reports folder at ${REPORTS}`, record: RECORD, ledger: LEDGER, transcript: null });

    expect(metrics.rework.fixRounds).toBeNull();
    expect(metrics.unread).toEqual([`no reports folder at ${REPORTS}`]);
    expect(metricsText(metrics).at(-1)).toContain(" fixes=unreported ");
  });

  // review/104: Date.parse gives NaN for month 13 and rolls Feb 30 into March; neither may print as a number.
  it("reads wall unreported where the first or last stamp is no real date", () => {
    const month13 = `${RECORD}- 2026-13-05T14:00Z — a stamp in no month\n`;
    const feb30 = `- 2026-02-30T09:00Z — Frame.\n${RECORD}`;

    for (const record of [month13, feb30]) {
      const metrics = metricsFrom({ run: RUN, reports: REPORT_NAMES, record, ledger: LEDGER, transcript: null });
      expect(metrics.wall).toEqual({ minutes: null, from: null, to: null });
      expect(metricsText(metrics).join("\n")).not.toContain("NaN");
      expect(metricsText(metrics).at(-1)).toMatch(/^metrics: wall=unreported /);
    }
  });

  it("drops an ask whose stamp is no real date instead of counting a rolled-over span", () => {
    const record = `${RECORD}- 2026-11-05T13:20Z ask: close asked=2026-02-30T10:00Z answered=2026-03-02T11:00Z questions=1\n`;

    // Feb 30 read as March 2 would add 60 minutes.

    expect(metricsFrom({ run: RUN, reports: REPORT_NAMES, record, ledger: LEDGER, transcript: null }).person.minutes).toBe(19);
  });

  // review/100: the old pattern's lazy run between two space runs took seconds on 10^5 spaces; a split reads in one pass.
  it("reads a usage line with a long run of spaces and no minutes in linear time", () => {
    const spaces = " ".repeat(200_000);
    const record = [
      `- 2026-11-05T09:00Z usage:${spaces}x`,
      `- 2026-11-05T09:05Z usage: review r1${spaces}x`,
      `- 2026-11-05T09:10Z usage: review r2${spaces}minutes=3`,
      `- 2026-11-05T09:20Z usage: build${spaces}minutes=7`,
      "",
    ].join("\n");

    const started = performance.now();
    const metrics = metricsFrom({ run: RUN, reports: REPORT_NAMES, record, ledger: [], transcript: null });
    const elapsed = performance.now() - started;

    expect(metrics.agentMinutes).toEqual({ value: 10, complete: false, usageLines: 4 });
    expect(metrics.rework.reviewRounds).toBe(2);
    expect(elapsed).toBeLessThan(1_000);
  });

  it("gives tokens by each message's largest counts, and their cost from the price table", () => {
    const metrics = metricsFrom({ run: RUN, reports: REPORT_NAMES, record: RECORD, ledger: LEDGER, transcript: { path: "session.jsonl", read: read(TRANSCRIPT) } });

    expect(metrics.tokens).toEqual({
      value: 2_600_000,
      source: "transcript session.jsonl",
      split: { input: 1_000_000, output: 100_000, cacheRead: 1_000_000, cacheWrite5m: 0, cacheWrite1h: 500_000 },
      // `scope` added by review/101 (S66): the JSON says what the count covers.
      scope: SCOPE,
    });
    expect(metrics.cost).toEqual({ usd: 10.2, priceSource: "Anthropic first-party standard rates, bundled table", accessDate: PRICES_ACCESS_DATE, scope: SCOPE });
  });

  // review/101 (S66) and review/103: a sub-agent's counts sit in its own transcript, and list rates are no bill.
  it("says the tokens and cost cover the transcript given only, and the cost is an estimate at list rates", () => {
    const lines = metricsText(metricsFrom({ run: RUN, reports: REPORT_NAMES, record: RECORD, ledger: LEDGER, transcript: { path: "session.jsonl", read: read(TRANSCRIPT) } }));
    const tokens = lines.find((line) => line.startsWith("tokens: "));
    const cost = lines.find((line) => line.startsWith("cost: "));

    expect(tokens).toMatch(/^tokens: 2600000 \(.*\) from transcript session\.jsonl, the transcript given only, not sub-agents' transcripts$/);
    expect(cost).toBe(
      `cost: $10.20, an estimate at list rates, not a bill, for the transcript given only, not sub-agents' transcripts (Anthropic first-party standard rates, bundled table, rates read ${PRICES_ACCESS_DATE})`,
    );
  });

  it("reads tokens and cost unreported with no transcript", () => {
    const metrics = metricsFrom({ run: RUN, reports: REPORT_NAMES, record: RECORD, ledger: LEDGER, transcript: null });

    // `scope` added by review/101 (S66); the counts stay null.
    expect(metrics.tokens).toEqual({ value: null, source: "no transcript named", split: null, scope: SCOPE });
    expect(metrics.cost).toEqual({ usd: null, priceSource: "no transcript named", accessDate: PRICES_ACCESS_DATE, scope: SCOPE });
  });

  it("reads cost unreported for a model the table does not hold, and for a message at another speed", () => {
    const unknownModel = metricsFrom({ run: RUN, reports: REPORT_NAMES, record: RECORD, ledger: LEDGER, transcript: { path: "t", read: read(assistant("m", "claude-haiku-5-5", { input_tokens: 5 })) } });
    const fast = metricsFrom({ run: RUN, reports: REPORT_NAMES, record: RECORD, ledger: LEDGER, transcript: { path: "t", read: read(assistant("m", "claude-opus-5-5", { input_tokens: 5, speed: "fast" })) } });

    expect(unknownModel.tokens.value).toBe(5);
    expect(unknownModel.cost).toMatchObject({ usd: null, priceSource: "claude-haiku-5-5 is not in the bundled price table" });
    expect(fast.cost).toMatchObject({ usd: null, priceSource: "1 message at a speed the price table does not cover" });
  });

  it("reads person minutes unreported, not 0, where the record holds no ask: line", () => {
    const record = RECORD.split("\n").filter((line) => !line.includes(" ask: ")).join("\n");

    expect(metricsFrom({ run: RUN, reports: REPORT_NAMES, record, ledger: LEDGER, transcript: null }).person).toEqual({ minutes: null, asks: 0, source: "no ask: lines in the record" });
  });

  it("names each read that failed and reads its numbers unreported", () => {
    const metrics = metricsFrom({
      run: RUN,
      record: null,
      recordFailure: `no record at ${RUN_DIR}/record.md`,
      ledger: null,
      ledgerFailure: "ledger.jsonl's line 2 does not read as a row",
      reports: null,
      reportsFailure: `no reports folder at ${REPORTS}`,
      transcript: { path: "gone.jsonl", read: { ok: false, reason: "the transcript could not be read" } },
    });

    expect(metrics.wall).toEqual({ minutes: null, from: null, to: null });
    expect(metrics.agentMinutes).toEqual({ value: null, complete: false, usageLines: 0 });
    expect(metrics.person.minutes).toBeNull();
    expect(metrics.rework).toEqual({ reviewRounds: null, fixRounds: null, reopened: null, findings: { fixed: null, deferred: null, rejected: null, open: null } });
    expect(metrics.tokens).toEqual({ value: null, source: "the transcript could not be read", split: null, scope: SCOPE });
    expect(metrics.unread).toEqual([
      `no record at ${RUN_DIR}/record.md`,
      "ledger.jsonl's line 2 does not read as a row",
      `no reports folder at ${REPORTS}`,
      "gone.jsonl: the transcript could not be read",
    ]);
  });

  it("marks agent minutes incomplete where a usage line's minutes do not read", () => {
    const record = `${RECORD}- 2026-11-05T13:20Z usage: close minutes=unreported tokens=unreported (Claude Code)\n`;

    expect(metricsFrom({ run: RUN, reports: REPORT_NAMES, record, ledger: [], transcript: null }).agentMinutes).toEqual({ value: 62, complete: false, usageLines: 5 });
  });

  it("prints the proof block's metrics line, with unreported where a number is not known", () => {
    const known = metricsText(metricsFrom({ run: RUN, reports: REPORT_NAMES, record: RECORD, ledger: LEDGER, transcript: { path: "t", read: read(TRANSCRIPT) } }));
    const unknown = metricsText(metricsFrom({ run: RUN, reports: null, record: null, ledger: null, transcript: null }));

    expect(known.at(-1)).toBe("metrics: wall=255 agent=62 person=19 rounds=3 fixes=3 reopened=3 tokens=2600000 cost=10.20");
    expect(unknown.at(-1)).toBe("metrics: wall=unreported agent=unreported person=unreported rounds=unreported fixes=unreported reopened=unreported tokens=unreported cost=unreported");
  });
});

describe("stamity run metrics", () => {
  const getRoot = useTempDir("run-metrics");

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
    await root.seedFiles(files);
    return root.dir;
  }

  const metrics = async (cwd: string, extra: readonly string[] = []) => runInProcess([runCommand], ["run", "metrics", "--run", RUN, ...extra], { cwd });

  /** {@link REPORT_NAMES} as files in the run's reports folder, where fix rounds are counted (S67). */
  const REPORT_FILES: Record<string, string> = Object.fromEntries(REPORT_NAMES.map((name) => [`${REPORTS}/${name}`, "# a report\n"]));

  it("prints the numbers and the metrics line, and writes no file", async () => {
    const cwd = await seed({ [`${RUN_DIR}/record.md`]: RECORD, [`${RUN_DIR}/ledger.jsonl`]: ledgerText(LEDGER), ...REPORT_FILES, "session.jsonl": TRANSCRIPT });
    const before = tree(cwd);

    const { code, stdout } = await metrics(cwd, ["--transcript", "session.jsonl"]);

    expect(code).toBe(0);
    expect(stdout.startsWith(`run: ${RUN}\n`)).toBe(true);
    expect(stdout).toContain("metrics: wall=255 agent=62 person=19 rounds=3 fixes=3 reopened=3 tokens=2600000 cost=10.20\n");
    expect(stdout).not.toContain("private words");
    expect(tree(cwd)).toEqual(before);
  });

  it("gives the same numbers under --json", async () => {
    const cwd = await seed({ [`${RUN_DIR}/record.md`]: RECORD, [`${RUN_DIR}/ledger.jsonl`]: ledgerText(LEDGER), ...REPORT_FILES, "session.jsonl": TRANSCRIPT });

    const { code, stdout } = await metrics(cwd, ["--transcript", "session.jsonl", "--json"]);

    expect(code).toBe(0);
    // The CLI's own envelope (`ok`, `command`) wraps the verb's object, so the case matches the verb's keys inside it.
    expect(JSON.parse(stdout)).toMatchObject({
      subcommand: "metrics",
      ...metricsFrom({ run: RUN, reports: REPORT_NAMES, record: RECORD, ledger: LEDGER, transcript: { path: "session.jsonl", read: read(TRANSCRIPT) } }),
    });
    expect(stdout).not.toContain("private words");
  });

  it("reads a run with no ledger as one with no rows", async () => {
    // Fix rounds come from the reports folder since review/102 (S67), so the case seeds one holding no fixer report.
    const cwd = await seed({ [`${RUN_DIR}/record.md`]: RECORD, [`${REPORTS}/alpha-reviewer-r1.md`]: "# a report\n" });

    const { code, stdout } = await metrics(cwd, ["--json"]);

    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ rework: { fixRounds: 0, reopened: 0 }, unread: [] });
  });

  it("names a missing record, a ledger that does not read, a missing reports folder and a missing transcript, and exits 0", async () => {
    const cwd = await seed({ [`${RUN_DIR}/ledger.jsonl`]: "{not a row\n" });

    const { code, stdout } = await metrics(cwd, ["--transcript", "gone.jsonl", "--json"]);

    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      wall: { minutes: null },
      rework: { fixRounds: null, reopened: null },
      tokens: { value: null },
      unread: [
        `no record at ${RUN_DIR}/record.md`,
        "ledger.jsonl's line 1 does not read as a row",
        `no reports folder at ${REPORTS}`,
        "gone.jsonl: the transcript could not be read",
      ],
    });
  });

  it("reads fix rounds unreported where the reports folder is a file", async () => {
    const cwd = await seed({ [`${RUN_DIR}/record.md`]: RECORD, [REPORTS]: "not a folder\n" });

    const { code, stdout } = await metrics(cwd);

    expect(code).toBe(0);
    expect(stdout).toContain(`not read: ${REPORTS} is not a folder\n`);
    expect(stdout).toContain(" fixes=unreported ");
  });

  it("names a record over its cap as not read", async () => {
    const cwd = await seed({ [`${RUN_DIR}/record.md`]: `Status: closed\n${"x".repeat(4_194_304)}`, ...REPORT_FILES });

    const { code, stdout } = await metrics(cwd, ["--json"]);

    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ unread: [`${RUN_DIR}/record.md is over 4194304 bytes`] });
  });

  it("refuses a value that is no run id", async () => {
    const { code, stderr } = await runInProcess([runCommand], ["run", "metrics", "--run", "../elsewhere"], { cwd: getRoot().dir });

    expect(code).toBe(1);
    expect(stderr).toContain("is not a run id");
  });

  it("takes --transcript only for metrics, and no option of the other subcommands", async () => {
    const cwd = await seed({ [`${RUN_DIR}/record.md`]: RECORD });

    const stray = await metrics(cwd, ["--title", "x"]);
    const elsewhere = await runInProcess([runCommand], ["run", "overview", "--run", RUN, "--transcript", "t.jsonl"], { cwd });
    const empty = await metrics(cwd, ["--transcript", " "]);

    expect(stray.code).toBe(2);
    expect(stray.stderr).toContain("--title does not apply to metrics");
    expect(elsewhere.code).toBe(2);
    expect(elsewhere.stderr).toContain("--transcript does not apply to overview");
    expect(empty.code).toBe(2);
    expect(empty.stderr).toContain("--transcript takes a path");
  });
});
