import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdapterTimeoutError,
  clampAdapterTimeout,
  DEFAULT_ADAPTER_TIMEOUT_MS,
  generateWithTimeout,
  MAX_ADAPTER_TIMEOUT_MS,
  MIN_ADAPTER_TIMEOUT_MS,
  throwIfSignalAborted,
} from "../../src/resilience/adapterTimeout.ts";

/** Captured before any fake-timer install, so a real macrotask is still reachable. */
const realSetTimeout = globalThis.setTimeout;

/** Yields to the real event loop — where Node decides a rejection went unhandled. */
function flushMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    realSetTimeout(resolve, 0);
  });
}

/** Never settles on its own; only the budget can end it. */
function hang(): Promise<never> {
  return new Promise<never>(() => {});
}

/** Settles the pending promise into a value we can assert on, keeping it handled. */
function settled<T>(pending: Promise<T>): Promise<T | unknown> {
  return pending.catch((error: unknown) => error);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("constants", () => {
  it("pins the budget band", () => {
    expect(DEFAULT_ADAPTER_TIMEOUT_MS).toBe(180_000);
    expect(MIN_ADAPTER_TIMEOUT_MS).toBe(5_000);
    expect(MAX_ADAPTER_TIMEOUT_MS).toBe(900_000);
  });
});

describe("clampAdapterTimeout", () => {
  it.each([
    { input: 0, expected: MIN_ADAPTER_TIMEOUT_MS, why: "zero is not a budget" },
    { input: -1, expected: MIN_ADAPTER_TIMEOUT_MS, why: "negative is not a budget" },
    { input: 4_999, expected: MIN_ADAPTER_TIMEOUT_MS, why: "just under the floor" },
    { input: 60_000, expected: 60_000, why: "inside the band, untouched" },
    { input: 900_001, expected: MAX_ADAPTER_TIMEOUT_MS, why: "just over the ceiling" },
    {
      input: Number.POSITIVE_INFINITY,
      expected: MAX_ADAPTER_TIMEOUT_MS,
      why: "no budget means the ceiling",
    },
  ])("clamps $input -> $expected ($why)", ({ input, expected }) => {
    expect(clampAdapterTimeout(input)).toBe(expected);
  });

  it("treats NaN as unset instead of propagating it into setTimeout", () => {
    // Math.min/max propagate NaN, and a NaN delay fires immediately — the work
    // would be aborted before it ran.
    expect(clampAdapterTimeout(Number.NaN)).toBe(DEFAULT_ADAPTER_TIMEOUT_MS);
  });
});

describe("generateWithTimeout", () => {
  it("resolves with the value and the elapsed wall time", async () => {
    const seen: boolean[] = [];

    const { result, elapsedMs } = await generateWithTimeout("cursor", async (signal) => {
      seen.push(signal.aborted);
      return ["AGENTS.md", ".cursor/rules/10-security.mdc"];
    });

    expect(result).toEqual(["AGENTS.md", ".cursor/rules/10-security.mdc"]);
    expect(seen).toEqual([false]);
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
    expect(elapsedMs).toBeLessThan(1_000);
  });

  it("propagates a failure raised inside the budget unchanged", async () => {
    const failure = new Error("adapter blew up");
    await expect(
      generateWithTimeout("copilot", () => Promise.reject(failure)),
    ).rejects.toBe(failure);
  });

  it("aborts the signal at the budget and rejects, naming the adapter", async () => {
    vi.useFakeTimers();
    let captured: AbortSignal | undefined;

    const pending = settled(
      generateWithTimeout(
        "cursor",
        (signal) => {
          captured = signal;
          return hang();
        },
        { timeoutMs: MIN_ADAPTER_TIMEOUT_MS },
      ),
    );

    await vi.advanceTimersByTimeAsync(MIN_ADAPTER_TIMEOUT_MS);
    const error = await pending;

    expect(error).toBeInstanceOf(AdapterTimeoutError);
    const timeout = error as AdapterTimeoutError;
    expect(timeout.adapter).toBe("cursor");
    expect(timeout.timeoutMs).toBe(MIN_ADAPTER_TIMEOUT_MS);
    expect(timeout.message).toContain("cursor");
    expect(timeout.name).toBe("AdapterTimeoutError");

    expect(captured?.aborted).toBe(true);
    expect(captured?.reason).toBe(timeout);
  });

  it("lets cooperative work unwind on the same error the caller receives", async () => {
    vi.useFakeTimers();

    const pending = settled(
      generateWithTimeout(
        "batch",
        async (signal) => {
          await new Promise((resolve) => {
            signal.addEventListener("abort", resolve, { once: true });
          });
          throwIfSignalAborted(signal);
          return "never reached";
        },
        { timeoutMs: MIN_ADAPTER_TIMEOUT_MS },
      ),
    );

    await vi.advanceTimersByTimeAsync(MIN_ADAPTER_TIMEOUT_MS);
    const error = await pending;

    expect(error).toBeInstanceOf(AdapterTimeoutError);
    expect((error as AdapterTimeoutError).adapter).toBe("batch");
  });

  it("clamps the requested budget before arming it", async () => {
    vi.useFakeTimers();
    const pending = settled(generateWithTimeout("cursor", hang, { timeoutMs: 1 }));

    await vi.advanceTimersByTimeAsync(MIN_ADAPTER_TIMEOUT_MS);

    expect((await pending as AdapterTimeoutError).timeoutMs).toBe(MIN_ADAPTER_TIMEOUT_MS);
  });

  it("falls back to the default budget when none is given", async () => {
    vi.useFakeTimers();
    const pending = settled(generateWithTimeout("cursor", hang));

    await vi.advanceTimersByTimeAsync(DEFAULT_ADAPTER_TIMEOUT_MS - 1);
    await expect(Promise.race([pending, Promise.resolve("still running")])).resolves.toBe(
      "still running",
    );

    await vi.advanceTimersByTimeAsync(1);
    expect((await pending as AdapterTimeoutError).timeoutMs).toBe(DEFAULT_ADAPTER_TIMEOUT_MS);
  });

  it("discards work that settles after the budget, with no unhandled rejection", async () => {
    vi.useFakeTimers();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const lateValue = settled(
        generateWithTimeout(
          "slow",
          () =>
            new Promise<string>((resolve) => {
              setTimeout(() => {
                resolve("too late");
              }, 10_000);
            }),
          { timeoutMs: MIN_ADAPTER_TIMEOUT_MS },
        ),
      );

      const lateFailure = settled(
        generateWithTimeout(
          "slower",
          () =>
            new Promise<string>((_resolve, reject) => {
              setTimeout(() => {
                reject(new Error("failed after the budget"));
              }, 10_000);
            }),
          { timeoutMs: MIN_ADAPTER_TIMEOUT_MS },
        ),
      );

      await vi.advanceTimersByTimeAsync(MIN_ADAPTER_TIMEOUT_MS);
      expect(await lateValue).toBeInstanceOf(AdapterTimeoutError);
      expect(await lateFailure).toBeInstanceOf(AdapterTimeoutError);

      // Let both late settlements land, then give the real loop a tick.
      await vi.advanceTimersByTimeAsync(10_000);
      await flushMacrotask();

      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("clears the budget timer once the work settles", async () => {
    vi.useFakeTimers();

    await generateWithTimeout("cursor", async () => "done");
    await expect(generateWithTimeout("cursor", () => Promise.reject(new Error("x")))).rejects.toThrow(
      "x",
    );

    // A leaked deadline timer would keep the process alive after the command ends.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("makes a single attempt by default", async () => {
    let calls = 0;

    await expect(
      generateWithTimeout("flaky", async () => {
        calls += 1;
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
    expect(calls).toBe(1);
  });

  it("re-invokes the work up to the attempt count", async () => {
    let calls = 0;

    const { result } = await generateWithTimeout(
      "flaky",
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("transient");
        return "recovered";
      },
      { retryAttempts: 3 },
    );

    expect(result).toBe("recovered");
    expect(calls).toBe(3);
  });

  it("reports the last failure when every attempt fails", async () => {
    let calls = 0;

    await expect(
      generateWithTimeout(
        "flaky",
        async () => {
          calls += 1;
          throw new Error(`attempt ${calls}`);
        },
        { retryAttempts: 2 },
      ),
    ).rejects.toThrow("attempt 2");
    expect(calls).toBe(2);
  });

  it("stops retrying once the budget aborted the signal", async () => {
    vi.useFakeTimers();
    let calls = 0;

    const pending = settled(
      generateWithTimeout(
        "flaky",
        (signal) =>
          new Promise<never>((_resolve, reject) => {
            calls += 1;
            signal.addEventListener(
              "abort",
              () => {
                reject(signal.reason as Error);
              },
              { once: true },
            );
          }),
        { timeoutMs: MIN_ADAPTER_TIMEOUT_MS, retryAttempts: 5 },
      ),
    );

    await vi.advanceTimersByTimeAsync(MIN_ADAPTER_TIMEOUT_MS);

    expect(await pending).toBeInstanceOf(AdapterTimeoutError);
    expect(calls).toBe(1);
  });

  it.each([
    { retryAttempts: 1_000, expected: 10, why: "capped so a fast-failing loop cannot starve the budget timer" },
    { retryAttempts: Number.POSITIVE_INFINITY, expected: 10, why: "unbounded lands on the ceiling, as with the budget" },
    { retryAttempts: Number.NaN, expected: 1, why: "not a count — falls back to a single attempt" },
    { retryAttempts: 0, expected: 1, why: "an attempt count below one still runs the work once" },
    { retryAttempts: -5, expected: 1, why: "negative is not a count" },
    { retryAttempts: 2.7, expected: 2, why: "truncated, never rounded up past the request" },
  ])("runs $expected attempt(s) for retryAttempts=$retryAttempts ($why)", async ({ retryAttempts, expected }) => {
    let calls = 0;

    await expect(
      generateWithTimeout(
        "flaky",
        async () => {
          calls += 1;
          throw new Error("always");
        },
        { retryAttempts },
      ),
    ).rejects.toThrow("always");
    expect(calls).toBe(expected);
  });
});

describe("throwIfSignalAborted", () => {
  it("does nothing without a signal, or with a live one", () => {
    expect(() => {
      throwIfSignalAborted(undefined);
    }).not.toThrow();
    expect(() => {
      throwIfSignalAborted(new AbortController().signal);
    }).not.toThrow();
  });

  it("wraps a string reason in an Error named AbortError", () => {
    const controller = new AbortController();
    controller.abort("budget spent");

    let thrown: unknown;
    try {
      throwIfSignalAborted(controller.signal);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).name).toBe("AbortError");
    expect((thrown as Error).message).toBe("budget spent");
  });

  it.each([
    { label: "an empty string", reason: "" },
    { label: "a plain object", reason: { code: 1 } },
    { label: "a value String() cannot convert", reason: Object.create(null) as object },
  ])("wraps $label with a default message", ({ reason }) => {
    const controller = new AbortController();
    controller.abort(reason);

    let thrown: unknown;
    try {
      throwIfSignalAborted(controller.signal);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).name).toBe("AbortError");
    expect((thrown as Error).message).toBe("The operation was aborted.");
  });

  it("rethrows an Error reason unchanged, so the cause survives the hop", () => {
    const reason = new AdapterTimeoutError("cursor", MIN_ADAPTER_TIMEOUT_MS);
    const controller = new AbortController();
    controller.abort(reason);

    expect(() => {
      throwIfSignalAborted(controller.signal);
    }).toThrow(reason);
  });

  it("throws an Error named AbortError for a bare abort()", () => {
    const controller = new AbortController();
    controller.abort();

    let thrown: unknown;
    try {
      throwIfSignalAborted(controller.signal);
    } catch (error) {
      thrown = error;
    }

    // The platform reason is a DOMException; whether that counts as an Error is
    // runtime-dependent, so the contract is asserted, not the platform's class.
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).name).toBe("AbortError");
  });
});
