/**
 * The engine's one timeout layer.
 *
 * A single wrapper, applied where work can genuinely hang — adapter emission, a
 * long filesystem batch — instead of nested per-phase and per-pipeline budgets.
 * Layered timeouts sum into a wall time nobody can predict and each layer needs
 * its own cancellation story; one layer means the caller's budget is the budget.
 *
 * Cancellation is cooperative and signal-based: the wrapped call receives an
 * `AbortSignal` whose `reason` is the {@link AdapterTimeoutError} itself, so a
 * loop that checks {@link throwIfSignalAborted} between iterations unwinds with
 * the same error the caller is about to see. Work that ignores the signal is not
 * killed — nothing in-process can kill it — it is abandoned: its settlement is
 * discarded and the timeout is what the caller gets.
 */

// ── Constants ────────────────────────────────────────────────────

/** Default budget: 3 minutes. */
export const DEFAULT_ADAPTER_TIMEOUT_MS = 180_000;

/** Floor: 5 seconds. Below this, a cold filesystem cache alone trips the budget. */
export const MIN_ADAPTER_TIMEOUT_MS = 5_000;

/** Ceiling: 15 minutes. Past this the run is hung, not slow. */
export const MAX_ADAPTER_TIMEOUT_MS = 900_000;

/**
 * Attempt ceiling. The retry loop awaits between attempts, and awaits drain as
 * microtasks — a run of instantly-failing attempts would starve the macrotask
 * queue the deadline timer sits in, so the budget could not fire to stop it.
 * A hard cap keeps that loop bounded independently of the timer.
 */
const MAX_ATTEMPTS = 10;

// ── Types ────────────────────────────────────────────────────────

export interface AdapterTimeoutConfig {
  /** Budget in milliseconds, clamped by {@link clampAdapterTimeout}. */
  timeoutMs?: number;
  /**
   * Total attempts including the first — 1 (the default) means no retry. Every
   * attempt shares the one budget and the one signal; a failure raised after the
   * signal aborted is never retried. Capped at 10.
   *
   * This is an attempt count, not a backoff policy: callers that want spacing or
   * failure classification compose the retry helper around this call, which is
   * possible precisely because a breached budget rejects here rather than
   * resolving to a failure result.
   */
  retryAttempts?: number;
}

export interface TimedGenerationResult<T> {
  result: T;
  /** Wall time to settle, measured on the monotonic clock and rounded to ms. */
  elapsedMs: number;
}

// ── Errors ───────────────────────────────────────────────────────

export class AdapterTimeoutError extends Error {
  /** The label the caller passed — an adapter id, or whatever names the work. */
  readonly adapter: string;
  /** The clamped budget that was breached, in milliseconds. */
  readonly timeoutMs: number;

  constructor(adapter: string, timeoutMs: number) {
    super(
      `"${adapter}" exceeded its ${Math.round(timeoutMs / 1000)}s budget and was aborted. ` +
        `Raise the timeout (max ${MAX_ADAPTER_TIMEOUT_MS / 1000}s) or find out why it stalls.`,
    );
    this.name = "AdapterTimeoutError";
    this.adapter = adapter;
    this.timeoutMs = timeoutMs;
  }
}

// ── Budget ───────────────────────────────────────────────────────

/** Clamp a requested budget into `[MIN, MAX]`. `NaN` is not a budget: it yields the default. */
export function clampAdapterTimeout(timeoutMs: number): number {
  // Math.min/max propagate NaN, and setTimeout treats a NaN delay as 0 — the
  // work would be aborted before it started.
  if (Number.isNaN(timeoutMs)) return DEFAULT_ADAPTER_TIMEOUT_MS;
  return Math.max(MIN_ADAPTER_TIMEOUT_MS, Math.min(timeoutMs, MAX_ADAPTER_TIMEOUT_MS));
}

// ── Run ──────────────────────────────────────────────────────────

/**
 * Run `fn` under a budget. Resolves with its value and the elapsed wall time;
 * rejects with {@link AdapterTimeoutError} — naming `adapter` — once the budget
 * is spent, after aborting the signal handed to `fn`.
 *
 * A value or a rejection produced by `fn` after the budget expired is dropped:
 * the race is already settled, and the late rejection stays handled, so it never
 * surfaces as an unhandled rejection.
 */
export async function generateWithTimeout<T>(
  adapter: string,
  fn: (signal: AbortSignal) => Promise<T>,
  config?: AdapterTimeoutConfig,
): Promise<TimedGenerationResult<T>> {
  const timeoutMs = clampAdapterTimeout(config?.timeoutMs ?? DEFAULT_ADAPTER_TIMEOUT_MS);
  const attempts = clampAttempts(config?.retryAttempts);
  const controller = new AbortController();
  const startedAt = performance.now();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const timeout = new AdapterTimeoutError(adapter, timeoutMs);
      // Abort before rejecting: cooperative work sees the same error as its
      // abort reason and unwinds on its own next check.
      controller.abort(timeout);
      reject(timeout);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([runAttempts(fn, controller.signal, attempts), deadline]);
    return { result, elapsedMs: Math.round(performance.now() - startedAt) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Throw if `signal` is aborted — the check cooperative work runs between
 * iterations. An `Error` reason is rethrown as-is, so the abort surfaces as
 * whatever cancelled it; any other reason (a string, a plain object, or a
 * platform value that is not an `Error` in this runtime) is wrapped in an
 * `Error` named `AbortError`, so every caller can rely on both
 * `err instanceof Error` and `err.name === "AbortError"`.
 */
export function throwIfSignalAborted(signal: AbortSignal | undefined): void {
  if (signal === undefined || !signal.aborted) return;

  const reason: unknown = signal.reason;
  if (reason instanceof Error) throw reason;

  const error = new Error(
    typeof reason === "string" && reason !== "" ? reason : "The operation was aborted.",
  );
  error.name = "AbortError";
  throw error;
}

// ── Internals ────────────────────────────────────────────────────

/**
 * One attempt per level, `remaining` bounded by {@link MAX_ATTEMPTS} — recursion
 * rather than an await-in-loop, so the last failure propagates as itself instead
 * of being carried in a mutable slot.
 */
async function runAttempts<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  remaining: number,
): Promise<T> {
  try {
    return await fn(signal);
  } catch (error) {
    // Once the budget aborted the signal, the outcome is settled: another
    // attempt would run past the budget against an already-cancelled signal.
    if (remaining <= 1 || signal.aborted) throw error;
    return await runAttempts(fn, signal, remaining - 1);
  }
}

/**
 * Clamp to `[1, MAX_ATTEMPTS]`, mirroring {@link clampAdapterTimeout}: an
 * unbounded request lands on the ceiling, and only `NaN` — which is not a count —
 * falls back to the default of one attempt.
 */
function clampAttempts(retryAttempts: number | undefined): number {
  if (retryAttempts === undefined || Number.isNaN(retryAttempts)) return 1;
  return Math.min(MAX_ATTEMPTS, Math.max(1, Math.trunc(retryAttempts)));
}
