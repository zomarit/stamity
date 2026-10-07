import { hasManagedBlock } from "../merge/managedBlocks.ts";
import { PACK_OWNER_PREFIX } from "../types/manifest.ts";
import { STATE_DIR, carriesEngineContentPrefix } from "../types/markers.ts";

/**
 * The owned-path bound: every path a stamity release writes, as data
 * (REQ-PLUGIN-045).
 *
 * The manifest is committed, and `sync` and `clean` act on what its ledger
 * names, so a ledger row is an authorisation to delete or overwrite a file. A
 * hand edit of `.stamity/manifest.json` used to be enough to aim that
 * authorisation anywhere in the repository: `infra` rows were trusted by type
 * alone, and a hash anywhere under `.stamity/` proved a whole-file delete. This
 * module is the one list of where the engine writes, so manifest validation
 * (`./manifest.ts`), the planner's containment check (`./ledger.ts`), the
 * reclaim sweep (`../merge/reclaim.ts`) and `check --json` all read the same
 * bound.
 *
 * It is data rather than a derivation from the adapters on purpose: validation
 * and the sweep sit in earlier layers than the adapters and cannot import them.
 * `test/manifest/ownedPaths.test.ts` proves it complete instead, over every
 * planner output and over the frozen rows of every release
 * (`test/manifest/fixtures/released-ledger-rows.json`), so a new emitted path
 * fails a test the day a planner first emits it.
 *
 * The bound is by folder and artifact type, not by name. An override-added
 * skill is emitted without the engine's prefix (`.agents/skills/my-skill/`), so
 * a name rule here would refuse a legitimate manifest; the name rule stays a
 * delete proof inside content folders ({@link hasEngineMintedName}).
 *
 * Pure: no filesystem, no clock.
 */

/** The shape of {@link OWNED_PATHS}. */
export interface OwnedPathBound {
  /** Rises by one whenever an entry is added or removed. */
  readonly version: number;
  /** Platform files the engine writes at names it did not mint, repo-relative. */
  readonly exact: readonly string[];
  /** The basename of a charter, which may sit in any folder below the root. */
  readonly charterFileName: string;
  /** Folders whose agent, skill, rule and command rows the engine writes. */
  readonly contentRoots: readonly string[];
  /** The engine's own state folders under `.stamity/`. */
  readonly stateRoots: readonly string[];
  /** The folder installed packs live in, one sub-folder per pack. */
  readonly packRoot: string;
  /** The instruction files `init` imports. */
  readonly importTargets: readonly string[];
}

/**
 * The bound. `.cursor/skills/` is the layout 1.0.0 to 1.10.0 wrote and the
 * sweep still reclaims. A unit that adds an emitted path extends this value and
 * raises `version`.
 */
export const OWNED_PATHS: OwnedPathBound = Object.freeze({
  version: 1,
  exact: Object.freeze([
    "AGENTS.md",
    "AGENTS.override.md",
    "CLAUDE.md",
    ".claude/settings.json",
    ".mcp.json",
    ".codex/config.toml",
    ".codex/hooks.json",
    ".cursor/hooks.json",
    ".cursor/mcp.json",
    ".cursor/hooks/mcp-guard.mjs",
    ".cursor/hooks/subagent-guard.mjs",
    ".github/hooks/stamity.json",
    ".github/workflows/copilot-setup-steps.yml",
    ".vscode/mcp.json",
  ]),
  charterFileName: "AGENTS.md",
  contentRoots: Object.freeze([
    ".agents/skills/",
    ".claude/agents/",
    ".claude/commands/",
    ".claude/rules/",
    ".claude/skills/",
    ".codex/agents/",
    ".cursor/agents/",
    ".cursor/rules/",
    ".cursor/skills/",
    ".github/agents/",
    ".github/instructions/",
    ".github/prompts/",
  ]),
  stateRoots: Object.freeze([`${STATE_DIR}/generated/`, `${STATE_DIR}/mcp/`]),
  packRoot: `${STATE_DIR}/packs/`,
  importTargets: Object.freeze(["AGENTS.md", "AGENT.md", "CLAUDE.md", ".github/copilot-instructions.md"]),
});

/** Which part of the bound a ledger row falls in. */
export type OwnedPathKind = "exact" | "charter" | "content" | "state" | "pack";

/** The three ledger fields the bound reads. Structurally a `LedgerEntry`. */
export interface OwnedPathRow {
  readonly path: string;
  readonly adapter: string;
  readonly artifactType: string;
}

/** The content classes a tool owner may record under a content root. */
const CONTENT_ARTIFACT_TYPES: ReadonlySet<string> = new Set(["agent", "skill", "rule", "command"]);

/**
 * The folder name an installed pack's id maps to: `@acme/ops` becomes
 * `acme__ops`. The mapping `../pack/receipt.ts::packDirRelPath` owns, restated
 * here because this module sits in an earlier layer; a test holds the two
 * equal.
 */
export function packDirName(packId: string): string {
  return packId.replace("@", "").replace("/", "__");
}

/**
 * True when `path` is plain repo-relative POSIX: no empty, `.` or `..`
 * segment, no backslash, no leading slash. Every caller validates the shape
 * first; this keeps a string prefix test from reading
 * `.claude/agents/../../docs/x.md` as a path under `.claude/agents/`.
 */
function isPlainRelative(path: string): boolean {
  if (path.includes("\\")) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** True when `path` sits strictly below `root`, a folder spelled with a trailing slash. */
function isStrictlyUnder(path: string, root: string): boolean {
  return path.startsWith(root) && path.length > root.length;
}

/**
 * The part of the bound a ledger row falls in, or `null` when no stamity
 * release writes such a row.
 *
 * - A `pack:<id>` owner: an `infra` row under its own pack folder.
 * - A tool owner with `infra`: a platform file ({@link OwnedPathBound.exact}),
 *   a charter below the root, or a path under a state folder.
 * - A tool owner with `agent`, `skill`, `rule` or `command`: a path strictly
 *   under a content root.
 */
export function ownedPathKind(row: OwnedPathRow): OwnedPathKind | null {
  const { path, adapter, artifactType } = row;
  if (!isPlainRelative(path)) return null;
  if (adapter.startsWith(PACK_OWNER_PREFIX)) {
    const packId = adapter.slice(PACK_OWNER_PREFIX.length);
    if (artifactType !== "infra" || packId === "") return null;
    return isStrictlyUnder(path, `${OWNED_PATHS.packRoot}${packDirName(packId)}/`) ? "pack" : null;
  }
  if (artifactType === "infra") {
    if (OWNED_PATHS.exact.includes(path)) return "exact";
    if (path.includes("/") && path.slice(path.lastIndexOf("/") + 1) === OWNED_PATHS.charterFileName) {
      return "charter";
    }
    return OWNED_PATHS.stateRoots.some((root) => isStrictlyUnder(path, root)) ? "state" : null;
  }
  if (!CONTENT_ARTIFACT_TYPES.has(artifactType)) return null;
  return OWNED_PATHS.contentRoots.some((root) => isStrictlyUnder(path, root)) ? "content" : null;
}

/**
 * The bound's folder a path sits under — the content root, the state folder,
 * or the installed pack's own folder — or `null` for a path the bound names by
 * itself (a platform file, a charter). The folders are disjoint, so the path
 * alone decides.
 *
 * The bound is lexical, so the reclaim sweep reads this to hold a file's
 * symlink-resolved parent inside the resolved folder the row claims: a
 * committed directory link under `.stamity/generated/` cannot carry a hashed
 * delete into `.stamity/learnings/`.
 */
export function ownedFolderOf(path: string): string | null {
  const root = [...OWNED_PATHS.contentRoots, ...OWNED_PATHS.stateRoots].find((folder) =>
    isStrictlyUnder(path, folder),
  );
  if (root !== undefined) return root;
  if (!isStrictlyUnder(path, OWNED_PATHS.packRoot)) return null;
  const rest = path.slice(OWNED_PATHS.packRoot.length);
  return `${OWNED_PATHS.packRoot}${rest.slice(0, rest.indexOf("/") + 1)}`;
}

/**
 * Why a ledger row lies outside the bound, or `null` when it lies inside. The
 * clause completes a sentence that opens with the row's path.
 */
export function ownedPathDefect(row: OwnedPathRow): string | null {
  if (ownedPathKind(row) !== null) return null;
  return `lies outside the paths a stamity release writes for ${row.artifactType} rows (owner ${row.adapter})`;
}

// ── The content-folder name proof ──────────────────────────────────────────

/** A two-digit ordering prefix ahead of the content prefix, e.g. `30-stamity-…`. */
const ORDERING_PREFIX_PATTERN = /^\d{2}-/;

/** The one folder name under which the emitters mint prefixed skill FOLDERS
 *  rather than prefixed files (`.agents/skills/`, `.claude/skills/`, …). */
const SKILL_CONTAINER_SEGMENT = "skills";

/**
 * True when a file or folder name is one the engine mints, with or without a
 * two-digit ordering prefix.
 *
 * Reads both engine prefixes: the engine mints commands and skills under `st-`
 * and everything else under `stamity-`, and a gate that knows only one of them
 * cannot retire the name the other replaced on a repository upgraded across the
 * split.
 */
export function carriesEngineMintedPrefix(name: string): boolean {
  const bare = ORDERING_PREFIX_PATTERN.test(name) ? name.slice(3) : name;
  return carriesEngineContentPrefix(bare);
}

/**
 * True when the path's own name proves the engine minted it: its basename
 * carries an engine prefix, or it sits inside a skill folder so named directly
 * under a `skills/` folder (`…/skills/st-verify/references/x.md`) — the one
 * layout whose marker is on a container rather than on each file.
 *
 * Only the basename and that one container count. A folder a user named after
 * the engine (`stamity-tools/user.md`) says nothing about the files under it.
 *
 * A name is never a proof on its own: the reclaim sweep needs it together with
 * a recorded hash that matches the bytes, or a managed block spanning the file.
 */
export function hasEngineMintedName(path: string): boolean {
  if (carriesEngineMintedPrefix(path.slice(path.lastIndexOf("/") + 1))) return true;
  const segments = path.split("/");
  // `slice(0, -1)` drops the file itself; the slice keeps the original
  // indices, so `segments[index - 1]` is still the segment before this one.
  return segments
    .slice(0, -1)
    .some(
      (segment, index) =>
        segments[index - 1] === SKILL_CONTAINER_SEGMENT && carriesEngineMintedPrefix(segment),
    );
}

// ── The byte proof at instruction files (REQ-PLUGIN-046) ───────────────────

/** The instruction-file paths, besides a charter in any folder, whose bytes must show the engine wrote them. */
const BYTE_PROOF_PATHS: ReadonlySet<string> = new Set([
  "AGENTS.override.md",
  "CLAUDE.md",
  ".github/workflows/copilot-setup-steps.yml",
]);

/**
 * True when a recorded hash at `path` proves a whole-file delete or a
 * backup-free overwrite only together with bytes that show the engine wrote
 * them ({@link bytesShowEngineOutput}): an `AGENTS.md` in any folder,
 * `AGENTS.override.md`, `CLAUDE.md` and the Copilot setup workflow.
 *
 * These are the paths where an owner's own file sits at the name the engine
 * writes, so a hand-added row hashing the owner's bytes would otherwise read as
 * the engine's record of writing them. The engine cannot authenticate a
 * committed record (the manifest carries no signature, and a key kept in the
 * repository would be as forgeable as the record), so at these paths the bytes
 * themselves have to agree.
 */
export function needsByteProof(path: string): boolean {
  if (BYTE_PROOF_PATHS.has(path)) return true;
  return path.slice(path.lastIndexOf("/") + 1) === OWNED_PATHS.charterFileName;
}

/** UTF-8 byte-order mark, dropped before the fingerprint reads the first line. */
const BOM = "\uFEFF";

/** The four headings every release's charter carries, in this order (1.0.0 to the head). */
const CHARTER_HEADINGS: readonly string[] = ["## Repo facts", "## Invariants", "## Touchpoints", "## Conditional layer"];

/** The first line of every charter. */
const CHARTER_TITLE = "# Charter";

/** How the Codex rule appendix opens when it is a folder's own `AGENTS.md` (`../adapters/codex.ts`). */
const CODEX_APPENDIX_TITLE = "# Conditional rules (Codex down-conversion)";

/** The header line every release's Copilot setup workflow carries (`../adapters/copilot.ts`). */
const COPILOT_SETUP_HEADER_LINE =
  "# Prepares the environment the GitHub Copilot coding agent works in. The agent runs";

/** The text as lines, with an optional leading BOM dropped and `\r\n` read as `\n`. */
function linesOf(text: string): string[] {
  const body = text.startsWith(BOM) ? text.slice(BOM.length) : text;
  return body.replaceAll("\r\n", "\n").split("\n");
}

/** The first line that is not blank, or `undefined` for blank text. */
function firstNonBlankLine(lines: readonly string[]): string | undefined {
  return lines.find((line) => line.trim() !== "");
}

/**
 * True when `text` is a charter the engine rendered: no managed-block markers,
 * the first non-blank line exactly `# Charter`, and the lines `## Repo facts`,
 * `## Invariants`, `## Touchpoints` and `## Conditional layer` in that order.
 *
 * A fingerprint of the structure, not of the words: every release from 1.0.0
 * carries the four headings (1.0.0 to 1.7.0 without an `Invariants version`
 * line), and a charter the operator edited so a heading changed is no longer
 * provably the engine's — it is kept at reclaim and backed up before an
 * overwrite. A charter inside markers is the supplemented shape, which the
 * managed-block rules decide instead.
 */
export function isEngineCharterDocument(text: string): boolean {
  if (hasManagedBlock(text, OWNED_PATHS.charterFileName)) return false;
  const lines = linesOf(text);
  if (firstNonBlankLine(lines) !== CHARTER_TITLE) return false;
  let next = 0;
  for (const line of lines) {
    if (line === CHARTER_HEADINGS[next]) next++;
  }
  return next === CHARTER_HEADINGS.length;
}

/**
 * True when the bytes at `path` show the engine wrote them, for a path
 * {@link needsByteProof} names; `true` for every other path, which this proof
 * does not govern.
 *
 * - `AGENTS.md` and `AGENTS.override.md`: a charter ({@link isEngineCharterDocument}),
 *   or, for an `AGENTS.md` below the root only, the Codex rule appendix (first
 *   non-blank line opening `# Conditional rules (Codex down-conversion)`).
 * - `CLAUDE.md`: never. The engine writes it as one managed block, so only a
 *   block spanning the file proves it, which the callers test on their own.
 * - The Copilot setup workflow: a line equal to the engine's header line.
 */
export function bytesShowEngineOutput(path: string, text: string): boolean {
  if (!needsByteProof(path)) return true;
  if (path === "CLAUDE.md") return false;
  const lines = linesOf(text);
  if (path === ".github/workflows/copilot-setup-steps.yml") {
    return lines.includes(COPILOT_SETUP_HEADER_LINE);
  }
  if (isEngineCharterDocument(text)) return true;
  return path.includes("/") && (firstNonBlankLine(lines)?.startsWith(CODEX_APPENDIX_TITLE) ?? false);
}
