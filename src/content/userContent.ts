import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import pLimit from "p-limit";
import {
  INJECTION_PATTERNS,
  INVISIBLE_SMUGGLING_CHARS,
  NO_HONEST_SHAPE_INJECTION_ROWS,
  foldConfusables,
  joinMaskedWords,
  scanAntiSlop,
  scanForDeniedPatterns,
  type DenyHit,
} from "../denyscan/denyScan.ts";
import { safeWriteFile } from "../merge/safeWrite.ts";
import { CONTENT_CLASSES, type ContentClass } from "../types/content.ts";
import { CONTENT_PREFIX, STATE_DIR } from "../types/markers.ts";
import { parseFrontmatter } from "./frontmatter.ts";

/**
 * User-authored content: the lane a repo writes for itself.
 *
 * A repo's own agents, skills, rules and commands live under
 * `<rootDir>/.stamity/overrides/<class>/`, beside the generated setup and above
 * the bundled corpus wherever the two are merged. This module owns the three
 * operations that lane needs — save one, discover them all, judge one — and
 * deliberately nothing else. It never reads the bundled corpus, so an id that
 * also exists there is not its business to detect: override semantics belong to
 * whoever merges the two trees, and discovery reports a shadowing artifact
 * exactly like any other.
 *
 * One gate, two callers. {@link checkUserArtifact} is the whole judgement, and
 * both lanes that judge a user artifact go through it: the save path here, and
 * `stamity validate` (`../cli/commands/validate.ts`). Before it existed the two
 * ran overlapping-but-different checks — the save path alone compared the
 * declared id against the file name — so an artifact could land through one
 * surface and be reported by the other. A gate that disagrees with itself is
 * a divergence the engine cannot answer for; single-sourcing the helper closes it.
 *
 * Two postures, and the split is the whole design:
 *
 * - **Gentle on quality.** Lean line counts, filler phrasing and undeclared
 *   lifecycle fields come back as warnings and the file still lands. It is the
 *   author's own artifact; the engine advises rather than blocks, because a
 *   gate that blocks on taste is a gate authors learn to route around.
 * - **Strict on shape and safety.** Frontmatter missing `id`/`type`/
 *   `description`/`tags`, an id that disagrees with the file that carries it,
 *   or a block-severity deny hit refuses the save. The first two produce a file
 *   no consumer can index; the third is text that re-enters agent context
 *   verbatim.
 *
 * The lifecycle pair (`load:`, `obsolete_when:`) sits on the gentle side on
 * purpose. Every artifact is required to declare both, and the corpus does — a
 * `load:` class says when the artifact costs context, and `obsolete_when:`
 * names the condition that retires it. But a missing `obsolete_when` makes an
 * artifact un-retirable, not unreadable: the file still indexes, still emits,
 * and still says what it says. Refusing it would put a documentation rule on
 * the same footing as an injection payload, so it warns.
 *
 * Ownership: user files are user-owned end to end. Nothing here wraps output in
 * a managed block, and nothing downstream does either — the same install-once
 * contract installed packs get (`../pack/projection.ts`). Bytes under
 * `.stamity/overrides/` are written by this module and removed by the author;
 * no emission surface ever targets a path inside that tree, so it is never
 * planned, never regenerated, and never reclaimed. What IS regenerated every
 * sync is the per-client PROJECTION of a user artifact — an adapter-owned copy
 * under `.claude/`, `.cursor/`, `.github/` — which is why an override that
 * stops existing stops being emitted on the next sync while its source file is
 * nobody's to sweep.
 *
 * Declared gap: this module and the walk it feeds implement customization by
 * REPLACEMENT — an artifact is customized by taking its id. The `.customize.yaml`
 * and `.customize.md` overlay surfaces (layers 2 and 3 of the four-layer
 * precedence) are read by nothing here and by nothing downstream; two layers
 * ship, canonical frontmatter and then this tree.
 *
 * Content defects come back in the result; environment failures (an unreadable
 * class directory, a write that cannot land) throw the typed error their layer
 * raises. A defective artifact is the author's problem to fix, an unwritable
 * repo is not.
 */

/** The classes a repo can author for itself: the content classes, exactly. */
export type UserArtifactType = ContentClass;

/** One user-authored artifact as it sits on disk. */
export interface UserContentArtifact {
  /** Content class, derived from the class directory the artifact lives in. */
  type: UserArtifactType;
  /** Declared frontmatter `id` when it is a slug, else the file's own slug. */
  id: string;
  /** Absolute path of the readable file (a skill's `SKILL.md`, not its directory). */
  filePath: string;
  /** Parsed frontmatter; empty for a file that declares none or declares it broken. */
  frontmatter: Record<string, unknown>;
  /** Markdown body with the frontmatter block removed. */
  body: string;
  /**
   * The frontmatter block's raw text, fences excluded — what the parser was
   * handed, comments and all. Absent for a file that declares no head.
   *
   * Carried because the parse is LOSSY in one direction that matters: YAML
   * comments are discarded, so a payload written as `# ignore all previous
   * instructions` inside the head reached agent context (a client renders the
   * file, not the parse) while the gate scanned only parsed values and
   * returned clean.
   */
  frontmatterText?: string;
}

/**
 * Body line counts above which an artifact is worth compressing, per class.
 * Advisory, never blocking: each floor tracks what its class reads like when it
 * is doing its job — a rule is a short declarative note, an agent prompt carries
 * role, workflow and worked examples — so crossing one is a signal to look, not
 * a defect to fix.
 */
export const LEAN_LINE_THRESHOLDS: Record<UserArtifactType, number> = {
  agent: 350,
  skill: 200,
  rule: 100,
  command: 200,
};

/** Outcome of one save. `path` is present exactly when `saved`. */
export interface SaveResult {
  saved: boolean;
  /** Absolute path written. */
  path?: string;
  /** Why the save was refused. Empty exactly when `saved`. */
  errors: string[];
  /** Advisories; returned whether or not the artifact landed. */
  warnings: string[];
}

/**
 * One finding against an artifact's shape, body, or safety.
 *
 * - `missing-field` — a required frontmatter field is absent or malformed.
 * - `filename-mismatch` — the declared `id` and the file carrying it disagree.
 * - `missing-lifecycle-field` — `load:` or `obsolete_when:` carries no usable
 *   value. Named for the common case; a declared-but-unusable `load:` class
 *   reports here too, because a class outside the vocabulary declares nothing.
 * - `deny-pattern` — the deny scan matched. The only kind that varies in
 *   severity: block rows refuse, warn rows advise.
 * - `anti-slop` / `lean-lines` — body quality, advisory by construction.
 */
export interface ContentBodyViolation {
  kind:
    | "anti-slop"
    | "lean-lines"
    | "missing-field"
    | "missing-lifecycle-field"
    | "filename-mismatch"
    | "deny-pattern";
  detail: string;
  severity: "warning" | "error";
}

/** What one artifact has to answer for, whichever lane is asking. */
export interface UserArtifactCheckInput {
  /** Content class, derived from the class directory the artifact lives in. */
  readonly type: UserArtifactType;
  /** The id the caller addresses the artifact by. */
  readonly id: string;
  /** Absolute path of the readable file — the file name is half the identity check. */
  readonly filePath: string;
  /** Parsed frontmatter; empty for a file that declares none or declares it broken. */
  readonly frontmatter: Readonly<Record<string, unknown>>;
  /** Markdown body with the frontmatter block removed. */
  readonly body: string;
  /**
   * The frontmatter block's raw text, fences excluded. Absent when the caller
   * has only the parse — the comment scan then has nothing to read, which is
   * the pre-existing behaviour rather than a silent pass: both lanes in this
   * module supply it.
   */
  readonly frontmatterText?: string;
}

/** One artifact's judgement, split by what the caller must do about it. */
export interface UserArtifactCheck {
  /** Refuse the save; `stamity validate` exits non-zero. */
  readonly errors: readonly ContentBodyViolation[];
  /** Land the file and advise. Returned whether or not `errors` is empty. */
  readonly warnings: readonly ContentBodyViolation[];
}

/** The subtree of the state directory user artifacts live in. */
const USER_CONTENT_DIR = "overrides";

/**
 * The repo's override tree — `<rootDir>/.stamity/overrides`.
 *
 * Exported because three surfaces need the same path and none of them should
 * re-join it: this module writes into it, the emission seam hands it to the
 * content walk as the override root (`../cli/engine/emission.ts`), and
 * `stamity validate` names it. A second spelling of this join is a lane that
 * reads a directory nobody writes.
 */
export function userContentRoot(rootDir: string): string {
  return join(rootDir, STATE_DIR, USER_CONTENT_DIR);
}

/**
 * Where each class lives and whether its artifacts are files or directories.
 * Mirrors the bundled corpus layout so one id resolves the same way in the user
 * tree as it does in the corpus it overrides.
 */
const CLASS_LAYOUT: Record<UserArtifactType, { dir: string; layout: "file" | "directory" }> = {
  agent: { dir: "agents", layout: "file" },
  skill: { dir: "skills", layout: "directory" },
  rule: { dir: "rules", layout: "file" },
  command: { dir: "commands", layout: "file" },
};

/** The readable file inside a skill directory. */
const SKILL_FILE = "SKILL.md";

/** Artifact file extension. A rule's `.mdc` twin does not match, and is not an artifact. */
const ARTIFACT_EXTENSION = ".md";

/** Concurrent artifact reads per class directory. */
const READ_CONCURRENCY = 8;

/**
 * Ids are lowercase kebab slugs. The id becomes a file name and emission derives
 * output names from it, so the shape is a containment guarantee as much as a
 * naming convention — no separator, no traversal segment, no surprise casing on
 * a case-insensitive filesystem.
 */
const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Frontmatter every user artifact declares. */
const REQUIRED_FIELDS = ["id", "type", "description", "tags"] as const;

type RequiredField = (typeof REQUIRED_FIELDS)[number];

/**
 * The load classes an artifact may declare. `always` is reserved for the
 * charter, which is not an artifact of any of these classes — so a user
 * artifact declaring it is a corpus-authoring question rather than something
 * this gate rules on, and the value passes here.
 */
const LOAD_CLASSES: readonly string[] = ["always", "on-demand", "reference"];

// ── Save ───────────────────────────────────────────────────────────────────

/**
 * Validate and write one user artifact to `<rootDir>/.stamity/overrides/`.
 *
 * The judgement is {@link checkUserArtifact}'s, whole — the same call
 * `stamity validate` makes, so a file that lands here is a file that command
 * passes. What this path adds is the two gates that are only meaningful before
 * the file exists ({@link saveIdDefect}) and the write itself.
 *
 * The gates run before any filesystem call, so a refused save mutates nothing.
 * Errors refuse; warnings ride along with a successful write.
 *
 * The write forces, because re-saving an id is an edit and not a collision. The
 * writer takes a size- and hash-verified `.bak` before it overwrites and names
 * it in the warning it returns, so overwriting a hand-edited file stays
 * recoverable; byte-identical content is left alone entirely.
 */
export async function saveUserContent(
  rootDir: string,
  type: UserArtifactType,
  id: string,
  content: string,
): Promise<SaveResult> {
  const idDefect = saveIdDefect(id);
  if (idDefect !== undefined) return { saved: false, errors: [idDefect], warnings: [] };

  const filePath = artifactPath(rootDir, type, id);
  const document = readDocument(content, filePath);

  const check = await checkUserArtifact({ type, id, filePath, ...document });
  const errors = check.errors.map(describeViolation);
  const warnings = check.warnings.map(describeViolation);
  if (errors.length > 0) return { saved: false, errors, warnings };

  const result = await safeWriteFile(filePath, content, { force: true });
  if (result.warning !== undefined) warnings.push(result.warning);
  return { saved: true, path: filePath, errors: [], warnings };
}

// ── Discovery ──────────────────────────────────────────────────────────────

/**
 * Every artifact under `<rootDir>/.stamity/overrides/`, in class order and then
 * name order within a class.
 *
 * A repo that has authored nothing — or has no state directory at all — yields
 * an empty list rather than a failure, and nothing is created to find that out.
 *
 * Listing is deliberately more permissive than validation: a file with no
 * frontmatter, or with a frontmatter block that does not parse, is still
 * returned (with an empty map and the whole file as its body) so a later
 * validation pass can name what is wrong with it. Dropping it here would hide
 * the artifact from the author at exactly the moment they need to be told.
 */
export async function discoverUserContent(rootDir: string): Promise<UserContentArtifact[]> {
  const root = userContentRoot(rootDir);
  // Four disjoint reads; results are consumed in CONTENT_CLASSES order, which is
  // what fixes the returned order regardless of which listing finished first.
  const perClass = await Promise.all(CONTENT_CLASSES.map((type) => scanClass(root, type)));
  return perClass.flat();
}

/** One entry in the override tree that the content walk passes over. */
export interface SkippedUserEntry {
  /** Class directory the entry sits in. */
  type: UserArtifactType;
  /** Absolute path of the entry that was skipped. */
  filePath: string;
  /** Why it is not an artifact, in terms the author can act on. */
  reason: string;
}

/** Why a linked entry was passed over; one sentence both link shapes share. */
const SYMLINK_SKIP_REASON =
  `is a symlink, and the content walk reads regular files and real directories only — ` +
  `this override is not indexed, so the bundled artifact is what gets emitted. ` +
  `Replace the link with the file itself.`;

/**
 * Entries under `<rootDir>/.stamity/overrides/` that look like overrides and are
 * not read as any.
 *
 * One shape qualifies today: a symlink. Both walks that index this tree — this
 * module's and the catalog's (`./catalog.ts`) — consider only regular files and
 * real directories, so a link is never followed out of the tree it was found
 * in. That is the right posture and stays; what it must not be is SILENT. An
 * author who symlinks a rule into `.stamity/overrides/rules/` gets a tree that
 * looks customized, a `sync` that emits the bundled body, and no signal
 * connecting the two.
 *
 * A skill's readable file counts as one of those entries. It is COMPOSED
 * (`<dir>/SKILL.md`) rather than listed, so the entry filter judged the
 * directory and nothing judged the file inside it: a symlinked `SKILL.md` in a
 * real skill directory was read THROUGH the link by both walks, and its
 * target's bytes reached emission and validate — the exact "never followed
 * silently" guarantee both module headers state. It is now listed and
 * reported like any other link.
 *
 * A skill directory missing its `SKILL.md` is deliberately not reported here:
 * it is work in progress rather than a misunderstanding about what the walk
 * reads, and {@link discoverUserContent} already treats it as absent.
 */
export async function discoverSkippedUserEntries(rootDir: string): Promise<SkippedUserEntry[]> {
  const root = userContentRoot(rootDir);
  const perClass = await Promise.all(CONTENT_CLASSES.map((type) => scanSkipped(root, type)));
  return perClass.flat();
}

async function scanSkipped(root: string, type: UserArtifactType): Promise<SkippedUserEntry[]> {
  const { dir, layout } = CLASS_LAYOUT[type];
  const classDir = join(root, dir);
  const entries = await listDir(classDir);
  if (entries === null) return [];

  const linked = entries
    .filter((entry) => entry.isSymbolicLink())
    // A link that could not have been an artifact under any layout (a stray
    // `notes.txt` beside the rules) is not a misunderstanding worth reporting.
    .filter((entry) => layout === "directory" || entry.name.endsWith(ARTIFACT_EXTENSION))
    .map((entry) => ({
      type,
      filePath: join(classDir, entry.name),
      reason: SYMLINK_SKIP_REASON,
    }));
  if (layout !== "directory") return linked;

  // Real skill directories, whose composed SKILL.md is the file the walk would
  // open. Checked through a listing so the link is seen AS a link.
  const composed = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const skillDir = join(classDir, entry.name);
        const inner = await listDir(skillDir);
        const artifact = inner?.find((candidate) => candidate.name === SKILL_FILE);
        if (artifact === undefined || !artifact.isSymbolicLink()) return [];
        return [{ type, filePath: join(skillDir, SKILL_FILE), reason: SYMLINK_SKIP_REASON }];
      }),
  );
  return [...linked, ...composed.flat()];
}

async function scanClass(root: string, type: UserArtifactType): Promise<UserContentArtifact[]> {
  const { dir, layout } = CLASS_LAYOUT[type];
  const classDir = join(root, dir);
  const entries = await listDir(classDir);
  if (entries === null) return [];

  const named = entries.filter((entry) =>
    layout === "directory"
      ? entry.isDirectory()
      : entry.isFile() && entry.name.endsWith(ARTIFACT_EXTENSION),
  );

  // A skill's readable file is composed rather than listed, so its kind is read
  // from its own directory before it is opened. Without this the entry filter
  // judged the directory and `readFile` followed a linked SKILL.md straight out
  // of the tree; {@link discoverSkippedUserEntries} reports what this
  // drops, so the link is skipped and never silent.
  const linkedArtifact =
    layout === "directory"
      ? await Promise.all(named.map((entry) => hasLinkedSkillFile(join(classDir, entry.name))))
      : named.map(() => false);

  const candidates = named
    .map((entry, index) => ({
      slug:
        layout === "directory"
          ? entry.name
          : entry.name.slice(0, -ARTIFACT_EXTENSION.length),
      filePath:
        layout === "directory"
          ? join(classDir, entry.name, SKILL_FILE)
          : join(classDir, entry.name),
      linked: linkedArtifact[index] === true,
    }))
    .filter((candidate) => !candidate.linked);

  // Bounded rather than unbounded: a user tree is small by design, not by guarantee.
  const raws = await pLimit(READ_CONCURRENCY).map(candidates, (candidate) =>
    readIfPresent(candidate.filePath),
  );

  const artifacts: UserContentArtifact[] = [];
  for (const [index, candidate] of candidates.entries()) {
    // A skill directory without its `SKILL.md` is work in progress, not an artifact.
    const raw = raws[index];
    if (raw === null || raw === undefined) continue;

    const document = readDocument(raw, candidate.filePath);
    const declared = trimmedString(document.frontmatter, "id");
    artifacts.push({
      type,
      // The declared id wins only when it could actually address a file; a
      // malformed one is reported by validation rather than adopted here.
      id: declared !== undefined && SLUG_PATTERN.test(declared) ? declared : candidate.slug,
      filePath: candidate.filePath,
      ...document,
    });
  }
  return artifacts;
}

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * Judge one artifact — the ONE gate, and the only one either lane runs.
 *
 * Five passes, in report order: required frontmatter, the agreement between the
 * declared id and the file carrying it, the lifecycle declarations, the safety
 * of every string the frontmatter declares, and everything
 * {@link validateContentBody} judges about the body.
 *
 * Frontmatter is scanned as well as the body because it is not inert — a
 * `description` is what a picker and a roster line render, so an injection
 * hidden there reaches agent context without ever appearing in the body.
 *
 * The split into `errors` and `warnings` is the caller's decision surface, not
 * a second judgement: severity is decided per violation once, here, so the save
 * path and `stamity validate` cannot rank the same finding differently.
 */
export async function checkUserArtifact(
  input: UserArtifactCheckInput,
): Promise<UserArtifactCheck> {
  const violations: ContentBodyViolation[] = [];

  for (const field of REQUIRED_FIELDS) {
    const detail = fieldDefect(input, field);
    if (detail !== undefined) violations.push({ kind: "missing-field", detail, severity: "error" });
  }

  const mismatch = identityDefect(input);
  if (mismatch !== undefined) {
    violations.push({ kind: "filename-mismatch", detail: mismatch, severity: "error" });
  }

  violations.push(...lifecycleViolations(input.frontmatter));
  violations.push(...activationViolations(input));

  // Key AND value, scanned together. A YAML KEY is text that reaches agent
  // context exactly as its value does — a client renders the whole head — and
  // scanning values alone let a payload sit in the key position with an inert
  // value beside it and earn an explicit clean verdict from the gate that
  // calls itself strict on safety.
  for (const [key, value] of Object.entries(input.frontmatter)) {
    violations.push(...denyViolations(`${key}\n${stringLeaves(value)}`, `frontmatter \`${key}\``));
  }
  violations.push(...denyViolations(commentText(input.frontmatterText), "frontmatter comments"));

  violations.push(...(await validateContentBody(input.body, input.type)));

  return {
    errors: violations.filter((violation) => violation.severity === "error"),
    warnings: violations.filter((violation) => violation.severity === "warning"),
  };
}

/**
 * {@link checkUserArtifact} as one flat list, errors first. Kept because a
 * caller that renders every finding in one pass — a report, a test assertion —
 * has no use for the split, and because the artifact shape it takes is what
 * {@link discoverUserContent} already returns.
 */
export async function validateUserArtifact(
  artifact: UserContentArtifact,
): Promise<ContentBodyViolation[]> {
  const check = await checkUserArtifact(artifact);
  return [...check.errors, ...check.warnings];
}

/**
 * Judge a body on its own: deny findings, filler phrasing, and its class's lean
 * line threshold. Only the deny findings can carry `error` severity — the other
 * two are advisory by construction.
 */
export async function validateContentBody(
  body: string,
  type: UserArtifactType,
): Promise<ContentBodyViolation[]> {
  const violations = [...denyViolations(body, "body"), ...antiSlopViolations(body)];

  const lines = countLines(body);
  const limit = LEAN_LINE_THRESHOLDS[type];
  if (lines > limit) {
    violations.push({
      kind: "lean-lines",
      severity: "warning",
      detail:
        `body is ${lines} lines, over the lean threshold of ${limit} for a ${type} — ` +
        `compress it or split it into two artifacts`,
    });
  }
  return violations;
}

/**
 * Deny findings for one slice of an artifact, one row per pattern.
 *
 * Two sets, two dispositions. `CONTENT_DENY_PATTERNS` — the default set, and the
 * same write-path vocabulary the merge layer refuses on — refuses here too: a
 * user artifact is emitted verbatim into agent context, which is the surface
 * that set exists for. `INJECTION_PATTERNS` contributes its warn rows
 * (invisible-character smuggling, homoglyph and combining-mark masking) plus
 * {@link NO_HONEST_SHAPE_INJECTION_ROWS} — the shared set the merge gate reads
 * too, so a row promoted to refusal reaches both lanes at once. Before that
 * carve-out a plane-14 payload scored one warning and saved into
 * `.stamity/overrides/`, where it re-entered agent context on every later run.
 * The remaining block rows fire on ordinary prompt-authoring text — a
 * `{{token}}` example, a `System:` line in a transcript an author is
 * documenting — and refusing those would cost the gate its credibility on the
 * findings that matter.
 *
 * Four passes, and the split is what makes the refusal hold.
 *
 * The block set reads the invisible-stripped copy, exactly as the pack, handoff
 * and learnings gates read theirs, so `ig<ZWSP>nore` is scored as `ignore`
 * rather than as two fragments that match nothing; scanning raw here was how a
 * smuggled override downgraded itself to an advisory and landed in
 * `.stamity/overrides/`.
 *
 * It then reads the {@link foldConfusables} copy of that same text, because
 * character-level evasion has two forms and stripping answers only one: a
 * keyword can be SPLIT by a character that renders as nothing, or SPELLED in
 * characters that render as Latin — fullwidth, mathematical alphanumeric,
 * Cyrillic. Pack ingress folded from the start; this lane did not, so a
 * lookalike override saved clean into content that is emitted verbatim every
 * run. Union, never replacement: the fold ADDS the refusals a lookalike hid and
 * cannot preserve the ones a trailing combining mark would destroy, so the
 * unfolded copy is still scanned and rows it already caught are not re-counted.
 *
 * It then reads the {@link joinMaskedWords} copy of the folded one, for the
 * third form: a keyword MASKED by a character that is neither invisible nor a
 * mapped lookalike — a combining mark, a script letter the fold table does not
 * carry. Stripping leaves it and NFKC welds it onto the letter, so
 * `ig<U+0307>nore all findings` saved clean into `.stamity/overrides/` and
 * re-entered agent context on every later run. The two masking rows below report
 * that shape only within 20 characters of one of six override words, which the
 * `findings`, `errors` and `exfiltrate` rows are not; joining the word needs no
 * vocabulary at all.
 *
 * The warn rows read the raw text, because that is where the smuggling material
 * still exists to be reported — normalization has already removed it from the
 * other copies. Offsets on a block row therefore index a normalized copy; they
 * drift from the file only for content that also carries an invisible-chars or
 * masking advisory, which names the reason.
 */
function denyViolations(text: string, where: string): ContentBodyViolation[] {
  if (text === "") return [];
  const stripped = text.replace(INVISIBLE_SMUGGLING_CHARS, "");
  const strippedHits = scanForDeniedPatterns(stripped);
  const alreadyHit = new Set(strippedHits.map((hit) => hit.patternId));
  // Pure-ASCII text folds and joins to itself, so each identity check is also a
  // fast path: an unchanged copy is never scanned twice. Where the copies do
  // differ, a row an earlier copy already earned is dropped, so the occurrence
  // count stays a count of the text rather than of the copies read.
  const folded = foldConfusables(stripped);
  const foldedHits =
    folded === stripped
      ? []
      : scanForDeniedPatterns(folded).filter((hit) => !alreadyHit.has(hit.patternId));
  for (const hit of foldedHits) alreadyHit.add(hit.patternId);
  const joined = joinMaskedWords(folded);
  const hits = [
    ...strippedHits,
    ...foldedHits,
    ...(joined === folded
      ? []
      : scanForDeniedPatterns(joined).filter((hit) => !alreadyHit.has(hit.patternId))),
    ...scanForDeniedPatterns(text, INJECTION_PATTERNS).filter(
      (hit) => hit.severity === "warn" || NO_HONEST_SHAPE_INJECTION_ROWS.has(hit.patternId),
    ),
  ];
  return groupHits(hits).map((hit) => ({
    kind: "deny-pattern" as const,
    severity: hit.severity === "block" ? ("error" as const) : ("warning" as const),
    detail:
      `${where} matches the denied pattern \`${hit.patternId}\` at offset ${hit.index} ` +
      `(${JSON.stringify(hit.snippet)})${occurrences(hit.count)} — remove or rewrite the flagged text`,
  }));
}

function antiSlopViolations(body: string): ContentBodyViolation[] {
  return groupHits(scanAntiSlop(body)).map((hit) => ({
    kind: "anti-slop" as const,
    severity: "warning" as const,
    detail:
      `body uses the filler phrase ${JSON.stringify(hit.snippet)} at offset ${hit.index}` +
      `${occurrences(hit.count)} — state the measurable thing instead`,
  }));
}

/**
 * The lifecycle pair, advisory by design (see the module header): `load:` says
 * when the artifact costs context, `obsolete_when:` names the condition that
 * retires it. Both are required declarations that the corpus carries and a user
 * artifact should too — but an artifact missing them is un-retirable rather
 * than unreadable, so neither refuses.
 *
 * A `load:` value outside the vocabulary reports through the same row: a class
 * nothing recognises declares no less than an absent one.
 */
function lifecycleViolations(
  frontmatter: Readonly<Record<string, unknown>>,
): ContentBodyViolation[] {
  const violations: ContentBodyViolation[] = [];

  const load = trimmedString(frontmatter, "load");
  if (load === undefined) {
    violations.push({
      kind: "missing-lifecycle-field",
      severity: "warning",
      detail:
        "`load` is not declared — say whether this artifact loads " +
        `${LOAD_CLASSES.join(", ")}, so a reader can tell what it costs in context`,
    });
  } else if (!LOAD_CLASSES.includes(load)) {
    violations.push({
      kind: "missing-lifecycle-field",
      severity: "warning",
      detail:
        `\`load\` is ${JSON.stringify(load)}, which is not one of ${LOAD_CLASSES.join(", ")} — ` +
        `a class outside those three declares nothing`,
    });
  }

  if (trimmedString(frontmatter, "obsolete_when") === undefined) {
    violations.push({
      kind: "missing-lifecycle-field",
      severity: "warning",
      detail:
        "`obsolete_when` is not declared — name the condition that makes this artifact " +
        "redundant, or nothing will ever retire it",
    });
  }

  return violations;
}

/**
 * Rule activations the four adapters can honour. `always` is absent, and that
 * is the gate: only one client has a native always-on primitive and it is the
 * one that REFUSES the declaration (the cursor adapter throws rather than emit
 * a rule it cannot scope), while the other three cannot see the field and emit
 * the body unconditionally.
 */
const RULE_SCOPES: readonly string[] = ["conditional", "agent-requested"];

/**
 * The activation defect in a rule's head, if any.
 *
 * Judged here, once, at save and at `validate` — instead of four different
 * outcomes at emission. An override declaring `scope: always` used to save
 * clean, emit always-on on three clients, and then break every later `sync` on
 * the fourth with a message about a generated file the author never wrote.
 * Refusing at the point the author is writing the rule is the only
 * place the message can name the line they typed.
 *
 * Non-rule classes declare no activation, so the field is not theirs to get
 * wrong and is ignored rather than reported.
 */
function activationViolations(input: UserArtifactCheckInput): ContentBodyViolation[] {
  if (input.type !== "rule") return [];
  const scope = trimmedString(input.frontmatter, "scope");
  if (scope === undefined || RULE_SCOPES.includes(scope)) return [];
  return [
    {
      kind: "missing-field",
      severity: "error",
      detail:
        scope === "always"
          ? "`scope: always` is not emittable: the cursor adapter refuses it (so every later " +
            "sync fails) and the other three clients cannot read the field and would apply the " +
            `rule on every turn. Use \`scope: conditional\` with \`globs:\`, or \`scope: ` +
            `agent-requested\`.`
          : `\`scope\` is ${JSON.stringify(scope)}, which is not one of ${RULE_SCOPES.join(", ")} — ` +
            `an activation nothing recognises emits as an unconditional rule`,
    },
  ];
}

/**
 * The disagreement between the declared `id` and the file carrying it, or
 * `undefined` when they agree.
 *
 * Compared against the FILE, not against the id the caller passed: the save
 * path derives the file name from its `id` argument and the discovery walk
 * prefers a well-formed declared id over the slug, so comparing to the caller's
 * id would make this gate fire for one lane and never for the other. The file
 * name is the one fact both lanes hold identically.
 *
 * A declared id that is not a slug at all is left alone here — `fieldDefect`
 * already reports it by name, and adding a second row for the same typo sends
 * the author looking for two problems.
 */
function identityDefect(input: UserArtifactCheckInput): string | undefined {
  const declared = trimmedString(input.frontmatter, "id");
  if (declared === undefined || !SLUG_PATTERN.test(declared)) return undefined;

  const slug = fileSlug(input.filePath, input.type);
  if (slug === null || slug === declared) return undefined;
  return (
    `Frontmatter \`id\` is ${JSON.stringify(declared)} but the file names it ` +
    `${JSON.stringify(slug)}. Make the two agree — the engine will not pick one for you.`
  );
}

/**
 * The id a file name implies: its basename for a file-layout class, its own
 * directory name for a skill (whose readable file is always `SKILL.md`).
 * `null` when the path is shaped like neither, which is a path this module did
 * not produce and has no opinion about.
 */
function fileSlug(filePath: string, type: UserArtifactType): string | null {
  const name = basename(filePath);
  if (CLASS_LAYOUT[type].layout === "directory") {
    const dir = basename(dirname(filePath));
    return dir === "" || dir === "." ? null : dir;
  }
  return name.endsWith(ARTIFACT_EXTENSION) ? name.slice(0, -ARTIFACT_EXTENSION.length) : null;
}

/**
 * The defect in one required field, or `undefined` when it is well formed.
 * `type` is checked against the class the artifact is filed under, so a `rule`
 * that claims to be an `agent` is caught where it is stored rather than where it
 * is later emitted.
 */
function fieldDefect(artifact: UserArtifactCheckInput, field: RequiredField): string | undefined {
  const { frontmatter } = artifact;
  const value = Object.hasOwn(frontmatter, field) ? frontmatter[field] : undefined;
  if (value === undefined) return `\`${field}\` is required in the frontmatter`;

  if (field === "tags") {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string")
      ? undefined
      : "`tags` must be a list of strings";
  }
  if (typeof value !== "string" || value.trim() === "") {
    return `\`${field}\` must be a non-empty string`;
  }
  if (field === "id" && !SLUG_PATTERN.test(value.trim())) {
    return `\`id\` must be a lowercase kebab-case slug (got ${JSON.stringify(value)})`;
  }
  if (field === "type" && value.trim() !== artifact.type) {
    return (
      `\`type\` must be ${JSON.stringify(artifact.type)} — the class this artifact is filed ` +
      `under (got ${JSON.stringify(value)})`
    );
  }
  return undefined;
}

// ── Internals ──────────────────────────────────────────────────────────────

interface GroupedHit extends DenyHit {
  count: number;
}

/**
 * One row per pattern id: its first match plus how many times it matched. Hits
 * arrive index-ordered, so the row that survives is the first occurrence — the
 * one an author scrolls to first.
 */
function groupHits(hits: readonly DenyHit[]): GroupedHit[] {
  const grouped = new Map<string, GroupedHit>();
  for (const hit of hits) {
    const existing = grouped.get(hit.patternId);
    if (existing === undefined) grouped.set(hit.patternId, { ...hit, count: 1 });
    else existing.count += 1;
  }
  return [...grouped.values()];
}

function occurrences(count: number): string {
  if (count < 2) return "";
  return count === 2 ? " and 1 more time" : ` and ${count - 1} more times`;
}

function describeViolation(violation: ContentBodyViolation): string {
  return `${violation.kind}: ${violation.detail}`;
}

/**
 * Why `id` cannot name a user artifact's file, or `undefined` when it can.
 *
 * Both rules are about the file the id becomes, which is why they are checked at
 * save time rather than in {@link validateUserArtifact}: an artifact already on
 * disk is past the point where either one could help it.
 *
 * The prefix rule is the less obvious of the two. {@link CONTENT_PREFIX} names
 * the generated corpus, and the merge layer reads it off a basename as proof the
 * engine owns the file — ownership that skips the verified `.bak` a user-lane
 * overwrite otherwise takes, so re-saving such an artifact would destroy the
 * only copy of the previous version. It also does not do what an author reaches
 * for it to do: the corpus strips the prefix when it derives ids, so a prefixed
 * user id shadows nothing.
 */
function saveIdDefect(id: string): string | undefined {
  if (!SLUG_PATTERN.test(id)) {
    return (
      `Artifact id ${JSON.stringify(id)} is not a slug. Use lowercase letters, digits and ` +
      `single hyphens (for example \`review-gate\`) — the id becomes the file name.`
    );
  }
  if (id.startsWith(CONTENT_PREFIX)) {
    return (
      `Artifact id ${JSON.stringify(id)} starts with \`${CONTENT_PREFIX}\`, which names the ` +
      `generated corpus: a file called that reads as engine-owned and would be overwritten ` +
      `without a backup. Save it as ${JSON.stringify(id.slice(CONTENT_PREFIX.length))} — an id ` +
      `that matches a bundled artifact already overrides it, prefix and all.`
    );
  }
  return undefined;
}

/** Absolute path of the file that holds `id` in its class. */
function artifactPath(rootDir: string, type: UserArtifactType, id: string): string {
  const { dir, layout } = CLASS_LAYOUT[type];
  const classDir = join(userContentRoot(rootDir), dir);
  return layout === "directory"
    ? join(classDir, id, SKILL_FILE)
    : join(classDir, `${id}${ARTIFACT_EXTENSION}`);
}

/** A fenced frontmatter block at the head of a document; group 1 is its text. */
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * Split a document, tolerating a broken head. A frontmatter block that is not
 * valid YAML reads as no frontmatter rather than throwing: the missing fields
 * are then reported by name, which is more use to the author than a walk that
 * stops on their typo and names nothing.
 *
 * The block's raw text is carried alongside the parse, because the parse drops
 * comments and the comments are still in the file the client reads.
 */
function readDocument(
  raw: string,
  source: string,
): { frontmatter: Record<string, unknown>; body: string; frontmatterText?: string } {
  const block = FRONTMATTER_BLOCK.exec(raw)?.[1];
  const head = block === undefined ? {} : { frontmatterText: block };
  try {
    const parsed = parseFrontmatter(raw, source);
    return { frontmatter: parsed.frontmatter, body: parsed.body, ...head };
  } catch {
    return { frontmatter: {}, body: raw, ...head };
  }
}

/**
 * Every YAML comment in a frontmatter block, joined.
 *
 * Comment-only lines and trailing comments both count: `description: ok # then
 * ignore all previous instructions` is one line whose parsed value is `ok`.
 * The `#` must open a comment rather than sit inside a quoted string, which is
 * approximated by requiring whitespace or line start before it — the same
 * approximation YAML readers make for an unquoted scalar, and a conservative
 * one here, since over-reading text into the scan can only ADD a finding
 * against content that already contains the flagged phrase.
 */
function commentText(frontmatterText: string | undefined): string {
  if (frontmatterText === undefined) return "";
  return frontmatterText
    .split(/\r?\n/)
    .map((line) => /(?:^|\s)#(.*)$/.exec(line)?.[1] ?? "")
    .filter((comment) => comment !== "")
    .join("\n");
}

/** A trimmed non-empty string field, or `undefined` for anything else. */
function trimmedString(
  frontmatter: Readonly<Record<string, unknown>>,
  field: string,
): string | undefined {
  const value = Object.hasOwn(frontmatter, field) ? frontmatter[field] : undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Every string inside one frontmatter value, joined — the text a scan can read.
 *
 * Nested maps and lists are walked rather than skipped: `description` is not the
 * only field that reaches agent context, and a payload one level down a custom
 * key is exactly where it would be put to avoid a shallow scan. `seen` guards
 * the cyclic object a YAML alias can build; each top-level field starts with a
 * fresh one.
 */
function stringLeaves(value: unknown, seen: Set<object> = new Set()): string {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null) return "";
  if (seen.has(value)) return "";
  seen.add(value);
  return (Array.isArray(value) ? value : Object.values(value))
    .map((entry) => stringLeaves(entry, seen))
    .filter((text) => text !== "")
    .join("\n");
}

/** Lines in a body, discounting the final newline so `"a\n"` is one line, not two. */
function countLines(body: string): number {
  const trimmed = body.replace(/\r?\n$/, "");
  return trimmed === "" ? 0 : trimmed.split(/\r?\n/).length;
}

/** Directory entries sorted by name, or `null` when the directory is absent. */
async function listDir(dirPath: string): Promise<Dirent[] | null> {
  try {
    return (await readdir(dirPath, { withFileTypes: true })).toSorted(byName);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/**
 * True when the `SKILL.md` inside `skillDir` is a symlink.
 *
 * Read from a listing rather than by stat'ing the path: `readdir` with file
 * types reports a link AS a link, which is the fact needed, and it reuses the
 * listing helper both walks already share. A directory that cannot be listed,
 * or holds no `SKILL.md`, answers `false` — absence is already handled as "not
 * an artifact yet" downstream.
 */
async function hasLinkedSkillFile(skillDir: string): Promise<boolean> {
  const entries = await listDir(skillDir);
  return entries?.find((entry) => entry.name === SKILL_FILE)?.isSymbolicLink() === true;
}

/** File text, or `null` when the file is absent. */
async function readIfPresent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/**
 * Absence in every form the walk can meet it. Anything else — a permission
 * failure, an I/O error — is a real failure and propagates.
 */
function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR";
}

/** Codepoint order, so the walk does not vary with the host locale. */
function byName(a: Dirent, b: Dirent): number {
  if (a.name < b.name) return -1;
  return a.name > b.name ? 1 : 0;
}
