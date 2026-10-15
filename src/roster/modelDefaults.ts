/**
 * The shipped model priority list, and the pick it makes from an account's own
 * model list (REQ-LADDER-006). Zero-import kernel data module — types and the
 * effort ranking only, per the roster boundary.
 *
 * WHY A SHIPPED LIST AT ALL. Three of the four clients publish no symbolic
 * vocabulary a class could map onto, so with no operator pin the ladder used to
 * resolve nothing for them and the client's own router sized every role. A
 * working pin needs a concrete id, and a concrete id is only safe when the
 * account offers it. So the engine ships an ORDER per class, not a value, and
 * the value is the first entry the account's own list holds. `init` and `sync`
 * read that list from the client's CLI (`src/cli/engine/clientModels.ts`) and
 * persist it under `models.listed.<client>`; emission reads the persisted copy
 * and never starts a client.
 *
 * WHEN THERE IS NO LIST. Copilot and Codex take entry 0, which every row below
 * puts on a model the client's CLI accepted when the row was read.
 *
 * CURSOR PICKS NOTHING, LIST OR NO LIST. Cursor checks a sub-agent call's
 * model against a list of its own, which follows the parent agent's model,
 * is narrower than `agent models` and is printed by no command; it refused a
 * class's pick from the account's list on the dispatch path, while an absent
 * model inherits the parent's, which it always accepts (ledger row
 * 2026-10-14_cli-native/qa/1). So {@link pickModel} answers `undefined` there
 * and only an operator's pin names a Cursor model. The Cursor rows below stay
 * the dated record of that client's listed ids; no emission reads them.
 *
 * Every id below was read from the client's own CLI on the access date its
 * citation carries (the captures live in `test/fixtures/client-models/`), and
 * every Copilot display name from the vendor page cited. Ids move on each
 * vendor's release cadence, so the rows are re-read and re-dated, never edited
 * from memory.
 */

import { EFFORT_LEVELS, effortRank, type EffortLevel, type ModelClass, type Tool } from "../types/core.ts";

/** The clients whose CLI can list an account's models; Claude Code keeps its family aliases. */
export type ListingClient = "cursor" | "copilot" | "codex";

/** One entry of a class's priority list. */
export interface ModelCandidate {
  /**
   * The id the client's CLI and agent files take. On Cursor it carries
   * {@link EFFORT_TOKEN} where the effort variant goes, because that client
   * lists one id per effort variant.
   */
  readonly id: string;
  /** The name Copilot's editor surfaces show (`<display> (copilot)`), where the vendor page gives one. */
  readonly display?: string;
}

/** The token a Cursor candidate's id carries where the effort variant goes. */
export const EFFORT_TOKEN = "{effort}";

/**
 * Strongest first within a class, per client. On Copilot the cheaper model
 * leads `standard` and `economy`, because VS Code refuses a sub-agent whose
 * model sits above the main model's cost tier.
 */
export const MODEL_PRIORITY: Readonly<Record<ListingClient, Readonly<Record<ModelClass, readonly ModelCandidate[]>>>> = {
  cursor: {
    frontier: [{ id: "claude-opus-5-5-{effort}" }, { id: "gpt-5.6-sol-{effort}" }, { id: "claude-opus-5-{effort}" }],
    advanced: [{ id: "claude-opus-5-5-{effort}" }, { id: "gpt-5.6-sol-{effort}" }, { id: "claude-opus-5-{effort}" }],
    standard: [
      { id: "claude-sonnet-5-5-{effort}" },
      { id: "gpt-5.6-terra-{effort}" },
      { id: "claude-sonnet-5-{effort}" },
    ],
    economy: [{ id: "claude-haiku-5-5-{effort}" }, { id: "gpt-5.6-luna-{effort}" }, { id: "gpt-5.4-mini-{effort}" }],
  },
  copilot: {
    frontier: [
      { id: "claude-fable-5.1", display: "Claude Fable 5.1" },
      { id: "claude-opus-5.5", display: "Claude Opus 5.5" },
      { id: "gpt-6-astra", display: "GPT-6 Astra" },
    ],
    advanced: [
      { id: "claude-opus-5.5", display: "Claude Opus 5.5" },
      { id: "gpt-6-astra", display: "GPT-6 Astra" },
      { id: "claude-opus-5", display: "Claude Opus 5" },
    ],
    standard: [
      { id: "claude-sonnet-5", display: "Claude Sonnet 5" },
      { id: "gpt-6-sol", display: "GPT-6 Sol" },
      { id: "gpt-5.6-terra", display: "GPT-5.6 Terra" },
    ],
    economy: [
      { id: "claude-haiku-4.5", display: "Claude Haiku 4.5" },
      { id: "gpt-6-luna", display: "GPT-6 Luna" },
      { id: "gpt-5.4-mini", display: "GPT-5.4 mini" },
    ],
  },
  codex: {
    frontier: [{ id: "gpt-6-astra" }, { id: "gpt-6-sol" }],
    advanced: [{ id: "gpt-6-astra" }, { id: "gpt-6-sol" }],
    standard: [{ id: "gpt-6-sol" }, { id: "gpt-5.6-terra" }],
    economy: [{ id: "gpt-6-luna" }, { id: "gpt-5.6-luna" }],
  },
};

/**
 * Where each client's rows were read. The ids come from the client's own CLI on
 * that date (Cursor `agent models` 2026.10.14, Codex `codex debug models`
 * 0.155.1, Copilot CLI 1.0.89 `copilot help config`); the page is the vendor's
 * model reference, read the same day, and the source of Copilot's display names.
 */
export const MODEL_PRIORITY_CITATION: Readonly<Record<ListingClient, { url: string; accessDate: string }>> = {
  cursor: { url: "https://cursor.com/docs/models", accessDate: "2026-10-14" },
  copilot: {
    url: "https://docs.github.com/en/copilot/reference/ai-models/supported-models",
    accessDate: "2026-10-14",
  },
  codex: { url: "https://learn.chatgpt.com/docs/models", accessDate: "2026-10-14" },
};

/** What {@link pickModel} chose for one class on one client. */
export interface ModelPick {
  /** The concrete id, never a template. */
  readonly id: string;
  readonly display?: string;
  /** The class's other candidates in priority order, concrete and, with a list, only those it holds. */
  readonly fallbacks: readonly string[];
}

/** Whether `tool` has a shipped priority list. */
function isListingClient(tool: Tool): tool is ListingClient {
  return Object.hasOwn(MODEL_PRIORITY, tool);
}

/**
 * The effort levels to try for a Cursor variant: the asked level, then the rest
 * by distance from it, the lower of two at the same distance first — the same
 * downward preference `nearestExpressibleEffort` takes in the ladder module.
 */
function effortsByNearness(asked: EffortLevel): readonly EffortLevel[] {
  const wanted = effortRank(asked);
  return EFFORT_LEVELS.toSorted((a, b) => {
    const distance = Math.abs(effortRank(a) - wanted) - Math.abs(effortRank(b) - wanted);
    return distance !== 0 ? distance : effortRank(a) - effortRank(b);
  });
}

/**
 * The concrete id `candidate` stands for on this account, or `undefined` when
 * it stands for none. With no list, only a candidate without the effort token
 * resolves (as itself), and one with the token takes the asked level.
 */
function concreteId(
  candidate: ModelCandidate,
  effort: EffortLevel | undefined,
  listed: ReadonlySet<string> | undefined,
): string | undefined {
  if (!candidate.id.includes(EFFORT_TOKEN)) {
    return listed === undefined || listed.has(candidate.id) ? candidate.id : undefined;
  }
  // A templated id names no model until a level is known; an unknown level is
  // refused by manifest validation long before this, so nothing is guessed.
  if (effort === undefined) return undefined;
  if (listed === undefined) return candidate.id.replace(EFFORT_TOKEN, effort);
  for (const level of effortsByNearness(effort)) {
    const id = candidate.id.replace(EFFORT_TOKEN, level);
    if (listed.has(id)) return id;
  }
  return undefined;
}

/**
 * The model `tool` runs `modelClass` on, from the shipped priority list, or
 * `undefined` when there is none to give. Pure.
 *
 * With `listed` (the ids the client's CLI printed for this account), the first
 * candidate the list holds wins. With no list, Copilot and Codex take entry 0.
 * Cursor always answers `undefined`, with or without a list (see the module
 * header). Claude Code has no list here: its family aliases live in the
 * ladder's projection.
 */
export function pickModel(
  tool: Tool,
  modelClass: ModelClass,
  effort: EffortLevel | undefined,
  listed?: readonly string[],
): ModelPick | undefined {
  if (!isListingClient(tool)) return undefined;
  if (tool === "cursor") return undefined;
  const onList = listed === undefined ? undefined : new Set(listed);
  const resolved: { id: string; display?: string }[] = [];
  for (const candidate of MODEL_PRIORITY[tool][modelClass]) {
    const id = concreteId(candidate, effort, onList);
    if (id === undefined || resolved.some((entry) => entry.id === id)) continue;
    resolved.push(candidate.display === undefined ? { id } : { id, display: candidate.display });
  }
  const [first, ...rest] = resolved;
  if (first === undefined) return undefined;
  return { ...first, fallbacks: rest.map((entry) => entry.id) };
}

/** Where a client's class-to-model map is written, repository-relative. */
export function modelMapPath(tool: Tool): string {
  return `.stamity/generated/models/${tool}.json`;
}
