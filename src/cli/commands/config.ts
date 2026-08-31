import { CliFailure } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import {
  closePrompts,
  promptGate,
  sanitizeLabel,
  selectMany,
  selectOne,
  textInput,
  type PromptGate,
  type PromptIo,
} from "../kit/prompts.ts";
import { resolveLearningsCaps } from "../../learnings/validation.ts";
import {
  collectManifestErrors,
  readCommunicationStyle,
  readMaturityTier,
  readReviewCap,
} from "../../manifest/manifest.ts";
import {
  CURATED_MCP_SERVERS,
  PLATFORM_MCP_SERVER,
  validateServerIds,
  type PackSuppliedServer,
} from "../../mcp/catalog.ts";
import { discoverInstalledPacks, packMcpServers } from "../../pack/projection.ts";
import {
  CLIENT_MODEL_PROJECTION,
  MODEL_LADDER,
  isModelClass,
  resolveEffortValue,
  resolveModelValue,
  type EffortMap,
  type ModelPinMap,
} from "../../roster/modelLadder.ts";
import {
  HARD_MAX_REVIEW_ITERATIONS,
  MIN_MAX_REVIEW_ITERATIONS,
} from "../../roster/reviewCaps.ts";
import {
  COMMUNICATION_STYLES,
  EFFORT_LEVELS,
  MATURITY_TIERS,
  MODEL_CLASSES,
  TOOLS,
  type CommunicationStyle,
  type EffortLevel,
  type MaturityTier,
  type ModelClass,
  type Platform,
  type Tool,
} from "../../types/core.ts";
import { summarizeDetection } from "../../detect/repoAnalyzer.ts";
import type { DetectedSummary } from "../../types/detect.ts";
import type { SetupManifest } from "../../types/manifest.ts";
import {
  NEXT_DRY_RUN_LINE,
  NEXT_SYNC_LINE,
  requireSetupManifest,
  runMcpAdd,
  runMcpList,
  runMcpRemove,
} from "./config/mcp.ts";

/**
 * `stamity config` — the reconfigure verb: read what binds, change one key,
 * refresh detection, manage MCP servers.
 *
 *   config                 a picker over the keys on an interactive terminal;
 *                          exactly `config list` everywhere else
 *   config list            every key, its effective value, and whether it was
 *                          set or is an engine default
 *   config get <key>       the raw persisted value, or `(default: X)`
 *   config set <key> <val> validate and persist one key
 *   config detect          re-run repo analysis + git identity and refresh
 *                          `detected` / `platform`, printing a before->after diff
 *   config mcp <action>    server management (see ./config/mcp.ts)
 *
 * Three properties hold across the whole surface.
 *
 * **Two interactive surfaces, and every action is still addressable.** The
 * whole prompt budget is `init`'s questions and the picker bare `config`
 * renders — a navigable list of the keys, which applies the one change it
 * settles through {@link setConfigValue} and prints what `set` prints. Every
 * action here remains addressed by argument and flag, so a script, a pipe and
 * CI see no prompt EVER: the picker renders only where the prompt gate is open
 * (a TTY stdin, no `-y`, no `--json`), and bare `config` on every other run is
 * {@link runList}, byte for byte. `list`, `get`, `set`, `detect` and `mcp` are
 * prompt-free on every stream, terminal included.
 *
 * **Detection over asking extends to reconfiguration.** `detect` is how a repo
 * that grew a language or gained a remote gets its manifest corrected — the
 * operator is not asked to re-type facts the engine can observe.
 *
 * **Config edits state; `sync` applies it.** Nothing here regenerates output,
 * so every successful mutation closes with {@link NEXT_SYNC_LINE}.
 *
 * Engine access rule: command bodies reach the engine through `ctx.engine`, the
 * typed composition root. The two exported pure functions
 * ({@link getConfigValue}, {@link setConfigValue}) take a manifest rather than a
 * context, so they import the engine's PURE helpers — the enum tables, the
 * dial resolvers, the manifest validator, the catalog id check, the model
 * ladder's own projection — directly. No
 * validation rule is restated here: `setConfigValue` applies the value and then
 * asks the manifest schema whether the result is admissible, so the CLI and the
 * writer can never disagree about what is valid.
 *
 * The one direct engine import is `../../pack/projection.ts`, which the
 * composition registry does not yet carry a field for — `./config/mcp.ts`
 * reaches for it the same way, and for the same question: which MCP server ids
 * an installed pack supplies. It is read once per `set`, in the async command
 * body, so the key registry below stays a table of synchronous pure functions.
 */

/** Rendering for an optional key the manifest does not carry. */
const NONE = "none";

/**
 * The system-of-record platforms, derived from the catalog's total
 * `Record<Platform, string>` rather than re-spelled here — a new platform
 * member fails to compile there instead of going missing from this hint.
 */
const PLATFORMS = Object.keys(PLATFORM_MCP_SERVER);

/** Every curated MCP server id, in catalog order. */
const CURATED_IDS = Object.keys(CURATED_MCP_SERVERS);

/**
 * Facts an `apply` needs that the manifest does not carry, resolved once by the
 * async command body before the synchronous apply runs.
 *
 * `apply` stays synchronous deliberately. The registry is also what
 * `../docs/configReference.ts` renders the shipped configuration page from, and
 * {@link setConfigValue} is exported as a pure function over a manifest;
 * awaiting inside one row's apply would push a Promise through both surfaces
 * for the sake of a single key. A caller that passes no context gets
 * {@link NO_PACK_SUPPLY} — the same default `validateServerIds` applies to its
 * own optional tail, and it means the same thing: no installed-pack read
 * happened here, so the resolvable set is the curated catalog alone.
 */
export interface ConfigApplyContext {
  /** Every MCP server the installed packs supply, as `config mcp` resolves them. */
  readonly packServers: readonly PackSuppliedServer[];
}

/** No pack read happened: the resolvable id set is the curated catalog alone. */
const NO_PACK_SUPPLY: ConfigApplyContext = { packServers: [] };

/** One addressable key: how it reads, what actually binds, and how a value applies. */
export interface ConfigKeySpec {
  readonly key: string;
  /** What a valid value looks like; quoted in the failure's next step. */
  readonly hint: string;
  /**
   * True when `apply` reads {@link ConfigApplyContext.packServers}. Resolving
   * pack supply is a ledger read plus a directory walk per installed pack, so
   * the command body pays for it on the rows that declare the need rather than
   * on every `set`. Declared on the row so which key needs it is stated once,
   * here, instead of being re-spelled as a key name in the command body.
   */
  readonly needsPackSupply?: boolean;
  /**
   * The closed vocabulary a value comes from, or absent for a free-form key.
   *
   * Structured rather than parsed back out of {@link hint}: the hint is prose
   * for a person and the picker needs the members, so both are built from the
   * SAME constant the validator reads (`EFFORT_LEVELS`, `MATURITY_TIERS`, …)
   * and the vocabulary keeps one home. A key with no field here is free-form
   * and the picker types its value against the hint — which is also why the
   * field is additive: `read`, `resolve`, `apply` and every existing consumer
   * (`set`, `../docs/configReference.ts`) never look at it.
   *
   * Not every closed set is expressible here, and `mcp.servers` is the one
   * that is not: its members are the curated catalog PLUS whatever the
   * installed packs supply, which is an async ledger read (see
   * {@link applyContext}) rather than a constant. It stays free-form, and its
   * hint says what the ids are.
   */
  readonly choices?: readonly string[];
  /**
   * True when a value is a comma-separated SUBSET of {@link choices} rather
   * than one member of it — the picker offers checkboxes instead of a
   * single-select, and `apply` still receives one comma-separated string.
   */
  readonly multiple?: boolean;
  /** The persisted value as a string, or null when the manifest does not carry it. */
  readonly read: (manifest: SetupManifest) => string | null;
  /** What binds once engine defaults are applied — never null. */
  readonly resolve: (manifest: SetupManifest) => string;
  /** Apply `raw` to a manifest copy. Schema-expressible defects are left to validation. */
  readonly apply: (draft: SetupManifest, raw: string, context: ConfigApplyContext) => void;
}

/** Comma-separated values, trimmed, blanks dropped, repeats collapsed, order kept. */
function parseCsv(raw: string): string[] {
  const seen = new Set<string>();
  for (const token of raw.split(",")) {
    const value = token.trim();
    if (value !== "") seen.add(value);
  }
  return [...seen];
}

/** A list rendered for display; empty reads as a word, not a blank. */
function renderList(values: readonly string[]): string {
  return values.length === 0 ? NONE : values.join(", ");
}

// ── The model ladder's three operator dials ────────────────────────────────

/**
 * What a model row prints when nothing resolves for it. Not a value: the
 * adapter omits the key entirely and the client applies its own default, so
 * printing a plausible alias here would name a model the emitted files do not
 * contain — the one thing the ladder's "never invent a value" rule forbids.
 */
const CLIENT_DEFAULT = "(client default)";

/**
 * What an effort row prints for a client that cannot express the level.
 * {@link CLIENT_DEFAULT}'s counterpart on the other axis, and not a level for
 * the same reason: the emitted file carries no effort at all there, so naming
 * one would describe a setting the client never applies.
 */
const NOT_EXPRESSED = "(not expressed)";

const MODEL_HINT =
  "a model id your client accepts — passed through verbatim, shape-checked only " +
  "(non-empty, one line)";

/** Clients that carry the effort axis at all, and the one that documents dropping it. */
const EFFORT_CARRIERS = TOOLS.filter(
  (tool) => CLIENT_MODEL_PROJECTION[tool].effortCarrier !== null,
);
const EFFORT_OMITTERS = TOOLS.filter(
  (tool) => CLIENT_MODEL_PROJECTION[tool].effortCarrier === null,
);

const EFFORT_HINT =
  `one of ${EFFORT_LEVELS.join(" | ")} — carried on ${renderList(EFFORT_CARRIERS)}, ` +
  `omitted on ${renderList(EFFORT_OMITTERS)}`;

/** The persisted pin for one class, or null when the operator set none. */
function readPin(manifest: SetupManifest, modelClass: ModelClass): string | null {
  return manifest.models?.pins?.[modelClass] ?? null;
}

/**
 * What the selected clients will actually write for `modelClass` — the ladder's
 * own answer, per client, for exactly this manifest's pins and effort.
 *
 * Rendered per client whenever the clients disagree, which they routinely do:
 * one publishes aliases the class maps onto and the others resolve to nothing
 * until an id is pinned, and the bracket client carries effort inside the model
 * value. Collapsing that to one string would print a value some emitted file
 * will not contain.
 */
function resolvePin(manifest: SetupManifest, modelClass: ModelClass): string {
  const pins = manifest.models?.pins ?? {};
  const efforts = manifest.models?.effort ?? {};
  const perTool = manifest.tools.map((tool) => ({
    tool,
    value: resolveModelValue(modelClass, tool, pins, efforts),
  }));
  const distinct = new Set(perTool.map((entry) => entry.value));
  if (distinct.size === 0) return CLIENT_DEFAULT;
  if (distinct.size === 1) return perTool[0]?.value ?? CLIENT_DEFAULT;
  return perTool.map((entry) => `${entry.tool}=${entry.value ?? CLIENT_DEFAULT}`).join(", ");
}

/**
 * Write one pin into the draft.
 *
 * Ladder membership is the check the schema cannot express — the manifest
 * validates the class against the vocabulary in `types/core.ts`, while the
 * table that actually resolves a pin at emission is `MODEL_LADDER`. A class in
 * one and not the other would persist and then silently emit nothing, so it is
 * refused here, the `mcp.servers` precedent: the check lives where the set is
 * known.
 */
function applyPin(draft: SetupManifest, modelClass: ModelClass, raw: string): void {
  if (!isModelClass(modelClass)) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `no ladder class named ${JSON.stringify(modelClass)}`,
      why: "a pin reaches an emitted file only through a class the model ladder assigns",
      next: `pin one of: ${MODEL_CLASSES.join(", ")}`,
    });
  }
  draft.models = { ...draft.models, pins: { ...draft.models?.pins, [modelClass]: raw } };
}

/** The persisted effort for one class, or null when the operator set none. */
function readEffort(manifest: SetupManifest, modelClass: ModelClass): string | null {
  return manifest.models?.effort?.[modelClass] ?? null;
}

/**
 * Whether an effort setting for `modelClass` reaches what `tool` emits.
 *
 * Asked as a differential over the two resolvers the adapters themselves call:
 * if two levels produce two emissions, the level is carried; if every level
 * emits the same bytes, it is not. That is the question in its own terms, and
 * it restates nothing — the carrier table, the bracket client's
 * `<id>[effort=…]` shape, the documented no-carrier omission, and the verbatim
 * rule for a pin the operator wrote their own brackets on are all read out of
 * the resolvers rather than copied here. A second copy of that decision is the
 * drift `../../roster/modelLadder.ts` exists to prevent, which is why its
 * header sends this question to the call site instead of publishing a
 * predicate for it.
 */
function expressesEffort(
  tool: Tool,
  modelClass: ModelClass,
  pins: ModelPinMap,
  efforts: EffortMap,
): boolean {
  const emissions = new Set(
    EFFORT_LEVELS.map((level) => {
      const probe = { ...efforts, [modelClass]: level };
      // Both carriers together: one client writes the level into a key of its
      // own, another rides it inside the model value, a third writes it
      // nowhere. Serialised as a pair rather than concatenated, so an absent
      // field stays distinguishable from an empty one and two different
      // emissions can never compare equal.
      return JSON.stringify([
        resolveModelValue(modelClass, tool, pins, probe),
        resolveEffortValue(modelClass, tool, probe),
      ]);
    }),
  );
  return emissions.size > 1;
}

/**
 * The level that binds for one class — {@link resolvePin}'s shape on the other
 * axis, and rendered per client for the same reason.
 *
 * The level itself is the operator's, else the ladder row's own default, read
 * off the ladder rather than restated. WHICH clients apply it is the other half
 * of the answer and the reason this row cannot print a bare level: on the
 * bracket client the axis rides inside a model value that exists only once an
 * id is pinned, and one client publishes no effort surface at all, so a repo
 * can carry a level — persisted or defaulted — that reaches no emitted file.
 * Printing that as what binds is the fabricated value the ladder's "never
 * invent a value" rule forbids, told about the effort axis instead of the
 * model one.
 */
function resolveEffort(manifest: SetupManifest, modelClass: ModelClass): string {
  const pins = manifest.models?.pins ?? {};
  const efforts = manifest.models?.effort ?? {};
  // Effort is a property of the CLASS, not of a client, so the fallback is the
  // ladder row's own default rather than a per-client table.
  const level =
    efforts[modelClass] ??
    MODEL_LADDER.find((row) => row.modelClass === modelClass)?.defaultEffort ??
    NONE;

  const perTool = manifest.tools.map((tool) => ({
    tool,
    value: expressesEffort(tool, modelClass, pins, efforts) ? level : NOT_EXPRESSED,
  }));
  const distinct = new Set(perTool.map((entry) => entry.value));
  // No clients selected — a state the manifest schema refuses (`tools` must
  // name at least one target tool), so the only caller that reaches here is
  // `../docs/configReference.ts`'s unset probe. The marker is a PER-CLIENT
  // verdict, and with no client to hold it there is nothing it could be true
  // of; printing it would tell every reader of the shipped page that effort
  // reaches no emitted file, which is false for every repo that has one. The
  // level is a property of the CLASS and is nameable without a client, so
  // that is what this branch answers — which clients apply it is the hint
  // column's half of the answer, not this one's.
  if (distinct.size === 0) return level;
  if (distinct.size === 1) return perTool[0]?.value ?? NOT_EXPRESSED;
  return perTool.map((entry) => `${entry.tool}=${entry.value}`).join(", ");
}

function applyEffort(draft: SetupManifest, modelClass: ModelClass, raw: string): void {
  // Membership is the schema's call: an out-of-band level comes back from
  // validation naming the three the clients share.
  draft.models = {
    ...draft.models,
    effort: { ...draft.models?.effort, [modelClass]: raw as EffortLevel },
  };
}

/**
 * The closed key registry. Adding a row is the only way to make a key
 * addressable — `set` refuses anything else by name, so a typo can never write
 * a field the schema would then reject at the writer.
 *
 * Exported for reading only: `src/cli/docs/configReference.ts` renders the
 * configuration page from these rows so the page cannot list a key the command
 * does not address. Nothing outside this file mutates the registry or calls
 * `apply`.
 */
export const KEY_SPECS: readonly ConfigKeySpec[] = [
  {
    key: "tools",
    hint: `a comma-separated subset of ${TOOLS.join(", ")}`,
    choices: TOOLS,
    multiple: true,
    read: (manifest) => manifest.tools.join(", "),
    resolve: (manifest) => renderList(manifest.tools),
    apply: (draft, raw) => {
      // Membership is the schema's call: an unknown tool comes back from
      // validation naming the whole known set.
      draft.tools = parseCsv(raw) as Tool[];
    },
  },
  {
    key: "platform",
    hint: `one of ${PLATFORMS.join(" | ")}`,
    choices: PLATFORMS,
    read: (manifest) => manifest.platform ?? null,
    resolve: (manifest) => manifest.platform ?? NONE,
    apply: (draft, raw) => {
      draft.platform = raw as Platform;
    },
  },
  {
    key: "maturityTier",
    hint: `one of ${MATURITY_TIERS.join(" | ")}`,
    choices: MATURITY_TIERS,
    read: (manifest) => manifest.maturityTier ?? null,
    resolve: (manifest) => readMaturityTier(manifest),
    apply: (draft, raw) => {
      draft.maturityTier = raw as MaturityTier;
    },
  },
  {
    key: "communicationStyle",
    hint: `one of ${COMMUNICATION_STYLES.join(" | ")}`,
    choices: COMMUNICATION_STYLES,
    read: (manifest) => manifest.communicationStyle ?? null,
    resolve: (manifest) => readCommunicationStyle(manifest),
    apply: (draft, raw) => {
      draft.communicationStyle = raw as CommunicationStyle;
    },
  },
  {
    key: "learnings.maxCount",
    hint: "a positive integer",
    read: (manifest) =>
      manifest.learnings?.maxCount === undefined ? null : String(manifest.learnings.maxCount),
    resolve: (manifest) => String(resolveLearningsCaps(manifest.learnings?.maxCount).maxCount),
    apply: (draft, raw) => {
      // Number() over parseInt(): "12abc" must be refused, not silently read as 12.
      draft.learnings = { ...draft.learnings, maxCount: Number(raw) };
    },
  },
  {
    key: "hooks.userHooksDir",
    hint: "a repo-relative directory path",
    read: (manifest) => manifest.hooks?.userHooksDir ?? null,
    resolve: (manifest) => manifest.hooks?.userHooksDir ?? NONE,
    apply: (draft, raw) => {
      draft.hooks = { ...draft.hooks, userHooksDir: raw };
    },
  },
  {
    key: "mcp.servers",
    hint:
      "a comma-separated list of server ids this repo can resolve — curated, " +
      "or supplied by an installed pack",
    needsPackSupply: true,
    // An empty list reads the same as an absent one: neither selects anything.
    read: (manifest) =>
      manifest.mcp === undefined || manifest.mcp.servers.length === 0
        ? null
        : manifest.mcp.servers.join(", "),
    resolve: (manifest) => renderList(manifest.mcp?.servers ?? []),
    apply: (draft, raw, context) => {
      const servers = parseCsv(raw);
      // Catalog membership is not a schema property — the manifest accepts any
      // string array — so it is checked here, where the id set is known. That
      // set is two halves, and both are checked against the same table
      // emission resolves from: an installed pack's `mcp_servers/` supply is
      // as selectable as a curated row. `config mcp add` is the sibling writer
      // of THIS manifest field; a curated-only check here would refuse an
      // operator the round-trip of a selection that command just wrote.
      const { unknown } = validateServerIds(servers, context.packServers);
      if (unknown.length > 0) {
        const packIds = context.packServers.map((server) => server.id);
        throw new CliFailure({
          code: "VALIDATION_ERROR",
          message: `unknown MCP server(s): ${unknown.join(", ")}`,
          why:
            "only reviewed, version-pinned servers — from the curated catalog or an " +
            "installed pack — can be selected",
          // Both halves, always, in the shape `config mcp add` prints them: an
          // operator shown only the curated ids reads the refusal as "delete
          // the pack server you selected", which is the opposite of the truth.
          next:
            `use ids from — curated: ${CURATED_IDS.join(", ")}` +
            (packIds.length === 0
              ? "; no installed pack supplies a server"
              : `; installed packs: ${packIds.join(", ")}`),
        });
      }
      draft.mcp = { ...draft.mcp, servers };
    },
  },
  {
    key: "mcp.protocolVersion",
    hint: "an MCP protocol revision string",
    read: (manifest) => manifest.mcp?.protocolVersion ?? null,
    resolve: (manifest) => manifest.mcp?.protocolVersion ?? NONE,
    apply: (draft, raw) => {
      draft.mcp = { servers: [], ...draft.mcp, protocolVersion: raw };
    },
  },
  // The ladder's eight per-class rows are spelled out one by one rather than
  // generated from MODEL_CLASSES: `set` matches a key by name against this
  // array, so the array is the surface an operator (and this file's reader)
  // has to be able to read literally. A comprehension would hide the key set
  // behind a loop for eight rows that never change.
  {
    key: "model.frontier",
    hint: MODEL_HINT,
    read: (manifest) => readPin(manifest, "frontier"),
    resolve: (manifest) => resolvePin(manifest, "frontier"),
    apply: (draft, raw) => applyPin(draft, "frontier", raw),
  },
  {
    key: "model.advanced",
    hint: MODEL_HINT,
    read: (manifest) => readPin(manifest, "advanced"),
    resolve: (manifest) => resolvePin(manifest, "advanced"),
    apply: (draft, raw) => applyPin(draft, "advanced", raw),
  },
  {
    key: "model.standard",
    hint: MODEL_HINT,
    read: (manifest) => readPin(manifest, "standard"),
    resolve: (manifest) => resolvePin(manifest, "standard"),
    apply: (draft, raw) => applyPin(draft, "standard", raw),
  },
  {
    key: "model.economy",
    hint: MODEL_HINT,
    read: (manifest) => readPin(manifest, "economy"),
    resolve: (manifest) => resolvePin(manifest, "economy"),
    apply: (draft, raw) => applyPin(draft, "economy", raw),
  },
  {
    key: "effort.frontier",
    hint: EFFORT_HINT,
    choices: EFFORT_LEVELS,
    read: (manifest) => readEffort(manifest, "frontier"),
    resolve: (manifest) => resolveEffort(manifest, "frontier"),
    apply: (draft, raw) => applyEffort(draft, "frontier", raw),
  },
  {
    key: "effort.advanced",
    hint: EFFORT_HINT,
    choices: EFFORT_LEVELS,
    read: (manifest) => readEffort(manifest, "advanced"),
    resolve: (manifest) => resolveEffort(manifest, "advanced"),
    apply: (draft, raw) => applyEffort(draft, "advanced", raw),
  },
  {
    key: "effort.standard",
    hint: EFFORT_HINT,
    choices: EFFORT_LEVELS,
    read: (manifest) => readEffort(manifest, "standard"),
    resolve: (manifest) => resolveEffort(manifest, "standard"),
    apply: (draft, raw) => applyEffort(draft, "standard", raw),
  },
  {
    key: "effort.economy",
    hint: EFFORT_HINT,
    choices: EFFORT_LEVELS,
    read: (manifest) => readEffort(manifest, "economy"),
    resolve: (manifest) => resolveEffort(manifest, "economy"),
    apply: (draft, raw) => applyEffort(draft, "economy", raw),
  },
  {
    key: "review.maxIterations",
    hint:
      `a whole number of review rounds within ` +
      `${MIN_MAX_REVIEW_ITERATIONS}..${HARD_MAX_REVIEW_ITERATIONS}`,
    read: (manifest) =>
      manifest.models?.reviewCap === undefined ? null : String(manifest.models.reviewCap),
    // One function answers for the cap everywhere — the emitted gate script and
    // the work command's prose read the same resolver, so no fourth literal.
    resolve: (manifest) => String(readReviewCap(manifest)),
    apply: (draft, raw) => {
      // Number() over parseInt(), the learnings.maxCount precedent: "4abc" must
      // be refused, not silently read as 4.
      draft.models = { ...draft.models, reviewCap: Number(raw) };
    },
  },
];

/** Every addressable key, in display order. */
export const CONFIG_KEYS: readonly string[] = KEY_SPECS.map((spec) => spec.key);

/** A key's spec, or a failure naming the closed key set. */
function specFor(key: string): ConfigKeySpec {
  const spec = KEY_SPECS.find((candidate) => candidate.key === key);
  if (spec !== undefined) return spec;
  throw new CliFailure({
    code: "VALIDATION_ERROR",
    message: `unknown config key ${JSON.stringify(key)}`,
    why: "config addresses a closed key set",
    next: `use one of: ${CONFIG_KEYS.join(", ")}`,
  });
}

/** What a key reads as: the persisted value, whether it is a default, and what binds. */
export interface ConfigValue {
  /** The persisted value as a string, or null when the manifest does not carry it. */
  value: string | null;
  /** True when nothing is persisted and `resolved` comes from an engine default. */
  isDefault: boolean;
  /** What actually binds — persisted value, or the engine's resolution of its absence. */
  resolved: string;
}

/** Read one key. Throws {@link CliFailure} naming the key set for an unknown key. */
export function getConfigValue(manifest: SetupManifest, key: string): ConfigValue {
  const spec = specFor(key);
  const value = spec.read(manifest);
  return { value, isDefault: value === null, resolved: spec.resolve(manifest) };
}

/**
 * `manifest` with `key` set to `raw`, as a new manifest — the input is never
 * mutated, so a rejected value cannot leave a half-applied object behind.
 *
 * Validation is delegated: the value is applied to a copy and the copy is put
 * through the manifest schema, so the message an operator sees is the same one
 * the writer would have produced, listing the same valid set. Throws
 * {@link CliFailure} on an unknown key or a value the schema refuses.
 *
 * `context` carries what only an async caller can read — see
 * {@link ConfigApplyContext}. Omitted, it is {@link NO_PACK_SUPPLY}: every key
 * behaves identically except that `mcp.servers` validates against the curated
 * catalog alone, which is what "this caller did not read the pack ledger"
 * means.
 */
export function setConfigValue(
  manifest: SetupManifest,
  key: string,
  raw: string,
  context: ConfigApplyContext = NO_PACK_SUPPLY,
): SetupManifest {
  const spec = specFor(key);
  const draft = structuredClone(manifest);
  spec.apply(draft, raw.trim(), context);

  const errors = collectManifestErrors(draft);
  if (errors.length > 0) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `${key} rejected the value ${JSON.stringify(raw)}`,
      why: errors.join("; "),
      next: `re-run with ${spec.hint}`,
    });
  }
  return draft;
}

// ── Subcommands ────────────────────────────────────────────────────────────

/** Every key with its effective value and a (set)/(default) marker. */
async function runList(ctx: CliContext, rootDir: string): Promise<CommandResult> {
  const manifest = await requireSetupManifest(ctx, rootDir);
  const rows = CONFIG_KEYS.map((key) => ({ key, ...getConfigValue(manifest, key) }));
  const width = Math.max(...rows.map((row) => row.key.length));

  ctx.io.out(`${ctx.engine.manifest.manifest.manifestPath(rootDir)}\n`);
  for (const row of rows) {
    const marker = row.isDefault ? ctx.palette.dim("(default)") : ctx.palette.green("(set)");
    // `row.resolved` can carry a manifest-derived, free-form value (a pinned
    // model id, a `hooks.userHooksDir` path, …) this process did not author —
    // the second sink for the same control-byte hazard the raw menu's own
    // labels carry, so it goes through the same `sanitizeLabel`. `row.key` is
    // always one of the closed, code-owned `CONFIG_KEYS` and never needs it.
    ctx.io.out(`  ${row.key.padEnd(width)}  ${sanitizeLabel(row.resolved).padEnd(24)}  ${marker}\n`);
  }
  ctx.io.out(`${ctx.palette.dim("run stamity config set <key> <value> to change one")}\n`);

  return { exitCode: 0, json: { keys: rows } };
}

// ── The picker ─────────────────────────────────────────────────────────────

/**
 * The key rows as menu labels: {@link runList}'s three columns, verbatim.
 *
 * The menu IS the list — an operator who runs bare `config` to see what binds
 * and one who runs it to change something are looking at the same rows, so the
 * picker does not get a second, shorter rendering of the same registry.
 *
 * No palette. The kit's menu writes no colour of its own (`../kit/prompts.ts`
 * says why: it holds neither the `--no-color` flag nor the env that decides),
 * so the marker word carries the state here exactly as it does for a NO_COLOR
 * reader of the list.
 */
function keyChoices(manifest: SetupManifest): { value: string; label: string }[] {
  const rows = CONFIG_KEYS.map((key) => ({ key, ...getConfigValue(manifest, key) }));
  const width = Math.max(...rows.map((row) => row.key.length));
  return rows.map((row) => ({
    value: row.key,
    label:
      `${row.key.padEnd(width)}  ${row.resolved.padEnd(24)}  ` +
      `${row.isDefault ? "(default)" : "(set)"}`,
  }));
}

/**
 * The single-select value menu's own row, prepended ahead of every real choice
 * and the row Enter-Enter lands on.
 *
 * A sentinel rather than a real choice value: `spec.choices` is a closed
 * vocabulary (`Platform`, `MaturityTier`, …) this module does not own, so
 * standing up a fake member of it would be a value {@link setConfigValue}
 * could plausibly accept by accident. The leading NUL byte cannot appear in
 * any vocabulary member the schema admits, so `picked === KEEP_UNCHANGED`
 * cannot alias a real answer.
 */
const KEEP_UNCHANGED = "\u0000keep-unchanged";
const KEEP_UNCHANGED_LABEL = "(keep unchanged)";

/**
 * The chosen key's value, or `null` when the operator gave none.
 *
 * Three shapes, decided by the row rather than by a key name spelled here: a
 * closed vocabulary is picked from, a list-valued one is ticked off, and a
 * free-form one is typed against its own hint. Every shape hands back ONE
 * string, which is what `set` passes to {@link setConfigValue} — so the picker
 * cannot reach a value the flag path could not.
 *
 * `null` covers the two ways "never mind" is spelled: an empty line at the
 * text prompt, and every box cleared on a checkbox. Neither is treated as a
 * value; the alternative is asking the schema to refuse an answer the operator
 * never gave.
 */
async function askValue(
  gate: PromptGate,
  promptIo: PromptIo,
  manifest: SetupManifest,
  spec: ConfigKeySpec,
): Promise<string | null> {
  const current = spec.read(manifest);
  if (spec.choices === undefined) {
    const typed = await textInput(gate, promptIo, {
      // The hint is the only vocabulary a free-form key has, and it is the same
      // sentence a rejected `set` quotes as its next step.
      question: `${spec.key} — ${spec.hint}\nnew value`,
      defaultValue: current ?? "",
    });
    return typed.trim() === "" ? null : typed;
  }

  const choices = spec.choices.map((value) => ({ value, label: value }));
  if (spec.multiple === true) {
    const picked = await selectMany(gate, promptIo, {
      question: `${spec.key}?`,
      choices,
      // Preselected from the manifest: a multi-select whose boxes did not open
      // on the current set would read as "add to", and answer as "replace with".
      defaultValues: current === null ? [] : parseCsv(current),
    });
    return picked.length === 0 ? null : picked.join(", ");
  }
  // Single-select gets one row neither `read` nor `resolve` can name: declining
  // to change this key at all. Prepended AND the default, so Enter-Enter off
  // bare `config` (key row 1, then whatever this menu opens on) can no longer
  // land on a real value the operator never looked at — the value menu's
  // opening row used to be "the persisted value, else what resolves, else the
  // first member", none of which is "leave it alone", and a `platform` key with
  // nothing persisted opened on the catalog's first member with no way to
  // decline.
  const picked = await selectOne(gate, promptIo, {
    question: `${spec.key}?`,
    choices: [{ value: KEEP_UNCHANGED, label: KEEP_UNCHANGED_LABEL }, ...choices],
    defaultValue: KEEP_UNCHANGED,
  });
  return picked === KEEP_UNCHANGED ? null : picked;
}

/**
 * Bare `config` where somebody is there to navigate it: pick a key off the
 * list, pick or type its value, apply it the way `set` would have.
 *
 * ONE change per run, deliberately. The picker is a spelling of `set` for an
 * operator who does not have the key set memorised, not a settings screen: it
 * settles a single key, prints the same diff and the same next step, and ends.
 * A loop would need its own commit/abort semantics on top of a command whose
 * every mutation is one validated write today.
 */
async function runPicker(
  ctx: CliContext,
  rootDir: string,
  gate: PromptGate,
): Promise<CommandResult> {
  const manifest = await requireSetupManifest(ctx, rootDir);
  // The list's own header: which manifest these rows come from.
  ctx.io.out(`${ctx.engine.manifest.manifest.manifestPath(rootDir)}\n`);

  const key = await selectOne(gate, ctx.promptIo, {
    question: "Which setting?",
    choices: keyChoices(manifest),
    defaultValue: CONFIG_KEYS[0] ?? "",
  });
  const value = await askValue(gate, ctx.promptIo, manifest, specFor(key));
  // Every question is settled. On a real terminal the prompt session holds
  // stdin in raw mode, where Ctrl-C is a byte the kit consumes rather than a
  // signal — leaving it open across the write below would make the write
  // uninterruptible. `init` closes it here for the same reason; the funnel's
  // `finally` closes it again, idempotently.
  closePrompts(ctx.promptIo);

  if (value === null) {
    ctx.io.out(`no value chosen — ${key} is unchanged.\n`);
    return { exitCode: 0, json: { key, changed: false } };
  }
  // Re-read rather than reuse `manifest`: the snapshot above rendered the key
  // list and the value menu, but the operator was then blocked on for however
  // long the interaction took, and `manifest` is stale for exactly that long.
  // Applying the chosen key+value against it would carry every OTHER field
  // frozen at that snapshot into the write below — silently reverting a
  // concurrent `stamity sync` or a second `config set` that landed in between.
  // The choices and labels the operator saw stay sourced from the first read
  // (rendering off a manifest that moves mid-interaction would be its own
  // hazard); only the write's input is refreshed, immediately before it is
  // used, the same way `runSet` and `runDetect` already read exactly once,
  // right before they write.
  const fresh = await requireSetupManifest(ctx, rootDir);
  return await applyKeyValue(ctx, rootDir, fresh, key, value);
}

/** One key's raw persisted value, or the default that stands in for it. */
async function runGet(
  ctx: CliContext,
  rootDir: string,
  key: string | undefined,
): Promise<CommandResult> {
  if (key === undefined) {
    throw new CliFailure({
      code: "USAGE",
      message: "config get needs a key",
      why: "get reads exactly one key",
      next: `run stamity config get <key> — keys: ${CONFIG_KEYS.join(", ")}`,
    });
  }
  const manifest = await requireSetupManifest(ctx, rootDir);
  const read = getConfigValue(manifest, key);

  ctx.io.out(
    read.value === null
      ? `${key}  ${ctx.palette.dim(`(default: ${read.resolved})`)}\n`
      : `${key}  ${read.value}\n`,
  );
  return { exitCode: 0, json: { key, ...read } };
}

/**
 * What `key`'s apply needs from outside the manifest, read once per `set`.
 *
 * Pack supply costs a ledger scan plus a directory read per installed pack, so
 * only a row that declares {@link ConfigKeySpec.needsPackSupply} pays for it —
 * and a repo with no pack rows in its ledger touches no extra file even then.
 * Resolved through the same seam `config mcp` and emission use, so the three
 * surfaces cannot disagree about which ids exist.
 */
async function applyContext(
  rootDir: string,
  manifest: SetupManifest,
  key: string,
): Promise<ConfigApplyContext> {
  if (specFor(key).needsPackSupply !== true) return NO_PACK_SUPPLY;
  const packs = await discoverInstalledPacks(rootDir, manifest);
  return { packServers: await packMcpServers(packs, rootDir) };
}

/** Validate and persist one key, printing the before->after diff. */
async function runSet(
  ctx: CliContext,
  rootDir: string,
  key: string | undefined,
  value: string | undefined,
): Promise<CommandResult> {
  if (key === undefined || value === undefined) {
    throw new CliFailure({
      code: "USAGE",
      message: key === undefined ? "config set needs a key" : `config set needs a value for ${key}`,
      why: "set writes exactly one key",
      next: `run stamity config set <key> <value> — keys: ${CONFIG_KEYS.join(", ")}`,
    });
  }

  const manifest = await requireSetupManifest(ctx, rootDir);
  return await applyKeyValue(ctx, rootDir, manifest, key, value);
}

/**
 * Validate one value, report what it changed, and persist it unless this is a
 * dry run — the half of `set` the picker shares.
 *
 * Shared rather than re-implemented: the validation path, the no-op line, the
 * `--dry-run` preview, the before->after diff and the run-`sync` reminder are
 * one behaviour, and a picker with its own copy of them would be a second
 * answer to "what did that change?" waiting to drift from `set`'s.
 */
async function applyKeyValue(
  ctx: CliContext,
  rootDir: string,
  manifest: SetupManifest,
  key: string,
  value: string,
): Promise<CommandResult> {
  const before = getConfigValue(manifest, key);
  const next = setConfigValue(manifest, key, value, await applyContext(rootDir, manifest, key));
  const after = getConfigValue(next, key);

  if (before.value === after.value) {
    ctx.io.out(`${key} is already ${JSON.stringify(after.resolved)} — no change.\n`);
    return { exitCode: 0, json: { key, changed: false, value: after.value } };
  }

  const diff = `${key}: ${before.value ?? before.resolved} ${ctx.palette.cyan("->")} ${after.resolved}`;
  if (ctx.dryRun) {
    ctx.io.out(`would set ${diff}\n`);
    ctx.io.out(`${NEXT_DRY_RUN_LINE}\n`);
    return {
      exitCode: 0,
      json: { key, changed: false, dryRun: true, previous: before.value, value: after.value },
    };
  }

  await ctx.engine.manifest.manifest.writeManifest(rootDir, next);
  ctx.io.out(`set ${diff}\n`);
  ctx.io.out(`${NEXT_SYNC_LINE}\n`);
  return {
    exitCode: 0,
    json: { key, changed: true, previous: before.value, value: after.value },
  };
}

/** One refreshed field: what the manifest said, and what the repo says now. */
interface DetectRow {
  field: string;
  before: string;
  after: string;
}

/** Fields whose refreshed value differs from the persisted one. */
function diffDetection(
  manifest: SetupManifest,
  detected: DetectedSummary,
  platform: Platform | null,
): DetectRow[] {
  const rows: DetectRow[] = [];
  for (const field of ["languages", "linters", "testFrameworks", "ciProviders"] as const) {
    const before = renderList(manifest.detected?.[field] ?? []);
    const after = renderList(detected[field]);
    if (before !== after) rows.push({ field, before, after });
  }
  if (platform !== null && platform !== manifest.platform) {
    rows.push({ field: "platform", before: manifest.platform ?? NONE, after: platform });
  }
  return rows;
}

/**
 * Re-observe the repo and refresh what the manifest records about it. Git
 * identity only ever adds: a repo with no reachable remote leaves the persisted
 * platform alone rather than erasing an answer the operator gave.
 */
async function runDetect(ctx: CliContext, rootDir: string): Promise<CommandResult> {
  const manifest = await requireSetupManifest(ctx, rootDir);

  ctx.spinner.start("scanning the repo");
  const info = await ctx.engine.detect.repoAnalyzer.analyzeRepo(rootDir);
  const identity = ctx.engine.workspace.git.detectRepoGitIdentity(rootDir);
  ctx.spinner.stop();

  const detected: DetectedSummary = summarizeDetection(info);
  const rows = diffDetection(manifest, detected, identity.platform);

  if (rows.length === 0) {
    ctx.io.out("detect: the manifest already matches this repo — nothing to refresh.\n");
    return { exitCode: 0, json: { changed: [], detected, platform: manifest.platform ?? null } };
  }

  const width = Math.max(...rows.map((row) => row.field.length));
  const render = (): void => {
    for (const row of rows) {
      ctx.io.out(
        `  ${row.field.padEnd(width)}  ${row.before} ${ctx.palette.cyan("->")} ${row.after}\n`,
      );
    }
  };

  const platform = identity.platform ?? manifest.platform;
  if (ctx.dryRun) {
    ctx.io.out(`detect: ${rows.length} field(s) would change\n`);
    render();
    ctx.io.out(`${NEXT_DRY_RUN_LINE}\n`);
    return {
      exitCode: 0,
      json: { changed: rows, detected, platform: platform ?? null, dryRun: true },
    };
  }

  await ctx.engine.manifest.manifest.writeManifest(rootDir, {
    ...manifest,
    ...(platform === undefined ? {} : { platform }),
    detected,
  });
  ctx.io.out(`detect: refreshed ${rows.length} field(s)\n`);
  render();
  ctx.io.out(`${NEXT_SYNC_LINE}\n`);
  return { exitCode: 0, json: { changed: rows, detected, platform: platform ?? null } };
}

/** Dispatch `config mcp <action> [id]` onto the MCP submodule. */
async function runMcp(
  ctx: CliContext,
  rootDir: string,
  action: string | undefined,
  id: string | undefined,
): Promise<CommandResult> {
  if (action === undefined || action === "list") return runMcpList(ctx, rootDir);

  if (action !== "add" && action !== "remove") {
    throw new CliFailure({
      code: "USAGE",
      message: `unknown mcp action ${JSON.stringify(action)}`,
      why: "config mcp takes one of three actions",
      next: "use one of: list, add, remove",
    });
  }
  if (id === undefined) {
    throw new CliFailure({
      code: "USAGE",
      message: `config mcp ${action} needs a server id`,
      why: "a server is selected or deselected by id",
      next: `run stamity config mcp ${action} <id>, or stamity config mcp list to see the ids`,
    });
  }
  return action === "add" ? runMcpAdd(ctx, rootDir, id) : runMcpRemove(ctx, rootDir, id);
}

export const configCommand: CommandModule = {
  name: "config",
  summary: "inspect and change the setup: keys, detection refresh, MCP servers",
  // set / detect / mcp write the manifest, so the shared --dry-run flag registers.
  mutating: true,
  args: [
    // The description is copied verbatim into the generated `docs/cli-reference.md`
    // (`../docs/cliReference.ts`, byte-gated by its suite), so the omit clause is
    // a docs change as much as a help-text one: regenerate the page in the same
    // change that edits this string.
    {
      name: "subcommand",
      description: "list | get | set | detect | mcp — omit on a terminal for the interactive picker",
      required: false,
    },
    { name: "key", description: "config key, or the mcp action (list | add | remove)", required: false },
    { name: "value", description: "new value, or the MCP server id", required: false },
  ],
  run: async (ctx, _opts, args): Promise<CommandResult> => {
    const rootDir = ctx.app.runtime.cwd;
    const [subcommand, first, second] = args;

    // Bare `config` is the ONE invocation with two renderings, because it is
    // the one that names no action. With the gate open it picks; with it shut —
    // a pipe, CI, `-y`, `--json`, a dumb terminal — it is `runList` and nothing
    // else, which is what keeps every script that reads this output working.
    // An explicit `config list` is the list on every stream, terminal included.
    if (subcommand === undefined) {
      const gate = promptGate({
        stdinIsTTY: ctx.terminal.stdinIsTTY,
        yes: ctx.yes,
        json: ctx.json,
        env: ctx.app.runtime.env,
      });
      return gate.interactive ? runPicker(ctx, rootDir, gate) : runList(ctx, rootDir);
    }

    switch (subcommand) {
      case "list":
        return runList(ctx, rootDir);
      case "get":
        return runGet(ctx, rootDir, first);
      case "set":
        return runSet(ctx, rootDir, first, second);
      case "detect":
        return runDetect(ctx, rootDir);
      case "mcp":
        return runMcp(ctx, rootDir, first, second);
      default:
        throw new CliFailure({
          code: "USAGE",
          message: `unknown config subcommand ${JSON.stringify(subcommand)}`,
          why: "config takes one of five subcommands",
          next: "use one of: list, get, set, detect, mcp",
        });
    }
  },
};
