import { describe, expect, it, vi } from "vitest";
import {
  applyJitter,
  computeBackoffDelay,
  DEFAULT_BACKOFF_FACTOR,
  DEFAULT_INITIAL_DELAY_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_DELAY_MS,
  defaultShouldRetry,
  retryWithBackoff,
} from "../../src/resilience/retry.ts";
import { EngineError } from "../../src/types/errors.ts";

/** A transient failure: the connectivity shape the default predicate retries. */
function transientError(message = "socket hang up"): Error {
  return Object.assign(new Error(message), { code: "ECONNRESET" });
}

/** Records every delay the loop asks for, without paying it. */
function sleepRecorder(): { calls: number[]; sleep: (ms: number) => Promise<void> } {
  const calls: number[] = [];
  return {
    calls,
    sleep: async (ms: number) => {
      calls.push(ms);
    },
  };
}

describe("defaults", () => {
  it("pins the documented schedule constants", () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(3);
    expect(DEFAULT_INITIAL_DELAY_MS).toBe(200);
    expect(DEFAULT_MAX_DELAY_MS).toBe(5_000);
    expect(DEFAULT_BACKOFF_FACTOR).toBe(2);
  });
});

describe("computeBackoffDelay", () => {
  it("grows by the factor and stops at the ceiling", () => {
    const schedule = [1, 2, 3, 4, 5, 6].map((attempt) => computeBackoffDelay(attempt));
    expect(schedule).toEqual([200, 400, 800, 1_600, 3_200, 5_000]);
  });

  it("honours custom initial delay, factor, and ceiling", () => {
    const opts = { initialDelayMs: 50, backoffFactor: 3, maxDelayMs: 500 };
    const schedule = [1, 2, 3, 4].map((attempt) => computeBackoffDelay(attempt, opts));
    expect(schedule).toEqual([50, 150, 450, 500]);
  });

  it("treats the ceiling as a hard cap, even below the initial delay", () => {
    expect(computeBackoffDelay(1, { initialDelayMs: 1_000, maxDelayMs: 250 })).toBe(250);
  });

  it("clamps attempt indices at or below one to the initial delay", () => {
    expect(computeBackoffDelay(1)).toBe(DEFAULT_INITIAL_DELAY_MS);
    expect(computeBackoffDelay(0)).toBe(DEFAULT_INITIAL_DELAY_MS);
    expect(computeBackoffDelay(-5)).toBe(DEFAULT_INITIAL_DELAY_MS);
    expect(computeBackoffDelay(Number.NaN)).toBe(DEFAULT_INITIAL_DELAY_MS);
  });

  it("raises a shrinking factor to a flat schedule", () => {
    const opts = { backoffFactor: 0.5 };
    expect([1, 2, 3].map((attempt) => computeBackoffDelay(attempt, opts))).toEqual([200, 200, 200]);
  });

  it("falls back to the defaults for non-finite options", () => {
    const opts = {
      initialDelayMs: Number.NaN,
      maxDelayMs: Number.POSITIVE_INFINITY,
      backoffFactor: Number.NaN,
    };
    expect(computeBackoffDelay(2, opts)).toBe(400);
  });
});

describe("applyJitter", () => {
  it("spreads the delay by the injected draw", () => {
    expect(applyJitter(1_000, () => 0.5)).toBe(500);
    expect(applyJitter(1_000, () => 0)).toBe(0);
    expect(applyJitter(1_000, () => 0.25)).toBe(250);
  });

  it("returns zero for a non-positive delay", () => {
    expect(applyJitter(0, () => 0.9)).toBe(0);
    expect(applyJitter(-10, () => 0.9)).toBe(0);
    expect(applyJitter(Number.NaN, () => 0.9)).toBe(0);
  });

  it("clamps a draw outside [0, 1) so a delay never exceeds its schedule", () => {
    expect(applyJitter(100, () => 5)).toBe(100);
    expect(applyJitter(100, () => -1)).toBe(0);
    expect(applyJitter(100, () => Number.NaN)).toBe(100);
  });

  it("stays inside the window with the default random source", () => {
    for (let i = 0; i < 100; i += 1) {
      const delay = applyJitter(750);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(750);
    }
  });
});

describe("defaultShouldRetry", () => {
  it("retries transient failures only", () => {
    expect(defaultShouldRetry(transientError(), 1)).toBe(true);
    expect(defaultShouldRetry(new EngineError("bad", { code: "VALIDATION_ERROR" }), 1)).toBe(false);
    expect(defaultShouldRetry("boom", 1)).toBe(false);
  });
});

describe("retryWithBackoff — schedule", () => {
  it("sleeps the jittered schedule exactly", async () => {
    const { calls, sleep } = sleepRecorder();

    await expect(
      retryWithBackoff(async () => Promise.reject(transientError()), {
        maxAttempts: 5,
        sleep,
        random: () => 0.5,
      }),
    ).rejects.toThrow("socket hang up");

    // Half of min(200 * 2^n, 5000) — the injected draw makes full jitter exact.
    expect(calls).toEqual([100, 200, 400, 800]);
  });

  it("sleeps the un-jittered schedule when jitter is off, capped at the ceiling", async () => {
    const { calls, sleep } = sleepRecorder();

    await expect(
      retryWithBackoff(async () => Promise.reject(transientError()), {
        maxAttempts: 5,
        initialDelayMs: 1_000,
        maxDelayMs: 2_500,
        jitter: false,
        sleep,
      }),
    ).rejects.toThrow();

    expect(calls).toEqual([1_000, 2_000, 2_500, 2_500]);
  });

  it("interleaves attempts and delays, passing the 1-based attempt to fn", async () => {
    const events: string[] = [];

    await expect(
      retryWithBackoff(
        async (attempt) => {
          events.push(`fn:${attempt}`);
          throw transientError();
        },
        {
          initialDelayMs: 10,
          jitter: false,
          sleep: async (ms) => {
            events.push(`sleep:${ms}`);
          },
        },
      ),
    ).rejects.toThrow();

    expect(events).toEqual(["fn:1", "sleep:10", "fn:2", "sleep:20", "fn:3"]);
  });

  it("uses a real timer when no sleep is injected", async () => {
    const fn = vi.fn(async (attempt: number) => {
      if (attempt === 1) throw transientError();
      return "recovered";
    });

    await expect(
      retryWithBackoff(fn, { initialDelayMs: 1, jitter: false }),
    ).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("retryWithBackoff — outcomes", () => {
  it("returns the value from a later attempt and reports one retry", async () => {
    const onRetry = vi.fn();
    const failure = transientError();
    const fn = vi.fn(async (attempt: number) => {
      if (attempt === 1) throw failure;
      return { attempt };
    });

    await expect(
      retryWithBackoff(fn, { sleep: async () => {}, random: () => 0.5, onRetry }),
    ).resolves.toEqual({ attempt: 2 });

    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(failure, 1, 100);
  });

  it("rethrows the last error unchanged once attempts are exhausted", async () => {
    const failures = [transientError("first"), transientError("second"), transientError("third")];
    const fn = vi.fn(async (attempt: number) => {
      throw failures[attempt - 1];
    });

    await expect(retryWithBackoff(fn, { sleep: async () => {} })).rejects.toBe(failures[2]);
    expect(fn).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
  });

  it("does not retry a substantive engine error", async () => {
    const { calls, sleep } = sleepRecorder();
    const failure = new EngineError("frontmatter is missing an id", { code: "VALIDATION_ERROR" });
    const fn = vi.fn(async () => Promise.reject(failure));

    await expect(retryWithBackoff(fn, { sleep })).rejects.toBe(failure);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it("does not retry a cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const { calls, sleep } = sleepRecorder();
    const fn = vi.fn(async () => Promise.reject(controller.signal.reason));

    await expect(retryWithBackoff(fn, { sleep })).rejects.toBe(controller.signal.reason);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it("does not retry an unclassifiable throw and propagates it as-is", async () => {
    const thrown: unknown = "boom";
    const fn = vi.fn(async () => {
      throw thrown;
    });

    await expect(retryWithBackoff(fn, { sleep: async () => {} })).rejects.toBe("boom");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("retryWithBackoff — predicate", () => {
  it("passes the error and attempt number to a custom predicate", async () => {
    const shouldRetry = vi.fn(() => true);
    const failure = new EngineError("settled", { code: "VALIDATION_ERROR" });

    await expect(
      retryWithBackoff(async () => Promise.reject(failure), {
        maxAttempts: 3,
        shouldRetry,
        sleep: async () => {},
      }),
    ).rejects.toBe(failure);

    expect(shouldRetry).toHaveBeenCalledTimes(2);
    expect(shouldRetry).toHaveBeenNthCalledWith(1, failure, 1);
    expect(shouldRetry).toHaveBeenNthCalledWith(2, failure, 2);
  });

  it("stops on a predicate that throws and rethrows the original error", async () => {
    const { calls, sleep } = sleepRecorder();
    const failure = transientError();
    const fn = vi.fn(async () => Promise.reject(failure));

    await expect(
      retryWithBackoff(fn, {
        sleep,
        shouldRetry: () => {
          throw new Error("predicate blew up");
        },
      }),
    ).rejects.toBe(failure);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });
});

describe("retryWithBackoff — attempt bounds", () => {
  it("runs fn once and never sleeps when maxAttempts is 1", async () => {
    const { calls, sleep } = sleepRecorder();
    const fn = vi.fn(async () => Promise.reject(transientError()));

    await expect(retryWithBackoff(fn, { maxAttempts: 1, sleep })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it("raises a zero or negative maxAttempts to a single attempt", async () => {
    const fn = vi.fn(async () => Promise.reject(transientError()));

    await expect(retryWithBackoff(fn, { maxAttempts: 0, sleep: async () => {} })).rejects.toThrow();
    await expect(retryWithBackoff(fn, { maxAttempts: -3, sleep: async () => {} })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("caps an unbounded maxAttempts at the ceiling", async () => {
    const fn = vi.fn(async () => Promise.reject(transientError()));

    await expect(
      retryWithBackoff(fn, { maxAttempts: 1_000_000, sleep: async () => {} }),
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(20);
  });

  it("falls back to the default attempt count for a non-finite maxAttempts", async () => {
    const fn = vi.fn(async () => Promise.reject(transientError()));

    await expect(
      retryWithBackoff(fn, { maxAttempts: Number.NaN, sleep: async () => {} }),
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
  });
});
