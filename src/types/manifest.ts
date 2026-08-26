/**
 * Manifest + ownership-ledger schema for the single state file
 * `.stamity/manifest.json` (`STATE_DIR` in `markers.ts` joined with
 * {@link MANIFEST_FILE}). Types, schema constants, and the pure spelling
 * helpers that go with them — manifest IO lives in the setup and workspace
 * modules, which both import the shapes from here.
 */
import type {
  CommunicationStyle,
  EffortLevel,
  ImportMode,
  MaturityTier,
  ModelClass,
  Platform,
  Tool,
} from "./core.ts";
import type { ContentClass, ContentSelection } from "./content.ts";
import type { DetectedSummary } from "./detect.ts";

/** Manifest filename inside the state dir. */
export const MANIFEST_FILE = "manifest.json";

/** Current manifest schema generation. */
export const MANIFEST_VERSION = "1.0.0";

/**
 * One step of the manifest migration runner. Generation 1 is greenfield —
 * the shipped migration set is empty — but the contract lives in the types
 * leaf so every manifest IO site shares one runner shape without importing
 * each other, and a future generation bump is a data change, not an API
 * change.
 */
export interface ManifestMigration {
  /** Schema version this step upgrades FROM; the runner chains steps by version. */
  fromVersion: string;
  /** Pure transform of the raw parsed manifest into the next generation's shape. */
  migrate(raw: Record<string, unknown>): Record<string, unknown>;
}

/** Prefix marking a ledger owner that is an installed content pack. */
export const PACK_OWNER_PREFIX = "pack:";

/** A pack's ledger owner id: {@link PACK_OWNER_PREFIX} followed by the pack id. */
export type PackOwner = `${typeof PACK_OWNER_PREFIX}${string}`;

/**
 * Who owns a ledger row. Two kinds, kept disjoint by spelling: an adapter
 * target {@link Tool}, or an installed content pack (`pack:<pack id>`).
 *
 * A pack is deliberately not modelled as a tool. Adapter rows are rebuilt
 * wholesale on every regeneration and become reclaimable the moment their
 * adapter stops emitting them; pack rows are written once by an explicit
 * install and removed only by an explicit uninstall. A pack borrowing a tool
 * id would put its content on the regeneration path, where the next sync
 * would drop its rows and orphan its files.
 */
export type LedgerOwner = Tool | PackOwner;

/** The ledger owner id for an installed pack. */
export function packOwner(packId: string): PackOwner {
  return `${PACK_OWNER_PREFIX}${packId}`;
}

/** True when a ledger row belongs to an installed pack rather than an adapter. */
export function isPackOwner(owner: LedgerOwner): owner is PackOwner {
  return owner.startsWith(PACK_OWNER_PREFIX);
}

/**
 * One row of the ownership ledger: every path the engine emits is recorded
 * with its owner and source artifact. The ledger is the single reclaim
 * authority — deselecting an artifact removes its rows in the same event, and
 * absence from the ledger is exactly what makes a previously emitted path
 * eligible for the reclaim sweep. No separate managed-files list exists.
 */
export interface LedgerEntry {
  /** Repo-relative emitted path. */
  path: string;
  /**
   * Who owns the path — an adapter tool, or `pack:<id>` for pack content.
   * Named `adapter` because adapters are the common case and the name is
   * persisted; see {@link LedgerOwner} for why packs are not tools.
   */
  adapter: LedgerOwner;
  /** Id of the source artifact, or a stable infra emission id. */
  artifactId: string;
  /**
   * Content class of the source, or `"infra"` for non-content emissions
   * (hook scripts, MCP config files, env files) so the reclaim sweep owns
   * those too.
   */
  artifactType: ContentClass | "infra";
  /** Hash of the emitted content at write time, for drift detection. */
  contentHash?: string;
  /** Engine version stamped into the managed block at write time. */
  stampedVersion?: string;
}

/** MCP server selection persisted for regeneration. */
export interface McpConfig {
  /** Selected server ids. */
  servers: string[];
  /** MCP protocol revision the emitted config targets; engine default when absent. */
  protocolVersion?: string;
}

/** Learnings-capacity configuration; defaults apply when absent. */
export interface LearningsConfig {
  /** Cap on active learnings files. */
  maxCount?: number;
}

/** User hook wiring. Hooks are configuration, not a content class. */
export interface HooksConfig {
  /** Repo-relative directory of user-supplied hook scripts. */
  userHooksDir?: string;
}

/**
 * Operator overrides for the model/effort ladder and the review-loop cap — the
 * three dials the ladder itself deliberately does not decide. The ladder in
 * `src/roster/modelLadder.ts` names a CLASS per role and projects it per
 * client; what a class means as a concrete id is the operator's call, and this
 * is where their answer lives.
 *
 * {@link MANIFEST_VERSION} does NOT move for this field. It is additive and
 * every member is optional, so a manifest written before it existed parses
 * unchanged, resolves every value from the ladder's own answer, and
 * round-trips without gaining a key. That is exactly the case a schema
 * generation bump exists to handle, and there is nothing here for a
 * {@link ManifestMigration} step to do — bumping the version would put every
 * existing repo through a runner with an empty transform.
 */
export interface ModelConfig {
  /**
   * Operator-pinned concrete model id per class; absent classes fall back to
   * the client's own alias for the class, and to nothing where it has none.
   *
   * Validated by SHAPE only — non-empty, single-line. This engine ships no
   * vendor model catalogue, so checking an id against one would be a
   * guarantee it cannot keep; the value is passed through verbatim to
   * whichever clients express a model field.
   */
  pins?: Partial<Record<ModelClass, string>>;
  /**
   * Operator-set reasoning effort per class, where the client expresses one.
   * Setting a class no selected client can express is legal and inert: the
   * silence happens at emission, not here.
   */
  effort?: Partial<Record<ModelClass, EffortLevel>>;
  /**
   * Review-loop iteration cap. Absent means the engine default; a persisted
   * value is read back through `readReviewCap` in `src/manifest/manifest.ts`,
   * which is the one function every consumer clamps through.
   */
  reviewCap?: number;
}

/**
 * The init-time decision about ONE agent-instruction file the repository
 * already had, persisted so every later regeneration honours it. A repo can
 * carry several such files, so the manifest holds a LIST of these records
 * (see {@link SetupManifest.importChoice}), one per detected path.
 *
 * Both halves are load-bearing. Without `path` the mode would be applied to
 * whichever file emission happened to land on; without `mode` a `sync` would
 * treat a user's file as an unowned collision and refuse — which is the
 * failure this record exists to prevent.
 */
export interface ImportDecision {
  /** Repo-relative POSIX path of the pre-existing file the choice applies to. */
  path: string;
  /** What emission does at that path (see {@link ImportMode}). */
  mode: ImportMode;
}

/**
 * Open per-tool option bag. Adapters narrow their own bag; the engine passes
 * it through and never reads unknown keys.
 */
export interface ToolOptions {
  [key: string]: unknown;
}

/**
 * The persisted setup manifest — schema generation {@link MANIFEST_VERSION}.
 * Everything regeneration needs and nothing else: selection + ledger are the
 * core; scalar dials calibrate generated content; per-tool bags stay opaque
 * to the engine.
 */
export interface SetupManifest {
  /** Manifest schema version (see {@link MANIFEST_VERSION}). */
  version: string;
  /** Engine version that wrote this manifest. */
  generatedBy: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 timestamp of the last successful write. */
  updatedAt: string;
  /** Target tools setups are generated for. */
  tools: Tool[];
  /** System-of-record platform hosting the repo. */
  platform?: Platform;
  /** Investment-calibration dial; never gates content admission. */
  maturityTier?: MaturityTier;
  /** How generated agents talk to the human operator. */
  communicationStyle?: CommunicationStyle;
  /** Resolved content selection. */
  selection: ContentSelection;
  /** Ownership ledger — one row per emitted path (see {@link LedgerEntry}). */
  ledger: LedgerEntry[];
  mcp?: McpConfig;
  learnings?: LearningsConfig;
  hooks?: HooksConfig;
  /** Operator overrides for the model ladder and the review cap (see {@link ModelConfig}). */
  models?: ModelConfig;
  /**
   * What to do with the agent-instruction files this repo already had — ONE
   * decision per pre-existing path, not one for the repo. Absent when init
   * found none: the ordinary greenfield case, where emission owns every path
   * it writes.
   *
   * A list rather than a single record because detection routinely returns
   * more than one path (a bare `AGENTS.md` beside a tool's own `CLAUDE.md` or
   * `.github/copilot-instructions.md`), and every one of them is a file the
   * operator already owns. Persisting one record meant every path past the
   * first reached emission with NO decision at all and was claimed as an
   * ordinary engine-owned row — the operator answered `skip` and a second file
   * was supplemented anyway. The prompt budget is unchanged: init asks once
   * and maps the one answered mode over every detected path, so this list is
   * wider than the question, never louder than it.
   */
  importChoice?: readonly ImportDecision[];
  /** Per-tool option bags, opaque to the engine (see {@link ToolOptions}). */
  toolOptions?: Partial<Record<Tool, ToolOptions>>;
  /** Persisted detection subset feeding emission-time substitution. */
  detected?: DetectedSummary;
}
