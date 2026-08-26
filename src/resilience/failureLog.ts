import { constants as FS } from "node:fs";
import { lstat, mkdir, open, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  assertWriteTargetContained,
  atomicWriteFileUnlocked,
  isSharedRegularFile,
} from "../merge/atomicWrite.ts";
import { EngineError } from "../types/errors.ts";

/**
 * Failure log: an append-only JSONL audit trail of engine failures, written to
 * the repo's state directory (`.stamity/`) so a run that degraded rather than
 * crashed can still be reconstructed afterwards.
 *
 * JSONL over a structured document for one reason: appending a line is a single
 * syscall that never has to re-read or re-serialize what is already on disk, and
 * a torn tail costs exactly one entry instead of the whole file. The reader is
 * built to match — {@link parseFailureLog} drops what it cannot read and keeps
 * going, because a corrupt audit trail must not take down the command that is
 * writing to it.
 *
 * Size is bounded by rotation, not by a cron: the writer trims oldest-first to
 * the configured byte budget, and {@link MIN_RETAINED_ENTRIES} floors that trim
 * so a tightly-tuned budget can never erase the failure being investigated.
 *
 * ## The append lands where the path says
 *
 * A bare `appendFile` follows a terminal symbolic link and a directory link
 * alike, so a planted `.stamity/failure-log.jsonl -> <outside>/anything` had this
 * module writing engine diagnostics outside the repository — while the rotate
 * branch one line away went through the atomic substrate and was contained the
 * whole time. {@link appendAuditLine} is the append with that gap closed:
 * `assertWriteTargetContained` before the `mkdir -p` that would build the path,
 * an `lstat` refusing a link or a shared name at the file itself, and
 * `O_APPEND | O_NOFOLLOW` as the race-proof backstop on the open.
 *
 * It stays an APPEND rather than becoming a read-modify-write: one syscall per
 * line is why a torn tail costs one entry, and rewriting the whole log per entry
 * would trade that away for containment the flags already give. Exported because
 * the workspace cascade's crash journal (`../workspace/sync.ts`) is the same
 * append-only JSONL trail with the same hole, and one gate for both is what keeps
 * the second one from drifting.
 */

// ── Types ────────────────────────────────────────────────────────

export interface FailureLogEntry {
  /** ISO-8601 timestamp of the failure. */
  timestamp: string;
  /** Engine phase the failure surfaced in (`emit`, `sync`, `pack-install`, …). */
  phase: string;
  /** Agent the phase was acting for, when it had one. */
  agentId?: string;
  /** Error class: `name` for anything error-shaped, `typeof` otherwise. */
  errorType: string;
  /** Error message. Multi-line messages survive: JSON escapes the newlines. */
  message: string;
  /** Diagnostic payload. Must be JSON-serializable — it is stringified verbatim. */
  context?: Record<string, unknown>;
}

/** {@link parseFailureLogDetailed} output: what was read, and what was unreadable. */
export interface FailureLogParse {
  entries: FailureLogEntry[];
  /** Non-empty lines that were not readable entries. */
  skipped: number;
}

/** {@link writeFailureLog} outcome. */
export interface WriteFailureLogResult {
  /** Absolute-or-relative path written, mirroring the `stateDir` given. */
  path: string;
  /** Whether this write also trimmed the log back inside its byte budget. */
  rotated: boolean;
}

// ── Constants ────────────────────────────────────────────────────

/** Log file name inside the state directory. */
export const FAILURE_LOG_FILE = "failure-log.jsonl";

/** Default rotation budget in bytes (512 KiB). */
export const DEFAULT_MAX_LOG_SIZE = 524_288;

/**
 * Retention floor for {@link rotateLog}: never trim below this many entries,
 * even when the byte budget says otherwise. Ten rather than one because the
 * operator reading this file is reconstructing a sequence — the failure that
 * broke the run is rarely the last one recorded.
 */
export const MIN_RETAINED_ENTRIES = 10;

/**
 * Env override for the rotation budget, in bytes. Read at call time, so a test
 * or a long-running process can change it without a restart. Anything that is
 * not a positive decimal integer (empty, `abc`, `1e6`, `-1`, `0`) falls back to
 * {@link DEFAULT_MAX_LOG_SIZE} rather than silently producing a 1-byte budget.
 */
export const FAILURE_LOG_MAX_BYTES_ENV = "STAMITY_FAILURE_LOG_MAX_BYTES";

// ── Budget ───────────────────────────────────────────────────────

/** Active rotation budget in bytes: {@link FAILURE_LOG_MAX_BYTES_ENV} or the default. */
export function getMaxLogSize(): number {
  const raw = process.env[FAILURE_LOG_MAX_BYTES_ENV]?.trim();
  if (raw === undefined || !/^\d+$/.test(raw)) return DEFAULT_MAX_LOG_SIZE;
  const parsed = Number(raw);
  return parsed > 0 && Number.isSafeInteger(parsed) ? parsed : DEFAULT_MAX_LOG_SIZE;
}

// ── Entries ──────────────────────────────────────────────────────

/**
 * Build an entry from a thrown value. `extra` overlays the derived fields, so a
 * caller can attach `agentId`/`context` or pin a timestamp for a replayed run.
 */
export function createFailureLogEntry(
  phase: string,
  error: unknown,
  extra?: Partial<FailureLogEntry>,
): FailureLogEntry {
  return {
    timestamp: new Date().toISOString(),
    phase,
    errorType: errorTypeOf(error),
    message: messageOf(error),
    ...extra,
  };
}

/** Serialize one entry to its JSONL line — no trailing newline. */
export function formatLogEntry(entry: FailureLogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Parse a JSONL log, dropping every line that is not a readable entry: invalid
 * JSON, a non-object, or an object missing a required field. Silent by design
 * (the engine returns data, it does not print), countable by
 * {@link parseFailureLogDetailed} so a caller can tell the operator the trail is
 * damaged.
 *
 * Entries are normalized to the declared shape; unknown keys do not survive a
 * read/write round trip.
 */
export function parseFailureLog(content: string): FailureLogEntry[] {
  return parseFailureLogDetailed(content).entries;
}

/** {@link parseFailureLog} plus the count of unreadable non-empty lines. */
export function parseFailureLogDetailed(content: string): FailureLogParse {
  const entries: FailureLogEntry[] = [];
  let skipped = 0;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    const entry = readEntry(trimmed);
    if (entry === null) skipped += 1;
    else entries.push(entry);
  }

  return { entries, skipped };
}

// ── Rotation ─────────────────────────────────────────────────────

/** Whether `content` is over the active byte budget and needs a trim. */
export function shouldRotateLog(content: string): boolean {
  return Buffer.byteLength(content, "utf8") > getMaxLogSize();
}

/**
 * Trim to the newest entries that fit the active budget, oldest dropped first,
 * order preserved. Unreadable lines are dropped in the process — rotation is
 * the one moment the file is rewritten, so it is also where the damage is
 * reclaimed.
 *
 * {@link MIN_RETAINED_ENTRIES} wins over the budget: with a budget smaller than
 * ten entries' worth of bytes the result is over budget on purpose, because a
 * budget that small would otherwise turn the log into a single-entry ring and
 * lose the sequence the operator came for.
 */
export function rotateLog(content: string): string {
  const lines = parseFailureLog(content).map(formatLogEntry);
  if (lines.length === 0) return "";

  const budget = getMaxLogSize();
  const floor = Math.min(lines.length, MIN_RETAINED_ENTRIES);

  let kept = 0;
  let bytes = 0;
  for (const line of lines.toReversed()) {
    const size = Buffer.byteLength(line, "utf8") + 1; // + newline terminator
    if (kept >= floor && bytes + size > budget) break;
    bytes += size;
    kept += 1;
  }

  return `${lines.slice(lines.length - kept).join("\n")}\n`;
}

// ── Contained append ─────────────────────────────────────────────

/**
 * Open flags for the append. `O_APPEND` puts every write at the current end of
 * file under one kernel-side seek, and `O_NOFOLLOW` refuses a SYMLINK standing
 * at the name — the form that would redirect the line out of the tree. Node
 * leaves `O_NOFOLLOW` undefined on Windows, where it coerces to 0 in this
 * expression exactly as it does in the atomic substrate's own temp-file flags;
 * the `lstat` below is what carries the check on that platform.
 */
const APPEND_FLAGS = FS.O_WRONLY | FS.O_CREAT | FS.O_APPEND | FS.O_NOFOLLOW;

function refuseLinkedAuditTarget(path: string): EngineError {
  return new EngineError(
    `Refusing to append to ${path}: it is a symbolic link, so the line would be written into ` +
      `whatever the link points at — a file outside this tree that this engine was never aimed ` +
      `at. Nothing was written. Remove the link, or replace it with a regular file, and re-run.`,
    { code: "FS_ERROR" },
  );
}

function refuseSharedAuditTarget(path: string): EngineError {
  return new EngineError(
    `Refusing to append to ${path}: it is a hard link — this file shares its contents with ` +
      `another name, which this tree cannot see and which may sit outside it, so the line would ` +
      `be appended to a file that is not this one alone. Nothing was written. Replace it with a ` +
      `regular file — copy the contents to a new file and move that over this name — and re-run.`,
    { code: "FS_ERROR" },
  );
}

/**
 * Refuse an audit-trail target this tree does not own.
 *
 * Containment runs FIRST and before any `mkdir -p`, because the mkdir builds
 * directories on this very path: a directory component that is a link out of the
 * tree has to be caught before it is followed, not after. `boundaryDir` states
 * the tree exactly when the caller knows it; without one the substrate still
 * applies its structural rule (no symlinked component may resolve out of the
 * directory holding it), so omitting it narrows the check rather than disabling
 * it.
 *
 * The `lstat` then covers the file itself, on the two shapes the containment
 * walk does not look at: a terminal symlink, and a hard link, whose only tell is
 * `nlink` and which is read through the one substrate predicate
 * (`../merge/atomicWrite.ts::isSharedRegularFile`) rather than a second spelling
 * of it. An absent file passes — there is nothing there to be redirected yet.
 */
async function assertAuditTarget(path: string, boundaryDir?: string): Promise<void> {
  await assertWriteTargetContained(path, boundaryDir);

  let entry;
  try {
    entry = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (entry.isSymbolicLink()) throw refuseLinkedAuditTarget(path);
  if (isSharedRegularFile(entry)) throw refuseSharedAuditTarget(path);
}

/** The raw append, on a descriptor opened with {@link APPEND_FLAGS}. Callers
 *  gate the path with {@link assertAuditTarget} first. */
async function appendUnfollowed(path: string, text: string): Promise<void> {
  const handle = await open(path, APPEND_FLAGS);
  try {
    await handle.writeFile(text, "utf8");
  } finally {
    await handle.close();
  }
}

/**
 * Append `text` to an append-only audit trail at `path`, creating its parent
 * directory, refusing a path this tree does not own, and never following a link
 * at the file itself. See the module header for why the append stays an append.
 *
 * `boundaryDir` is the tree the file must land inside — pass it whenever the
 * caller knows its root.
 */
export async function appendAuditLine(
  path: string,
  text: string,
  opts: { boundaryDir?: string } = {},
): Promise<void> {
  await assertAuditTarget(path, opts.boundaryDir);
  await mkdir(dirname(path), { recursive: true });
  await appendUnfollowed(path, text);
}

// ── Write ────────────────────────────────────────────────────────

/**
 * Append `entry` to `<stateDir>/failure-log.jsonl`, creating the state directory
 * if it is not there yet and rotating when the append would breach the budget.
 *
 * Rotation rewrites through the shared temp+rename substrate, so a crash mid-trim
 * leaves the previous log intact rather than a half-written one. The *unlocked*
 * variant on purpose: this is the diagnostic path, and taking the cross-process
 * write lock its peers take would let a `LOCK_TIMEOUT` fail the recording of the
 * failure the operator actually cares about. The append path is a single
 * descriptor write for the same reason — atomic enough for a line under the pipe
 * buffer, and a torn tail is already survivable by the reader.
 *
 * {@link assertAuditTarget} runs ahead of both branches and ahead of the `mkdir`,
 * because the read below follows a planted link exactly as the append used to:
 * the rotate branch would then re-publish whatever the link points at into the
 * repository under this name.
 *
 * I/O failures throw a typed `FS_ERROR` instead of being swallowed: the caller
 * owns the decision to degrade (a command should rarely die because its audit
 * trail could not be written), and it cannot make that call on a silent return.
 */
export async function writeFailureLog(
  stateDir: string,
  entry: FailureLogEntry,
): Promise<WriteFailureLogResult> {
  const path = join(stateDir, FAILURE_LOG_FILE);

  try {
    await assertAuditTarget(path);
    await mkdir(stateDir, { recursive: true });

    const existing = await readIfPresent(path);
    // A previous run killed mid-append can leave the tail without its newline;
    // appending straight onto it would fuse two entries into one corrupt line.
    const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
    const addition = `${separator}${formatLogEntry(entry)}\n`;

    if (shouldRotateLog(existing + addition)) {
      await atomicWriteFileUnlocked(path, rotateLog(existing + addition));
      return { path, rotated: true };
    }

    await appendUnfollowed(path, addition);
    return { path, rotated: false };
  } catch (error) {
    throw new EngineError(
      `Could not write the failure log at ${path}: ${messageOf(error)}. ` +
        `Check write permission and free space on ${stateDir}.`,
      { code: "FS_ERROR", cause: error },
    );
  }
}

// ── Internals ────────────────────────────────────────────────────

async function readIfPresent(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

function readEntry(line: string): FailureLogEntry | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const raw = parsed as Record<string, unknown>;

  const timestamp = raw["timestamp"];
  const phase = raw["phase"];
  const errorType = raw["errorType"];
  const message = raw["message"];
  if (
    !isNonEmptyString(timestamp) ||
    !isNonEmptyString(phase) ||
    !isNonEmptyString(errorType) ||
    typeof message !== "string"
  ) {
    return null;
  }

  const entry: FailureLogEntry = { timestamp, phase, errorType, message };
  const agentId = raw["agentId"];
  if (isNonEmptyString(agentId)) entry.agentId = agentId;
  const context = raw["context"];
  if (typeof context === "object" && context !== null && !Array.isArray(context)) {
    entry.context = context as Record<string, unknown>;
  }
  return entry;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/**
 * Structural rather than `instanceof`-based: the values that reach this function
 * include `DOMException` from an abort and errors that crossed a worker
 * boundary, both of which carry `name`/`message` without a local prototype.
 */
function errorTypeOf(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const name = (error as { name?: unknown }).name;
    return isNonEmptyString(name) ? name : "object";
  }
  return error === null ? "null" : typeof error;
}

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  try {
    return String(error);
  } catch {
    // Null-prototype objects have no `toString`; `String()` throws on them.
    return Object.prototype.toString.call(error);
  }
}
