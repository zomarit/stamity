/**
 * Token-estimate kernel.
 *
 * A character-count heuristic, not a tokenizer: it exists so size decisions
 * (context budgets, "is this payload worth compacting") can be made without
 * pulling a model-specific tokenizer into the engine. Callers that need exact
 * counts must ask the model provider.
 */

/**
 * Average characters per token. English prose runs ~4 chars/token and code
 * ~3.5, so 4 under-counts code slightly — deliberate: an estimate that reads
 * low on code makes a budget check optimistic, so budgets are set with headroom
 * rather than tuned per language here.
 */
export const CHARS_PER_TOKEN = 4;

/**
 * Estimated token count for `text`, rounded up. Absent and empty input are 0.
 *
 * Length is measured in UTF-16 code units (`String.length`), which over-counts
 * astral characters by 2x against a code-point count. That direction is safe
 * for a budget check.
 */
export function estimateTokens(text: string | undefined): number {
  if (text === undefined || text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
