import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { atomicWriteFile } from "../merge/atomicWrite.ts";

/**
 * The worktree receipt: what `setup` placed, so `cleanup` can invert exactly
 * that and nothing else.
 *
 * **Placement.** `<git-dir-of-the-worktree>/stamity/worktree-receipt.json`,
 * where the git dir is the per-worktree administrative directory rather than
 * the shared common dir. Git never lists, stages or reports a file inside the
 * git directory, so the receipt needs no ignore rule, no exclude block and no
 * protection from `git add -A` — the invariant is delivered by placement rather
 * than by machinery. The lifetime is right for the same reason: `git worktree
 * remove` takes the directory away with the tree, and `git worktree prune`
 * takes it away with an abandoned registration, so a receipt cannot outlive the
 * thing it describes. The git dir arrives as an ARGUMENT: resolving it is a
 * `git rev-parse --git-dir` pass this module deliberately does not own.
 *
 * **The digest is of the bytes WRITTEN**, not of the source as it stands at
 * cleanup time. That answers the question cleanup actually has — did anyone
 * edit this copy since it was placed? — where a comparison against the current
 * source answers a different one, because the source is free to have moved on
 * for reasons that have nothing to do with this worktree.
 *
 * **An unreadable receipt reads as null**, and null is a report, not a throw.
 * A worktree whose receipt is absent, malformed, or of a version this build
 * does not read is left ALONE and named: the receipt is the only teardown
 * authority, so no receipt means no authority to remove anything. Individual
 * malformed rows are a smaller failure and are dropped per row with the index,
 * so one bad row does not cost the inversion of the good ones.
 */

/** The only receipt generation this build reads or writes. */
export const WORKTREE_RECEIPT_VERSION = 1;

/** Directory inside the worktree's git dir that holds this lane's files. */
export const WORKTREE_RECEIPT_SUBDIR = "stamity";

/** Receipt file name inside {@link WORKTREE_RECEIPT_SUBDIR}. */
export const WORKTREE_RECEIPT_FILENAME = "worktree-receipt.json";

/**
 * The strategies a receipt row can carry. `skip` is absent on purpose: a skipped
 * path was never written, so a row for it would hand cleanup authority over a
 * file this lane did not place.
 */
export type ReceiptStrategy = "copy" | "symlink";

/** One materialized path, as recorded at setup time. */
export interface WorktreeReceiptEntry {
  /** Repo-relative POSIX path, the same spelling the policy rule carried. */
  readonly path: string;
  /** What was performed — a symlink that fell back to a copy records `copy`. */
  readonly strategy: ReceiptStrategy;
  /** Octal mode string (`"0600"`), absent where the platform has no POSIX mode. */
  readonly mode?: string;
  /** Digest of the bytes written. Absent for a symlink, which has no bytes. */
  readonly sha256?: string;
}

/** Which checkout this receipt describes. */
export interface WorktreeReceiptTarget {
  readonly path: string;
  readonly branch: string;
  readonly head: string;
}

/** The persisted document. */
export interface WorktreeReceipt {
  readonly version: number;
  readonly createdAt: string;
  readonly engineVersion: string;
  readonly worktree: WorktreeReceiptTarget;
  readonly entries: readonly WorktreeReceiptEntry[];
}

/** One row the reader refused, reported by its index in the written document. */
export interface WorktreeReceiptDroppedRow {
  readonly index: number;
  readonly reason: string;
}

/**
 * The reader's answer. `receipt` is null exactly when there is no teardown
 * authority, and `unreadable` then carries the sentence a report prints.
 */
export interface WorktreeReceiptRead {
  readonly receipt: WorktreeReceipt | null;
  readonly unreadable: string | null;
  readonly droppedRows: readonly WorktreeReceiptDroppedRow[];
}

/** Absolute path of the receipt for a worktree whose git dir is `gitDir`. */
export function worktreeReceiptPath(gitDir: string): string {
  return join(gitDir, WORKTREE_RECEIPT_SUBDIR, WORKTREE_RECEIPT_FILENAME);
}

/** Stamps the current schema generation onto a caller-built document. */
export function createWorktreeReceipt(
  fields: Omit<WorktreeReceipt, "version">,
): WorktreeReceipt {
  return { version: WORKTREE_RECEIPT_VERSION, ...fields };
}

/** Lowercase hex sha-256 over `bytes`. */
export function sha256Hex(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Digest of the bytes at `absPath`, or null when the path is not a regular file
 * — absent, a directory, or a symlink. `lstat` rather than `stat`, so a link is
 * never hashed as the file it points at.
 */
export async function digestFile(absPath: string): Promise<string | null> {
  try {
    const entry = await lstat(absPath);
    if (!entry.isFile()) return null;
    return sha256Hex(await readFile(absPath));
  } catch {
    // Every errno reads the same way here: there are no bytes to digest. The
    // caller's next step is the classification, which treats a missing digest
    // as "do not remove" rather than as a failure of its own.
    return null;
  }
}

/**
 * Writes the receipt through the shared atomic writer, with the git dir as the
 * containment boundary. A receipt that cannot be written is a materialization
 * failure for the caller to report, not a silent degradation — this function
 * lets the write error escape for exactly that reason.
 */
export async function writeWorktreeReceipt(
  gitDir: string,
  receipt: WorktreeReceipt,
): Promise<string> {
  const filePath = worktreeReceiptPath(gitDir);
  await atomicWriteFile(filePath, `${JSON.stringify(receipt, null, 2)}\n`, { boundaryDir: gitDir });
  return filePath;
}

/**
 * Reads the receipt. Never throws for a receipt problem: an absent, unreadable,
 * malformed, or wrong-version document comes back as `{ receipt: null }` with
 * the reason, which is the signal cleanup uses to leave that worktree alone.
 */
export async function readWorktreeReceipt(gitDir: string): Promise<WorktreeReceiptRead> {
  const filePath = worktreeReceiptPath(gitDir);

  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return unreadable(
      code === "ENOENT"
        ? `${filePath}: absent — this worktree carries no receipt.`
        : `${filePath}: could not be read (${code ?? "unknown errno"}).`,
    );
  }

  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    return unreadable(`${filePath}: not valid JSON (${(error as Error).message}).`);
  }
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    return unreadable(`${filePath}: the receipt is not a JSON object.`);
  }

  const record = document as Record<string, unknown>;
  if (record["version"] !== WORKTREE_RECEIPT_VERSION) {
    return unreadable(
      `${filePath}: receipt version ${JSON.stringify(record["version"])} — this build reads ` +
        `version ${WORKTREE_RECEIPT_VERSION} only, so the worktree is left untouched.`,
    );
  }
  const rows = record["entries"];
  if (!Array.isArray(rows)) {
    return unreadable(`${filePath}: \`entries\` is not an array.`);
  }

  const entries: WorktreeReceiptEntry[] = [];
  const droppedRows: WorktreeReceiptDroppedRow[] = [];
  rows.forEach((row, index) => {
    const parsed = parseReceiptEntry(row);
    if (typeof parsed === "string") droppedRows.push({ index, reason: parsed });
    else entries.push(parsed);
  });

  return {
    receipt: {
      version: WORKTREE_RECEIPT_VERSION,
      createdAt: stringOr(record["createdAt"], ""),
      engineVersion: stringOr(record["engineVersion"], ""),
      worktree: parseTarget(record["worktree"]),
      entries,
    },
    unreadable: null,
    droppedRows,
  };
}

function unreadable(reason: string): WorktreeReceiptRead {
  return { receipt: null, unreadable: reason, droppedRows: [] };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function parseTarget(value: unknown): WorktreeReceiptTarget {
  const record = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  return {
    path: stringOr(record["path"], ""),
    branch: stringOr(record["branch"], ""),
    head: stringOr(record["head"], ""),
  };
}

/**
 * Control characters, written as escapes rather than as literals for the reason
 * the policy module states: a literal one makes this source file binary to every
 * tool that reads it.
 */
// oxlint-disable-next-line no-control-regex -- a control character in a receipt path IS the defect
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** A parsed row, or the sentence explaining why the row was dropped. */
function parseReceiptEntry(row: unknown): WorktreeReceiptEntry | string {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return "the row is not an object";
  }
  const record = row as Record<string, unknown>;
  const path = record["path"];
  if (typeof path !== "string" || path === "") return "the row has no `path`";
  // Containment, mirroring `normalizeRulePath` in the policy module: cleanup
  // joins this path onto the worktree root and `rm`s it, so a `..`-escaping,
  // absolute, backslashed, or control-charactered path would let a hand-edited
  // receipt delete OUTSIDE the checkout — the main-tree `.env.mcp` deletion
  // breach. A row that fails is DROPPED and reported, the same posture a
  // malformed row already has, so one bad row never costs the good ones.
  if (path.includes("\\")) return "the row's `path` carries a backslash";
  if (isAbsolute(path) || path.startsWith("/")) return "the row's `path` is absolute";
  if (CONTROL_CHARACTERS.test(path)) return "the row's `path` carries a control character";
  for (const segment of path.split("/")) {
    if (segment === "." || segment === "..") {
      return `the row's \`path\` carries the segment ${JSON.stringify(segment)}, which escapes the worktree`;
    }
  }
  const strategy = record["strategy"];
  if (strategy !== "copy" && strategy !== "symlink") {
    return `the row's \`strategy\` is ${JSON.stringify(strategy)}, not \`copy\` or \`symlink\``;
  }
  const mode = record["mode"];
  const sha256 = record["sha256"];
  return {
    path,
    strategy,
    ...(typeof mode === "string" ? { mode } : {}),
    ...(typeof sha256 === "string" ? { sha256 } : {}),
  };
}

/** What a path looks like right now. `lstat` kinds, never followed. */
export type EntryKind = "absent" | "file" | "symlink" | "directory" | "other";

/** The current-tree facts one classification reads. */
export interface EntryState {
  readonly kind: EntryKind;
  /** Digest of the bytes, when the path is a regular file. */
  readonly sha256: string | null;
}

/** What cleanup should do with one row. `absent` is a no-op, not a failure. */
export type ReceiptEntryDisposition = "remove" | "keep" | "absent";

/** Why {@link classifyReceiptEntry} answered as it did. Reported verbatim. */
export type ReceiptEntryReason =
  | "digest-match"
  | "diverged"
  | "not-present"
  | "still-a-symlink"
  | "replaced"
  | "no-digest";

/** One row's verdict. */
export interface ReceiptEntryVerdict {
  readonly disposition: ReceiptEntryDisposition;
  readonly reason: ReceiptEntryReason;
}

/**
 * Classifies one receipt row against the current tree. Pure: the caller reads
 * the tree (see {@link inspectEntryState}) and applies the verdict.
 *
 * The gate is what keeps inversion from becoming destruction. A copy is removed
 * only when its bytes are the bytes that were placed; anything else — an edit,
 * a replacement by a link or a directory, a row with no recorded digest — is
 * KEPT and reported. The conservative half costs a file left behind under
 * `--files-only` and nothing at all under a full cleanup, which removes the
 * directory anyway; the other direction destroys the only copy of bytes an
 * operator typed.
 */
export function classifyReceiptEntry(
  entry: WorktreeReceiptEntry,
  state: EntryState,
): ReceiptEntryVerdict {
  if (state.kind === "absent") return { disposition: "absent", reason: "not-present" };

  if (entry.strategy === "symlink") {
    return state.kind === "symlink"
      ? { disposition: "remove", reason: "still-a-symlink" }
      : { disposition: "keep", reason: "replaced" };
  }

  if (state.kind !== "file") return { disposition: "keep", reason: "replaced" };
  if (entry.sha256 === undefined) return { disposition: "keep", reason: "no-digest" };
  return entry.sha256 === state.sha256
    ? { disposition: "remove", reason: "digest-match" }
    : { disposition: "keep", reason: "diverged" };
}

/**
 * Reads the current-tree facts for one path. `lstat`, never `stat`: a symlink
 * standing where a copy was placed must classify as a replacement rather than
 * as the file it points at.
 */
export async function inspectEntryState(absPath: string): Promise<EntryState> {
  let entry;
  try {
    entry = await lstat(absPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "absent", sha256: null };
    throw error;
  }
  if (entry.isSymbolicLink()) return { kind: "symlink", sha256: null };
  if (entry.isDirectory()) return { kind: "directory", sha256: null };
  if (!entry.isFile()) return { kind: "other", sha256: null };
  return { kind: "file", sha256: await digestFile(absPath) };
}
