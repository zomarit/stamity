import { link, lstat, mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFailureLogEntry,
  DEFAULT_MAX_LOG_SIZE,
  FAILURE_LOG_FILE,
  FAILURE_LOG_MAX_BYTES_ENV,
  formatLogEntry,
  getMaxLogSize,
  MIN_RETAINED_ENTRIES,
  parseFailureLog,
  parseFailureLogDetailed,
  rotateLog,
  shouldRotateLog,
  writeFailureLog,
  type FailureLogEntry,
} from "../../src/resilience/failureLog.ts";
import type { EngineError } from "../../src/types/errors.ts";
import { useTempDir } from "../support/tempDir.ts";

/** Fixed-width entries: every line serializes to the same byte count, so budgets are exact. */
function entryAt(index: number): FailureLogEntry {
  return {
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    phase: "emit",
    errorType: "EngineError",
    message: `failure ${String(index).padStart(3, "0")}`,
  };
}

/** Bytes one entry occupies on disk, newline terminator included. */
const LINE_BYTES = Buffer.byteLength(formatLogEntry(entryAt(0)), "utf8") + 1;

/** Stand-in for the out-of-tree file a planted link aims the append at. */
const VICTIM_BYTES = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5-operator-key\n";

function logOf(count: number): string {
  return `${Array.from({ length: count }, (_, index) => formatLogEntry(entryAt(index))).join("\n")}\n`;
}

function messagesOf(content: string): string[] {
  return parseFailureLog(content).map((entry) => entry.message);
}

function setBudget(bytes: number): void {
  vi.stubEnv(FAILURE_LOG_MAX_BYTES_ENV, String(bytes));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getMaxLogSize", () => {
  it("falls back to the default when the override is unset", () => {
    vi.stubEnv(FAILURE_LOG_MAX_BYTES_ENV, undefined);
    expect(getMaxLogSize()).toBe(DEFAULT_MAX_LOG_SIZE);
    expect(DEFAULT_MAX_LOG_SIZE).toBe(524_288);
  });

  it("reads a positive integer override, surrounding whitespace tolerated", () => {
    setBudget(4096);
    expect(getMaxLogSize()).toBe(4096);

    vi.stubEnv(FAILURE_LOG_MAX_BYTES_ENV, " 8192 ");
    expect(getMaxLogSize()).toBe(8192);
  });

  it.each(["", "abc", "0", "-1", "1e6", "4096.5", "0x10"])(
    "falls back to the default for %j — a partial parse would yield a nonsense budget",
    (raw) => {
      vi.stubEnv(FAILURE_LOG_MAX_BYTES_ENV, raw);
      expect(getMaxLogSize()).toBe(DEFAULT_MAX_LOG_SIZE);
    },
  );

  it("is re-read on every call, so an override applies without a restart", () => {
    setBudget(1024);
    expect(getMaxLogSize()).toBe(1024);
    setBudget(2048);
    expect(getMaxLogSize()).toBe(2048);
  });
});

describe("createFailureLogEntry", () => {
  it("takes the class and message off an Error and stamps an ISO timestamp", () => {
    const entry = createFailureLogEntry("emit", new TypeError("bad shape"));

    expect(entry.phase).toBe("emit");
    expect(entry.errorType).toBe("TypeError");
    expect(entry.message).toBe("bad shape");
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  it.each([
    { thrown: "boom", errorType: "string", message: "boom" },
    { thrown: 42, errorType: "number", message: "42" },
    { thrown: null, errorType: "null", message: "null" },
    { thrown: undefined, errorType: "undefined", message: "undefined" },
  ])("classifies a thrown $errorType", ({ thrown, errorType, message }) => {
    const entry = createFailureLogEntry("sync", thrown);
    expect(entry.errorType).toBe(errorType);
    expect(entry.message).toBe(message);
  });

  it("reads name and message structurally, so a foreign-realm error still classifies", () => {
    const entry = createFailureLogEntry("sync", { name: "AbortError", message: "cancelled" });
    expect(entry.errorType).toBe("AbortError");
    expect(entry.message).toBe("cancelled");
  });

  it("survives a value String() cannot convert", () => {
    // A null-prototype object has no toString; the naive path throws here.
    const entry = createFailureLogEntry("sync", Object.create(null) as object);
    expect(entry.errorType).toBe("object");
    expect(entry.message).toBe("[object Object]");
  });

  it("overlays the extra fields, pinned timestamp included", () => {
    const entry = createFailureLogEntry("emit", new Error("x"), {
      agentId: "reviewer",
      context: { tool: "cursor", attempt: 2 },
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(entry.agentId).toBe("reviewer");
    expect(entry.context).toEqual({ tool: "cursor", attempt: 2 });
    expect(entry.timestamp).toBe("2026-01-01T00:00:00.000Z");
  });

  it("round-trips through format and parse", () => {
    const entry = createFailureLogEntry("emit", new Error("multi\nline"), { agentId: "planner" });
    expect(parseFailureLog(formatLogEntry(entry))).toEqual([entry]);
  });
});

describe("formatLogEntry", () => {
  it("emits one line — an embedded newline is escaped, not written raw", () => {
    const line = formatLogEntry(createFailureLogEntry("emit", new Error("a\nb")));
    expect(line).not.toContain("\n");
    expect(line.startsWith("{")).toBe(true);
  });
});

describe("parseFailureLog", () => {
  it("drops a corrupt line, keeps the valid ones in order, and counts the drop", () => {
    const content = [
      formatLogEntry(entryAt(0)),
      '{"timestamp":"2026-01-01T00:00:01.000Z","phase":"emit","errorType":"Err","messa',
      formatLogEntry(entryAt(2)),
    ].join("\n");

    const parsed = parseFailureLogDetailed(content);
    expect(parsed.entries).toEqual([entryAt(0), entryAt(2)]);
    expect(parsed.skipped).toBe(1);
    expect(parseFailureLog(content)).toEqual(parsed.entries);
  });

  it("ignores blank and whitespace-only lines without counting them as damage", () => {
    const content = `\n${formatLogEntry(entryAt(1))}\n   \n\n`;
    expect(parseFailureLogDetailed(content)).toEqual({ entries: [entryAt(1)], skipped: 0 });
  });

  it.each(['{"a":1}', "123", "[]", '"just a string"', "null", '{"timestamp":"","phase":"p"}'])(
    "counts %s as damage — it parses as JSON but is not an entry",
    (line) => {
      expect(parseFailureLogDetailed(line)).toEqual({ entries: [], skipped: 1 });
    },
  );

  it("keeps optional fields and drops wrong-typed ones without losing the entry", () => {
    const line = JSON.stringify({
      ...entryAt(0),
      agentId: 7,
      context: ["not", "a", "record"],
    });

    expect(parseFailureLog(line)).toEqual([entryAt(0)]);
  });

  it("returns nothing for an empty log", () => {
    expect(parseFailureLogDetailed("")).toEqual({ entries: [], skipped: 0 });
  });
});

describe("shouldRotateLog", () => {
  it("compares against the active budget, over not at", () => {
    setBudget(2 * LINE_BYTES);
    expect(shouldRotateLog(logOf(2))).toBe(false);
    expect(shouldRotateLog(logOf(3))).toBe(true);
  });

  it("uses the default budget when nothing overrides it", () => {
    vi.stubEnv(FAILURE_LOG_MAX_BYTES_ENV, undefined);
    expect(shouldRotateLog(logOf(50))).toBe(false);
  });
});

describe("rotateLog", () => {
  it("keeps the newest entries that fit the budget, in order", () => {
    const budget = 20 * LINE_BYTES;
    setBudget(budget);

    const rotated = rotateLog(logOf(50));

    expect(Buffer.byteLength(rotated, "utf8")).toBeLessThanOrEqual(budget);
    expect(rotated.endsWith("\n")).toBe(true);
    expect(messagesOf(rotated)).toEqual(
      Array.from({ length: 20 }, (_, index) => entryAt(30 + index).message),
    );
    expect(shouldRotateLog(rotated)).toBe(false);
  });

  it("holds the retention floor when the budget is smaller than that many entries", () => {
    // Edge case: a budget of three entries' worth would otherwise leave a log too
    // short to show the sequence that led to the failure.
    const budget = 3 * LINE_BYTES;
    setBudget(budget);

    const rotated = rotateLog(logOf(50));
    const kept = parseFailureLog(rotated);

    expect(kept).toHaveLength(MIN_RETAINED_ENTRIES);
    expect(kept.map((entry) => entry.message)).toEqual(
      Array.from({ length: MIN_RETAINED_ENTRIES }, (_, index) => entryAt(40 + index).message),
    );
    expect(Buffer.byteLength(rotated, "utf8")).toBeGreaterThan(budget);
  });

  it("keeps everything when there are fewer entries than the floor", () => {
    setBudget(LINE_BYTES);
    expect(messagesOf(rotateLog(logOf(4)))).toEqual([
      entryAt(0).message,
      entryAt(1).message,
      entryAt(2).message,
      entryAt(3).message,
    ]);
  });

  it("reclaims corrupt lines — rotation is the one moment the file is rewritten", () => {
    setBudget(12 * LINE_BYTES);
    const content = `${logOf(15)}not json at all\n`;

    const rotated = rotateLog(content);

    expect(parseFailureLogDetailed(rotated).skipped).toBe(0);
    expect(messagesOf(rotated)).toEqual(
      Array.from({ length: 12 }, (_, index) => entryAt(3 + index).message),
    );
  });

  it("returns an empty log when nothing in it is readable", () => {
    setBudget(64);
    expect(rotateLog("garbage\nmore garbage\n")).toBe("");
    expect(rotateLog("")).toBe("");
  });
});

describe("writeFailureLog", () => {
  const tempDir = useTempDir("stamity-failure-log");

  it("creates a missing state directory rather than failing on it", async () => {
    const handle = tempDir();
    const stateDir = handle.path("nested/.stamity");

    const result = await writeFailureLog(stateDir, entryAt(0));

    expect(result).toEqual({ path: join(stateDir, FAILURE_LOG_FILE), rotated: false });
    expect(FAILURE_LOG_FILE).toBe("failure-log.jsonl");
    expect(parseFailureLog(await readFile(result.path, "utf8"))).toEqual([entryAt(0)]);
  });

  it("appends, keeping earlier entries and their order", async () => {
    const handle = tempDir();

    await writeFailureLog(handle.dir, entryAt(0));
    const second = await writeFailureLog(handle.dir, entryAt(1));

    expect(second.rotated).toBe(false);
    expect(messagesOf(await readFile(second.path, "utf8"))).toEqual([
      entryAt(0).message,
      entryAt(1).message,
    ]);
  });

  it("repairs a tail left without its newline instead of fusing two entries", async () => {
    const handle = tempDir();
    await handle.seedFiles({ [FAILURE_LOG_FILE]: formatLogEntry(entryAt(0)) });

    const result = await writeFailureLog(handle.dir, entryAt(1));

    expect(parseFailureLogDetailed(await readFile(result.path, "utf8"))).toEqual({
      entries: [entryAt(0), entryAt(1)],
      skipped: 0,
    });
  });

  it("rotates when the append would breach the budget, keeping the new entry last", async () => {
    const handle = tempDir();
    const budget = 20 * LINE_BYTES;
    setBudget(budget);
    await handle.seedFiles({ [FAILURE_LOG_FILE]: logOf(60) });

    const newest = entryAt(999);
    const result = await writeFailureLog(handle.dir, newest);
    const content = await readFile(result.path, "utf8");
    const kept = parseFailureLog(content);

    expect(result.rotated).toBe(true);
    expect(Buffer.byteLength(content, "utf8")).toBeLessThanOrEqual(budget);
    expect(kept.length).toBeGreaterThanOrEqual(MIN_RETAINED_ENTRIES);
    expect(kept.at(-1)).toEqual(newest);
    expect(kept[0]).toEqual(entryAt(60 - (kept.length - 1)));
  });

  it("leaves no temp file behind after a rotation", async () => {
    const handle = tempDir();
    setBudget(15 * LINE_BYTES);
    await handle.seedFiles({ [FAILURE_LOG_FILE]: logOf(40) });

    await writeFailureLog(handle.dir, entryAt(41));

    expect(await readdir(handle.dir)).toEqual([FAILURE_LOG_FILE]);
  });

  /**
   * The append followed whatever stood at the log's name, so a planted link
   * wrote engine diagnostics outside the repository — and the read that decides
   * the rotate branch pulled that file's bytes back in under this name. Real
   * filesystem: link resolution and `nlink` are kernel properties.
   */
  it("refuses a log path that is a symlink out of the tree, and writes nothing there", async () => {
    const handle = tempDir();
    const outside = handle.path("outside");
    await mkdir(outside, { recursive: true });
    const victim = join(outside, "authorized_keys");
    await writeFile(victim, VICTIM_BYTES, "utf8");
    const stateDir = handle.path("state");
    await mkdir(stateDir, { recursive: true });
    await symlink(victim, join(stateDir, FAILURE_LOG_FILE));

    await expect(writeFailureLog(stateDir, entryAt(0))).rejects.toMatchObject({
      code: "FS_ERROR",
      message: expect.stringContaining("symbolic link"),
    });

    // Not one diagnostic line landed outside, and the link is still a link.
    expect(await readFile(victim, "utf8")).toBe(VICTIM_BYTES);
    expect((await lstat(join(stateDir, FAILURE_LOG_FILE))).isSymbolicLink()).toBe(true);
  });

  it("refuses a log path that is a hard link to a file outside the tree", async () => {
    const handle = tempDir();
    const outside = handle.path("outside");
    await mkdir(outside, { recursive: true });
    const victim = join(outside, "authorized_keys");
    await writeFile(victim, VICTIM_BYTES, "utf8");
    const stateDir = handle.path("state");
    await mkdir(stateDir, { recursive: true });
    // `lstat` reports an ordinary regular file here; only `nlink` gives it away.
    await link(victim, join(stateDir, FAILURE_LOG_FILE));

    await expect(writeFailureLog(stateDir, entryAt(0))).rejects.toMatchObject({
      code: "FS_ERROR",
      message: expect.stringContaining("hard link"),
    });

    expect(await readFile(victim, "utf8")).toBe(VICTIM_BYTES);
  });

  it("refuses a state directory that links out of the tree, before creating anything", async () => {
    const handle = tempDir();
    const outside = handle.path("outside");
    await mkdir(outside, { recursive: true });
    await mkdir(handle.path("repo"), { recursive: true });
    await symlink(outside, handle.path("repo/.stamity"), "dir");

    await expect(writeFailureLog(handle.path("repo/.stamity"), entryAt(0))).rejects.toMatchObject({
      code: "FS_ERROR",
    });

    expect(await readdir(outside)).toEqual([]);
  });

  it("keeps the rotate threshold after routing the append through the contained writer", async () => {
    // The append and the rotate branch share one budget decision, and only the
    // append side moved. One entry under the budget appends; the entry that
    // crosses it rotates, at the same size as before.
    const handle = tempDir();
    setBudget(12 * LINE_BYTES);
    await handle.seedFiles({ [FAILURE_LOG_FILE]: logOf(11) });

    const under = await writeFailureLog(handle.dir, entryAt(11));
    expect(under.rotated).toBe(false);
    expect(parseFailureLog(await readFile(under.path, "utf8"))).toHaveLength(12);

    const over = await writeFailureLog(handle.dir, entryAt(12));
    expect(over.rotated).toBe(true);
    expect(Buffer.byteLength(await readFile(over.path, "utf8"), "utf8")).toBeLessThanOrEqual(
      12 * LINE_BYTES,
    );
  });

  it("throws a typed FS_ERROR naming the path when the state dir cannot exist", async () => {
    const handle = tempDir();
    await handle.seedFiles({ occupied: "not a directory" });

    const stateDir = handle.path("occupied");
    let thrown: unknown;
    try {
      await writeFailureLog(stateDir, entryAt(0));
    } catch (error) {
      thrown = error;
    }

    const error = thrown as EngineError;
    expect(error?.name).toBe("EngineError");
    expect(error.code).toBe("FS_ERROR");
    expect(error.exitCode).toBe(1);
    expect(error.message).toContain(join(stateDir, FAILURE_LOG_FILE));
    expect(error.cause).toBeDefined();
  });
});
