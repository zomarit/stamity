/**
 * The small price table `stamity run metrics` turns a transcript's token counts into dollars with (REQ-FLOW-183).
 *
 * Bundled, so it ages: {@link PRICES_ACCESS_DATE} prints beside every cost, and a model not in the table reads cost
 * `unreported` rather than a guess (plan 024 file 3, Risks). Prices are US dollars per million tokens at Anthropic's
 * first-party standard rates. Cache writes are the published multiples of the input price: 1.25x for the 5-minute
 * duration and 2x for the 1-hour one. Haiku 5.5 is left out on purpose: its price steps up above a 100K-token prompt,
 * which a per-message total cannot tell apart, so it reads `unreported`.
 *
 * Pure data and one lookup; nothing here touches the filesystem.
 */

/** One model's rates, US dollars per million tokens. */
export interface ModelPrice {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite5m: number;
  readonly cacheWrite1h: number;
}

/** The day the table's rates were read, UTC; printed beside every cost. */
export const PRICES_ACCESS_DATE = "2026-11-09";

/** Where the rates come from, printed beside every cost. */
export const PRICES_SOURCE = "Anthropic first-party standard rates, bundled table";

const rates = (input: number, output: number, cacheRead: number): ModelPrice => ({
  input,
  output,
  cacheRead,
  cacheWrite5m: input * 1.25,
  cacheWrite1h: input * 2,
});

/** The bundled table, by the model id a transcript's `message.model` carries. */
const PRICE_TABLE: Readonly<Record<string, ModelPrice>> = {
  "claude-opus-5-5": rates(4, 20, 0.2),
  "claude-fable-5-1": rates(10, 50, 0.25),
  "claude-sonnet-5-5": rates(2, 10, 0.2),
};

/** A model's rates, or null when the table does not hold it. */
export function priceFor(model: string): ModelPrice | null {
  return Object.hasOwn(PRICE_TABLE, model) ? (PRICE_TABLE[model] ?? null) : null;
}
