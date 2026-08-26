import { createHash, randomBytes } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import pLimit from "p-limit";
import { requireEnum, requireString, unknownFields } from "../config/parse.ts";
import { parseFrontmatter } from "../content/frontmatter.ts";
import {
  CONTENT_DENY_PATTERNS,
  INJECTION_PATTERNS,
  INVISIBLE_SMUGGLING_CHARS,
  LEARNINGS_INJECTION_PATTERNS,
  scanNormalized,
  type DenyPattern,
} from "../denyscan/denyScan.ts";
import { TOOLS } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import {
  HANDOFF_STATUSES,
  type Handoff,
  type HandoffFrontmatter,
  type HandoffStatus,
} from "./schema.ts";

/**
 * The handoff trust boundary.
 *
 * A handoff is written by one agent and read by another agent, usually in a
 * different tool, with no human between them. That makes the file untrusted
 * input on the read side even when the repo authored it, so this module is the
 * gate rather than a linter: content that reaches an agent's context has to
 * pass it first.
 *
 * Five controls, in the order they matter:
 *
 * 1. **Size caps.** 50 KB of body, 60 KB of file. A handoff is a summary of
 *    state; anything larger is a transcript, and pasting a transcript into a
 *    fresh context is the failure mode the artifact exists to avoid.
 * 2. **Integrity.** `sha256` over the trimmed body, declared in the head. Any
 *    edit between write and resume shows up as a mismatch.
 * 3. **Injection scan → hard errors.** Three catalogs from `../denyscan`, the
 *    single pattern home: handoff-shaped structural vectors, the write-path
 *    override vocabulary, and the inter-agent transport set — the same
 *    composition `../guard/promptGuard.ts` screens agent input with, because a
 *    handoff is agent input the moment the next session reads it. Every block
 *    row is an error rather than a warning, since the consumer of this file is
 *    a model that will read the payload as text; the transport set's two
 *    advisory rows (a Latin-confusable letter beside an override keyword, and
 *    the invisible-character count) report without refusing.
 * 4. **Required sections.** A handoff missing "Work Remaining" or "Blockers"
 *    resumes into a guess.
 * 5. **Freshness.** Expiry and git-ref drift, both explicit and clock-injected
 *    ({@link isHandoffExpired}, {@link detectGitRefDrift}) so no verdict here
 *    depends on an ambient clock.
 *
 * Validation never throws on bad content — defects come back in `errors` so a
 * caller can report every one of them in a single pass. Only an unreadable
 * directory is an exception, because that is an environment failure rather
 * than a content defect.
 */

/** Body cap: 50 KB. */
export const MAX_HANDOFF_BODY_BYTES = 51_200;

/** Whole-file cap: 60 KB, i.e. the body cap plus room for the head. */
export const MAX_HANDOFF_FILE_BYTES = 61_440;

/** Active handoffs a repo may hold before the set is more drift than signal. */
export const MAX_ACTIVE_HANDOFFS_PER_REPO = 25;

/**
 * Days a writer adds to `created` to compute the `expires` it records. On disk
 * `expires` is always an absolute ISO-8601 timestamp — this constant governs
 * only the write-time arithmetic, never how {@link isHandoffExpired} reads it.
 */
export const HANDOFF_DEFAULT_EXPIRY_DAYS = 30;

/** Cap on the one-line `summary` field. */
export const MAX_SUMMARY_LENGTH = 200;

/** Body sections a resumable handoff must carry, as `## <heading>` lines. */
export const REQUIRED_BODY_SECTIONS: readonly string[] = [
  "Problem",
  "Decisions",
  "Work Done",
  "Work Remaining",
  "Blockers",
  "Next Steps",
  "Build & Test Status",
  "File Manifest",
];

/**
 * Id grammar: `<YYYY-MM-DD>_<slug>_<5 hex>`. Date first so a directory listing
 * sorts chronologically, slug second so a human recognizes the entry, hash last
 * so same-day handoffs on one topic stay distinct. Month and day ranges are
 * checked here; the underscore separators keep the hyphenated slug unambiguous.
 */
export const HANDOFF_ID_PATTERN =
  /^[12][0-9]{3}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])_[a-z0-9][a-z0-9-]{0,59}_[0-9a-f]{5}$/;

/** Outcome of validating one handoff. `valid` is exactly `errors.length === 0`. */
export interface HandoffValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Per-directory outcome: parsed handoffs, rejected files, active-set pressure. */
export interface HandoffsDirectoryResult {
  valid: Handoff[];
  invalid: { file: string; errors: string[] }[];
  /** Valid handoffs in an unfinished state — `active` or `in-progress`. */
  activeCount: number;
  overActiveCap: boolean;
}

const INTEGRITY_PATTERN = /^sha256:[0-9a-f]{64}$/;
const INTEGRITY_PREFIX = "sha256:";
const HANDOFF_FILE_EXTENSION = ".md";

/** Concurrent handoff reads. Bounded well under the default descriptor limit. */
const READ_CONCURRENCY = 8;
const KNOWN_FRONTMATTER_FIELDS = [
  "id",
  "status",
  "created",
  "expires",
  "summary",
  "fromTool",
  "toTool",
  "gitRef",
  "integrity",
] as const;

/** Statuses that count against {@link MAX_ACTIVE_HANDOFFS_PER_REPO}. */
const ACTIVE_STATUSES: ReadonlySet<HandoffStatus> = new Set<HandoffStatus>([
  "active",
  "in-progress",
]);

/**
 * The scan set: handoff/learnings structural vectors (forged instruction
 * headers, embedded config frontmatter, forged managed-block markers, tool
 * markup), the write-path override vocabulary, and the inter-agent transport
 * set (chat-template tokens, conversation role headers, base64-encoded
 * overrides, Unicode-tag payloads, template spans, image-URL exfiltration).
 * The third is the one a handoff most needs and the one this set once lacked:
 * a handoff crosses between agents, which is exactly the surface those rows
 * describe. All three come from `denyscan`; a pattern literal in this file
 * would be a second source of truth.
 */
const HANDOFF_DENY_PATTERNS: readonly DenyPattern[] = [
  ...LEARNINGS_INJECTION_PATTERNS,
  ...CONTENT_DENY_PATTERNS,
  ...INJECTION_PATTERNS,
];

/** Null byte — the tell for a non-UTF-8 payload wearing a `.md` extension. */
const BINARY_CONTENT_PATTERN = /\0/;

/**
 * `sha256:<hex>` over the free-text the next agent reads: the `summary` and
 * the body, each with leading and trailing whitespace removed and joined by a
 * newline.
 *
 * The summary is inside the digest because it is content, not metadata — it is
 * the first line the resuming agent is shown, so a tamper check that covered
 * only the body would leave the most-read span of the document unprotected.
 * The other head fields stay outside: `status` is edited by design as work
 * progresses, and a digest that broke on a legitimate status change would train
 * readers to ignore the signal.
 *
 * The trim is what makes the check survive normal handling: editors and
 * formatters add or strip a trailing newline.
 */
export function computeHandoffIntegrity(summary: string, body: string): string {
  const covered = `${summary.trim()}\n${body.trim()}`;
  return `${INTEGRITY_PREFIX}${createHash("sha256").update(covered, "utf8").digest("hex")}`;
}

/** True iff the declared integrity is well-formed and matches the covered span. */
export function verifyHandoffIntegrity(handoff: Handoff): boolean {
  const declared = handoff.frontmatter.integrity;
  if (!INTEGRITY_PATTERN.test(declared)) return false;
  return computeHandoffIntegrity(handoff.frontmatter.summary, handoff.body) === declared;
}

/** Size of the id's hash segment, 16^5 — the space the counter below wraps in. */
const HANDOFF_ID_HASH_SPACE = 0x10_00_00;

/**
 * Per-process counter, seeded once from the CSPRNG.
 *
 * Independent random draws would give a same-day burst a birthday collision
 * rate high enough to matter (a 50-id burst over 20 bits collides ~0.12% of
 * runs), and an id that collides silently overwrites another agent's handoff.
 * Consuming consecutive counter values instead makes up to 2^20 ids from one
 * process distinct by construction, while the random seed keeps ids from
 * different processes dispersed across the space.
 */
let handoffIdCounter = randomBytes(4).readUInt32BE(0) % HANDOFF_ID_HASH_SPACE;

/**
 * Build an id for a handoff about `slug`, dated by `now` (UTC).
 *
 * `slug` is normalized rather than validated: callers derive it from a task
 * title, and a rejected id at write time loses the handoff. The result always
 * matches {@link HANDOFF_ID_PATTERN} for any input string.
 */
export function generateHandoffId(slug: string, now: Date = new Date()): string {
  const date = [
    now.getUTCFullYear().toString().padStart(4, "0"),
    (now.getUTCMonth() + 1).toString().padStart(2, "0"),
    now.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
  handoffIdCounter = (handoffIdCounter + 1) % HANDOFF_ID_HASH_SPACE;
  const hash = handoffIdCounter.toString(16).padStart(5, "0");
  return `${date}_${normalizeSlug(slug)}_${hash}`;
}

const SLUG_FALLBACK = "handoff";
const SLUG_MAX_LENGTH = 60;

/** Lowercase alphanumeric-and-hyphen, ≤60 chars, never empty, never edge-hyphenated. */
function normalizeSlug(slug: string): string {
  const trimmed = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
  return trimmed === "" ? SLUG_FALLBACK : trimmed;
}

/**
 * True iff `expires` has passed at `now`. An unparseable value reads as not
 * expired: the malformed field is already a validation error, and treating it
 * as expiry would hide that defect behind a freshness message.
 */
export function isHandoffExpired(handoff: Handoff, now: Date = new Date()): boolean {
  const expiresMs = Date.parse(handoff.frontmatter.expires);
  if (Number.isNaN(expiresMs)) return false;
  return expiresMs <= now.getTime();
}

/**
 * Advisory text when the recorded git ref no longer describes the tree, else
 * `null`.
 *
 * Never an error, in either drift shape. Code moving under a handoff is the
 * normal case — that is what the recorded ref is for — and a repo with no git
 * context at all (`currentRef === null`) is a legitimate way to run. Both
 * outcomes tell the resuming agent to re-read before trusting the file
 * manifest; neither is grounds to refuse the handoff.
 */
export function detectGitRefDrift(handoff: Handoff, currentRef: string | null): string | null {
  const recorded = handoff.frontmatter.gitRef;
  if (recorded === undefined || recorded === "") return null;
  if (currentRef === null) {
    return (
      `Handoff records git ref "${recorded}", and the current ref could not be resolved. ` +
      `Confirm the working tree matches that ref before resuming.`
    );
  }
  if (recorded !== currentRef) {
    return (
      `Handoff records git ref "${recorded}", but the tree is now at "${currentRef}". ` +
      `Re-read the files in the manifest before acting on it.`
    );
  }
  return null;
}

/**
 * Validate one handoff document. `filePath` labels every message, so a caller
 * validating a set can print results without re-decorating them.
 */
export function validateHandoffContent(raw: string, filePath: string): HandoffValidationResult {
  return parseHandoff(raw, filePath).result;
}

interface ParsedHandoff {
  /** The parsed artifact, or `null` when it was rejected. */
  handoff: Handoff | null;
  result: HandoffValidationResult;
}

/** Fail with `errors` and no parsed artifact. */
function rejected(errors: string[], warnings: string[]): ParsedHandoff {
  return { handoff: null, result: { valid: false, errors, warnings } };
}

/**
 * Run a field read, recording its message instead of propagating the throw.
 * The `require*` helpers throw on the first defect; collecting lets one pass
 * report every defect in the document.
 */
function collect<T>(errors: string[], read: () => T | undefined): T | undefined {
  try {
    return read();
  } catch (cause) {
    errors.push(cause instanceof Error ? cause.message : String(cause));
    return undefined;
  }
}

function fileCapMessage(source: string, bytes: number): string {
  return (
    `${source}: handoff file is ${bytes} bytes, over the ${MAX_HANDOFF_FILE_BYTES} byte limit. ` +
    `Summarize the state instead of pasting a transcript.`
  );
}

/**
 * Screen the WHOLE document — frontmatter included — after removing invisible
 * format characters.
 *
 * Two holes close here, and both were closed in the learnings gate first
 * (`../learnings/validation.ts`), which is why this mirrors it rather than
 * inventing a second dialect.
 *
 * 1. **Normalization.** `ig<ZWSP>nore all previous instructions` matches
 *    nothing while reading as the instruction it is, because the model that
 *    consumes the handoff does not see the zero-width space either. Stripping
 *    the class before the scan means the pattern set screens what the reader
 *    reads, not what the bytes spell. The presence of the characters is itself
 *    reported, since nothing legitimate needs them. Stripping answers one of the
 *    three character-level evasions, so the scan itself is
 *    `scanNormalized` — raw ∪ folded-and-joined — which answers the other two: a
 *    keyword SPELLED in lookalikes (Cyrillic, Greek, Armenian, dotless-i) and one
 *    MASKED by a combining mark. Until it did, the same payload was refused as a
 *    content override and accepted here, then read straight into the next
 *    session's opening context.
 * 2. **Coverage.** Scanning the body alone left `summary:` — the first line the
 *    next agent is shown — an unscreened free-text channel. A handoff is read
 *    straight into another session's context, so every span of it that a model
 *    will read is in scope; the frontmatter is not metadata to a model, it is
 *    more text.
 *
 * Findings are reported per pattern with an occurrence count and the matched
 * text is never echoed: repeating an injection payload into a log or a report
 * puts it back in front of a model.
 */
function screenDocument(
  raw: string,
  source: string,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const stripped = raw.replace(INVISIBLE_SMUGGLING_CHARS, "");
  if (stripped.length !== raw.length) {
    warnings.push(
      `${source}: ${raw.length - stripped.length} invisible character(s) present. They were ` +
        `removed before screening; rewrite the handoff without them.`,
    );
  }

  const bySeverity = new Map<string, { severity: DenyPattern["severity"]; count: number }>();
  for (const hit of scanNormalized(stripped, HANDOFF_DENY_PATTERNS)) {
    const seen = bySeverity.get(hit.patternId);
    if (seen === undefined) bySeverity.set(hit.patternId, { severity: hit.severity, count: 1 });
    else seen.count += 1;
  }
  for (const [patternId, { severity, count }] of bySeverity) {
    const message =
      `${source}: handoff matches injection pattern "${patternId}" (${count}x). ` +
      `A handoff is read straight into another agent's context; sanitize it before resuming.`;
    if (severity === "block") errors.push(message);
    else warnings.push(message);
  }
  return { errors, warnings };
}

function parseHandoff(raw: string, filePath: string): ParsedHandoff {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Cap first, and bail on it: everything below scans the document, and an
  // oversize file must not be scanned before it is refused.
  const rawBytes = Buffer.byteLength(raw, "utf8");
  if (rawBytes > MAX_HANDOFF_FILE_BYTES) {
    return rejected([fileCapMessage(filePath, rawBytes)], warnings);
  }

  // Whole-document screen before any field is trusted: a frontmatter value is
  // not safer than a body line just because YAML parsed it.
  const screened = screenDocument(raw, filePath);
  errors.push(...screened.errors);
  warnings.push(...screened.warnings);

  const parsed = collect(errors, () => parseFrontmatter(raw, filePath));
  if (parsed === undefined) return rejected(errors, warnings);
  if (!parsed.hadFrontmatter) {
    return rejected(
      [`${filePath}: handoff has no \`---\` frontmatter block. Every handoff declares one.`],
      warnings,
    );
  }

  const fm = parsed.frontmatter;
  const opts = { source: filePath };
  const id = collect(errors, () => requireString(fm, "id", opts));
  const status = collect(errors, () => requireEnum(fm, "status", HANDOFF_STATUSES, opts));
  const created = collect(errors, () => requireString(fm, "created", opts));
  const expires = collect(errors, () => requireString(fm, "expires", opts));
  const summary = collect(errors, () => requireString(fm, "summary", opts));
  const integrity = collect(errors, () => requireString(fm, "integrity", opts));
  const fromTool = collect(errors, () =>
    requireEnum(fm, "fromTool", TOOLS, { ...opts, optional: true }),
  );
  const toTool = collect(errors, () => requireEnum(fm, "toTool", TOOLS, { ...opts, optional: true }));
  const gitRef = collect(errors, () => requireString(fm, "gitRef", { ...opts, optional: true }));

  if (id !== undefined && !HANDOFF_ID_PATTERN.test(id)) {
    errors.push(
      `${filePath}: \`id\` must be <YYYY-MM-DD>_<slug>_<5 hex> (got ${JSON.stringify(id)}).`,
    );
  }
  const createdMs = checkTimestamp(errors, filePath, "created", created);
  const expiresMs = checkTimestamp(errors, filePath, "expires", expires);
  if (createdMs !== null && expiresMs !== null && expiresMs < createdMs) {
    errors.push(`${filePath}: \`expires\` is before \`created\`; the handoff can never be fresh.`);
  }
  if (summary !== undefined) {
    if (summary.trim() === "") {
      errors.push(`${filePath}: \`summary\` is blank. It is the first thing the next agent reads.`);
    } else if (summary.length > MAX_SUMMARY_LENGTH) {
      // Advisory, not a refusal: an overlong summary is a readability defect,
      // and refusing the handoff over it would cost more than it protects.
      warnings.push(
        `${filePath}: \`summary\` is ${summary.length} chars, over ${MAX_SUMMARY_LENGTH}. ` +
          `Keep it to one line; the detail belongs in the body.`,
      );
    }
  }

  const unknown = unknownFields(fm, KNOWN_FRONTMATTER_FIELDS);
  if (unknown.length > 0) {
    // Warn rather than reject: a newer writer may record a field this reader
    // does not know, and dropping the whole handoff over it loses the work.
    warnings.push(
      `${filePath}: unknown frontmatter field(s) ${unknown.map((key) => JSON.stringify(key)).join(", ")}. ` +
        `They are ignored.`,
    );
  }

  checkBody(errors, filePath, parsed.body);
  if (integrity !== undefined && summary !== undefined) {
    checkIntegrity(errors, filePath, integrity, summary, parsed.body);
  }

  const frontmatter = buildFrontmatter({
    id,
    status,
    created,
    expires,
    summary,
    integrity,
    fromTool,
    toTool,
    gitRef,
  });
  // A `null` frontmatter always coincides with a recorded error — every
  // required read that returns undefined pushed one — so no rejection here
  // comes back with an empty error list.
  if (frontmatter === null || errors.length > 0) return rejected(errors, warnings);
  return {
    handoff: { frontmatter, body: parsed.body, filePath },
    result: { valid: true, errors, warnings },
  };
}

/** Record a defect for a non-ISO timestamp; returns the parsed epoch or `null`. */
function checkTimestamp(
  errors: string[],
  source: string,
  field: string,
  value: string | undefined,
): number | null {
  if (value === undefined) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    errors.push(`${source}: \`${field}\` must be an ISO-8601 timestamp (got ${JSON.stringify(value)}).`);
    return null;
  }
  return ms;
}

function checkBody(errors: string[], source: string, body: string): void {
  if (body.trim() === "") {
    errors.push(`${source}: handoff body is empty. There is no state to resume from.`);
    return;
  }
  if (BINARY_CONTENT_PATTERN.test(body)) {
    errors.push(`${source}: handoff body contains a null byte. Only UTF-8 text is accepted.`);
    return;
  }
  const bodyBytes = Buffer.byteLength(body, "utf8");
  if (bodyBytes > MAX_HANDOFF_BODY_BYTES) {
    errors.push(
      `${source}: handoff body is ${bodyBytes} bytes, over the ${MAX_HANDOFF_BODY_BYTES} byte limit. ` +
        `Split the work or compact the narrative.`,
    );
  }

  const present = extractSectionHeadings(body);
  const missing = REQUIRED_BODY_SECTIONS.filter((heading) => !present.has(heading));
  if (missing.length > 0) {
    errors.push(
      `${source}: handoff body is missing required section(s) ${missing.map((heading) => `"## ${heading}"`).join(", ")}.`,
    );
  }

  // The deny scan itself runs once over the WHOLE normalized document
  // (`screenDocument`), so it is not repeated here: a body-only pass would
  // double-report every hit and still miss the frontmatter.
}

function checkIntegrity(
  errors: string[],
  source: string,
  declared: string,
  summary: string,
  body: string,
): void {
  if (!INTEGRITY_PATTERN.test(declared)) {
    errors.push(
      `${source}: \`integrity\` must be "sha256:<64 hex>" (got ${JSON.stringify(declared)}).`,
    );
    return;
  }
  const computed = computeHandoffIntegrity(summary, body);
  if (computed !== declared) {
    errors.push(
      `${source}: \`integrity\` does not match the summary and body (declared ${declared}, ` +
        `computed ${computed}). The handoff was edited after it was written.`,
    );
  }
}

/** Assemble the head once every required field is present; `null` otherwise. */
function buildFrontmatter(parts: {
  id: string | undefined;
  status: HandoffStatus | undefined;
  created: string | undefined;
  expires: string | undefined;
  summary: string | undefined;
  integrity: string | undefined;
  fromTool: HandoffFrontmatter["fromTool"];
  toTool: HandoffFrontmatter["toTool"];
  gitRef: string | undefined;
}): HandoffFrontmatter | null {
  const { id, status, created, expires, summary, integrity } = parts;
  if (
    id === undefined ||
    status === undefined ||
    created === undefined ||
    expires === undefined ||
    summary === undefined ||
    integrity === undefined
  ) {
    return null;
  }
  // Optionals are spread in only when present, so an absent field stays absent
  // rather than becoming a defined-as-undefined key on the parsed object.
  return {
    id,
    status,
    created,
    expires,
    summary,
    integrity,
    ...(parts.fromTool === undefined ? {} : { fromTool: parts.fromTool }),
    ...(parts.toTool === undefined ? {} : { toTool: parts.toTool }),
    ...(parts.gitRef === undefined ? {} : { gitRef: parts.gitRef }),
  };
}

/** `## <heading>` lines, trimmed. CRLF documents included. */
function extractSectionHeadings(body: string): Set<string> {
  const headings = new Set<string>();
  const pattern = /^##[ \t]+(.+)$/gm;
  for (const match of body.matchAll(pattern)) {
    const heading = match[1]?.trim();
    if (heading !== undefined && heading !== "") headings.add(heading);
  }
  return headings;
}

/**
 * Validate every `.md` file in `dir`.
 *
 * One bad file never disarms the set: defective entries land in `invalid` with
 * their reasons while the healthy ones still parse, and the active-set count is
 * reported whether or not it is over the cap. A missing directory is the normal
 * state of a repo that has written no handoffs, so it yields an empty result;
 * a directory that exists but cannot be read is an environment failure and
 * throws.
 */
export async function validateHandoffsDirectory(dir: string): Promise<HandoffsDirectoryResult> {
  const valid: Handoff[] = [];
  const invalid: { file: string; errors: string[] }[] = [];

  // Reads run concurrently but bounded — a directory of handoffs is small by
  // design, yet an unbounded fan-out over an unexpected one exhausts file
  // descriptors. Parsing stays in the ordered loop below, so results come back
  // in filename order no matter which read finished first.
  const files = await listHandoffFiles(dir);
  const contents = await pLimit(READ_CONCURRENCY).map(files, (file) =>
    readHandoffFile(join(dir, file)),
  );

  for (const [index, file] of files.entries()) {
    const raw = contents[index]!;
    if (typeof raw !== "string") {
      invalid.push({ file, errors: [raw.error] });
      continue;
    }
    const { handoff, result } = parseHandoff(raw, join(dir, file));
    if (handoff === null) invalid.push({ file, errors: result.errors });
    else valid.push(handoff);
  }

  const activeCount = valid.filter((handoff) => ACTIVE_STATUSES.has(handoff.frontmatter.status))
    .length;
  return {
    valid,
    invalid,
    activeCount,
    overActiveCap: activeCount > MAX_ACTIVE_HANDOFFS_PER_REPO,
  };
}

/** Sorted `.md` entries, so results are ordered the same way on every platform. */
async function listHandoffFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((name) => name.endsWith(HANDOFF_FILE_EXTENSION)).toSorted();
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new EngineError(
      `Cannot read the handoff directory ${dir}: ${cause instanceof Error ? cause.message : String(cause)}. ` +
        `Check the path and its permissions.`,
      { code: "FS_ERROR", cause },
    );
  }
}

/**
 * Read one handoff, refusing an oversize file on its size alone — the cap is
 * checked against `stat` before the bytes are pulled into memory.
 */
async function readHandoffFile(path: string): Promise<string | { error: string }> {
  try {
    const stats = await stat(path);
    if (!stats.isFile()) return { error: `${path}: not a regular file.` };
    if (stats.size > MAX_HANDOFF_FILE_BYTES) return { error: fileCapMessage(path, stats.size) };
    return await readFile(path, "utf8");
  } catch (cause) {
    return {
      error: `${path}: cannot be read (${cause instanceof Error ? cause.message : String(cause)}).`,
    };
  }
}
