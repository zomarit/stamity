import { linkSync, statSync, type Stats } from "node:fs";
import { link, mkdir, open, symlink, writeFile, type FileHandle } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { COMMANDS } from "../../src/cli.ts";
import {
  INBOX_BULLET_MAX_CHARS,
  INBOX_LISTED_MAX,
  INBOX_OVER_LENGTH,
  INBOX_SCREEN,
} from "../../src/cli/commands/ledger.ts";
import { runCli } from "../../src/cli/kit/program.ts";
import { SESSION_START_SCREEN, SESSION_START_SCREEN_PATTERN_IDS } from "../../src/hooks/scripts.ts";
import { INBOX_PATH, SCHEDULE_RULE_HEADING } from "../../src/runs/inboxStore.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir, type TempDirHandle } from "../support/tempDir.ts";

/**
 * `stamity ledger inbox` (q1a-inbox-store, REQ-FLOW-068, REQ-FLOW-075;
 * q9b-inbox-schedule-grammar, REQ-FLOW-076): the deferral inbox's query,
 * through the in-process funnel, so each case also covers the exit code and
 * the single JSON document.
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
/** A string the `never-verify` row matches anywhere on one line, with no heading shape. */
const NEVER_HIT = ["nev", "er re", "view the quiet words"].join("");

/** U+0001 and U+0085, built from their code points: a C0 and a C1 control the printed form drops. */
const C0 = String.fromCodePoint(0x01);
const C1 = String.fromCodePoint(0x85);
/** The `never-verify` string with a C0 control inside its first word: only the printed form joins it. */
const NEVER_HIT_C0 = ["ne", C0, "ver re", "view the quiet words"].join("");
/** The same with a C1 control between two spaces, which no whitespace class bridges until it is dropped. */
const NEVER_HIT_C1 = ["nev", "er ", C1, " re", "view the quiet words"].join("");
/** The first row's heading with no line break before it: a hit only where the field is a string of its own. */
const HEADER_FIELD_HIT = ["#".repeat(2), " instr", "uctions: ", "quiet words"].join("");

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

/** What every refused read says first: the caller is not to fall back on a whole-file read, and reports it. */
const REFUSAL_NEXT =
  "do not read .stamity/inbox.md whole in this query's place, since a whole read is unscreened; report this refusal as a finding";

async function seedInbox(dir: TempDirHandle, text: string): Promise<void> {
  await dir.seedFiles({ [INBOX_PATH]: text });
}

async function inbox(dir: TempDirHandle, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return await runInProcess(COMMANDS, ["ledger", "inbox", ...args], { cwd: dir.dir });
}

/**
 * `ledger inbox` through the funnel on a fixed clock, as `cliAt` of
 * `test/runs/ledgerClose.test.ts` runs a retirement. The kit's own clock seam
 * (`RunCliOptions.clock`), not a mock: `runInProcess` forwards no clock, and a
 * `--due` with no value reads its day from the one the funnel is handed.
 */
async function inboxAt(
  dir: TempDirHandle,
  now: Date,
  ...args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(["ledger", "inbox", ...args], COMMANDS, {
    cwd: dir.dir,
    env: {},
    io: {
      out: (text) => {
        stdout.push(text);
      },
      err: (text) => {
        stderr.push(text);
      },
    },
    terminal: { stdoutIsTTY: false, stderrIsTTY: false, stdinIsTTY: false },
    clock: { now: () => now },
  });
  return { code, stdout: stdout.join(""), stderr: stderr.join("") };
}

/**
 * `ledger inbox` with a second writer acting on the inbox while the query holds
 * its descriptor: `act` runs once, at the descriptor's own `stat`, and the
 * query is handed the stats taken `before` or `after` it. The descriptor is
 * reached by its class, taken off a live one, and told apart by its inode; the
 * module is not mocked, so the query still runs on the real filesystem. Fails
 * when the query took no `stat` of the inbox's descriptor, since the case
 * would then prove nothing.
 */
async function inboxRaced(
  dir: TempDirHandle,
  act: () => void,
  report: "before" | "after",
  ...args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  const inboxFile = dir.path(INBOX_PATH);
  const { dev, ino } = statSync(inboxFile);
  const probe = await open(inboxFile, "r");
  const handleClass = Object.getPrototypeOf(probe) as { stat: (this: FileHandle) => Promise<Stats> };
  await probe.close();
  const realStat = handleClass.stat;
  let acted = false;
  const spy = vi.spyOn(handleClass, "stat").mockImplementation(async function raced(this: FileHandle): Promise<Stats> {
    const before = await realStat.call(this);
    if (acted || before.dev !== dev || before.ino !== ino) return before;
    acted = true;
    act();
    return report === "before" ? before : await realStat.call(this);
  });
  try {
    const result = await inbox(dir, ...args);
    expect(acted, "the query took no stat of the inbox's own descriptor").toBe(true);
    return result;
  } finally {
    spy.mockRestore();
  }
}

/** A string the `exfiltrate` row matches with no space in it, so it survives as one `files:` entry. */
const SPACELESS_HIT = ["exfil", "trate"].join("");

describe("stamity ledger inbox", () => {
  it("prints the count line, the matched rows, the unparsed lines and the skipped lines", async () => {
    const dir = tempDir();
    await seedInbox(dir, INBOX);

    const result = await inbox(dir, "--paths", "src/a.ts");

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      [
        "inbox: 6 rows · 3 matched · 1 unmatched · 1 unparsed · 2 skipped",
        "4 Warning · src/a.ts:12 · the consequence (path)",
        "6 Critical · docs/c.md:1 · held for a person · critical-deferred (always)",
        "8 Minor · src/a.ts:20 · withheld by the screen (fake-instruction-header); read it by hand (path)",
        "unparsed: 7: trailing field(s) beyond one optional tag word — two words",
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
    // TEST CHANGE, justified (2026-10-10, q9b-inbox-schedule-grammar): the document gained `due`
    // and `triggers`, and each matched row `by`, `when` and `files` (REQ-FLOW-076), so this
    // whole-document pin names them. Every key it pinned before keeps its value.
    // TEST CHANGE, justified (2026-10-10, review/27): the document gained `truncated`, the count of
    // the `problems` and `skipped` entries past the cap, so the three whole-document pins of this
    // file name it. Every key they pinned before keeps its value.
    // TEST CHANGE, justified (2026-10-10, review/78): `skipped` held line 8 too, the withheld row
    // the query matches. The document's list now leaves out the rows `matched` already carries
    // with their pattern id as `withheld`, as the human listing leaves out their skip lines, and
    // caps what is left; capped first, such rows could fill the list ahead of a refused bullet.
    // Eight pins of this file named a matched withheld row under `skipped`, this one among them,
    // and each moved. A withheld row the query does not match, or whose line the screen hits,
    // stays listed.
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
          by: null,
          when: null,
          files: [],
          matchedBy: "path",
          withheld: null,
        },
        {
          line: 6,
          severity: "Critical",
          location: "docs/c.md:1",
          description: "held for a person",
          source: "/st-rework",
          ref: null,
          tag: "critical-deferred",
          by: null,
          when: null,
          files: [],
          matchedBy: "always",
          withheld: null,
        },
        {
          line: 8,
          severity: "Minor",
          location: "src/a.ts:20",
          description: null,
          source: null,
          ref: null,
          tag: null,
          by: null,
          when: null,
          files: [],
          matchedBy: "path",
          withheld: "fake-instruction-header",
        },
      ],
      counts: { Critical: 1, Warning: 1, Minor: 1, Info: 0 },
      unmatched: 1,
      problems: [{ line: 7, message: "trailing field(s) beyond one optional tag word — two words" }],
      skipped: [{ line: 9, pattern: "send-data-external" }],
      truncated: { problems: 0, skipped: 0 },
      due: null,
      triggers: 0,
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

  it("withholds a row whose screened keyword an invisible character splits, by the stripped view", async () => {
    const dir = tempDir();
    await seedInbox(dir, `- Minor · src/a.ts:1 · a row${HEADER_HIT_SPLIT} · source: x\n`);

    const result = await inbox(dir);

    expect(result.stdout).toBe(
      "inbox: 1 rows · 1 matched · 0 unmatched · 0 unparsed · 1 skipped\n1 Minor · src/a.ts:1 · withheld by the screen (fake-instruction-header); read it by hand (all)\n",
    );
  });

  // review/9: the screen reads what prints. The printed form drops C0 and C1 controls that no other
  // view removes, so a keyword one of them splits prints joined unless that form is screened too.
  it.each([
    ["a C0 control inside a word", NEVER_HIT_C0],
    ["a C1 control between two spaces", NEVER_HIT_C1],
  ])("withholds a row whose screened keyword %s splits, by the printed view", async (_name, hit) => {
    const dir = tempDir();
    await seedInbox(
      dir,
      [`- Minor · docs/b.md:1 · a row ${hit} · source: x`, `- Minor · — · d · source: x · tagword · ${hit}`, ""].join("\n"),
    );

    const human = await inbox(dir, "--paths", "src/a.ts");
    const json = await inbox(dir, "--json");

    expect(human.stdout).toBe(
      "inbox: 2 rows · 0 matched · 0 unmatched · 0 unparsed · 2 skipped\nskipped: 1 (never-verify)\nskipped: 2 (never-verify)\n",
    );
    expect(json.stdout).not.toContain("quiet");
    expect(json.stdout).not.toContain("tagword");
    // TEST CHANGE, justified (2026-10-10, review/78): as the first document pin's note says, the
    // matched withheld row left `skipped`; `matched` carries it, with its pattern id as `withheld`.
    // Line 2 does not parse, so it is no row and stays.
    expect(JSON.parse(json.stdout)).toMatchObject({
      matched: [{ line: 1, description: null, withheld: "never-verify" }],
      problems: [],
      skipped: [{ line: 2, pattern: "never-verify" }],
    });
  });

  it("withholds a row one of whose fields hits the screen only as a string of its own", async () => {
    const dir = tempDir();
    await seedInbox(dir, `- Minor · src/a.ts:1 · ${HEADER_FIELD_HIT} · source: x\n`);

    const result = await inbox(dir, "--json");

    expect(result.stdout).not.toContain("quiet");
    // TEST CHANGE, justified (2026-10-10, review/78): as the first document pin's note says, the
    // matched withheld row left `skipped`; `matched` carries it, with its pattern id as `withheld`.
    expect(JSON.parse(result.stdout)).toMatchObject({
      matched: [{ line: 1, description: null, withheld: "fake-instruction-header" }],
      skipped: [],
    });
  });

  // review/6, review/10 (the plan/30 sign-off): a row the screen withholds still matches by its
  // location and prints its line, severity and location, when those pass the screen alone.
  describe("a row the screen withholds", () => {
    const WITHHELD = `- Warning · src/a.ts:3 · a row ${NEVER_HIT} · source: hidden-writer · Ref: docs/plans/hidden.md#u1`;

    it("prints only its skip line when the query does not match its location", async () => {
      const dir = tempDir();
      await seedInbox(dir, `${WITHHELD}\n`);

      const other = await inbox(dir, "--paths", "docs/b.md");
      const byRef = await inbox(dir, "--paths", "docs/plans/hidden.md");
      const byPlan = await inbox(dir, "--plan", "docs/plans/hidden.md");

      const skipOnly = "inbox: 1 rows · 0 matched · 0 unmatched · 0 unparsed · 1 skipped\nskipped: 1 (never-verify)\n";
      expect(other.stdout).toBe(skipOnly);
      // Its `Ref:` is never handed to the match.
      expect(byRef.stdout).toBe(skipOnly);
      expect(byPlan.stdout).toBe(skipOnly);
    });

    it("matches an area word in its location, never one in its description", async () => {
      const dir = tempDir();
      await seedInbox(dir, `- Warning · the release checklist · a row ${NEVER_HIT} · source: x\n`);

      const byDescription = await inbox(dir, "--area", "quiet");
      const byLocation = await inbox(dir, "--area", "checklist");

      expect(byDescription.stdout).toBe("inbox: 1 rows · 0 matched · 0 unmatched · 0 unparsed · 1 skipped\nskipped: 1 (never-verify)\n");
      expect(byLocation.stdout).toBe(
        "inbox: 1 rows · 1 matched · 0 unmatched · 0 unparsed · 1 skipped\n1 Warning · the release checklist · withheld by the screen (never-verify); read it by hand (area)\n",
      );
    });

    it("matches by its location and prints its line, severity and location, never its description", async () => {
      const dir = tempDir();
      await seedInbox(dir, `# Deferral inbox\n\n${WITHHELD}\n- Minor · src/a.ts:9 · clean · source: x\n`);

      const human = await inbox(dir, "--paths", "src/a.ts");
      const json = await inbox(dir, "--paths", "src/a.ts", "--json");

      expect(human.stdout).toBe(
        [
          "inbox: 2 rows · 2 matched · 0 unmatched · 0 unparsed · 1 skipped",
          "3 Warning · src/a.ts:3 · withheld by the screen (never-verify); read it by hand (path)",
          "4 Minor · src/a.ts:9 · clean (path)",
          "",
        ].join("\n"),
      );
      for (const word of ["quiet", "hidden"]) expect(json.stdout).not.toContain(word);
      const { ok: _ok, command: _command, version: _version, ...payload } = JSON.parse(json.stdout) as Record<string, unknown>;
      // TEST CHANGE, justified (2026-10-10, q9b-inbox-schedule-grammar): as the document pin
      // above, the new `due`, `triggers`, `by`, `when` and `files` keys are named; no value moved.
      // TEST CHANGE, justified (2026-10-10, review/78): as the first document pin's note says, the
      // matched withheld row left `skipped`; `matched` carries it, with its pattern id as `withheld`.
      expect(payload).toEqual({
        inbox: INBOX_PATH,
        total: 2,
        matched: [
          {
            line: 3,
            severity: "Warning",
            location: "src/a.ts:3",
            description: null,
            source: null,
            ref: null,
            tag: null,
            by: null,
            when: null,
            files: [],
            matchedBy: "path",
            withheld: "never-verify",
          },
          {
            line: 4,
            severity: "Minor",
            location: "src/a.ts:9",
            description: "clean",
            source: "x",
            ref: null,
            tag: null,
            by: null,
            when: null,
            files: [],
            matchedBy: "path",
            withheld: null,
          },
        ],
        counts: { Critical: 0, Warning: 1, Minor: 1, Info: 0 },
        unmatched: 0,
        problems: [],
        skipped: [],
        truncated: { problems: 0, skipped: 0 },
        due: null,
        triggers: 0,
      });
    });

    it("matches every row as all with no filter, a withheld one included", async () => {
      const dir = tempDir();
      await seedInbox(dir, `${WITHHELD}\n`);

      const result = await inbox(dir);

      expect(result.stdout).toBe(
        "inbox: 1 rows · 1 matched · 0 unmatched · 0 unparsed · 1 skipped\n1 Warning · src/a.ts:3 · withheld by the screen (never-verify); read it by hand (all)\n",
      );
    });

    it("prints only its skip line when its location fails the screen alone, or the line does not parse", async () => {
      const dir = tempDir();
      await seedInbox(
        dir,
        [`- Warning · src/a.ts ${NEVER_HIT} · d · source: x`, `- Warning · src/a.ts:3 · ${NEVER_HIT}`, ""].join("\n"),
      );

      const paths = await inbox(dir, "--paths", "src/a.ts");
      const all = await inbox(dir, "--json");

      expect(paths.stdout).toBe(
        "inbox: 2 rows · 0 matched · 0 unmatched · 0 unparsed · 2 skipped\nskipped: 1 (never-verify)\nskipped: 2 (never-verify)\n",
      );
      expect(all.stdout).not.toContain("quiet");
      expect(JSON.parse(all.stdout)).toMatchObject({ total: 2, matched: [], unmatched: 0, problems: [] });
    });

    it("still shows a row tagged with an always-shown word, as withheld, and prints no other tag", async () => {
      const dir = tempDir();
      await seedInbox(
        dir,
        [
          `- Critical · docs/c.md:1 · a row ${NEVER_HIT} · source: x · critical-deferred`,
          `- Warning · — · a row ${NEVER_HIT} · source: x · decision-waiting`,
          `- Minor · src/a.ts:5 · a row ${NEVER_HIT} · source: x · tagword`,
          "",
        ].join("\n"),
      );

      const human = await inbox(dir, "--paths", "src/a.ts");
      const json = await inbox(dir, "--paths", "src/a.ts", "--json");

      expect(human.stdout).toBe(
        [
          "inbox: 3 rows · 3 matched · 0 unmatched · 0 unparsed · 3 skipped",
          "1 Critical · docs/c.md:1 · withheld by the screen (never-verify); read it by hand · critical-deferred (always)",
          "2 Warning · — · withheld by the screen (never-verify); read it by hand · decision-waiting (always)",
          "3 Minor · src/a.ts:5 · withheld by the screen (never-verify); read it by hand (path)",
          "",
        ].join("\n"),
      );
      expect(json.stdout).not.toContain("tagword");
      expect(JSON.parse(json.stdout)).toMatchObject({
        matched: [
          { line: 1, tag: "critical-deferred", matchedBy: "always", withheld: "never-verify" },
          { line: 2, tag: "decision-waiting", matchedBy: "always", withheld: "never-verify" },
          { line: 3, tag: null, matchedBy: "path", withheld: "never-verify" },
        ],
        counts: { Critical: 1, Warning: 1, Minor: 1, Info: 0 },
      });
    });
  });

  // review/11: two screen rows backtrack quadratically on one long line, so a bullet past the cap is
  // skipped by its line number before any pattern reads it.
  describe("a bullet past the length cap", () => {
    it("pins the cap, and names a reason no screen row carries", () => {
      expect(INBOX_BULLET_MAX_CHARS).toBe(4096);
      expect(INBOX_OVER_LENGTH).toBe("over-length");
      expect(INBOX_SCREEN.map((entry) => entry.id)).not.toContain(INBOX_OVER_LENGTH);
    });

    it("is skipped by its line number whatever the query, and a bullet at the cap is read", async () => {
      const dir = tempDir();
      const head = "- Minor · src/a.ts:1 · ";
      const tail = " · source: x";
      const atCap = `${head}${"x".repeat(INBOX_BULLET_MAX_CHARS - head.length - tail.length)}${tail}`;
      const pastCap = `${head}${"y".repeat(INBOX_BULLET_MAX_CHARS + 1 - head.length - tail.length)}${tail}`;
      expect(atCap).toHaveLength(INBOX_BULLET_MAX_CHARS);
      await seedInbox(dir, [atCap, pastCap, `${pastCap} · two words`, ""].join("\n"));

      const result = await inbox(dir, "--paths", "src/a.ts");

      const lines = result.stdout.split("\n");
      expect(lines[0]).toBe("inbox: 3 rows · 1 matched · 0 unmatched · 0 unparsed · 2 skipped");
      expect(lines[1]).toBe(`1 Minor · src/a.ts:1 · ${"x".repeat(INBOX_BULLET_MAX_CHARS - head.length - tail.length)} (path)`);
      expect(lines.slice(2)).toEqual(["skipped: 2 (over-length)", "skipped: 3 (over-length)", ""]);
    });

    it("never hands a long line of repeated fetch words to the screen", async () => {
      const dir = tempDir();
      const fetchWord = ["cu", "rl "].join("");
      await seedInbox(dir, `- Minor · src/a.ts:1 · ${fetchWord.repeat(25_000)} · source: x\n`);

      const result = await inbox(dir);

      expect(result.stdout).toBe("inbox: 1 rows · 0 matched · 0 unmatched · 0 unparsed · 1 skipped\nskipped: 1 (over-length)\n");
    });
  });

  // q9b (REQ-FLOW-076, S16): rows come back when their day arrives or their files are touched.
  //
  // 2026-10-10, build/17 with review/30 and review/33 (signed off): under `--due` the count line's
  // tail is `· <n> due by <day> · <n> triggers`, the first <n> counting the matched rows whose `by:`
  // day is on or before the day, whatever each matched by. The five count lines pinned below moved
  // with it from `· <day> due · <n> triggers`; the JSON keys `due` and `triggers` did not move.
  describe("--due and the schedule fields", () => {
    /** Rows above and below the rule's heading: three dated, two triggered, one of them touched by its files. */
    const SCHEDULED = [
      "# Deferral inbox",
      "",
      "- Minor · docs/old.md:1 · an older row · source: x",
      "",
      SCHEDULE_RULE_HEADING,
      "",
      "- Warning · docs/b.md:3 · overdue · source: x · by: 2026-11-01",
      "- Minor · — · due on the day · source: x · files: src/b.ts, src/c.ts · by: 2026-12-01 · 2026-10-10",
      "- Minor · docs/d.md:1 · not yet · source: x · by: 2026-12-02",
      "- Minor · — · waits on an event · source: x · when: the next release",
      "- Minor · — · waits on a touch · source: x · when: touched · files: src/e.ts",
      "- Minor · docs/f.md:1 · no day and no trigger · source: x",
      "",
    ].join("\n");

    // review/89: a day under `when:` is no row. It parsed as a trigger and was counted among the
    // rows no query sees arrive; it now prints as unparsed, with where a day goes.
    it("lists a row whose when: holds a day as unparsed, naming by: for it", async () => {
      const dir = tempDir();
      await seedInbox(dir, `${SCHEDULE_RULE_HEADING}\n\n- Minor · — · meant for a day · source: x · when: 2026-11-01\n`);

      const result = await inbox(dir, "--due", "2026-12-01");

      expect(result.stdout).toBe(
        [
          "inbox: 1 rows · 0 matched · 0 unmatched · 1 unparsed · 0 skipped · 0 due by 2026-12-01 · 0 triggers",
          "unparsed: 3: `when:` names a day and no event; a day goes under `by: <YYYY-MM-DD>`",
          "",
        ].join("\n"),
      );
    });

    it("matches the rows whose by: is on or before the day as due, and only counts the triggers", async () => {
      const dir = tempDir();
      await seedInbox(dir, SCHEDULED);

      const human = await inbox(dir, "--due", "2026-12-01");
      const json = await inbox(dir, "--due", "2026-12-01", "--json");

      expect(human.code).toBe(0);
      expect(human.stdout).toBe(
        [
          "inbox: 7 rows · 2 matched · 4 unmatched · 1 unparsed · 0 skipped · 2 due by 2026-12-01 · 2 triggers",
          "7 Warning · docs/b.md:3 · overdue (due)",
          "8 Minor · — · due on the day (due)",
          "unparsed: 12: a row under `## Rows under the schedule rule` carries `by: <YYYY-MM-DD>` or `when: <trigger>`; this one carries neither",
          "",
        ].join("\n"),
      );
      const { ok: _ok, command: _command, version: _version, ...payload } = JSON.parse(json.stdout) as Record<string, unknown>;
      expect(payload).toEqual({
        inbox: INBOX_PATH,
        total: 7,
        matched: [
          {
            line: 7,
            severity: "Warning",
            location: "docs/b.md:3",
            description: "overdue",
            source: "x",
            ref: null,
            tag: null,
            by: "2026-11-01",
            when: null,
            files: [],
            matchedBy: "due",
            withheld: null,
          },
          {
            line: 8,
            severity: "Minor",
            location: "—",
            description: "due on the day",
            source: "x",
            ref: null,
            tag: null,
            by: "2026-12-01",
            when: null,
            files: ["src/b.ts", "src/c.ts"],
            matchedBy: "due",
            withheld: null,
          },
        ],
        counts: { Critical: 0, Warning: 1, Minor: 1, Info: 0 },
        unmatched: 4,
        problems: [
          {
            line: 12,
            message:
              "a row under `## Rows under the schedule rule` carries `by: <YYYY-MM-DD>` or `when: <trigger>`; this one carries neither",
          },
        ],
        skipped: [],
        truncated: { problems: 0, skipped: 0 },
        due: "2026-12-01",
        triggers: 2,
      });
    });

    it("matches a row by a files: entry, and a touched trigger stops waiting", async () => {
      const dir = tempDir();
      await seedInbox(dir, SCHEDULED);

      const result = await inbox(dir, "--paths", "src/c.ts", "src/e.ts", "--due", "2026-10-31", "--json");

      expect(JSON.parse(result.stdout)).toMatchObject({
        matched: [
          { line: 8, matchedBy: "path", by: "2026-12-01", files: ["src/b.ts", "src/c.ts"] },
          { line: 11, matchedBy: "path", when: "touched", files: ["src/e.ts"] },
        ],
        unmatched: 4,
        due: "2026-10-31",
        triggers: 1,
      });
    });

    it("counts a row both touched and overdue as due, though it matches as path", async () => {
      const dir = tempDir();
      await seedInbox(dir, SCHEDULED);

      const human = await inbox(dir, "--paths", "docs/b.md", "docs/d.md", "--due", "2026-12-01");
      const json = await inbox(dir, "--paths", "docs/b.md", "docs/d.md", "--due", "2026-12-01", "--json");

      // Row 7 is overdue and touched, row 8 is due, and row 9 is touched a day before its own.
      expect(human.stdout.split("\n").slice(0, 4)).toEqual([
        "inbox: 7 rows · 3 matched · 3 unmatched · 1 unparsed · 0 skipped · 2 due by 2026-12-01 · 2 triggers",
        "7 Warning · docs/b.md:3 · overdue (path)",
        "8 Minor · — · due on the day (due)",
        "9 Minor · docs/d.md:1 · not yet (path)",
      ]);
      expect(JSON.parse(json.stdout)).toMatchObject({
        matched: [
          { line: 7, by: "2026-11-01", matchedBy: "path" },
          { line: 8, by: "2026-12-01", matchedBy: "due" },
          { line: 9, by: "2026-12-02", matchedBy: "path" },
        ],
        due: "2026-12-01",
        triggers: 2,
      });
    });

    it("reads the day from the clock when --due carries no value", async () => {
      const dir = tempDir();
      await seedInbox(dir, SCHEDULED);
      const now = new Date("2026-11-02T23:30:00Z");

      const human = await inboxAt(dir, now, "--due");
      const json = await inboxAt(dir, now, "--due", "--paths", "src/z.ts", "--json");

      expect(human.code).toBe(0);
      expect(human.stdout.split("\n").slice(0, 2)).toEqual([
        "inbox: 7 rows · 1 matched · 5 unmatched · 1 unparsed · 0 skipped · 1 due by 2026-11-02 · 2 triggers",
        "7 Warning · docs/b.md:3 · overdue (due)",
      ]);
      expect(JSON.parse(json.stdout)).toMatchObject({ due: "2026-11-02", matched: [{ line: 7, matchedBy: "due" }], triggers: 2 });
    });

    it("prints no due part without --due, and matches every row as all", async () => {
      const dir = tempDir();
      await seedInbox(dir, SCHEDULED);

      const result = await inbox(dir);

      expect(result.stdout.split("\n")[0]).toBe("inbox: 7 rows · 6 matched · 0 unmatched · 1 unparsed · 0 skipped");
    });

    it.each([["2026-02-30"], ["tomorrow"], ["2026-12-01T00:00:00Z"], ["src/a.ts"]])(
      "refuses --due %s as a usage error, before the inbox is read",
      async (value) => {
        const dir = tempDir();

        const human = await inbox(dir, "--due", value);
        const json = await inbox(dir, "--due", value, "--json");

        expect(human.code).toBe(1);
        expect(human.stdout).toBe("");
        expect(human.stderr).toContain("ledger inbox --due takes a day as YYYY-MM-DD");
        expect(human.stderr).not.toContain(value);
        expect(JSON.parse(json.stdout)).toMatchObject({ ok: false, error: { code: "USAGE" } });
      },
    );

    // plan/30, D38: a withheld row still comes back by its files, its day and its always-shown tag,
    // each read only when it passes the screen alone; its trigger, rationale and description never print.
    describe("a row the screen withholds", () => {
      const HELD = `- Warning · — · a row ${NEVER_HIT} · source: hidden-writer · files: src/b.ts · by: 2026-11-01 · 2026-10-10 · rationale: hidden reason`;

      it("matches by a files: entry as path and by its day as due, and prints none of its words", async () => {
        const dir = tempDir();
        await seedInbox(dir, `${SCHEDULE_RULE_HEADING}\n\n${HELD}\n`);

        const byPath = await inbox(dir, "--paths", "src/b.ts");
        const byDue = await inbox(dir, "--due", "2026-12-01");
        const early = await inbox(dir, "--due", "2026-10-31", "--paths", "src/z.ts");
        const json = await inbox(dir, "--due", "2026-12-01", "--json");

        expect(byPath.stdout).toBe(
          "inbox: 1 rows · 1 matched · 0 unmatched · 0 unparsed · 1 skipped\n3 Warning · — · withheld by the screen (never-verify); read it by hand (path)\n",
        );
        expect(byDue.stdout).toBe(
          "inbox: 1 rows · 1 matched · 0 unmatched · 0 unparsed · 1 skipped · 1 due by 2026-12-01 · 0 triggers\n3 Warning · — · withheld by the screen (never-verify); read it by hand (due)\n",
        );
        expect(early.stdout).toBe(
          "inbox: 1 rows · 0 matched · 0 unmatched · 0 unparsed · 1 skipped · 0 due by 2026-10-31 · 0 triggers\nskipped: 3 (never-verify)\n",
        );
        for (const word of ["quiet", "hidden"]) expect(json.stdout).not.toContain(word);
        // TEST CHANGE, justified (2026-10-10, review/78): as the first document pin's note says, the
        // matched withheld row left `skipped`; `matched` carries it, with its pattern id as `withheld`.
        expect(JSON.parse(json.stdout)).toMatchObject({
          matched: [
            {
              line: 3,
              description: null,
              source: null,
              ref: null,
              tag: null,
              by: "2026-11-01",
              when: null,
              files: ["src/b.ts"],
              matchedBy: "due",
              withheld: "never-verify",
            },
          ],
          skipped: [],
        });
      });

      it("shows by its always-shown tag when nothing else matches, with the tag and never its trigger", async () => {
        const dir = tempDir();
        await seedInbox(
          dir,
          `- Warning · — · a row ${NEVER_HIT} · source: x · when: the hidden event · files: src/b.ts · decision-waiting · rationale: hidden reason\n`,
        );

        const human = await inbox(dir, "--paths", "src/z.ts", "--due", "2026-12-01");
        const json = await inbox(dir, "--paths", "src/z.ts", "--due", "2026-12-01", "--json");

        expect(human.stdout).toBe(
          "inbox: 1 rows · 1 matched · 0 unmatched · 0 unparsed · 1 skipped · 0 due by 2026-12-01 · 0 triggers\n1 Warning · — · withheld by the screen (never-verify); read it by hand · decision-waiting (always)\n",
        );
        for (const word of ["quiet", "hidden"]) expect(json.stdout).not.toContain(word);
        expect(JSON.parse(json.stdout)).toMatchObject({
          matched: [{ line: 1, tag: "decision-waiting", by: null, when: null, files: ["src/b.ts"], matchedBy: "always" }],
          triggers: 0,
        });
      });

      it("reads none of its files when one entry fails the screen alone", async () => {
        const dir = tempDir();
        await seedInbox(dir, `- Warning · — · d · source: x · files: src/b.ts, ${SPACELESS_HIT}/x.ts · by: 2026-11-01\n`);

        const byPath = await inbox(dir, "--paths", "src/b.ts");
        const byDue = await inbox(dir, "--due", "2026-12-01", "--json");

        expect(byPath.stdout).toBe("inbox: 1 rows · 0 matched · 0 unmatched · 0 unparsed · 1 skipped\nskipped: 1 (exfiltrate)\n");
        // The pattern id spells the same word, so the entry is looked for whole.
        expect(byDue.stdout).not.toContain(`${SPACELESS_HIT}/x.ts`);
        expect(JSON.parse(byDue.stdout)).toMatchObject({
          matched: [{ line: 1, by: "2026-11-01", files: [], matchedBy: "due", withheld: "exfiltrate" }],
        });
      });
    });

    // review/31: each case is red without the screen of the field as a string of its own. The bullet
    // passes the screen as written, so nothing but that field's own read withholds the row.
    it("withholds a row whose trigger hits the screen only as a string of its own", async () => {
      const dir = tempDir();
      // The heading shape stands mid-line in the bullet and at the start of the trigger.
      await seedInbox(dir, `- Minor · src/a.ts:1 · d · source: x · when: ${HEADER_FIELD_HIT}\n`);

      const human = await inbox(dir, "--paths", "src/a.ts");
      const json = await inbox(dir, "--paths", "src/a.ts", "--json");

      expect(human.stdout).toBe(
        "inbox: 1 rows · 1 matched · 0 unmatched · 0 unparsed · 1 skipped\n1 Minor · src/a.ts:1 · withheld by the screen (fake-instruction-header); read it by hand (path)\n",
      );
      expect(json.stdout).not.toContain("quiet");
      // TEST CHANGE, justified (2026-10-10, review/78): as the first document pin's note says, the
      // matched withheld row left `skipped`; `matched` carries it, with its pattern id as `withheld`.
      expect(JSON.parse(json.stdout)).toMatchObject({
        matched: [{ line: 1, description: null, when: null, withheld: "fake-instruction-header" }],
        skipped: [],
      });
    });

    it("withholds a row whose files: entry hits the screen only once its backticks are stripped", async () => {
      const dir = tempDir();
      // A backtick splits the word in the bullet; the parsed entry, which the document carries, joins it.
      const split = ["exfil", "`", "trate/x.ts"].join("");
      await seedInbox(dir, `- Minor · src/a.ts:1 · d · source: x · files: src/b.ts, ${split} · by: 2026-11-01\n`);

      const result = await inbox(dir, "--paths", "src/a.ts", "--json");

      expect(result.stdout).not.toContain(`${SPACELESS_HIT}/x.ts`);
      // TEST CHANGE, justified (2026-10-10, review/78): as the first document pin's note says, the
      // matched withheld row left `skipped`; `matched` carries it, with its pattern id as `withheld`.
      expect(JSON.parse(result.stdout)).toMatchObject({
        matched: [{ line: 1, description: null, by: "2026-11-01", files: [], matchedBy: "path", withheld: "exfiltrate" }],
        skipped: [],
      });
    });
  });

  // review/25: a line is screened as it prints, composed. The engine's own suffix, or a withheld
  // line's pattern id, can complete a screen row after fields that each pass alone; a row whose
  // line hits prints in the skip form, in the human output and in the document alike.
  describe("a row whose printed line hits the screen", () => {
    /** A word the `tool-call-injection` row matches only once an opening parenthesis follows it. */
    const CALL_WORD = ["func", "tion_c", "all"].join("");
    /** The opening clause of the `cross-agent-directive` row: no hit until a word of its last group follows. */
    const AGENT_CLAUSE = ["when the ag", "ent reads"].join("");

    it("prints a clean row in the skip form when the match suffix completes a screen row", async () => {
      const dir = tempDir();
      await seedInbox(
        dir,
        [`- Minor · src/a.ts:1 · see the ${CALL_WORD} · source: x`, "- Minor · src/a.ts:2 · clean · source: x", ""].join("\n"),
      );

      const human = await inbox(dir, "--paths", "src/a.ts");
      const json = await inbox(dir, "--paths", "src/a.ts", "--json");
      const elsewhere = await inbox(dir, "--paths", "docs/b.md");

      expect(human.stdout).toBe(
        [
          "inbox: 2 rows · 1 matched · 0 unmatched · 0 unparsed · 1 skipped",
          "2 Minor · src/a.ts:2 · clean (path)",
          "skipped: 1 (tool-call-injection)",
          "",
        ].join("\n"),
      );
      expect(json.stdout).not.toContain(CALL_WORD);
      expect(JSON.parse(json.stdout)).toMatchObject({
        total: 2,
        matched: [{ line: 2, description: "clean", withheld: null }],
        counts: { Critical: 0, Warning: 0, Minor: 1, Info: 0 },
        unmatched: 0,
        skipped: [{ line: 1, pattern: "tool-call-injection" }],
      });
      // A row the query does not match prints no line, so there is no line to screen.
      expect(elsewhere.stdout).toBe("inbox: 2 rows · 0 matched · 2 unmatched · 0 unparsed · 0 skipped\n");
    });

    it("prints a clean row in the skip form when its tag and the suffix complete a screen row", async () => {
      const dir = tempDir();
      await seedInbox(dir, `- Minor · src/a.ts:1 · d · source: x · ${CALL_WORD}\n`);

      const result = await inbox(dir);

      expect(result.stdout).toBe("inbox: 1 rows · 0 matched · 0 unmatched · 0 unparsed · 1 skipped\nskipped: 1 (tool-call-injection)\n");
    });

    it("prints a withheld row's skip line when its location and the pattern id complete a screen row", async () => {
      const dir = tempDir();
      // The full stop keeps the bullet itself clear of the row its withheld line completes.
      await seedInbox(dir, `- Warning · ${AGENT_CLAUSE} · a row. ${NEVER_HIT} · source: x · critical-deferred\n`);

      const human = await inbox(dir, "--paths", "src/a.ts");
      const json = await inbox(dir, "--json");

      expect(human.stdout).toBe("inbox: 1 rows · 0 matched · 0 unmatched · 0 unparsed · 1 skipped\nskipped: 1 (never-verify)\n");
      expect(json.stdout).not.toContain("quiet");
      expect(JSON.parse(json.stdout)).toMatchObject({
        total: 1,
        matched: [],
        counts: { Critical: 0, Warning: 0, Minor: 0, Info: 0 },
        unmatched: 0,
        skipped: [{ line: 1, pattern: "never-verify" }],
      });
    });

    // Two pattern ids spell a word their own screen row matches. That hit is the engine's own
    // words, in the skip line as much as in the withheld one, so it withholds no line by itself.
    it("still prints a withheld line whose only hit is the pattern id's own word", async () => {
      const dir = tempDir();
      await seedInbox(dir, `- Warning · src/a.ts:1 · a row to ${SPACELESS_HIT} · source: x\n`);

      const result = await inbox(dir, "--paths", "src/a.ts");

      expect(result.stdout).toBe(
        `inbox: 1 rows · 1 matched · 0 unmatched · 0 unparsed · 1 skipped\n1 Warning · src/a.ts:1 · withheld by the screen (${SPACELESS_HIT}); read it by hand (path)\n`,
      );
    });

    it("prints the skip line when such an id also completes another screen row after the location", async () => {
      const dir = tempDir();
      await seedInbox(dir, `- Warning · ${AGENT_CLAUSE} · a row. To ${SPACELESS_HIT} · source: x\n`);

      const result = await inbox(dir);

      expect(result.stdout).toBe(`inbox: 1 rows · 0 matched · 0 unmatched · 0 unparsed · 1 skipped\nskipped: 1 (${SPACELESS_HIT})\n`);
    });
  });

  // review/27: the unparsed and the skip lines are capped in number, since both print whatever
  // the query and a file of short bullets would otherwise print many times its own size.
  describe("the cap on unparsed and skip lines", () => {
    const unparsedBullets = (count: number): string[] => Array.from({ length: count }, () => "- x");
    const skippedBullets = (count: number): string[] =>
      Array.from({ length: count }, (_, index) => `- Minor · src/a.ts:${index + 1} · d · source: x · tagword · ${EXFIL_HIT}`);

    it("pins the cap", () => {
      expect(INBOX_LISTED_MAX).toBe(50);
    });

    it("prints the first fifty of each, then one line naming how many more, and keeps the counts whole", async () => {
      const dir = tempDir();
      await seedInbox(dir, [...unparsedBullets(60), ...skippedBullets(55), ""].join("\n"));

      const human = await inbox(dir, "--paths", "src/a.ts");
      const json = await inbox(dir, "--paths", "src/a.ts", "--json");

      const lines = human.stdout.split("\n");
      expect(lines).toHaveLength(104);
      expect(lines[0]).toBe("inbox: 115 rows · 0 matched · 0 unmatched · 60 unparsed · 55 skipped");
      lines.slice(1, 51).forEach((line, index) => {
        expect(line.startsWith(`unparsed: ${index + 1}: `), line).toBe(true);
      });
      expect(lines[51]).toBe("unparsed: … +10 more");
      expect(lines.slice(52, 102)).toEqual(
        Array.from({ length: 50 }, (_, index) => `skipped: ${index + 61} (send-data-external)`),
      );
      expect(lines.slice(102)).toEqual(["skipped: … +5 more", ""]);

      const doc = JSON.parse(json.stdout) as {
        total: number;
        problems: { line: number }[];
        skipped: { line: number; pattern: string }[];
        truncated: unknown;
      };
      expect(doc.total).toBe(115);
      expect(doc.problems.map((problem) => problem.line)).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
      expect(doc.skipped).toEqual(
        Array.from({ length: 50 }, (_, index) => ({ line: index + 61, pattern: "send-data-external" })),
      );
      expect(doc.truncated).toEqual({ problems: 10, skipped: 5 });
    });

    it("prints no such line, and truncates nothing, at exactly the cap", async () => {
      const dir = tempDir();
      await seedInbox(dir, [...unparsedBullets(INBOX_LISTED_MAX), ...skippedBullets(INBOX_LISTED_MAX), ""].join("\n"));

      const human = await inbox(dir);
      const json = await inbox(dir, "--json");

      const lines = human.stdout.split("\n");
      expect(lines).toHaveLength(102);
      expect(lines[0]).toBe("inbox: 100 rows · 0 matched · 0 unmatched · 50 unparsed · 50 skipped");
      expect(human.stdout).not.toContain("more");
      const doc = JSON.parse(json.stdout) as { problems: unknown[]; skipped: unknown[]; truncated: unknown };
      expect(doc.problems).toHaveLength(50);
      expect(doc.skipped).toHaveLength(50);
      expect(doc.truncated).toEqual({ problems: 0, skipped: 0 });
    });

    // review/78: the document's list leaves out the withheld rows `matched` already carries and
    // then caps, as the human listing does. Capped first, fifty such rows filled it, and a refused
    // bullet after them reached a `--json` reader as a count, with no line and no reason.
    it("lists in the document the skip lines the human form lists, past fifty matched withheld rows", async () => {
      const dir = tempDir();
      const withheldRows = Array.from(
        { length: INBOX_LISTED_MAX },
        (_, index) => `- Minor · src/a.ts:${index + 1} · a row ${NEVER_HIT} · source: x`,
      );
      const overLength = `- Minor · src/z.ts:1 · ${"x".repeat(INBOX_BULLET_MAX_CHARS)} · source: x`;
      await seedInbox(dir, [...withheldRows, overLength, ""].join("\n"));

      const human = await inbox(dir, "--paths", "src/a.ts");
      const json = await inbox(dir, "--paths", "src/a.ts", "--json");

      const lines = human.stdout.split("\n");
      expect(lines[0]).toBe("inbox: 51 rows · 50 matched · 0 unmatched · 0 unparsed · 51 skipped");
      expect(lines.slice(51)).toEqual([`skipped: 51 (${INBOX_OVER_LENGTH})`, ""]);
      const doc = JSON.parse(json.stdout) as { matched: { withheld: string | null }[]; skipped: unknown[]; truncated: unknown };
      expect(doc.matched.map((row) => row.withheld)).toEqual(Array.from({ length: INBOX_LISTED_MAX }, () => "never-verify"));
      expect(doc.skipped).toEqual([{ line: 51, pattern: INBOX_OVER_LENGTH }]);
      expect(doc.truncated).toEqual({ problems: 0, skipped: 0 });
    });

    it("caps the document's list after leaving those rows out, and counts the rest of it alone", async () => {
      const dir = tempDir();
      const withheldRows = Array.from(
        { length: INBOX_LISTED_MAX },
        (_, index) => `- Minor · src/a.ts:${index + 1} · a row ${NEVER_HIT} · source: x`,
      );
      await seedInbox(dir, [...withheldRows, ...skippedBullets(INBOX_LISTED_MAX + 1), ""].join("\n"));

      const human = await inbox(dir, "--paths", "src/a.ts");
      const json = await inbox(dir, "--paths", "src/a.ts", "--json");

      const lines = human.stdout.split("\n");
      expect(lines[0]).toBe("inbox: 101 rows · 50 matched · 0 unmatched · 0 unparsed · 101 skipped");
      expect(lines.slice(51)).toEqual([
        ...Array.from({ length: INBOX_LISTED_MAX }, (_, index) => `skipped: ${index + 51} (send-data-external)`),
        "skipped: … +1 more",
        "",
      ]);
      const doc = JSON.parse(json.stdout) as { matched: unknown[]; skipped: unknown[]; truncated: unknown };
      expect(doc.matched).toHaveLength(INBOX_LISTED_MAX);
      expect(doc.skipped).toEqual(
        Array.from({ length: INBOX_LISTED_MAX }, (_, index) => ({ line: index + 51, pattern: "send-data-external" })),
      );
      expect(doc.truncated).toEqual({ problems: 0, skipped: 1 });
    });

    it("caps each list on its own: a shown withheld row has no skip line to count", async () => {
      const dir = tempDir();
      const withheldRows = Array.from(
        { length: 51 },
        (_, index) => `- Minor · src/a.ts:${index + 1} · a row ${NEVER_HIT} · source: x`,
      );
      await seedInbox(dir, [...withheldRows, ""].join("\n"));

      const human = await inbox(dir);
      const json = await inbox(dir, "--json");

      const lines = human.stdout.split("\n");
      expect(lines[0]).toBe("inbox: 51 rows · 51 matched · 0 unmatched · 0 unparsed · 51 skipped");
      // Every row prints its withheld line, uncapped, and none prints a skip line.
      expect(lines).toHaveLength(53);
      expect(human.stdout).not.toContain("skipped: ");
      const doc = JSON.parse(json.stdout) as { matched: unknown[]; skipped: unknown[]; truncated: unknown };
      expect(doc.matched).toHaveLength(51);
      // TEST CHANGE, justified (2026-10-10, review/78): the document listed the first fifty of
      // these rows under `skipped` and counted the fifty-first as left out, while the human form
      // printed no skip line at all. Every one of them stands under `matched`, so the list is
      // empty and nothing is left out of it, as the case's name already said of the human form.
      expect(doc.skipped).toEqual([]);
      expect(doc.truncated).toEqual({ problems: 0, skipped: 0 });
    });
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
      truncated: { problems: 0, skipped: 0 },
      due: null,
      triggers: 0,
    });
    const due = await inbox(dir, "--due", "2026-12-01", "--json");
    expect(due.stdout).not.toBe("");
    expect(JSON.parse(due.stdout)).toMatchObject({ total: 0, due: "2026-12-01", triggers: 0 });
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
    const doc = JSON.parse(result.stdout) as { ok: boolean; error: { code: string; next: string } };
    expect(doc).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(doc.error.next).toContain(REFUSAL_NEXT);
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
    expect(result.stderr).toContain(REFUSAL_NEXT);
    expect(result.stderr).not.toContain("outside words");
  });

  // review/105: a hard link is a second name for bytes another name owns, and that name can sit
  // outside the checkout. `lstat` and the descriptor both report a regular file, and no open flag
  // refuses it, so the tell is the link count. Skipped on Windows as this tree's other hard-link
  // cases are (`test/merge/reclaim.test.ts`, `test/manifest/mcpFilter.test.ts`).
  it.skipIf(WINDOWS)("refuses an inbox that is a hard link to a file outside the checkout, and never reads it", async () => {
    const dir = tempDir();
    await dir.seedFiles({ "outside/elsewhere.md": "- Minor · src/a.ts:1 · outside words · source: x\n" });
    await mkdir(dir.path("repo", ".stamity"), { recursive: true });
    await link(dir.path("outside/elsewhere.md"), dir.path("repo", INBOX_PATH));

    const human = await runInProcess(COMMANDS, ["ledger", "inbox"], { cwd: dir.path("repo") });
    const json = await runInProcess(COMMANDS, ["ledger", "inbox", "--json"], { cwd: dir.path("repo") });

    expect(human.code).toBe(1);
    expect(human.stdout).toBe("");
    expect(human.stderr).toContain("ledger inbox refused .stamity/inbox.md: inbox.md is a hard link");
    expect(human.stderr).toContain(REFUSAL_NEXT);
    expect(human.stderr).not.toContain("outside words");
    const doc = JSON.parse(json.stdout) as { ok: boolean; error: { code: string; message: string; next: string } };
    expect(doc).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(doc.error.next).toContain(REFUSAL_NEXT);
    expect(json.stdout).not.toContain("outside words");
  });

  // The walk's `lstat` is a fast refusal, not the proof: a second name made after it is seen only
  // by the descriptor the read itself holds.
  it.skipIf(WINDOWS)("refuses an inbox given a second name after the walk, by its descriptor's own link count", async () => {
    const dir = tempDir();
    await seedInbox(dir, "- Minor · src/a.ts:1 · inside words · source: x\n");

    const result = await inboxRaced(dir, () => linkSync(dir.path(INBOX_PATH), dir.path("twin.md")), "after");

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("ledger inbox refused .stamity/inbox.md: inbox.md is a hard link");
    expect(result.stderr).toContain(REFUSAL_NEXT);
    expect(result.stderr).not.toContain("inside words");
  });

  it.each([
    [["ledger", "inbox", "--run", "2026-09-23_demo"], "ledger inbox takes no --run; it is a flag of ledger append and ledger close and ledger status"],
    [["ledger", "inbox", "--ids", "a"], "ledger inbox takes no --ids; it is a flag of ledger close"],
    [["ledger", "status", "--paths", "a"], "ledger status takes no --paths; it is a flag of ledger inbox"],
    [["ledger", "close", "--plan", "a"], "ledger close takes no --plan; it is a flag of ledger inbox"],
    [["ledger", "append", "--area", "a"], "ledger append takes no --area; it is a flag of ledger inbox"],
    [["ledger", "append", "--due", "2026-12-01"], "ledger append takes no --due; it is a flag of ledger inbox"],
    [["ledger", "close", "--due"], "ledger close takes no --due; it is a flag of ledger inbox"],
    [["ledger", "status", "--due"], "ledger status takes no --due; it is a flag of ledger inbox"],
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
