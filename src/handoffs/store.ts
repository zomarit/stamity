import { readFile, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import pLimit from "p-limit";
import {
  composeFrontmatter,
  parseFrontmatter,
  type ParsedFrontmatter,
} from "../content/frontmatter.ts";
import { atomicWriteFile } from "../merge/atomicWrite.ts";
import { VALID_TOOLS, type Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import { STATE_DIR } from "../types/markers.ts";
import {
  isHandoffStatus,
  isValidStatusTransition,
  type Handoff,
  type HandoffFrontmatter,
  type HandoffStatus,
} from "./schema.ts";
import {
  HANDOFF_DEFAULT_EXPIRY_DAYS,
  HANDOFF_ID_PATTERN,
  MAX_ACTIVE_HANDOFFS_PER_REPO,
  MAX_HANDOFF_FILE_BYTES,
  computeHandoffIntegrity,
  generateHandoffId,
  isHandoffExpired,
  validateHandoffContent,
  verifyHandoffIntegrity,
} from "./validation.ts";

/**
 * Handoff store: the filesystem lifecycle of the cross-tool resume artifact.
 *
 * Two directories rather than a status field alone:
 *
 * ```text
 * .stamity/handoffs/<id>.md          live — every handoff still in play
 * .stamity/handoffs/archive/<id>.md  archived — kept for provenance, swept later
 * ```
 *
 * The hot read is the session-start index, and it lists one directory and
 * stops. Keeping finished work in the same directory would make that read scale
 * with the repo's whole history and would leave stale context one glob away
 * from a fresh agent prompt; the split keeps the common path proportional to
 * the work actually in flight.
 *
 * Trust posture: `./validation.ts` owns what a handoff may contain, and this
 * module owns when that gate runs — on the WRITE. A handoff is composed here,
 * validated as a whole document, and only then written, so a body that fails
 * the injection screen never reaches disk and no reader has to re-run the
 * screen to be safe.
 *
 * Reads are deliberately lenient by comparison. {@link readHandoff} returns
 * what is on disk with its declared integrity intact, so a caller can see that
 * a file was edited after it was written instead of having the store hide the
 * evidence by refusing to hand it back. The one place that call is made for the
 * caller is {@link buildHandoffIndex}, whose output is printed straight into a
 * new session: entries that fail integrity, are past their expiry, or are no
 * longer unfinished stay out of it.
 *
 * Failure split, applied uniformly:
 *
 * - A **content** defect — not frontmatter-shaped, missing a required field,
 *   over the file cap — makes a file invisible to the store. Naming such files
 *   with reasons is `validateHandoffsDirectory`'s job; a listing call is not
 *   the place to discover repo defects.
 * - An **environment** failure — permissions, I/O — is a typed `FS_ERROR` that
 *   stops the call. {@link pruneHandoffs} deletes files, and no sweep may act
 *   on a partially readable view of the directory.
 */

// ── Layout ───────────────────────────────────────────────────────

/** Directory under {@link STATE_DIR} holding live handoffs. */
const HANDOFFS_DIR = "handoffs";

/** Subdirectory of {@link HANDOFFS_DIR} holding archived handoffs. */
const ARCHIVE_DIR = "archive";

const HANDOFF_FILE_EXTENSION = ".md";

function liveDir(rootDir: string): string {
  return join(rootDir, STATE_DIR, HANDOFFS_DIR);
}

function archiveDir(rootDir: string): string {
  return join(liveDir(rootDir), ARCHIVE_DIR);
}

// ── Constants ────────────────────────────────────────────────────

/**
 * Days an archived handoff is kept before {@link pruneHandoffs} deletes it,
 * measured from its own `expires` stamp. With the 30-day default expiry that
 * puts a handoff's full lifetime at ~120 days.
 */
export const DEFAULT_ARCHIVE_RETENTION_DAYS = 90;

const MS_PER_DAY = 86_400_000;

/** Statuses that count as unfinished — the active set the cap governs. */
const UNFINISHED_STATUSES: ReadonlySet<HandoffStatus> = new Set<HandoffStatus>([
  "active",
  "in-progress",
]);

/** Concurrent reads. Bounded well under the default descriptor limit. */
const READ_CONCURRENCY = 8;

/** Concurrent mutations in a sweep. Each touches a distinct, separately locked file. */
const MUTATION_CONCURRENCY = 4;

/**
 * Draws {@link writeHandoff} takes before giving up on an unused id. The
 * generator's per-process counter makes consecutive draws distinct by
 * construction, so a second draw only ever collides against a file another
 * process wrote — and a third against two of them.
 */
const ID_DRAW_ATTEMPTS = 3;

// ── Public types ─────────────────────────────────────────────────

/** What {@link buildHandoffIndex} hands the session-start printer. */
export interface HandoffIndex {
  /** Resumable handoffs, soonest expiry first. */
  active: { id: string; summary: string; expires: string; fromTool?: Tool }[];
  /** Entries in {@link HandoffIndex.active}, so the printer need not re-count. */
  count: number;
}

/** {@link listHandoffs} filters. Omitted fields do not narrow. */
export interface ListHandoffsFilter {
  status?: HandoffStatus;
  /** Handoffs addressed to this tool. Unaddressed handoffs (no `toTool`) are excluded. */
  toTool?: Tool;
}

/** {@link writeHandoff} input. Everything the head carries that is not derived. */
export interface WriteHandoffOptions {
  /** Repository root; the store lives under `<rootDir>/.stamity/handoffs`. */
  rootDir: string;
  /** Free text naming the work. Normalized into the id — never rejected. */
  slug: string;
  /** Markdown body carrying the required sections. Stored trimmed, one trailing newline. */
  body: string;
  summary: string;
  fromTool?: Tool;
  toTool?: Tool;
  gitRef?: string;
  /** Clock for `created`, `expires` and the id's date segment. */
  now?: Date;
}

/** {@link pruneHandoffs} outcome. The two lists are always disjoint. */
export interface PruneResult {
  /** Ids moved from live to archive because their expiry had passed. */
  archivedExpired: string[];
  /** Ids deleted from the archive because they were past retention. */
  deleted: string[];
}

// ── Write ────────────────────────────────────────────────────────

/**
 * Compose, validate and write a new handoff, returning its id and path.
 *
 * The order is the contract: the document is assembled with its integrity
 * stamp, run through {@link validateHandoffContent} as the exact bytes that
 * would land on disk, and written only if that passes. A rejected handoff
 * leaves no file — there is no partial-write state to clean up, and nothing
 * half-written for a reader to pick up.
 *
 * The active cap is enforced here rather than merely reported: a repo already
 * holding {@link MAX_ACTIVE_HANDOFFS_PER_REPO} unfinished handoffs is told to
 * archive before it may add another. Beyond that count the set has stopped
 * being a resume aid and become drift that no session can read through.
 *
 * Validation warnings are not returned. This surface is a hard gate, not an
 * advisory channel; `validateHandoffsDirectory` re-reports them against the
 * written file, where an operator can act on them.
 *
 * @throws EngineError `VALIDATION_ERROR` when the composed handoff fails
 * validation, when the active cap is reached, or when no unused id could be
 * drawn.
 */
export async function writeHandoff(
  opts: WriteHandoffOptions,
): Promise<{ id: string; path: string }> {
  const now = opts.now ?? new Date();
  const dir = liveDir(opts.rootDir);
  const live = await loadDirectory(dir);

  const activeCount = live.filter((handoff) =>
    UNFINISHED_STATUSES.has(handoff.frontmatter.status),
  ).length;
  if (activeCount >= MAX_ACTIVE_HANDOFFS_PER_REPO) {
    throw new EngineError(
      `${dir} already holds ${activeCount} unfinished handoffs, the maximum of ` +
        `${MAX_ACTIVE_HANDOFFS_PER_REPO}. Archive the ones that are done before writing another.`,
      { code: "VALIDATION_ERROR" },
    );
  }

  const id = drawId(opts.slug, now, new Set(live.map((handoff) => handoff.frontmatter.id)), dir);
  const body = `${opts.body.trim()}\n`;
  const frontmatter: HandoffFrontmatter = {
    id,
    status: "active",
    created: now.toISOString(),
    expires: new Date(now.getTime() + HANDOFF_DEFAULT_EXPIRY_DAYS * MS_PER_DAY).toISOString(),
    summary: opts.summary,
    ...(opts.fromTool === undefined ? {} : { fromTool: opts.fromTool }),
    ...(opts.toTool === undefined ? {} : { toTool: opts.toTool }),
    ...(opts.gitRef === undefined ? {} : { gitRef: opts.gitRef }),
    integrity: computeHandoffIntegrity(opts.summary, body),
  };

  const path = join(dir, `${id}${HANDOFF_FILE_EXTENSION}`);
  const document = serialize(frontmatter, body);
  const validation = validateHandoffContent(document, path);
  if (!validation.valid) {
    throw new EngineError(
      `Refusing to write the handoff to ${path}:\n${validation.errors.map((line) => `  - ${line}`).join("\n")}`,
      { code: "VALIDATION_ERROR" },
    );
  }

  await atomicWriteFile(path, document);
  return { id, path };
}

/** First generated id not already on disk in the live directory. */
function drawId(slug: string, now: Date, taken: ReadonlySet<string>, dir: string): string {
  for (let attempt = 0; attempt < ID_DRAW_ATTEMPTS; attempt += 1) {
    const id = generateHandoffId(slug, now);
    if (!taken.has(id)) return id;
  }
  throw new EngineError(
    `Could not draw an unused handoff id for ${JSON.stringify(slug)} after ${ID_DRAW_ATTEMPTS} ` +
      `attempts against ${dir}. Re-run; if it repeats, the directory holds an implausible number ` +
      `of same-day handoffs and needs pruning.`,
    { code: "VALIDATION_ERROR" },
  );
}

// ── Read ─────────────────────────────────────────────────────────

/**
 * Read one handoff by id — live first, then the archive — or `null` when no
 * such handoff exists.
 *
 * The id is matched against `HANDOFF_ID_PATTERN` before any path is built, so
 * a caller-supplied id can never address a file outside the store: the grammar
 * admits no separator, no dot segment and no absolute prefix.
 *
 * Integrity is NOT checked here. A tampered handoff comes back intact with its
 * declared hash, and `verifyHandoffIntegrity` tells the caller what that hash
 * is worth — refusing to return the file would leave an operator investigating
 * an edit with nothing to look at.
 */
export async function readHandoff(rootDir: string, id: string): Promise<Handoff | null> {
  if (!HANDOFF_ID_PATTERN.test(id)) return null;
  const file = `${id}${HANDOFF_FILE_EXTENSION}`;
  return (
    (await readHandoffFile(join(liveDir(rootDir), file))) ??
    (await readHandoffFile(join(archiveDir(rootDir), file)))
  );
}

/**
 * Every handoff in the store, live and archived, newest first by `created`.
 *
 * Both directories are scanned regardless of filter, so `status: "archived"`
 * finds what {@link archiveHandoff} moved and an unfiltered call is a complete
 * inventory. A store that has never been written to lists as empty rather than
 * failing — no handoffs is the normal state of most repos.
 */
export async function listHandoffs(
  rootDir: string,
  filter: ListHandoffsFilter = {},
): Promise<Handoff[]> {
  const [live, archived] = await Promise.all([
    loadDirectory(liveDir(rootDir)),
    loadDirectory(archiveDir(rootDir)),
  ]);
  return [...live, ...archived]
    .filter(({ frontmatter }) => filter.status === undefined || frontmatter.status === filter.status)
    .filter(({ frontmatter }) => filter.toTool === undefined || frontmatter.toTool === filter.toTool)
    .toSorted(byNewestFirst);
}

/**
 * The resumable set, shaped for the session-start printer and ordered by how
 * soon each entry goes stale.
 *
 * Three exclusions, all for the same reason — this output is read straight into
 * a new agent's context, and a resume is only as good as what it points at:
 *
 * 1. finished work (`completed`, `archived`, `expired`) is not resumable;
 * 2. anything past its `expires` describes a tree that has moved on;
 * 3. anything failing its integrity check was edited after it was written, and
 *    an unattributed edit is exactly what the stamp exists to catch.
 *
 * The archive is never scanned: an archived handoff is provenance, not context.
 *
 * `opts.now` is the clock the expiry exclusion is measured against, defaulting
 * to the live one — the same seam {@link writeHandoff} and {@link pruneHandoffs}
 * take, and for the same reason. Expiry is the one time-dependent thing this
 * output carries, and the output is read straight into a new agent's context,
 * so a caller that needs a reproducible index (a test, a session-start render
 * pinned to the run's own instant) pins the instant rather than choosing
 * fixture dates far enough out that the ambient clock cannot reach them.
 */
export async function buildHandoffIndex(
  rootDir: string,
  opts: { now?: Date } = {},
): Promise<HandoffIndex> {
  const now = opts.now ?? new Date();
  const live = await loadDirectory(liveDir(rootDir));
  const active = live
    .filter(
      (handoff) =>
        UNFINISHED_STATUSES.has(handoff.frontmatter.status) &&
        !isHandoffExpired(handoff, now) &&
        verifyHandoffIntegrity(handoff),
    )
    .map(toIndexEntry)
    .toSorted(
      (a, b) => compare(timestamp(a.expires), timestamp(b.expires)) || compare(a.id, b.id),
    );
  return { active, count: active.length };
}

/** One printable row. Absent provenance stays absent rather than becoming `undefined`. */
function toIndexEntry({ frontmatter }: Handoff): HandoffIndex["active"][number] {
  const { id, summary, expires, fromTool } = frontmatter;
  if (fromTool === undefined) return { id, summary, expires };
  return { id, summary, expires, fromTool };
}

// ── Archive ──────────────────────────────────────────────────────

/**
 * Move a handoff into the archive and flip its status.
 *
 * The transition is checked against the state machine rather than assumed:
 * `archived` is terminal, so archiving twice is refused instead of silently
 * rewriting a file that is already where it belongs.
 *
 * The move is copy-then-remove, in that order. A crash between the two leaves
 * the handoff visible in both places — recoverable, and re-running the call
 * finishes it — where remove-then-copy would lose it outright.
 *
 * A handoff already sitting in the archive is flipped in place: source and
 * target are the same path, so the removal step is skipped rather than deleting
 * the file that was just written. That state is reachable without a crash —
 * moving a file into `archive/` by hand leaves its status untouched — and the
 * unguarded copy-then-remove would destroy the handoff outright.
 *
 * The body is carried across untouched and the declared integrity is NOT
 * recomputed: archiving is a move, and re-stamping here would launder an edit
 * that the original hash still exposes.
 *
 * @throws EngineError `FS_ERROR` when no handoff carries the id,
 * `VALIDATION_ERROR` when its current status cannot reach `archived`.
 */
export async function archiveHandoff(rootDir: string, id: string): Promise<void> {
  const handoff = await readHandoff(rootDir, id);
  if (handoff === null) {
    throw new EngineError(
      `No handoff ${JSON.stringify(id)} under ${liveDir(rootDir)}. ` +
        `List the store to see the ids it holds.`,
      { code: "FS_ERROR" },
    );
  }
  await archiveLoaded(rootDir, handoff);
}

async function archiveLoaded(rootDir: string, handoff: Handoff): Promise<void> {
  const { frontmatter, body, filePath } = handoff;
  if (!isValidStatusTransition(frontmatter.status, "archived")) {
    throw new EngineError(
      `Handoff ${JSON.stringify(frontmatter.id)} is ${frontmatter.status}, and ` +
        `${frontmatter.status} → archived is not a valid transition. ` +
        `Write a new handoff instead of reopening this one.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  const target = join(archiveDir(rootDir), `${frontmatter.id}${HANDOFF_FILE_EXTENSION}`);
  await atomicWriteFile(target, serialize({ ...frontmatter, status: "archived" }, body));
  if (target === filePath) return;
  await removeFile(filePath, `${target} holds the archived copy; remove ${filePath} by hand`);
}

// ── Prune ────────────────────────────────────────────────────────

/**
 * Sweep the store: archive live handoffs whose expiry has passed, delete
 * archived handoffs past `retentionDays`.
 *
 * Both directories are read before either is written, so one sweep moves a
 * handoff exactly one step — a handoff archived by this call is deleted by a
 * later one, never by the same one. That keeps the two result lists disjoint
 * and makes a dry comparison of consecutive runs meaningful.
 *
 * Retention is measured from the handoff's own `expires` stamp, not from file
 * mtime: mtime does not survive a clone, and a re-cloned repo would drop its
 * whole archive on the next sweep. An unparseable `expires` is never deleted —
 * a malformed timestamp is a defect to fix, not a licence to remove evidence.
 *
 * @throws EngineError `VALIDATION_ERROR` when `retentionDays` is negative or
 * not finite — a destructive sweep does not run on a nonsense budget.
 */
export async function pruneHandoffs(
  rootDir: string,
  opts: { now?: Date; retentionDays?: number } = {},
): Promise<PruneResult> {
  const now = opts.now ?? new Date();
  const retentionDays = opts.retentionDays ?? DEFAULT_ARCHIVE_RETENTION_DAYS;
  if (!Number.isFinite(retentionDays) || retentionDays < 0) {
    throw new EngineError(
      `retentionDays must be a non-negative number of days (got ${JSON.stringify(retentionDays)}).`,
      { code: "VALIDATION_ERROR" },
    );
  }

  const [live, archived] = await Promise.all([
    loadDirectory(liveDir(rootDir)),
    loadDirectory(archiveDir(rootDir)),
  ]);

  const expired = live.filter(
    (handoff) =>
      isHandoffExpired(handoff, now) &&
      isValidStatusTransition(handoff.frontmatter.status, "archived"),
  );
  // An id archived by this sweep is off limits to the delete pass, even when an
  // older archived copy of it is already past retention. Both copies coexist
  // after an interrupted archive, and deleting one in the same call that writes
  // the other would destroy the handoff a step early and report the same id in
  // both lists. It goes on the next sweep instead.
  const archiving = new Set(expired.map((handoff) => handoff.frontmatter.id));
  const cutoff = now.getTime() - retentionDays * MS_PER_DAY;
  const stale = archived.filter((handoff) => {
    if (archiving.has(handoff.frontmatter.id)) return false;
    const expires = timestamp(handoff.frontmatter.expires);
    return expires !== null && expires <= cutoff;
  });

  const limit = pLimit(MUTATION_CONCURRENCY);
  await limit.map(expired, (handoff) => archiveLoaded(rootDir, handoff));
  await limit.map(stale, (handoff) => removeFile(handoff.filePath));

  return {
    archivedExpired: expired.map((handoff) => handoff.frontmatter.id).toSorted(),
    deleted: stale.map((handoff) => handoff.frontmatter.id).toSorted(),
  };
}

// ── Filesystem ───────────────────────────────────────────────────

/** Every readable handoff in `dir`, filename-ordered. Missing directory → empty. */
async function loadDirectory(dir: string): Promise<Handoff[]> {
  const files = await listHandoffFiles(dir);
  const loaded = await pLimit(READ_CONCURRENCY).map(files, (file) =>
    readHandoffFile(join(dir, file)),
  );
  return loaded.filter((handoff): handoff is Handoff => handoff !== null);
}

/** Sorted `.md` entries, so every scan orders the same way on every platform. */
async function listHandoffFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((name) => name.endsWith(HANDOFF_FILE_EXTENSION)).toSorted();
  } catch (cause) {
    if (errnoCode(cause) === "ENOENT") return [];
    throw new EngineError(
      `Cannot read the handoff directory ${dir}: ${describe(cause)}. ` +
        `Check the path and its permissions.`,
      { code: "FS_ERROR", cause },
    );
  }
}

/**
 * One handoff from disk, or `null` when the path holds no readable handoff —
 * absent, not a regular file, over the file cap, or not handoff-shaped. The cap
 * is checked against `stat` so an oversize file is refused on its size alone,
 * before its bytes are pulled into memory.
 */
async function readHandoffFile(path: string): Promise<Handoff | null> {
  let raw: string;
  try {
    const stats = await stat(path);
    if (!stats.isFile() || stats.size > MAX_HANDOFF_FILE_BYTES) return null;
    raw = await readFile(path, "utf8");
  } catch (cause) {
    if (errnoCode(cause) === "ENOENT") return null;
    throw new EngineError(
      `Cannot read the handoff at ${path}: ${describe(cause)}. ` +
        `Check the file and its permissions.`,
      { code: "FS_ERROR", cause },
    );
  }
  return toHandoff(raw, path);
}

/** Delete `path`, tolerating an already-absent file. */
async function removeFile(path: string, remedy?: string): Promise<void> {
  try {
    await unlink(path);
  } catch (cause) {
    if (errnoCode(cause) === "ENOENT") return;
    const next = remedy ?? `Check the file and its permissions`;
    throw new EngineError(`Cannot remove ${path}: ${describe(cause)}. ${next}.`, {
      code: "FS_ERROR",
      cause,
    });
  }
}

// ── Document shape ───────────────────────────────────────────────

/**
 * Render a handoff document. The head is emitted key by key in the schema's own
 * order rather than in whatever order the caller's object was built, so a
 * handoff rewritten by {@link archiveHandoff} produces a one-line status diff
 * instead of a reordered head. Absent optionals drop out.
 */
function serialize(frontmatter: HandoffFrontmatter, body: string): string {
  return composeFrontmatter(
    {
      id: frontmatter.id,
      status: frontmatter.status,
      created: frontmatter.created,
      expires: frontmatter.expires,
      summary: frontmatter.summary,
      fromTool: frontmatter.fromTool,
      toTool: frontmatter.toTool,
      gitRef: frontmatter.gitRef,
      integrity: frontmatter.integrity,
    },
    body,
  );
}

/**
 * Structural read: a document becomes a {@link Handoff} when all six required
 * fields are present and well-typed, and `null` otherwise.
 *
 * This is shape, not trust. Field VALUES — the id grammar, timestamp format,
 * body sections, injection screen, integrity match — are `./validation.ts`'s
 * subject, and re-deciding any of them here would put a second, weaker gate
 * beside the real one.
 */
function toHandoff(raw: string, filePath: string): Handoff | null {
  let parsed: ParsedFrontmatter;
  try {
    parsed = parseFrontmatter(raw, filePath);
  } catch {
    return null;
  }
  if (!parsed.hadFrontmatter) return null;

  const head = parsed.frontmatter;
  const id = readString(head, "id");
  const status = readValue(head, "status");
  const created = readString(head, "created");
  const expires = readString(head, "expires");
  const summary = readString(head, "summary");
  const integrity = readString(head, "integrity");
  if (
    id === undefined ||
    !isHandoffStatus(status) ||
    created === undefined ||
    expires === undefined ||
    summary === undefined ||
    integrity === undefined
  ) {
    return null;
  }

  const fromTool = readTool(head, "fromTool");
  const toTool = readTool(head, "toTool");
  const gitRef = readString(head, "gitRef");
  return {
    frontmatter: {
      id,
      status,
      created,
      expires,
      summary,
      ...(fromTool === undefined ? {} : { fromTool }),
      ...(toTool === undefined ? {} : { toTool }),
      ...(gitRef === undefined ? {} : { gitRef }),
      integrity,
    },
    body: parsed.body,
    filePath,
  };
}

/** Own properties only: frontmatter comes from files the engine did not author. */
function readValue(head: Record<string, unknown>, field: string): unknown {
  return Object.hasOwn(head, field) ? head[field] : undefined;
}

function readString(head: Record<string, unknown>, field: string): string | undefined {
  const value = readValue(head, field);
  return typeof value === "string" ? value : undefined;
}

function readTool(head: Record<string, unknown>, field: string): Tool | undefined {
  const value = readValue(head, field);
  return typeof value === "string" && VALID_TOOLS.has(value) ? (value as Tool) : undefined;
}

// ── Ordering and errors ──────────────────────────────────────────

/** Newest `created` first; ties broken by id so the order is total. */
function byNewestFirst(a: Handoff, b: Handoff): number {
  return (
    compare(timestamp(b.frontmatter.created), timestamp(a.frontmatter.created)) ||
    compare(a.frontmatter.id, b.frontmatter.id)
  );
}

/** Epoch milliseconds, or `null` for an unparseable timestamp. */
function timestamp(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Total order over comparable primitives; `null` sorts first. That places an
 * unreadable timestamp last in the newest-first listing and first in the
 * soonest-expiry index — at both ends, where an operator will see it rather
 * than buried among the readable entries.
 */
function compare(a: number | string | null, b: number | string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
}

function errnoCode(cause: unknown): string | undefined {
  const code = (cause as NodeJS.ErrnoException | null | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
