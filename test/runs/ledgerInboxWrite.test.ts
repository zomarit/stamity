import { linkSync } from "node:fs";
import { mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMMANDS } from "../../src/cli.ts";
import { INBOX_BULLET_MAX_CHARS, INBOX_JOINED_MAX_CHARS, inboxScreenWindows } from "../../src/cli/commands/ledger.ts";
import { runCli } from "../../src/cli/kit/program.ts";
import { INBOX_PATH, parseInbox, SCHEDULE_RULE_HEADING, type InboxEditProblem } from "../../src/runs/inboxStore.ts";
import type * as AtomicWrite from "../../src/merge/atomicWrite.ts";
import { closeRow } from "../../src/runs/ledgerStore.ts";
import type * as LedgerStore from "../../src/runs/ledgerStore.ts";
import { useTempDir, type TempDirHandle } from "../support/tempDir.ts";

/**
 * A store refusal a case hands in place of the store's own, to reach the CLI's
 * screen over store messages: no store message quotes row text today, so only
 * a stand-in can carry one. Null passes every call through to the real store.
 */
const storeRefusal = vi.hoisted(() => ({ problems: null as readonly InboxEditProblem[] | null }));

/**
 * A step a case runs inside the inbox write, after its ledger cross-check and
 * before the inbox lands (S25): the store's own writer is reached through its
 * module, and the step runs once, at the write of the inbox, and is then
 * cleared. Null passes every write through.
 */
const inboxRace = vi.hoisted(() => ({ step: null as (() => Promise<void>) | null }));

vi.mock("../../src/merge/atomicWrite.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof AtomicWrite>();
  return {
    ...actual,
    atomicWriteFileUnlocked: async (
      ...args: Parameters<typeof actual.atomicWriteFileUnlocked>
    ): ReturnType<typeof actual.atomicWriteFileUnlocked> => {
      const step = inboxRace.step;
      if (step !== null && args[0].endsWith("inbox.md")) {
        inboxRace.step = null;
        await step();
      }
      return await actual.atomicWriteFileUnlocked(...args);
    },
  };
});

vi.mock("../../src/runs/ledgerStore.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof LedgerStore>();
  return {
    ...actual,
    // Typed through `actual`: a `LedgerStore.<member>` type here makes knip count only this
    // alias's members and drop `src/composition/root.ts`'s whole-namespace use, so the
    // engine's exports read unused.
    writeInbox: async (req: Parameters<typeof actual.writeInbox>[0]): ReturnType<typeof actual.writeInbox> => {
      if (storeRefusal.problems === null) return await actual.writeInbox(req);
      throw new actual.InboxWriteRefused(storeRefusal.problems);
    },
  };
});

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

// A case that switches the lock off with `vi.stubEnv` leaves it off for every later case unless reset.
afterEach(() => {
  vi.unstubAllEnvs();
});

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
/** `exfiltrate`'s one word, built from fragments. */
const EXFIL_WORD = ["ex", "filtr", "ate"].join("");
/** A word the `tool-call-injection` row matches only once an opening parenthesis follows it. */
const CALL_WORD = ["func", "tion_c", "all"].join("");

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
  stdinIsTTY = false,
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
    terminal: { stdoutIsTTY: false, stderrIsTTY: false, stdinIsTTY },
    clock: { now: () => NOW },
  });
  return { code, stdout: stdout.join(""), stderr: stderr.join("") };
}

/** `ledger inbox` through the funnel, unfiltered unless `args` filter it. */
async function query(dir: TempDirHandle, args: readonly string[] = []): Promise<{ code: number; stdout: string; stderr: string }> {
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
    terminal: { stdoutIsTTY: false, stderrIsTTY: false, stdinIsTTY: true },
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

  // S22, review/56: a bullet already carrying the row's `Ref:` stands for it only when it is the same row.
  it("refuses the whole call when a bullet carries the row's Ref: with other identity fields, naming its line only", async () => {
    const dir = tempDir();
    const planted = `- Minor · src/b.ts:9 · quiet planted words · source: /st-work · Ref: ${ref(1)} · by: 2026-11-01`;
    const before = `${SCHEDULE_RULE_HEADING}\n\n${planted}\n`;
    await seed(dir, { [INBOX_PATH]: before, [ledgerOf(RUN)]: `${ledgerRow(1)}\n${ledgerRow(2)}\n` });

    const result = await write(dir, ["--stdin"], [bullet(2), bullet(1)]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "stdin:2: carries the `Ref:` inbox line 3 carries, with another severity, location, description or source",
    );
    expectNoRowText(result, "planted", "src/b.ts");
    expect(await readText(dir, INBOX_PATH)).toBe(before);
  });

  it("lets the lock and the re-read under it settle two concurrent writes of one row: one appends, one finds it filed", async () => {
    const dir = tempDir();
    await seed(dir, { [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n`, [ledgerOf(RUN)]: `${ledgerRow(1)}\n` });

    const results = await Promise.all([write(dir, ["--stdin"], [bullet(1)]), write(dir, ["--stdin"], [bullet(1)])]);

    expect(results.map((result) => result.code)).toEqual([0, 0]);
    expect(results.map((result) => result.stdout).toSorted()).toEqual([`already-filed 5 ${ref(1)}\n`, `appended 5 ${ref(1)}\n`]);
    expect((await readText(dir, INBOX_PATH)).split("\n").filter((line) => line.includes(ref(1)))).toHaveLength(1);
  });

  // S25, pr/2: a close racing the write between its ledger cross-check and the inbox landing waits for
  // the write, since the write holds the referenced ledger's lock from before that check until it lands.
  it("holds a referenced ledger's lock from its re-read to the inbox landing, so a concurrent close waits for the write", async () => {
    const dir = tempDir();
    await seed(dir, { [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n`, [ledgerOf(RUN)]: `${ledgerRow(1)}\n` });
    let close: Promise<unknown> | null = null;
    let during = "";
    inboxRace.step = async (): Promise<void> => {
      close = closeRow({ rootDir: dir.dir, runId: RUN, ledgerId: "review/1", state: "fixed", rationale: "fixed elsewhere", dryRun: false });
      during = await Promise.race([
        close.then(() => "closed"),
        new Promise<string>((resolve) => {
          setTimeout(() => resolve("waiting"), 300);
        }),
      ]);
    };

    const result = await write(dir, ["--stdin"], [bullet(1)]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(`appended 5 ${ref(1)}\n`);
    expect(close, "the write never reached the inbox landing").not.toBeNull();
    expect(during).toBe("waiting");
    await close;
    expect(await readText(dir, ledgerOf(RUN))).toContain('"state":"fixed"');
  });

  it.skipIf(WINDOWS)("refuses the call, writing nothing, when a referenced ledger's lock cannot be taken", async () => {
    const dir = tempDir();
    const before = `${SCHEDULE_RULE_HEADING}\n`;
    await seed(dir, { [INBOX_PATH]: before, [ledgerOf(OTHER_RUN)]: `${ledgerRow(4, {}, OTHER_RUN)}\n`, "elsewhere/keep.txt": "" });
    // A link standing at the lock's name: the lock is refused at once rather than waited on.
    await symlink(dir.path("elsewhere"), dir.path(".stamity", "runs", OTHER_RUN, "ledger.jsonl.lock"));

    const result = await write(dir, ["--stdin"], [bullet(4, "by: 2026-11-01", ref(4, OTHER_RUN))]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("the lock on a ledger a `Ref:` names could not be taken");
    expect(result.stderr).not.toContain(OTHER_RUN);
    expectNoRowText(result);
    expect(await readText(dir, INBOX_PATH)).toBe(before);
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

  // S26, pr/3: `--remove` splits its list on commas, so a row whose `Ref:` held one could never be removed.
  it("refuses a row whose Ref: holds a comma, naming its stdin line and not the Ref:", async () => {
    const result = await refused([bullet(1), bullet(2, "by: 2026-11-01", "docs/plans/quiet,v2.md#u1")]);

    expect(result.stderr).toContain("stdin:2: carries a `Ref:` holding a comma");
    expectNoRowText(result, "v2.md");
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

  // review/55: the ledger a `Ref:` names is read by a no-follow, size-bounded open, as the inbox is.
  it.skipIf(WINDOWS)("refuses a Ref: into another run's ledger that is a hard link", async () => {
    const dir = tempDir();
    await seed(dir, { [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n`, [ledgerOf(RUN)]: "", [ledgerOf(OTHER_RUN)]: `${ledgerRow(4, {}, OTHER_RUN)}\n` });
    linkSync(dir.path(ledgerOf(OTHER_RUN)), dir.path("twin.jsonl"));

    const result = await write(dir, ["--stdin"], [bullet(4, "by: 2026-11-01", ref(4, OTHER_RUN))]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("stdin:1: the ledger its `Ref:` names is a hard link");
    expect(await readText(dir, INBOX_PATH)).toBe(`${SCHEDULE_RULE_HEADING}\n`);
  });

  it("refuses a Ref: into a ledger over the 4 MiB read ceiling as a refusal, unread, and writes nothing", async () => {
    const dir = tempDir();
    const padding = `${"p".repeat(4_194_304)}\n`;
    await seed(dir, {
      [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n`,
      [ledgerOf(RUN)]: "",
      [ledgerOf(OTHER_RUN)]: `${ledgerRow(4, {}, OTHER_RUN)}\n${padding}`,
    });

    const result = await write(dir, ["--stdin"], [bullet(4, "by: 2026-11-01", ref(4, OTHER_RUN))]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("stdin:1: the ledger its `Ref:` names is over the 4194304 byte read ceiling");
    expectNoRowText(result);
    expect(await readText(dir, INBOX_PATH)).toBe(`${SCHEDULE_RULE_HEADING}\n`);
  });

  it("reads a Ref:'s ledger at the 4 MiB read ceiling exactly", async () => {
    const dir = tempDir();
    const row = `${ledgerRow(4, {}, OTHER_RUN)}\n`;
    await seed(dir, {
      [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n`,
      [ledgerOf(RUN)]: "",
      // Bytes, not characters: the row's evidence carries a dash of three bytes.
      [ledgerOf(OTHER_RUN)]: `${row}${"p".repeat(4_194_304 - Buffer.byteLength(row, "utf8") - 1)}\n`,
    });

    const result = await write(dir, ["--stdin"], [bullet(4, "by: 2026-11-01", ref(4, OTHER_RUN))]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(`appended 5 ${ref(4, OTHER_RUN)}\n`);
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

// Fix round r1 of w1-inbox-write: each case below names the ledger row it answers.
describe("stamity ledger inbox-write — the output screens fire (review/4)", () => {
  it("prints a removal Ref: the screen hits as (withheld), in the human line and the document", async () => {
    const dir = tempDir();
    const hitRef = `docs/${EXFIL_WORD}.md`;
    const before = `${SCHEDULE_RULE_HEADING}\n\n${bullet(7, "by: 2026-11-01", hitRef)}\n`;
    await seed(dir, { [INBOX_PATH]: before, [ledgerOf(RUN)]: "" });

    const human = await write(dir, ["--remove", hitRef, "--dry-run"]);
    const json = await write(dir, ["--remove", hitRef, "--json"]);

    expect(human.code, human.stderr).toBe(0);
    expect(human.stdout.split("\n")[0]).toBe("removed 3 (withheld)");
    expect(JSON.parse(json.stdout)).toMatchObject({ removed: [{ line: 3, ref: null }] });
    for (const result of [human, json]) {
      expect(result.stdout).not.toContain(EXFIL_WORD);
      expect(result.stderr).not.toContain(EXFIL_WORD);
    }
    expect(await readText(dir, INBOX_PATH)).toBe(`${SCHEDULE_RULE_HEADING}\n\n`);
  });

  it("screens each store message before it prints, a row's and a removal's", async () => {
    const dir = tempDir();
    await seed(dir, { [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n`, [ledgerOf(RUN)]: `${ledgerRow(1)}\n` });
    storeRefusal.problems = [
      { where: "row", line: 1, message: `a message quoting ${NEVER_HIT}` },
      { where: "remove", line: 1, message: `a message quoting ${NEVER_HIT}` },
    ];
    try {
      const result = await write(dir, ["--stdin", "--remove", "docs/x.md"], ["", bullet(1)]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("stdin:2: refused by the screen (never-verify)");
      expect(result.stderr).toContain("--remove:1: refused by the screen (never-verify)");
      expectNoRowText(result, "view the", "a message quoting");
    } finally {
      storeRefusal.problems = null;
    }
  });

  it("screens the parse message of a bullet no screen hits, and lists only the pattern id", async () => {
    const dir = tempDir();
    await seed(dir, { [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n`, [ledgerOf(RUN)]: `${ledgerRow(1)}\n` });
    // The backtick keeps the bullet clear of the screen; the `files:` message quotes the entry with it stripped.
    const split = ["ex", "`", "filtrate"].join("");

    const result = await write(dir, ["--stdin"], [bullet(1, `by: 2026-11-01 · files: ${split} quiet`)]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("stdin:1: refused by the screen (exfiltrate)");
    expect(result.stderr).not.toContain("holds a space");
    expectNoRowText(result, split);
    expect(await readText(dir, INBOX_PATH)).toBe(`${SCHEDULE_RULE_HEADING}\n`);
  });
});

describe("stamity ledger inbox-write — usage and the refusal document (review/5, review/9, build/2)", () => {
  it.each([",", " , ,"])("refuses --remove %j, which names no Ref:", async (given) => {
    const dir = tempDir();
    await seed(dir, { [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n` });

    const result = await write(dir, ["--remove", given]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ledger inbox-write --remove names no Ref:");
    expect(result.stdout).toBe("");
  });

  // TEST CHANGE, justified (2026-10-12, REQ-FLOW-078): this case asserted exit 0, an empty stdout
  // and the stderr note "ledger inbox-write: no rows on stdin and nothing to remove; nothing
  // written" for a stdin of blank lines. A close that reads the exit code alone took that call as
  // landed (review/52), so a `--stdin` that brings no row, piped empty or left on a terminal, with
  // no `--remove`, is now a validation refusal naming that nothing was given.
  it.each([
    ["a piped stdin of blank lines", ["", "  "], false],
    ["an empty pipe", [], false],
    ["a terminal stdin", [], true],
  ] as const)("refuses --stdin with no --remove when it brings no row, from %s, and writes nothing", async (_label, stdin, tty) => {
    const dir = tempDir();
    await seed(dir, { [ledgerOf(RUN)]: "" });

    const result = await write(dir, ["--stdin"], stdin, tty);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("ledger inbox-write was given nothing to write: no row on stdin and no --remove");
    expect(result.stderr).not.toContain("nothing written");
    await expect(stat(dir.path(INBOX_PATH))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["an empty pipe", false],
    ["a terminal stdin", true],
  ] as const)("still removes with --stdin beside --remove when stdin brings no row, from %s", async (_label, tty) => {
    const dir = tempDir();
    await seed(dir, {
      [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n\n${bullet(1)}\n`,
      [ledgerOf(RUN)]: `${ledgerRow(1, { state: "fixed" })}\n`,
    });

    const result = await write(dir, ["--stdin", "--remove", ref(1)], [], tty);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(`removed 3 ${ref(1)}\n`);
    expect(await readText(dir, INBOX_PATH)).toBe(`${SCHEDULE_RULE_HEADING}\n\n`);
  });

  it("places a --remove and an inbox problem by their own src in the --json refusal, and a stdin one by none", async () => {
    const dir = tempDir();
    await seed(dir, {
      [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n\n${bullet(1)}\n${SCHEDULE_RULE_HEADING}\n`,
      [ledgerOf(RUN)]: `${ledgerRow(1)}\n`,
    });

    const store = await write(dir, ["--remove", ref(9), "--json"]);
    const stdin = await write(dir, ["--stdin", "--json"], ["- Minor · src/a.ts:2 · quiet · source: /st-work · by: 2026-11-01"]);

    expect(store.code).toBe(1);
    expect(JSON.parse(store.stdout)).toMatchObject({
      problems: [
        { src: INBOX_PATH, line: 4, message: expect.stringContaining("appears at lines 1 and 4") },
        { src: "--remove", line: 1, message: "matches no bullet in the inbox" },
      ],
    });
    expect(stdin.code).toBe(1);
    const problems = (JSON.parse(stdin.stdout) as { problems: Record<string, unknown>[] }).problems;
    expect(problems).toEqual([{ line: 1, message: expect.stringContaining("carries no `Ref:`") }]);
  });

  it.each([
    ["a blank entry", (first: string, missing: string) => `,${first},${missing}`],
    ["a repeated entry", (first: string, missing: string) => `${first},${first},${missing}`],
  ])("numbers a --remove problem by the entry as typed, past %s", async (_label, typed) => {
    const dir = tempDir();
    const before = `${SCHEDULE_RULE_HEADING}\n\n${bullet(1)}\n`;
    await seed(dir, { [INBOX_PATH]: before, [ledgerOf(RUN)]: `${ledgerRow(1, { state: "fixed" })}\n` });

    const result = await write(dir, ["--remove", typed(ref(1), ref(9))]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--remove:3: matches no bullet in the inbox");
    expect(await readText(dir, INBOX_PATH)).toBe(before);
  });

  it("refuses a stdin over the input ceiling without pointing at --report, a flag inbox-write refuses", async () => {
    const dir = tempDir();
    await seed(dir, { [ledgerOf(RUN)]: "" });

    const result = await write(dir, ["--stdin"], [bullet(1, `by: 2026-11-01 · rationale: ${"q".repeat(250_001)}`)]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("over the 250000 byte input ceiling");
    expect(result.stderr).not.toContain("--report");
    expect(result.stderr).not.toContain("findings block");
  });
});

describe("stamity ledger inbox-write — what lands reads as the query will print it (review/17, review/8, review/6)", () => {
  it.each([
    ["its description", `- Minor · src/a.ts:1 · see the ${CALL_WORD} · source: /st-work · Ref: ${ref(1)} · by: 2026-11-01`],
    ["its tag", `- Minor · src/a.ts:1 · quiet · source: /st-work · Ref: ${ref(1)} · ${CALL_WORD} · by: 2026-11-01`],
  ])("refuses a row whose printed line the query's suffix completes after %s", async (_label, given) => {
    const dir = tempDir();
    const before = `${SCHEDULE_RULE_HEADING}\n`;
    await seed(dir, { [INBOX_PATH]: before, [ledgerOf(RUN)]: `${ledgerRow(1)}\n` });

    const result = await write(dir, ["--stdin"], [given]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("stdin:1: refused by the screen (tool-call-injection) in the line the inbox query would print for it");
    expectNoRowText(result, CALL_WORD);
    expect(await readText(dir, INBOX_PATH)).toBe(before);
  });

  it("refuses a row that completes a screen row with the bullets already in the run's block of today (S15)", async () => {
    const dir = tempDir();
    await seed(dir, { [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n`, [ledgerOf(RUN)]: `${ledgerRow(1)}\n${ledgerRow(2)}\n` });

    const first = await write(dir, ["--stdin"], [`- Minor · src/a.ts:1 · ${IMAGE_OPEN} · source: /st-work · Ref: ${ref(1)} · by: 2026-11-01`]);
    expect(first.code, first.stderr).toBe(0);
    const after = await readText(dir, INBOX_PATH);

    const second = await write(dir, ["--stdin"], [`- Minor · src/a.ts:2 · ${IMAGE_CLOSE} · source: /st-work · Ref: ${ref(2)} · by: 2026-11-01`]);
    const dry = await write(dir, ["--stdin", "--dry-run"], [`- Minor · src/a.ts:2 · ${IMAGE_CLOSE} · source: /st-work · Ref: ${ref(2)} · by: 2026-11-01`]);

    for (const result of [second, dry]) {
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "stdin:1: refused by the screen (image-url-exfiltration) read with the bullets already in the run's block of today",
      );
      expectNoRowText(result, "collector");
    }
    expect(await readText(dir, INBOX_PATH)).toBe(after);
  });

  it("lands a row of the longest length in a CRLF inbox, and the query reads it rather than skipping it as over-length", async () => {
    const dir = tempDir();
    await seed(dir, { [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\r\n`, [ledgerOf(RUN)]: `${ledgerRow(1)}\n` });
    const stem = bullet(1, "by: 2026-11-01 · rationale: ");
    const longest = `${stem}${"q".repeat(INBOX_BULLET_MAX_CHARS - stem.length)}`;
    expect(longest).toHaveLength(INBOX_BULLET_MAX_CHARS);

    const written = await write(dir, ["--stdin"], [longest]);
    const read = await query(dir);

    expect(written.code, written.stderr).toBe(0);
    expect((await readText(dir, INBOX_PATH)).split("\n")).toContain(`${longest}\r`);
    expect(read.code, read.stderr).toBe(0);
    expect(read.stdout).not.toContain("over-length");
    expect(read.stdout.split("\n")[0]).toBe("inbox: 1 rows · 1 matched · 0 unmatched · 0 unparsed · 0 skipped");
  });
});

describe("stamity ledger inbox-write — invisible and control characters are stripped and reported (review/20)", () => {
  it.each([
    ["a C0 control", 0x07],
    ["a C1 control", 0x9b],
    ["a bidi control", 0x202e],
    ["a zero-width mark", 0x200b],
    ["a tag character", 0xe0041],
    ["a line separator", 0x2028],
    ["a paragraph separator", 0x2029],
  ])("strips %s before the screen and the write, naming the stdin line", async (_label, codePoint) => {
    const dir = tempDir();
    await seed(dir, { [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n`, [ledgerOf(RUN)]: `${ledgerRow(1)}\n` });
    const marked = bullet(1).replace("quiet finding", `quiet${String.fromCodePoint(codePoint)} finding`);

    const result = await write(dir, ["--stdin"], ["", marked]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stderr).toContain("warning: stdin:2: control, bidi, zero-width or tag characters were stripped");
    expect(result.stdout).toBe(`appended 5 ${ref(1)}\n`);
    expect(await readText(dir, INBOX_PATH)).toBe(`${SCHEDULE_RULE_HEADING}\n\n${HEAD}\n\n${bullet(1)}\n`);
    expectNoRowText(result);
  });
});

describe("stamity ledger inbox-write — the joined screen reads bounded windows (review/19, review/10)", () => {
  /** The joined text of the bullets a window holds, by their lengths and the line break between each two. */
  const joinedLength = (lengths: readonly number[], [from, to]: readonly [number, number]): number =>
    lengths.slice(from, to + 1).reduce((sum, length) => sum + length, 0) + (to - from);

  it("holds every window to the cap and every two adjacent bullets in one window, for long bullets", () => {
    const lengths = Array.from({ length: 61 }, () => INBOX_BULLET_MAX_CHARS);

    const windows = inboxScreenWindows(lengths);

    expect(windows.length).toBeLessThanOrEqual(lengths.length - 1);
    for (const window of windows) expect(joinedLength(lengths, window)).toBeLessThanOrEqual(INBOX_JOINED_MAX_CHARS);
    for (let index = 0; index + 1 < lengths.length; index += 1) {
      expect(windows.some(([from, to]) => from <= index && index + 1 <= to)).toBe(true);
    }
  });

  it("holds every run of short bullets up to one bullet's cap in one window, and reads the stdin a bounded number of times", () => {
    const lengths = Array.from({ length: 2500 }, (_, index) => 60 + (index % 50));
    const total = joinedLength(lengths, [0, lengths.length - 1]);

    const windows = inboxScreenWindows(lengths);

    for (const window of windows) expect(joinedLength(lengths, window)).toBeLessThanOrEqual(INBOX_JOINED_MAX_CHARS);
    const read = windows.reduce((sum, window) => sum + joinedLength(lengths, window), 0);
    expect(read).toBeLessThanOrEqual(3 * total);
    for (let from = 0; from < lengths.length; from += 1) {
      let to = from;
      while (to + 1 < lengths.length && joinedLength(lengths, [from, to + 1]) <= INBOX_BULLET_MAX_CHARS) to += 1;
      expect(windows.some(([start, end]) => start <= from && to <= end)).toBe(true);
    }
  });

  it("still names the stdin lines of a hit split over the last two bullets of a long stdin", async () => {
    const dir = tempDir();
    const before = `${SCHEDULE_RULE_HEADING}\n`;
    await seed(dir, { [INBOX_PATH]: before, [ledgerOf(RUN)]: "" });
    const clean = Array.from({ length: 120 }, (_, index) => bullet(index + 1, `by: 2026-11-01 · rationale: ${"q".repeat(900)}`));

    const result = await write(dir, ["--stdin"], [
      ...clean,
      `- Minor · src/a.ts:2 · ${IMAGE_OPEN} · source: /st-work · Ref: ${ref(200)} · by: 2026-11-01`,
      `- Minor · src/a.ts:3 · ${IMAGE_CLOSE} · source: /st-work · Ref: ${ref(201)} · by: 2026-11-01`,
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("stdin:121: refused by the screen (image-url-exfiltration) across stdin lines 121–122");
    expectNoRowText(result, "collector");
  });
});

describe("stamity ledger inbox-write — another run's ledger is read no-follow at every folder (review/11)", () => {
  it.skipIf(WINDOWS)("refuses a Ref: into another run whose folder is a symbolic link", async () => {
    const dir = tempDir();
    await seed(dir, { [INBOX_PATH]: `${SCHEDULE_RULE_HEADING}\n`, [ledgerOf(RUN)]: "", "elsewhere/ledger.jsonl": `${ledgerRow(4, {}, OTHER_RUN)}\n` });
    await symlink(dir.path("elsewhere"), dir.path(".stamity", "runs", OTHER_RUN));

    const result = await write(dir, ["--stdin"], [bullet(4, "by: 2026-11-01", ref(4, OTHER_RUN))]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("stdin:1: the ledger its `Ref:` names is reached through a folder that is a symbolic link");
    expect(await readText(dir, INBOX_PATH)).toBe(`${SCHEDULE_RULE_HEADING}\n`);
  });
});
