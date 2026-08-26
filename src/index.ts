/**
 * Public entry. The only sanctioned aggregation point: everything exported here —
 * and nothing else — is the package's API. Internal modules import concrete files,
 * never this barrel.
 *
 * "Everything" is a closure claim, not a listing claim: a type reachable from an
 * exported type is part of the API whether or not it is named, so the surface is
 * only honest when the named set is closed under reachability. Closing it is a
 * test obligation (`test/composition/root.test.ts`), because nothing in the build
 * fails on an anonymous reachable type today — declaration emit is deferred, so
 * an unnamed member costs a consumer an inline structural type rather than a
 * compile error, and the deferral is what kept the gap cheap enough to survive.
 */
export {
  createApp,
  createEngine,
  VERSION,
  type App,
  type AppOptions,
  type Clock,
  type EngineRegistry,
  type Runtime,
} from "./composition/root.ts";

// ---- Error contract ----
export { EngineError } from "./types/errors.ts";
export type { ErrorCode } from "./types/errors.ts";

// ---- Core vocabulary ----
// Every closed enum ships as its trio — the `as const` tuple, the union type,
// and the `VALID_*` membership set — because a consumer that can name the type
// but cannot narrow a `string` to it has half an enum. Three trios
// (IMPORT_MODES, MODEL_CLASSES, EFFORT_LEVELS) were reachable from exported
// manifest types while unexported themselves; they are exported here so the
// gap is closed now rather than surfacing when declaration emit is switched on.
export {
  DEFAULT_COMMUNICATION_STYLE,
  DEFAULT_IMPORT_MODE,
  DEFAULT_MATURITY_TIER,
  COMMUNICATION_STYLES,
  EFFORT_LEVELS,
  IMPORT_MODES,
  MATURITY_TIERS,
  MODEL_CLASSES,
  TOOLS,
  VALID_COMMUNICATION_STYLES,
  VALID_EFFORT_LEVELS,
  VALID_IMPORT_MODES,
  VALID_MATURITY_TIERS,
  VALID_MODEL_CLASSES,
  VALID_TOOLS,
} from "./types/core.ts";
export type {
  CommunicationStyle,
  EffortLevel,
  ImportMode,
  MaturityTier,
  ModelClass,
  Platform,
  Tool,
} from "./types/core.ts";

// ---- Manifest & ledger ----
export { MANIFEST_FILE, MANIFEST_VERSION, isPackOwner, packOwner } from "./types/manifest.ts";
// `ImportDecision` and `ModelConfig` are reachable from `SetupManifest`
// (`importChoice`, `models`), so a consumer that holds a manifest already holds
// them; naming them makes that reachable surface addressable instead of
// anonymous.
export type {
  HooksConfig,
  ImportDecision,
  LearningsConfig,
  LedgerEntry,
  LedgerOwner,
  ManifestMigration,
  McpConfig,
  ModelConfig,
  PackOwner,
  SetupManifest,
  ToolOptions,
} from "./types/manifest.ts";

// ---- Content model ----
export { CONTENT_CLASSES } from "./types/content.ts";
// `EmissionOwner` is reachable from `AdapterOutput` (`owner`, `coOwners`).
export type {
  AdapterOutput,
  CanonicalFile,
  ContentClass,
  ContentSelection,
  EmissionOwner,
  MergeResult,
  RulePrecedence,
} from "./types/content.ts";
export type { CatalogItem } from "./content/catalog.ts";

// ---- Detection model ----
export type {
  DetectedSummary,
  Framework,
  PackageEntry,
  RepoInfo,
} from "./types/detect.ts";
export type { StackSupportTier } from "./detect/stackSupport.ts";

// ---- Managed-block markers & repo state ----
export { CONTENT_PREFIX, STATE_DIR, getMarkersForPath } from "./types/markers.ts";
export type { ManagedBlockMarkers } from "./types/markers.ts";

// ---- Feature-module public types ----
export type { HookParseError, HookParseErrorCode, UserHookDefinition } from "./hooks/userHooks.ts";
export type { LearningConfidence } from "./learnings/validation.ts";
export type { McpEnvRequirement } from "./mcp/catalog.ts";
export type { PackWriteSetEntry } from "./pack/install.ts";
export type { WorkspaceRole } from "./workspace/detect.ts";
export type { WorkspaceRepoOverrides } from "./workspace/model.ts";
