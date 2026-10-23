/**
 * The shipped model priority list, and the pick it makes from an account's own
 * model list (REQ-LADDER-006). Zero-import kernel data module — types only, per
 * the roster boundary.
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
 * model against a list of its own, narrower than `agent models` prints; it
 * refused a class's pick from the account's list on the dispatch path (ledger
 * row 2026-10-14_cli-native/qa/1, observed 2026-10-15). In one live run that
 * list changed with the parent agent's model, one named parent tried; beyond
 * that run it is unverified. An absent model is the parent's by Cursor's
 * subagents docs (`inherit` is the default, read 2026-10-15) and by its refusal
 * text; no live run has dispatched one on this setup, so that it runs is
 * unverified. So {@link pickModel} answers `undefined` there
 * and only an operator's pin names a Cursor model. The Cursor rows below stay
 * the dated record of that client's listed ids; no emission reads them.
 *
 * Every id below was read from the client's own CLI on the access date its
 * citation carries (the captures live in `test/fixtures/client-models/`; the
 * Copilot rows from Copilot CLI 1.0.103 on 2026-10-23), and every Copilot
 * display name from the vendor page cited. A CLI's list is baked into its build
 * and keeps an id after the vendor retires it, so {@link VENDOR_RETIREMENTS}
 * holds the vendors' notices and no candidate names a retired id. Ids move on
 * each vendor's release cadence, so the rows are re-read and re-dated, never
 * edited from memory.
 */

import type { EffortLevel, ModelClass, Tool } from "../types/core.ts";

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
 * model sits above the main model's cost tier. Claude Haiku 5.5 leads
 * `economy` because it costs less than Claude Haiku 4.5 at every listed tier
 * (`https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing`,
 * read 2026-10-23); Haiku 4.5 comes second, ahead of GPT-6 Luna, so an
 * account that lacks 5.5 keeps the Haiku 4.5 pick it had on 1.16.0.
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
      { id: "claude-fable-5.1", display: "Claude Fable 5.1" },
    ],
    standard: [
      { id: "claude-sonnet-5", display: "Claude Sonnet 5" },
      { id: "gpt-6-sol", display: "GPT-6 Sol" },
      { id: "claude-sonnet-5.5", display: "Claude Sonnet 5.5" },
    ],
    economy: [
      { id: "claude-haiku-5.5", display: "Claude Haiku 5.5" },
      { id: "claude-haiku-4.5", display: "Claude Haiku 4.5" },
      { id: "gpt-6-luna", display: "GPT-6 Luna" },
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
 * that date (Cursor `agent models` 2026.10.14 and Codex `codex debug models`
 * 0.155.1 on 2026-10-14; Copilot CLI 1.0.103 `copilot help config` on
 * 2026-10-23); the page is the vendor's model reference, read the same day, and
 * the source of Copilot's display names.
 */
export const MODEL_PRIORITY_CITATION: Readonly<Record<ListingClient, { url: string; accessDate: string }>> = {
  cursor: { url: "https://cursor.com/docs/models", accessDate: "2026-10-14" },
  copilot: {
    url: "https://docs.github.com/en/copilot/reference/ai-models/supported-models",
    accessDate: "2026-10-23",
  },
  codex: { url: "https://learn.chatgpt.com/docs/models", accessDate: "2026-10-14" },
};

/** One model a vendor retired, or announced it will retire, on one client. */
interface VendorRetirement {
  /** The id as the client's CLI takes it. */
  readonly id: string;
  /** The day it stops working, `YYYY-MM-DD`. */
  readonly retires: string;
  /** The vendor's notice. */
  readonly url: string;
  /** The day the notice was read, `YYYY-MM-DD`. */
  readonly accessDate: string;
}

/**
 * The retirements each vendor announced, so no shipped candidate names a model
 * that stops working. A CLI's help list is baked into its build and keeps a
 * retired id, so these notices, not the capture, say an id is gone. A row whose
 * date has passed stays as the record; a shipped candidate never matches one,
 * and an operator's pin is never refused by it.
 */
export const VENDOR_RETIREMENTS: Readonly<Record<"copilot" | "codex", readonly VendorRetirement[]>> = {
  copilot: [
    {
      id: "gpt-5.4-mini",
      retires: "2026-10-19",
      url: "https://github.blog/changelog/2026-10-19-github-copilot-models-deprecated-on-october-19-2026",
      accessDate: "2026-10-23",
    },
    {
      id: "claude-opus-5",
      retires: "2026-11-16",
      url: "https://github.blog/changelog/2026-10-15-upcoming-deprecation-of-selected-github-copilot-models-in-mid-november",
      accessDate: "2026-10-23",
    },
    {
      id: "gpt-5.6-terra",
      retires: "2026-11-16",
      url: "https://github.blog/changelog/2026-10-15-upcoming-deprecation-of-selected-github-copilot-models-in-mid-november",
      accessDate: "2026-10-23",
    },
  ],
  codex: [
    { id: "gpt-5.5", retires: "2026-10-14", url: "https://learn.chatgpt.com/docs/changelog", accessDate: "2026-10-23" },
  ],
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
 * The model `tool` runs `modelClass` on, from the shipped priority list, or
 * `undefined` when there is none to give. Pure.
 *
 * With `listed` (the ids the client's CLI printed for this account), the first
 * candidate the list holds wins. With no list, Copilot and Codex take entry 0.
 * Cursor always answers `undefined`, with or without a list (see the module
 * header), so no pick reads a templated Cursor id and the effort level picks
 * nothing: no Copilot or Codex candidate carries {@link EFFORT_TOKEN}. The level
 * stays in the signature for the callers that pass it. Claude Code has no list
 * here: its family aliases live in the ladder's projection.
 */
export function pickModel(
  tool: Tool,
  modelClass: ModelClass,
  _effort: EffortLevel | undefined,
  listed?: readonly string[],
): ModelPick | undefined {
  if (!isListingClient(tool)) return undefined;
  if (tool === "cursor") return undefined;
  const onList = listed === undefined ? undefined : new Set(listed);
  const resolved: { id: string; display?: string }[] = [];
  for (const { id, display } of MODEL_PRIORITY[tool][modelClass]) {
    if (onList !== undefined && !onList.has(id)) continue;
    resolved.push(display === undefined ? { id } : { id, display });
  }
  const [first, ...rest] = resolved;
  if (first === undefined) return undefined;
  return { ...first, fallbacks: rest.map((entry) => entry.id) };
}

/** Where a client's class-to-model map is written, repository-relative. */
export function modelMapPath(tool: Tool): string {
  return `.stamity/generated/models/${tool}.json`;
}
