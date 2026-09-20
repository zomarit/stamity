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
 * How a rule reaches a client: as always-on instruction text, or as a
 * description-triggered skill the model pulls in when it is relevant.
 *
 * `always-on` is the shape every emission had before this key existed —
 * every selected rule becomes that client's own rule file (and, on Codex,
 * a section of the inlined appendix). `on-demand` moves the rules a client
 * cannot attach conditionally out of always-available context and into
 * `.agents/skills/<prefix><rule-id>/SKILL.md`, where the client loads the
 * body only once the description matches. Which rules move is per client and
 * decided by `../content/ruleDelivery.ts` — the engine-wide dial is only the
 * choice between the two shapes.
 */
export type RuleDelivery = "always-on" | "on-demand";

/** The sanctioned {@link RuleDelivery} values, in the order the CLI lists them. */
export const RULE_DELIVERIES: readonly RuleDelivery[] = ["always-on", "on-demand"];

/**
 * What binds when a manifest carries no `ruleDelivery` — including every
 * manifest written before the key existed, which is why the value is a
 * constant rather than an init-time write.
 *
 * `always-on` reproduces the 1.7.0 emission byte for byte, and it was the
 * default for exactly as long as the option needed to land without moving a
 * golden. On 2026-09-15 the default became `on-demand`, which is the flip the
 * measurement was for: the glob-less rules leave claude's and copilot's launch
 * context, codex's appendix keeps only its floors, and every ceiling in
 * `ALWAYS_ON_BUDGET_LINES` drops to the load that remains (95 / 95 / 95 / 407,
 * measured that day). `always-on` stays selectable for a repo that wants the
 * old shape back — one `stamity config set ruleDelivery always-on` — so the
 * flip is reversible per repo rather than a removal.
 *
 * A manifest written before the key existed therefore reads as `on-demand`
 * too: the default is what the engine emits today, not what it emitted when
 * that manifest was written. The reclaimed rule files show up in `sync` as
 * reclaims of paths this setup no longer owns, which is the same path any
 * other de-selected artifact takes.
 */
export const RULE_DELIVERY_DEFAULT: RuleDelivery = "on-demand";

/**
 * Where a client's generated content comes from: files this engine wrote into
 * the repository, or a plugin root the client loads for itself.
 *
 * `generated` is the shape every setup had before this key existed, and stays
 * the default — see {@link INSTALL_MODE_DEFAULT}. `plugin-backed` says the
 * classes named in {@link PluginClientRecord.classes} reach that client from
 * the plugin, so the engine writes none of them and reclaims none of them: the
 * ownership boundary is the whole point of recording the mode.
 */
export type InstallMode = "generated" | "plugin-backed";

/** The sanctioned {@link InstallMode} values, in the order the CLI lists them. */
export const INSTALL_MODES: readonly InstallMode[] = ["generated", "plugin-backed"];

/**
 * What binds when a manifest carries no `plugin` block — including every
 * manifest written before the key existed, which is why this is a constant
 * rather than an init-time write. A repo that never heard of a plugin root
 * generates its own content, exactly as it did before.
 */
export const INSTALL_MODE_DEFAULT: InstallMode = "generated";

/**
 * A class of content a plugin can own on behalf of a client: the four content
 * classes, plus hooks.
 *
 * Hooks are configuration rather than a {@link ContentClass} (see
 * {@link HooksConfig}), but they are emitted files a plugin can carry, so the
 * ownership boundary has to be able to name them. That is the one addition —
 * everything else here is the content model's own vocabulary.
 */
export type PluginOwnedClass = ContentClass | "hooks";

/**
 * Ownable-class order, built from a total record over {@link PluginOwnedClass}
 * so a new `ContentClass` is a compile error here until it is placed. A hand
 * written array would silently disagree with the union the day the content
 * model grows a class — the same device `MANIFEST_FIELD_ORDER` uses one layer
 * up in `../manifest/manifest.ts`.
 */
const PLUGIN_OWNED_CLASS_ORDER: Record<PluginOwnedClass, true> = {
  agent: true,
  skill: true,
  command: true,
  rule: true,
  hooks: true,
};

/** The classes a plugin can own, in declaration order. */
export const PLUGIN_OWNED_CLASSES = Object.keys(
  PLUGIN_OWNED_CLASS_ORDER,
) as readonly PluginOwnedClass[];

/** What one client's plugin carries: the plugin version, and the classes it owns. */
export interface PluginClientRecord {
  /** Semantic version of the plugin that installed this client's content. */
  version: string;
  /**
   * The classes the plugin owns for this client — non-empty, no duplicates. A
   * class listed here is a class the engine neither writes nor reclaims, so an
   * empty list is a client record that says nothing and is refused as such.
   */
  classes: readonly PluginOwnedClass[];
}

/**
 * How this repository's setup is installed, and which client owes its content
 * to a plugin.
 *
 * `clients` is legal under either mode: a repository can record the roots it
 * knows about before it migrates, and only `mode: "plugin-backed"` actually
 * moves ownership (`pluginOwnedClasses` in `../manifest/manifest.ts` is the
 * one reader that decides this, so the rule is stated once).
 */
export interface PluginConfig {
  /** Where generated content comes from (see {@link InstallMode}). */
  mode: InstallMode;
  /** Per-client plugin records; a tool with no record owns nothing. */
  clients?: Partial<Record<Tool, PluginClientRecord>>;
}

/**
 * The operator's verification-gate commands, as the generated charter should
 * state them. Absent members fall back to detection — a pinned `all` with no
 * `test` leaves the Tests row to the detected script, which is why every
 * member is optional and independently so.
 *
 * Validated by SHAPE only — non-empty, single-line, bounded length. The engine
 * does not run these and ships no catalogue of build tools, so checking a
 * command against one would be a guarantee it cannot keep; what is checkable
 * is that the string can carry a command at all and fits on the one line the
 * generated charter prints it on.
 */
export interface GatesConfig {
  /** Command that runs the test suite. */
  test?: string;
  /** Command that runs the linter. */
  lint?: string;
  /** Command that runs the type checker. */
  typecheck?: string;
  /** Command that runs the full gate in one line. */
  all?: string;
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
  /**
   * How selected rules are delivered (see {@link RuleDelivery}); absent reads
   * as {@link RULE_DELIVERY_DEFAULT}.
   *
   * {@link MANIFEST_VERSION} does NOT move for this field, on the
   * {@link ModelConfig} precedent: it is additive and optional, a manifest
   * written before it existed parses unchanged and resolves to the default,
   * and a migration step would have nothing to transform.
   */
  ruleDelivery?: RuleDelivery;
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
   * How this setup is installed and what a plugin owns per client (see
   * {@link PluginConfig}); absent reads as {@link INSTALL_MODE_DEFAULT}.
   *
   * {@link MANIFEST_VERSION} does NOT move for this field, on the
   * {@link ModelConfig} precedent: it is additive and optional, a manifest
   * written before it existed parses unchanged and resolves to the default,
   * and a migration step would have nothing to transform.
   */
  plugin?: PluginConfig;
  /**
   * Operator-pinned verification-gate commands (see {@link GatesConfig});
   * absent members fall back to detection. Additive and optional on the same
   * {@link ModelConfig} precedent as {@link SetupManifest.plugin}.
   */
  gates?: GatesConfig;
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
