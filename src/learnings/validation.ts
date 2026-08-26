import { createHash } from "node:crypto";
import { open, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import pLimit from "p-limit";
import { requireEnum, requireString } from "../config/parse.ts";
import { frontmatterField, parseFrontmatter, type ParsedFrontmatter } from "../content/frontmatter.ts";
import {
  CONTENT_DENY_PATTERNS,
  INJECTION_PATTERNS,
  INVISIBLE_SMUGGLING_CHARS,
  LEARNINGS_INJECTION_PATTERNS,
  sanitizeContent,
  scanNormalized,
  type DenyPattern,
} from "../denyscan/denyScan.ts";
import { EngineError } from "../types/errors.ts";

/**
 * Learnings write gates.
 *
 * A learning is a curated, human-verifiable note that re-enters agent context on
 * a later session — the cross-tool, in-repo layer beside a client's machine-local
 * auto-memory. That re-entry is what makes it a security surface: anything with
 * write access to the repo can author a file that is later read back into a
 * prompt. Every learning therefore passes four gates:
 *
 * 1. **file name** — a bare kebab-case `.md` slug, no path parts;
 * 2. **caps** — per-file byte ceiling, and a directory count ceiling;
 * 3. **content** — frontmatter schema, non-empty body with its required
 *    sections, and injection screening at `block` severity as hard errors;
 * 4. **integrity** — sha256 over the body, stamped in frontmatter.
 *
 * The execution order is load-bearing, not the listing order. The name gate runs
 * first and short-circuits — a file that cannot be addressed safely is never
 * parsed — and the byte cap runs before the regex screen, so oversized input is
 * refused rather than scanned.
 *
 * No pattern is declared here: the catalogs come from `../denyscan/denyScan.ts`,
 * and the screen is all three of them — the learnings catalog, the write-path
 * block set, and the inter-agent transport set. That is the composition
 * `../guard/promptGuard.ts` screens agent input with, and a learning IS agent
 * input on its next read, so what that gate refuses this one refuses.
 *
 * The transport set is not redundant here. `unicode-tag-smuggling`,
 * `base64-instruction-override`, `chat-template-tokens`, `role-colon-injection`,
 * `template-injection`, `image-url-exfiltration` and `error-frame-override`
 * appear in no other catalog, and normalization does not stand in for them: the
 * default-ignorable class stripped before the scan does not contain the Unicode
 * tag block, so a tag-encoded instruction passes through it untouched. What
 * normalization does cover is keyword splitting — `ig<ZWSP>nore all previous
 * instructions` is scored on its joined form — which makes `invisible-chars` the
 * one transport row that never fires from the set here. The characters are gone
 * before the scan runs, and their presence is reported on its own line instead.
 *
 * Screening reads the whole file, frontmatter included — a forged instruction
 * fits in a `summary:` as easily as in a paragraph. The consequence is a
 * deliberate false-positive posture: a body that quotes injection vocabulary in
 * the first two kilobytes, or writes a `{{handlebars}}` span, a bare `system:`
 * line or a chat-template token as documentation, is refused with the pattern id
 * named, and the author rephrases. Fail-closed is the right default for content
 * that will be read back as instructions.
 *
 * Validation returns results, it never throws for content defects: one poisoned
 * or malformed file must not take down the directory pass that found it. Only an
 * unreadable directory is fatal.
 */

// ── Caps ─────────────────────────────────────────────────────────

/** Per-file byte ceiling (64 KiB). Split a longer note into separate learnings. */
export const MAX_LEARNING_FILE_BYTES = 65_536;

/** Default ceiling on `.md` files in a learnings directory. */
export const DEFAULT_LEARNING_FILE_COUNT = 150;

/** Floor for a configured count: lower values clamp up, so no project can starve its own recall. */
export const MIN_LEARNING_FILE_COUNT = 50;

/**
 * Ceiling for a configured count, ten times the default. Past this the directory
 * is a knowledge base rather than curated residue, and a session-start read of it
 * would cost more context than the learnings are worth.
 */
export const MAX_LEARNING_FILE_COUNT = DEFAULT_LEARNING_FILE_COUNT * 10;

/** Summary ceiling: the session-start index prints one line per learning. */
export const MAX_LEARNING_SUMMARY_LENGTH = 200;

/** Confidence levels, in ascending order of evidence. */
export const LEARNING_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

export type LearningConfidence = (typeof LEARNING_CONFIDENCE_LEVELS)[number];

/**
 * Headings a learning body carries. The finding alone is not reusable: the
 * reason is what lets a later reader judge whether it still holds, and the
 * application step is what makes it actionable. Matched as ATX headings,
 * case-insensitively.
 */
export const REQUIRED_LEARNING_SECTIONS = ["Why", "How to apply"] as const;

/** Resolved capacity for one learnings directory. */
export interface ResolvedLearningsCaps {
  /** Ceiling on `.md` files; files past it are reported, never validated. */
  maxCount: number;
  /** Per-file byte ceiling. */
  maxFileBytes: number;
}

/**
 * Resolve caps from a configured count, clamped into
 * `[MIN_LEARNING_FILE_COUNT, MAX_LEARNING_FILE_COUNT]`. Absent, non-numeric and
 * non-finite input all fall back to the default — a malformed knob is no signal,
 * and refusing to validate because a count is unreadable helps nobody.
 * Fractional values floor.
 */
export function resolveLearningsCaps(configuredMaxCount?: number): ResolvedLearningsCaps {
  return { maxCount: clampCount(configuredMaxCount), maxFileBytes: MAX_LEARNING_FILE_BYTES };
}

function clampCount(configured: number | undefined): number {
  if (typeof configured !== "number" || !Number.isFinite(configured)) {
    return DEFAULT_LEARNING_FILE_COUNT;
  }
  const floored = Math.floor(configured);
  if (floored < MIN_LEARNING_FILE_COUNT) return MIN_LEARNING_FILE_COUNT;
  return Math.min(floored, MAX_LEARNING_FILE_COUNT);
}

// ── Patterns ─────────────────────────────────────────────────────

/** Bare kebab-case `.md` name: no directory parts, no case, no spaces, no traversal. */
const FILE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INTEGRITY_PATTERN = /^sha256:[0-9a-fA-F]{64}$/;
const INTEGRITY_PREFIX = "sha256:";
/** Written as an escape, not a literal, so the byte is visible in a diff. */
const NUL = "\u0000";

/**
 * Open descriptors during a directory pass. Bounded because `maxCount` reaches
 * {@link MAX_LEARNING_FILE_COUNT}, and an unbounded fan-out of that many reads
 * exhausts the descriptor table on a default `ulimit -n` long before it
 * saturates the libuv thread pool.
 */
const READ_CONCURRENCY = 8;

/**
 * The learnings screen: the learnings-specific catalog first, so its precise
 * ids attribute a hit before the broad write-path set does, then the
 * inter-agent transport set the prompt guard applies to the same class of
 * content. Order decides attribution only — every row is scanned either way.
 *
 * Exported because the READ screen in `./store.ts` is the same question asked at
 * a later moment, and the two answers have to be one composition. They were not:
 * the read half held a private two-catalog copy under a comment claiming parity
 * with this one, so the seven ids that live only in `INJECTION_PATTERNS` —
 * `unicode-tag-smuggling`, `base64-instruction-override`, `chat-template-tokens`,
 * `role-colon-injection`, `template-injection`, `image-url-exfiltration`,
 * `error-frame-override` — were screened at write and missed at read. A file
 * carrying one of them still failed to load, but as `invalid-frontmatter` from
 * the schema gate further down, which inverts the loader's stated ordering (the
 * poisoned file must report as poisoned) and hides the reason from the operator.
 */
export const LEARNINGS_SCREEN_PATTERNS: readonly DenyPattern[] = [
  ...LEARNINGS_INJECTION_PATTERNS,
  ...CONTENT_DENY_PATTERNS,
  ...INJECTION_PATTERNS,
];

// ── Single-file validation ───────────────────────────────────────

export interface LearningValidationResult {
  valid: boolean;
  /** Defects that refuse the write. Empty exactly when `valid`. */
  errors: string[];
  /** Advisories that do not refuse the write (stale review date, missing trust field). */
  warnings: string[];
}

export interface LearningContentOptions {
  /** Per-file byte ceiling; defaults to {@link MAX_LEARNING_FILE_BYTES}. */
  maxFileBytes?: number;
  /** Clock for the review-by staleness check. Defaults to now. */
  now?: Date;
}

/**
 * Validate one learning file's name and content through all four gates.
 *
 * `fileName` is the bare name, not a path — it is both the gate-1 subject and the
 * label every message carries.
 */
export function validateLearningContent(
  fileName: string,
  raw: string,
  options: LearningContentOptions = {},
): LearningValidationResult {
  // ── Gate 1: file name ──
  // A name that cannot be addressed stops the pass here: nothing about the
  // content is parsed, scanned or reported, so the operator fixes one thing.
  const nameErrors = validateLearningFileName(fileName);
  if (nameErrors.length > 0) return { valid: false, errors: nameErrors, warnings: [] };

  const source = `Learning "${fileName}"`;
  const maxFileBytes = options.maxFileBytes ?? MAX_LEARNING_FILE_BYTES;

  // ── Gate 2: caps and encoding ──
  // Byte-level checks, before any parse or regex pass: past-cap content is
  // refused rather than scanned, which keeps a hostile 50 MB "learning" from
  // buying 40 regex passes over itself.
  const byteLength = Buffer.byteLength(raw, "utf8");
  if (byteLength > maxFileBytes) {
    return fail(
      `${source} is ${byteLength} bytes, over the ${maxFileBytes} byte per-file cap ` +
        `(${byteLength - maxFileBytes} bytes over). Split it into separate learnings.`,
    );
  }
  if (raw.includes(NUL)) {
    return fail(`${source} contains a null byte, so it is not UTF-8 text. Learnings are markdown.`);
  }
  if (raw.trim() === "") return fail(`${source} is empty.`);

  // ── Gate 3: content ──
  let parsed: ParsedFrontmatter;
  try {
    parsed = parseFrontmatter(raw, source);
  } catch (error) {
    return fail(messageOf(error));
  }
  if (!parsed.hadFrontmatter) {
    return fail(
      `${source} has no frontmatter block. Open the file with a \`---\` fenced YAML head ` +
        `declaring id, date, confidence and summary.`,
    );
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  checkFrontmatter(parsed.frontmatter, source, options.now ?? new Date(), errors, warnings);
  checkBody(parsed.body, source, errors);

  const screened = screen(raw, source);
  errors.push(...screened.errors);
  warnings.push(...screened.warnings);

  // ── Gate 4: integrity ──
  checkIntegrity(parsed, source, errors);

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a learning file name: a bare kebab-case slug plus `.md`.
 *
 * The name reaches the filesystem as a path segment, so the shape is a security
 * boundary before it is a style rule — the pattern admits no separator, no `..`,
 * no leading dot and no whitespace, which leaves nothing for a traversal or a
 * hidden-file write to use. Lower case only keeps the corpus stable across
 * case-insensitive filesystems, where `Cache.md` and `cache.md` are one file.
 */
export function validateLearningFileName(fileName: string): string[] {
  if (FILE_NAME_PATTERN.test(fileName)) return [];

  const errors: string[] = [];
  if (/[/\\]/.test(fileName) || fileName.includes("..")) {
    errors.push(
      `Learning file name ${JSON.stringify(fileName)} must be a bare file name — ` +
        `no directory separators and no ".." segments.`,
    );
  }
  if (!fileName.endsWith(".md")) {
    errors.push(`Learning file name ${JSON.stringify(fileName)} must end in ".md".`);
  }
  const stem = fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
  if (errors.length === 0 || !SLUG_PATTERN.test(stem)) {
    errors.push(
      `Learning file name ${JSON.stringify(fileName)} must be a kebab-case slug plus ".md" ` +
        `(lower-case letters and digits, single hyphens between them), e.g. "cache-warmup-order.md".`,
    );
  }
  return errors;
}

function checkFrontmatter(
  frontmatter: Record<string, unknown>,
  source: string,
  now: Date,
  errors: string[],
  warnings: string[],
): void {
  const id = read(errors, () => requireString(frontmatter, "id", { source }));
  if (id !== undefined && !SLUG_PATTERN.test(id)) {
    errors.push(`${source}: \`id\` must be a kebab-case slug (got ${JSON.stringify(id)}).`);
  }

  const date = read(errors, () => requireString(frontmatter, "date", { source }));
  if (date !== undefined && !isCalendarDate(date)) {
    errors.push(`${source}: \`date\` must be an ISO calendar date (YYYY-MM-DD), got ${JSON.stringify(date)}.`);
  }

  read(errors, () => requireEnum(frontmatter, "confidence", LEARNING_CONFIDENCE_LEVELS, { source }));

  const summary = read(errors, () => requireString(frontmatter, "summary", { source }));
  if (summary !== undefined && summary.trim() === "") {
    errors.push(`${source}: \`summary\` must not be blank — it is the learning's index line.`);
  } else if (summary !== undefined && summary.length > MAX_LEARNING_SUMMARY_LENGTH) {
    errors.push(
      `${source}: \`summary\` is ${summary.length} characters, over the ` +
        `${MAX_LEARNING_SUMMARY_LENGTH} character cap. Move the detail into the body.`,
    );
  }

  checkTrustFields(frontmatter, source, now, errors, warnings);
}

/**
 * The two trust fields a native memory has no equivalent of: when the learning
 * should be re-read, and what it was checked against in this repo. Both are
 * shape-checked when present and warned about when absent — whether they become
 * mandatory is content policy, which lands with the rule corpus, and a validator
 * that hard-failed on them today would refuse every learning written before it.
 */
function checkTrustFields(
  frontmatter: Record<string, unknown>,
  source: string,
  now: Date,
  errors: string[],
  warnings: string[],
): void {
  const reviewBy = read(errors, () => requireString(frontmatter, "reviewBy", { source, optional: true }));
  if (reviewBy === undefined) {
    warnings.push(
      `${source}: no \`reviewBy\` date. A learning without a review horizon goes stale unnoticed.`,
    );
  } else if (!isCalendarDate(reviewBy)) {
    errors.push(
      `${source}: \`reviewBy\` must be an ISO calendar date (YYYY-MM-DD), got ${JSON.stringify(reviewBy)}.`,
    );
  } else if (Date.parse(`${reviewBy}T23:59:59.999Z`) < now.getTime()) {
    // Stale, not wrong: the finding may well still hold, and refusing to read it
    // would delete knowledge on a calendar boundary. Re-verify and move the date.
    warnings.push(`${source}: \`reviewBy\` ${reviewBy} has passed. Re-verify the learning or retire it.`);
  }

  const validatedAgainst = read(errors, () =>
    requireString(frontmatter, "validatedAgainst", { source, optional: true }),
  );
  if (validatedAgainst === undefined) {
    warnings.push(
      `${source}: no \`validatedAgainst\` field. Record the command, test or path the ` +
        `learning was checked against in this repo.`,
    );
  } else if (validatedAgainst.trim() === "") {
    errors.push(`${source}: \`validatedAgainst\` must name what the learning was checked against.`);
  }
}

function checkBody(body: string, source: string, errors: string[]): void {
  if (body.trim() === "") {
    errors.push(`${source}: the body is empty. A learning is the finding, not its frontmatter.`);
    return;
  }
  const missing = REQUIRED_LEARNING_SECTIONS.filter((section) => !hasSection(body, section));
  if (missing.length > 0) {
    errors.push(
      `${source}: the body is missing the ${missing.map((s) => `"${s}"`).join(" and ")} ` +
        `${missing.length === 1 ? "section" : "sections"}. Required sections: ` +
        `${REQUIRED_LEARNING_SECTIONS.map((s) => `## ${s}`).join(", ")}.`,
    );
  }
}

function hasSection(body: string, section: string): boolean {
  return new RegExp(`^#{1,6}[ \\t]*${escapeRegExp(section)}\\b`, "im").test(body);
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Screen `text` against the learnings set, one message per pattern id: a hit
 * proves the file needs rewriting, and twenty occurrences of it prove nothing
 * more. `block` severity is a hard error, `warn` an advisory.
 *
 * Two properties the messages here have to hold, both of which they lacked:
 *
 * 1. **The scan is the union.** Invisible characters are stripped first, then
 *    {@link scanNormalized} reads the stripped copy AND its folded-and-joined
 *    form, so a keyword spelled in lookalikes or masked by a combining mark is
 *    refused rather than stored. A learning is agent input on its next read; this
 *    gate is what stands between an authored file and every later session's
 *    opening context.
 * 2. **No echo.** A message names the pattern id, the offset and the length of
 *    the span — never the span. These strings go to the operator's terminal and
 *    into the stdout of the agent that drove the write, so quoting the match puts
 *    the payload back in front of a model and reprints any credential the
 *    `inline-secret-assignment` row just caught. The sibling gates in
 *    `../handoffs/validation.ts` and `./store.ts` both state that rule; this one
 *    quoted `hit.snippet` anyway, which for a warn row is the matched text
 *    verbatim.
 */
function screen(text: string, source: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const stripped = text.replace(INVISIBLE_SMUGGLING_CHARS, "");
  if (stripped.length !== text.length) {
    warnings.push(
      `${source}: ${text.length - stripped.length} invisible character(s) present. ` +
        `They were removed before screening; persist the sanitized body.`,
    );
  }

  const seen = new Set<string>();
  for (const hit of scanNormalized(stripped, LEARNINGS_SCREEN_PATTERNS)) {
    if (seen.has(hit.patternId)) continue;
    seen.add(hit.patternId);
    const message =
      `${source}: matches injection pattern \`${hit.patternId}\` at index ${hit.index} ` +
      `(${hit.matchLength} characters). Rewrite or remove the span.`;
    if (hit.severity === "block") errors.push(message);
    else warnings.push(message);
  }
  return { errors, warnings };
}

function checkIntegrity(parsed: ParsedFrontmatter, source: string, errors: string[]): void {
  const declared = frontmatterField(parsed, "integrity");
  // Absent is not a defect here: the store stamps the digest as it writes, so a
  // hand-authored file arrives at the gate without one.
  if (declared === undefined) return;

  if (typeof declared !== "string" || !INTEGRITY_PATTERN.test(declared)) {
    errors.push(
      `${source}: \`integrity\` must be "${INTEGRITY_PREFIX}" followed by 64 hex characters.`,
    );
    return;
  }
  if (!verifyLearningIntegrity(declared, parsed.body)) {
    errors.push(
      `${source}: \`integrity\` does not match the body — declared ${declared}, ` +
        `computed ${computeLearningIntegrity(parsed.body)}. The body changed after it was stamped.`,
    );
  }
}

// ── Sanitization ─────────────────────────────────────────────────

export interface LearningsSanitizationResult {
  /** The neutralized content: invisible characters stripped, matched spans redacted. */
  content: string;
  modified: boolean;
  /** Pattern ids that fired, sorted, one entry each. */
  strippedPatternIds: string[];
}

/**
 * Neutralize learnings content against the same set the gate screens with, so
 * "sanitize, then validate" converges instead of arguing with itself. The
 * sanitizer fails closed on a set it cannot resolve — content dropped rather
 * than half-neutralized — which is the shared contract of the deny-scan module.
 */
export function sanitizeLearningsContent(raw: string): LearningsSanitizationResult {
  const result = sanitizeContent(raw, LEARNINGS_SCREEN_PATTERNS);
  return {
    content: result.sanitized,
    modified: result.modified,
    strippedPatternIds: result.removed.map((entry) => entry.patternId).toSorted(),
  };
}

// ── Integrity ────────────────────────────────────────────────────

/**
 * Digest of a learning body as `sha256:{hex}`.
 *
 * The body is trimmed before hashing so an editor that adds or strips a trailing
 * newline does not invalidate a file it never meaningfully touched. Scope is the
 * body only — frontmatter carries the digest, so it cannot also be inside it.
 *
 * This is tamper *detection*, not signing: it catches an edit that bypassed the
 * write path, and makes no claim against an attacker who can rewrite both halves.
 */
export function computeLearningIntegrity(body: string): string {
  return INTEGRITY_PREFIX + createHash("sha256").update(body.trim(), "utf8").digest("hex");
}

/**
 * Whether `frontmatterHash` matches `body`. Takes `unknown` because the value
 * comes from a parsed YAML map: anything that is not a well-formed digest is
 * false rather than a throw, and hex case never decides the answer.
 */
export function verifyLearningIntegrity(frontmatterHash: unknown, body: string): boolean {
  if (typeof frontmatterHash !== "string" || !INTEGRITY_PATTERN.test(frontmatterHash)) return false;
  return frontmatterHash.toLowerCase() === computeLearningIntegrity(body);
}

// ── Directory validation ─────────────────────────────────────────

export interface LearningsDirectoryResult {
  /** File names that passed every gate. */
  valid: string[];
  /** File names that failed, with the reasons. */
  invalid: { file: string; errors: string[] }[];
  /** File names past `maxCount` — the newest ones, reported but not validated. */
  overCap: string[];
}

/**
 * Validate every `.md` file in a learnings directory against `caps`.
 *
 * Count enforcement is by age: files order oldest-first, the first `maxCount`
 * are the corpus, and everything after them is what broke the cap — the newest
 * writes, the ones that should not have landed. Over-cap files are named in
 * `overCap`, and only their frontmatter head is read, so `valid` never exceeds
 * the cap and no over-cap body is parsed or screened.
 *
 * Age is the declared `date`, not the file's mtime. mtime does not survive a
 * clone — git writes checkout order — so an mtime-keyed cut answered one way on
 * the author's machine and another way in CI, over the same bytes, with the
 * over-cap verdict differing between them. The declared date is content, so it
 * travels with the file; the file name breaks a tie, so two learnings dated the
 * same day still cut deterministically. mtime survives only as the fallback for
 * a file with no readable `date` — which is an invalid learning either way, and
 * the ordering is what decides whether it is reported as invalid or as over-cap.
 *
 * An absent directory is an empty result, not an error, and nothing is created:
 * reading is side-effect free. Entries that are not regular `.md` files —
 * subdirectories, symlinks, notes in other formats — are ignored. Any other
 * failure to list the directory is a typed `FS_ERROR`.
 */
export async function validateLearningsDirectory(
  dir: string,
  caps: ResolvedLearningsCaps,
): Promise<LearningsDirectoryResult> {
  const names = await listLearningFiles(dir);
  const ordered = await orderOldestFirst(dir, names);
  const overCap = ordered.slice(caps.maxCount);

  const results = await pLimit(READ_CONCURRENCY).map(
    ordered.slice(0, caps.maxCount),
    async (file) => ({ file, errors: await validateFile(dir, file, caps) }),
  );

  const valid: string[] = [];
  const invalid: { file: string; errors: string[] }[] = [];
  for (const result of results) {
    if (result.errors.length === 0) valid.push(result.file);
    else invalid.push(result);
  }
  return { valid, invalid, overCap };
}

async function listLearningFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new EngineError(`Cannot read the learnings directory ${dir}: ${messageOf(error)}`, {
      code: "FS_ERROR",
      cause: error,
    });
  }
}

/**
 * Oldest first by declared `date`, name-ascending on a tie so two learnings from
 * the same day still order deterministically. A file whose head carries no
 * readable date falls back to its mtime, rendered as a calendar day so both keys
 * compare as one ISO string; a file that cannot be read at all sorts oldest and
 * reports its real failure when the read stage reaches it.
 */
async function orderOldestFirst(dir: string, names: string[]): Promise<string[]> {
  const stamped = await pLimit(READ_CONCURRENCY).map(names, async (name) => ({
    name,
    day: await orderingDay(dir, name),
  }));
  stamped.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return stamped.map((entry) => entry.name);
}

/**
 * Bytes read from a file's head to find its `date`. A learning's frontmatter is
 * six short fields; 4 KB is room for an unusually long `summary` and a bound a
 * hostile file cannot spend past, which matters because this runs over every
 * name in the directory including the ones the cap will reject.
 */
const HEAD_BYTES = 4096;

/** The ordering key: declared calendar date, or the mtime rendered as one. */
async function orderingDay(dir: string, name: string): Promise<string> {
  const path = join(dir, name);
  const declared = declaredDate(await readHead(path));
  if (declared !== null) return declared;
  return new Date(await modifiedAt(path)).toISOString().slice(0, 10);
}

/** First `HEAD_BYTES` of a file, or `""` when it cannot be opened. */
async function readHead(path: string): Promise<string> {
  let handle;
  try {
    handle = await open(path, "r");
    const buffer = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } catch {
    return "";
  } finally {
    await handle?.close();
  }
}

/**
 * The `date` value inside the opening frontmatter fence, read with a line match
 * rather than a YAML parse: this is an ordering key, so a malformed document
 * must produce no date instead of a throw the caller would have to swallow, and
 * the file is parsed properly a step later anyway. Scoped to the head so a
 * `date:` line in the body cannot decide the order.
 */
function declaredDate(head: string): string | null {
  if (!head.startsWith("---")) return null;
  const fenceEnd = head.indexOf("\n---", 3);
  const frontmatter = fenceEnd === -1 ? head : head.slice(0, fenceEnd);
  return /^[ \t]*date[ \t]*:[ \t]*["']?(\d{4}-\d{2}-\d{2})/m.exec(frontmatter)?.[1] ?? null;
}

async function modifiedAt(path: string): Promise<number> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return 0;
  }
}

async function validateFile(dir: string, file: string, caps: ResolvedLearningsCaps): Promise<string[]> {
  let raw: string;
  try {
    raw = await readFile(join(dir, file), "utf8");
  } catch (error) {
    return [`Learning "${file}" could not be read: ${messageOf(error)}`];
  }
  return validateLearningContent(file, raw, { maxFileBytes: caps.maxFileBytes }).errors;
}

// ── Shared helpers ───────────────────────────────────────────────

function fail(message: string): LearningValidationResult {
  return { valid: false, errors: [message], warnings: [] };
}

/** Run one `require*` read, collecting its throw as a message instead of propagating it. */
function read<T>(errors: string[], reader: () => T | undefined): T | undefined {
  try {
    return reader();
  } catch (error) {
    errors.push(messageOf(error));
    return undefined;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** ISO date that is also a real day: `2026-02-31` parses, then rolls over, and is rejected. */
function isCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}
