/**
 * The model/effort ladder: which class each role runs at, and what each client
 * writes for that class. Zero-import kernel data module — types only, per the
 * roster boundary.
 *
 * DECLARE ONCE, PROJECT PER CLIENT. The four-class ladder and its
 * role assignments are protocol: shipped content names a CLASS and never a
 * model id, because ids move on each vendor's release cadence while a sizing
 * decision does not. Before this module the same ladder existed three times,
 * once per adapter, in three shapes that had drifted apart — one alias table
 * missing the top class, one collapsing every class to a single literal, one
 * carrying effort only. Three copies of one decision is three chances to state
 * it differently, which is what happened. The projection below is DATA rather
 * than a switch per adapter so a fourth client is a row, not a fifth dialect.
 *
 * THE SHIPPED TWIN, AND WHICH SIDE IS TRUE. A role's class is declared in
 * exactly one place: that agent artifact's own `model_class:` frontmatter.
 * That declaration is what the engine projects onto every client, so it is
 * what binds. The rows below restate it for the resolvers, and
 * `content/commands/st-work.md` restates it once more under "Model ladder"
 * for the agent that checks a role's class after substitution —
 * post-substitution class verification stays a protocol check, so
 * the shipped text is what the checking agent reads. Neither restatement
 * decides anything: where a surface disagrees with the frontmatter, the
 * frontmatter is right and the surface is stale. Two restatements of one
 * declaration are two chances to drift, so both edges are pinned in
 * `test/roster/modelLadder.test.ts` — one case holds these rows to the corpus
 * frontmatter, and a parity case holds the shipped table to this array: its
 * class column to this order, and each row's role column to `roles` in BOTH
 * directions, so a dropped role fails as loudly as one borrowed from another
 * rung. Two placements no frontmatter can declare ARE recorded here, each named
 * in the `rationale` of the row carrying it: the reviewer's escalation to the
 * top class for the whole-branch pass, and the fixer's drop to the cheapest
 * class once a round is mechanical.
 *
 * TWO FLOW PLACEMENTS ARE NOT RECORDED HERE, and a reader has to know which.
 * The first is the review loop's round-4 rule. That rule — a fresh fixer on a stronger model class,
 * stated in `content/agents/stamity-fixer.md` and `content/commands/st-work.md`
 * — names no class, and no row below places `fixer` above `standard`. So an
 * agent verifying a role's class against this table after substitution will not
 * find the round-4 class in it, and nothing here resolves a value for it: that
 * escalation is prompt-carried, and the flow acts on the sentence rather than on
 * an emitted key. Written down as a gap rather than closed by adding a row,
 * because a role column here is pinned in both directions against the corpus
 * frontmatter and the shipped table, and inventing a placement to make the
 * sentence resolve would move all three.
 *
 * The second is the capacity rung in `content/commands/st-work.md`'s Dispatch
 * contract: under a `limit-no-reset` stop (credits, or a model limit with no
 * reset) a build role may run one class below its assigned class and no
 * further, named in the proof block; a build role with no class below it stops
 * as BLOCKED_DEPENDENCY. The drop is relative to the role's own class and names
 * no target rung, so no row below carries it and nothing here resolves a value
 * for it: that drop is prompt-carried too, for the same reason the round-4
 * class is.
 * Verdict roles and the spec-author never fall back to a weaker class.
 *
 * NEVER INVENT A VALUE. A class this module cannot resolve for a client yields
 * `undefined`, and the adapter omits the key. The client then applies its own
 * default — an honest unknown — where a guessed value would be a fabricated
 * sizing decision that outranks the operator and expires without warning. Both
 * shipped alias tables already carried this rule in their own words; it is
 * stated once here, for all four clients. `content/commands/st-work.md`
 * states it once more where it introduces the ladder table — the only shipped
 * prose telling a reader where a class GOES — and a third anchor in the
 * provenance case holds that text to this behaviour: a paragraph promising the
 * two keys on every emitted file would read as a projection guarantee the
 * resolvers below do not make, and the adapter suites already pin the absence
 * it would contradict.
 *
 * THE OPERATOR OUTRANKS THE LADDER. `stamity config` pins concrete ids per
 * class — pinned explicit ids on router-active platforms, with operator
 * override — and a pin wins over the built-in alias. Every supported client
 * accepts a concrete id in its model field (see the citations on each row), so
 * a pin is expressible everywhere the client has the field at all. Whether an
 * EFFORT setting reaches a given client is read off
 * {@link ClientModelProjection.effortCarrier} at the call site that needs it;
 * this module publishes no predicate for it. The one surface that would ask —
 * the config command's per-class effort rows — resolves a level without naming
 * a client, so a predicate exported for it would be a capability with no
 * caller plus a docstring naming one, which is the gap this header exists to
 * close.
 *
 * WHY CURSOR'S TABLE IS EMPTY. That client's ladder used to emit `model:
 * inherit` for all four classes — a value the engine chose, restating the
 * client's own documented default as though the engine had decided something,
 * and inverting the pinning mandate above. An empty alias table is the fix at
 * the data layer: with no operator pin the class resolves to `undefined` and
 * the key is omitted (silence, not a re-declared default); with a pin the id
 * the operator named is emitted verbatim. The same reasoning gives the codex
 * and copilot rows empty tables: neither client documents a symbolic
 * vocabulary, so there is nothing to map a class ONTO without naming an id.
 *
 * WHAT AN EMPTY TABLE COSTS, SAID PLAINLY. Three of the four clients carry no
 * aliases, so on a repo with no operator pins this module resolves nothing for
 * them and the adapter omits the key — and the client's own router then picks
 * the model, re-deciding the sizing the ladder just made. The class still binds
 * as PROSE (it is what a generated body names, and what the post-substitution
 * check reads), but as an emitted CONSTRAINT the ladder binds on one client by
 * default and on the other three only once an operator pins ids per class. The
 * top class is unmapped everywhere: `frontier` resolves to a value on NO client
 * without a pin, including the one that publishes aliases. This is the honest
 * silence the never-invent rule chose over a guessed default rather than an
 * oversight — and it is not a gap a future alias table closes on its own, since
 * two of these clients publish no symbolic vocabulary to map onto at all. An
 * operator who wants the ladder enforced in the emitted files sets the pins.
 *
 * ONE EFFORT AXIS, TWO CARRIERS, FOUR SCALES. Effort is carried per client
 * where supported and omitted on Copilot cloud (documented) — one axis, and
 * exactly one client that drops it. The three that carry it do NOT document
 * the same levels, so each row declares its own
 * {@link ClientModelProjection.effortScale} with its own citation, and
 * {@link nearestExpressibleEffort} is where a level asked for on one client's
 * vocabulary lands on another's. `stamity config` refuses a level the CURRENT
 * selection cannot express; the clamp exists for the client that joins after. The rest do not agree on WHERE it goes:
 * two publish a key of their own, and one carries it as a bracket parameter of
 * the model value itself (`<id>[effort=high]`, options comma-separated inside
 * a single group as `[effort=high,context=300k]` —
 * cursor.com/docs/agent/subagents, accessed 2026-08-17). A row therefore names
 * its CARRIER before it names a key, and the bracket client projects through
 * {@link resolveModelValue} rather than answering with a key it does not have.
 * Reading `effortKey: null` as "this client has no effort" is the mistake the
 * field's name invites: it means no STANDALONE key, and
 * {@link ClientModelProjection.effortCarrier} says whether the axis rides
 * elsewhere or is genuinely absent. Dropping it on the one client is a
 * decision with a citation; dropping it on a client whose carrier merely has a
 * different SHAPE would be the unledgered in-code call this module exists to
 * end, one axis over.
 *
 * Consumers: the four adapters project a class through {@link resolveModelValue}
 * and {@link resolveEffortValue}; `stamity config` validates and stores the pin
 * and effort maps those two accept.
 */

import { EFFORT_LEVELS, effortRank, type EffortLevel, type ModelClass, type Tool } from "../types/core.ts";
import type { SetupManifest } from "../types/manifest.ts";

// ── The ladder ───────────────────────────────────────────────────

/** One class of the ladder: who runs at it, how hard, and why. */
export interface ModelLadderRow {
  /** The class this row assigns. */
  readonly modelClass: ModelClass;
  /**
   * Role ids that run at this class, alphabetical. Bare ids, as the corpus
   * declares them — the runtime prefix belongs to the guard's namespace, not
   * to a sizing table.
   *
   * Membership is not exclusive, and the two overlaps are the point: a role
   * sits at the class its artifact frontmatter declares AND at any class the
   * flow escalates or drops it to for a named situation. `reviewer` is
   * `advanced` per round and `frontier` for the whole-branch pass; `fixer` is
   * `standard` and drops to `economy` once a round is mechanical. Each
   * overlap is named in the `rationale` of the non-default row.
   */
  readonly roles: readonly string[];
  /** Effort this class asks for where the client has a field for it. */
  readonly defaultEffort: EffortLevel;
  /** Why the class is drawn here. Read by operators auditing the allocation. */
  readonly rationale: string;
}

/**
 * The ladder, strongest to cheapest. Order is the ladder's own — every
 * consumer that renders it reads this array rather than re-sorting, so the
 * emitted table and the resolver cannot disagree about which end is which.
 *
 * Role assignments mirror the shipped agent corpus: each row lists the roles
 * whose `model_class:` frontmatter declares this class, plus the flow-level
 * escalations described above. `test/roster/modelLadder.test.ts` binds all
 * three surfaces — the corpus frontmatter, this array, and the work command's
 * rendered table — so a reassignment that edits one of them fails there rather
 * than shipping a table contradicting the agent doing the verifying. The
 * header's shipped-twin note says which of the three is the declaration.
 */
export const MODEL_LADDER: readonly ModelLadderRow[] = [
  {
    modelClass: "frontier",
    roles: ["reviewer"],
    defaultEffort: "high",
    rationale:
      "The whole-branch pass at deep intensity: the one review that reads a finished branch end to end, where a missed cross-unit defect costs a rework cycle instead of a round. No agent file declares this class — it is an escalation the flow applies to the reviewer, whose default sits one rung down.",
  },
  {
    modelClass: "advanced",
    roles: ["design-quality", "implementer", "reviewer", "security", "spec-author"],
    defaultEffort: "high",
    rationale:
      "The roles the rest of the flow is built on: the per-round review verdict, implementation on novel or cross-cutting units, the spec text later units are planned against, and the two specialist lenses whose misses ship — an authorization gap or an unmet success criterion, where a missed budget only slows something down.",
  },
  {
    modelClass: "standard",
    roles: ["creator", "fixer", "performance", "researcher"],
    defaultEffort: "medium",
    rationale:
      "The default working class: units with a known shape, research briefs answered against the codebase, fix rounds that still need judgement, cost review against budgets the repository already declared, and authoring one user artifact to a shape the corpus already fixes.",
  },
  {
    modelClass: "economy",
    roles: ["fixer", "test-runner"],
    defaultEffort: "low",
    rationale:
      "Bounded work with a checkable answer: running the declared gates and reporting them verbatim, and the mechanical fix rounds — lint, format, rename sweeps. `fixer` also sits at `standard`, its default; the drop to this class is the flow's call once a round carries no judgement.",
  },
];

/**
 * Class → row. Built from {@link MODEL_LADDER} so the two cannot diverge, and
 * the vocabulary {@link isModelClass} rules on.
 */
const LADDER_BY_CLASS: ReadonlyMap<string, ModelLadderRow> = new Map(
  MODEL_LADDER.map((row) => [row.modelClass, row]),
);

/** Whether `value` is a class this ladder assigns. */
export function isModelClass(value: unknown): value is ModelClass {
  return typeof value === "string" && LADDER_BY_CLASS.has(value);
}

// ── The per-client projection ────────────────────────────────────

/**
 * Where a client carries the effort axis.
 *
 * - `"key"` — a field of its own, named by {@link ClientModelProjection.effortKey}.
 * - `"model-suffix"` — a parameter of the model value, composed from
 *   {@link ClientModelProjection.effortTemplate}. Expressible only once a model
 *   value resolves: the parameter has nothing to ride on until an id is named.
 * - `null` — the surface this engine emits carries the axis nowhere, so a
 *   class's effort is dropped on that client. Only a documented decision may
 *   take this value; it is not the default for a carrier that is awkward.
 *
 * Named for this note rather than inlined into the field below, and module-local
 * because the field is where a consumer meets it: adapters narrow on the literals
 * and `stamity config` names the set as `ClientModelProjection["effortCarrier"]`,
 * which points at the row that carries the decision. Exporting the alias put a
 * second name on the public surface with nothing importing it.
 */
type EffortCarrier = "key" | "model-suffix" | null;

/** The token {@link ClientModelProjection.effortTemplate} substitutes. */
export const EFFORT_PLACEHOLDER = "{effort}";

/**
 * What one client can express, as data. A new client is a row here plus its
 * citation — not a branch in an adapter.
 */
export interface ClientModelProjection {
  readonly tool: Tool;
  /** Key the client reads a model from, or `null` when it has no such field. */
  readonly modelKey: string | null;
  /**
   * Where this client carries effort. Read it BEFORE `effortKey`: two of the
   * three carriers leave that key `null`, for opposite reasons.
   */
  readonly effortCarrier: EffortCarrier;
  /**
   * Key the client reads reasoning effort from — a string exactly when
   * `effortCarrier` is `"key"`, and `null` under both other carriers.
   */
  readonly effortKey: string | null;
  /**
   * Suffix appended to the model value to carry effort, with
   * {@link EFFORT_PLACEHOLDER} standing in for the level — a string exactly
   * when `effortCarrier` is `"model-suffix"`, `null` otherwise. Kept as a
   * printable template rather than a formatter function so `stamity config` can
   * SHOW an operator the shape their effort setting takes on this client
   * instead of describing it in a second place.
   */
  readonly effortTemplate: string | null;
  /**
   * Whether the client's model field takes a concrete id. `true` on every
   * supported client today, which is what makes the operator override
   * expressible everywhere; it is stated per row rather than assumed globally
   * because the day a client narrows to a closed vocabulary, `stamity config`
   * has to warn on a pin instead of silently emitting an id that client will
   * reject.
   */
  readonly acceptsConcreteIds: boolean;
  /**
   * The client's own symbolic names for ladder classes. Empty where the client
   * documents none — see the module header on why empty means silence rather
   * than a fallback.
   */
  readonly aliases: Readonly<Partial<Record<ModelClass, string>>>;
  /**
   * The effort levels THIS client documents, weakest to strongest, as a subset
   * of `EFFORT_LEVELS` in that tuple's own order.
   *
   * The asymmetry is the point, and it is why the shared band was retired: the
   * four clients do not accept the same levels, so a level legal on one is a
   * refusal at `stamity config set` on another and a clamp at emission on a
   * third. Empty means the client carries the axis NOWHERE — the same claim
   * {@link effortCarrier} `null` makes, said in the scale's own vocabulary so
   * a consumer reading only this field cannot mistake "no levels" for "not
   * filled in yet".
   */
  readonly effortScale: readonly EffortLevel[];
  /**
   * What the scale does NOT guarantee, where that needs saying; `null` where
   * the scale is the whole claim.
   *
   * One client parses the level and hands it to the model rather than ruling
   * on it, so its "scale" is the whole union and what actually binds is the
   * model's own parameter vocabulary. Declaring the union with no note would
   * read as a promise this engine cannot keep.
   */
  readonly effortScaleNote: string | null;
  /**
   * Where {@link effortScale} was read, or `null` when the scale is empty and
   * there is no scale to cite — the documented omission is already carried by
   * {@link citation} on that row.
   *
   * Separate from {@link citation} because three of the four scales are
   * published on a DIFFERENT vendor page from the key names and aliases, and
   * moving one date to cover both would date a claim nobody re-read.
   */
  readonly effortScaleCitation: { url: string; accessDate: string } | null;
  /** Where the two key names and the alias vocabulary were read. */
  readonly citation: { url: string; accessDate: string };
}

/**
 * Every supported client, one row each.
 *
 * The alias tables are deliberately asymmetric. Only one client publishes
 * model-agnostic names the ladder can map onto, so only that row carries
 * aliases; the rest resolve to nothing until an operator pins an id. That
 * asymmetry is a fact about the clients, not an incompleteness here — filling
 * the empty rows would mean choosing ids on the operator's behalf.
 */
export const CLIENT_MODEL_PROJECTION: Readonly<Record<Tool, ClientModelProjection>> = {
  claude: {
    tool: "claude",
    modelKey: "model",
    effortCarrier: "key",
    effortKey: "effort",
    effortTemplate: null,
    acceptsConcreteIds: true,
    // Three aliases, and `frontier` deliberately absent. The alias vocabulary
    // this client publishes is wider than these three, but nothing in it names
    // a size ABOVE the top one, so mapping the deep-review class onto any of
    // them would be a guess that silently downgrades it. An absent key inherits
    // the session's model, which is the honest answer to a class with no name —
    // and it makes this the only client where three of the four classes bind by
    // default, with the fourth resolving on no client until an operator pins it.
    aliases: { advanced: "opus", standard: "sonnet", economy: "haiku" },
    // Two rungs above the retired band and none below it: this client's floor
    // is `low`, so the one level another client documents underneath it rises
    // to `low` here rather than being dropped.
    effortScale: ["low", "medium", "high", "xhigh", "max"],
    effortScaleNote: null,
    effortScaleCitation: {
      url: "https://code.claude.com/docs/en/sub-agents",
      accessDate: "2026-09-17",
    },
    citation: { url: "https://code.claude.com/docs/en/sub-agents", accessDate: "2026-08-17" },
  },
  cursor: {
    tool: "cursor",
    modelKey: "model",
    // Effort exists here only as a bracket PARAMETER of a model id
    // (`<id>[effort=high]`), never as a standalone key — so the axis reaches
    // this client through the model value, and only once an id is named. That
    // is a shape difference, not an absence: the SoT names this client's
    // brackets as its carrier for the per-role model + effort map, and the one
    // documented omission is elsewhere.
    effortCarrier: "model-suffix",
    effortKey: null,
    effortTemplate: `[effort=${EFFORT_PLACEHOLDER}]`,
    acceptsConcreteIds: true,
    aliases: {},
    // The whole union, because this client rules on nothing: it parses the
    // bracket group and hands the value to the model. So no level is refused
    // HERE and none is clamped here either — and the note is what keeps that
    // from reading as a guarantee the level lands.
    effortScale: [...EFFORT_LEVELS],
    effortScaleNote: "pass-through — parameter ids and values vary by model",
    effortScaleCitation: {
      url: "https://cursor.com/docs/sdk/typescript",
      accessDate: "2026-09-17",
    },
    citation: { url: "https://cursor.com/docs/agent/subagents", accessDate: "2026-08-17" },
  },
  copilot: {
    tool: "copilot",
    modelKey: "model",
    // Documented omission — effort is omitted on Copilot cloud: the agent
    // configuration publishes no effort key, and no model-value parameter
    // either, on the surface this engine emits — the axis has nowhere to go
    // here, and the `null` carrier records that as the decision it is. The
    // only row entitled to it.
    effortCarrier: null,
    effortKey: null,
    effortTemplate: null,
    acceptsConcreteIds: true,
    aliases: {},
    // Empty, and empty for the SAME documented reason the carrier is `null`:
    // there is no effort surface here to hold a level. Nothing to cite beyond
    // the row's own page, so the scale citation is `null` rather than a second
    // copy of it dated to a read that did not happen.
    effortScale: [],
    effortScaleNote: null,
    effortScaleCitation: null,
    citation: {
      url: "https://docs.github.com/en/copilot/reference/custom-agents-configuration",
      accessDate: "2026-08-17",
    },
  },
  codex: {
    tool: "codex",
    modelKey: "model",
    effortCarrier: "key",
    effortKey: "model_reasoning_effort",
    effortTemplate: null,
    acceptsConcreteIds: true,
    aliases: {},
    // One rung lower and one rung shorter than the other key carrier: this is
    // the only client documenting `minimal`, and the only one that cannot be
    // asked for `max`. Published on the config-file page rather than on the
    // subagents page this row's other claims come from, which is why the scale
    // carries its own citation.
    effortScale: ["minimal", "low", "medium", "high", "xhigh"],
    effortScaleNote: null,
    effortScaleCitation: {
      url: "https://learn.chatgpt.com/docs/config-file/config-reference",
      accessDate: "2026-09-17",
    },
    citation: {
      url: "https://learn.chatgpt.com/docs/agent-configuration/subagents",
      accessDate: "2026-08-17",
    },
  },
};

// ── Resolution ───────────────────────────────────────────────────

/** Operator model pins by class, as `stamity config` stores them. */
export type ModelPinMap = Readonly<Partial<Record<ModelClass, string>>>;

/** Operator effort overrides by class, as `stamity config` stores them. */
export type EffortMap = Readonly<Partial<Record<ModelClass, EffortLevel>>>;

/**
 * An operator value the engine will act on, or `undefined`.
 *
 * Blank is absent: a config key present but empty falls through to the ladder
 * rather than emitting an empty frontmatter value, which parses as a key with
 * no value on every client. Surrounding whitespace is dropped for the same
 * reason — a padded id is a value the client has to guess at.
 */
function stated(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * One projected value: the operator's, else the ladder's, else nothing — and
 * nothing at all when the client has no key to write it into. Writing a value
 * into a field the client does not read is worse than omitting it: it is a
 * restriction the operator can see in the file and the client never applies.
 */
function valueForKey(
  key: string | null,
  operator: string | undefined,
  declared: string | undefined,
): string | undefined {
  if (key === null) return undefined;
  return operator ?? declared;
}

/** The model value before any effort parameter rides on it. */
function baseModelValue(
  projection: ClientModelProjection,
  modelClass: ModelClass,
  pins: ModelPinMap,
): string | undefined {
  return valueForKey(projection.modelKey, stated(pins[modelClass]), projection.aliases[modelClass]);
}

/**
 * The effort a class ASKS for: the operator's, else the ladder's own.
 *
 * The request, not the emission. What a given client actually writes is this
 * value put through {@link nearestExpressibleEffort} for that client's scale,
 * and keeping the two apart is what lets {@link effortDisclosures} say which
 * clients moved it and to what.
 */
function requestedEffort(modelClass: ModelClass, efforts: EffortMap): EffortLevel | undefined {
  const asked = stated(efforts[modelClass]) ?? LADDER_BY_CLASS.get(modelClass)?.defaultEffort;
  // A manifest written by a NEWER engine can name a level this build has never
  // heard of. `collectManifestErrors` refuses that manifest by name long
  // before a plan is composed; this narrowing is what keeps a caller that
  // skipped validation from getting a fabricated rank out of `effortRank`.
  return asked !== undefined && (EFFORT_LEVELS as readonly string[]).includes(asked)
    ? (asked as EffortLevel)
    : undefined;
}

/**
 * The level `tool` actually writes when `level` is asked for, or `undefined`
 * when that client carries the axis nowhere.
 *
 * The requested level when the client's scale holds it. Otherwise the nearest
 * one it does hold: the highest entry RANKED BELOW the request, and only when
 * there is none — a request under the scale's floor, which today is `minimal`
 * against a scale starting at `low` — the lowest entry above it. Downward
 * first because a client asked for more than it can express should run at its
 * own ceiling rather than be quietly escalated past what the operator's other
 * clients are doing; upward as the fallback because the alternative is
 * dropping the axis, and a dropped key hands the sizing decision back to the
 * client's own default, which is the thing the ladder exists to take.
 *
 * Never silent about it: every clamp this makes is reported by
 * {@link effortDisclosures}, and `stamity config` refuses the level outright
 * when the narrow client is already selected, so a clamp is only ever reached
 * by a client that joined AFTER the level was set.
 */
export function nearestExpressibleEffort(level: EffortLevel, tool: Tool): EffortLevel | undefined {
  const { effortScale } = CLIENT_MODEL_PROJECTION[tool];
  if (effortScale.length === 0) return undefined;
  if (effortScale.includes(level)) return level;

  // A scale is declared in the union tuple's own order (pinned in
  // `test/roster/modelLadder.test.ts`), so "highest below" is the last entry
  // under the request and "lowest above" is the first over it — no search for
  // an extremum, and no comparison that only a mis-ordered row could take.
  const wanted = effortRank(level);
  const below = effortScale.findLast((entry) => effortRank(entry) < wanted);
  const above = effortScale.find((entry) => effortRank(entry) > wanted);
  return below ?? above;
}

/** The level a client emits for a class: the request, narrowed to its scale. */
function emittedEffort(
  tool: Tool,
  modelClass: ModelClass,
  efforts: EffortMap,
): EffortLevel | undefined {
  const asked = requestedEffort(modelClass, efforts);
  return asked === undefined ? undefined : nearestExpressibleEffort(asked, tool);
}

/**
 * The model value with the client's effort parameter appended, where that is
 * how the client carries effort at all.
 *
 * Two things pass through untouched. A client whose carrier is a key of its
 * own has nothing to append here. And a pinned value that already carries a
 * bracket group is emitted verbatim: options live comma-separated inside ONE
 * group, so a second group would be a value the client cannot parse — and an
 * operator who typed brackets has stated the whole model expression, effort
 * included if they wanted it. That verbatim rule is also how a class declines
 * the parameter on a model whose options do not include effort: pin the
 * documented empty-bracket form (`<id>[]`) and the ladder appends nothing.
 */
function withEffortParameter(
  projection: ClientModelProjection,
  model: string,
  effort: EffortLevel | undefined,
): string {
  if (projection.effortCarrier !== "model-suffix") return model;
  if (projection.effortTemplate === null || effort === undefined) return model;
  if (model.includes("[")) return model;
  return model + projection.effortTemplate.replace(EFFORT_PLACEHOLDER, effort);
}

/**
 * The string an adapter writes for `modelClass` on `tool`, or `undefined` when
 * it must omit the key.
 *
 * Precedence: operator pin, then the client's own alias for the class, then
 * nothing. An unknown class — one no ladder row assigns — is an honest
 * unknown and resolves to `undefined` rather than throwing: content is data,
 * and a typo in one artifact's frontmatter costs that artifact its model key,
 * not the run.
 *
 * On a client whose effort carrier is the model value, the answer carries both
 * axes — `<id>[effort=<level>]` — because that client has no second key to
 * write the level into. `efforts` is read for the same override the standalone
 * key honours, so one operator setting binds on every client that can express
 * it, whichever shape it takes there. Callers that pass no `efforts` still get
 * the class's declared effort: the ladder's sizing decision reaches this
 * client exactly as it reaches the two with keys.
 */
export function resolveModelValue(
  modelClass: string,
  tool: Tool,
  pins: ModelPinMap = {},
  efforts: EffortMap = {},
): string | undefined {
  if (!isModelClass(modelClass)) return undefined;
  const projection = CLIENT_MODEL_PROJECTION[tool];
  const model = baseModelValue(projection, modelClass, pins);
  if (model === undefined) return undefined;
  // The client's OWN level, not the raw request: one operator setting has to
  // mean the same thing on both carriers, so the bracket client narrows
  // through the same scale the key carriers do (its scale is the whole union
  // today, which makes this a no-op there — and a correct one the day a
  // pass-through client documents a narrower parameter vocabulary).
  return withEffortParameter(projection, model, emittedEffort(tool, modelClass, efforts));
}

/**
 * The value an adapter writes into the client's STANDALONE effort key, or
 * `undefined` when the client has none.
 *
 * Mirrors {@link resolveModelValue}, with one difference that follows from
 * what effort IS: the fallback is the ladder row's own `defaultEffort` rather
 * than a per-client table. Effort is a property of the class, so the LEVEL is
 * chosen without naming a client — and then narrowed by the client's own
 * {@link ClientModelProjection.effortScale}, because the clients do not
 * document the same levels. The key name is therefore not the only thing that
 * changes across clients; it used to be, while this engine only ever emitted
 * the three-level intersection.
 *
 * `undefined` here is not the same claim as "this class runs at no stated
 * effort on this client". It answers for one carrier; a client whose carrier
 * is the model value answers through {@link resolveModelValue}, and
 * {@link ClientModelProjection.effortCarrier} is what says which of the two to
 * read. An adapter that treats this function as the whole axis re-drops effort
 * on the bracket client, which is the defect the carrier field exists to
 * prevent.
 */
export function resolveEffortValue(
  modelClass: string,
  tool: Tool,
  efforts: EffortMap = {},
): string | undefined {
  if (!isModelClass(modelClass)) return undefined;
  const projection = CLIENT_MODEL_PROJECTION[tool];
  // No key, nothing written — the same rule `valueForKey` applies to the model
  // side. Both carriers then read one precedence helper, so the level a class
  // runs at cannot come out different depending on which shape carries it.
  if (projection.effortKey === null) return undefined;
  return emittedEffort(tool, modelClass, efforts);
}

/**
 * One line per (client, class) whose emitted level is not the level asked for.
 *
 * The other half of the refusal `stamity config set` makes. That refusal
 * cannot cover the case where the narrow client is selected LATER — the level
 * was legal against the selection it was set against — so the emission
 * discloses it instead. Never a refusal at this point and never a drop: the
 * plan is already composed, the level lands at the client's nearest rung, and
 * the operator is told which client moved it and to what.
 *
 * Silent about the client that carries the axis nowhere. An absent effort key
 * there is a documented omission the capability matrix already states, not a
 * narrowing of this operator's level, and reporting it per class would put
 * four lines of noise in front of every repository that selects that client.
 */
export function effortDisclosures(manifest: SetupManifest): string[] {
  const efforts = manifest.models?.effort ?? {};
  const lines: string[] = [];
  for (const tool of manifest.tools) {
    if (CLIENT_MODEL_PROJECTION[tool].effortCarrier === null) continue;
    for (const row of MODEL_LADDER) {
      const asked = requestedEffort(row.modelClass, efforts);
      if (asked === undefined) continue;
      const emitted = nearestExpressibleEffort(asked, tool);
      if (emitted === undefined || emitted === asked) continue;
      const edge = effortRank(emitted) < effortRank(asked) ? "ends at" : "starts at";
      lines.push(
        `effort [${tool}]: ${row.modelClass} asks for ${asked}; ` +
          `this client's scale ${edge} ${emitted}, emitted ${emitted}`,
      );
    }
  }
  return lines;
}
