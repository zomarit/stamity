import { setTimeout as sleepFor } from "node:timers/promises";
import { classifyFailure } from "./failureClass.ts";

/** Attempts, inclusive of the first call. */
export const DEFAULT_MAX_ATTEMPTS = 3;

/** Delay before the first retry, in milliseconds. */
export const DEFAULT_INITIAL_DELAY_MS = 200;

/** Ceiling for any single delay, in milliseconds. */
export const DEFAULT_MAX_DELAY_MS = 5_000;

/** Multiplier applied to the delay between attempts. */
export const DEFAULT_BACKOFF_FACTOR = 2;

/**
 * Hard ceiling on attempts. A misconfigured caller can lengthen a retry loop but
 * cannot turn it into an unbounded one.
 */
const MAX_ATTEMPTS_CEILING = 20;

export interface RetryOptions {
  /** Attempts including the first call. Clamped to [1, 20]. Default: 3. */
  maxAttempts?: number;
  /** Delay before the first retry. Default: 200. */
  initialDelayMs?: number;
  /** Ceiling for any single delay. Default: 5000. */
  maxDelayMs?: number;
  /** Growth multiplier per attempt. Values below 1 are raised to 1. Default: 2. */
  backoffFactor?: number;
  /** Randomise each delay across `[0, computed]`. Default: true. */
  jitter?: boolean;
  /** Decides whether an error earns another attempt. Default: {@link defaultShouldRetry}. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Observer called once per retry, after the delay is computed and before it elapses. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  /** Delay implementation. Injected by tests so a schedule is asserted, not waited out. */
  sleep?: (ms: number) => Promise<void>;
  /** Source of `[0, 1)` for jitter. Injected by tests for an exact schedule. */
  random?: () => number;
}

const realSleep = (ms: number): Promise<void> => sleepFor(ms);

/** A finite, non-negative number, or the fallback. */
function nonNegativeOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Attempts as a whole number in `[1, MAX_ATTEMPTS_CEILING]`. */
function resolveMaxAttempts(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MAX_ATTEMPTS;
  return Math.min(MAX_ATTEMPTS_CEILING, Math.max(1, Math.trunc(value)));
}

/**
 * The default retry predicate: only failures classified `transient` earn another
 * attempt. `substantive` and `unknown` both stop the loop — an unrecognised
 * failure is not evidence that a second call would go differently.
 */
export function defaultShouldRetry(err: unknown, _attempt: number): boolean {
  return classifyFailure(err) === "transient";
}

/**
 * Un-jittered delay for a 1-based attempt index:
 * `min(initialDelayMs * backoffFactor^(attempt - 1), maxDelayMs)`.
 *
 * `maxDelayMs` is a hard ceiling applied to every attempt including the first,
 * so a ceiling below `initialDelayMs` flattens the schedule to the ceiling
 * rather than silently raising it.
 */
export function computeBackoffDelay(attempt: number, opts: RetryOptions = {}): number {
  const initialDelayMs = nonNegativeOr(opts.initialDelayMs, DEFAULT_INITIAL_DELAY_MS);
  const maxDelayMs = nonNegativeOr(opts.maxDelayMs, DEFAULT_MAX_DELAY_MS);
  const backoffFactor = Math.max(1, nonNegativeOr(opts.backoffFactor, DEFAULT_BACKOFF_FACTOR));

  const exponent = Number.isFinite(attempt) ? Math.max(0, Math.trunc(attempt) - 1) : 0;
  const raw = initialDelayMs * backoffFactor ** exponent;

  return Math.min(maxDelayMs, Math.round(raw));
}

/**
 * Spread a computed delay uniformly across `[0, delayMs]` — full jitter, which
 * decorrelates concurrent retriers instead of having them all wake together and
 * re-collide on the resource that failed them.
 *
 * A `random` that returns a value outside `[0, 1)` is clamped, so an injected
 * source can never push a delay past the schedule's ceiling.
 */
export function applyJitter(delayMs: number, random: () => number = Math.random): number {
  if (!(delayMs > 0)) return 0;
  const draw = random();
  const fraction = Number.isFinite(draw) ? Math.min(1, Math.max(0, draw)) : 1;
  return Math.round(fraction * delayMs);
}

/**
 * Call `fn` until it resolves, retrying transient failures with jittered
 * exponential backoff. `fn` receives the 1-based attempt number.
 *
 * The loop stops on the first failure the predicate rejects and after
 * `maxAttempts`; either way the last error propagates unchanged, so the caller
 * sees the real failure rather than a retry wrapper. `sleep` is called exactly
 * once per retry — never on the terminal attempt.
 */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = resolveMaxAttempts(opts.maxAttempts);
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;
  const sleep = opts.sleep ?? realSleep;
  const random = opts.random ?? Math.random;
  const jitter = opts.jitter ?? true;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- an attempt exists only because the previous one failed; there is nothing to parallelise
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;

      let retryable: boolean;
      try {
        retryable = shouldRetry(error, attempt);
      } catch {
        // A predicate that throws has proven nothing about the failure. Stop, and
        // let the original error surface — it describes what actually went wrong.
        retryable = false;
      }
      if (!retryable) break;

      const base = computeBackoffDelay(attempt, opts);
      const delayMs = jitter ? applyJitter(base, random) : base;
      opts.onRetry?.(error, attempt, delayMs);
      // oxlint-disable-next-line no-await-in-loop -- the backoff has to elapse before the next attempt
      await sleep(delayMs);
    }
  }

  throw lastError;
}
