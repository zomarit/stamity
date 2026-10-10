import { mkdir, symlink, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../../src/cli.ts";
import { INBOX_BULLET_MAX_CHARS, INBOX_OVER_LENGTH, INBOX_SCREEN } from "../../src/cli/commands/ledger.ts";
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
          matchedBy: "path",
          withheld: "fake-instruction-header",
        },
      ],
      counts: { Critical: 1, Warning: 1, Minor: 1, Info: 0 },
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
    expect(JSON.parse(json.stdout)).toMatchObject({
      matched: [{ line: 1, description: null, withheld: "never-verify" }],
      problems: [],
      skipped: [
        { line: 1, pattern: "never-verify" },
        { line: 2, pattern: "never-verify" },
      ],
    });
  });

  it("withholds a row one of whose fields hits the screen only as a string of its own", async () => {
    const dir = tempDir();
    await seedInbox(dir, `- Minor · src/a.ts:1 · ${HEADER_FIELD_HIT} · source: x\n`);

    const result = await inbox(dir, "--json");

    expect(result.stdout).not.toContain("quiet");
    expect(JSON.parse(result.stdout)).toMatchObject({
      matched: [{ line: 1, description: null, withheld: "fake-instruction-header" }],
      skipped: [{ line: 1, pattern: "fake-instruction-header" }],
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
            matchedBy: "path",
            withheld: null,
          },
        ],
        counts: { Critical: 0, Warning: 1, Minor: 1, Info: 0 },
        unmatched: 0,
        problems: [],
        skipped: [{ line: 3, pattern: "never-verify" }],
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
