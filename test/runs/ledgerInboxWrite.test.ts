import { linkSync } from "node:fs";
import { mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { COMMANDS } from "../../src/cli.ts";
import { INBOX_BULLET_MAX_CHARS } from "../../src/cli/commands/ledger.ts";
import { runCli } from "../../src/cli/kit/program.ts";
import { INBOX_PATH, parseInbox, SCHEDULE_RULE_HEADING } from "../../src/runs/inboxStore.ts";
import { useTempDir, type TempDirHandle } from "../support/tempDir.ts";

/**
 * `stamity ledger inbox-write` (w1-inbox-write, REQ-FLOW-078): the deferral
 * inbox's one engine writer, through the funnel, so each case also covers the
 * exit code and the single JSON document.
 *
 * Real-filesystem lane: the write refuses a link, a hard link and an oversized
 * inbox by what `lstat` and the descriptor see, which a virtual volume cannot
 * show. Every inbox and ledger here is hand-built; no fixture copies a real
 * inbox row. A screened string is built at run time from fragments, so this
 * file carries none as typed text, and each case that feeds one checks that no
 * fragment of it reaches stdout or stderr.
 */

const tempDir = useTempDir("stamity-ledger-inbox-write");
const WINDOWS = process.platform === "win32";

const RUN = "2026-10-12_demo";
const OTHER_RUN = "2026-10-01_older";
const TODAY = "2026-10-12";
const NOW = new Date(`${TODAY}T09:30:00Z`);
const ledgerOf = (run: string): string => `.stamity/runs/${run}/ledger.jsonl`;
const HEAD = `Rows appended ${TODAY} by the run \`${RUN}\`; each row's \`Ref:\` names its source.`;

/** A ledger `Ref:` naming row `review/<n>` of a run. */
const ref = (n: number, run = RUN): string => `${ledgerOf(run)}#${run}/review/${n}`;

/** One inbox bullet for row `n`, its words chosen so a case can look for them in the output. */
const bullet = (n: number, schedule = "by: 2026-11-01", rowRef = ref(n)): string =>
  `- Minor · src/a.ts:${n} · quiet finding ${n} · source: /st-work · Ref: ${rowRef} · ${schedule}`;

/** The words a row's text carries and no outcome line does: none may print. */
const ROW_WORDS = "quiet";

/** A ledger row of `run`, `deferred` unless the extra fields say otherwise. */
function ledgerRow(n: number, extra: Record<string, unknown> = {}, run = RUN): string {
  return JSON.stringify({
    id: `${run}/review/${n}`,
    phase: "review",
    source: "reviewer",
    severity: "Minor",
    evidence: `src/a.ts:${n} — finding ${n}`,
    state: "deferred",
    rationale: "deferred to a later run",
    ...extra,
  });
}

/** `never-verify`'s words, one line, built from fragments. */
const NEVER_HIT = ["nev", "er re", "view the quiet words"].join("");
/** A field that hits `fake-instruction-header` only as a string of its own: the pattern is anchored to a line start. */
const HEADER_FIELD_HIT = ["#".repeat(2), " instr", "uctions: ", "quiet words"].join("");
/** The two halves of a markdown image link, each clean alone; joined by the line break between two bullets they hit. */
const IMAGE_OPEN = ["!", "[quiet"].join("");
const IMAGE_CLOSE = ["](", "ht", "tps://collector.example/q"].join("");

async function seed(dir: TempDirHandle, files: Record<string, string>): Promise<void> {
  await mkdir(dir.path(".stamity", "runs", RUN), { recursive: true });
  await dir.seedFiles(files);
}

async function readText(dir: TempDirHandle, rel: string): Promise<string> {
  return await readFile(dir.path(rel), "utf8");
}

/**
 * `ledger inbox-write` through the funnel on a fixed clock, with `stdin` piped.
 * The kit's own seams (`RunCliOptions.clock`, `promptIo.input`), not mocks:
 * `runInProcess` forwards no clock, and the block's date is read from the one
 * the funnel is handed.
 */
async function write(
  dir: TempDirHandle,
  args: readonly string[],
  stdin: readonly string[] = [],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const input = new PassThrough();
  for (const line of stdin) input.write(`${line}\n`);
  input.end();
  const code = await runCli(["ledger", "inbox-write", "--run", RUN, ...args], COMMANDS, {
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
    promptIo: { input, output: new Writable({ write: (_chunk, _encoding, callback) => callback() }) },
    terminal: { stdoutIsTTY: false, stderrIsTTY: false, stdinIsTTY: false },
    clock: { now: () => NOW },
  });
  return { code, stdout: stdout.join(""), stderr: stderr.join("") };
}

/** The output carries none of a row's own words. */
function expectNoRowText(result: { stdout: string; stderr: string }, ...words: string[]): void {
  for (const word of [ROW_WORDS, ...words]) {
    expect(result.stdout).not.toContain(word);
    expect(result.stderr).not.toContain(word);
  }
}

describe("stamity ledger inbox-write — appends (REQ-FLOW-078 criteria 1 and 4)", () => {
  it("adds the heading and a dated block at the end of an inbox with none, printing lines and Refs only", async () => {
    const dir = tempDir();
    const older = "# Deferral inbox\n\n- Minor · src/z.ts:1 · an older row · source: x\n";
    await seed(dir, { [INBOX_PATH]: older, [ledgerOf(RUN)]: `${ledgerRow(1)}\n` });

    const result = await write(dir, ["--stdin"], [bullet(1)]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(`heading 5 added\nappended 9 ${ref(1)}\n`);
    expectNoRowText(result);
    const text = await readText(dir, INBOX_PATH);
    expect(text).toBe(`${older}\n${SCHEDULE_RULE_HEADING}\n\n${HEAD}\n\n${bullet(1)}\n`);
    expect(parseInbox(text).problems).toEqual([]);
  });

  it("creates an absent inbox holding the heading and the rows (S9)", async () => {
    const dir = tempDir();
    await seed(dir, { [ledgerOf(RUN)]: `${ledgerRow(1)}\n${ledgerRow(2)}\n` });

    const result = await write(dir, ["--stdin"], [bullet(1), "", bullet(2)]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(`heading 1 added\nappended 5 ${ref(1)}\nappended 6 ${ref(2)}\n`);
    expect(await readText(dir, INBOX_PATH)).toBe(`${SCHEDULE_RULE_HEADING}\n\n${HEAD}\n\n${bullet(1)}\n${bullet(2)}\n`);
  });

  it("reports the same call twice as already-filed, the file byte-equal", async () => {
    const dir = tempDir();
    await seed(dir, { [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n`, [ledgerOf(RUN)]: `${ledgerRow(1)}\n` });

    expect((await write(dir, ["--stdin"], [bullet(1)])).code).toBe(0);
    const once = await readText(dir, INBOX_PATH);
    const again = await write(dir, ["--stdin"], [bullet(1)]);

    expect(again.code, again.stderr).toBe(0);
    expect(again.stdout).toBe(`already-filed 5 ${ref(1)}\n`);
    expect(await readText(dir, INBOX_PATH)).toBe(once);
  });

  it("lets the lock and the re-read under it settle two concurrent writes of one row: one appends, one finds it filed", async () => {
    const dir = tempDir();
    await seed(dir, { [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n`, [ledgerOf(RUN)]: `${ledgerRow(1)}\n` });

    const results = await Promise.all([write(dir, ["--stdin"], [bullet(1)]), write(dir, ["--stdin"], [bullet(1)])]);

    expect(results.map((result) => result.code)).toEqual([0, 0]);
    expect(results.map((result) => result.stdout).toSorted()).toEqual([`already-filed 5 ${ref(1)}\n`, `appended 5 ${ref(1)}\n`]);
    expect((await readText(dir, INBOX_PATH)).split("\n").filter((line) => line.includes(ref(1)))).toHaveLength(1);
  });

  it("admits a ledger Ref: naming a deferred row of another run's ledger", async () => {
    const dir = tempDir();
    await seed(dir, {
      [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n`,
      [ledgerOf(RUN)]: "",
      [ledgerOf(OTHER_RUN)]: `${ledgerRow(4, {}, OTHER_RUN)}\n`,
    });

    const result = await write(dir, ["--stdin"], [bullet(4, "by: 2026-11-01", ref(4, OTHER_RUN))]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(`appended 5 ${ref(4, OTHER_RUN)}\n`);
  });
});

describe("stamity ledger inbox-write — refusals write nothing (REQ-FLOW-078 criterion 2)", () => {
  const BEFORE = `${SCHEDULE_RULE_HEADING}\n\n- Minor · src/z.ts:9 · held · source: x · Ref: docs/x.md · by: 2026-11-01\n`;

  async function refused(
    stdin: readonly string[],
    args: readonly string[] = ["--stdin"],
  ): Promise<{ code: number; stdout: string; stderr: string; dir: TempDirHandle }> {
    const dir = tempDir();
    await seed(dir, {
      [INBOX_PATH]: BEFORE,
      [ledgerOf(RUN)]: [ledgerRow(1), ledgerRow(2), ledgerRow(3, { state: "fixed" }), ledgerRow(5, { retired: "2026-10-11 fixed by a1b2c3d4" })].join("\n"),
    });
    const result = await write(dir, args, stdin);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(await readText(dir, INBOX_PATH)).toBe(BEFORE);
    return { ...result, dir };
  }

  it("refuses a row with neither by: nor when:, naming its stdin line", async () => {
    const result = await refused([bullet(1), "", `- Minor · src/a.ts:2 · quiet two · source: /st-work · Ref: ${ref(2)}`]);

    expect(result.stderr).toContain("stdin:3: a row under");
    expect(result.stderr).toContain("carries neither");
    expectNoRowText(result);
  });

  it("refuses a row carrying no Ref:", async () => {
    const result = await refused(["- Minor · src/a.ts:2 · quiet two · source: /st-work · by: 2026-11-01"]);

    expect(result.stderr).toContain("stdin:1: carries no `Ref:`");
    expectNoRowText(result);
  });

  it("refuses two stdin bullets carrying one Ref:", async () => {
    const result = await refused([bullet(1), bullet(1, "when: the next release")]);

    expect(result.stderr).toContain("stdin:2: carries the `Ref:` stdin line 1 carries");
  });

  it("refuses a line that is not a bullet", async () => {
    const result = await refused(["Some quiet prose."]);

    expect(result.stderr).toContain("stdin:1: is not a `- ` bullet");
    expectNoRowText(result);
  });

  it("refuses a screen hit in one bullet by its stdin line and pattern id, with no row text", async () => {
    const result = await refused([bullet(1), bullet(2, `by: 2026-11-01 · rationale: ${NEVER_HIT}`)]);

    expect(result.stderr).toContain("stdin:2: refused by the screen (never-verify)");
    expectNoRowText(result, "view the");
  });

  it("refuses a screen hit split over two bullets, naming the first and last stdin line it spans", async () => {
    const result = await refused([
      bullet(1),
      `- Minor · src/a.ts:2 · ${IMAGE_OPEN} · source: /st-work · Ref: ${ref(2)} · by: 2026-11-01`,
      `- Minor · src/a.ts:3 · ${IMAGE_CLOSE} · source: /st-work · Ref: ${ref(1, OTHER_RUN)} · by: 2026-11-01`,
    ]);

    expect(result.stderr).toContain("stdin:2: refused by the screen (image-url-exfiltration) across stdin lines 2–3");
    expectNoRowText(result, "collector");
  });

  it("refuses a hit only a parsed field shows, as the query's field screen would withhold it", async () => {
    const result = await refused([`- Minor · src/a.ts:2 · ${HEADER_FIELD_HIT} · source: /st-work · Ref: ${ref(2)} · by: 2026-11-01`]);

    expect(result.stderr).toContain("stdin:1: refused by the screen (fake-instruction-header)");
    expectNoRowText(result, "uctions:");
  });

  it("withholds the parse message of a bullet the screen hits", async () => {
    // Two bare words after the schedule fields: the parse message would quote them, the hit's words with them.
    const result = await refused([`${bullet(1)} · two words · ${NEVER_HIT}`]);

    expect(result.stderr).toContain("stdin:1: refused by the screen (never-verify)");
    expect(result.stderr).not.toContain("trailing field");
    expectNoRowText(result, "view the", "two words");
  });

  it("refuses a bullet over the length the query screens, unscreened", async () => {
    const long = bullet(1, `by: 2026-11-01 · rationale: ${"q".repeat(INBOX_BULLET_MAX_CHARS)}`);

    const result = await refused([long]);

    expect(result.stderr).toContain(`stdin:1: is over ${INBOX_BULLET_MAX_CHARS} characters`);
    expect(result.stderr).not.toContain("qqqq");
  });

  it.each([
    ["names no row", bullet(9)],
    ["names a row not deferred", bullet(3)],
    ["names a retired row", bullet(5)],
  ])("refuses an appended row whose ledger Ref: %s", async (_label, given) => {
    const result = await refused([given]);

    expect(result.stderr).toMatch(/stdin:1: the ledger row its `Ref:` names (is not a row|is fixed, not deferred|is already retired)/);
  });

  it("refuses a non-ledger Ref: the same call does not remove", async () => {
    const result = await refused([bullet(1, "by: 2026-11-01", "docs/plans/x.md")]);

    expect(result.stderr).toContain("stdin:1: names a `Ref:` that is not a ledger row, which only a re-date in the same call");
  });

  it("refuses removing a ledger Ref: whose row is still deferred and unretired", async () => {
    const dir = tempDir();
    const before = `${SCHEDULE_RULE_HEADING}\n\n${bullet(1)}\n`;
    await seed(dir, { [INBOX_PATH]: before, [ledgerOf(RUN)]: `${ledgerRow(1)}\n` });

    const result = await write(dir, ["--remove", ref(1)]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--remove:1: the ledger row it names is still deferred and not retired");
    expect(await readText(dir, INBOX_PATH)).toBe(before);
  });

  it("refuses a call with neither --stdin nor --remove", async () => {
    const dir = tempDir();
    await seed(dir, {});

    const result = await write(dir, []);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ledger inbox-write takes --stdin, --remove, or both");
  });

  it.each([
    ["--report", "x.md", "ledger append and ledger close"],
    ["--ids", "a", "ledger close"],
    ["--paths", "a", "ledger inbox"],
    ["--due", "2026-12-01", "ledger inbox"],
  ])("refuses %s, a flag of another subcommand, as a usage error", async (flag, value, owners) => {
    const dir = tempDir();
    await seed(dir, {});

    const human = await write(dir, ["--stdin", flag, value]);
    const json = await write(dir, ["--stdin", flag, value, "--json"]);

    expect(human.code).toBe(1);
    expect(human.stderr).toContain(`ledger inbox-write takes no ${flag}; it is a flag of ${owners}`);
    expect(JSON.parse(json.stdout)).toMatchObject({ ok: false, error: { code: "USAGE" } });
  });
});

describe("stamity ledger inbox-write — removals and re-dates (REQ-FLOW-078 criterion 3)", () => {
  it("re-dates a row in one call: one bullet carries the Ref:, with the new day", async () => {
    const dir = tempDir();
    await seed(dir, {
      [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n\n${bullet(1)}\n${bullet(2)}\n`,
      [ledgerOf(RUN)]: `${ledgerRow(1)}\n${ledgerRow(2)}\n`,
    });
    const redated = bullet(1, "by: 2026-12-24");

    const result = await write(dir, ["--stdin", "--remove", ref(1)], [redated]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(`removed 3 ${ref(1)}\nappended 7 ${ref(1)}\n`);
    const text = await readText(dir, INBOX_PATH);
    expect(text.split("\n").filter((line) => line.includes(ref(1)))).toEqual([redated]);
    expect(parseInbox(text).problems).toEqual([]);
  });

  it("re-dates a non-ledger Ref: when the same call removes its bullet", async () => {
    const dir = tempDir();
    const held = bullet(7, "by: 2026-11-01", "docs/plans/x.md");
    await seed(dir, { [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n\n${held}\n`, [ledgerOf(RUN)]: "" });

    const result = await write(dir, ["--stdin", "--remove", "docs/plans/x.md"], [bullet(7, "when: the next release", "docs/plans/x.md")]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe("removed 3 docs/plans/x.md\nappended 5 docs/plans/x.md\n");
  });

  it("removes the bullet of a retired row", async () => {
    const dir = tempDir();
    await seed(dir, {
      [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n\n${bullet(1)}\n${bullet(2)}\n`,
      [ledgerOf(RUN)]: `${ledgerRow(1, { retired: "2026-10-12 fixed by a1b2c3d4" })}\n${ledgerRow(2)}\n`,
    });

    const result = await write(dir, ["--remove", ref(1)]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(`removed 3 ${ref(1)}\n`);
    expect(await readText(dir, INBOX_PATH)).toBe(`${SCHEDULE_RULE_HEADING}\n\n${bullet(2)}\n`);
  });

  it("refuses a removal matching no bullet, and one matching two", async () => {
    const dir = tempDir();
    const before = `${SCHEDULE_RULE_HEADING}\n\n${bullet(1)}\n${bullet(1)}\n`;
    await seed(dir, { [INBOX_PATH]: before, [ledgerOf(RUN)]: `${ledgerRow(1, { state: "fixed" })}\n` });

    const result = await write(dir, ["--remove", `${ref(2)},${ref(1)}`]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--remove:1: matches no bullet in the inbox");
    expect(result.stderr).toContain("--remove:2: matches 2 bullets, at lines 3 and 4");
    expect(await readText(dir, INBOX_PATH)).toBe(before);
  });
});

describe("stamity ledger inbox-write — the inbox and the ledgers are read no-follow", () => {
  const REFUSAL_NEXT = "do not edit .stamity/inbox.md with the file tools in this write's place";

  it.skipIf(WINDOWS)("refuses a symlinked inbox, naming ledger inbox-write, and writes nothing through it", async () => {
    const dir = tempDir();
    await seed(dir, { "outside.md": `${SCHEDULE_RULE_HEADING}\n`, [ledgerOf(RUN)]: `${ledgerRow(1)}\n` });
    await symlink(dir.path("outside.md"), dir.path(INBOX_PATH));

    const result = await write(dir, ["--stdin"], [bullet(1)]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ledger inbox-write refused .stamity/inbox.md: inbox.md is a symbolic link");
    expect(result.stderr).toContain(REFUSAL_NEXT);
    expect(result.stderr).toContain("the write runs again once the inbox is a regular file");
    expect(result.stderr).not.toContain("ledger inbox refused");
    expect(await readText(dir, "outside.md")).toBe(`${SCHEDULE_RULE_HEADING}\n`);
  });

  it.skipIf(WINDOWS)("refuses a hard-linked inbox, naming ledger inbox-write", async () => {
    const dir = tempDir();
    await seed(dir, { [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n`, [ledgerOf(RUN)]: `${ledgerRow(1)}\n` });
    linkSync(dir.path(INBOX_PATH), dir.path("twin.md"));

    const result = await write(dir, ["--stdin"], [bullet(1)]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ledger inbox-write refused .stamity/inbox.md: inbox.md is a hard link");
    expect(await readText(dir, "twin.md")).toBe(`${SCHEDULE_RULE_HEADING}\n`);
  });

  it.skipIf(WINDOWS)("refuses a Ref: into another run's ledger that is a symbolic link", async () => {
    const dir = tempDir();
    await seed(dir, { [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n`, [ledgerOf(RUN)]: "", "elsewhere.jsonl": `${ledgerRow(4, {}, OTHER_RUN)}\n` });
    await mkdir(dir.path(".stamity", "runs", OTHER_RUN));
    await symlink(dir.path("elsewhere.jsonl"), dir.path(ledgerOf(OTHER_RUN)));

    const result = await write(dir, ["--stdin"], [bullet(4, "by: 2026-11-01", ref(4, OTHER_RUN))]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("stdin:1: the ledger its `Ref:` names is a symbolic link");
    expect(await readText(dir, INBOX_PATH)).toBe(`${SCHEDULE_RULE_HEADING}\n`);
  });

  it("refuses an inbox over the 1 MiB ceiling, and a write that would take it over", async () => {
    const dir = tempDir();
    const padding = `<!-- ${"p".repeat(1_048_576 - 200)} -->\n`;
    await seed(dir, { [INBOX_PATH]: `${padding}${SCHEDULE_RULE_HEADING}\n`, [ledgerOf(RUN)]: `${ledgerRow(1)}\n` });

    const over = await write(dir, ["--stdin"], [bullet(1)]);

    expect(over.code).toBe(1);
    expect(over.stderr).toContain("ledger inbox-write refused .stamity/inbox.md: the write would make it");
    expect((await stat(dir.path(INBOX_PATH))).size).toBe(padding.length + SCHEDULE_RULE_HEADING.length + 1);

    await writeFile(dir.path(INBOX_PATH), `${padding}${"p".repeat(300)}\n`);
    const already = await write(dir, ["--stdin"], [bullet(1)]);
    expect(already.code).toBe(1);
    expect(already.stderr).toContain("over the 1048576 byte ceiling");
  });
});

describe("stamity ledger inbox-write — the run's forms", () => {
  it("writes nothing under --dry-run, and says what it would do", async () => {
    const dir = tempDir();
    const before = `${SCHEDULE_RULE_HEADING}\n\n${bullet(2)}\n`;
    await seed(dir, { [INBOX_PATH]: before, [ledgerOf(RUN)]: `${ledgerRow(1)}\n${ledgerRow(2, { state: "fixed" })}\n` });

    const result = await write(dir, ["--stdin", "--remove", ref(2), "--dry-run"], [bullet(1)]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(
      `removed 3 ${ref(2)}\nappended 5 ${ref(1)}\nDry run: 1 row(s) would be appended and 1 removed in .stamity/inbox.md. Nothing was written.\n`,
    );
    expect(await readText(dir, INBOX_PATH)).toBe(before);
  });

  it("prints exactly one JSON document under --json", async () => {
    const dir = tempDir();
    await seed(dir, {
      [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n\n${bullet(2)}\n${bullet(3)}\n`,
      [ledgerOf(RUN)]: `${ledgerRow(1)}\n${ledgerRow(2, { state: "fixed" })}\n${ledgerRow(3)}\n`,
    });

    const result = await write(dir, ["--stdin", "--remove", ref(2), "--json"], [bullet(1), bullet(3)]);

    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      command: "ledger",
      version: expect.any(String),
      inbox: INBOX_PATH,
      run: RUN,
      appended: [{ line: 7, ref: ref(1), severity: "Minor" }],
      alreadyFiled: [{ line: 3, ref: ref(3) }],
      removed: [{ line: 3, ref: ref(2) }],
      headingAdded: null,
      dryRun: false,
    });
  });

  it("warns when cross-process locking is off, and still writes", async () => {
    vi.stubEnv("STAMITY_LOCK", "0");
    const dir = tempDir();
    await seed(dir, { [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n`, [ledgerOf(RUN)]: `${ledgerRow(1)}\n` });

    const result = await write(dir, ["--stdin"], [bullet(1)]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stderr).toContain(
      "warning: cross-process locking is off (STAMITY_LOCK=0); concurrent inbox writes are not serialized",
    );
    expect(result.stdout).toBe(`appended 5 ${ref(1)}\n`);
  });
});
