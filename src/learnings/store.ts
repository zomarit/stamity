import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import pLimit from "p-limit";
import {
  composeFrontmatter,
  frontmatterField,
  parseFrontmatter,
  type ParsedFrontmatter,
} from "../content/frontmatter.ts";
import {
  INVISIBLE_SMUGGLING_CHARS,
  normalizeForDenyScan,
  scanForDeniedPatterns,
  scanNormalized,
} from "../denyscan/denyScan.ts";
import { atomicWriteFile } from "../merge/atomicWrite.ts";
import { UNICODE_TAG_CHARS, UNPRINTABLE_CHARS } from "../runs/layout.ts";
import { EngineError } from "../types/errors.ts";
import { STATE_DIR } from "../types/markers.ts";
import {
  computeLearningIntegrity,
  LEARNINGS_SCREEN_PATTERNS,
  MAX_LEARNING_FILE_BYTES,
  MAX_LEARNING_SUMMARY_LENGTH,
  orderingDay,
  resolveLearningsCaps,
  reviewDueSoon,
  sanitizeLearningsContent,
  validateLearningContent,
  verifyLearningIntegrity,
  type ResolvedLearningsCaps,
} from "./validation.ts";

/**
 * The learnings store: the write half over the gates in `./validation.ts`, and
 * the session-start read half that decides what re-enters agent context.
 *
 * The two halves judge the same file differently, on purpose. Writing is an
 * author committing a note they just verified, so a passed review horizon is an
 * advisory and the file lands. Reading hands text to a model with no human in
 * the loop, so the same passed horizon is a skip — nobody re-verified the claim,
 * and the digest in the head vouches for the bytes, not for the finding. Reading
 * also refuses per file: one poisoned learning never costs the session the other
 * forty.
 *
 * The store owns the location as well as the gates: `<rootDir>/.stamity/
 * learnings/<slug>.md`. Callers pass a repo root and a bare file name, never a
 * path, and the name clears the kebab-slug gate before it is joined to anything
 * — no caller is in a position to spell a traversal.
 *
 * Failures split by kind. Content defects come back in the result (`errors`,
 * `skips`), so one pass reports all of them; environment failures — a directory
 * that exists but cannot be listed, a write that cannot land — throw a typed
 * `EngineError`. Reading is side-effect free: a repo with no learnings directory
 * loads empty, and nothing is created to discover that.
 */

/**
 * Default context budget for one session-start load, set equal to the per-file
 * cap: everything inlined at session start together costs no more than a single
 * max-size learning. Curated learnings run 1-2 KB, so this admits roughly forty.
 */
export const DEFAULT_MAX_TOTAL_LEARNINGS_BYTES = MAX_LEARNING_FILE_BYTES;

/** Bounded read fan-out — a learnings directory is small by design, not by guarantee. */
const READ_CONCURRENCY = 8;

const INTEGRITY_FIELD = "integrity";
const REVIEW_BY_FIELD = "reviewBy";

/** `<rootDir>/.stamity/learnings` — the one directory learnings live in. */
function learningsDir(rootDir: string): string {
  return join(rootDir, STATE_DIR, "learnings");
}

// ── Write ────────────────────────────────────────────────────────

export interface PersistLearningOptions {
  /** Repo root; the file lands under `<rootDir>/.stamity/learnings/`. */
  rootDir: string;
  /** Bare kebab-case `.md` name — validated before it is joined to a path. */
  fileName: string;
  /** The whole document: `---` fenced head plus markdown body. */
  content: string;
  /** Capacity for this directory. Defaults to {@link resolveLearningsCaps}(). */
  caps?: ResolvedLearningsCaps;
  /** Clock for the review-horizon check. Defaults to now. */
  now?: Date;
}

export interface LearningPersistResult {
  written: boolean;
  /** Absolute path of the written file; present only when `written`. */
  path?: string;
  /** Why the write was refused. Empty exactly when `written`. */
  errors: string[];
  /** True when neutralization rewrote the content before it was stamped. */
  sanitized: boolean;
}

/**
 * Validate, neutralize, stamp and write one learning.
 *
 * The order is the contract:
 *
 * 1. **Gates.** `validateLearningContent` runs the four write gates (name,
 *    caps and encoding, content and injection screen, declared integrity). A
 *    hostile or malformed document is refused here, before any filesystem call.
 * 2. **Directory capacity.** One listing answers both remaining questions: the
 *    file count against `caps.maxCount`, and whether this name is already
 *    taken. Learnings are append-only — a persist never overwrites a curated
 *    file, so the caller picks a new slug or retires the old note.
 * 3. **Sanitize, then stamp.** Neutralization runs after the gates, where the
 *    only material left to remove is advisory (invisible characters, warn-tier
 *    spans). The digest is computed over the body that survives that pass, so
 *    what lands on disk is what the hash covers.
 * 4. **Self-check.** The stamped document goes back through the gate it will
 *    face on read. A composed file that fails is refused rather than written.
 * 5. **Atomic write.** Temp file plus rename under the path's write lock; the
 *    parent directory is created if it does not exist yet.
 *
 * Advisories are dropped: the result is a write verdict. A caller that wants the
 * warnings (missing `reviewBy`, missing `validatedAgainst`) runs
 * `validateLearningContent` directly and reports them itself.
 *
 * Content defects come back in `errors`. Filesystem failures throw a typed
 * `EngineError` — an unwritable repo is an environment problem, not a defect in
 * the note.
 */
export async function persistLearning(opts: PersistLearningOptions): Promise<LearningPersistResult> {
  const caps = opts.caps ?? resolveLearningsCaps();
  const now = opts.now ?? new Date();
  const dir = learningsDir(opts.rootDir);

  const gates = validateLearningContent(opts.fileName, opts.content, {
    maxFileBytes: caps.maxFileBytes,
    now,
  });
  if (!gates.valid) return refused(gates.errors, false);

  const existing = await listLearningFileNames(dir);
  if (existing.includes(opts.fileName)) {
    return refused(
      [
        `Learning "${opts.fileName}" already exists in ${dir}. Learnings are append-only: ` +
          `retire that file or write this note under a different slug.`,
      ],
      false,
    );
  }
  if (existing.length >= caps.maxCount) {
    return refused(
      [
        `The learnings directory ${dir} holds ${existing.length} files, at the ` +
          `${caps.maxCount} file cap. Retire or consolidate a learning before adding ` +
          `"${opts.fileName}".`,
      ],
      false,
    );
  }

  const sanitization = sanitizeLearningsContent(opts.content);
  if (sanitization.content.trim() === "") {
    // The sanitizer drops content it cannot neutralize to a fixed point rather
    // than returning it half-cleaned; an empty result is that refusal reaching us.
    return refused(
      [
        `Learning "${opts.fileName}" could not be neutralized — the sanitizer dropped it ` +
          `(patterns: ${sanitization.strippedPatternIds.join(", ") || "none reported"}). ` +
          `Rewrite the note without the flagged spans.`,
      ],
      true,
    );
  }

  let parsed: ParsedFrontmatter;
  try {
    parsed = parseFrontmatter(sanitization.content, `Learning "${opts.fileName}"`);
  } catch (error) {
    return refused([messageOf(error)], sanitization.modified);
  }

  const stamped = composeFrontmatter(
    { ...parsed.frontmatter, [INTEGRITY_FIELD]: computeLearningIntegrity(parsed.body) },
    parsed.body,
  );

  const recheck = validateLearningContent(opts.fileName, stamped, {
    maxFileBytes: caps.maxFileBytes,
    now,
  });
  if (!recheck.valid) {
    return refused(
      recheck.errors.map((error) => `Stamped form — ${error}`),
      sanitization.modified,
    );
  }

  const path = join(dir, opts.fileName);
  await atomicWriteFile(path, stamped);
  return { written: true, path, errors: [], sanitized: sanitization.modified };
}

function refused(errors: string[], sanitized: boolean): LearningPersistResult {
  return { written: false, errors, sanitized };
}

// ── Read ─────────────────────────────────────────────────────────

/** A learning that cleared every read gate, with its head and body already split. */
export interface LoadedLearning {
  fileName: string;
  frontmatter: Record<string, unknown>;
  body: string;
  /** Literal `true`: an unverified learning is never constructed. */
  integrityOk: true;
}

/**
 * Why a file did not join the loaded set.
 *
 * - `invalid-frontmatter` — the file did not resolve to a learning at all:
 *   unreadable, no fenced head, malformed YAML, a schema or body-section defect,
 *   or a file name that is not a bare kebab slug.
 * - `integrity-mismatch` — the declared digest does not match the body, or there
 *   is no digest. Both are the same trust failure: nothing vouches for the bytes.
 * - `injection-detected` — a block-severity screen hit.
 * - `over-size` — past the per-file cap, or past the caller's total budget.
 * - `expired-review` — `reviewBy` has passed, so the claim is unverified. The
 *   write gate only warns about this; the read gate refuses.
 */
export type LoaderSkipReason =
  | "invalid-frontmatter"
  | "integrity-mismatch"
  | "injection-detected"
  | "over-size"
  | "expired-review";

export interface LoaderSkip {
  fileName: string;
  reason: LoaderSkipReason;
  /**
   * Operator-facing explanation. For `injection-detected` it names pattern ids
   * and never quotes the matched span — echoing an attack back into a
   * session-start banner would deliver exactly the payload the skip refused.
   */
  detail: string;
  /**
   * The block-severity pattern ids an `injection-detected` skip rests on, sorted
   * and unique — the same ids `detail` names, as data, so a reader that must not
   * see `detail` (`stamity learn read`) can still say which rows fired. Absent on
   * every other reason: a review horizon or a digest is not a screen hit.
   */
  patternIds?: string[];
}

export interface LoaderResult {
  /** Newest declared `date` first, name-ascending on the same day. */
  learnings: LoadedLearning[];
  /** Every refusal, in the same order the files were examined. */
  skips: LoaderSkip[];
  /** Bytes of the loaded files — what the set costs to inline. */
  totalBytes: number;
}

export interface LoadValidatedLearningsOptions {
  rootDir: string;
  /** Context budget; defaults to {@link DEFAULT_MAX_TOTAL_LEARNINGS_BYTES}. */
  maxTotalBytes?: number;
  /** Clock for the review-horizon check. Defaults to now. */
  now?: Date;
  /**
   * The read verb's two added screens, off by default so the session-start
   * banner and {@link formatLearningsIndex} stay line-for-line twins. On, each
   * field the index prints is screened again as its YAML-decoded value — the
   * raw screen reads `\u…` escapes as literal ASCII, and the parser decodes
   * them after it — and a hit skips the file `injection-detected` under its
   * pattern ids, before the budget is charged. What the verb prints is then
   * stripped of the unprintable set ({@link printableText}) and screened again
   * in that printed form, since a strip can join or space a row's words: each
   * printed field, which the loaded learning carries stripped, and the body as
   * {@link printableBody} gives it. Every skip's file name passes the same
   * screen, raw and stripped; a name that hits prints as a withheld placeholder
   * naming the pattern ids.
   */
  screenPrinted?: boolean;
}

/** The fields the index prints from a learning's head — what the decoded screen reads. */
const PRINTED_FIELDS = ["id", "confidence", "summary", REVIEW_BY_FIELD] as const;

/**
 * Read every learning cleared for this session.
 *
 * Files are examined newest first by their declared `date` — a learning written
 * today outranks one from six months ago when the budget runs out. The date is
 * read from each file's head before the sort (`orderingDay`, the key the
 * directory validator orders by), because mtime does not survive a clone; a
 * file with no readable date, or one past the per-file cap that is never read,
 * falls back to its mtime as a calendar day. Each file is checked in the order
 * that keeps a refusal attributable: size before read (an oversized file is
 * never loaded into memory to be rejected), injection screen before schema (so
 * a poisoned file reports as poisoned rather than as malformed), integrity
 * before schema (the write gate screens for both, so the narrower verdict has
 * to come first to be reachable), then schema, then the review horizon.
 *
 * The `maxTotalBytes` budget is applied last, over the survivors in that same
 * order. The first file that does not fit ends the set: it and everything older
 * are skipped `over-size`, so the cut is a function of the corpus and the budget
 * rather than of which read finished first.
 *
 * A missing directory is a clean state — empty result, nothing created. A
 * directory that exists and cannot be listed is an environment failure and
 * throws `FS_ERROR`; a single file that cannot be read is one skip, not a
 * failed load.
 */
export async function loadValidatedLearnings(
  opts: LoadValidatedLearningsOptions,
): Promise<LoaderResult> {
  const dir = learningsDir(opts.rootDir);
  const now = opts.now ?? new Date();
  const budget = opts.maxTotalBytes ?? DEFAULT_MAX_TOTAL_LEARNINGS_BYTES;

  const candidates = await listCandidates(dir);
  const examined = await pLimit(READ_CONCURRENCY).map(candidates, (candidate) =>
    examine(dir, candidate, now, opts.screenPrinted === true),
  );

  const learnings: LoadedLearning[] = [];
  const skips: LoaderSkip[] = [];
  let totalBytes = 0;
  let exhausted = false;

  for (const result of examined) {
    if (!result.ok) {
      skips.push(result.skip);
      continue;
    }
    if (exhausted || totalBytes + result.bytes > budget) {
      // Everything after the first overflow is skipped too, even if a smaller
      // file further down would still fit: a budget that backfills makes the
      // loaded set depend on file sizes in a way no operator can predict.
      exhausted = true;
      skips.push({
        fileName: result.learning.fileName,
        reason: "over-size",
        detail:
          `${result.bytes} bytes would pass the ${budget} byte session budget ` +
          `(${totalBytes} bytes already loaded).`,
      });
      continue;
    }
    totalBytes += result.bytes;
    learnings.push(result.learning);
  }

  if (opts.screenPrinted === true) {
    const printable = skips.map((entry) => ({ ...entry, fileName: printedName(entry.fileName) }));
    return { learnings, skips: printable, totalBytes };
  }
  return { learnings, skips, totalBytes };
}

interface Candidate {
  fileName: string;
  /** Ordering key: the declared `date`, else the mtime as a calendar day. */
  day: string;
  /** `null` when the entry could not be stat'd between the listing and now. */
  size: number | null;
}

type Examined =
  | { ok: false; skip: LoaderSkip }
  | { ok: true; learning: LoadedLearning; bytes: number };

/**
 * Newest declared day first, name-ascending on the same day so the order is a
 * function of the corpus. A file past the per-file cap is keyed by its mtime:
 * it is refused unread, here as in the session-start hook, so neither twin opens
 * it just to sort a skip line.
 */
async function listCandidates(dir: string): Promise<Candidate[]> {
  const names = await listLearningFileNames(dir);
  const stamped = await pLimit(READ_CONCURRENCY).map(names, async (fileName): Promise<Candidate> => {
    try {
      const stats = await stat(join(dir, fileName));
      const day =
        stats.size > MAX_LEARNING_FILE_BYTES ? calendarDay(stats.mtimeMs) : await orderingDay(dir, fileName);
      return { fileName, day, size: stats.size };
    } catch {
      return { fileName, day: calendarDay(0), size: null };
    }
  });
  stamped.sort(
    (a, b) =>
      (a.day < b.day ? 1 : a.day > b.day ? -1 : 0) ||
      (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0),
  );
  return stamped;
}

function calendarDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

async function examine(dir: string, candidate: Candidate, now: Date, screenPrinted: boolean): Promise<Examined> {
  const { fileName } = candidate;
  const path = join(dir, fileName);

  if (candidate.size === null) {
    return skip(fileName, "invalid-frontmatter", `${path} could not be read.`);
  }
  if (candidate.size > MAX_LEARNING_FILE_BYTES) {
    return skip(
      fileName,
      "over-size",
      `${candidate.size} bytes, over the ${MAX_LEARNING_FILE_BYTES} byte per-file cap.`,
    );
  }

  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    return skip(fileName, "invalid-frontmatter", `${path} could not be read: ${messageOf(error)}`);
  }

  // Screened exactly as the write gate screens — same catalog composition
  // (imported from `./validation.ts`, not restated here), same invisible strip,
  // same raw ∪ folded-and-joined union — so a file refused at write is refused
  // on read under the SAME pattern id. When the two compositions differed the
  // file still failed to load, but as `invalid-frontmatter` from the schema gate
  // below, which reads as a malformed note rather than as the poisoning it is.
  const ids = blockedPatternIds(raw);
  if (ids.length > 0) return injectionSkip(fileName, ids, "");

  const source = `Learning "${fileName}"`;
  let parsed: ParsedFrontmatter;
  try {
    parsed = parseFrontmatter(raw, source);
  } catch (error) {
    return skip(fileName, "invalid-frontmatter", messageOf(error));
  }
  if (!parsed.hadFrontmatter) {
    // Asked before the digest: a file with no head is not a learning missing its
    // stamp, it is a markdown file that landed in the directory.
    return skip(fileName, "invalid-frontmatter", `${source} has no \`---\` frontmatter block.`);
  }
  let frontmatter = parsed.frontmatter;
  if (screenPrinted) {
    // The values as printed, after the parser decoded every escape the raw
    // screen above read as literal ASCII, then stripped of what a terminal
    // would run: each screened decoded and again stripped. Each field alone, so
    // no hit is made of two fields the index prints apart.
    const shown: Record<string, unknown> = { ...frontmatter };
    const decoded: string[] = [];
    for (const field of PRINTED_FIELDS) {
      const value = fieldText(frontmatter, field);
      if (value === undefined) continue;
      const printed = printableText(value);
      if (typeof frontmatter[field] === "string") shown[field] = printed;
      decoded.push(...blockedPatternIds(value), ...blockedPatternIds(printed));
    }
    if (decoded.length > 0) return injectionSkip(fileName, [...new Set(decoded)].toSorted(), "decoded head field ");
    const body = blockedPatternIds(printableBody(parsed.body).text);
    if (body.length > 0) return injectionSkip(fileName, body, "printed body ");
    frontmatter = shown;
  }

  // Integrity before schema: the digest answers whether these are the bytes that
  // were written, and that verdict is more informative than a schema defect in
  // bytes nothing vouches for. It also has to run first to be reachable — the
  // write gate carries its own integrity check, so a mismatch reported later
  // would arrive labelled as a content defect.
  const declared = frontmatterField(parsed, INTEGRITY_FIELD);
  if (declared === undefined) {
    return skip(
      fileName,
      "integrity-mismatch",
      `no \`${INTEGRITY_FIELD}\` digest. Re-save the learning through the write path to stamp one.`,
    );
  }
  if (!verifyLearningIntegrity(declared, parsed.body)) {
    return skip(
      fileName,
      "integrity-mismatch",
      `declared ${String(declared)}, computed ${computeLearningIntegrity(parsed.body)}. ` +
        `The body changed after it was stamped.`,
    );
  }

  const gates = validateLearningContent(fileName, raw, { now });
  if (!gates.valid) return skip(fileName, "invalid-frontmatter", gates.errors.join(" "));

  const expired = expiredReview(parsed, now);
  if (expired !== null) {
    return skip(
      fileName,
      "expired-review",
      `\`${REVIEW_BY_FIELD}\` ${expired} has passed. Re-verify the learning and move the date, ` +
        `or retire it.`,
    );
  }

  return {
    ok: true,
    bytes: candidate.size,
    learning: {
      fileName,
      frontmatter,
      body: parsed.body,
      integrityOk: true,
    },
  };
}

function skip(fileName: string, reason: LoaderSkipReason, detail: string): Examined {
  return { ok: false, skip: { fileName, reason, detail } };
}

/** The block-severity ids `text` matches, sorted and unique, under the write gate's screen (see `examine`). */
function blockedPatternIds(text: string): string[] {
  const blocked = scanNormalized(text.replace(INVISIBLE_SMUGGLING_CHARS, ""), LEARNINGS_SCREEN_PATTERNS).filter(
    (hit) => hit.severity === "block",
  );
  return [...new Set(blocked.map((hit) => hit.patternId))].toSorted();
}

/** An `injection-detected` skip naming its ids, never the span; `where` prefixes the detail. */
function injectionSkip(fileName: string, ids: string[], where: string): Examined {
  return {
    ok: false,
    skip: {
      fileName,
      reason: "injection-detected",
      detail: `${where}matches injection ${ids.length === 1 ? "pattern" : "patterns"} ${ids.join(", ")}.`,
      patternIds: ids,
    },
  };
}

/** The declared review date when it has passed, else `null`. */
function expiredReview(parsed: ParsedFrontmatter, now: Date): string | null {
  const reviewBy = frontmatterField(parsed, REVIEW_BY_FIELD);
  if (typeof reviewBy !== "string") return null;
  const deadline = Date.parse(`${reviewBy}T23:59:59.999Z`);
  return Number.isNaN(deadline) || deadline >= now.getTime() ? null : reviewBy;
}

// ── Index ────────────────────────────────────────────────────────

/** Options for {@link formatLearningsIndex}. */
export interface FormatLearningsIndexOptions {
  /** Clock for the review-due mark. Defaults to now. */
  now?: Date;
  /**
   * Append each injection skip's pattern ids to its line, as
   * ` (patterns: a, b)`. Off by default, so the session-start banner and this
   * index stay line-for-line twins; `stamity learn read` turns it on, because a
   * reader with no hook has no other way to learn which rows fired.
   */
  patternIds?: boolean;
}

/** One loaded learning as the index names it: no body, no other head field. */
export interface LearningIndexEntry {
  id: string;
  fileName: string;
  confidence: string;
  summary: string;
}

/** One skip as the index names it: the reason and the pattern ids, never `detail`. */
export interface LearningSkipEntry {
  fileName: string;
  reason: LoaderSkipReason;
  patternIds: string[];
}

/**
 * The index's fields as data — what {@link formatLearningsIndex} prints, before
 * it is joined into lines. A skip's file name is flattened to one bounded line
 * here, as the session-start hook flattens it: the name is attacker-chosen on
 * any file that reached the directory, and no gate reads it. A skip's `detail`
 * is left out, as the formatter leaves it out.
 */
export function learningsIndexEntries(result: LoaderResult): {
  learnings: LearningIndexEntry[];
  skips: LearningSkipEntry[];
} {
  return {
    learnings: result.learnings.map((learning) => ({
      id: indexId(learning),
      fileName: learning.fileName,
      confidence: fieldText(learning.frontmatter, "confidence") ?? "unrated",
      summary: fieldText(learning.frontmatter, "summary") ?? "(no summary)",
    })),
    skips: result.skips.map((entry) => ({
      fileName: lineSafe(entry.fileName),
      reason: entry.reason,
      patternIds: [...(entry.patternIds ?? [])],
    })),
  };
}

/**
 * Render the session-start index: a count line, one line per loaded learning
 * (confidence, id, summary, file), one line per skip.
 *
 * The count line carries two byte figures: the bytes of the index lines printed
 * under it — what this index costs to inline, which is what an operator reading
 * the banner is judging — and, beside it, the loaded files' bytes on disk. The
 * session-start hook prints the same shape; past its line cap it prints fewer
 * lines than this full index, and each figure counts its own printed lines.
 *
 * A learning whose `reviewBy` falls inside the warning window
 * (`REVIEW_WARNING_DAYS`) is marked `[review due <date>]`, so the re-verify
 * lands before the read gate starts skipping the file.
 *
 * Bodies never appear here, and neither does a skip's `detail`. This string is
 * written into a model's opening context, so it carries the parts a reader needs
 * to decide what to open — never the text a gate just refused. Deterministic for
 * a given result and clock: the order is the loader's, which is the corpus order.
 *
 * A repeated `id` across two files is flagged rather than collapsed. The file is
 * the unit of the corpus, so both load; the flag is what tells the operator two
 * notes are claiming one name.
 */
export function formatLearningsIndex(result: LoaderResult, opts: FormatLearningsIndexOptions = {}): string {
  const now = opts.now ?? new Date();
  const lines: string[] = [];
  const entries = learningsIndexEntries(result);

  const duplicates = duplicateIds(result.learnings);
  for (const [index, learning] of result.learnings.entries()) {
    const { id, confidence, summary } = entries.learnings[index]!;
    const flag = duplicates.has(id) ? " [duplicate id]" : "";
    const reviewBy = fieldText(learning.frontmatter, REVIEW_BY_FIELD);
    const due = reviewBy !== undefined && reviewDueSoon(reviewBy, now) ? ` [review due ${reviewBy}]` : "";
    lines.push(`- [${confidence}] ${id} — ${summary} (${learning.fileName})${flag}${due}`);
  }

  for (const entry of entries.skips) {
    const named = opts.patternIds === true && entry.patternIds.length > 0;
    const ids = named ? ` (patterns: ${entry.patternIds.join(", ")})` : "";
    lines.push(`- skipped ${entry.fileName}: ${entry.reason}${ids}`);
  }

  const header =
    `Learnings: ${result.learnings.length} loaded, ${result.skips.length} skipped, ` +
    `${Buffer.byteLength(lines.join("\n"), "utf8")} bytes in this index (${result.totalBytes} bytes on disk).`;
  return [header, ...lines].join("\n");
}

function duplicateIds(learnings: readonly LoadedLearning[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const learning of learnings) {
    const id = indexId(learning);
    if (seen.has(id)) duplicates.add(id);
    else seen.add(id);
  }
  return duplicates;
}

/** Declared id, falling back to the file stem so an index line is never anonymous. */
function indexId(learning: LoadedLearning): string {
  return fieldText(learning.frontmatter, "id") ?? learning.fileName.replace(/\.md$/, "");
}

/**
 * One frontmatter value as a single index-safe line. Whitespace collapses, so a
 * folded YAML summary cannot break the one-line-per-learning shape, and a
 * non-scalar value reads as absent rather than as `[object Object]`.
 */
function fieldText(frontmatter: Record<string, unknown>, field: string): string | undefined {
  const value = Object.hasOwn(frontmatter, field) ? frontmatter[field] : undefined;
  if (typeof value === "string") {
    const collapsed = value.replace(/\s+/g, " ").trim();
    return collapsed === "" ? undefined : collapsed;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

/**
 * A file name as one bounded, control-character-free line — the session-start
 * hook's own `text()` rule (`../hooks/scripts.ts`), so the two twins print the
 * same skip line for the same hostile name.
 */
function lineSafe(name: string): string {
  // oxlint-disable-next-line no-control-regex -- the control range IS the subject: it is what a name must not carry.
  const flat = name.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (flat === "") return "(unnamed file)";
  return flat.length > MAX_LEARNING_SUMMARY_LENGTH ? `${flat.slice(0, MAX_LEARNING_SUMMARY_LENGTH - 1)}…` : flat;
}

/**
 * Text as the read verb prints it, with nothing a terminal would run or hide:
 * C0 controls and DEL to spaces, as the resume card turns them, and the rest of
 * its strip set (`UNPRINTABLE_CHARS`: the C1 controls, bidi controls,
 * zero-width marks, line separators), the Unicode tag block and the
 * default-ignorable class dropped. `keep` names the controls a body's layout is
 * made of; a carriage return is kept only before a line feed, so it cannot
 * rewrite a printed line. A strip can complete a row the unstripped text did
 * not, so every caller screens what this returns.
 */
function printableText(text: string, keep = ""): string {
  return text
    .replace(UNPRINTABLE_CHARS, (char, at: number, whole: string) =>
      keep.includes(char) && (char !== "\r" || whole[at + 1] === "\n") ? char : char < " " || char === "\u007f" ? " " : "",
    )
    .replace(UNICODE_TAG_CHARS, "")
    .replace(INVISIBLE_SMUGGLING_CHARS, "");
}

/**
 * A skip's file name for the read verb: screened as a summary is, raw and as
 * {@link printableText} prints it, and printed stripped; a name that hits is
 * withheld behind a placeholder naming the pattern ids, never the name.
 * {@link lineSafe} then flattens and caps it as it does every name.
 */
function printedName(name: string): string {
  const shown = printableText(name);
  const ids = [...new Set([...blockedPatternIds(name), ...blockedPatternIds(shown)])].toSorted();
  if (ids.length === 0) return shown;
  return `(name withheld: ${ids.length === 1 ? "pattern" : "patterns"} ${ids.join(", ")})`;
}

/** The warn rows whose window holds a confusable letter or a nonspacing mark beside an override keyword. */
const MASK_ROWS: ReadonlySet<string> = new Set(["homoglyph-instruction-mask", "combining-mark-instruction-mask"]);
/** The warn row the invisible strip answers; it shares its id with the sanitizer's strip stage. */
const INVISIBLE_ROW = "invisible-chars";
/** Rewrites of the mask windows before the strip stops; each pass that changes nothing ends it sooner. */
const MAX_MASK_PASSES = 4;

/** A loaded body as the read verb prints it, with what was stripped by id and count — never the text. */
export interface PrintableBody {
  text: string;
  stripped: { patternId: string; count: number }[];
}

/**
 * Strip a loaded body's warn-class material before it is printed: invisible
 * characters (counted per code point), then each window a masking row marks —
 * a confusable letter or a nonspacing mark beside an override keyword —
 * rewritten as the screens' own normalized copy, which maps the lookalike to
 * its ASCII letter and drops the mask touching the word. Only those windows
 * change, so accented prose elsewhere prints as written. The rest of the
 * unprintable set goes too ({@link printableText}; tabs and line breaks stay).
 * Block rows never reach here: the loader skipped any file carrying one, in
 * this printed form as well.
 */
export function printableBody(body: string): PrintableBody {
  const counts = new Map<string, number>();
  const invisible = body.match(INVISIBLE_SMUGGLING_CHARS)?.length ?? 0;
  if (invisible > 0) counts.set(INVISIBLE_ROW, invisible);
  let text = printableText(body.replace(INVISIBLE_SMUGGLING_CHARS, ""), "\t\n\r");

  for (let pass = 0; pass < MAX_MASK_PASSES; pass += 1) {
    const hits = scanForDeniedPatterns(text, LEARNINGS_SCREEN_PATTERNS)
      .filter((hit) => MASK_ROWS.has(hit.patternId))
      .toSorted((a, b) => a.index - b.index);
    const windows: { start: number; end: number; ids: string[] }[] = [];
    for (const hit of hits) {
      const last = windows.at(-1);
      const end = hit.index + hit.matchLength;
      if (last !== undefined && hit.index <= last.end) {
        last.end = Math.max(last.end, end);
        last.ids.push(hit.patternId);
      } else {
        windows.push({ start: hit.index, end, ids: [hit.patternId] });
      }
    }
    let next = text;
    for (const window of windows.toReversed()) {
      const span = next.slice(window.start, window.end);
      const rewritten = normalizeForDenyScan(span);
      if (rewritten === span) continue;
      next = next.slice(0, window.start) + rewritten + next.slice(window.end);
      for (const id of window.ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    if (next === text) break;
    text = next;
  }

  const stripped = [...counts.entries()]
    .map(([patternId, count]) => ({ patternId, count }))
    .toSorted((a, b) => (a.patternId < b.patternId ? -1 : a.patternId > b.patternId ? 1 : 0));
  return { text, stripped };
}

// ── Shared ───────────────────────────────────────────────────────

/**
 * `.md` file names in a learnings directory. An absent directory is an empty
 * list, not an error, and nothing is created to establish that — both halves of
 * this module read through here, so neither can accidentally materialize the
 * directory. Any other listing failure is a typed `FS_ERROR`.
 */
async function listLearningFileNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new EngineError(`Cannot read the learnings directory ${dir}: ${messageOf(error)}`, {
      code: "FS_ERROR",
      cause: error,
    });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
