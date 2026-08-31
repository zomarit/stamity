import { createHash } from "node:crypto";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WORKTREE_RECEIPT_FILENAME,
  WORKTREE_RECEIPT_SUBDIR,
  WORKTREE_RECEIPT_VERSION,
  classifyReceiptEntry,
  createWorktreeReceipt,
  digestFile,
  inspectEntryState,
  readWorktreeReceipt,
  sha256Hex,
  worktreeReceiptPath,
  writeWorktreeReceipt,
  type EntryState,
  type WorktreeReceiptEntry,
} from "../../src/worktree/receipt.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * REQ-WORKTREE-006 (the receipt's home, schema, and per-row drop reporting) and
 * the inversion half of REQ-WORKTREE-007.
 *
 * The git directory is an INPUT here: `git rev-parse --git-dir` is WT-U1b's
 * pass, and a receipt written into a temp directory proves the same placement
 * rule without a repository. The integration suite pins the resolution itself.
 */

/** Current-tree facts, as the inversion classification reads them. */
function state(kind: EntryState["kind"], sha256: string | null = null): EntryState {
  return { kind, sha256 };
}

const getRoot = useTempDir("worktree-receipt");

function receiptEntry(overrides: Partial<WorktreeReceiptEntry> = {}): WorktreeReceiptEntry {
  return { path: ".env.mcp", strategy: "copy", mode: "0600", sha256: sha256Hex("token=abc"), ...overrides };
}

async function seedReceipt(gitDir: string, document: unknown): Promise<void> {
  await mkdir(join(gitDir, WORKTREE_RECEIPT_SUBDIR), { recursive: true });
  await writeFile(worktreeReceiptPath(gitDir), JSON.stringify(document), "utf8");
}

describe("worktree receipt — placement and round trip (REQ-WORKTREE-006)", () => {
  it("places the receipt under the git directory, never in the working tree", () => {
    expect(worktreeReceiptPath("/repo/.git/worktrees/feat")).toBe(
      join("/repo/.git/worktrees/feat", WORKTREE_RECEIPT_SUBDIR, WORKTREE_RECEIPT_FILENAME),
    );
  });

  it("round-trips a receipt through the writer and the reader", async () => {
    const gitDir = getRoot().dir;
    const receipt = createWorktreeReceipt({
      createdAt: "2026-08-31T10:00:00.000Z",
      engineVersion: "1.4.2",
      worktree: { path: "/farm/feat", branch: "feat", head: "abc1234" },
      entries: [receiptEntry(), receiptEntry({ path: ".venv", strategy: "symlink", mode: "0755" })],
    });

    const written = await writeWorktreeReceipt(gitDir, receipt);
    expect(written).toBe(worktreeReceiptPath(gitDir));

    const read = await readWorktreeReceipt(gitDir);
    expect(read.unreadable).toBeNull();
    expect(read.droppedRows).toEqual([]);
    expect(read.receipt).toEqual(receipt);
    expect(read.receipt?.version).toBe(WORKTREE_RECEIPT_VERSION);
    expect(read.receipt?.entries).toHaveLength(2);
  });

  it("writes the document as newline-terminated JSON a human can read", async () => {
    const gitDir = getRoot().dir;
    await writeWorktreeReceipt(
      gitDir,
      createWorktreeReceipt({
        createdAt: "2026-08-31T10:00:00.000Z",
        engineVersion: "1.4.2",
        worktree: { path: "/farm/feat", branch: "feat", head: "abc1234" },
        entries: [receiptEntry()],
      }),
    );

    const text = await readFile(worktreeReceiptPath(gitDir), "utf8");
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('"version": 1');
  });
});

describe("worktree receipt — an unreadable receipt reads as null (REQ-WORKTREE-006)", () => {
  it("reports an absent receipt as null rather than throwing", async () => {
    const read = await readWorktreeReceipt(getRoot().dir);
    expect(read.receipt).toBeNull();
    expect(read.unreadable).toContain("absent");
  });

  it("reports a malformed receipt as null, naming the file", async () => {
    const gitDir = getRoot().dir;
    await mkdir(join(gitDir, WORKTREE_RECEIPT_SUBDIR), { recursive: true });
    await writeFile(worktreeReceiptPath(gitDir), "{ not json", "utf8");

    const read = await readWorktreeReceipt(gitDir);
    expect(read.receipt).toBeNull();
    expect(read.unreadable).toContain(worktreeReceiptPath(gitDir));
  });

  it("reports a version it does not read as null, naming the version", async () => {
    const gitDir = getRoot().dir;
    await seedReceipt(gitDir, { version: 2, createdAt: "x", entries: [] });

    const read = await readWorktreeReceipt(gitDir);
    expect(read.receipt).toBeNull();
    expect(read.unreadable).toContain("2");
  });

  it("reports a receipt whose entries are not an array as null", async () => {
    const gitDir = getRoot().dir;
    await seedReceipt(gitDir, { version: 1, createdAt: "x", entries: {} });

    const read = await readWorktreeReceipt(gitDir);
    expect(read.receipt).toBeNull();
    expect(read.unreadable).toContain("entries");
  });

  it("drops a malformed row by index and keeps the well-formed one", async () => {
    const gitDir = getRoot().dir;
    const good = receiptEntry();
    await seedReceipt(gitDir, {
      version: 1,
      createdAt: "2026-08-31T10:00:00.000Z",
      engineVersion: "1.4.2",
      worktree: { path: "/farm/feat", branch: "feat", head: "abc1234" },
      entries: [good, { path: ".venv" }],
    });

    const read = await readWorktreeReceipt(gitDir);
    expect(read.unreadable).toBeNull();
    expect(read.receipt?.entries).toEqual([good]);
    expect(read.droppedRows).toHaveLength(1);
    expect(read.droppedRows[0]?.index).toBe(1);
    expect(read.droppedRows[0]?.reason).toContain("strategy");
  });

  it("drops a row whose strategy is not one this lane writes", async () => {
    const gitDir = getRoot().dir;
    await seedReceipt(gitDir, {
      version: 1,
      createdAt: "2026-08-31T10:00:00.000Z",
      engineVersion: "1.4.2",
      worktree: { path: "/farm/feat", branch: "feat", head: "abc1234" },
      entries: [{ path: "node_modules", strategy: "skip" }, receiptEntry()],
    });

    const read = await readWorktreeReceipt(gitDir);
    expect(read.receipt?.entries.map((entry) => entry.path)).toEqual([".env.mcp"]);
    expect(read.droppedRows[0]?.index).toBe(0);
  });
});

describe("worktree receipt — digests (REQ-WORKTREE-006, REQ-WORKTREE-007)", () => {
  it("hashes bytes with sha-256", () => {
    const bytes = "MCP_GITHUB_TOKEN=ghp_example\n";
    expect(sha256Hex(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("hashes the bytes on disk, and answers null for a path that is not a regular file", async () => {
    const root = getRoot();
    const file = join(root.dir, "copied.env");
    await writeFile(file, "token=abc\n", "utf8");

    expect(await digestFile(file)).toBe(sha256Hex("token=abc\n"));
    expect(await digestFile(join(root.dir, "missing.env"))).toBeNull();
    expect(await digestFile(root.dir)).toBeNull();
  });
});

describe("worktree receipt — inversion classification (REQ-WORKTREE-007)", () => {
  const digest = sha256Hex("token=abc");

  it("removes a copy whose bytes are unchanged since it was placed", () => {
    expect(classifyReceiptEntry(receiptEntry({ sha256: digest }), state("file", digest))).toEqual({
      disposition: "remove",
      reason: "digest-match",
    });
  });

  it("keeps a copy the operator edited, and reports it as diverged", () => {
    expect(
      classifyReceiptEntry(receiptEntry({ sha256: digest }), state("file", sha256Hex("token=edited"))),
    ).toEqual({ disposition: "keep", reason: "diverged" });
  });

  it("keeps a copy whose recorded digest is missing, rather than removing it unverified", () => {
    const entry: WorktreeReceiptEntry = { path: ".env.mcp", strategy: "copy" };
    expect(classifyReceiptEntry(entry, state("file", digest))).toEqual({
      disposition: "keep",
      reason: "no-digest",
    });
  });

  it("removes a symlink row while it is still a symbolic link", () => {
    expect(classifyReceiptEntry(receiptEntry({ strategy: "symlink" }), state("symlink"))).toEqual({
      disposition: "remove",
      reason: "still-a-symlink",
    });
  });

  it("keeps a symlink row the user replaced with a real file", () => {
    expect(classifyReceiptEntry(receiptEntry({ strategy: "symlink" }), state("file", digest))).toEqual({
      disposition: "keep",
      reason: "replaced",
    });
  });

  it("keeps a copy row that is now a symlink, so no removal follows a link", () => {
    expect(classifyReceiptEntry(receiptEntry({ sha256: digest }), state("symlink"))).toEqual({
      disposition: "keep",
      reason: "replaced",
    });
  });

  it("keeps a copy row that is now a directory", () => {
    expect(classifyReceiptEntry(receiptEntry({ sha256: digest }), state("directory"))).toEqual({
      disposition: "keep",
      reason: "replaced",
    });
  });

  it.each(["copy", "symlink"] as const)("reports an already-gone %s row as absent", (strategy) => {
    expect(classifyReceiptEntry(receiptEntry({ strategy }), state("absent"))).toEqual({
      disposition: "absent",
      reason: "not-present",
    });
  });
});

describe("worktree receipt — the tree facts classification reads (REQ-WORKTREE-007)", () => {
  it("inspects a regular file as a file, carrying its digest", async () => {
    const root = getRoot();
    const file = join(root.dir, "copied.env");
    await writeFile(file, "token=abc\n", "utf8");

    expect(await inspectEntryState(file)).toEqual({ kind: "file", sha256: sha256Hex("token=abc\n") });
  });

  /**
   * `lstat`, never `stat`: a symlink to a regular file must report as a symlink,
   * or the inversion would remove through the link the classification claims to
   * be inspecting.
   */
  it("inspects a symlink to a file as a symlink, not as the file it points at", async () => {
    const root = getRoot();
    const target = join(root.dir, "target.env");
    const link = join(root.dir, "link.env");
    await writeFile(target, "token=abc\n", "utf8");
    await symlink(target, link);

    expect(await inspectEntryState(link)).toEqual({ kind: "symlink", sha256: null });
  });

  it("inspects a missing path as absent and a directory as a directory", async () => {
    const root = getRoot();
    expect(await inspectEntryState(join(root.dir, "gone"))).toEqual({ kind: "absent", sha256: null });
    expect(await inspectEntryState(root.dir)).toEqual({ kind: "directory", sha256: null });
  });
});

// A receipt row whose `path` climbs out of the worktree (`../..`), is absolute,
// carries a backslash or a control byte, would let cleanup's join+rm delete
// outside the checkout — the main-tree `.env.mcp` deletion breach. The reader
// refuses such a row and drops it, the same posture it has for a malformed row.
describe("parseReceiptEntry refuses a non-contained path [secfix W3/M6]", () => {
  async function readDoc(entries: unknown[]): Promise<Awaited<ReturnType<typeof readWorktreeReceipt>>> {
    const gitDir = join(getRoot().dir, "gd");
    await mkdir(join(gitDir, WORKTREE_RECEIPT_SUBDIR), { recursive: true });
    await writeFile(
      worktreeReceiptPath(gitDir),
      JSON.stringify({
        version: WORKTREE_RECEIPT_VERSION,
        createdAt: "",
        engineVersion: "",
        worktree: { path: "", branch: "", head: "" },
        entries,
      }),
      "utf8",
    );
    return readWorktreeReceipt(gitDir);
  }

  it("drops a `..`-escaping copy row and keeps the good one [secfix]", async () => {
    const read = await readDoc([
      { path: "../../evil", strategy: "copy", sha256: "abc" },
      { path: "ok.env", strategy: "copy", sha256: "def" },
    ]);
    expect(read.receipt?.entries.map((entry) => entry.path)).toEqual(["ok.env"]);
    expect(read.droppedRows).toHaveLength(1);
    expect(read.droppedRows[0]?.index).toBe(0);
  });

  it("drops an absolute path row [secfix]", async () => {
    const read = await readDoc([{ path: "/etc/passwd", strategy: "copy", sha256: "abc" }]);
    expect(read.receipt?.entries).toHaveLength(0);
    expect(read.droppedRows).toHaveLength(1);
  });

  it("drops a backslash path row [secfix]", async () => {
    const read = await readDoc([{ path: "a\\b", strategy: "copy", sha256: "abc" }]);
    expect(read.receipt?.entries).toHaveLength(0);
    expect(read.droppedRows).toHaveLength(1);
  });

  it("drops a control-byte path row [secfix]", async () => {
    const read = await readDoc([{ path: `a${String.fromCharCode(1)}b`, strategy: "copy", sha256: "abc" }]);
    expect(read.receipt?.entries).toHaveLength(0);
    expect(read.droppedRows).toHaveLength(1);
  });
});
