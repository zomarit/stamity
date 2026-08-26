import { readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { composeFrontmatter, parseFrontmatter } from "../content/frontmatter.ts";
import { persistLearning } from "../learnings/store.ts";
import {
  LEARNING_CONFIDENCE_LEVELS,
  MAX_LEARNING_SUMMARY_LENGTH,
  REQUIRED_LEARNING_SECTIONS,
  resolveLearningsCaps,
  validateLearningContent,
  type LearningConfidence,
} from "../learnings/validation.ts";
import { ENV_MCP_FILE, ensureGitignoreEntry, hardenEnvMcpMode } from "../mcp/env.ts";
import { atomicWriteFile } from "../merge/atomicWrite.ts";
import {
  VALID_COMMUNICATION_STYLES,
  VALID_MATURITY_TIERS,
  VALID_TOOLS,
  type CommunicationStyle,
  type MaturityTier,
  type Tool,
} from "../types/core.ts";
import { CONTENT_PREFIX, STATE_DIR } from "../types/markers.ts";
import {
  PREDECESSOR_CONTENT_PREFIX,
  PREDECESSOR_MARKER_VARIANTS,
  type PredecessorState,
} from "./detect.ts";

/**
 * Guided migration, half two: turn a {@link PredecessorState} into a plan, and
 * — unless the caller asked for a dry run — execute it.
 *
 * Three things transfer, and the spec is explicit that nothing else does. The
 * predecessor's manifest becomes *defaults offered at init*, never a manifest we
 * adopt; its learnings are re-persisted through this engine's own store, so they
 * arrive re-validated, re-sanitized and re-stamped rather than trusted; its MCP
 * credential file carries across untouched. Snapshots, telemetry, pack receipts
 * and every adapter output stay behind: a v2 setup re-derives all of them, and
 * carrying a receipt would import a trust decision the new engine never made.
 * Per-artifact overrides are reported and left alone — the two artifact id sets
 * are not the same, so an automatic remap would silently retarget a user's
 * customization at the wrong artifact.
 *
 * Stripping the old managed blocks is the destructive half, and it is written to
 * be boring: the parser works on character offsets of the original text, so
 * every byte outside a matched block — CRLF endings, trailing whitespace, the
 * blank lines that surrounded the block — comes back identical, and a pair it
 * cannot resolve leaves the file untouched. This engine's own managed-block
 * module is not involved: it knows this engine's markers, and teaching it a
 * second vocabulary to serve one migration is how a merge layer gets a foreign
 * marker set it can never remove.
 *
 * `dryRun: true` plans everything and writes nothing at all — no file, no
 * directory, no `.gitignore` line — so an init flow can show the operator the
 * exact counts before asking.
 */

// ── Defaults ─────────────────────────────────────────────────────

/**
 * Configuration lifted from a predecessor manifest, as *offered* defaults.
 *
 * Every member is optional and absent means "we could not read it", never "the
 * user chose nothing": a field we cannot make sense of is dropped so the init
 * flow falls back to its own detection instead of persisting a guess.
 */
export interface PredecessorDefaults {
  /** Target tools, narrowed to the ids this engine knows. */
  tools?: Tool[];
  /** Content-selection team size. */
  /** Investment-calibration tier. */
  maturityTier?: MaturityTier;
  /** How generated agents address the operator. */
  communicationStyle?: CommunicationStyle;
  /** MCP server ids, as written. Validated against this engine's catalog downstream. */
  mcpServers?: string[];
}

/**
 * Read a predecessor manifest field by field.
 *
 * Tolerant by construction: the argument is whatever `JSON.parse` returned, the
 * document is never checked against the predecessor's schema, and each field is
 * read independently — a manifest with one corrupt member still yields the rest.
 * A `null` argument, a non-object, or a document with nothing recognizable all
 * produce `{}`.
 *
 * Field names come from generation 3 of that schema, with this engine's own
 * spelling accepted as a fallback where the two differ (`maturity` there,
 * `maturityTier` here). The predecessor's `content.teamSize` is deliberately
 * NOT carried: this engine has no team-size axis to carry it into. Tool ids
 * overlap exactly for the three tools both projects support, so the narrowing is
 * a set-membership filter rather than a translation table — an id this engine
 * does not know is dropped, not renamed.
 */
export function mapPredecessorDefaults(
  manifestRaw: Record<string, unknown> | null,
): PredecessorDefaults {
  if (manifestRaw === null) return {};

  const defaults: PredecessorDefaults = {};

  const tools = uniqueStrings(field(manifestRaw, "tools")).filter(isTool);
  if (tools.length > 0) defaults.tools = tools;

  const maturityTier = readEnum(
    field(manifestRaw, "maturity") ?? field(manifestRaw, "maturityTier"),
    VALID_MATURITY_TIERS,
  );
  if (maturityTier !== undefined) defaults.maturityTier = maturityTier as MaturityTier;

  const communicationStyle = readEnum(
    field(manifestRaw, "communicationStyle"),
    VALID_COMMUNICATION_STYLES,
  );
  if (communicationStyle !== undefined) {
    defaults.communicationStyle = communicationStyle as CommunicationStyle;
  }

  const mcp = field(manifestRaw, "mcp");
  const mcpServers = isRecord(mcp) ? uniqueStrings(field(mcp, "servers")) : [];
  if (mcpServers.length > 0) defaults.mcpServers = mcpServers;

  return defaults;
}

// ── Block strip ──────────────────────────────────────────────────

/** What happened to one marked file. */
export interface BlockStripResult {
  /** The path as it was given — repo-relative, so a report reads like the detection did. */
  path: string;
  /**
   * - `stripped` — one or more complete blocks removed, everything else kept.
   * - `deleted` — the file held nothing but blocks and whitespace.
   * - `unchanged` — no block, a broken pair, or a file that could not be read.
   */
  action: "stripped" | "deleted" | "unchanged";
}

/**
 * Remove the predecessor's managed blocks from each of `markedFiles`.
 *
 * Files are processed in the order given, one at a time, and each is judged on
 * its own: a file with no marker, an unreadable file, and a file whose BEGIN
 * marker never closes all report `unchanged` and are never written to. The
 * broken-pair rule is the important one — a BEGIN without a matching END in the
 * same comment syntax refuses the *whole file*, including blocks earlier in it,
 * because a file someone hand-edited is exactly where a guess about block extent
 * would delete their work.
 *
 * A file left holding only whitespace is deleted rather than truncated: it was
 * generated in full by the predecessor and an empty `CLAUDE.md` is residue, not
 * content.
 *
 * `dryRun` computes every action and performs none of them, so the returned rows
 * are the same in both modes.
 */
export async function stripPredecessorBlocks(
  rootDir: string,
  markedFiles: readonly string[],
  opts?: { dryRun?: boolean },
): Promise<BlockStripResult[]> {
  const root = resolve(rootDir);
  const dryRun = opts?.dryRun ?? false;

  const results: BlockStripResult[] = [];
  for (const relative of markedFiles) {
    // oxlint-disable-next-line no-await-in-loop -- one writer at a time: a caller may name the same file twice, and two overlapping read-modify-writes would drop one file's blocks
    results.push(await stripOne(root, relative, dryRun));
  }
  return results;
}

async function stripOne(
  root: string,
  relative: string,
  dryRun: boolean,
): Promise<BlockStripResult> {
  const path = join(root, ...relative.split("/"));

  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch {
    return { path: relative, action: "unchanged" };
  }

  const stripped = removePredecessorBlocks(content);
  if (stripped === null || stripped === content) return { path: relative, action: "unchanged" };

  if (stripped.trim() === "") {
    if (!dryRun) await rm(path, { force: true });
    return { path: relative, action: "deleted" };
  }

  if (!dryRun) await atomicWriteFile(path, stripped);
  return { path: relative, action: "stripped" };
}

/** One line of the scanned document, located by character offset. */
interface ScannedLine {
  /** Index of the line's first character. */
  start: number;
  /** Index one past its last character, excluding the newline. */
  end: number;
  /** Index of the next line's first character; the document length on the last line. */
  next: number;
  /** The line with surrounding whitespace — a trailing CR included — removed. */
  trimmed: string;
}

/**
 * The document text with every complete marker pair removed, `content` itself
 * when there is no pair, or `null` when a BEGIN marker never closes.
 *
 * A removed span runs from the first character of the BEGIN line through the
 * newline that ends the END line, so the lines around the block keep their exact
 * bytes: a `\r\n` document stays `\r\n`, and a blank line that separated the
 * block from user prose is still there afterwards. Blocks are matched within one
 * comment syntax — a BEGIN in one syntax never pairs with an END in another —
 * and a file may hold several.
 */
function removePredecessorBlocks(content: string): string | null {
  const lines = scanLines(content);
  const spans: { start: number; end: number }[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) break;

    const variant = PREDECESSOR_MARKER_VARIANTS.find((candidate) =>
      candidate.begin.test(line.trimmed),
    );
    if (variant === undefined) continue;

    let close = -1;
    for (let j = i + 1; j < lines.length && close === -1; j += 1) {
      if (variant.end.test(lines[j]?.trimmed ?? "")) close = j;
    }
    if (close === -1) return null;

    spans.push({ start: line.start, end: lines[close]?.next ?? content.length });
    i = close;
  }

  if (spans.length === 0) return content;

  let result = "";
  let cursor = 0;
  for (const span of spans) {
    result += content.slice(cursor, span.start);
    cursor = span.end;
  }
  return result + content.slice(cursor);
}

/** Split on `\n`, keeping every offset, so nothing has to be re-joined later. */
function scanLines(content: string): ScannedLine[] {
  const lines: ScannedLine[] = [];
  let start = 0;
  for (;;) {
    const newline = content.indexOf("\n", start);
    const end = newline === -1 ? content.length : newline;
    const next = newline === -1 ? content.length : newline + 1;
    lines.push({ start, end, next, trimmed: content.slice(start, end).trim() });
    if (newline === -1) return lines;
    start = next;
  }
}

// ── Carry ────────────────────────────────────────────────────────

/** What a carry moved, or would move. */
export interface CarryReport {
  /** Learnings re-persisted through this engine's store. */
  learningsCarried: number;
  /**
   * Every other `.md` the predecessor's learnings directory held: the store's
   * refusals (schema, size, injection screen, name collision), the predecessor's
   * own seeded scaffolding ({@link CARRY_EXCLUDED_NAMES}), and files whose head
   * is not a predecessor learning's. Carried plus skipped accounts for the
   * directory exactly, so nothing is dropped without a number behind it.
   */
  learningsSkipped: number;
  /** Whether the predecessor's `.env.mcp` is in place and gitignored. */
  envMcpCarried: boolean;
  /** Whether an overrides directory exists — reported for the operator, never mapped. */
  overridesPresent: boolean;
  /** One row per marked file, in the order they were listed. */
  strips: BlockStripResult[];
  /** Echo of the mode this report was produced in. */
  dryRun: boolean;
}

/**
 * Execute the transfer described by `state`.
 *
 * Order is deliberate: learnings and credentials move first, blocks are stripped
 * last. A strip is the only step that removes something, so it runs after the
 * steps that could still fail on their own terms.
 *
 * With `dryRun: true` nothing is written. Learning outcomes are then predicted by
 * running the store's own content gate plus the name-collision and directory-cap
 * checks it would apply, so the counts an operator is shown before consenting are
 * the counts they get.
 *
 * Filesystem failures from the engine store propagate as typed `EngineError`s —
 * an unwritable repo is an environment problem the caller must report, not a
 * migration outcome. A single predecessor file that cannot be read or mapped is
 * a skip, not a failure.
 */
export async function carryPredecessorAssets(
  rootDir: string,
  state: PredecessorState,
  opts: { dryRun: boolean; now?: Date },
): Promise<CarryReport> {
  const root = resolve(rootDir);
  const now = opts.now ?? new Date();
  const { dryRun } = opts;

  const learnings = await carryLearnings(root, state.learningsDir, dryRun, now);
  const envMcpCarried = await carryEnvMcp(root, state.envMcpPath, dryRun);
  const strips = await stripPredecessorBlocks(root, state.markedFiles, { dryRun });

  return {
    learningsCarried: learnings.carried,
    learningsSkipped: learnings.skipped,
    envMcpCarried,
    overridesPresent: state.overridesDir !== null,
    strips,
    dryRun,
  };
}

/**
 * Learnings subdirectory under {@link STATE_DIR}. Mirrors the private
 * `learningsDir` helper in `../learnings/store.ts`; used read-only, to plan
 * collisions in a dry run. Writes always go through the store, which owns the
 * path for real.
 */
const ENGINE_LEARNINGS_DIR = "learnings";

/**
 * Names in the predecessor's learnings directory that are its own scaffolding,
 * not an operator's note.
 *
 * The predecessor SEEDS `README.md` there at init: a document that names that
 * product, states its five-key head as the canonical schema, and prints a
 * worked example note to copy. Mapped like any other file it passed every write
 * gate — it is well-formed markdown — and landed in `.stamity/learnings/`, where
 * this engine reads the directory back into the model's opening context on the
 * next session. Every migration therefore re-injected the predecessor's product
 * name and its schema instructions into the first thing the agent reads. Excluded
 * by name because that is what the file IS, independent of what it contains;
 * `INDEX.md` joins it as the same class of generated directory front-matter.
 *
 * Matched case-insensitively: a case-insensitive filesystem hands back whichever
 * spelling the directory happens to hold, so `Readme.md` is the same file.
 */
const CARRY_EXCLUDED_NAMES: ReadonlySet<string> = new Set(["readme.md", "index.md"]);

/** Whether `name` is scaffolding rather than a note. See {@link CARRY_EXCLUDED_NAMES}. */
function isExcludedLearningName(name: string): boolean {
  return CARRY_EXCLUDED_NAMES.has(name.toLowerCase());
}

async function carryLearnings(
  root: string,
  sourceDir: string | null,
  dryRun: boolean,
  now: Date,
): Promise<{ carried: number; skipped: number }> {
  if (sourceDir === null) return { carried: 0, skipped: 0 };

  const sourceNames = (await listMarkdownNames(sourceDir)).toSorted();
  if (sourceNames.length === 0) return { carried: 0, skipped: 0 };

  const caps = resolveLearningsCaps();
  const taken = new Set(await listMarkdownNames(join(root, STATE_DIR, ENGINE_LEARNINGS_DIR)));

  let carried = 0;
  let skipped = 0;

  for (const sourceName of sourceNames) {
    if (isExcludedLearningName(sourceName)) {
      skipped += 1;
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop -- notes are admitted one at a time: the store decides each write against the directory the previous one left behind (name collisions, file cap)
    const mapped = await mapLearningFile(sourceDir, sourceName, now);
    if (mapped === null) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      const admissible =
        !taken.has(mapped.fileName) &&
        taken.size < caps.maxCount &&
        validateLearningContent(mapped.fileName, mapped.content, {
          maxFileBytes: caps.maxFileBytes,
          now,
        }).valid;
      if (admissible) {
        taken.add(mapped.fileName);
        carried += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    // The store is the authority on admission: it re-runs the four write gates,
    // neutralizes what is left, stamps a fresh integrity digest over the body it
    // actually writes, and refuses to overwrite an existing slug.
    // oxlint-disable-next-line no-await-in-loop -- same admission chain as the read above
    const result = await persistLearning({
      rootDir: root,
      fileName: mapped.fileName,
      content: mapped.content,
      caps,
      now,
    });
    if (result.written) carried += 1;
    else skipped += 1;
  }

  return { carried, skipped };
}

/** A predecessor note rewritten into this engine's learning schema. */
interface MappedLearning {
  fileName: string;
  content: string;
}

async function mapLearningFile(
  sourceDir: string,
  sourceName: string,
  now: Date,
): Promise<MappedLearning | null> {
  let raw: string;
  try {
    raw = await readFile(join(sourceDir, sourceName), "utf8");
  } catch {
    return null;
  }
  return mapPredecessorLearning(sourceName, raw, now);
}

/**
 * Sections appended when the predecessor note does not already carry them. The
 * headings are required by this engine's learning schema; the text under each is
 * the honest statement of what a carried note is — a finding recorded elsewhere,
 * for a repo that has not re-checked it.
 */
const CARRIED_SECTION_NOTES: Record<string, string> = {
  Why: "Carried over from the predecessor setup. The note above is the finding as it was recorded there; its reasoning was not captured under a heading of its own.",
  "How to apply":
    "Re-verify this note against the current repo before acting on it, then fold the outcome into the artifact it belongs to.",
};

const FALLBACK_SECTION_NOTE = "Carried over from the predecessor setup; not yet re-checked here.";

/**
 * The head keys the predecessor's learning schema declares — its canonical
 * five, `supersedes` excluded because that one is optional there.
 *
 * PRESENCE is the whole test, and deliberately so: a note whose `created` is
 * unparseable or whose `confidence` is not one of this engine's levels is still
 * a note, and the field-by-field mapping below already has a fallback for each.
 * What the five keys answer is a different question — whether this file is a
 * predecessor LEARNING at all, rather than some other markdown that happened to
 * be filed in the same directory. Without that question a stray design doc, a
 * scratch note, or the directory's own generated front-matter arrived in
 * `.stamity/learnings/` as a first-class learning and was read back into the
 * model's opening context on the next session.
 */
const PREDECESSOR_LEARNING_HEAD_KEYS: readonly string[] = [
  "id",
  "topic",
  "applies-to",
  "confidence",
  "created",
];

/** Whether a parsed head carries every key in {@link PREDECESSOR_LEARNING_HEAD_KEYS}. */
function hasPredecessorLearningHead(head: Record<string, unknown>): boolean {
  return PREDECESSOR_LEARNING_HEAD_KEYS.every((key) => Object.hasOwn(head, key));
}

/**
 * Rewrite one predecessor note into a document this engine's store will accept.
 *
 * The head is rebuilt rather than carried: the two schemas share only
 * `confidence`, and passing unknown keys through would hand the injection screen
 * a surface the predecessor never screened. What survives is what the spec names
 * — the title (first heading, else the file stem), the summary (declared
 * `summary`, else the opening paragraph, capped at the store's limit), the
 * confidence (passed through when it is one of this engine's levels, otherwise
 * `medium`, which is the honest reading of an unrecognized rating) — plus the
 * date, taken from the predecessor's `created` field so a carried note keeps its
 * age, and a `carriedFrom` line recording where it came from.
 *
 * The body is kept verbatim apart from its surrounding whitespace, and the two
 * sections this engine requires are appended only when the note lacks them. A
 * note whose own body already answers "Why" keeps its own words.
 *
 * Returns `null` for the two defects that have to be settled before the store is
 * called at all: a file name that cannot become a valid slug, and a head that is
 * not a predecessor learning's ({@link PREDECESSOR_LEARNING_HEAD_KEYS}). Every
 * other defect is left for the store to judge and report as a skip.
 */
function mapPredecessorLearning(
  sourceName: string,
  raw: string,
  now: Date,
): MappedLearning | null {
  const fileName = carriedLearningName(sourceName);
  if (fileName === null) return null;

  let head: Record<string, unknown> = {};
  let body = raw;
  try {
    const parsed = parseFrontmatter(raw, `Predecessor learning "${sourceName}"`);
    head = parsed.frontmatter;
    body = parsed.body;
  } catch {
    // A head that is not valid YAML is not a reason to drop the note: keep the
    // whole document as the body and let every field fall back below. It does
    // leave `head` empty, which the identity check immediately after reads as
    // "not a predecessor learning" — a note this engine cannot even confirm the
    // shape of is not one it re-injects into a later session's context.
  }
  if (!hasPredecessorLearningHead(head)) return null;

  const core = body.trim();
  const title = firstHeading(core) ?? fileName.slice(0, -".md".length);
  const summary =
    truncate(readText(head, "summary") ?? firstParagraph(core) ?? "", MAX_LEARNING_SUMMARY_LENGTH) ||
    truncate(title, MAX_LEARNING_SUMMARY_LENGTH);

  const sections = [core];
  for (const section of REQUIRED_LEARNING_SECTIONS) {
    if (hasSection(core, section)) continue;
    sections.push(`## ${section}\n\n${CARRIED_SECTION_NOTES[section] ?? FALLBACK_SECTION_NOTE}`);
  }

  const content = composeFrontmatter(
    {
      id: fileName.slice(0, -".md".length),
      title,
      date: calendarDate(readText(head, "date")) ?? calendarDate(readText(head, "created")) ?? isoDay(now),
      confidence: readConfidence(head),
      summary,
      carriedFrom: sourceName,
    },
    `\n${sections.join("\n\n")}\n`,
  );

  return { fileName, content };
}

/**
 * The name a carried note takes: the predecessor's content prefix swapped for
 * this engine's, then reduced to the bare kebab slug the store's name gate
 * requires. `null` when nothing usable survives — a name made entirely of
 * separators has no slug to give.
 */
function carriedLearningName(sourceName: string): string | null {
  const stem = sourceName.endsWith(".md") ? sourceName.slice(0, -".md".length) : sourceName;
  const renamed = stem.startsWith(PREDECESSOR_CONTENT_PREFIX)
    ? `${CONTENT_PREFIX}${stem.slice(PREDECESSOR_CONTENT_PREFIX.length)}`
    : stem;
  const slug = renamed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? null : `${slug}.md`;
}

function readConfidence(head: Record<string, unknown>): LearningConfidence {
  const declared = readText(head, "confidence")?.toLowerCase();
  return LEARNING_CONFIDENCE_LEVELS.find((level) => level === declared) ?? "medium";
}

/** Text of the first ATX heading, or `null` when the body opens with prose. */
function firstHeading(body: string): string | null {
  const heading = /^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(body)?.[1]?.trim();
  return heading === undefined || heading === "" ? null : heading;
}

/**
 * The first run of prose lines, collapsed to one line. Headings, blank lines,
 * thematic breaks and fenced code are skipped before the paragraph starts and
 * end it once it has, so a note that opens with `## Context` summarizes from the
 * sentence under that heading rather than from the heading itself.
 */
function firstParagraph(body: string): string | null {
  const collected: string[] = [];
  let fenced = false;

  for (const raw of body.split("\n")) {
    const line = raw.trim();
    const isFence = /^(?:`{3,}|~{3,})/.test(line);
    const isBreak = line === "" || /^#{1,6}[ \t]/.test(line) || /^(?:-{3,}|={3,}|\*{3,})$/.test(line);

    if (isFence) {
      if (collected.length > 0) break;
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (isBreak) {
      if (collected.length > 0) break;
      continue;
    }
    collected.push(line);
  }

  const paragraph = collected.join(" ").replace(/\s+/g, " ").trim();
  return paragraph === "" ? null : paragraph;
}

/** Whether the body already carries `section` as an ATX heading, at any level. */
function hasSection(body: string, section: string): boolean {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^#{1,6}[ \\t]*${escaped}\\b`, "im").test(body);
}

async function carryEnvMcp(
  root: string,
  sourcePath: string | null,
  dryRun: boolean,
): Promise<boolean> {
  if (sourcePath === null) return false;
  if (dryRun) return true;

  const destination = join(root, ENV_MCP_FILE);
  // Both projects keep the credential file at the repo root under the same
  // name, so the usual case is that the bytes are already where they belong and
  // the carry is the ignore rule. Copying a file onto itself would churn it for
  // nothing; the copy exists for the case where the two paths differ.
  if (resolve(sourcePath) !== destination) {
    // Through the atomic writer, not `copyFile`: both `copyFile` and the `chmod`
    // that followed it FOLLOW a symbolic link standing at the destination, so a
    // planted `<root>/.env.mcp -> <outside>/authorized_keys` would deposit the
    // predecessor's live tokens outside the repo and leave that file 0600. The
    // writer publishes by renaming a temp file over the destination NAME, which
    // replaces a terminal link instead of writing through it, and refuses a
    // directory component that redirects out of the tree holding it. No
    // `boundaryDir`: the destination is the repo root's own child, so the local
    // structural rule is the whole question.
    //
    // Text, like the writer in `../mcp/env.ts` that owns this file: it renders
    // the credential file from a UTF-8 string, so a UTF-8 round trip here is the
    // file's own contract rather than an assumption about arbitrary bytes.
    const credentials = await readFile(sourcePath, "utf8");
    await atomicWriteFile(destination, credentials, { mode: SECRET_FILE_MODE });
  }

  // Owner read/write only: the file holds live tokens, and a predecessor file
  // created before that was enforced must not stay world-readable.
  //
  // OUTSIDE the equality check, which is the fix rather than a tidy-up. Both
  // projects keep this file at the repo root under the same name, so the branch
  // above is the copy case — the one a live migration does not take — and the
  // chmod that sat inside it never ran for a real migrant. What ran instead was
  // nothing: the predecessor's 0644 credential file was adopted as-is and stayed
  // readable by every other account on the host. The mode is a fact about the
  // file, not about whether this carry wrote to it.
  //
  // `hardenEnvMcpMode` lstats first, so a symbolic link standing at the
  // destination — the self-copy path is the only way one survives to here — is
  // left alone rather than chmodded through, which would re-permission a file
  // outside the repo.
  await hardenEnvMcpMode(destination);
  await ensureGitignoreEntry(root);
  return true;
}

/** Owner read/write only — mirrors the mode `../mcp/env.ts` writes the file with. */
const SECRET_FILE_MODE = 0o600;

// ── Shared helpers ───────────────────────────────────────────────

async function listMarkdownNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Own properties only: the manifest is a document this engine did not author. */
function field(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTool(name: string): name is Tool {
  return VALID_TOOLS.has(name);
}

/** Non-blank strings from an array value, trimmed, first occurrence kept. */
function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const strings = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  return [...new Set(strings)];
}

/** A string value that is a member of `allowed`, else `undefined`. */
function readEnum(value: unknown, allowed: Set<string>): string | undefined {
  return typeof value === "string" && allowed.has(value) ? value : undefined;
}

/** A trimmed, non-blank string field. Numbers and booleans read as absent. */
function readText(record: Record<string, unknown>, key: string): string | undefined {
  const value = field(record, key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function truncate(value: string, limit: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > limit ? collapsed.slice(0, limit).trimEnd() : collapsed;
}

/** An ISO calendar date that is also a real day, else `undefined`. */
function calendarDate(value: string | undefined): string | undefined {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(value)
    ? undefined
    : value;
}

function isoDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}
