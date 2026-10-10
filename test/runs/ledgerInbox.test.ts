import { mkdir, symlink, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../../src/cli.ts";
import { INBOX_SCREEN } from "../../src/cli/commands/ledger.ts";
import { SESSION_START_SCREEN, SESSION_START_SCREEN_PATTERN_IDS } from "../../src/hooks/scripts.ts";
import { INBOX_PATH } from "../../src/runs/inboxStore.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir, type TempDirHandle } from "../support/tempDir.ts";

/**
 * `stamity ledger inbox` (q1a-inbox-store, REQ-FLOW-068, REQ-FLOW-075): the
 * deferral inbox's query, through the in-process funnel, so each case also
 * covers the exit code and the single JSON document.
 *
 * Real-filesystem lane: the read refuses a link and an oversized file by what
 * `lstat` sees, which a virtual volume cannot show. Every inbox here is
 * hand-built; no fixture copies a real inbox row. A screened string is built
 * at run time from fragments, and an invisible character from its code point,
 * so this file carries neither as typed text.
 */

const tempDir = useTempDir("stamity-ledger-inbox");
const WINDOWS = process.platform === "win32";

/** U+200B, built from its code point (learning typed-unicode-escapes-land-as-raw-code-points). */
const ZWSP = String.fromCodePoint(0x200b);

/** A string the screen's first row, `fake-instruction-header`, matches: a heading after a carriage return. */
const HEADER_HIT = ["\r", "#".repeat(2), " instr", "uctions: ", "quiet words"].join("");
/** The same heading with its keyword split by a zero-width space: only the stripped view sees it. */
const HEADER_HIT_SPLIT = ["\r", "#".repeat(2), " instr", ZWSP, "uctions: ", "quiet words"].join("");
/** A string the write path's `send-data-external` row matches, a row the session-start screen drops. */
const EXFIL_HIT = ["se", "nd to ext", "ernal collector ", "quiet words"].join("");

/** The fixture inbox: prose around six bullets, one of each outcome a query reports. */
const INBOX = [
  "# Deferral inbox",
  "",
  "Prose a writer may put anywhere.",
  "- Warning · src/a.ts:12 · the consequence · source: /st-work · Ref: .stamity/runs/r/ledger.jsonl#r/build/1",
  "- Minor · docs/b.md:3 · elsewhere · source: /st-work",
  "- Critical · docs/c.md:1 · held for a person · source: /st-rework · critical-deferred",
  "- Minor · — · d · source: x · two words",
  `- Minor · src/a.ts:20 · a row${HEADER_HIT} · source: /st-work`,
  `- Minor · src/a.ts:30 · d · source: x · tagword · ${EXFIL_HIT}`,
  "",
].join("\n");

async function seedInbox(dir: TempDirHandle, text: string): Promise<void> {
  await dir.seedFiles({ [INBOX_PATH]: text });
}

async function inbox(dir: TempDirHandle, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return await runInProcess(COMMANDS, ["ledger", "inbox", ...args], { cwd: dir.dir });
}

describe("stamity ledger inbox", () => {
  it("prints the count line, the matched rows, the unparsed lines and the skipped lines", async () => {
    const dir = tempDir();
    await seedInbox(dir, INBOX);

    const result = await inbox(dir, "--paths", "src/a.ts");

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      [
        "inbox: 6 rows · 2 matched · 1 unmatched · 1 unparsed · 2 skipped",
        "4 Warning · src/a.ts:12 · the consequence (path)",
        "6 Critical · docs/c.md:1 · held for a person · critical-deferred (always)",
        "unparsed: 7: trailing field(s) beyond one optional tag word — two words",
        "skipped: 8 (fake-instruction-header)",
        "skipped: 9 (send-data-external)",
        "",
      ].join("\n"),
    );
    expect(result.stdout).not.toContain("quiet");
    expect(result.stdout).not.toContain("tagword");
  });

  it("answers --json with the one document the query defines", async () => {
    const dir = tempDir();
    await seedInbox(dir, INBOX);

    const result = await inbox(dir, "--paths", "src/a.ts", "--json");

    expect(result.code).toBe(0);
    const doc = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(doc).toMatchObject({ ok: true, command: "ledger" });
    const { ok: _ok, command: _command, version: _version, ...payload } = doc;
    expect(payload).toEqual({
      inbox: INBOX_PATH,
      total: 6,
      matched: [
        {
          line: 4,
          severity: "Warning",
          location: "src/a.ts:12",
          description: "the consequence",
          source: "/st-work",
          ref: ".stamity/runs/r/ledger.jsonl#r/build/1",
          tag: null,
          matchedBy: "path",
        },
        {
          line: 6,
          severity: "Critical",
          location: "docs/c.md:1",
          description: "held for a person",
          source: "/st-rework",
          ref: null,
          tag: "critical-deferred",
          matchedBy: "always",
        },
      ],
      counts: { Critical: 1, Warning: 1, Minor: 0, Info: 0 },
      unmatched: 1,
      problems: [{ line: 7, message: "trailing field(s) beyond one optional tag word — two words" }],
      skipped: [
        { line: 8, pattern: "fake-instruction-header" },
        { line: 9, pattern: "send-data-external" },
      ],
    });
    expect(result.stdout).not.toContain("quiet");
  });

  it("matches every row as all with no filter, by plan, and by area word", async () => {
    const dir = tempDir();
    await seedInbox(
      dir,
      [
        "- Minor · src/a.ts:1 · first · source: x",
        "- Minor · — · the ledger note · source: x · Ref: docs/plans/019-a.md#u1",
        "- Minor · — · the ledgers note · source: x",
      ].join("\n"),
    );

    const all = await inbox(dir);
    expect(all.stdout.split("\n").slice(0, 4)).toEqual([
      "inbox: 3 rows · 3 matched · 0 unmatched · 0 unparsed · 0 skipped",
      "1 Minor · src/a.ts:1 · first (all)",
      "2 Minor · — · the ledger note (all)",
      "3 Minor · — · the ledgers note (all)",
    ]);
    const plan = await inbox(dir, "--plan", "docs/plans/019-a.md");
    expect(plan.stdout).toBe("inbox: 3 rows · 1 matched · 2 unmatched · 0 unparsed · 0 skipped\n2 Minor · — · the ledger note (plan)\n");
    const area = await inbox(dir, "--area", "ledger");
    expect(area.stdout).toBe("inbox: 3 rows · 1 matched · 2 unmatched · 0 unparsed · 0 skipped\n2 Minor · — · the ledger note (area)\n");
  });

  it("skips a row whose screened keyword an invisible character splits, by the stripped view", async () => {
    const dir = tempDir();
    await seedInbox(dir, `- Minor · src/a.ts:1 · a row${HEADER_HIT_SPLIT} · source: x\n`);

    const result = await inbox(dir);

    expect(result.stdout).toBe("inbox: 1 rows · 0 matched · 0 unmatched · 0 unparsed · 1 skipped\nskipped: 1 (fake-instruction-header)\n");
  });

  it("flattens a control character in a printed field", async () => {
    const dir = tempDir();
    await seedInbox(dir, "- Minor · src/a.ts:1 · tab\there · source: x\n");

    const result = await inbox(dir);

    expect(result.stdout).toContain("1 Minor · src/a.ts:1 · tab here (all)\n");
  });

  it("reports an absent inbox as total 0, and --dry-run changes nothing", async () => {
    const dir = tempDir();
    await mkdir(dir.path(".stamity"));

    const human = await inbox(dir, "--dry-run");
    const json = await inbox(dir, "--json");

    expect(human.code).toBe(0);
    expect(human.stdout).toBe("inbox: absent\n");
    expect(JSON.parse(json.stdout)).toMatchObject({
      inbox: INBOX_PATH,
      total: 0,
      matched: [],
      counts: { Critical: 0, Warning: 0, Minor: 0, Info: 0 },
      unmatched: 0,
      problems: [],
      skipped: [],
    });
  });

  it("refuses a repository with no state directory", async () => {
    const dir = tempDir();
    const result = await inbox(dir);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("there is no .stamity/ directory to read the deferral inbox from");
  });

  it("refuses an inbox over 1 MiB", async () => {
    const dir = tempDir();
    await seedInbox(dir, `- Minor · — · ${"x".repeat(1024 * 1024)} · source: x\n`);

    const result = await inbox(dir, "--json");

    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it.skipIf(WINDOWS)("refuses an inbox that is a symbolic link, and never reads through it", async () => {
    const dir = tempDir();
    await mkdir(dir.path(".stamity"));
    await writeFile(dir.path("elsewhere.md"), "- Minor · src/a.ts:1 · outside words · source: x\n");
    await symlink(dir.path("elsewhere.md"), dir.path(INBOX_PATH));

    const result = await inbox(dir);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("is a symbolic link");
    expect(result.stderr).not.toContain("outside words");
  });

  it.each([
    [["ledger", "inbox", "--run", "2026-09-23_demo"], "ledger inbox takes no --run; it is a flag of ledger append and ledger close and ledger status"],
    [["ledger", "inbox", "--ids", "a"], "ledger inbox takes no --ids; it is a flag of ledger close"],
    [["ledger", "status", "--paths", "a"], "ledger status takes no --paths; it is a flag of ledger inbox"],
    [["ledger", "close", "--plan", "a"], "ledger close takes no --plan; it is a flag of ledger inbox"],
    [["ledger", "append", "--area", "a"], "ledger append takes no --area; it is a flag of ledger inbox"],
  ])("refuses %j as a usage error naming the owner", async (argv, message) => {
    const dir = tempDir();
    await mkdir(dir.path(".stamity"));

    const human = await runInProcess(COMMANDS, argv, { cwd: dir.dir });
    const json = await runInProcess(COMMANDS, [...argv, "--json"], { cwd: dir.dir });

    expect(human.code).toBe(1);
    expect(human.stderr).toContain(message);
    expect(JSON.parse(json.stdout)).toMatchObject({ ok: false, error: { code: "USAGE" } });
  });
});

describe("INBOX_SCREEN", () => {
  it("holds every session-start id and the three exfil rows the session-start screen drops", () => {
    const ids = INBOX_SCREEN.map((entry) => entry.id);
    for (const id of SESSION_START_SCREEN_PATTERN_IDS) expect(ids).toContain(id);
    for (const id of ["remote-exec-pipe", "send-data-external", "image-url-exfiltration"]) expect(ids).toContain(id);
    // The fixture above targets the screen's first row by name.
    expect(SESSION_START_SCREEN[0]?.id).toBe("fake-instruction-header");
    expect(ids[0]).toBe("fake-instruction-header");
  });
});
