import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import pLimit from "p-limit";
import {
  composeFrontmatter,
  frontmatterField,
  parseFrontmatter,
  type ParsedFrontmatter,
} from "../content/frontmatter.ts";
import { INVISIBLE_SMUGGLING_CHARS, scanNormalized } from "../denyscan/denyScan.ts";
import { atomicWriteFile } from "../merge/atomicWrite.ts";
import { EngineError } from "../types/errors.ts";
import { STATE_DIR } from "../types/markers.ts";
import {
  computeLearningIntegrity,
  LEARNINGS_SCREEN_PATTERNS,
  MAX_LEARNING_FILE_BYTES,
  resolveLearningsCaps,
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
}

export interface LoaderResult {
  /** Newest first, name-ascending on equal timestamps. */
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
}

/**
 * Read every learning cleared for this session.
 *
 * Files are examined newest first — a learning written today outranks one from
 * six months ago when the budget runs out — and each is checked in the order
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
    examine(dir, candidate, now),
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

  return { learnings, skips, totalBytes };
}

interface Candidate {
  fileName: string;
  mtimeMs: number;
  /** `null` when the entry could not be stat'd between the listing and now. */
  size: number | null;
}

type Examined =
  | { ok: false; skip: LoaderSkip }
  | { ok: true; learning: LoadedLearning; bytes: number };

/** Newest first, name-ascending on a tie so equal timestamps still order deterministically. */
async function listCandidates(dir: string): Promise<Candidate[]> {
  const names = await listLearningFileNames(dir);
  const stamped = await pLimit(READ_CONCURRENCY).map(names, async (fileName) => {
    try {
      const stats = await stat(join(dir, fileName));
      return { fileName, mtimeMs: stats.mtimeMs, size: stats.size };
    } catch {
      return { fileName, mtimeMs: 0, size: null };
    }
  });
  stamped.sort(
    (a, b) =>
      b.mtimeMs - a.mtimeMs || (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0),
  );
  return stamped;
}

async function examine(dir: string, candidate: Candidate, now: Date): Promise<Examined> {
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
  const blocked = scanNormalized(
    raw.replace(INVISIBLE_SMUGGLING_CHARS, ""),
    LEARNINGS_SCREEN_PATTERNS,
  ).filter((hit) => hit.severity === "block");
  if (blocked.length > 0) {
    const ids = [...new Set(blocked.map((hit) => hit.patternId))].toSorted();
    return skip(
      fileName,
      "injection-detected",
      `matches injection ${ids.length === 1 ? "pattern" : "patterns"} ${ids.join(", ")}.`,
    );
  }

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
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      integrityOk: true,
    },
  };
}

function skip(fileName: string, reason: LoaderSkipReason, detail: string): Examined {
  return { ok: false, skip: { fileName, reason, detail } };
}

/** The declared review date when it has passed, else `null`. */
function expiredReview(parsed: ParsedFrontmatter, now: Date): string | null {
  const reviewBy = frontmatterField(parsed, REVIEW_BY_FIELD);
  if (typeof reviewBy !== "string") return null;
  const deadline = Date.parse(`${reviewBy}T23:59:59.999Z`);
  return Number.isNaN(deadline) || deadline >= now.getTime() ? null : reviewBy;
}

// ── Index ────────────────────────────────────────────────────────

/**
 * Render the session-start index: a count line, one line per loaded learning
 * (confidence, id, summary, file), one line per skip.
 *
 * Bodies never appear here, and neither does a skip's `detail`. This string is
 * written into a model's opening context, so it carries the parts a reader needs
 * to decide what to open — never the text a gate just refused. Deterministic for
 * a given result: the order is the loader's, which is the corpus order.
 *
 * A repeated `id` across two files is flagged rather than collapsed. The file is
 * the unit of the corpus, so both load; the flag is what tells the operator two
 * notes are claiming one name.
 */
export function formatLearningsIndex(result: LoaderResult): string {
  const lines = [
    `Learnings: ${result.learnings.length} loaded, ${result.skips.length} skipped, ` +
      `${result.totalBytes} bytes.`,
  ];

  const duplicates = duplicateIds(result.learnings);
  for (const learning of result.learnings) {
    const id = indexId(learning);
    const confidence = fieldText(learning.frontmatter, "confidence") ?? "unrated";
    const summary = fieldText(learning.frontmatter, "summary") ?? "(no summary)";
    const flag = duplicates.has(id) ? " [duplicate id]" : "";
    lines.push(`- [${confidence}] ${id} — ${summary} (${learning.fileName})${flag}`);
  }

  for (const entry of result.skips) {
    lines.push(`- skipped ${entry.fileName}: ${entry.reason}`);
  }

  return lines.join("\n");
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
