import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildContentIndex, type ContentIndex } from "../../src/content/catalog.ts";
import {
  frontmatterField,
  parseFrontmatter,
  type ParsedFrontmatter,
} from "../../src/content/frontmatter.ts";
import { scanForDeniedPatterns } from "../../src/denyscan/denyScan.ts";
import { stripEngineContentPrefix } from "../../src/types/markers.ts";

/**
 * Shared harness for the corpus test suites. Every corpus test imports its
 * corpus view and its per-file assertions from here, so the suites agree on
 * three things stated once:
 *
 *   - **Where the corpus is.** {@link CORPUS_ROOT} is `<repoRoot>/content`,
 *     computed from this file's own location — never the engine's bundled-root
 *     probe, which caches process-wide and prefers whichever of `content/` and
 *     `dist/content/` exists. Tests must bind the source corpus regardless of
 *     build state, so the root is explicit and layout-deterministic.
 *   - **What the corpus contains.** {@link walkAllMarkdown} returns every `.md`
 *     under the root, recursively — the charter and skill `references/` files
 *     included, which the catalog walk misses by design (they are not catalog
 *     items). {@link loadCorpusIndex} is the catalog's own view, for suites
 *     that assert on indexed identity.
 *   - **How a defect reads.** The `require*`/`assert*` helpers throw a plain
 *     `Error` whose message leads with the file's content-root-relative path,
 *     so a failing suite names the artifact to fix whether the helper is
 *     called directly or collected into an aggregate report.
 *
 * Engine parsing is imported, never re-implemented: frontmatter splitting is
 * `parseFrontmatter` (BOM/CRLF handling, no re-split on `---` inside bodies),
 * deny scanning is `scanForDeniedPatterns`. An absent corpus is a legitimate
 * state (an early tree ships only the charter): absence yields empty results, and
 * only defective files that exist can fail a suite.
 */

/** One markdown file under the corpus root, raw and parsed. */
export interface CorpusFile {
  /** Absolute path of the file. */
  absPath: string;
  /** POSIX path relative to the corpus root. */
  relPath: string;
  /** Full file text as read from disk. */
  raw: string;
  /** Engine-parsed frontmatter and body. */
  parsed: ParsedFrontmatter;
}

/**
 * The closed `load:` vocabulary from the authoring invariants: every artifact
 * declares its load class, and only the charter may declare `always`.
 * Which classes are allowed WHERE is the caller's statement, per
 * {@link requireLoadClass}; this is the full enum.
 */
export const LOAD_CLASSES: readonly string[] = ["always", "on-demand", "reference"];

/** Artifact file extension. `.mdc` and other generated formats never match. */
const ARTIFACT_EXTENSION = ".md";

/** The readable file inside a skill directory — mirrors the catalog's layout constant. */
const SKILL_FILE = "SKILL.md";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The canonical corpus root: `<repoRoot>/content`, explicit — never the bundled-root probe. */
export const CORPUS_ROOT: string = join(REPO_ROOT, "content");

/**
 * The catalog's view of the corpus, built over {@link CORPUS_ROOT} (or a
 * fixture root). Absent class directories contribute nothing — an empty
 * corpus yields an empty index, per the engine contract.
 */
export function loadCorpusIndex(root: string = CORPUS_ROOT): Promise<ContentIndex> {
  return buildContentIndex(root);
}

/**
 * Every `.md` file under `root`, recursively, sorted by relative path in
 * codepoint order so suite output is stable across platforms.
 *
 * Broader than the catalog on purpose: the charter directory and skill
 * `references/` trees are corpus content the catalog does not index, and the
 * frontmatter contract binds them all. A file with no frontmatter block comes
 * back with `parsed.hadFrontmatter === false` (a README is walked, and it is
 * the suite's decision to skip it); a file whose frontmatter is present but
 * malformed throws `VALIDATION_ERROR` naming the file, matching the catalog's
 * loud-failure posture. An absent root — before the corpus lands — is
 * an empty walk, not a failure.
 */
export async function walkAllMarkdown(root: string = CORPUS_ROOT): Promise<CorpusFile[]> {
  let entries;
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (isAbsence(error)) return [];
    throw error;
  }

  const targets = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(ARTIFACT_EXTENSION))
    .map((entry) => {
      const absPath = join(entry.parentPath, entry.name);
      return { absPath, relPath: relative(root, absPath).split(sep).join("/") };
    })
    .toSorted(byRelPath);

  return Promise.all(
    targets.map(async ({ absPath, relPath }) => {
      const raw = await readFile(absPath, "utf8");
      return { absPath, relPath, raw, parsed: parseFrontmatter(raw, relPath) };
    }),
  );
}

/**
 * Build a {@link CorpusFile} from literal text, without touching disk. Fixture
 * constructor for helper- and contract-level cases: the assertions are pure
 * over this shape, so a defect matrix does not need a seeded directory.
 */
export function corpusFileOf(relPath: string, raw: string): CorpusFile {
  return {
    absPath: `/virtual-corpus/${relPath}`,
    relPath,
    raw,
    parsed: parseFrontmatter(raw, relPath),
  };
}

/**
 * The artifact id a corpus path implies, per the catalog's slug rules: a
 * `SKILL.md` is addressed by its directory, every other file by its basename,
 * and the engine's filename prefixes — `stamity-` on agents and rules, `st-` on
 * commands and skills — are a namespacing convention, not identity, so whichever
 * one is present comes off before comparison with the declared id.
 */
export function filenameSlug(relPath: string): string {
  const segments = relPath.split("/");
  const name = segments.at(-1) ?? "";
  const base =
    name === SKILL_FILE ? (segments.at(-2) ?? "") : name.slice(0, -ARTIFACT_EXTENSION.length);
  return stripEngineContentPrefix(base);
}

/**
 * Assert the file declares `load:` with a value from `allowed`.
 *
 * `allowed` is the caller's class-level policy (e.g. `["on-demand"]` for
 * commands, {@link LOAD_CLASSES} for the shape-only contract) and must itself
 * be a subset of the enum — a typo in a suite's policy list would otherwise
 * silently accept values no artifact may carry, so misuse fails loudly here.
 */
export function requireLoadClass(file: CorpusFile, allowed: readonly string[]): void {
  const unknown = allowed.filter((value) => !LOAD_CLASSES.includes(value));
  if (unknown.length > 0) {
    throw new Error(
      `requireLoadClass: ${unknown.map((value) => JSON.stringify(value)).join(", ")} ` +
        `not in the load-class enum (${LOAD_CLASSES.join(", ")}) — fix the suite's allowed list`,
    );
  }

  const load = frontmatterField(file.parsed, "load");
  if (typeof load !== "string" || load === "") {
    fail(file, `\`load\` must be declared — one of: ${allowed.join(", ")}`);
  }
  if (!allowed.includes(load)) {
    fail(file, `\`load\` is ${JSON.stringify(load)} — allowed here: ${allowed.join(", ")}`);
  }
}

/**
 * `below` / `above` used as a POINTER at other prose ("the bar stated below",
 * "the qualification gate below") rather than as a comparison against a value
 * stated right there ("below 10%"). The distinguishing token is a digit
 * immediately after the word: a comparative carries its own number, a deictic
 * pointer carries a noun phrase and leaves the number somewhere else.
 */
const DEICTIC_POINTER = /\b(?:below|above)\b(?!\s+\d)/i;

/**
 * Assert the file carries `obsolete_when:` as a non-empty string that states
 * its own trigger — the deletion condition every artifact declares.
 *
 * Non-emptiness is not enough. Four class pages under `docs/reference/` render
 * `obsolete_when` as a frontmatter-only row, with no body around it: a value
 * ending in "the bar stated below" resolves, on that page, to the NEXT
 * artifact's block. So a value may not lean on `below`/`above` as a reference
 * to prose elsewhere; a comparative that carries its own number (`below 10%`)
 * is exactly what such a value should say instead, and stays legal.
 */
export function requireObsoleteWhen(file: CorpusFile): void {
  const value = frontmatterField(file.parsed, "obsolete_when");
  if (typeof value !== "string" || value.trim() === "") {
    fail(file, "`obsolete_when` must be a non-empty string stating a falsifiable deletion trigger");
  }
  const pointer = DEICTIC_POINTER.exec(value);
  if (pointer !== null) {
    fail(
      file,
      `\`obsolete_when\` points at other prose with ${JSON.stringify(pointer[0])} — the trigger ` +
        "renders alone on the reference page, so it must carry its own value (`below 10%`) " +
        "rather than name a bar stated elsewhere",
    );
  }
}

/**
 * Assert the body is at most `max` lines. Counts the body — the slice emission
 * ships — not the frontmatter head, matching the engine's lean-line accounting
 * (`LEAN_LINE_THRESHOLDS` counts body lines), and discounts the final newline
 * so `"a\n"` is one line, not two.
 */
export function assertLineCap(file: CorpusFile, max: number): void {
  const lines = countBodyLines(file.parsed.body);
  if (lines > max) {
    fail(file, `body is ${lines} lines, over the cap of ${max}`);
  }
}

/**
 * Assert the body carries no block-severity hit from the write-path deny set.
 * Block severity only: warn-class signals (smuggling characters, homoglyph
 * adjacency) are advisory surfaces for other gates, not corpus defects.
 */
export function assertDenyClean(file: CorpusFile): void {
  const hits = scanForDeniedPatterns(file.parsed.body).filter((hit) => hit.severity === "block");
  if (hits.length === 0) return;

  const listed = hits
    .map((hit) => `\`${hit.patternId}\` at offset ${hit.index} (${JSON.stringify(hit.snippet)})`)
    .join("; ");
  const noun = hits.length === 1 ? "a denied pattern" : `${hits.length} denied patterns`;
  fail(file, `body matches ${noun}: ${listed}`);
}

/** Throw a defect message that leads with the file's corpus-relative path. */
function fail(file: CorpusFile, message: string): never {
  throw new Error(`${file.relPath}: ${message}`);
}

/** Lines in a body, discounting the final newline — parity with the engine's line accounting. */
function countBodyLines(body: string): number {
  const trimmed = body.replace(/\r?\n$/, "");
  return trimmed === "" ? 0 : trimmed.split(/\r?\n/).length;
}

/**
 * Absence in the forms the walk can meet: the root is not there, or a path
 * segment turned out to be a file. Anything else is a real failure.
 */
function isAbsence(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/** Codepoint order on relative paths, so the walk does not vary with the host locale. */
function byRelPath(a: { relPath: string }, b: { relPath: string }): number {
  if (a.relPath < b.relPath) return -1;
  return a.relPath > b.relPath ? 1 : 0;
}
