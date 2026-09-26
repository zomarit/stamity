import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error — the script is a native ESM source-checkout tool with no declaration file.
import { BUDGET_MS, median, payloads, reportWritePath, VERDICT_AGENT, writePayload } from "../../scripts/hook-latency.mjs";

/**
 * `scripts/hook-latency.mjs` (REQ-CTX-016, plan 010 D2): the guard's latency over node's own start,
 * measured locally at each release and never in CI.
 *
 * The timing cases below never time the real guard. They run the script against fake guards whose
 * cost is known by construction — one that returns at once and one that busy-waits 40 ms — so the
 * assertion rests on a margin of about 15 ms on the fast side and 25 ms on the slow side, not on
 * the speed of the runner. The fakes are CommonJS on purpose: `node file.cjs` and `node -e ""`
 * share the same loader, so the fast fake's overhead is close to zero on any host, where an ESM
 * fake would add the ESM loader's own start to every sample. The real guard is exercised once,
 * untimed, to prove the two payloads are what it admits.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = join(REPO_ROOT, "scripts", "hook-latency.mjs");
const REAL_GUARD = join(REPO_ROOT, ".stamity", "generated", "hooks", "claude", "stamity-pre-tool-use-guard.mjs");

// Each timed run is 3 cases × (1 warm-up + 7 runs) = 24 node starts; a Windows runner starts node
// several times slower than a POSIX host, so the budget is set per case rather than relying on the
// suite's 20 s default.
const SPAWN_BUDGET = 120_000;

const work = mkdtempSync(join(tmpdir(), "stamity-hook-latency-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** A fake guard: reads its payload the way the real one does, then runs `body`. */
function fakeGuard(name: string, body: string): string {
  const path = join(work, name);
  writeFileSync(path, `const payload = require("node:fs").readFileSync(0, "utf8");\n${body}\n`, "utf8");
  return path;
}

function run(...args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO_ROOT, encoding: "utf8", windowsHide: true });
}

/** The table's data rows as `[case, median, overhead]`, header and separator dropped. */
function tableRows(stdout: string): string[][] {
  return stdout
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| case ") && !line.startsWith("|---"))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
}

describe("hook-latency: timing verdicts against fake guards", () => {
  it(
    "(a) a guard that exits at once gives exit 0 and a three-row table",
    () => {
      const guard = fakeGuard("instant.cjs", "");
      const result = run("--guard", guard);
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      const rows = tableRows(result.stdout);
      expect(rows.map((row) => row[0])).toEqual(["node start", "non-Write call", "allowed Write"]);
      for (const [, medianMs] of rows) expect(Number(medianMs)).toBeGreaterThan(0);
      expect(rows[0]?.[2]).toBe("—");
      for (const row of rows.slice(1)) expect(Number(row[2])).toBeLessThanOrEqual(BUDGET_MS);
      expect(result.stdout).toContain("7 runs after 1 warm-up");
    },
    SPAWN_BUDGET,
  );

  it(
    "(b) a guard that busy-waits 40 ms gives exit 1 and names the overhead",
    () => {
      const guard = fakeGuard("slow.cjs", "const end = Date.now() + 40;\nwhile (Date.now() < end) {}");
      const result = run("--guard", guard);
      expect(result.status).toBe(1);
      const messages = [...result.stderr.matchAll(/(non-Write call|allowed Write): guard overhead (\d+\.\d) ms over the 15 ms budget/g)];
      expect(messages.map((match) => match[1])).toEqual(["non-Write call", "allowed Write"]);
      // The message's number is the table's overhead, and the busy-wait makes it well past the budget.
      const rows = tableRows(result.stdout);
      for (const match of messages) {
        const overhead = Number(match[2]);
        expect(overhead).toBeGreaterThan(BUDGET_MS);
        expect(rows.find((row) => row[0] === match[1])?.[2]).toBe(match[2]);
      }
    },
    SPAWN_BUDGET,
  );
});

describe("hook-latency: runs that cannot measure exit 2", () => {
  it("(c) a missing guard path gives exit 2 and names the path", () => {
    const missing = join(work, "no-such-guard.mjs");
    const result = run("--guard", missing);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(missing);
    expect(result.stdout).toBe("");
  });

  it(
    "a guard that exits non-zero on one payload gives exit 2 naming that case",
    () => {
      const guard = fakeGuard(
        "refuses-write.cjs",
        'if (JSON.parse(payload).tool_name === "Write") { process.stderr.write("refused\\n"); process.exitCode = 3; }',
      );
      const result = run("--guard", guard, "--runs", "1");
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("allowed Write");
      expect(result.stderr).toContain("exited 3");
      expect(result.stderr).not.toContain("non-Write call");
    },
    SPAWN_BUDGET,
  );

  it.each([["0"], ["-1"], ["2.5"], ["seven"]])("--runs %s is refused with exit 2", (runs) => {
    const result = run("--guard", REAL_GUARD, "--runs", runs);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--runs");
  });

  it("an unknown argument is refused with exit 2", () => {
    const result = run("--guards", REAL_GUARD);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown argument: --guards");
  });
});

describe("hook-latency: the payloads", () => {
  it("both payloads are admitted by the real generated guard (untimed)", () => {
    const cases = payloads(REAL_GUARD) as { name: string; input: string }[];
    expect(cases.map((entry) => entry.name)).toEqual(["non-Write call", "allowed Write"]);
    expect(JSON.parse(cases[0]?.input ?? "")).toEqual({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls" },
    });
    for (const entry of cases) {
      const result = spawnSync(process.execPath, [REAL_GUARD], { input: entry.input, encoding: "utf8", windowsHide: true });
      expect({ name: entry.name, status: result.status, stderr: result.stderr }).toEqual({
        name: entry.name,
        status: 0,
        stderr: "",
      });
    }
  });

  it("the allowed Write reaches the guard's write-path check: the same payload aimed at src/ is refused", () => {
    // Without this, a Write the guard treats as out of scope would also exit 0, and the "allowed
    // Write" row would time the guard's early return rather than the verdict role's path walk.
    const write = JSON.parse((payloads(REAL_GUARD) as { input: string }[])[1]?.input ?? "");
    expect(write.agent_type).toBe(VERDICT_AGENT);
    write.tool_input.file_path = join(REPO_ROOT, "src", "cli.ts");
    const result = spawnSync(process.execPath, [REAL_GUARD], { input: JSON.stringify(write), encoding: "utf8", windowsHide: true });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("WRITE_PATH_DENIED");
  });

  it("the Write's path comes from the batch-sync-3 report row when present, else the fallback", () => {
    const row =
      "| **new guard, reviewer `Write` to `.stamity/runs/2026-09-23_orchestrator-context/reports/measure-reviewer-r1.md` (allowed)** | 36.4 | **36.0** | 0 |";
    expect(reportWritePath(`intro\n${row}\n`)).toBe(".stamity/runs/2026-09-23_orchestrator-context/reports/measure-reviewer-r1.md");
    expect(reportWritePath(undefined)).toBeUndefined();
    expect(reportWritePath("a report with no allowed Write row")).toBeUndefined();
    // A row whose path leaves the repository is not taken: the fallback stands.
    expect(reportWritePath("reviewer `Write` to `../outside-reviewer-r1.md` (allowed)")).toBeUndefined();

    const root = join(work, "root");
    const fromReport = writePayload(root, `${row}\n`);
    expect(fromReport.tool_input.file_path).toBe(
      join(root, ".stamity", "runs", "2026-09-23_orchestrator-context", "reports", "measure-reviewer-r1.md"),
    );
    const fallback = writePayload(root, undefined);
    expect(fallback.tool_input.file_path).toBe(join(root, ".stamity", "runs", "hook-latency", "reports", "latency-reviewer-r1.md"));
    expect(fallback).toMatchObject({ hook_event_name: "PreToolUse", agent_type: VERDICT_AGENT, tool_name: "Write" });
  });

  it("the median of an odd and an even count", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("hook-latency: the release checklist", () => {
  it("(d) the release-controls checklist carries the line and names the command", () => {
    const checklist = readFileSync(join(REPO_ROOT, ".github", "release-controls-checklist.md"), "utf8");
    const lines = checklist.split("\n").filter((line) => line.includes("`node scripts/hook-latency.mjs`"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/exits 0/);
    expect(lines[0]).toMatch(/release record/);
  });
});
