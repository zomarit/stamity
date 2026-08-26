import { readFile } from "node:fs/promises";
import { join } from "node:path";
import semver from "semver";
import { isPlainObject, parseJsonStrict } from "../config/parse.ts";
import { atomicWriteFile } from "../merge/atomicWrite.ts";
import { CONTENT_CLASSES } from "../types/content.ts";
import { MATURITY_TIERS, TOOLS, VALID_MATURITY_TIERS, VALID_TOOLS } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import type { ManifestMigration } from "../types/manifest.ts";
import {
  WORKSPACE_MANIFEST_FILE,
  WORKSPACE_MANIFEST_VERSION,
  type WorkspaceDefaults,
  type WorkspaceManifest,
  type WorkspaceRepoEntry,
} from "./model.ts";

/**
 * The `workspace.json` boundary: read, validate, write.
 *
 * A workspace manifest is an executable instruction to write into other
 * people's repositories, so it is untrusted input even when a teammate
 * committed it. Two gates carry that weight:
 *
 * - **Path safety.** Every `repos[].path` stays relative and under the
 *   workspace root. Absolute paths — POSIX, Windows drive-letter, UNC — any
 *   `..` segment, and NUL bytes are refused by shape rather than by resolving
 *   them against the filesystem: a manifest is read on machines other than the
 *   one that wrote it, so a Windows-shaped absolute path has to be refused on
 *   Linux too.
 * - **One member, one entry.** `api`, `./api`, and `api/` name one directory.
 *   Accepted together they become two cascade targets writing the same files
 *   concurrently, so duplicates are refused at read time, keyed by
 *   {@link normalizeRepoPathKey}.
 *
 * `..` is refused rather than collapsed, which also keeps this module's
 * duplicate key agreeing with the resolution layer's path matching — that one
 * preserves `..` too, so a collapsed `a/../b` would key differently there and
 * reopen the hole this gate closes.
 *
 * Validation collects every defect in one pass instead of throwing at the
 * first, because a hand-edited manifest should be repairable in one sitting
 * rather than one defect per re-run. Only {@link readWorkspaceManifest} and
 * {@link writeWorkspaceManifest} throw; the collectors return strings.
 */

// ── Repo-path safety ───────────────────────────────────────────────────────

/** Shape defects a `repos[].path` can carry, each with its own message. */
type RepoPathDefect = "absolute" | "traversal" | "nul-byte" | "empty";

const REPO_PATH_DEFECT_MESSAGE: Record<RepoPathDefect, string> = {
  absolute: "is an absolute path — repo paths are relative to the workspace root",
  traversal: "climbs out of the workspace with a `..` segment",
  "nul-byte": "contains a NUL byte",
  empty: "is empty — it must name a directory under the workspace root",
};

/** Windows absolute forms POSIX `path.isAbsolute` does not recognise: a drive
 *  letter (`C:/x`, `C:x`) and a UNC share (`\\server\share`). */
const WINDOWS_ABSOLUTE_PATTERN = /^(?:[A-Za-z]:|\\\\)/;

/** Path split on either separator, with empty and `.` segments dropped, so
 *  `./api/`, `api//`, and `api\` all reduce to the same segment list. */
function pathSegments(repoPath: string): string[] {
  return repoPath
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");
}

/** The defect in `repoPath`, or `null` when it is a usable member path. */
function classifyRepoPath(repoPath: string): RepoPathDefect | null {
  if (repoPath.includes("\0")) return "nul-byte";
  if (repoPath.startsWith("/") || repoPath.startsWith("\\")) return "absolute";
  if (WINDOWS_ABSOLUTE_PATTERN.test(repoPath)) return "absolute";
  const segments = pathSegments(repoPath);
  if (segments.includes("..")) return "traversal";
  if (segments.length === 0) return "empty";
  return null;
}

/**
 * True when `repoPath` cannot be used as a member path: absolute in any
 * platform's spelling, carrying a `..` segment anywhere, holding a NUL byte,
 * or naming nothing at all (`""`, `"."`, `"./"`).
 */
export function isUnsafeRepoPath(repoPath: string): boolean {
  return classifyRepoPath(repoPath) !== null;
}

/**
 * A member path reduced to its comparable key: POSIX separators, no empty or
 * `.` segments, no trailing slash. Case is preserved — a case-insensitive
 * filesystem does not make `Apps/Web` the same declaration as `apps/web`, and
 * folding it would merge two entries the author wrote apart.
 */
export function normalizeRepoPathKey(repoPath: string): string {
  return pathSegments(repoPath).join("/");
}

// ── Validation ─────────────────────────────────────────────────────────────

/** Value class for the root-shape message; never dumps the value itself. */
function describeRoot(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** Duplicates in a list of names, in first-repeat order. */
function duplicates(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) repeated.add(name);
    seen.add(name);
  }
  return [...repeated];
}

/** A tool list: array of strings, every id one this build ships an adapter for. */
function collectToolListErrors(value: unknown, path: string, errors: string[]): void {
  if (!isStringArray(value)) {
    errors.push(`\`${path}\` must be an array of strings`);
    return;
  }
  for (const tool of value) {
    if (VALID_TOOLS.has(tool)) continue;
    errors.push(`\`${path}\` names unknown tool ${JSON.stringify(tool)} (known: ${TOOLS.join(", ")})`);
  }
}

/** An `addItems`/`removeItems` map: content-class keys, string-array values. */
function collectItemMapErrors(value: unknown, path: string, errors: string[]): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    errors.push(`\`${path}\` must be an object keyed by content class`);
    return;
  }
  for (const [key, ids] of Object.entries(value)) {
    if (!(CONTENT_CLASSES as readonly string[]).includes(key)) {
      errors.push(`\`${path}.${key}\` is not a content class (known: ${CONTENT_CLASSES.join(", ")})`);
      continue;
    }
    if (!isStringArray(ids)) errors.push(`\`${path}.${key}\` must be an array of strings`);
  }
}

function collectDefaultsErrors(value: unknown, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push("`defaults` must be an object");
    return;
  }
  collectToolListErrors(value.tools, "defaults.tools", errors);

  if (value.selection !== undefined) {
    if (!isPlainObject(value.selection) || !isPlainObject(value.selection.items)) {
      errors.push("`defaults.selection` must be an object with an `items` object");
    } else {
      collectItemMapErrors(value.selection.items, "defaults.selection.items", errors);
    }
  }
  if (
    value.maturityTier !== undefined &&
    (typeof value.maturityTier !== "string" || !VALID_MATURITY_TIERS.has(value.maturityTier))
  ) {
    errors.push(`\`defaults.maturityTier\` must be one of ${MATURITY_TIERS.join(" | ")}`);
  }
  if (value.mcp !== undefined) {
    if (!isPlainObject(value.mcp)) {
      errors.push("`defaults.mcp` must be an object");
    } else {
      if (!isStringArray(value.mcp.servers)) {
        errors.push("`defaults.mcp.servers` must be an array of strings");
      }
      if (value.mcp.protocolVersion !== undefined && typeof value.mcp.protocolVersion !== "string") {
        errors.push("`defaults.mcp.protocolVersion` must be a string");
      }
    }
  }
}

function collectGroupsErrors(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push("`groups` must be an array of group deltas");
    return;
  }
  const names: string[] = [];
  for (const [index, delta] of value.entries()) {
    if (!isPlainObject(delta)) {
      errors.push(`\`groups[${index}]\` must be an object`);
      continue;
    }
    if (typeof delta.name !== "string" || delta.name === "") {
      errors.push(`\`groups[${index}].name\` must be a non-empty string`);
    } else {
      names.push(delta.name);
    }
    if (delta.toolOverrides !== undefined) {
      collectToolListErrors(delta.toolOverrides, `groups[${index}].toolOverrides`, errors);
    }
    collectItemMapErrors(delta.addItems, `groups[${index}].addItems`, errors);
    collectItemMapErrors(delta.removeItems, `groups[${index}].removeItems`, errors);
  }
  // The name is the merge key a member opts into, so two deltas sharing one
  // give the member no way to say which it meant.
  for (const name of duplicates(names)) {
    errors.push(
      `\`groups[]\` defines ${JSON.stringify(name)} more than once — a group name is the key ` +
        `members reference, so merge two deltas into one`,
    );
  }
}

function collectRepoEntryErrors(entry: unknown, index: number, errors: string[]): string | null {
  if (!isPlainObject(entry)) {
    errors.push(`\`repos[${index}]\` must be an object`);
    return null;
  }
  if (entry.groups !== undefined) {
    if (!isStringArray(entry.groups)) {
      errors.push(`\`repos[${index}].groups\` must be an array of strings`);
    } else {
      for (const name of duplicates(entry.groups)) {
        errors.push(`\`repos[${index}].groups\` names ${JSON.stringify(name)} twice`);
      }
    }
  }
  if (entry.overrides !== undefined) {
    if (!isPlainObject(entry.overrides)) {
      errors.push(`\`repos[${index}].overrides\` must be an object`);
    } else {
      if (entry.overrides.tools !== undefined) {
        collectToolListErrors(entry.overrides.tools, `repos[${index}].overrides.tools`, errors);
      }
      collectItemMapErrors(entry.overrides.addItems, `repos[${index}].overrides.addItems`, errors);
      collectItemMapErrors(
        entry.overrides.removeItems,
        `repos[${index}].overrides.removeItems`,
        errors,
      );
    }
  }

  if (typeof entry.path !== "string") {
    errors.push(`\`repos[${index}].path\` must be a string`);
    return null;
  }
  const defect = classifyRepoPath(entry.path);
  if (defect !== null) {
    errors.push(
      `\`repos[${index}].path\` ${JSON.stringify(entry.path)} ${REPO_PATH_DEFECT_MESSAGE[defect]}`,
    );
    return null;
  }
  return entry.path;
}

function collectReposErrors(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push("`repos` must be an array");
    return;
  }
  // Zero members is valid: a workspace is assembled — manifest first, policy
  // agreed — before the repositories are registered into it.
  const declaredBy = new Map<string, string>();
  for (const [index, entry] of value.entries()) {
    const path = collectRepoEntryErrors(entry, index, errors);
    if (path === null) continue;
    const key = normalizeRepoPathKey(path);
    const prior = declaredBy.get(key);
    if (prior === undefined) {
      declaredBy.set(key, path);
      continue;
    }
    // One error for the pair, not one per spelling: the author has a single
    // thing to fix.
    errors.push(
      `\`repos[]\` registers ${JSON.stringify(prior)} and ${JSON.stringify(path)}, which both ` +
        `name ${JSON.stringify(key)} — two entries syncing one directory race every write, ` +
        `so drop one`,
    );
  }
}

/**
 * Every defect in `data` as a `WorkspaceManifest`, one message per field path,
 * empty when the value is a valid manifest.
 */
export function collectWorkspaceManifestErrors(data: unknown): string[] {
  if (!isPlainObject(data)) {
    return [`the manifest root must be a JSON object (got ${describeRoot(data)})`];
  }
  const errors: string[] = [];
  // Semver, not any string: the generation gate in readWorkspaceManifest reads
  // this field, so a version it cannot parse is a defect rather than a shrug.
  if (typeof data.version !== "string" || semver.valid(data.version) === null) {
    errors.push('`version` must be a semantic version string (e.g. "1.0.0")');
  }
  collectDefaultsErrors(data.defaults, errors);
  collectGroupsErrors(data.groups, errors);
  collectReposErrors(data.repos, errors);
  if (data.lockedContent !== undefined && !isStringArray(data.lockedContent)) {
    errors.push("`lockedContent` must be an array of strings");
  }
  return errors;
}

// ── Migration ──────────────────────────────────────────────────────────────

/**
 * Workspace-schema migration steps, chained by `fromVersion`. Empty at
 * generation 1 — the schema is greenfield — but the runner ships before the
 * first migration does, so a future generation bump is a data change here
 * rather than a new pipeline at every read site.
 */
export const WORKSPACE_MANIFEST_MIGRATIONS: readonly ManifestMigration[] = [];

/**
 * Run {@link WORKSPACE_MANIFEST_MIGRATIONS} over a deep copy of `raw`, walking
 * `version` forward until no step matches. Pure: the caller's object is never
 * touched, and running the result through again is a no-op — with an empty
 * registry that makes this exactly a clone.
 *
 * A step that fails to advance `version` would loop forever, so a version
 * visited twice ends the walk and leaves the shape to validation.
 */
export function migrateWorkspaceManifest(raw: Record<string, unknown>): Record<string, unknown> {
  let current = structuredClone(raw);
  const visited = new Set<string>();
  for (;;) {
    const version = typeof current.version === "string" ? current.version : "";
    if (visited.has(version)) return current;
    visited.add(version);
    const step = WORKSPACE_MANIFEST_MIGRATIONS.find((entry) => entry.fromVersion === version);
    if (step === undefined) return current;
    current = step.migrate(current);
  }
}

// ── Read / write ───────────────────────────────────────────────────────────

/** Path of the manifest for the workspace rooted at `rootDir`. */
function workspaceManifestPath(rootDir: string): string {
  return join(rootDir, WORKSPACE_MANIFEST_FILE);
}

/**
 * Refuse a manifest from a newer schema generation before its shape is read.
 * Order matters: a future generation checked afterwards either fails the
 * per-field pass with messages that misdescribe it, or passes and is acted on
 * as if it were this generation.
 */
function assertReadableGeneration(document: Record<string, unknown>, path: string): void {
  const declared = document.version;
  // A non-semver version is a validation defect, reported with the rest.
  if (typeof declared !== "string" || semver.valid(declared) === null) return;
  const major = semver.major(declared);
  if (major <= semver.major(WORKSPACE_MANIFEST_VERSION)) return;
  throw new EngineError(
    `The workspace manifest at ${path} declares schema version ${declared}, newer than the ` +
      `${WORKSPACE_MANIFEST_VERSION} this build reads. Upgrade to a release that understands ` +
      `schema ${major}.x, then re-run.`,
    { code: "CONFIG_ERROR" },
  );
}

/**
 * A read that failed for a reason other than absence — the path is a directory,
 * permissions deny it, the device is failing. Classified `FS_ERROR` so the
 * failure carries an exit code like every other engine throw instead of
 * surfacing as an unclassified errno; the errno rides in the message and the
 * original error stays reachable as `cause`.
 */
function readFailure(cause: unknown, path: string): EngineError {
  const errno = (cause as NodeJS.ErrnoException | null)?.code;
  return new EngineError(
    `Cannot read the workspace manifest at ${path}${typeof errno === "string" ? ` (${errno})` : ""}. ` +
      `Confirm it is a readable file, then re-run.`,
    { code: "FS_ERROR", cause },
  );
}

/**
 * Read the workspace manifest at `rootDir`, or `null` when the directory holds
 * none — absence is the standalone case, not a failure.
 *
 * Throws `CONFIG_ERROR` for a file that is not readable as this generation's
 * JSON document, `VALIDATION_ERROR` naming every field defect at once, and
 * `FS_ERROR` when the file exists but cannot be read. Fields the current schema
 * does not know are carried through untouched: a manifest written by a newer
 * minor of the same generation stays readable, which is what the major-version
 * gate above is for.
 */
export async function readWorkspaceManifest(rootDir: string): Promise<WorkspaceManifest | null> {
  const path = workspaceManifestPath(rootDir);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT") return null;
    throw readFailure(err, path);
  }

  // parseJsonStrict rejects a root that is not a JSON object, so the assertion
  // is the narrowing it already performed.
  const document = parseJsonStrict(raw, path) as Record<string, unknown>;
  assertReadableGeneration(document, path);
  const migrated = migrateWorkspaceManifest(document);

  const errors = collectWorkspaceManifestErrors(migrated);
  if (errors.length > 0) {
    throw new EngineError(
      `Invalid workspace manifest in ${path}: ${errors.join("; ")}. Fix the field(s) named ` +
        `above and re-run.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  return migrated as unknown as WorkspaceManifest;
}

/**
 * Write `manifest` to `rootDir` atomically — temp file plus rename under the
 * path's cross-process write lock, so a crash never leaves a half-written
 * manifest and two concurrent runs serialize instead of interleaving.
 *
 * The manifest is validated first: `WorkspaceManifest` is a type, and the
 * defects that matter here — an escaping member path, two spellings of one
 * directory — are values. Refusing to persist what
 * {@link readWorkspaceManifest} would reject keeps the failure at the site
 * that produced it. Two-space JSON with a trailing newline, because this file
 * is read and diffed by humans.
 */
export async function writeWorkspaceManifest(
  rootDir: string,
  manifest: WorkspaceManifest,
): Promise<void> {
  const path = workspaceManifestPath(rootDir);
  const errors = collectWorkspaceManifestErrors(manifest);
  if (errors.length > 0) {
    throw new EngineError(
      `Refusing to write an invalid workspace manifest to ${path}: ${errors.join("; ")}.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  await atomicWriteFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * A fresh manifest at the current schema generation. The result shares no
 * reference with its inputs, so a caller that keeps building on the defaults
 * object it passed cannot retro-edit a manifest already handed to the writer.
 */
export function createWorkspaceManifest(
  defaults: WorkspaceDefaults,
  repos: readonly WorkspaceRepoEntry[],
): WorkspaceManifest {
  return structuredClone({
    version: WORKSPACE_MANIFEST_VERSION,
    defaults,
    repos: [...repos],
  });
}
