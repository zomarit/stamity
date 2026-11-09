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
    const metrics = metricsFrom({ run: RUN, record: RECORD, ledger: LEDGER, transcript: null });

    expect(metrics.wall).toEqual({ minutes: 255, from: "2026-11-05T09:00Z", to: "2026-11-05T13:15Z" });
    expect(metrics.agentMinutes).toEqual({ value: 62, complete: true, usageLines: 4 });
    // 12 minutes plus 6.5, the unanswered ask adding nothing.
    expect(metrics.person).toEqual({ minutes: 19, asks: 3, source: "ask: lines, the run's clock; 1 not answered" });
    expect(metrics.rework.reviewRounds).toBe(3);
  });

  it("gives fix rounds, reopened findings and the findings by state from the ledger", () => {
    const { rework } = metricsFrom({ run: RUN, record: RECORD, ledger: LEDGER, transcript: null });

    expect(rework).toEqual({ reviewRounds: 3, fixRounds: 3, reopened: 3, findings: { fixed: 2, deferred: 1, rejected: 1, open: 1 } });
  });

  it("gives tokens by each message's largest counts, and their cost from the price table", () => {
    const metrics = metricsFrom({ run: RUN, record: RECORD, ledger: LEDGER, transcript: { path: "session.jsonl", read: read(TRANSCRIPT) } });

    expect(metrics.tokens).toEqual({
      value: 2_600_000,
      source: "transcript session.jsonl",
      split: { input: 1_000_000, output: 100_000, cacheRead: 1_000_000, cacheWrite5m: 0, cacheWrite1h: 500_000 },
    });
    expect(metrics.cost).toEqual({ usd: 10.2, priceSource: "Anthropic first-party standard rates, bundled table", accessDate: PRICES_ACCESS_DATE });
  });

  it("reads tokens and cost unreported with no transcript", () => {
    const metrics = metricsFrom({ run: RUN, record: RECORD, ledger: LEDGER, transcript: null });

    expect(metrics.tokens).toEqual({ value: null, source: "no transcript named", split: null });
    expect(metrics.cost).toEqual({ usd: null, priceSource: "no transcript named", accessDate: PRICES_ACCESS_DATE });
  });

  it("reads cost unreported for a model the table does not hold, and for a message at another speed", () => {
    const unknownModel = metricsFrom({ run: RUN, record: RECORD, ledger: LEDGER, transcript: { path: "t", read: read(assistant("m", "claude-haiku-5-5", { input_tokens: 5 })) } });
    const fast = metricsFrom({ run: RUN, record: RECORD, ledger: LEDGER, transcript: { path: "t", read: read(assistant("m", "claude-opus-5-5", { input_tokens: 5, speed: "fast" })) } });

    expect(unknownModel.tokens.value).toBe(5);
    expect(unknownModel.cost).toMatchObject({ usd: null, priceSource: "claude-haiku-5-5 is not in the bundled price table" });
    expect(fast.cost).toMatchObject({ usd: null, priceSource: "1 message at a speed the price table does not cover" });
  });

  it("reads person minutes unreported, not 0, where the record holds no ask: line", () => {
    const record = RECORD.split("\n").filter((line) => !line.includes(" ask: ")).join("\n");

    expect(metricsFrom({ run: RUN, record, ledger: LEDGER, transcript: null }).person).toEqual({ minutes: null, asks: 0, source: "no ask: lines in the record" });
  });

  it("names each read that failed and reads its numbers unreported", () => {
    const metrics = metricsFrom({
      run: RUN,
      record: null,
      recordFailure: `no record at ${RUN_DIR}/record.md`,
      ledger: null,
      ledgerFailure: "ledger.jsonl's line 2 does not read as a row",
      transcript: { path: "gone.jsonl", read: { ok: false, reason: "the transcript could not be read" } },
    });

    expect(metrics.wall).toEqual({ minutes: null, from: null, to: null });
    expect(metrics.agentMinutes).toEqual({ value: null, complete: false, usageLines: 0 });
    expect(metrics.person.minutes).toBeNull();
    expect(metrics.rework).toEqual({ reviewRounds: null, fixRounds: null, reopened: null, findings: { fixed: null, deferred: null, rejected: null, open: null } });
    expect(metrics.tokens).toEqual({ value: null, source: "the transcript could not be read", split: null });
    expect(metrics.unread).toEqual([`no record at ${RUN_DIR}/record.md`, "ledger.jsonl's line 2 does not read as a row", "gone.jsonl: the transcript could not be read"]);
  });

  it("marks agent minutes incomplete where a usage line's minutes do not read", () => {
    const record = `${RECORD}- 2026-11-05T13:20Z usage: close minutes=unreported tokens=unreported (Claude Code)\n`;

    expect(metricsFrom({ run: RUN, record, ledger: [], transcript: null }).agentMinutes).toEqual({ value: 62, complete: false, usageLines: 5 });
  });

  it("prints the proof block's metrics line, with unreported where a number is not known", () => {
    const known = metricsText(metricsFrom({ run: RUN, record: RECORD, ledger: LEDGER, transcript: { path: "t", read: read(TRANSCRIPT) } }));
    const unknown = metricsText(metricsFrom({ run: RUN, record: null, ledger: null, transcript: null }));

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

  it("prints the numbers and the metrics line, and writes no file", async () => {
    const cwd = await seed({ [`${RUN_DIR}/record.md`]: RECORD, [`${RUN_DIR}/ledger.jsonl`]: ledgerText(LEDGER), "session.jsonl": TRANSCRIPT });
    const before = tree(cwd);

    const { code, stdout } = await metrics(cwd, ["--transcript", "session.jsonl"]);

    expect(code).toBe(0);
    expect(stdout.startsWith(`run: ${RUN}\n`)).toBe(true);
    expect(stdout).toContain("metrics: wall=255 agent=62 person=19 rounds=3 fixes=3 reopened=3 tokens=2600000 cost=10.20\n");
    expect(stdout).not.toContain("private words");
    expect(tree(cwd)).toEqual(before);
  });

  it("gives the same numbers under --json", async () => {
    const cwd = await seed({ [`${RUN_DIR}/record.md`]: RECORD, [`${RUN_DIR}/ledger.jsonl`]: ledgerText(LEDGER), "session.jsonl": TRANSCRIPT });

    const { code, stdout } = await metrics(cwd, ["--transcript", "session.jsonl", "--json"]);

    expect(code).toBe(0);
    // The CLI's own envelope (`ok`, `command`) wraps the verb's object, so the case matches the verb's keys inside it.
    expect(JSON.parse(stdout)).toMatchObject({
      subcommand: "metrics",
      ...metricsFrom({ run: RUN, record: RECORD, ledger: LEDGER, transcript: { path: "session.jsonl", read: read(TRANSCRIPT) } }),
    });
    expect(stdout).not.toContain("private words");
  });

  it("reads a run with no ledger as one with no rows", async () => {
    const cwd = await seed({ [`${RUN_DIR}/record.md`]: RECORD });

    const { code, stdout } = await metrics(cwd, ["--json"]);

    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ rework: { fixRounds: 0, reopened: 0 }, unread: [] });
  });

  it("names a missing record, a ledger that does not read and a missing transcript, and exits 0", async () => {
    const cwd = await seed({ [`${RUN_DIR}/ledger.jsonl`]: "{not a row\n" });

    const { code, stdout } = await metrics(cwd, ["--transcript", "gone.jsonl", "--json"]);

    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      wall: { minutes: null },
      rework: { reopened: null },
      tokens: { value: null },
      unread: [`no record at ${RUN_DIR}/record.md`, "ledger.jsonl's line 1 does not read as a row", "gone.jsonl: the transcript could not be read"],
    });
  });

  it("names a record over its cap as not read", async () => {
    const cwd = await seed({ [`${RUN_DIR}/record.md`]: `Status: closed\n${"x".repeat(4_194_304)}` });

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
