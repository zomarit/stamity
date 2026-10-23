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
import { isSemverShaped } from "../shared/cliCall.ts";
import { EngineError } from "../types/errors.ts";
import {
  AUTONOMY_MODES,
  DEPLOYING_ACTS,
  MANIFEST_FILE,
  MANIFEST_VERSION,
  PACK_OWNER_PREFIX,
  RULE_DELIVERIES,
  RULE_DELIVERY_DEFAULT,
  type GatesConfig,
  type ImportDecision,
  type LearningsConfig,
  type LedgerEntry,
  type ListedModels,
  type ManifestMigration,
  type McpConfig,
  type RuleDelivery,
  type SetupManifest,
} from "../types/manifest.ts";
import { STATE_DIR } from "../types/markers.ts";
import { MAX_CO_OWNED_ELEMENTS, MAX_CO_OWNED_POINTERS, parseMemberPointer } from "./jsonMembers.ts";
import { OWNED_PATHS, ownedPathDefect } from "./ownedPaths.ts";

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
 * Generation 1 → 2 (REQ-LADDER-005): each class's pin, one string for every
 * client, becomes `{ all: <that string> }`, the per-client map's fallback key,
 * so every client resolves the id it resolved before.
 *
 * Only a STRING pin is rewritten. Any other value — a number, an array, an
 * object already shaped for generation 2 — is carried as it stands, so
 * validation names a malformed one instead of the step dropping it. Every
 * other field is passed through untouched, the `plugin` block of a 1.14 setup
 * included (the read drops that one after the walk, {@link readManifest}): the
 * step builds new objects only along the `models.pins` path and shares the rest
 * with its input, which `migrateManifest` has already deep-copied. Idempotent:
 * a generation-2 shape passes through with nothing to rewrite.
 */
export const PER_CLIENT_PINS_STEP: ManifestMigration = {
  fromVersion: "1.0.0",
  migrate(raw: Record<string, unknown>): Record<string, unknown> {
    const next: Record<string, unknown> = { ...raw, version: "2.0.0" };
    const models = raw.models;
    if (!isPlainObject(models) || !isPlainObject(models.pins)) return next;
    // `Object.fromEntries` defines every key as an own property. An assignment loop
    // would hand a `__proto__` class key to the prototype setter, hiding it from
    // validation and dropping it on the next write.
    const pins = Object.fromEntries(
      Object.entries(models.pins).map(([modelClass, pin]) => [
        modelClass,
        typeof pin === "string" ? { all: pin } : pin,
      ]),
    );
    next.models = { ...models, pins };
    return next;
  },
};

/**
 * Manifest-schema migration steps, chained by `fromVersion`: a manifest is
 * walked from its declared generation to {@link MANIFEST_VERSION} on every
 * read, so a generation bump is a data change here rather than a new pipeline
 * at every read site.
 */
export const MANIFEST_MIGRATIONS: readonly ManifestMigration[] = [PER_CLIENT_PINS_STEP];

/**
 * Run {@link MANIFEST_MIGRATIONS} over a deep copy of `raw`, walking `version`
 * forward until no step matches. Pure: the caller's object is never touched,
 * and running the result through again is a no-op, since no step starts from
 * the generation the last one ends at.
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
  ruleDelivery: true,
  selection: true,
  ledger: true,
  mcp: true,
  learnings: true,
  hooks: true,
  models: true,
  gates: true,
  autonomy: true,
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

/** Rule-delivery membership set, from the sanctioned list the types leaf publishes. */
const VALID_RULE_DELIVERIES = new Set<string>(RULE_DELIVERIES);

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

/** The fields of a row's `coOwned` record (`CoOwnership`). */
const CO_OWNED_FIELDS = ["members", "elements", "preexisting", "lines", "createdFile", "terminatorAdded"] as const;
/** The longest owned line (`u1-gitignore-lines`'s value bound). */
const MAX_CO_OWNED_LINE = 1024;
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Why `pointer` is not a member pointer, or `null` when it is one. */
function memberPointerDefect(pointer: string): string | null {
  try {
    parseMemberPointer(pointer);
    return null;
  } catch (error) {
    // reason: not silent — the refusal's own message is the defect the caller names.
    return (error as Error).message;
  }
}

/**
 * The defects of one row's `coOwned` record, one named error each. The record
 * is what licenses the engine to remove an entry inside a document it shares,
 * so its shape and size are bounded here, at the read, beside the row's path
 * bound: a pointer that is not one, a hash that is not a sha256 digest, or a
 * record past its bounds refuses the manifest. A pointer outside the spec of
 * the row's document is NOT a defect — every reader ignores what it does not own.
 */
function collectCoOwnedErrors(value: unknown, field: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`\`${field}\` must be an object`);
    return;
  }
  for (const key of unknownFields(value, CO_OWNED_FIELDS)) errors.push(`unknown field \`${field}.${key}\``);
  const pointerErrors = (pointer: string, at: string): boolean => {
    const defect = memberPointerDefect(pointer);
    if (defect !== null) errors.push(`\`${at}\`: ${defect}`);
    return defect === null;
  };
  const digest = (hash: unknown, at: string): void => {
    if (typeof hash !== "string" || !SHA256_HEX.test(hash)) errors.push(`\`${at}\` must be a lowercase sha256 hex digest`);
  };
  const { members, elements, preexisting, lines, createdFile, terminatorAdded } = value;
  if (members !== undefined) {
    if (!isPlainObject(members) || Object.keys(members).length > MAX_CO_OWNED_POINTERS) {
      errors.push(`\`${field}.members\` must be an object of at most ${MAX_CO_OWNED_POINTERS} member pointers`);
    } else {
      for (const [pointer, hash] of Object.entries(members)) {
        const at = `${field}.members[${JSON.stringify(pointer)}]`;
        if (pointerErrors(pointer, at)) digest(hash, at);
      }
    }
  }
  if (elements !== undefined) {
    if (!isPlainObject(elements) || Object.keys(elements).length > MAX_CO_OWNED_POINTERS) {
      errors.push(`\`${field}.elements\` must be an object of at most ${MAX_CO_OWNED_POINTERS} array pointers`);
    } else {
      for (const [pointer, hashes] of Object.entries(elements)) {
        const at = `${field}.elements[${JSON.stringify(pointer)}]`;
        if (!pointerErrors(pointer, at)) continue;
        if (!Array.isArray(hashes) || hashes.length > MAX_CO_OWNED_ELEMENTS) {
          errors.push(`\`${at}\` must be an array of at most ${MAX_CO_OWNED_ELEMENTS} sha256 hex digests`);
          continue;
        }
        for (const [position, hash] of hashes.entries()) digest(hash, `${at}[${position}]`);
      }
    }
  }
  if (preexisting !== undefined) {
    if (!Array.isArray(preexisting) || preexisting.length > MAX_CO_OWNED_POINTERS) {
      errors.push(`\`${field}.preexisting\` must be an array of at most ${MAX_CO_OWNED_POINTERS} member pointers`);
    } else {
      const seen = new Set<string>();
      for (const [position, pointer] of preexisting.entries()) {
        const at = `${field}.preexisting[${position}]`;
        if (typeof pointer !== "string") {
          errors.push(`\`${at}\` must be a member pointer string`);
        } else if (seen.has(pointer)) {
          errors.push(`\`${at}\` repeats \`${pointer}\``);
        } else if (pointerErrors(pointer, at)) {
          seen.add(pointer);
        }
      }
    }
  }
  if (lines !== undefined) {
    if (!Array.isArray(lines)) {
      errors.push(`\`${field}.lines\` must be an array`);
    } else {
      for (const [position, line] of lines.entries()) {
        if (typeof line !== "string" || line === "" || line.length > MAX_CO_OWNED_LINE || /[\r\n]/.test(line)) {
          errors.push(
            `\`${field}.lines[${position}]\` must be a non-empty string of at most ${MAX_CO_OWNED_LINE} characters with no line break`,
          );
        }
      }
    }
  }
  for (const [flag, flagValue] of [["createdFile", createdFile], ["terminatorAdded", terminatorAdded]] as const) {
    if (flagValue !== undefined && flagValue !== true) errors.push(`\`${field}.${flag}\` must be exactly true when present`);
  }
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
  if (entry.coOwned !== undefined) collectCoOwnedErrors(entry.coOwned, `ledger[${index}].coOwned`, errors);
  if (typeof entry.path !== "string") {
    errors.push(`\`ledger[${index}].path\` must be a string`);
    return null;
  }
  const defect = repoPathDefect(entry.path);
  if (defect !== null) {
    errors.push(`\`ledger[${index}].path\` ${JSON.stringify(entry.path)} ${defect}`);
    return null;
  }
  // The owned-path bound (REQ-PLUGIN-045), judged only once the owner and the
  // artifact type are known good: both select the part of the bound the path
  // must fall in, and a row whose owner is already named as unknown is not
  // named a second time for where it points. A ledger row is an authorisation
  // to delete or overwrite its path, so a row naming a path no stamity release
  // writes — a hand edit of the committed manifest — refuses the manifest.
  if (ownerDefect === null && typeof entry.artifactType === "string" && VALID_ARTIFACT_TYPES.has(entry.artifactType)) {
    const outside = ownedPathDefect({
      path: entry.path,
      adapter: entry.adapter as string,
      artifactType: entry.artifactType,
    });
    if (outside !== null) {
      errors.push(
        `\`ledger[${index}].path\` ${JSON.stringify(entry.path)} ${outside} — a ledger row ` +
          `authorises sync and clean to delete or overwrite its path, so the row is refused`,
      );
    }
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
 * SHAPE only, and deliberately so here. Whether an account can run an id is a
 * question for that client's own model list, which only its CLI answers: the
 * reader never starts a client, so membership is asked elsewhere — the
 * resolver re-picks a pin the persisted list lacks (`src/roster/modelLadder.ts`)
 * and `check` warns on it (REQ-LADDER-008). What is checkable here is that the
 * string can carry a value at all: an empty or whitespace-only pin emits a
 * frontmatter key with no value, and a newline would break the line-oriented
 * dialects the adapters write.
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
      for (const [modelClass, pins] of modelClassEntries(value.pins, "models.pins", errors)) {
        collectClassPinsErrors(pins, `models.pins.${modelClass}`, errors);
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

  if (value.listed !== undefined) collectListedErrors(value.listed, errors);

  for (const key of unknownFields(value, ["pins", "effort", "reviewCap", "listed"])) {
    errors.push(`unknown field \`models.${key}\``);
  }
}

/** The keys one class's pin map may carry: the fallback, then every client. */
const CLASS_PIN_KEYS: readonly string[] = ["all", ...TOOLS];

/**
 * One class's per-client pin map ({@link ClassPins}): an object whose keys are
 * `all` or a client, each a pin {@link modelPinDefect} accepts. A bare string
 * is a generation-1 pin the migration step rewrites; reaching here means the
 * file declared generation 2 while still carrying one, and the message says
 * which shape is wanted.
 */
function collectClassPinsErrors(value: unknown, field: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(
      `\`${field}\` ${JSON.stringify(value)} must be an object keyed by client ` +
        `(${CLASS_PIN_KEYS.join(", ")}), as in { "all": "<model id>" }`,
    );
    return;
  }
  for (const [key, pin] of Object.entries(value)) {
    if (!CLASS_PIN_KEYS.includes(key)) {
      errors.push(`\`${field}.${key}\` names unknown client (known: ${CLASS_PIN_KEYS.join(", ")})`);
      continue;
    }
    const defect = modelPinDefect(pin);
    if (defect !== null) errors.push(`\`${field}.${key}\` ${JSON.stringify(pin)} ${defect}`);
  }
}

/** Where a persisted model list may say it was read (`ListedModels.source`). */
const LISTED_SOURCES: ReadonlySet<string> = new Set<ListedModels["source"]>([
  "cursor-agent-models",
  "codex-debug-models",
  "copilot-help-config",
]);

/**
 * The per-client model lists ({@link ListedModels}) a 1.15.0 manifest saved
 * under `models.listed`, or the git-ignored cache holds under `field`
 * (REQ-LADDER-009). Shape only: each id must be a value a pin could be, since a
 * later emission may copy one into an agent file exactly as it copies a pin.
 */
export function collectListedErrors(value: unknown, errors: string[], prefix = "models.listed"): void {
  if (!isPlainObject(value)) {
    errors.push(`\`${prefix}\` must be an object keyed by client`);
    return;
  }
  for (const [tool, entry] of Object.entries(value)) {
    const field = `${prefix}.${tool}`;
    if (!VALID_TOOLS.has(tool)) {
      errors.push(`\`${field}\` names unknown tool (known: ${TOOLS.join(", ")})`);
      continue;
    }
    if (!isPlainObject(entry)) {
      errors.push(`\`${field}\` must be an object with \`ids\` and \`source\``);
      continue;
    }
    if (!Array.isArray(entry.ids)) {
      errors.push(`\`${field}.ids\` must be an array of model ids`);
    } else {
      entry.ids.forEach((id, index) => {
        const defect = modelPinDefect(id);
        if (defect !== null) errors.push(`\`${field}.ids[${index}]\` ${JSON.stringify(id)} ${defect}`);
      });
    }
    if (typeof entry.source !== "string" || !LISTED_SOURCES.has(entry.source)) {
      errors.push(
        `\`${field}.source\` must be one of ${[...LISTED_SOURCES].join(" | ")} ` +
          `(got ${JSON.stringify(entry.source)})`,
      );
    }
    for (const key of unknownFields(entry, ["ids", "source"])) {
      errors.push(`unknown field \`${field}.${key}\``);
    }
  }
}

/** Known fields of the gates block, doubling as its strict key set. */
const GATE_FIELDS = ["test", "lint", "typecheck", "all"] as const;

/**
 * Longest gate command the charter will print. A gate line is rendered into
 * generated markdown as one line a human reads; past this it stops being a
 * command someone can check and starts being a script that belongs in a file.
 */
const MAX_GATE_COMMAND_LENGTH = 512;

/**
 * Why `value` cannot be a gate command, or `null` when it can. Shape only, on
 * the {@link modelPinDefect} precedent: the engine neither runs nor parses
 * these, so a membership check would be a guarantee it cannot keep. What is
 * checkable is that the string carries a command at all, stays on the one line
 * the charter prints it on, fits, and survives the rendering it is put through.
 *
 * That last clause is why a BACKTICK and a `${STAMITY:` prefix are refused by
 * name. A gate command is rendered into the charter and into skill bodies
 * inside a markdown code span that backticks delimit, so a backtick in the
 * pinned value closes the span early and the remainder lands as prose a model
 * reads as instruction. And token substitution over generated text is
 * SINGLE-PASS: a `${STAMITY:` arriving from the manifest is written into the
 * output after the resolver has already run, so it ships as a literal
 * placeholder every downstream reader sees unresolved. Refusing both here puts
 * the defect where an operator reads a field name, rather than in rendered
 * output nobody can trace back to its source.
 */
function gateCommandDefect(value: unknown): string | null {
  if (typeof value !== "string") return "must be a string";
  if (value.trim() === "") return "is empty";
  if (/[\r\n]/.test(value)) return "spans more than one line";
  if (value.includes("`")) {
    return "carries a backtick, which closes the code span the charter and the skills render it inside — name a script file instead";
  }
  if (value.includes("${STAMITY:")) {
    return "carries a `${STAMITY:` token, which substitution has already passed by the time this value is rendered, so it would ship as a literal placeholder";
  }
  if (value.length > MAX_GATE_COMMAND_LENGTH) {
    return `is longer than ${MAX_GATE_COMMAND_LENGTH} characters — put a script in a file and name it here`;
  }
  return null;
}

/**
 * The operator's gate commands. Every member is optional and independently so:
 * a pinned `all` with no `test` is a repository that spells its full gate and
 * leaves the per-gate rows to detection, which is a state the charter renders.
 */
function collectGatesErrors(value: unknown, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push("`gates` must be an object");
    return;
  }
  for (const field of GATE_FIELDS) {
    const command = value[field];
    if (command === undefined) continue;
    const defect = gateCommandDefect(command);
    if (defect !== null) {
      errors.push(`\`gates.${field}\` ${JSON.stringify(command)} ${defect}`);
    }
  }
  for (const key of unknownFields(value, GATE_FIELDS)) {
    errors.push(`unknown field \`gates.${key}\` (known: ${GATE_FIELDS.join(", ")})`);
  }
}

/** Known fields of the autonomy block, doubling as its strict key set. */
const AUTONOMY_FIELDS = ["mode", "deployingBranches", "deployingActs"] as const;

/** Most branches `autonomy.deployingBranches` may name. */
export const MAX_DEPLOYING_BRANCHES = 32;

/** Longest branch name or pattern `autonomy.deployingBranches` admits. */
const MAX_DEPLOYING_BRANCH_LENGTH = 255;

// oxlint-disable-next-line no-control-regex -- a control character in a branch name IS the defect
const REF_CONTROL_OR_SPACE = /[\s\u0000-\u001f\u007f]/;

/**
 * Why `value` cannot be a deploying branch, or `null` when it can: a branch
 * name by git's `check-ref-format` rules, optionally under `refs/heads/`, in
 * which a `*` may also stand (`release/*` matched one segment deep, `release/**`
 * across segments, by `../config/autonomy.ts::matchesDeployingBranch`). Shape
 * only: the engine does not ask git, so no repository is needed to validate.
 */
export function deployingBranchDefect(value: unknown): string | null {
  if (typeof value !== "string") return "must be a string";
  if (value === "") return "is empty";
  if (value.length > MAX_DEPLOYING_BRANCH_LENGTH) {
    return `is longer than ${MAX_DEPLOYING_BRANCH_LENGTH} characters`;
  }
  const name = value.startsWith("refs/heads/") ? value.slice("refs/heads/".length) : value;
  if (REF_CONTROL_OR_SPACE.test(name)) return "carries a space or a control character";
  if (/[~^:?[\\]/.test(name) || name.includes("..") || name.includes("@{")) {
    return "carries a character or sequence git refuses in a branch name (~ ^ : ? [ \\ .. @{)";
  }
  if (name === "" || name === "@" || name === "HEAD" || name.startsWith("-")) {
    return "is not a branch name";
  }
  if (name.endsWith(".")) return "ends with a dot";
  for (const segment of name.split("/")) {
    if (segment === "") return "carries an empty path segment";
    if (segment.startsWith(".")) return "carries a path segment that starts with a dot";
    if (segment.endsWith(".lock")) return "carries a path segment that ends with .lock";
  }
  return null;
}

/**
 * The autonomy block (REQ-FLOW-137): a mode from {@link AUTONOMY_MODES}, at
 * most {@link MAX_DEPLOYING_BRANCHES} branch names or patterns, and acts from
 * {@link DEPLOYING_ACTS}, the refusal naming the whole set.
 */
function collectAutonomyErrors(value: unknown, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push("`autonomy` must be an object");
    return;
  }
  collectEnumError(value.mode, new Set<string>(AUTONOMY_MODES), "autonomy.mode", errors);
  const branches = value.deployingBranches;
  if (branches !== undefined) {
    if (!Array.isArray(branches)) {
      errors.push("`autonomy.deployingBranches` must be an array");
    } else {
      if (branches.length > MAX_DEPLOYING_BRANCHES) {
        errors.push(`\`autonomy.deployingBranches\` names more than ${MAX_DEPLOYING_BRANCHES} branches`);
      }
      branches.forEach((branch: unknown, index) => {
        const defect = deployingBranchDefect(branch);
        if (defect === null) return;
        const shown = typeof branch === "string" ? ` ${JSON.stringify(branch.slice(0, 64))}` : "";
        errors.push(`\`autonomy.deployingBranches[${index}]\`${shown} ${defect}`);
      });
    }
  }
  const acts = value.deployingActs;
  if (acts !== undefined) {
    if (!Array.isArray(acts)) {
      errors.push("`autonomy.deployingActs` must be an array");
    } else {
      for (const act of acts as unknown[]) {
        if (typeof act === "string" && (DEPLOYING_ACTS as readonly string[]).includes(act)) continue;
        errors.push(
          `\`autonomy.deployingActs\` names unknown act ${JSON.stringify(act)} (known: ${DEPLOYING_ACTS.join(", ")})`,
        );
      }
    }
  }
  for (const key of unknownFields(value, AUTONOMY_FIELDS)) {
    errors.push(`unknown field \`autonomy.${key}\` (known: ${AUTONOMY_FIELDS.join(", ")})`);
  }
}

/**
 * The import decisions, validated as a LIST of pairs — one record per
 * pre-existing instruction file the repo carried. Each `path` runs the same
 * containment grammar every other persisted repo path does: a record
 * suppresses or redirects emission at its path, so a hand-edited absolute or
 * `..` value would be a way to point that somewhere it does not belong. And it
 * names one of the four instruction files `init` imports
 * (`OWNED_PATHS.importTargets`, REQ-PLUGIN-046), the only paths a decision is
 * ever recorded for.
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
      } else if (!OWNED_PATHS.importTargets.includes(entry.path)) {
        // REQ-PLUGIN-046: init records a decision only for an instruction file
        // it imports. A decision anywhere else is a hand edit, and a `skip`
        // there silently drops a path the engine owns (measured: the Cursor
        // hook file and both guards, with `check` still green).
        errors.push(
          `\`${field}.path\` ${JSON.stringify(entry.path)} is not an instruction file init imports ` +
            `(${OWNED_PATHS.importTargets.join(", ")})`,
        );
      }
    }
    collectEnumError(entry.mode, VALID_IMPORT_MODES, `${field}.mode`, errors);
    if (entry.mode === undefined) errors.push(`\`${field}.mode\` is required`);
    for (const key of unknownFields(entry, ["path", "mode"])) {
      errors.push(`unknown field \`${field}.${key}\``);
    }
  }
}

/**
 * The one cross check between the ledger and the import decisions
 * (REQ-PLUGIN-046): the planner drops a path a `skip` decision names, so the
 * engine never records a row for it, and a row beside such a decision is a hand
 * edit. Left standing, the pair let a row hashing the owner's file make `sync`
 * delete it whole. A malformed ledger or decision list is named by its own
 * check and skipped here.
 */
function collectSkippedRowErrors(ledger: unknown, importChoice: unknown, errors: string[]): void {
  if (!Array.isArray(ledger) || !Array.isArray(importChoice)) return;
  for (const [choiceIndex, choice] of importChoice.entries()) {
    if (!isPlainObject(choice) || choice.mode !== "skip" || typeof choice.path !== "string") continue;
    for (const [rowIndex, row] of ledger.entries()) {
      if (!isPlainObject(row) || row.path !== choice.path) continue;
      errors.push(
        `\`ledger[${rowIndex}]\` records ${JSON.stringify(choice.path)}, which \`importChoice[${choiceIndex}]\` ` +
          `skips: the engine never records a row for a skipped file`,
      );
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
  // Semver too, exactly as written (no `v`, no whitespace, no control
  // character): `clean`'s refusal and `check --expect-version` print it
  // verbatim (review/133). The grammar is the pinned CLI call's, build metadata
  // included, since `init` stamps the engine's own version as the call accepts
  // it (review/134); `semver.valid` drops the `+build` part.
  if (typeof data.generatedBy !== "string" || !isSemverShaped(data.generatedBy)) {
    errors.push('`generatedBy` must be a semantic version string (e.g. "1.2.3")');
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
  collectEnumError(data.ruleDelivery, VALID_RULE_DELIVERIES, "ruleDelivery", errors);

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
  if (data.gates !== undefined) collectGatesErrors(data.gates, errors);
  if (data.autonomy !== undefined) collectAutonomyErrors(data.autonomy, errors);
  if (data.importChoice !== undefined) {
    collectImportChoiceErrors(data.importChoice, errors);
    collectSkippedRowErrors(data.ledger, data.importChoice, errors);
  }
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
 * The top-level key a 1.14 setup wrote its plugin install record under, held
 * unread through the 1.15 line and dropped on read since (REQ-PLUGIN-014).
 */
export const DROPPED_PLUGIN_KEY = "plugin";

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
  // The install record a 1.14 setup wrote, held unread through the 1.15 line:
  // dropped here, of any shape, before validation names it as unknown, so the
  // manifest that still carries it loads and the next write holds no `plugin`
  // key. No migration step and no generation bump: a 1.15 engine reads a
  // manifest without the key, so it still reads what this one writes.
  delete migrated[DROPPED_PLUGIN_KEY];

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
 * `models.listed` is never written ({@link withoutListedModels}). The manifest
 * is validated first. `SetupManifest` is a type, and the defects
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
    ...withoutListedModels(manifest),
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

/**
 * `manifest` without `models.listed`, as a new object (REQ-LADDER-009): the
 * account's model lists live in the git-ignored cache
 * (`../cli/engine/clientModels.ts`), so {@link writeManifest} never writes the
 * key, whatever a caller carries in memory. A `models` block left empty is
 * dropped with it. A 1.15.0 manifest that still holds the key loads; every
 * verb that writes the manifest moves its lists to the cache before its write
 * leaves them out.
 */
export function withoutListedModels(manifest: SetupManifest): SetupManifest {
  if (manifest.models?.listed === undefined) return manifest;
  const models = { ...manifest.models };
  delete models.listed;
  const next: SetupManifest = { ...manifest, models };
  if (Object.keys(models).length === 0) delete next.models;
  return next;
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
  /** The operator's pinned gate commands; a fresh run only detects, never asks. */
  gates?: GatesConfig;
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
  if (manifest.gates !== undefined) preserved.gates = structuredClone(manifest.gates);
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
  if (preserved.gates !== undefined) merged.gates = structuredClone(preserved.gates);
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
 * Resolve how rules are delivered, defaulting on absence — the one reader the
 * planner, the always-on measurement and `stamity config` all go through, so a
 * manifest written before the key existed cannot resolve one way here and
 * another way there. Same re-check as {@link readMaturityTier}: a hand-edited
 * value outside the sanctioned set falls back to the default rather than
 * reaching emission as an unknown mode (the persistence boundary refuses it in
 * {@link collectManifestErrors}).
 */
export function readRuleDelivery(manifest: SetupManifest | null | undefined): RuleDelivery {
  const value = manifest?.ruleDelivery;
  return value !== undefined && VALID_RULE_DELIVERIES.has(value)
    ? value
    : RULE_DELIVERY_DEFAULT;
}

/**
 * The operator's pinned gate commands, or `{}` when the manifest pins none —
 * absence is "detection decides", not an error, so every caller reads the same
 * empty answer instead of branching on `undefined` itself.
 *
 * A COPY: the result outlives the read at the charter and doctor seams, and a
 * caller that fills in a detected command must not write it back into the
 * manifest by accident.
 */
export function readGates(manifest: SetupManifest | null | undefined): GatesConfig {
  return manifest?.gates === undefined ? {} : { ...manifest.gates };
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
