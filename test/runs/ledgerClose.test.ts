import { existsSync } from "node:fs";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMMANDS } from "../../src/cli.ts";
import { parseClosuresBlock } from "../../src/runs/blocks.ts";
import { applyClosures, closeRow, ClosuresRefused, CLOSURE_TARGET } from "../../src/runs/ledgerStore.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir, type TempDirHandle } from "../support/tempDir.ts";

/**
 * `stamity ledger close`: the closures-block reader, the two store writes
 * (`applyClosures`, `closeRow`) and the CLI subcommand.
 *
 * Real-filesystem lane, as for append: the contract is the bytes of a run's
 * `ledger.jsonl` after a close (which lines moved, which stayed byte for byte,
 * which line ends they kept), none of which a virtual volume can show. The CLI
 * cases run through the in-process funnel, so each also covers the exit code,
 * the single JSON document and `--dry-run`.
 */

const tempDir = useTempDir("stamity-ledger-close");

const RUN = "2026-09-23_demo";
const RUN_DIR = `.stamity/runs/${RUN}`;
const LEDGER = `${RUN_DIR}/ledger.jsonl`;
const REPORT_REL = `${RUN_DIR}/reports/u1-reviewer-r2.md`;
const WINDOWS = process.platform === "win32";

/** The records gate's allowed key set (`test/records/ledgers.test.ts`). */
const ALLOWED_KEYS = new Set([
  "id",
  "phase",
  "source",
  "severity",
  "evidence",
  "state",
  "rationale",
  "retired",
  "report",
  "decision_needed",
]);

const rid = (n: number): string => `${RUN}/review/${n}`;

/** One compact ledger row, `open` with an empty rationale unless overridden. */
function row(n: number, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: rid(n),
    phase: "review",
    source: "reviewer",
    severity: "Warning",
    evidence: `src/a.ts:${n} — finding ${n}`,
    state: "open",
    rationale: "",
    ...extra,
  });
}

/** A legacy row, spelled with the `", "` spacing older ledgers carry. */
const LEGACY = `{"id": "${RUN}/build/1", "phase": "build", "source": "implementer", "severity": "Minor", "evidence": "x", "state": "fixed", "rationale": "done"}`;

interface ClosureLine {
  ledger_id?: unknown;
  status?: unknown;
  [key: string]: unknown;
}

/** A re-review whose one closures block holds `lines` (objects stringified, strings verbatim). */
function rereview(lines: readonly (ClosureLine | string)[]): string {
  const body = lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line)));
  return [
    "# u1 re-review",
    "",
    "verdict: approve",
    "",
    "```stamity-closures",
    ...body,
    "```",
    "",
    "```stamity-findings",
    "```",
    "",
  ].join("\n");
}

const closure = (n: number, status: string): ClosureLine => ({ ledger_id: rid(n), status });

async function seedRun(dir: TempDirHandle, files: Record<string, string> = {}): Promise<void> {
  await mkdir(dir.path(RUN_DIR, "reports"), { recursive: true });
  await dir.seedFiles(files);
}

async function readText(dir: TempDirHandle, rel: string): Promise<string> {
  return await readFile(dir.path(rel), "utf8");
}

function rowsOf(text: string): Record<string, unknown>[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function cli(
  dir: TempDirHandle,
  argv: readonly string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await runInProcess(COMMANDS, argv, { cwd: dir.dir });
}

const CLOSE = ["ledger", "close", "--run", RUN];

function ids(...numbers: number[]): string {
  return numbers.map(rid).join(",");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// The closures block
// ---------------------------------------------------------------------------

describe("parseClosuresBlock", () => {
  it("reads one closure per line, in block order, with its physical line", () => {
    const parsed = parseClosuresBlock(rereview([closure(1, "fixed"), "", closure(2, "regressed")]));

    expect(parsed).toEqual({
      ok: true,
      items: [
        { ledgerId: rid(1), status: "fixed", rationale: null, line: 6 },
        { ledgerId: rid(2), status: "regressed", rationale: null, line: 8 },
      ],
    });
  });

  it("reads an empty block as zero closures, and a CRLF re-review like an LF one", () => {
    expect(parseClosuresBlock(rereview([]))).toEqual({ ok: true, items: [] });
    const crlf = parseClosuresBlock(rereview([closure(3, "not-fixed")]).replaceAll("\n", "\r\n"));
    expect(crlf.ok && crlf.items.map((item) => item.ledgerId)).toEqual([rid(3)]);
  });

  it("refuses no closures block (a findings block is not one), a second block and an unclosed block", () => {
    expect(parseClosuresBlock("```stamity-findings\n```\n")).toEqual({
      ok: false,
      problems: [{ line: 0, message: "no stamity-closures block" }],
    });
    expect(
      parseClosuresBlock(`${rereview([closure(1, "fixed")])}${rereview([closure(2, "fixed")])}`),
    ).toEqual({
      ok: false,
      problems: [
        {
          line: 15,
          message:
            "a second stamity-closures block (the first opens at line 5); a report carries exactly one",
        },
      ],
    });
    expect(parseClosuresBlock("```stamity-closures\n" + JSON.stringify(closure(1, "fixed")))).toEqual({
      ok: false,
      problems: [{ line: 1, message: "the stamity-closures block opened here is never closed" }],
    });
  });

  it("collects every problem of every bad line, and none from the good lines around them", () => {
    const parsed = parseClosuresBlock(
      rereview([
        closure(1, "fixed"),
        closure(2, "done"),
        { ledger_id: rid(3) },
        "not json",
        "[1]",
        { ...closure(4, "fixed"), note: "because" },
        { ledger_id: 7, status: "fixed" },
        { ledger_id: "  ", status: "fixed" },
        { ledger_id: "a\nb", status: 3 },
        closure(1, "not-fixed"),
        closure(5, "rejection-overturned"),
      ]),
    );

    expect(parsed.ok).toBe(false);
    const problems = parsed.ok ? [] : parsed.problems;
    expect(problems.map((problem) => `${problem.line}: ${problem.message}`)).toEqual([
      '7: status "done" is not fixed, not-fixed, regressed, rejection-upheld or rejection-overturned',
      '8: missing "status"',
      expect.stringMatching(/^9: not JSON \(.+\)$/) as unknown as string,
      "10: not a JSON object",
      '11: unknown key "note"',
      "12: ledger_id is not a string",
      "13: ledger_id is empty",
      "14: status 3 is not fixed, not-fixed, regressed, rejection-upheld or rejection-overturned",
      "14: ledger_id spans more than one line",
      `15: ledger_id "${rid(1)}" repeats line 6`,
    ]);
  });

  it("admits an optional rationale, trimmed and stripped of control, bidi and zero-width characters", () => {
    const parsed = parseClosuresBlock(
      rereview([
        { ...closure(1, "fixed"), rationale: "  covered by \u202Ethe\u200B new\u0085 test\u001b  " },
        // Stripped before the cap: 2,000 characters plus two invisible ones fit.
        { ...closure(2, "not-fixed"), rationale: `${"x".repeat(2_000)}\u200B\u2066` },
      ]),
    );

    expect(parsed).toEqual({
      ok: true,
      items: [
        { ledgerId: rid(1), status: "fixed", rationale: "covered by the new test", line: 6 },
        { ledgerId: rid(2), status: "not-fixed", rationale: "x".repeat(2_000), line: 7 },
      ],
    });
  });

  it("refuses a rationale that is not a string, spans lines, is blank once stripped, or is over 2,000 characters", () => {
    const parsed = parseClosuresBlock(
      rereview([
        { ...closure(1, "fixed"), rationale: 5 },
        { ...closure(2, "fixed"), rationale: "first\nsecond" },
        { ...closure(3, "fixed"), rationale: "   " },
        { ...closure(4, "fixed"), rationale: "\u200B\u202E\u2060" },
        { ...closure(5, "fixed"), rationale: "x".repeat(2_001) },
        { ...closure(6, "fixed"), rationale: null },
      ]),
    );

    const problems = parsed.ok ? [] : parsed.problems;
    expect(problems.map((problem) => `${problem.line}: ${problem.message}`)).toEqual([
      "6: rationale is not a string",
      "7: rationale spans more than one line",
      "8: rationale is empty",
      "9: rationale is empty",
      "10: rationale is over 2000 characters",
      "11: rationale is not a string",
    ]);
  });

  it("cuts every quoted fragment of report text at 60 code points plus an ellipsis", () => {
    const long = "é".repeat(80);
    const parsed = parseClosuresBlock(rereview([{ ledger_id: "x", status: long, [long]: 1 }]));

    const messages = parsed.ok ? [] : parsed.problems.map((problem) => problem.message);
    const cut = `${"é".repeat(60)}…`;
    expect(messages).toEqual([
      `unknown key ${JSON.stringify(cut)}`,
      `status ${JSON.stringify(cut)} is not fixed, not-fixed, regressed, rejection-upheld or rejection-overturned`,
    ]);
  });
});

describe("CLOSURE_TARGET", () => {
  it("maps fixed to fixed, rejection-upheld to rejected, and keeps the other three open", () => {
    expect(CLOSURE_TARGET).toEqual({
      fixed: "fixed",
      "not-fixed": "open",
      regressed: "open",
      "rejection-upheld": "rejected",
      "rejection-overturned": "open",
    });
  });
});

// ---------------------------------------------------------------------------
// applyClosures
// ---------------------------------------------------------------------------

describe("applyClosures", () => {
  const FIVE = [
    closure(1, "fixed"),
    closure(2, "rejection-upheld"),
    closure(3, "not-fixed"),
    closure(4, "regressed"),
    closure(5, "rejection-overturned"),
  ];

  async function apply(
    dir: TempDirHandle,
    closures: readonly ClosureLine[],
    handed: readonly string[],
    dryRun = false,
  ): ReturnType<typeof applyClosures> {
    const parsed = parseClosuresBlock(rereview(closures));
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.problems));
    return await applyClosures({
      rootDir: dir.dir,
      runId: RUN,
      closures: parsed.items,
      handedIds: handed,
      report: REPORT_REL,
      dryRun,
    });
  }

  it("moves five open rows to fixed, rejected, open, open and open, each rationale ending in its note", async () => {
    const dir = tempDir();
    const before = [LEGACY, row(1), row(2), row(3, { rationale: "kept once" }), row(4), row(5), ""].join("\n");
    await seedRun(dir, { [LEDGER]: before });

    const result = await apply(dir, FIVE, [1, 2, 3, 4, 5].map(rid));

    const after = await readText(dir, LEDGER);
    const rows = rowsOf(after);
    expect(rows.map((r) => r["id"])).toEqual([`${RUN}/build/1`, ...[1, 2, 3, 4, 5].map(rid)]);
    expect(rows.map((r) => r["state"])).toEqual(["fixed", "fixed", "rejected", "open", "open", "open"]);
    expect(rows.map((r) => r["rationale"])).toEqual([
      "done",
      `re-review fixed: ${REPORT_REL}`,
      `re-review rejection-upheld: ${REPORT_REL}`,
      `kept once | re-review not-fixed: ${REPORT_REL}`,
      `re-review regressed: ${REPORT_REL}`,
      `re-review rejection-overturned: ${REPORT_REL}`,
    ]);
    // The legacy line, untouched, keeps its spacing byte for byte.
    expect(after.split("\n")[0]).toBe(LEGACY);
    expect(after.split("\n")).toHaveLength(before.split("\n").length);
    expect(result.changes).toEqual([
      { ledgerId: rid(1), from: "open", to: "fixed", status: "fixed", unchanged: false },
      { ledgerId: rid(2), from: "open", to: "rejected", status: "rejection-upheld", unchanged: false },
      { ledgerId: rid(3), from: "open", to: "open", status: "not-fixed", unchanged: false },
      { ledgerId: rid(4), from: "open", to: "open", status: "regressed", unchanged: false },
      { ledgerId: rid(5), from: "open", to: "open", status: "rejection-overturned", unchanged: false },
    ]);
    expect(result.ledger).toBe(LEDGER);
  });

  it("reopens a fixed row on a regressed closure", async () => {
    const dir = tempDir();
    await seedRun(dir, { [LEDGER]: `${row(1, { state: "fixed", rationale: "fixed in abc" })}\n` });

    await apply(dir, [closure(1, "regressed")], [rid(1)]);

    expect(rowsOf(await readText(dir, LEDGER))[0]).toMatchObject({
      state: "open",
      rationale: `fixed in abc | re-review regressed: ${REPORT_REL}`,
    });
  });

  it("refuses an unknown ledger_id among valid ones, naming its line, and writes nothing", async () => {
    const dir = tempDir();
    const before = `${row(1)}\n${row(2)}\n`;
    await seedRun(dir, { [LEDGER]: before });

    const failure = apply(dir, [closure(1, "fixed"), closure(9, "fixed"), closure(2, "fixed")], [
      rid(1),
      rid(9),
      rid(2),
    ]);

    await expect(failure).rejects.toBeInstanceOf(ClosuresRefused);
    await expect(failure).rejects.toMatchObject({
      problems: [{ line: 7, message: `ledger_id "${rid(9)}" is not a row of ${LEDGER}` }],
    });
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("refuses a closure on a deferred row, and on a fixed row for anything but regressed", async () => {
    const dir = tempDir();
    const before = `${row(1, { state: "deferred" })}\n${row(2, { state: "fixed" })}\n${row(3)}\n`;
    await seedRun(dir, { [LEDGER]: before });

    const failure = apply(dir, [closure(1, "fixed"), closure(2, "not-fixed"), closure(3, "fixed")], [
      rid(1),
      rid(2),
      rid(3),
    ]);

    await expect(failure).rejects.toMatchObject({
      problems: [
        {
          line: 6,
          message: `${rid(1)} is deferred, not open; only an open row takes a closure (a regressed closure also reopens a fixed row)`,
        },
        {
          line: 7,
          message: `${rid(2)} is fixed, not open; only an open row takes a closure (a regressed closure also reopens a fixed row)`,
        },
      ],
    });
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("is idempotent: a re-run reports every closure unchanged and leaves the file byte-identical", async () => {
    const dir = tempDir();
    await seedRun(dir, { [LEDGER]: [row(1), row(2), row(3), row(4), row(5), ""].join("\n") });
    await apply(dir, FIVE, [1, 2, 3, 4, 5].map(rid));
    const once = await readText(dir, LEDGER);

    const again = await apply(dir, FIVE, [1, 2, 3, 4, 5].map(rid));

    expect(again.changes.every((change) => change.unchanged)).toBe(true);
    expect(again.changes).toHaveLength(5);
    expect(await readText(dir, LEDGER)).toBe(once);
  });

  it("appends a closure's rationale after its note, and reports a re-run of it unchanged", async () => {
    const dir = tempDir();
    await seedRun(dir, { [LEDGER]: `${row(1, { rationale: "first look" })}\n${row(2)}\n` });
    const withWhy = [
      { ...closure(1, "fixed"), rationale: "covered by the new test" },
      { ...closure(2, "not-fixed"), rationale: "the guard is still missing" },
    ];

    await apply(dir, withWhy, [rid(1), rid(2)]);
    const once = await readText(dir, LEDGER);
    expect(rowsOf(once).map((r) => [r["state"], r["rationale"]])).toEqual([
      ["fixed", `first look | re-review fixed: ${REPORT_REL} — covered by the new test`],
      ["open", `re-review not-fixed: ${REPORT_REL} — the guard is still missing`],
    ]);

    const again = await apply(dir, withWhy, [rid(1), rid(2)]);
    expect(again.changes).toEqual([
      { ledgerId: rid(1), from: "fixed", to: "fixed", status: "fixed", unchanged: true },
      { ledgerId: rid(2), from: "open", to: "open", status: "not-fixed", unchanged: true },
    ]);
    expect(await readText(dir, LEDGER)).toBe(once);
  });

  it("refuses a stale fixed re-run after a later re-review reopened the row, and writes nothing", async () => {
    const dir = tempDir();
    await seedRun(dir, { [LEDGER]: `${row(1)}\n` });
    const later = `${RUN_DIR}/reports/u1-reviewer-r3.md`;
    await apply(dir, [closure(1, "fixed")], [rid(1)]);
    const regressed = parseClosuresBlock(rereview([closure(1, "regressed")]));
    if (!regressed.ok) throw new Error("fixture does not parse");
    await applyClosures({
      rootDir: dir.dir,
      runId: RUN,
      closures: regressed.items,
      handedIds: [rid(1)],
      report: later,
      dryRun: false,
    });
    const reopened = await readText(dir, LEDGER);
    expect(rowsOf(reopened)[0]).toMatchObject({ state: "open" });

    await expect(apply(dir, [closure(1, "fixed")], [rid(1)])).rejects.toMatchObject({
      problems: [
        {
          line: 6,
          message: `${rid(1)} is open, not fixed, but its rationale already records re-review fixed: ${REPORT_REL}; a closure is applied once`,
        },
      ],
    });
    expect(await readText(dir, LEDGER)).toBe(reopened);
  });

  it("refuses a fixed closure on an open row whose rationale was hand-planted with its note", async () => {
    const dir = tempDir();
    const before = `${row(1, { rationale: `re-review fixed: ${REPORT_REL}` })}\n`;
    await seedRun(dir, { [LEDGER]: before });

    await expect(apply(dir, [closure(1, "fixed")], [rid(1)])).rejects.toMatchObject({
      problems: [
        {
          line: 6,
          message: `${rid(1)} is open, not fixed, but its rationale already records re-review fixed: ${REPORT_REL}; a closure is applied once`,
        },
      ],
    });
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("keeps report, decision_needed and retired in their original order, within the records gate's keys", async () => {
    const dir = tempDir();
    const line = JSON.stringify({
      id: rid(1),
      phase: "review",
      source: "reviewer",
      severity: "Critical",
      evidence: "e",
      state: "open",
      rationale: "",
      retired: "2026-09-01",
      report: `${RUN_DIR}/reports/u1-reviewer-r1.md`,
      decision_needed: true,
    });
    await seedRun(dir, { [LEDGER]: `${line}\n` });

    await apply(dir, [closure(1, "fixed")], [rid(1)]);

    const [rewritten] = rowsOf(await readText(dir, LEDGER));
    expect(Object.keys(rewritten ?? {})).toEqual(Object.keys(JSON.parse(line) as object));
    expect(Object.keys(rewritten ?? {}).every((key) => ALLOWED_KEYS.has(key))).toBe(true);
    expect(rewritten).toMatchObject({ report: `${RUN_DIR}/reports/u1-reviewer-r1.md`, decision_needed: true, retired: "2026-09-01" });
  });

  it("refuses the whole close when one closure names an open row that was not handed, and moves no handed row", async () => {
    const dir = tempDir();
    const before = `${row(1)}\n${row(2)}\n${row(3)}\n`;
    await seedRun(dir, { [LEDGER]: before });

    const failure = apply(dir, [closure(1, "fixed"), closure(3, "fixed"), closure(2, "fixed")], [
      rid(1),
      rid(2),
    ]);

    await expect(failure).rejects.toMatchObject({
      problems: [
        { line: 7, message: `ledger_id "${rid(3)}" was not handed to this re-review (not in --ids)` },
      ],
    });
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("closes a decision_needed row only when its id was handed", async () => {
    const dir = tempDir();
    const before = `${row(1, { decision_needed: true })}\n${row(2)}\n`;
    await seedRun(dir, { [LEDGER]: before });

    await expect(apply(dir, [closure(1, "fixed"), closure(2, "fixed")], [rid(2)])).rejects.toMatchObject({
      problems: [{ line: 6, message: `ledger_id "${rid(1)}" was not handed to this re-review (not in --ids)` }],
    });
    expect(await readText(dir, LEDGER)).toBe(before);
    expect(rowsOf(before)[0]).toMatchObject({ state: "open", rationale: "" });

    await apply(dir, [closure(1, "fixed"), closure(2, "fixed")], [rid(1), rid(2)]);
    expect(rowsOf(await readText(dir, LEDGER))[0]).toMatchObject({
      state: "fixed",
      decision_needed: true,
    });
  });

  it("checks the handed list before the row's state: a non-handed deferred row reads 'not in --ids'", async () => {
    const dir = tempDir();
    await seedRun(dir, { [LEDGER]: `${row(1, { state: "deferred" })}\n` });

    await expect(apply(dir, [closure(1, "fixed")], [rid(2)])).rejects.toMatchObject({
      problems: [{ line: 6, message: `ledger_id "${rid(1)}" was not handed to this re-review (not in --ids)` }],
    });
  });

  it("leaves a handed id that carries no closure byte-identical", async () => {
    const dir = tempDir();
    const untouched = row(2, { rationale: "waiting" });
    await seedRun(dir, { [LEDGER]: `${row(1)}\n${untouched}\n` });

    const result = await apply(dir, [closure(1, "fixed")], [rid(1), rid(2)]);

    expect(result.changes.map((change) => change.ledgerId)).toEqual([rid(1)]);
    expect((await readText(dir, LEDGER)).split("\n")[1]).toBe(untouched);
  });

  it("rewrites a CRLF ledger's lines with CRLF and keeps the others byte for byte", async () => {
    const dir = tempDir();
    const before = `${LEGACY}\r\n${row(1)}\r\n${row(2)}\r\n`;
    await seedRun(dir, { [LEDGER]: before });

    await apply(dir, [closure(1, "fixed")], [rid(1)]);

    const after = await readText(dir, LEDGER);
    const lines = after.split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(LEGACY);
    expect(lines[2]).toBe(row(2));
    expect(lines[3]).toBe("");
    expect(after.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("keeps a hand-edited unparseable line and reports it; a closure naming its id reads 'not a row'", async () => {
    const dir = tempDir();
    const broken = `{"id":"${rid(2)}", broken`;
    await seedRun(dir, { [LEDGER]: `${row(1)}\n${broken}\n${row(3)}\n` });

    const result = await apply(dir, [closure(3, "fixed")], [rid(3)]);
    expect(result.unreadableLines).toEqual([2]);
    expect((await readText(dir, LEDGER)).split("\n")[1]).toBe(broken);

    await expect(apply(dir, [closure(2, "fixed")], [rid(2)])).rejects.toMatchObject({
      problems: [{ line: 6, message: `ledger_id "${rid(2)}" is not a row of ${LEDGER}` }],
    });
  });

  it("previews under a dry run and writes nothing, not even the reports ignore file", async () => {
    const dir = tempDir();
    const before = `${row(1)}\n`;
    await seedRun(dir, { [LEDGER]: before });

    const result = await apply(dir, [closure(1, "fixed")], [rid(1)], true);

    expect(result.changes).toEqual([
      { ledgerId: rid(1), from: "open", to: "fixed", status: "fixed", unchanged: false },
    ]);
    expect(await readText(dir, LEDGER)).toBe(before);
    expect(existsSync(dir.path(RUN_DIR, "reports", ".gitignore"))).toBe(false);
  });

  it("ensures the reports folder's ignore file on a real close", async () => {
    const dir = tempDir();
    await seedRun(dir, { [LEDGER]: `${row(1)}\n` });

    await apply(dir, [closure(1, "fixed")], [rid(1)]);

    expect(await readText(dir, `${RUN_DIR}/reports/.gitignore`)).toBe("*\n");
  });

  it.skipIf(WINDOWS)("refuses a symlinked ledger rather than rewriting through it", async () => {
    const dir = tempDir();
    await seedRun(dir, { "elsewhere.jsonl": `${row(1)}\n` });
    await symlink(dir.path("elsewhere.jsonl"), dir.path(LEDGER));

    await expect(apply(dir, [closure(1, "fixed")], [rid(1)])).rejects.toMatchObject({
      code: "FS_ERROR",
    });
    expect(await readText(dir, "elsewhere.jsonl")).toBe(`${row(1)}\n`);
  });
});

// ---------------------------------------------------------------------------
// closeRow
// ---------------------------------------------------------------------------

describe("closeRow", () => {
  const manual = async (
    dir: TempDirHandle,
    ledgerId: string,
    state: "fixed" | "rejected" | "deferred",
    rationale: string,
    dryRun = false,
  ): ReturnType<typeof closeRow> =>
    await closeRow({ rootDir: dir.dir, runId: RUN, ledgerId, state, rationale, dryRun });

  it("sets the state and the rationale at the row's original line position", async () => {
    const dir = tempDir();
    await seedRun(dir, { [LEDGER]: `${row(1)}\n${row(2)}\n${row(3)}\n` });

    const result = await manual(dir, rid(2), "deferred", "  waits for the 1.11 cut  ");

    const lines = (await readText(dir, LEDGER)).split("\n");
    expect(lines[0]).toBe(row(1));
    expect(lines[2]).toBe(row(3));
    expect(JSON.parse(lines[1] ?? "")).toMatchObject({
      id: rid(2),
      state: "deferred",
      rationale: "waits for the 1.11 cut",
    });
    expect(result.changes).toEqual([
      { ledgerId: rid(2), from: "open", to: "deferred", status: null, unchanged: false },
    ]);
  });

  it("appends to a prior rationale with ' | ', and reports an already-recorded transition unchanged", async () => {
    const dir = tempDir();
    await seedRun(dir, { [LEDGER]: `${row(1, { rationale: "first look" })}\n` });

    await manual(dir, rid(1), "rejected", "not a defect");
    const once = await readText(dir, LEDGER);
    expect(rowsOf(once)[0]).toMatchObject({ state: "rejected", rationale: "first look | not a defect" });

    const again = await manual(dir, rid(1), "rejected", "not a defect");
    expect(again.changes).toEqual([
      { ledgerId: rid(1), from: "rejected", to: "rejected", status: null, unchanged: true },
    ]);
    expect(await readText(dir, LEDGER)).toBe(once);
  });

  it("refuses an id absent from the ledger with the ledger byte-identical", async () => {
    const dir = tempDir();
    const before = `${row(1)}\n`;
    await seedRun(dir, { [LEDGER]: before });

    await expect(manual(dir, rid(7), "deferred", "x")).rejects.toThrow(
      `ledger close refused: ${rid(7)} is not a row of ${LEDGER}`,
    );
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it.each([
    ["an empty rationale", "   "],
    ["a rationale over 2,000 characters", "x".repeat(2_001)],
  ])("refuses %s", async (_label, rationale) => {
    const dir = tempDir();
    const before = `${row(1)}\n`;
    await seedRun(dir, { [LEDGER]: before });

    await expect(manual(dir, rid(1), "deferred", rationale)).rejects.toThrow(
      "ledger close --id needs a non-empty --rationale of at most 2000 characters",
    );
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("admits a rationale of exactly 2,000 characters", async () => {
    const dir = tempDir();
    await seedRun(dir, { [LEDGER]: `${row(1)}\n` });

    await manual(dir, rid(1), "deferred", "y".repeat(2_000));

    expect(rowsOf(await readText(dir, LEDGER))[0]?.["rationale"]).toBe("y".repeat(2_000));
  });

  it("strips control, bidi and zero-width characters from the rationale before the cap and the write", async () => {
    const dir = tempDir();
    await seedRun(dir, { [LEDGER]: `${row(1)}\n${row(2)}\n` });

    await manual(dir, rid(1), "deferred", " after \u202Ethe\u200B cut\u0085\u001b[2J ");
    await manual(dir, rid(2), "deferred", `${"z".repeat(2_000)}\u2066\u200B`);

    const rows = rowsOf(await readText(dir, LEDGER));
    expect(rows[0]?.["rationale"]).toBe("after the cut[2J");
    expect(rows[1]?.["rationale"]).toBe("z".repeat(2_000));
  });

  it("refuses a rationale that is blank once stripped", async () => {
    const dir = tempDir();
    const before = `${row(1)}\n`;
    await seedRun(dir, { [LEDGER]: before });

    await expect(manual(dir, rid(1), "deferred", "\u200B\u202E")).rejects.toThrow(
      "ledger close --id needs a non-empty --rationale of at most 2000 characters",
    );
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("previews under a dry run and writes nothing, not even the reports ignore file", async () => {
    const dir = tempDir();
    const before = `${row(1)}\n${row(2)}\n`;
    await seedRun(dir, { [LEDGER]: before });

    const result = await manual(dir, rid(2), "rejected", "not a defect", true);

    expect(result.changes).toEqual([
      { ledgerId: rid(2), from: "open", to: "rejected", status: null, unchanged: false },
    ]);
    expect(await readText(dir, LEDGER)).toBe(before);
    expect(existsSync(dir.path(RUN_DIR, "reports", ".gitignore"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The CLI
// ---------------------------------------------------------------------------

describe("stamity ledger close", () => {
  it("applies a closures block and prints `<id> <from> -> <to> (<status>)` per change", async () => {
    const dir = tempDir();
    await seedRun(dir, {
      [LEDGER]: `${row(1)}\n${row(2)}\n`,
      [REPORT_REL]: rereview([closure(1, "fixed"), closure(2, "not-fixed")]),
    });

    const result = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1, 2)]);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      `${rid(1)} open -> fixed (fixed)\n${rid(2)} open -> open (not-fixed)\n`,
    );
    expect(rowsOf(await readText(dir, LEDGER)).map((r) => r["state"])).toEqual(["fixed", "open"]);
  });

  it("prints only `unchanged` lines on a re-run and leaves the ledger byte-identical", async () => {
    const dir = tempDir();
    await seedRun(dir, {
      [LEDGER]: `${row(1)}\n${row(2)}\n`,
      [REPORT_REL]: rereview([closure(1, "fixed"), closure(2, "not-fixed")]),
    });
    await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1, 2)]);
    const once = await readText(dir, LEDGER);

    const again = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1, 2)]);

    expect(again.code).toBe(0);
    expect(again.stdout).toBe(
      `${rid(1)} unchanged (already recorded)\n${rid(2)} unchanged (already recorded)\n`,
    );
    expect(await readText(dir, LEDGER)).toBe(once);
  });

  it("splits --ids on commas, trims, drops blanks and collapses duplicates", async () => {
    const dir = tempDir();
    await seedRun(dir, {
      [LEDGER]: `${row(1)}\n${row(2)}\n`,
      [REPORT_REL]: rereview([closure(1, "fixed"), closure(2, "fixed")]),
    });

    const result = await cli(dir, [
      ...CLOSE,
      "--report",
      REPORT_REL,
      "--ids",
      ` ${rid(1)} ,, ${rid(2)},${rid(1)}, `,
    ]);

    expect(result.code).toBe(0);
    expect(rowsOf(await readText(dir, LEDGER)).map((r) => r["state"])).toEqual(["fixed", "fixed"]);
  });

  it("refuses a closure outside --ids, naming its line and id, with the ledger byte-unchanged", async () => {
    const dir = tempDir();
    const before = `${row(1)}\n${row(2)}\n${row(3, { decision_needed: true })}\n`;
    await seedRun(dir, {
      [LEDGER]: before,
      [REPORT_REL]: rereview([closure(1, "fixed"), closure(2, "fixed"), closure(3, "fixed")]),
    });

    const result = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1, 2)]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(`ledger close refused ${REPORT_REL}`);
    expect(result.stderr).toContain(
      `${REPORT_REL}:8: ledger_id "${rid(3)}" was not handed to this re-review (not in --ids)`,
    );
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("qualifies a <phase>/<n> id with --run's id, in the closures block and in --ids alike", async () => {
    // Ledger row build/264: the engine matched only the full id while the
    // run's own reviewers wrote the short form, so closures were applied by hand.
    const dir = tempDir();
    await seedRun(dir, {
      [LEDGER]: `${row(1)}\n${row(2)}\n${row(3)}\n`,
      [REPORT_REL]: rereview([
        { ledger_id: "review/1", status: "fixed" },
        closure(2, "fixed"),
        { ledger_id: "review/3", status: "not-fixed" },
      ]),
    });

    const result = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", `review/1,review/2,${rid(3)}`]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(
      `${rid(1)} open -> fixed (fixed)\n${rid(2)} open -> fixed (fixed)\n${rid(3)} open -> open (not-fixed)\n`,
    );
    expect(rowsOf(await readText(dir, LEDGER)).map((r) => r["state"])).toEqual(["fixed", "fixed", "open"]);

    // The re-run reads the same rows through either spelling: unchanged, byte-identical.
    const once = await readText(dir, LEDGER);
    const again = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1, 2, 3)]);
    expect(again.code, again.stderr).toBe(0);
    expect(again.stdout).toBe(
      `${rid(1)} unchanged (already recorded)\n${rid(2)} unchanged (already recorded)\n${rid(3)} unchanged (already recorded)\n`,
    );
    expect(await readText(dir, LEDGER)).toBe(once);
  });

  it("refuses the whole close when a closure or --ids names another run's row", async () => {
    const dir = tempDir();
    const other = "2026-09-22_other/review/2";
    const before = `${row(1)}\n${row(2)}\n`;
    await seedRun(dir, {
      [LEDGER]: before,
      [REPORT_REL]: rereview([closure(1, "fixed"), { ledger_id: other, status: "fixed" }]),
    });

    const inBlock = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", `${ids(1)},${other}`]);
    expect(inBlock.code).toBe(1);
    expect(inBlock.stdout).toBe("");
    expect(inBlock.stderr).toContain(`ledger close refused: --ids names ${other}, a row of run 2026-09-22_other, not ${RUN}`);
    expect(await readText(dir, LEDGER)).toBe(before);

    // Handed only this run's ids: the foreign closure alone refuses the close, naming its line.
    const blockOnly = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1, 2)]);
    expect(blockOnly.code).toBe(1);
    expect(blockOnly.stderr).toContain(
      `${REPORT_REL}:7: ledger_id "${other}" names run 2026-09-22_other, not ${RUN}; a close moves only its own run's rows`,
    );
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("refuses one row closed twice through its two spellings", async () => {
    const dir = tempDir();
    const before = `${row(1)}\n`;
    await seedRun(dir, {
      [LEDGER]: before,
      [REPORT_REL]: rereview([closure(1, "fixed"), { ledger_id: "review/1", status: "not-fixed" }]),
    });

    const result = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1)]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`${REPORT_REL}:7: ledger_id "review/1" is ${rid(1)}, which line 6 already closes`);
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("refuses an unknown ledger_id with exit 1, naming the id", async () => {
    const dir = tempDir();
    const before = `${row(1)}\n`;
    await seedRun(dir, {
      [LEDGER]: before,
      [REPORT_REL]: rereview([closure(1, "fixed"), closure(4, "fixed")]),
    });

    const result = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1, 4)]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`${REPORT_REL}:7: ledger_id "${rid(4)}" is not a row of ${LEDGER}`);
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("refuses a closures block that does not parse, naming every bad line, and writes nothing", async () => {
    const dir = tempDir();
    const before = `${row(1)}\n`;
    await seedRun(dir, {
      [LEDGER]: before,
      [REPORT_REL]: rereview([closure(1, "fixed"), closure(1, "gone")]),
    });

    const result = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1)]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`ledger close refused ${REPORT_REL}`);
    expect(result.stderr).toContain(
      `${REPORT_REL}:7: status "gone" is not fixed, not-fixed, regressed, rejection-upheld or rejection-overturned`,
    );
    expect(result.stderr).toContain(`${REPORT_REL}:7: ledger_id "${rid(1)}" repeats line 6`);
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("lists the first 20 problems of a 1,000-line malformed block and counts the rest", async () => {
    const dir = tempDir();
    await seedRun(dir, {
      [LEDGER]: `${row(1)}\n`,
      [REPORT_REL]: rereview(Array.from({ length: 1000 }, () => "x")),
    });

    const human = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1)]);
    const json = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1), "--json"]);

    expect(human.code).toBe(1);
    const listed = human.stderr
      .split("\n")
      .filter((line) => line.startsWith(`${REPORT_REL}:`) || line.startsWith("… +"));
    expect(listed).toHaveLength(21);
    expect(listed[0]).toMatch(new RegExp(`^${REPORT_REL}:6: not JSON \\(`));
    expect(listed[20]).toBe("… +980 more problem(s)");
    const doc = JSON.parse(json.stdout) as { problems: unknown[]; omitted: number };
    expect(doc.problems).toHaveLength(20);
    expect(doc.omitted).toBe(980);
  });

  it("caps the list of closures that cannot apply the same way", async () => {
    const dir = tempDir();
    const numbers = Array.from({ length: 25 }, (_, index) => index + 1);
    await seedRun(dir, {
      [LEDGER]: `${row(100)}\n`,
      [REPORT_REL]: rereview(numbers.map((n) => closure(n, "fixed"))),
    });

    const human = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(...numbers)]);
    const json = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(...numbers), "--json"]);

    expect(human.code).toBe(1);
    expect(human.stderr).toContain(`${REPORT_REL}:25: ledger_id "${rid(20)}" is not a row of ${LEDGER}`);
    expect(human.stderr).not.toContain(`"${rid(21)}"`);
    expect(human.stderr).toContain("… +5 more problem(s)");
    const doc = JSON.parse(json.stdout) as { ok: boolean; problems: unknown[]; omitted: number };
    expect(doc.ok).toBe(false);
    expect(doc.problems).toHaveLength(20);
    expect(doc.omitted).toBe(5);
  });

  it("strips control and bidi characters from every problem and change line it prints", async () => {
    const dir = tempDir();
    const hostile = `${RUN}/review/\u001b[31m\u202E9`;
    const hostileState = "op\u009b2Jen";
    await seedRun(dir, {
      [LEDGER]: `${row(1, { state: hostileState })}\n`,
      [REPORT_REL]: rereview([{ ledger_id: hostile, status: "fixed" }, closure(1, "fixed")]),
    });

    const human = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", `${hostile},${rid(1)}`]);
    const json = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", `${hostile},${rid(1)}`, "--json"]);

    expect(human.code).toBe(1);
    expect(human.stderr).toContain("is not a row of");
    expect(human.stderr).toContain(`${rid(1)} is op2Jen, not open`);
    for (const output of [human.stderr, json.stdout]) {
      // oxlint-disable-next-line no-control-regex -- asserting that no control byte survives IS the point
      expect(output).not.toMatch(/[\u0000-\u0008\u000B-\u001F\u0080-\u009F\u202A-\u202E]/u);
    }
  });

  it("strips control and bidi characters from a change line it prints for an applied closure", async () => {
    const dir = tempDir();
    const hostile = `${RUN}/review/\u202E7\u001b[2J`;
    await seedRun(dir, {
      [LEDGER]: `${row(1, { id: hostile })}\n`,
      [REPORT_REL]: rereview([{ ledger_id: hostile, status: "fixed" }]),
    });

    const result = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", hostile]);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(`${RUN}/review/7[2J open -> fixed (fixed)\n`);
  });

  it("cuts a long ledger_id the refusal quotes at 60 code points plus an ellipsis", async () => {
    const dir = tempDir();
    const long = `${RUN}/review/${"9".repeat(200)}`;
    await seedRun(dir, {
      [LEDGER]: `${row(1)}\n`,
      [REPORT_REL]: rereview([{ ledger_id: long, status: "fixed" }]),
    });

    const result = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", long]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`ledger_id ${JSON.stringify(`${Array.from(long).slice(0, 60).join("")}…`)} is not a row`);
    expect(result.stderr).not.toContain(long);
  });

  it("changes nothing for an empty closures block: exit 0, empty stdout, one stderr line", async () => {
    const dir = tempDir();
    const before = `${row(1)}\n`;
    await seedRun(dir, { [LEDGER]: before, [REPORT_REL]: rereview([]) });

    const result = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1)]);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`ledger close: no closures in ${REPORT_REL}; nothing changed\n`);
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("previews under --dry-run and writes nothing", async () => {
    const dir = tempDir();
    const before = `${row(1)}\n${row(2)}\n`;
    await seedRun(dir, {
      [LEDGER]: before,
      [REPORT_REL]: rereview([closure(1, "fixed"), closure(2, "not-fixed")]),
    });

    const result = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1, 2), "--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      `${rid(1)} open -> fixed (fixed)\n${rid(2)} open -> open (not-fixed)\n` +
        `Dry run: 2 row(s) would change in ${LEDGER}. Nothing was written.\n`,
    );
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("previews a manual close under --dry-run and leaves the ledger byte-identical", async () => {
    const dir = tempDir();
    const before = `${row(1)}\n${row(2)}\n`;
    await seedRun(dir, { [LEDGER]: before });

    const result = await cli(dir, [
      ...CLOSE,
      "--id",
      rid(2),
      "--state",
      "deferred",
      "--rationale",
      "after the release",
      "--dry-run",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      `${rid(2)} open -> deferred\nDry run: 1 row(s) would change in ${LEDGER}. Nothing was written.\n`,
    );
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("applies a closure's rationale and prints only `unchanged` on its re-run", async () => {
    const dir = tempDir();
    await seedRun(dir, {
      [LEDGER]: `${row(1)}\n`,
      [REPORT_REL]: rereview([{ ...closure(1, "fixed"), rationale: "covered by the new test" }]),
    });

    const first = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1)]);
    const once = await readText(dir, LEDGER);
    const again = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1)]);

    expect(first.code).toBe(0);
    expect(rowsOf(once)[0]).toMatchObject({
      state: "fixed",
      rationale: `re-review fixed: ${REPORT_REL} — covered by the new test`,
    });
    expect(again.code).toBe(0);
    expect(again.stdout).toBe(`${rid(1)} unchanged (already recorded)\n`);
    expect(await readText(dir, LEDGER)).toBe(once);
  });

  it("refuses a multi-line, blank or over-cap closure rationale, naming each line, and writes nothing", async () => {
    const dir = tempDir();
    const before = `${row(1)}\n${row(2)}\n${row(3)}\n`;
    await seedRun(dir, {
      [LEDGER]: before,
      [REPORT_REL]: rereview([
        { ...closure(1, "fixed"), rationale: "one\r\ntwo" },
        { ...closure(2, "fixed"), rationale: " " },
        { ...closure(3, "fixed"), rationale: "w".repeat(2_001) },
      ]),
    });

    const result = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1, 2, 3)]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`${REPORT_REL}:6: rationale spans more than one line`);
    expect(result.stderr).toContain(`${REPORT_REL}:7: rationale is empty`);
    expect(result.stderr).toContain(`${REPORT_REL}:8: rationale is over 2000 characters`);
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it.each([
    ["close", "--phase", ["--phase", "build"], "append"],
    ["close", "--source", ["--source", "reviewer"], "append"],
    ["close", "--stdin", ["--stdin"], "append"],
    ["append", "--ids", ["--ids", rid(1)], "close"],
    ["append", "--id", ["--id", rid(1)], "close"],
    ["append", "--state", ["--state", "fixed"], "close"],
    ["append", "--rationale", ["--rationale", "r"], "close"],
  ] as const)(
    "refuses `ledger %s` given %s, a flag of the other subcommand, as a usage error",
    async (subcommand, flag, extra, other) => {
      const dir = tempDir();
      const before = `${row(1)}\n`;
      await seedRun(dir, { [LEDGER]: before, [REPORT_REL]: rereview([closure(1, "fixed")]) });
      const valid =
        subcommand === "close"
          ? [...CLOSE, "--id", rid(1), "--state", "fixed", "--rationale", "r"]
          : ["ledger", "append", "--run", RUN, "--phase", "review", "--source", "reviewer", "--report", REPORT_REL];

      const human = await cli(dir, [...valid, ...extra]);
      const json = await cli(dir, [...valid, ...extra, "--json"]);

      expect(human.code).toBe(1);
      expect(human.stdout).toBe("");
      expect(human.stderr).toContain(`ledger ${subcommand} takes no ${flag}; it is a flag of ledger ${other}`);
      expect(JSON.parse(json.stdout)).toMatchObject({ ok: false, error: { code: "USAGE" } });
      expect(await readText(dir, LEDGER)).toBe(before);
    },
  );

  it("prints exactly one JSON document under --json: { run, ledger, report, changes, dryRun }", async () => {
    const dir = tempDir();
    await seedRun(dir, { [LEDGER]: `${row(1)}\n`, [REPORT_REL]: rereview([closure(1, "fixed")]) });

    const result = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1), "--json"]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      command: "ledger",
      run: RUN,
      ledger: LEDGER,
      report: REPORT_REL,
      dryRun: false,
      changes: [{ ledgerId: rid(1), from: "open", to: "fixed", status: "fixed", unchanged: false }],
    });
  });

  it("strips a Unicode tag-block payload from a closure's rationale and names the cleaned row on stderr", async () => {
    // Ledger row build/300: printableText keeps the tag block for the screens, and
    // no screen runs before a rationale is committed to the row.
    const dir = tempDir();
    const payload = String.fromCodePoint(0xe0001, 0xe0069, 0xe0067, 0xe006e, 0xe006f, 0xe0072, 0xe0065, 0xe007f);
    await seedRun(dir, {
      [LEDGER]: `${row(1)}\n${row(2)}\n`,
      [REPORT_REL]: rereview([
        { ...closure(1, "fixed"), rationale: `covered${payload} by the new test` },
        { ...closure(2, "fixed"), rationale: "clean" },
      ]),
    });

    const result = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1, 2)]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(`${rid(1)} open -> fixed (fixed)\n${rid(2)} open -> fixed (fixed)\n`);
    expect(result.stderr).toBe(
      `warning: ${rid(1)} carried Unicode tag characters in its rationale; they were stripped before the row was written\n`,
    );
    const rows = rowsOf(await readText(dir, LEDGER));
    expect(rows[0]).toMatchObject({ rationale: `re-review fixed: ${REPORT_REL} — covered by the new test` });
    expect(JSON.stringify(rows)).not.toMatch(/[\u{E0000}-\u{E007F}]/u);
  });

  it("strips a Unicode tag-block payload from a manual --rationale and names the row on stderr", async () => {
    const dir = tempDir();
    const payload = String.fromCodePoint(0xe0001, 0xe0069, 0xe0067, 0xe006e, 0xe006f, 0xe0072, 0xe0065, 0xe007f);
    await seedRun(dir, { [LEDGER]: `${row(1)}\n` });

    const result = await cli(dir, [...CLOSE, "--id", rid(1), "--state", "deferred", "--rationale", `after${payload} the release`]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(`${rid(1)} open -> deferred\n`);
    expect(result.stderr).toBe(
      `warning: ${rid(1)} carried Unicode tag characters in its rationale; they were stripped before the row was written\n`,
    );
    expect(rowsOf(await readText(dir, LEDGER))[0]).toMatchObject({ state: "deferred", rationale: "after the release" });
  });

  it("applies one manual transition with --id and prints `<id> <from> -> <to>`", async () => {
    const dir = tempDir();
    await seedRun(dir, { [LEDGER]: `${row(1)}\n${row(2)}\n` });

    const result = await cli(dir, [
      ...CLOSE,
      "--id",
      rid(2),
      "--state",
      "deferred",
      "--rationale",
      "after the release",
    ]);
    const json = await cli(dir, [
      ...CLOSE,
      "--id",
      rid(2),
      "--state",
      "deferred",
      "--rationale",
      "after the release",
      "--json",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(`${rid(2)} open -> deferred\n`);
    expect(rowsOf(await readText(dir, LEDGER))[1]).toMatchObject({
      state: "deferred",
      rationale: "after the release",
    });
    expect(JSON.parse(json.stdout)).toMatchObject({ report: null, changes: [{ unchanged: true }] });
  });

  it("warns about a ledger line that is not a row and still closes", async () => {
    const dir = tempDir();
    await seedRun(dir, {
      [LEDGER]: `garbage\n${row(1)}\n`,
      [REPORT_REL]: rereview([closure(1, "fixed")]),
    });

    const result = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1)]);

    expect(result.code).toBe(0);
    expect(result.stderr).toContain(`warning: ${LEDGER} line 1 is not a ledger row; it was left as it is`);
  });

  it("warns when cross-process locking is off, and still closes", async () => {
    vi.stubEnv("STAMITY_LOCK", "0");
    const dir = tempDir();
    await seedRun(dir, { [LEDGER]: `${row(1)}\n`, [REPORT_REL]: rereview([closure(1, "fixed")]) });

    const result = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1)]);

    expect(result.code).toBe(0);
    expect(result.stderr).toContain(
      "warning: cross-process locking is off (STAMITY_LOCK=0); concurrent closes are not serialized",
    );
  });

  it.each([
    ["an uninitialised repo", null, [...CLOSE, "--id", rid(1), "--state", "fixed", "--rationale", "r"], "this repo is not initialised"],
    ["a missing --run", "run", ["ledger", "close", "--id", rid(1), "--state", "fixed", "--rationale", "r"], "ledger close needs --run"],
    ["a run id that is not one", "run", ["ledger", "close", "--run", "../x", "--id", rid(1), "--state", "fixed", "--rationale", "r"], 'ledger: --run "../x" is not a run id'],
    ["both --report and --id", "run", [...CLOSE, "--report", REPORT_REL, "--ids", ids(1), "--id", rid(1)], "ledger close takes exactly one of --report and --id"],
    ["neither --report nor --id", "run", [...CLOSE], "ledger close takes exactly one of --report and --id"],
    ["--report with --state", "run", [...CLOSE, "--report", REPORT_REL, "--ids", ids(1), "--state", "fixed"], "ledger close --report takes no --state or --rationale; the closures block carries them"],
    ["--report with --rationale", "run", [...CLOSE, "--report", REPORT_REL, "--ids", ids(1), "--rationale", "r"], "ledger close --report takes no --state or --rationale"],
    ["--report without --ids", "run", [...CLOSE, "--report", REPORT_REL], "ledger close --report needs --ids, the ledger ids handed to this re-review"],
    ["--report with an --ids that leaves no item", "run", [...CLOSE, "--report", REPORT_REL, "--ids", " , "], "ledger close --report needs --ids"],
    ["--id with --ids", "run", [...CLOSE, "--id", rid(1), "--ids", ids(1), "--state", "fixed", "--rationale", "r"], "ledger close --id takes no --ids; it moves the one row it names"],
    ["--id without --state", "run", [...CLOSE, "--id", rid(1), "--rationale", "r"], "ledger close needs --state"],
    ["--id without --rationale", "run", [...CLOSE, "--id", rid(1), "--state", "deferred"], "ledger close needs --rationale"],
    ["--id on an unknown id", "run", [...CLOSE, "--id", rid(9), "--state", "deferred", "--rationale", "r"], `ledger close refused: ${rid(9)} is not a row of ${LEDGER}`],
    ["a report outside the run's reports/", "run", [...CLOSE, "--report", `${RUN_DIR}/../x-reviewer-r1.md`, "--ids", ids(1)], 'it has a ".." segment'],
  ] as const)("refuses %s with exit 1 and the ledger byte-identical", async (_label, seed, argv, fragment) => {
    const dir = tempDir();
    const before = `${row(1)}\n`;
    if (seed === "run") {
      await seedRun(dir, { [LEDGER]: before, [REPORT_REL]: rereview([closure(1, "fixed")]) });
    }

    const result = await cli(dir, argv);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(fragment);
    if (seed === "run") expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("refuses a --state outside fixed, rejected and deferred as a usage error (exit 2)", async () => {
    const dir = tempDir();
    await seedRun(dir, { [LEDGER]: `${row(1)}\n` });

    const result = await cli(dir, [...CLOSE, "--id", rid(1), "--state", "open", "--rationale", "r"]);

    expect(result.code).toBe(2);
  });

  it("refuses a closure on a run with no ledger yet, and creates none", async () => {
    const dir = tempDir();
    await seedRun(dir);
    await writeFile(dir.path(REPORT_REL), rereview([closure(1, "fixed")]));

    const result = await cli(dir, [...CLOSE, "--report", REPORT_REL, "--ids", ids(1)]);

    expect(result.code).toBe(1);
    expect(existsSync(dir.path(LEDGER))).toBe(false);
  });
});
