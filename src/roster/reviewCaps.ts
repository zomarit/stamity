/**
 * Review-loop iteration caps. Zero-import kernel data module.
 *
 * These numbers are lockstepped into generated prompt text: an orchestrator
 * prompt stating a different cap than the engine clamps to is a drift bug, so
 * every emitter and validator reads them from here instead of restating them.
 */

/**
 * Iterations a review loop runs before it must terminate.
 *
 * Calibrated on convergence economics, not on detector reachability: published
 * LLM self-correction results put most of the achievable gain in the first two
 * correction rounds, and this default holds one round of headroom above that
 * so a slow-but-converging change is not cut off. A loop that is diverging
 * rather than converging exits through its own escape conditions well before
 * the cap, so raising this number buys little and costs a full round.
 */
export const DEFAULT_MAX_REVIEW_ITERATIONS: number = 4;

/**
 * Floor. One iteration is a single review pass with no fixer round — a valid
 * opt-down. Zero would mean "never review", which is not a cap but a bypass.
 */
export const MIN_MAX_REVIEW_ITERATIONS: number = 1;

/** Ceiling. No configuration, however authored, buys more rounds than this. */
export const HARD_MAX_REVIEW_ITERATIONS: number = 10;

/**
 * Clamp a requested cap into `[MIN_MAX_REVIEW_ITERATIONS, HARD_MAX_REVIEW_ITERATIONS]`.
 *
 * Always returns an integer in band:
 * - Fractions floor — a cap of `4.9` never grants a 5th round.
 * - `NaN` resolves to the floor. It is unordered, so it cannot be clamped;
 *   treating it as "cap absent or broken" shrinks the loop instead of
 *   propagating a `NaN` that would make every later comparison false and leave
 *   the loop effectively unbounded.
 * - `±Infinity` clamps ordinally (to the ceiling and floor respectively) —
 *   bounding an unbounded request is exactly what the ceiling is for.
 */
export function clampReviewIterations(requested: number): number {
  if (Number.isNaN(requested)) return MIN_MAX_REVIEW_ITERATIONS;
  const whole = Math.floor(requested);
  return Math.min(Math.max(whole, MIN_MAX_REVIEW_ITERATIONS), HARD_MAX_REVIEW_ITERATIONS);
}
