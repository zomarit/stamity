import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMMANDS } from "../../src/cli.ts";
import { acquireWriteLock } from "../../src/merge/atomicWrite.ts";
import { parseFindingsBlock, type Finding } from "../../src/runs/blocks.ts";
import {
  appendFindings,
  ensureReportsIgnore,
  nextRowNumber,
  parseLedgerText,
  requireRunDir,
  resolveReportPath,
} from "../../src/runs/ledgerStore.ts";
import { useCliFixture } from "../support/cliHarness.ts";
import { runInProcess } from "../support/inProcess.ts";
import { makeTempDir, useTempDir, type TempDirHandle } from "../support/tempDir.ts";

/**
 * `stamity ledger append`, the findings-block reader and the ledger store.
 *
 * Real-filesystem lane: the contract is the bytes that land in a run's
 * `ledger.jsonl`, the lock directory beside it and the ignore file in its
 * `reports/` folder, none of which a virtual volume the command never sees can
 * show. The CLI cases run through the in-process funnel, so each also covers the
 * exit code, the single JSON document, `--dry-run` and stdin arriving as the
 * injected prompt stream; one case spawns two real processes to prove the lock
 * serializes across them.
 */

const tempDir = useTempDir("stamity-ledger");

const RUN = "2026-09-23_demo";
const RUN_DIR = `.stamity/runs/${RUN}`;
const LEDGER = `${RUN_DIR}/ledger.jsonl`;
const REPORT_REL = `${RUN_DIR}/reports/u1-reviewer-r1.md`;
const WINDOWS = process.platform === "win32";

interface FindingLine {
  id?: unknown;
  severity?: unknown;
  locator?: unknown;
  summary?: unknown;
  decision_needed?: unknown;
  security?: unknown;
  [key: string]: unknown;
}

const C1: FindingLine = {
  id: "C-1",
  severity: "Critical",
  locator: "src/a.ts:10",
  summary: "a null row crashes the merge",
};
const W1: FindingLine = {
  id: "W-1",
  severity: "Warning",
  locator: "src/b.ts:3-7",
  summary: "the retry never backs off",
};
const M1: FindingLine = {
  id: "M-1",
  severity: "Minor",
  locator: "npm run lint",
  summary: "an unused import",
};

/** A report whose one findings block holds `lines` (objects stringified, strings verbatim). */
function report(lines: readonly (FindingLine | string)[]): string {
  const body = lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line)));
  return ["# u1 review", "", "Prose first.", "", "```stamity-findings", ...body, "```", ""].join(
    "\n",
  );
}

/** A repository with `.stamity/` and the run folder, nothing else. */
async function seedRun(dir: TempDirHandle, files: Record<string, string> = {}): Promise<void> {
  await mkdir(dir.path(RUN_DIR), { recursive: true });
  await dir.seedFiles(files);
}

async function readText(dir: TempDirHandle, rel: string): Promise<string> {
  return await readFile(dir.path(rel), "utf8");
}

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "C-1",
    severity: "Critical",
    locator: "src/a.ts:1",
    summary: "s",
    decisionNeeded: false,
    security: false,
    line: 1,
    ...overrides,
  };
}

async function cli(
  dir: TempDirHandle,
  argv: readonly string[],
  stdinLines?: readonly string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await runInProcess(COMMANDS, argv, {
    cwd: dir.dir,
    ...(stdinLines === undefined ? {} : { stdinLines }),
  });
}

const APPEND = ["ledger", "append", "--run", RUN, "--phase", "review", "--source", "reviewer"];

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// The findings block
// ---------------------------------------------------------------------------

describe("parseFindingsBlock", () => {
  it("reads one finding per line, in block order, with its physical line", () => {
    const parsed = parseFindingsBlock(
      report([C1, "", { ...W1, decision_needed: true, security: true }, M1]),
    );

    expect(parsed).toEqual({
      ok: true,
      items: [
        { ...C1, decisionNeeded: false, security: false, line: 6 },
        { ...W1, decisionNeeded: true, security: true, line: 8 },
        { ...M1, decisionNeeded: false, security: false, line: 9 },
      ],
    });
  });

  it("reads an empty block as zero findings, and a CRLF report like an LF one", () => {
    expect(parseFindingsBlock(report([]))).toEqual({ ok: true, items: [] });
    const crlf = parseFindingsBlock(report([C1]).replaceAll("\n", "\r\n"));
    expect(crlf.ok && crlf.items.map((item) => item.id)).toEqual(["C-1"]);
  });

  it("refuses no block, a second block and an unclosed block as the whole text", () => {
    expect(parseFindingsBlock("# prose only\n")).toEqual({
      ok: false,
      problems: [{ line: 0, message: "no stamity-findings block" }],
    });
    expect(parseFindingsBlock(`${report([C1])}\n${report([W1])}`)).toEqual({
      ok: false,
      problems: [
        {
          line: 13,
          message:
            "a second stamity-findings block (the first opens at line 5); a report carries exactly one",
        },
      ],
    });
    expect(parseFindingsBlock("```stamity-findings\n" + JSON.stringify(C1) + "\n")).toEqual({
      ok: false,
      problems: [{ line: 1, message: "the stamity-findings block opened here is never closed" }],
    });
  });

  it("collects every problem of every bad line, and none from the good lines around them", () => {
    const parsed = parseFindingsBlock(
      report([
        C1,
        { ...W1, severity: "High" },
        { ...W1, id: "W-2", summary: "x".repeat(301) },
        { id: "W-3", severity: "Warning", summary: "no locator" },
        "not json",
        "[1, 2]",
        { ...M1, id: "C-9" },
        { ...M1, id: "M-01", extra: 1 },
        { ...M1, id: "M-2", locator: "  ", summary: "one\ntwo" },
        { ...M1, id: "M-3", decision_needed: "true", security: 1 },
        { ...M1, id: "C-1", severity: "Critical" },
        { ...M1, id: "M-4", locator: 7 },
        M1,
      ]),
    );

    expect(parsed.ok).toBe(false);
    const problems = parsed.ok ? [] : parsed.problems;
    expect(problems.map((problem) => `${problem.line}: ${problem.message}`)).toEqual([
      '7: severity "High" is not Critical, Warning or Minor',
      "8: summary is over 300 characters",
      '9: missing "locator"',
      expect.stringMatching(/^10: not JSON \(.+\)$/) as unknown as string,
      "11: not a JSON object",
      '12: id "C-9" does not match severity Minor',
      '13: unknown key "extra"',
      '13: id "M-01" is not C-<n>, W-<n> or M-<n>',
      "14: locator is empty",
      "14: summary spans more than one line",
      "15: decision_needed is not a boolean",
      "15: security is not a boolean",
      '16: id "C-1" repeats line 6',
      "17: locator is not a string",
    ]);
    // The first and last lines are clean: no problem names line 6 or 18.
    expect(problems.some((problem) => problem.line === 6 || problem.line === 18)).toBe(false);
  });

  it("admits a summary of exactly 300 characters", () => {
    const parsed = parseFindingsBlock(report([{ ...C1, summary: "x".repeat(300) }]));
    expect(parsed.ok).toBe(true);
  });

  it("cuts every quoted fragment of report text at 60 code points plus an ellipsis", () => {
    const long = "\u{1F600}".repeat(100);
    const parsed = parseFindingsBlock(
      report([
        { ...C1, [long]: 1 },
        { ...W1, severity: long },
        { ...M1, id: long },
        { ...M1, severity: { nested: long } },
      ]),
    );

    const cut = JSON.stringify(`${"\u{1F600}".repeat(60)}…`);
    expect(parsed.ok ? [] : parsed.problems.map((problem) => problem.message)).toEqual([
      `unknown key ${cut}`,
      `severity ${cut} is not Critical, Warning or Minor`,
      `id ${cut} is not C-<n>, W-<n> or M-<n>`,
      `severity ${Array.from(JSON.stringify({ nested: long })).slice(0, 60).join("")}… is not Critical, Warning or Minor`,
    ]);
  });
});

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

describe("parseLedgerText and nextRowNumber", () => {
  it("numbers numerically within one run and phase: review/9 and review/10 give review/11", () => {
    const rows = [
      { id: `${RUN}/review/9` },
      { id: `${RUN}/review/10` },
      { id: `${RUN}/build/40` },
      { id: `2026-09-22_other/review/99` },
    ];
    expect(nextRowNumber(rows, RUN, "review")).toBe(11);
    expect(nextRowNumber(rows, RUN, "build")).toBe(41);
    expect(nextRowNumber(rows, RUN, "fix")).toBe(1);
  });

  it("keeps a line that is not a row out of the rows and names it", () => {
    const parsed = parseLedgerText('{"id": "a"}\r\nnot json\r\n\r\n{"state":"open"}\r\n');
    expect(parsed.eol).toBe("\r\n");
    expect(parsed.lines).toEqual(['{"id": "a"}', "not json", "", '{"state":"open"}']);
    expect([...parsed.rows.keys()]).toEqual([0]);
    expect(parsed.unreadable).toEqual([2, 4]);
    expect(parseLedgerText("")).toEqual({ lines: [], eol: "\n", rows: new Map(), unreadable: [] });
  });
});

describe("ensureReportsIgnore", () => {
  it("creates reports/.gitignore holding exactly `*` in a run folder that has none", async () => {
    const dir = tempDir();
    await seedRun(dir);

    await ensureReportsIgnore(dir.dir, RUN);

    expect(await readText(dir, `${RUN_DIR}/reports/.gitignore`)).toBe("*\n");
  });

  it("leaves an existing ignore file byte-identical", async () => {
    const dir = tempDir();
    await seedRun(dir, { [`${RUN_DIR}/reports/.gitignore`]: "# kept\n*.md\n" });

    await ensureReportsIgnore(dir.dir, RUN);

    expect(await readText(dir, `${RUN_DIR}/reports/.gitignore`)).toBe("# kept\n*.md\n");
  });

  it.skipIf(WINDOWS)("refuses a symlinked reports/ folder and writes nothing through it", async () => {
    const dir = tempDir();
    await seedRun(dir);
    await mkdir(dir.path("elsewhere"));
    await symlink(dir.path("elsewhere"), dir.path(RUN_DIR, "reports"));

    await expect(ensureReportsIgnore(dir.dir, RUN)).rejects.toMatchObject({
      code: "FS_ERROR",
      message: expect.stringContaining("is a symbolic link") as unknown as string,
    });
    expect(existsSync(dir.path("elsewhere", ".gitignore"))).toBe(false);
  });

  it.skipIf(WINDOWS)("refuses a symlinked ignore file rather than trusting it", async () => {
    const dir = tempDir();
    await seedRun(dir, { "elsewhere/.gitignore": "*\n" });
    await mkdir(dir.path(RUN_DIR, "reports"));
    await symlink(dir.path("elsewhere", ".gitignore"), dir.path(RUN_DIR, "reports", ".gitignore"));

    await expect(ensureReportsIgnore(dir.dir, RUN)).rejects.toThrow(
      `${RUN_DIR}/reports/.gitignore is a symbolic link`,
    );
  });

  it("refuses a reports entry that is a file, not a folder", async () => {
    const dir = tempDir();
    await seedRun(dir, { [`${RUN_DIR}/reports`]: "not a folder" });

    await expect(ensureReportsIgnore(dir.dir, RUN)).rejects.toThrow(
      `${RUN_DIR}/reports is not a folder`,
    );
  });

  it("makes git ignore a report in a repository whose root .gitignore names no reports rule", async () => {
    const dir = tempDir();
    await seedRun(dir, { ".gitignore": "node_modules/\n", [REPORT_REL]: report([C1]) });
    // Isolated from the machine's own git config, whose global excludes could
    // otherwise ignore the file and make this case pass for the wrong reason.
    const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
    const git = (...args: string[]): number =>
      spawnSync("git", args, { cwd: dir.dir, env, stdio: "ignore" }).status ?? -1;
    expect(git("init", "-q")).toBe(0);
    // Red before: nothing ignores the report yet.
    expect(git("check-ignore", "-q", REPORT_REL)).toBe(1);

    const result = await cli(dir, [...APPEND, "--report", REPORT_REL]);

    expect(result.code).toBe(0);
    expect(git("check-ignore", "-q", REPORT_REL)).toBe(0);
    expect(git("check-ignore", "-q", LEDGER)).toBe(1);
  });
});

describe("requireRunDir and resolveReportPath", () => {
  it("refuses a run folder that does not exist", async () => {
    const dir = tempDir();
    await mkdir(dir.path(".stamity"));
    await expect(requireRunDir(dir.dir, RUN)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: `there is no run folder ${RUN_DIR}/`,
    });
  });

  it.skipIf(WINDOWS)("refuses a symlinked run folder", async () => {
    const dir = tempDir();
    await mkdir(dir.path(".stamity", "runs"), { recursive: true });
    await mkdir(dir.path("real-run"));
    await symlink(dir.path("real-run"), dir.path(RUN_DIR));
    await expect(requireRunDir(dir.dir, RUN)).rejects.toMatchObject({
      message: `there is no run folder ${RUN_DIR}/`,
      why: `${RUN} is a symbolic link`,
    });
  });

  it("reads a report by its relative path, its Windows spelling and its absolute path", async () => {
    const dir = tempDir();
    await seedRun(dir, { [REPORT_REL]: report([C1]) });

    const spellings = [REPORT_REL, REPORT_REL.replaceAll("/", "\\"), dir.path(REPORT_REL)];
    const resolved = await Promise.all(
      spellings.map((given) => resolveReportPath(dir.dir, RUN, given)),
    );
    for (const one of resolved) {
      expect(one.relative).toBe(REPORT_REL);
      expect(one.text).toBe(report([C1]));
    }
  });

  it("accepts an absolute path spelled through the root's real path when the root is not", async () => {
    // The raw temp spelling: on macOS it sits behind the /var -> /private/var
    // link, so the lexical root and the real one differ, which is the case the
    // real-path comparison exists for. Elsewhere the two spellings agree and the
    // case holds trivially.
    const raw = await makeTempDir("stamity-ledger-raw", { realpath: false });
    try {
      await seedRun(raw, { [REPORT_REL]: report([C1]) });
      const realAbsolute = join(await realpath(raw.dir), REPORT_REL);

      const resolved = await resolveReportPath(raw.dir, RUN, realAbsolute);

      expect(resolved.relative).toBe(REPORT_REL);
    } finally {
      await raw.cleanup();
    }
  });

  it("refuses every path that is not a report of this run, naming why", async () => {
    const dir = tempDir();
    await seedRun(dir, {
      [REPORT_REL]: report([C1]),
      [`${RUN_DIR}/reports/report-reviewer-r1.md`]: report([C1]),
      [`${RUN_DIR}/reports/notes.md`]: report([C1]),
      [`${RUN_DIR}/u1-reviewer-r1.md`]: report([C1]),
      ".stamity/runs/2026-09-22_other/reports/u1-reviewer-r1.md": report([C1]),
    });
    await mkdir(dir.path(RUN_DIR, "reports", "u2-reviewer-r1.md"));

    const cases: readonly (readonly [string, string])[] = [
      [`${RUN_DIR}/reports/../reports/u1-reviewer-r1.md`, 'it has a ".." segment'],
      [".stamity/runs/2026-09-22_other/reports/u1-reviewer-r1.md", "is not directly inside"],
      [`${RUN_DIR}/u1-reviewer-r1.md`, "is not directly inside"],
      [`${RUN_DIR}/reports/report-reviewer-r1.md`, "its name is not <pass>-<role>-r<N>.md"],
      [`${RUN_DIR}/reports/notes.md`, "its name is not <pass>-<role>-r<N>.md"],
      [`${RUN_DIR}/reports/u9-reviewer-r1.md`, "it does not exist"],
      [`${RUN_DIR}/reports/u2-reviewer-r1.md`, "it is not a regular file"],
    ];
    const outcomes = await Promise.all(
      cases.map(([given]) =>
        resolveReportPath(dir.dir, RUN, given).then(
          () => null,
          (error: unknown) => error as { code?: unknown; message?: unknown },
        ),
      ),
    );
    for (const [index, [given, reason]] of cases.entries()) {
      expect(outcomes[index]?.code, given).toBe("VALIDATION_ERROR");
      expect(outcomes[index]?.message, given).toEqual(
        expect.stringContaining(`--report ${given} is not a report of run ${RUN}: `),
      );
      expect(outcomes[index]?.message, given).toEqual(expect.stringContaining(reason));
    }
  });

  it("refuses a report over 1 MiB", async () => {
    const dir = tempDir();
    await seedRun(dir, { [REPORT_REL]: `${report([C1])}${"x".repeat(1_048_576)}` });
    await expect(resolveReportPath(dir.dir, RUN, REPORT_REL)).rejects.toThrow(
      "it is over 1048576 bytes",
    );
  });

  it.skipIf(WINDOWS)("refuses a symlinked leaf and a symlinked reports/ folder", async () => {
    const dir = tempDir();
    await seedRun(dir, { "outside/u1-reviewer-r1.md": report([C1]) });
    await mkdir(dir.path(RUN_DIR, "reports"));
    await symlink(dir.path("outside", "u1-reviewer-r1.md"), dir.path(REPORT_REL));
    await expect(resolveReportPath(dir.dir, RUN, REPORT_REL)).rejects.toThrow(
      "u1-reviewer-r1.md is a symbolic link",
    );

    await rm(dir.path(RUN_DIR, "reports"), { recursive: true });
    await symlink(dir.path("outside"), dir.path(RUN_DIR, "reports"));
    await expect(resolveReportPath(dir.dir, RUN, REPORT_REL)).rejects.toThrow(
      "reports is a symbolic link",
    );
  });
});

describe("appendFindings", () => {
  const append = (
    dir: TempDirHandle,
    findings: readonly Finding[],
    reportPath: string | null = null,
  ): ReturnType<typeof appendFindings> =>
    appendFindings({
      rootDir: dir.dir,
      runId: RUN,
      phase: "review",
      source: "reviewer",
      findings,
      report: reportPath,
      dryRun: false,
    });

  it("keeps every existing byte, adds one missing final newline, and numbers past the highest id", async () => {
    const dir = tempDir();
    const legacy =
      `{"id": "${RUN}/review/9", "phase": "review", "state": "fixed"}\n` +
      `{"id": "${RUN}/review/10", "phase": "review", "state": "open"}`;
    await seedRun(dir, { [LEDGER]: legacy });

    const result = await append(dir, [finding()]);

    expect(result.rows.map((row) => row.ledgerId)).toEqual([`${RUN}/review/11`]);
    const after = await readText(dir, LEDGER);
    expect(after.startsWith(`${legacy}\n`)).toBe(true);
    expect(after.split("\n")).toHaveLength(4);
    expect(after.endsWith("}\n")).toBe(true);
  });

  it("writes each row's keys in order, POSIX report, decision_needed only when true, never security", async () => {
    const dir = tempDir();
    await seedRun(dir);

    await append(
      dir,
      [
        finding({ security: true }),
        finding({ id: "W-1", severity: "Warning", decisionNeeded: true }),
      ],
      REPORT_REL,
    );

    const rows = (await readText(dir, LEDGER))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(rows.map((row) => Object.keys(row))).toEqual([
      ["id", "phase", "source", "severity", "evidence", "state", "rationale", "report"],
      [
        "id",
        "phase",
        "source",
        "severity",
        "evidence",
        "state",
        "rationale",
        "report",
        "decision_needed",
      ],
    ]);
    expect(rows[0]).toEqual({
      id: `${RUN}/review/1`,
      phase: "review",
      source: "reviewer",
      severity: "Critical",
      evidence: "src/a.ts:1 — s",
      state: "open",
      rationale: "",
      report: REPORT_REL,
    });
    expect(rows[1]?.["decision_needed"]).toBe(true);
  });

  it("appends with the ledger's own CRLF line ends", async () => {
    const dir = tempDir();
    await seedRun(dir, { [LEDGER]: `{"id":"${RUN}/review/1"}\r\n` });

    await append(dir, [finding(), finding({ id: "C-2" })]);

    const after = await readText(dir, LEDGER);
    expect(after.split("\r\n")).toHaveLength(4);
    expect(after.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("keeps a hand-edited line that is not a row, reports it, and numbers past the rows around it", async () => {
    const dir = tempDir();
    const before = `{"id":"${RUN}/review/1"}\nthis line was typed by hand\n{"id":"${RUN}/review/2"}\n`;
    await seedRun(dir, { [LEDGER]: before });

    const result = await append(dir, [finding()]);

    expect(result.unreadableLines).toEqual([2]);
    expect(result.rows[0]?.ledgerId).toBe(`${RUN}/review/3`);
    expect((await readText(dir, LEDGER)).startsWith(before)).toBe(true);
  });

  it("gives two concurrent appends disjoint id ranges, and all six rows land", async () => {
    const dir = tempDir();
    await seedRun(dir);
    const three = [finding(), finding({ id: "C-2" }), finding({ id: "C-3" })];

    const [first, second] = await Promise.all([append(dir, three), append(dir, three)]);

    const ids = [...(first?.rows ?? []), ...(second?.rows ?? [])].map((row) => row.ledgerId);
    expect(new Set(ids).size).toBe(6);
    expect(ids.toSorted()).toEqual([1, 2, 3, 4, 5, 6].map((n) => `${RUN}/review/${n}`).toSorted());
    expect((await readText(dir, LEDGER)).trimEnd().split("\n")).toHaveLength(6);
  });

  it("takes over a lock directory left stale for 60 s and removes it", async () => {
    const dir = tempDir();
    await seedRun(dir);
    const lock = dir.path(RUN_DIR, "ledger.jsonl.lock");
    await mkdir(lock);
    const aged = new Date(Date.now() - 60_000);
    await utimes(lock, aged, aged);

    const result = await append(dir, [finding()]);

    expect(result.rows).toHaveLength(1);
    expect(existsSync(lock)).toBe(false);
  });

  it("rejects with LOCK_TIMEOUT while another holder keeps the lock", { timeout: 20_000 }, async () => {
    const dir = tempDir();
    await seedRun(dir);
    const ledgerPath = dir.path(LEDGER);
    const release = await acquireWriteLock(ledgerPath, dir.path(RUN_DIR));
    try {
      await expect(append(dir, [finding()])).rejects.toMatchObject({ code: "LOCK_TIMEOUT" });
    } finally {
      await release();
    }
    expect(existsSync(ledgerPath)).toBe(false);
  });

  it("refuses a report the ledger already carries, naming the rows", async () => {
    const dir = tempDir();
    await seedRun(dir);
    await append(dir, [finding(), finding({ id: "C-2" })], REPORT_REL);
    const before = await readText(dir, LEDGER);

    await expect(append(dir, [finding()], REPORT_REL)).rejects.toThrow(
      `ledger append refused ${REPORT_REL}: the ledger already carries rows from this report (${RUN}/review/1, ${RUN}/review/2)`,
    );
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("strips control and bidi characters from the on-disk ids the duplicate-report refusal echoes", async () => {
    const dir = tempDir();
    const forged = "\u001b[31mred\u009b2J\u202Eflip\nline";
    await seedRun(dir, {
      [LEDGER]: `${JSON.stringify({ id: forged, report: REPORT_REL })}\n`,
    });

    await expect(append(dir, [finding()], REPORT_REL)).rejects.toThrow(
      `ledger append refused ${REPORT_REL}: the ledger already carries rows from this report ([31mred2Jflip line)`,
    );
  });

  it("takes no lock and creates no ledger for zero findings", async () => {
    const dir = tempDir();
    await seedRun(dir);

    const result = await append(dir, []);

    expect(result.rows).toEqual([]);
    expect(existsSync(dir.path(LEDGER))).toBe(false);
    expect(existsSync(dir.path(RUN_DIR, "ledger.jsonl.lock"))).toBe(false);
  });

  it.skipIf(WINDOWS)("refuses a symlinked ledger rather than reading through it", async () => {
    const dir = tempDir();
    await seedRun(dir, { "elsewhere.jsonl": "" });
    await symlink(dir.path("elsewhere.jsonl"), dir.path(LEDGER));
    await expect(append(dir, [finding()])).rejects.toMatchObject({ code: "FS_ERROR" });
    expect(await readText(dir, "elsewhere.jsonl")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// The CLI
// ---------------------------------------------------------------------------

describe("stamity ledger append", () => {
  it("appends one row per finding and prints `<ledger-id> <severity> <local id>` per row", async () => {
    const dir = tempDir();
    await seedRun(dir, { [REPORT_REL]: report([C1, W1, M1]) });

    const result = await cli(dir, [...APPEND, "--report", REPORT_REL]);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      [
        `${RUN}/review/1 Critical C-1`,
        `${RUN}/review/2 Warning W-1`,
        `${RUN}/review/3 Minor M-1`,
        "",
      ].join("\n"),
    );
    const rows = (await readText(dir, LEDGER)).trimEnd().split("\n");
    expect(rows.map((line) => (JSON.parse(line) as { report: string }).report)).toEqual([
      REPORT_REL,
      REPORT_REL,
      REPORT_REL,
    ]);
  });

  it("ends the line of a decision-needed row with the token, and only that line", async () => {
    const dir = tempDir();
    await seedRun(dir, {
      [REPORT_REL]: report([{ ...C1, decision_needed: true }, { ...W1, decision_needed: false }]),
    });

    const result = await cli(dir, [...APPEND, "--report", REPORT_REL]);

    expect(result.stdout).toBe(
      `${RUN}/review/1 Critical C-1 decision-needed\n${RUN}/review/2 Warning W-1\n`,
    );
  });

  it("refuses a block with one bad line among good ones, naming every bad line, and writes nothing", async () => {
    const dir = tempDir();
    await seedRun(dir, {
      [LEDGER]: `{"id":"${RUN}/review/1"}\n`,
      [REPORT_REL]: report([C1, { ...W1, severity: "High" }, M1, { id: "M-2", severity: "Minor" }]),
    });

    const result = await cli(dir, [...APPEND, "--report", REPORT_REL]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(`ledger append refused ${REPORT_REL}`);
    expect(result.stderr).toContain(
      `${REPORT_REL}:7: severity "High" is not Critical, Warning or Minor`,
    );
    expect(result.stderr).toContain(`${REPORT_REL}:9: missing "locator"`);
    expect(result.stderr).toContain(`${REPORT_REL}:9: missing "summary"`);
    expect(await readText(dir, LEDGER)).toBe(`{"id":"${RUN}/review/1"}\n`);
  });

  it("lists the first 20 problems of a 1,000-line malformed block and counts the rest", async () => {
    const dir = tempDir();
    await seedRun(dir, { [REPORT_REL]: report(Array.from({ length: 1000 }, () => "x")) });

    const human = await cli(dir, [...APPEND, "--report", REPORT_REL]);
    const json = await cli(dir, [...APPEND, "--report", REPORT_REL, "--json"]);

    expect(human.code).toBe(1);
    const listed = human.stderr
      .split("\n")
      .filter((line) => line.startsWith(`${REPORT_REL}:`) || line.startsWith("… +"));
    expect(listed).toHaveLength(21);
    expect(listed[0]).toMatch(new RegExp(`^${REPORT_REL}:6: not JSON \\(`));
    expect(listed[19]).toMatch(new RegExp(`^${REPORT_REL}:25: not JSON \\(`));
    expect(listed[20]).toBe("… +980 more problem(s)");

    expect(json.code).toBe(1);
    const doc = JSON.parse(json.stdout) as { problems: { line: number }[]; omitted: number };
    expect(doc.problems).toHaveLength(20);
    expect(doc.problems.at(-1)?.line).toBe(25);
    expect(doc.omitted).toBe(980);
    expect(existsSync(dir.path(LEDGER))).toBe(false);
  });

  it("strips control and bidi characters from every problem line it prints", async () => {
    const dir = tempDir();
    await seedRun(dir, {
      [REPORT_REL]: report(["\u009b2J", { ...C1, "k\u001b[31m\u202E": 1 }]),
    });

    const result = await cli(dir, [...APPEND, "--report", REPORT_REL]);
    const json = await cli(dir, [...APPEND, "--report", REPORT_REL, "--json"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`${REPORT_REL}:6: not JSON (`);
    expect(result.stderr).toContain(`${REPORT_REL}:7: unknown key "k\\u001b[31m"`);
    for (const output of [result.stderr, json.stdout]) {
      expect(output).not.toMatch(/[\u0080-\u009F\u202A-\u202E]/u);
    }
  });

  it.each([
    ["no block", "# prose\n", ":0: no stamity-findings block"],
    ["two blocks", `${report([C1])}${report([W1])}`, "a second stamity-findings block"],
    ["an unclosed block", "```stamity-findings\n", ":1: the stamity-findings block opened here"],
  ])("refuses %s", async (_label, text, fragment) => {
    const dir = tempDir();
    await seedRun(dir, { [REPORT_REL]: text });

    const result = await cli(dir, [...APPEND, "--report", REPORT_REL]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(fragment);
    expect(existsSync(dir.path(LEDGER))).toBe(false);
  });

  it("appends nothing for an empty block: exit 0, empty stdout, no ledger file", async () => {
    const dir = tempDir();
    await seedRun(dir, { [REPORT_REL]: report([]) });

    const result = await cli(dir, [...APPEND, "--report", REPORT_REL]);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`ledger append: no findings in ${REPORT_REL}; nothing appended\n`);
    expect(existsSync(dir.path(LEDGER))).toBe(false);
  });

  it("refuses a stdin block over the 250,000-character input ceiling and writes nothing", async () => {
    const dir = tempDir();
    await seedRun(dir);

    const over = await cli(dir, [...APPEND, "--stdin"], ["x".repeat(250_001)]);

    expect(over.code).toBe(1);
    expect(over.stdout).toBe("");
    expect(over.stderr).toContain("the block piped on stdin is over the 250000 byte input ceiling");
    expect(existsSync(dir.path(LEDGER))).toBe(false);
  });

  it("reads a block piped with --stdin and stores no report on its rows", async () => {
    const dir = tempDir();
    await seedRun(dir);

    const result = await cli(dir, [...APPEND, "--stdin"], report([C1, W1]).split("\n"));

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(`${RUN}/review/1 Critical C-1\n${RUN}/review/2 Warning W-1\n`);
    const rows = (await readText(dir, LEDGER)).trimEnd().split("\n");
    expect(rows.map((line) => Object.hasOwn(JSON.parse(line) as object, "report"))).toEqual([
      false,
      false,
    ]);
  });

  it("refuses the same report twice, naming the first append's ids", async () => {
    const dir = tempDir();
    await seedRun(dir, { [REPORT_REL]: report([C1, W1]) });
    await cli(dir, [...APPEND, "--report", REPORT_REL]);
    const before = await readText(dir, LEDGER);

    const second = await cli(dir, [...APPEND, "--report", REPORT_REL]);

    expect(second.code).toBe(1);
    expect(second.stderr).toContain(`(${RUN}/review/1, ${RUN}/review/2)`);
    expect(await readText(dir, LEDGER)).toBe(before);
  });

  it("previews the rows under --dry-run and writes nothing, not even the ignore file", async () => {
    const dir = tempDir();
    const before = `{"id":"${RUN}/review/4"}\n`;
    await seedRun(dir, { [LEDGER]: before, [REPORT_REL]: report([C1, W1]) });

    const result = await cli(dir, [...APPEND, "--report", REPORT_REL, "--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      `${RUN}/review/5 Critical C-1\n${RUN}/review/6 Warning W-1\n` +
        `Dry run: 2 row(s) would be appended to ${LEDGER}. Nothing was written.\n`,
    );
    expect(await readText(dir, LEDGER)).toBe(before);
    expect(existsSync(dir.path(RUN_DIR, "reports", ".gitignore"))).toBe(false);
  });

  it("prints exactly one JSON document under --json", async () => {
    const dir = tempDir();
    await seedRun(dir, { [REPORT_REL]: report([{ ...C1, decision_needed: true }]) });

    const result = await cli(dir, [...APPEND, "--report", REPORT_REL, "--json"]);

    expect(result.code).toBe(0);
    const doc = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(doc).toMatchObject({
      ok: true,
      command: "ledger",
      run: RUN,
      ledger: LEDGER,
      source: REPORT_REL,
      dryRun: false,
      rows: [
        { ledgerId: `${RUN}/review/1`, severity: "Critical", localId: "C-1", decisionNeeded: true },
      ],
    });
  });

  it("prints one JSON document carrying every problem when the block is refused", async () => {
    const dir = tempDir();
    await seedRun(dir, { [REPORT_REL]: report([{ ...C1, severity: "High" }]) });

    const result = await cli(dir, [...APPEND, "--report", REPORT_REL, "--json"]);

    expect(result.code).toBe(1);
    const doc = JSON.parse(result.stdout) as { ok: boolean; problems: unknown[] };
    expect(doc.ok).toBe(false);
    expect(doc.problems).toEqual([
      { line: 6, message: 'severity "High" is not Critical, Warning or Minor' },
    ]);
  });

  it("warns about a ledger line that is not a row and still appends", async () => {
    const dir = tempDir();
    await seedRun(dir, { [LEDGER]: "garbage\n", [REPORT_REL]: report([C1]) });

    const result = await cli(dir, [...APPEND, "--report", REPORT_REL]);

    expect(result.code).toBe(0);
    expect(result.stderr).toContain(
      `warning: ${LEDGER} line 1 is not a ledger row; it was left as it is`,
    );
    expect(await readText(dir, LEDGER)).toMatch(/^garbage\n\{/);
  });

  it("warns when cross-process locking is off, and still appends", async () => {
    vi.stubEnv("STAMITY_LOCK", "0");
    const dir = tempDir();
    await seedRun(dir, { [REPORT_REL]: report([C1]) });

    const result = await cli(dir, [...APPEND, "--report", REPORT_REL]);

    expect(result.code).toBe(0);
    expect(result.stderr).toContain(
      "warning: cross-process locking is off (STAMITY_LOCK=0); concurrent appends are not serialized",
    );
    expect(result.stdout).toBe(`${RUN}/review/1 Critical C-1\n`);
  });

  it.each([
    ["an uninitialised repo", null, [...APPEND, "--stdin"], "this repo is not initialised"],
    [
      "a missing run folder",
      "init",
      ["ledger", "append", "--run", "2026-09-23_missing", "--phase", "review", "--source", "reviewer", "--stdin"],
      "there is no run folder .stamity/runs/2026-09-23_missing/",
    ],
    [
      "a run id that is not one",
      "run",
      ["ledger", "append", "--run", "2026-09-09_release-1.3.0", "--phase", "review", "--source", "r", "--stdin"],
      'ledger: --run "2026-09-09_release-1.3.0" is not a run id (YYYY-MM-DD_<lowercase-slug>)',
    ],
    [
      "a traversal run id",
      "run",
      ["ledger", "append", "--run", "../x", "--phase", "review", "--source", "r", "--stdin"],
      'ledger: --run "../x" is not a run id',
    ],
    [
      "a phase that is not a slug",
      "run",
      ["ledger", "append", "--run", RUN, "--phase", "Review", "--source", "r", "--stdin"],
      'ledger: --phase "Review" is not a lowercase slug ([a-z][a-z0-9-]*)',
    ],
    [
      "a source that is not a slug",
      "run",
      ["ledger", "append", "--run", RUN, "--phase", "review", "--source", "a/b", "--stdin"],
      'ledger: --source "a/b" is not a lowercase slug',
    ],
    [
      "a missing --run",
      "run",
      ["ledger", "append", "--phase", "review", "--source", "r", "--stdin"],
      "ledger append needs --run",
    ],
    [
      "both --report and --stdin",
      "run",
      [...APPEND, "--stdin", "--report", REPORT_REL],
      "ledger append takes exactly one of --report and --stdin",
    ],
    ["neither --report nor --stdin", "run", [...APPEND], "takes exactly one of --report and --stdin"],
  ] as const)("refuses %s with exit 1", async (_label, seed, argv, fragment) => {
    const dir = tempDir();
    if (seed === "init") await mkdir(dir.path(".stamity"));
    if (seed === "run") await seedRun(dir);

    const result = await cli(dir, argv, [report([C1])]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(fragment);
    expect(existsSync(dir.path(LEDGER))).toBe(false);
  });

  it("reports a missing ledger only as absent: the first append creates it", async () => {
    const dir = tempDir();
    await seedRun(dir, { [REPORT_REL]: report([C1]) });
    await expect(stat(dir.path(LEDGER))).rejects.toMatchObject({ code: "ENOENT" });

    await cli(dir, [...APPEND, "--report", REPORT_REL]);

    expect((await stat(dir.path(LEDGER))).isFile()).toBe(true);
  });
});

describe("stamity ledger append across two processes", () => {
  const fixture = useCliFixture();

  it(
    "serializes two appends started together: 3 + 4 rows, distinct and contiguous, no lock left",
    { timeout: 60_000 },
    async () => {
      const child = fixture();
      const runDir = join(child.repoDir, RUN_DIR);
      await mkdir(runDir, { recursive: true });
      await writeFile(join(runDir, "ledger.jsonl"), `{"id":"${RUN}/review/2"}\n`);
      const block = (count: number): string =>
        report(
          Array.from({ length: count }, (_, index) => ({ ...C1, id: `C-${index + 1}` })),
        );

      const [three, four] = await Promise.all([
        child.run([...APPEND, "--stdin"], { stdin: block(3) }),
        child.run([...APPEND, "--stdin"], { stdin: block(4) }),
      ]);

      expect([three?.code, four?.code]).toEqual([0, 0]);
      const ids = (await readFile(join(runDir, "ledger.jsonl"), "utf8"))
        .trimEnd()
        .split("\n")
        .map((line) => (JSON.parse(line) as { id: string }).id);
      expect(ids.slice(1).toSorted()).toEqual(
        [3, 4, 5, 6, 7, 8, 9].map((n) => `${RUN}/review/${n}`).toSorted(),
      );
      const leftovers = await readdir(runDir);
      expect(leftovers.filter((name) => /\.lock$|\.tmp\./.test(name))).toEqual([]);
    },
  );
});
