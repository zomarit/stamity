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
