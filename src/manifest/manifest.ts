import { readFile } from "node:fs/promises";
import { join } from "node:path";
import semver from "semver";
import { isPlainObject, parseJsonStrict, unknownFields } from "../config/parse.ts";
import { atomicWriteFile } from "../merge/atomicWrite.ts";
import { mapFsErrno } from "../merge/fsErrors.ts";
import {
  DEFAULT_MAX_REVIEW_ITERATIONS,
  HARD_MAX_REVIEW_ITERATIONS,
  MIN_MAX_REVIEW_ITERATIONS,
  clampReviewIterations,
} from "../roster/reviewCaps.ts";
import { CONTENT_CLASSES, type ContentSelection } from "../types/content.ts";
import {
  DEFAULT_COMMUNICATION_STYLE,
  DEFAULT_MATURITY_TIER,
  EFFORT_LEVELS,
  MODEL_CLASSES,
  TOOLS,
  VALID_COMMUNICATION_STYLES,
  VALID_EFFORT_LEVELS,
  VALID_IMPORT_MODES,
  VALID_MATURITY_TIERS,
  VALID_MODEL_CLASSES,
  VALID_TOOLS,
  type CommunicationStyle,
  type MaturityTier,
  type Platform,
  type Tool,
} from "../types/core.ts";
import type { DetectedSummary } from "../types/detect.ts";
import { EngineError } from "../types/errors.ts";
import {
  MANIFEST_FILE,
  MANIFEST_VERSION,
  PACK_OWNER_PREFIX,
  type ImportDecision,
  type LearningsConfig,
  type LedgerEntry,
  type ManifestMigration,
  type McpConfig,
  type SetupManifest,
} from "../types/manifest.ts";
import { STATE_DIR } from "../types/markers.ts";

/**
 * The `.stamity/manifest.json` boundary: create, validate, read, write, and the
 * preserved-field carry-over that survives a regeneration.
 *
 * The manifest is the only state file, and the ownership ledger is its spine —
 * every emitted path is recorded with its owner, so deselecting an artifact and
 * making its file reclaimable are the same event. That makes a hand-edited or
 * truncated ledger a destructive input, which sets the posture here:
 *
 * - **Collect, do not fail fast.** {@link collectManifestErrors} names every
 *   defect in one pass, so a hand-edited manifest is repairable in one sitting
 *   instead of one defect per re-run. Only the read/write entry points throw.
 * - **Strict, not tolerant.** A field the schema does not know is an error
 *   naming the field, not a silent pass-through. Forward compatibility is what
 *   {@link MANIFEST_MIGRATIONS} is for; silent tolerance would let a typo'd
 *   `ledgar` key read as "no ledger" and make every emitted path unowned.
 * - **Contained paths.** A ledger row addresses a file the reclaim sweep may
 *   delete, so an absolute path or a `..` segment is refused by shape at
 *   validation time rather than resolved against the filesystem.
 *
 * Writes go through {@link atomicWriteFile} (temp+rename under the path's write
 * lock); reads go through `parseJsonStrict`.
 */

// ── Location ───────────────────────────────────────────────────────────────

/** Path of the manifest for the repo rooted at `rootDir`. */
export function manifestPath(rootDir: string): string {
  return join(rootDir, STATE_DIR, MANIFEST_FILE);
}

/**
 * The repo-relative POSIX spelling, for prose and for generated documentation.
 *
 * `manifestPath("")` cannot serve that purpose: `join` renders the platform's
 * own separator, so a page generated on Windows says `.stamity\manifest.json`
 * and a page generated anywhere else says `.stamity/manifest.json`. The
 * generated pages are committed and byte-diffed, which makes a platform-shaped
 * character in them a false diff on one OS and a stale-docs failure on the
 * other. Every path this project writes into a document or a manifest is POSIX
 * (`src/manifest/ledger.ts` refuses a backslash outright); this constant is
 * that rule applied to the manifest's own location.
 */
export const MANIFEST_REPO_PATH = `${STATE_DIR}/${MANIFEST_FILE}`;

// ── Migration ──────────────────────────────────────────────────────────────

/**
 * Manifest-schema migration steps, chained by `fromVersion`. Empty at
 * generation 1 — the schema is greenfield — but the runner ships before the
 * first migration does, so a future generation bump is a data change here
 * rather than a new pipeline at every read site.
 */
export const MANIFEST_MIGRATIONS: readonly ManifestMigration[] = [];

/**
 * Run {@link MANIFEST_MIGRATIONS} over a deep copy of `raw`, walking `version`
 * forward until no step matches. Pure: the caller's object is never touched,
 * and running the result through again is a no-op — with an empty registry
 * that makes this exactly a clone.
 *
 * A step that fails to advance `version` would loop forever, so a version
 * visited twice ends the walk and leaves the shape to validation.
 */
export function migrateManifest(raw: Record<string, unknown>): Record<string, unknown> {
  let current = structuredClone(raw);
  const visited = new Set<string>();
  for (;;) {
    const version = typeof current.version === "string" ? current.version : "";
    if (visited.has(version)) return current;
    visited.add(version);
    const step = MANIFEST_MIGRATIONS.find((entry) => entry.fromVersion === version);
    if (step === undefined) return current;
    current = step.migrate(current);
  }
}

// ── Creation ───────────────────────────────────────────────────────────────

export interface CreateManifestOptions {
  /** Target tools; at least one, since a manifest with no target generates nothing. */
  tools: Tool[];
  platform?: Platform;
  selection: ContentSelection;
  maturityTier?: MaturityTier;
  mcp?: McpConfig;
  detected?: DetectedSummary;
  /** The pre-existing-config decisions — one per file init found to decide about. */
  importChoice?: readonly ImportDecision[];
  /** Injected clock. Absent means now — tests pass a fixed date for byte-stable output. */
  now?: Date;
  /** Engine version stamped as `generatedBy`. */
  generatorVersion: string;
}

/**
 * A fresh manifest at the current schema generation, with an EMPTY ledger:
 * nothing has been emitted yet, and a ledger row is a claim of ownership over
 * a file on disk. Emission fills it.
 *
 * The result shares no reference with its inputs, so a caller that keeps
 * building on the selection object it passed cannot retro-edit a manifest
 * already handed to the writer.
 */
export function createManifest(options: CreateManifestOptions): SetupManifest {
  const timestamp = (options.now ?? new Date()).toISOString();
  return structuredClone({
    version: MANIFEST_VERSION,
    generatedBy: options.generatorVersion,
    createdAt: timestamp,
    updatedAt: timestamp,
    tools: options.tools,
    ...(options.platform !== undefined ? { platform: options.platform } : {}),
    ...(options.maturityTier !== undefined ? { maturityTier: options.maturityTier } : {}),
    selection: options.selection,
    ledger: [] as LedgerEntry[],
    ...(options.mcp !== undefined ? { mcp: options.mcp } : {}),
    ...(options.importChoice !== undefined ? { importChoice: options.importChoice } : {}),
    ...(options.detected !== undefined ? { detected: options.detected } : {}),
  });
}

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * Canonical top-level field order, doubling as the known-field set for the
 * strict unknown-field gate. Typed as a total record over `SetupManifest`, so
 * adding a field to the interface is a compile error here until it is placed —
 * a new field cannot be shipped that validation rejects as unknown and
 * serialization silently drops.
 */
const MANIFEST_FIELD_ORDER: Record<keyof SetupManifest, true> = {
  version: true,
  generatedBy: true,
  createdAt: true,
  updatedAt: true,
  tools: true,
  platform: true,
  maturityTier: true,
  communicationStyle: true,
  selection: true,
  ledger: true,
  mcp: true,
  learnings: true,
  hooks: true,
  models: true,
  importChoice: true,
  toolOptions: true,
  detected: true,
};

const MANIFEST_FIELDS = Object.keys(MANIFEST_FIELD_ORDER) as (keyof SetupManifest)[];

/**
 * Platform membership set. Built from a total record so a new `Platform` member
 * fails compilation here rather than being rejected at runtime as unknown.
 */
const PLATFORM_MEMBERS: Record<Platform, true> = {
  github: true,
  "azure-devops": true,
  gitlab: true,
};
const VALID_PLATFORMS = new Set(Object.keys(PLATFORM_MEMBERS));

/** Ledger `artifactType` values: the content classes plus the infra bucket. */
const VALID_ARTIFACT_TYPES = new Set<string>([...CONTENT_CLASSES, "infra"]);

/** Value class for the root-shape message; never dumps the value itself. */
function describeRoot(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** Windows absolute forms POSIX `path.isAbsolute` does not recognise: a drive
 *  letter (`C:/x`, `C:x`) and a UNC share (`\\server\share`). */
const WINDOWS_ABSOLUTE_PATTERN = /^(?:[A-Za-z]:|\\\\)/;

/**
 * Why `value` cannot be used as a repo-relative emitted path, or `null` when it
 * can. Judged by shape, not by resolving against the filesystem: a manifest is
 * read on machines other than the one that wrote it, so a Windows-shaped
 * absolute path has to be refused on Linux too.
 */
function repoPathDefect(value: string): string | null {
  if (value === "") return "is empty";
  if (value.includes("\0")) return "contains a NUL byte";
  if (value.startsWith("/") || value.startsWith("\\")) return "is an absolute path";
  if (WINDOWS_ABSOLUTE_PATTERN.test(value)) return "is an absolute path";
  if (value.includes("\\")) return "uses a backslash separator (emitted paths are POSIX)";
  const segments = value.split("/");
  if (segments.includes("..")) return "climbs out of the repo root with a `..` segment";
  // One path, one spelling. `./AGENTS.md` and `AGENTS.md` address the same file
  // but are different STRINGS, and the ledger is keyed by string: a row under
  // one spelling was queued for reclaim while the sweep's trusted-infra
  // allowlist held the other, so a file the engine still emits could be
  // proposed for deletion. Normalising downstream only moves the problem to
  // whichever reader forgets; refusing the segment here means there is only
  // ever one identity to compare.
  if (segments.includes(".")) {
    return "carries a `.` segment — an emitted path is already repo-relative, so drop the `./`";
  }
  return null;
}

function collectSelectionErrors(value: unknown, errors: string[]): void {
  if (!isPlainObject(value) || !isPlainObject(value.items)) {
    errors.push("`selection` must be an object with an `items` object");
    return;
  }
  const items = value.items;
  for (const contentClass of CONTENT_CLASSES) {
    if (!isStringArray(items[contentClass])) {
      errors.push(`\`selection.items.${contentClass}\` must be an array of strings`);
    }
  }
  for (const key of unknownFields(items, CONTENT_CLASSES)) {
    errors.push(
      `\`selection.items.${key}\` is not a content class (known: ${CONTENT_CLASSES.join(", ")})`,
    );
  }
}

/**
 * Why `value` cannot own a ledger row, or `null` when it can. Two owner kinds
 * exist (see `LedgerOwner`): an adapter target tool, and an installed content
 * pack, spelled `pack:<id>`. The pack id itself is validated where a pack is
 * installed — here the only requirement is that one is present, so a bare
 * `pack:` cannot become an owner that matches every pack.
 */
function ledgerOwnerDefect(value: unknown): string | null {
  if (typeof value !== "string") return "must be a string";
  if (VALID_TOOLS.has(value)) return null;
  if (value.startsWith(PACK_OWNER_PREFIX)) {
    return value.length > PACK_OWNER_PREFIX.length
      ? null
      : `is a pack owner with no pack id after \`${PACK_OWNER_PREFIX}\``;
  }
  return `names neither a known tool (${TOOLS.join(", ")}) nor a \`${PACK_OWNER_PREFIX}<id>\` pack`;
}

function collectLedgerEntryErrors(entry: unknown, index: number, errors: string[]): string | null {
  if (!isPlainObject(entry)) {
    errors.push(`\`ledger[${index}]\` must be an object`);
    return null;
  }
  if (!isNonEmptyString(entry.artifactId)) {
    errors.push(`\`ledger[${index}].artifactId\` must be a non-empty string`);
  }
  const ownerDefect = ledgerOwnerDefect(entry.adapter);
  if (ownerDefect !== null) {
    errors.push(
      `\`ledger[${index}].adapter\` ${JSON.stringify(entry.adapter)} ${ownerDefect}`,
    );
  }
  if (typeof entry.artifactType !== "string" || !VALID_ARTIFACT_TYPES.has(entry.artifactType)) {
    errors.push(
      `\`ledger[${index}].artifactType\` must be one of ${[...VALID_ARTIFACT_TYPES].join(", ")}`,
    );
  }
  if (entry.contentHash !== undefined && typeof entry.contentHash !== "string") {
    errors.push(`\`ledger[${index}].contentHash\` must be a string`);
  }
  if (entry.stampedVersion !== undefined && typeof entry.stampedVersion !== "string") {
    errors.push(`\`ledger[${index}].stampedVersion\` must be a string`);
  }
  if (typeof entry.path !== "string") {
    errors.push(`\`ledger[${index}].path\` must be a string`);
    return null;
  }
  const defect = repoPathDefect(entry.path);
  if (defect !== null) {
    errors.push(`\`ledger[${index}].path\` ${JSON.stringify(entry.path)} ${defect}`);
    return null;
  }
  return entry.path;
}

function collectLedgerErrors(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push("`ledger` must be an array");
    return;
  }
  // Zero rows is valid: a manifest exists before the first emission fills it.
  // Row identity is the (adapter, path) PAIR — the ledger module's own rowKey
  // (src/manifest/ledger.ts): one path legitimately carries a row per owner
  // (a shared AGENTS.md is co-owned by every selected tool, and only every
  // owner stopping its emission frees the file), so uniqueness binds per
  // owner, never per path. Path-level uniqueness was the pre-co-owner check;
  // relaxed to the pair when the emission composer activated multi-owner rows —
  // same-owner duplicates stay refused.
  const seen = new Map<string, number>();
  for (const [index, entry] of value.entries()) {
    const path = collectLedgerEntryErrors(entry, index, errors);
    if (path === null) continue;
    const key = `${String((entry as { adapter?: unknown }).adapter)}\u0000${path}`;
    const prior = seen.get(key);
    if (prior === undefined) {
      seen.set(key, index);
      continue;
    }
    errors.push(
      `\`ledger[${prior}]\` and \`ledger[${index}]\` both claim ${JSON.stringify(path)} ` +
        `for the same owner — one row per (adapter, path) pair, so drop one row`,
    );
  }
}

function collectMcpErrors(value: unknown, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push("`mcp` must be an object");
    return;
  }
  if (!isStringArray(value.servers)) errors.push("`mcp.servers` must be an array of strings");
  if (value.protocolVersion !== undefined && typeof value.protocolVersion !== "string") {
    errors.push("`mcp.protocolVersion` must be a string");
  }
}

/**
 * Why `value` cannot be a pinned model id, or `null` when it can.
 *
 * SHAPE only, and deliberately so: this engine ships no vendor model
 * catalogue, so a membership check would be a guarantee it cannot keep — the
 * id is passed through verbatim to whatever the client does with it. What is
 * checkable is that the string can carry a value at all: an empty or
 * whitespace-only pin emits a frontmatter key with no value, and a newline
 * would break the line-oriented dialects the adapters write.
 */
function modelPinDefect(value: unknown): string | null {
  if (typeof value !== "string") return "must be a string";
  if (value.trim() === "") return "is empty";
  if (/[\r\n]/.test(value)) return "spans more than one line";
  return null;
}

/** Class keys of one `models` sub-map, refusing any key outside the ladder vocabulary. */
function modelClassEntries(
  value: Record<string, unknown>,
  field: string,
  errors: string[],
): [string, unknown][] {
  const entries: [string, unknown][] = [];
  for (const [modelClass, entry] of Object.entries(value)) {
    if (!VALID_MODEL_CLASSES.has(modelClass)) {
      errors.push(
        `\`${field}.${modelClass}\` names unknown model class (known: ${MODEL_CLASSES.join(", ")})`,
      );
      continue;
    }
    entries.push([modelClass, entry]);
  }
  return entries;
}

/**
 * The operator's ladder overrides. Every member is optional and absence means
 * "the ladder decides", so this collector only ever narrows a value that is
 * actually present — which is what keeps the field additive at the current
 * schema generation.
 */
function collectModelsErrors(value: unknown, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push("`models` must be an object");
    return;
  }

  if (value.pins !== undefined) {
    if (!isPlainObject(value.pins)) {
      errors.push("`models.pins` must be an object keyed by model class");
    } else {
      for (const [modelClass, pin] of modelClassEntries(value.pins, "models.pins", errors)) {
        const defect = modelPinDefect(pin);
        if (defect !== null) {
          errors.push(`\`models.pins.${modelClass}\` ${JSON.stringify(pin)} ${defect}`);
        }
      }
    }
  }

  if (value.effort !== undefined) {
    if (!isPlainObject(value.effort)) {
      errors.push("`models.effort` must be an object keyed by model class");
    } else {
      for (const [modelClass, level] of modelClassEntries(value.effort, "models.effort", errors)) {
        // A listed class with no level is not "unset" — the key is there, so
        // something was meant by it; collectEnumError passes `undefined`
        // through as absence, which is why this is checked beside it.
        if (level === undefined) {
          errors.push(
            `\`models.effort.${modelClass}\` must be one of ${EFFORT_LEVELS.join(" | ")} ` +
              `(got undefined) — drop the class to fall back to the ladder`,
          );
          continue;
        }
        collectEnumError(level, VALID_EFFORT_LEVELS, `models.effort.${modelClass}`, errors);
      }
    }
  }

  if (value.reviewCap !== undefined) {
    const cap = value.reviewCap;
    if (
      !Number.isInteger(cap) ||
      (cap as number) < MIN_MAX_REVIEW_ITERATIONS ||
      (cap as number) > HARD_MAX_REVIEW_ITERATIONS
    ) {
      errors.push(
        `\`models.reviewCap\` must be a whole number of rounds within ` +
          `${MIN_MAX_REVIEW_ITERATIONS}..${HARD_MAX_REVIEW_ITERATIONS} (got ${JSON.stringify(cap)})`,
      );
    }
  }

  for (const key of unknownFields(value, ["pins", "effort", "reviewCap"])) {
    errors.push(`unknown field \`models.${key}\``);
  }
}

/**
 * The import decisions, validated as a LIST of pairs — one record per
 * pre-existing instruction file the repo carried. Each `path` runs the same
 * containment grammar every other persisted repo path does: a record
 * suppresses or redirects emission at its path, so a hand-edited absolute or
 * `..` value would be a way to point that somewhere it does not belong.
 *
 * Every element is indexed in its error message, because a manifest with three
 * decisions and one bad path is unrepairable from an unindexed complaint.
 */
function collectImportChoiceErrors(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push("`importChoice` must be an array of { path, mode } decisions");
    return;
  }
  for (const [index, entry] of value.entries()) {
    const field = `importChoice[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`\`${field}\` must be an object`);
      continue;
    }
    if (typeof entry.path !== "string") {
      errors.push(`\`${field}.path\` must be a repo-relative POSIX path string`);
    } else {
      const defect = repoPathDefect(entry.path);
      if (defect !== null) {
        errors.push(`\`${field}.path\` ${JSON.stringify(entry.path)} ${defect}`);
      }
    }
    collectEnumError(entry.mode, VALID_IMPORT_MODES, `${field}.mode`, errors);
    if (entry.mode === undefined) errors.push(`\`${field}.mode\` is required`);
    for (const key of unknownFields(entry, ["path", "mode"])) {
      errors.push(`unknown field \`${field}.${key}\``);
    }
  }
}

function collectToolOptionsErrors(value: unknown, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push("`toolOptions` must be an object keyed by tool");
    return;
  }
  for (const [key, bag] of Object.entries(value)) {
    if (!VALID_TOOLS.has(key)) {
      errors.push(
        `\`toolOptions.${key}\` names unknown tool (known: ${TOOLS.join(", ")})`,
      );
      continue;
    }
    // The bag's keys stay opaque — the engine passes them through — but the bag
    // itself has to be an object, or the pass-through has nothing to carry.
    if (!isPlainObject(bag)) errors.push(`\`toolOptions.${key}\` must be an object`);
  }
}

/**
 * Known fields of the persisted detection summary, as a total record over
 * `DetectedSummary` — so a field added to that interface is a compile error
 * here until it is placed, exactly as {@link MANIFEST_FIELD_ORDER} does one
 * level up.
 */
const DETECTED_FIELD_ORDER: Record<keyof DetectedSummary, true> = {
  languages: true,
  linters: true,
  testFrameworks: true,
  ciProviders: true,
  packageManager: true,
  packageScripts: true,
};

const DETECTED_FIELDS = Object.keys(DETECTED_FIELD_ORDER);

/** The four lists detection always writes; absence of any one is a defect, not an option. */
const DETECTED_REQUIRED_LISTS = ["languages", "linters", "testFrameworks", "ciProviders"] as const;

/**
 * The persisted detection summary — all six fields, not four.
 *
 * `packageManager` and `packageScripts` are precisely the two the gate resolver
 * consumes (`../detect/verificationGates.ts`), and precisely the two this
 * collector used to skip: a hand-edited or migration-sourced manifest carrying
 * `packageScripts: "test"` passed validation, then reached a `.includes` call
 * inside emission and threw a raw TypeError with no what, no why and no next.
 * The resolver keeps an `Array.isArray` guard of its own as defence in depth;
 * this is the boundary that owes the actionable message.
 *
 * The unknown-field sweep matches the top-level posture: a typo'd
 * `detected.testFramework` accepted silently reads as "no test frameworks
 * detected" and quietly changes what the emitted charter states as fact.
 */
function collectDetectedErrors(value: unknown, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push("`detected` must be an object");
    return;
  }
  for (const field of DETECTED_REQUIRED_LISTS) {
    if (!isStringArray(value[field])) {
      errors.push(`\`detected.${field}\` must be an array of strings`);
    }
  }
  if (value.packageManager !== undefined && !isNonEmptyString(value.packageManager)) {
    errors.push("`detected.packageManager` must be a non-empty package-manager name");
  }
  if (value.packageScripts !== undefined && !isStringArray(value.packageScripts)) {
    errors.push("`detected.packageScripts` must be an array of strings");
  }
  for (const key of unknownFields(value, DETECTED_FIELDS)) {
    errors.push(`unknown field \`detected.${key}\` (known: ${DETECTED_FIELDS.join(", ")})`);
  }
}

function collectEnumError(
  value: unknown,
  valid: ReadonlySet<string>,
  field: string,
  errors: string[],
): void {
  if (value === undefined) return;
  if (typeof value !== "string" || !valid.has(value)) {
    errors.push(
      `\`${field}\` must be one of ${[...valid].join(" | ")} (got ${JSON.stringify(value)})`,
    );
  }
}

/** True for a string a `Date` can parse — the shape `toISOString()` produces. */
function isTimestamp(value: unknown): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/**
 * Every defect in `data` as a `SetupManifest`, one message per field path,
 * empty when the value is a valid manifest. Never throws — the read and write
 * entry points decide what a defect means at their boundary.
 */
export function collectManifestErrors(data: unknown): string[] {
  if (!isPlainObject(data)) {
    return [`the manifest root must be a JSON object (got ${describeRoot(data)})`];
  }
  const errors: string[] = [];

  // Semver, not any string: the generation gate in readManifest and the
  // migration runner both key off this field, so one it cannot parse is a
  // defect rather than a shrug.
  if (typeof data.version !== "string" || semver.valid(data.version) === null) {
    errors.push(`\`version\` must be a semantic version string (e.g. "${MANIFEST_VERSION}")`);
  }
  if (!isNonEmptyString(data.generatedBy)) {
    errors.push("`generatedBy` must be a non-empty engine version string");
  }
  for (const field of ["createdAt", "updatedAt"] as const) {
    if (!isTimestamp(data[field])) errors.push(`\`${field}\` must be an ISO-8601 timestamp`);
  }

  if (!Array.isArray(data.tools)) {
    errors.push("`tools` must be an array");
  } else if (data.tools.length === 0) {
    errors.push("`tools` must name at least one target tool");
  } else {
    for (const tool of data.tools) {
      if (VALID_TOOLS.has(tool as string)) continue;
      errors.push(`\`tools\` names unknown tool ${JSON.stringify(tool)} (known: ${TOOLS.join(", ")})`);
    }
  }

  collectEnumError(data.platform, VALID_PLATFORMS, "platform", errors);
  collectEnumError(data.maturityTier, VALID_MATURITY_TIERS, "maturityTier", errors);
  collectEnumError(data.communicationStyle, VALID_COMMUNICATION_STYLES, "communicationStyle", errors);

  collectSelectionErrors(data.selection, errors);
  collectLedgerErrors(data.ledger, errors);

  if (data.mcp !== undefined) collectMcpErrors(data.mcp, errors);
  if (data.learnings !== undefined) {
    if (!isPlainObject(data.learnings)) {
      errors.push("`learnings` must be an object");
    } else if (
      data.learnings.maxCount !== undefined &&
      (!Number.isInteger(data.learnings.maxCount) || (data.learnings.maxCount as number) < 1)
    ) {
      errors.push("`learnings.maxCount` must be a positive integer");
    }
  }
  if (data.hooks !== undefined) {
    if (!isPlainObject(data.hooks)) {
      errors.push("`hooks` must be an object");
    } else if (data.hooks.userHooksDir !== undefined) {
      if (typeof data.hooks.userHooksDir !== "string") {
        errors.push("`hooks.userHooksDir` must be a string");
      } else {
        const defect = repoPathDefect(data.hooks.userHooksDir);
        if (defect !== null) {
          errors.push(
            `\`hooks.userHooksDir\` ${JSON.stringify(data.hooks.userHooksDir)} ${defect}`,
          );
        }
      }
    }
  }
  if (data.models !== undefined) collectModelsErrors(data.models, errors);
  if (data.importChoice !== undefined) collectImportChoiceErrors(data.importChoice, errors);
  if (data.toolOptions !== undefined) collectToolOptionsErrors(data.toolOptions, errors);
  if (data.detected !== undefined) collectDetectedErrors(data.detected, errors);

  // Strict by design: a key outside the schema is named, not carried. A typo'd
  // `ledgar` accepted silently would read as "no ledger" and leave every
  // emitted path unowned; a genuinely new field arrives through a migration.
  for (const key of unknownFields(data, MANIFEST_FIELDS)) {
    errors.push(`unknown field \`${key}\``);
  }
  return errors;
}

/** Type guard over {@link collectManifestErrors}: valid means zero defects. */
export function validateManifest(data: unknown): data is SetupManifest {
  return collectManifestErrors(data).length === 0;
}

// ── Serialization ──────────────────────────────────────────────────────────

/**
 * Deep key sort for nested values, arrays left in order. Two manifests that are
 * deep-equal serialize to identical bytes regardless of the order their keys
 * were assigned in, which is what keeps a no-op regeneration out of the diff.
 * Array order carries meaning (ledger rows, selection lists) and is preserved.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).toSorted()) out[key] = canonicalize(value[key]);
  return out;
}

/**
 * Stable two-space JSON with a trailing newline — the file is read and diffed
 * by humans, so the top level keeps the declared field order of
 * {@link MANIFEST_FIELD_ORDER} and only nested objects fall back to sorted
 * keys. Absent optionals are omitted rather than written as `null`.
 *
 * Lossless for any manifest that passes validation: unknown top-level fields
 * are rejected there, so there are none here to drop.
 */
function serializeManifest(manifest: SetupManifest): string {
  const ordered: Record<string, unknown> = {};
  for (const field of MANIFEST_FIELDS) {
    const value = manifest[field];
    if (value !== undefined) ordered[field] = canonicalize(value);
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

// ── Read / write ───────────────────────────────────────────────────────────

/**
 * Read-direction errno messages. The shared table in `../merge/fsErrors.ts` is
 * write-flavoured ("writing <path>"), so the two errnos a manifest read
 * actually hits get their own sentence; anything else falls back to that table,
 * whose advice (free space, raise the fd limit, check the disk) reads the same
 * in either direction.
 */
const READ_ERRNO_MESSAGE: Record<string, (path: string) => string> = {
  EISDIR: (p) =>
    `Cannot read the manifest at ${p}: that path is a directory, not a file. Remove or rename it, then re-run.`,
  EACCES: (p) =>
    `Permission denied reading ${p}. Check the file's permissions and confirm the current user can read it.`,
};

function readFailure(cause: unknown, path: string): unknown {
  const code = (cause as NodeJS.ErrnoException | null)?.code;
  const messageFor = typeof code === "string" ? READ_ERRNO_MESSAGE[code] : undefined;
  if (messageFor !== undefined) {
    return new EngineError(messageFor(path), { code: "FS_ERROR", cause });
  }
  return mapFsErrno(cause, path) ?? cause;
}

/**
 * Refuse a manifest from a newer schema generation before its shape is read.
 * Order matters: a future generation checked afterwards either fails the
 * per-field pass with messages that misdescribe it, or passes and is acted on
 * as if it were this generation — which, for a file whose ledger authorises
 * deletions, is the expensive way to find out.
 */
function assertReadableGeneration(document: Record<string, unknown>, path: string): void {
  const declared = document.version;
  // A non-semver version is a validation defect, reported with the rest.
  if (typeof declared !== "string" || semver.valid(declared) === null) return;
  const major = semver.major(declared);
  if (major <= semver.major(MANIFEST_VERSION)) return;
  throw new EngineError(
    `The manifest at ${path} declares schema version ${declared}, newer than the ` +
      `${MANIFEST_VERSION} this build reads. Upgrade to a release that understands ` +
      `schema ${major}.x, then re-run.`,
    { code: "CONFIG_ERROR" },
  );
}

/** UTF-8 BOM. Editors on Windows add one; `JSON.parse` refuses it. */
const BOM = "\uFEFF";

/**
 * Read the manifest under `rootDir`, or `null` when the repo has none — absence
 * is the un-initialised case, not a failure.
 *
 * Throws `CONFIG_ERROR` naming every field defect at once for a file that is
 * not a valid manifest of this generation, and `FS_ERROR` for a path that
 * cannot be read as a file.
 */
export async function readManifest(rootDir: string): Promise<SetupManifest | null> {
  const path = manifestPath(rootDir);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException | null)?.code === "ENOENT") return null;
    throw readFailure(cause, path);
  }

  // parseJsonStrict rejects a root that is not a JSON object, so the assertion
  // is the narrowing it already performed.
  const document = parseJsonStrict(
    raw.startsWith(BOM) ? raw.slice(BOM.length) : raw,
    path,
  ) as Record<string, unknown>;
  assertReadableGeneration(document, path);
  const migrated = migrateManifest(document);

  const errors = collectManifestErrors(migrated);
  if (errors.length > 0) {
    throw new EngineError(
      `Invalid manifest in ${path}: ${errors.join("; ")}. Fix the field(s) named above, or ` +
        `delete the file and re-initialise the repo.`,
      { code: "CONFIG_ERROR" },
    );
  }
  return migrated as unknown as SetupManifest;
}

/**
 * Write `manifest` under `rootDir` atomically — temp file plus rename under the
 * path's cross-process write lock, so a crash never leaves a half-written
 * ledger and two concurrent runs serialize instead of interleaving. Parent
 * directories are created as needed.
 *
 * `updatedAt` is stamped from `opts.now` (default: the wall clock) on a COPY:
 * the caller's object is not mutated, so a manifest handed to the writer twice
 * is not silently different from the one the caller still holds.
 *
 * The manifest is validated first. `SetupManifest` is a type, and the defects
 * that matter here — an escaping ledger path, two rows claiming one file — are
 * values, so refusing to persist what {@link readManifest} would reject keeps
 * the failure at the site that produced it.
 */
export async function writeManifest(
  rootDir: string,
  manifest: SetupManifest,
  opts: { now?: Date } = {},
): Promise<void> {
  const path = manifestPath(rootDir);
  const stamped: SetupManifest = {
    ...manifest,
    updatedAt: (opts.now ?? new Date()).toISOString(),
  };
  const errors = collectManifestErrors(stamped);
  if (errors.length > 0) {
    throw new EngineError(
      `Refusing to write an invalid manifest to ${path}: ${errors.join("; ")}.`,
      { code: "CONFIG_ERROR" },
    );
  }
  await atomicWriteFile(path, serializeManifest(stamped));
}

// ── Preserved fields ───────────────────────────────────────────────────────

/**
 * The subset of a manifest that a regeneration must carry over: the answers the
 * user gave, as opposed to the facts a fresh run recomputes (version stamps,
 * timestamps, detection, and the ledger, which belongs to whatever was actually
 * emitted this run).
 *
 * The rule is uniform — a field present here wins over the fresh manifest's
 * value — so a caller that wants the fresh value simply leaves the field out.
 * {@link extractPreservedManifestFields} only fills fields the old manifest
 * actually carried, which makes the round-trip a no-op on a fresh repo.
 */
export interface PreservedManifestFields {
  selection?: ContentSelection;
  mcp?: McpConfig;
  maturityTier?: MaturityTier;
  communicationStyle?: CommunicationStyle;
  learnings?: LearningsConfig;
  toolOptions?: SetupManifest["toolOptions"];
}

/** Lift the user-settled fields off `manifest`. Deep-copied: the bag outlives
 *  the manifest it came from, typically across a `clean` that deletes it. */
export function extractPreservedManifestFields(manifest: SetupManifest): PreservedManifestFields {
  const preserved: PreservedManifestFields = {};
  if (manifest.selection !== undefined) preserved.selection = structuredClone(manifest.selection);
  if (manifest.mcp !== undefined) preserved.mcp = structuredClone(manifest.mcp);
  if (manifest.maturityTier !== undefined) preserved.maturityTier = manifest.maturityTier;
  if (manifest.communicationStyle !== undefined) {
    preserved.communicationStyle = manifest.communicationStyle;
  }
  if (manifest.learnings !== undefined) preserved.learnings = structuredClone(manifest.learnings);
  if (manifest.toolOptions !== undefined) {
    preserved.toolOptions = structuredClone(manifest.toolOptions);
  }
  return preserved;
}

/**
 * `fresh` with every field `preserved` carries applied over it, as a new
 * manifest — neither input is mutated, so a failed regeneration cannot leave a
 * half-merged object behind.
 */
export function applyPreservedManifestFields(
  fresh: SetupManifest,
  preserved: PreservedManifestFields,
): SetupManifest {
  const merged = structuredClone(fresh);
  if (preserved.selection !== undefined) merged.selection = structuredClone(preserved.selection);
  if (preserved.mcp !== undefined) merged.mcp = structuredClone(preserved.mcp);
  if (preserved.maturityTier !== undefined) merged.maturityTier = preserved.maturityTier;
  if (preserved.communicationStyle !== undefined) {
    merged.communicationStyle = preserved.communicationStyle;
  }
  if (preserved.learnings !== undefined) merged.learnings = structuredClone(preserved.learnings);
  if (preserved.toolOptions !== undefined) {
    merged.toolOptions = structuredClone(preserved.toolOptions);
  }
  return merged;
}

// ── Scalar dials → prompt directives ───────────────────────────────────────

/**
 * Resolve the maturity tier. An out-of-enum persisted value is already refused
 * at the persistence boundary by {@link collectManifestErrors}; the membership
 * re-check is for the `null` / not-yet-read callers, which resolve to the
 * default rather than forcing every call site to handle absence.
 */
export function readMaturityTier(manifest: SetupManifest | null | undefined): MaturityTier {
  const value = manifest?.maturityTier;
  return value !== undefined && VALID_MATURITY_TIERS.has(value) ? value : DEFAULT_MATURITY_TIER;
}

/**
 * One-line directive carrying the resolved tier into generated prompts. The
 * tier calibrates depth of investment; it never gates which content is
 * installed, which is why the floor clause is unconditional.
 */
export function maturityDirective(tier: MaturityTier): string {
  return (
    `Right-size to maturity=${tier}: invest exactly as deep as this tier needs, no deeper. ` +
    `The universal floor — security, correctness, accessibility basics, tests on every ` +
    `changed surface — binds at every tier.`
  );
}

/** Resolve the operator-communication style, defaulting on absence. */
export function readCommunicationStyle(
  manifest: SetupManifest | null | undefined,
): CommunicationStyle {
  const value = manifest?.communicationStyle;
  return value !== undefined && VALID_COMMUNICATION_STYLES.has(value)
    ? value
    : DEFAULT_COMMUNICATION_STYLE;
}

/**
 * Resolve the review-loop iteration cap: the operator's number when they set
 * one, {@link DEFAULT_MAX_REVIEW_ITERATIONS} when they did not, clamped into
 * the band either way.
 *
 * Total, and that is the point. The cap appears in three places an operator
 * can compare — the emitted gate script's counter, the work command's prose,
 * and `stamity config` — and three call sites each clamping for themselves is
 * three chances to state a different number. They read this instead. A
 * hand-edited out-of-band value is already refused at the persistence boundary
 * by {@link collectManifestErrors}; the clamp here answers for the callers
 * that hold a manifest object rather than a file, exactly as the membership
 * re-check in {@link readMaturityTier} does.
 */
export function readReviewCap(manifest: SetupManifest | null | undefined): number {
  const value = manifest?.models?.reviewCap;
  return value === undefined ? DEFAULT_MAX_REVIEW_ITERATIONS : clampReviewIterations(value);
}

const COMMUNICATION_STYLE_EFFECT: Record<CommunicationStyle, string> = {
  plain: "define jargon on first use and lead with outcomes",
  technical: "use precise domain terminology and lead with implementation detail",
};

/** One-line directive carrying the resolved style into generated agents. */
export function communicationStyleDirective(style: CommunicationStyle): string {
  return `Communication style=${style}: ${COMMUNICATION_STYLE_EFFECT[style]}.`;
}
