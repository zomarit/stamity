import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — import-safe native ESM contributor helper, outside the product package.
import { usageFromCalls } from "../../scripts/eval/usage.mjs";

// Two synthetic models with distinct rates, so each token kind moves the cost by a different amount.
const prices = {
  "model-a": { inputPerMTok: 4, outputPerMTok: 20, cacheWrite5mPerMTok: 5, cacheWrite1hPerMTok: 8, cacheReadPerMTok: 0.2 },
  "model-b": { inputPerMTok: 10, outputPerMTok: 50, cacheWrite5mPerMTok: 12.5, cacheWrite1hPerMTok: 20, cacheReadPerMTok: 0.25 },
  source: "https://example.invalid/pricing",
  accessDate: "2026-09-30",
};
const usage = (input: number, output: number, write1h: number, write5m: number, read: number) => ({
  input_tokens: input, output_tokens: output, cache_creation_input_tokens: write1h + write5m,
  cache_read_input_tokens: read, service_tier: "standard", speed: "standard", inference_geo: "not_available",
  cache_creation: { ephemeral_1h_input_tokens: write1h, ephemeral_5m_input_tokens: write5m },
});
const attempt = (role: string, model: string | null, used: object | null, costUSD?: number) => ({
  callId: `${role}-${model}`, role,
  native: used === null ? { apiModel: model, usage: null, modelUsage: {} }
    : { apiModel: model, usage: used, modelUsage: model ? { [model]: { costUSD } } : {} },
});
function threeAttempts() {
  return [
    attempt("scenario", "model-a", usage(1000, 2000, 1000, 2000, 4000), 0.07),
    attempt("judge", "model-b", usage(500, 100, 0, 0, 10000), 0.013),
    attempt("judge", "model-b", null),
  ];
}
const zero = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };

describe("usageFromCalls", () => {
  it("sums the two reported attempts, counts the unreported one, and prices each token kind at its own rate", () => {
    const result = usageFromCalls(threeAttempts(), prices);
    expect(result.usage).toEqual({
      source: "calls.json", attempts: 3, notReported: 1,
      byRole: { scenario: { input: 1000, output: 2000, cacheCreation: 3000, cacheRead: 4000 },
        judge: { input: 500, output: 100, cacheCreation: 0, cacheRead: 10000 }, calibration: zero, isolation: zero },
      total: { input: 1500, output: 2100, cacheCreation: 3000, cacheRead: 14000 },
    });
    // scenario: 1000*4 + 2000*20 + 2000*5 (5m writes) + 1000*8 (1h writes) + 4000*0.2 = 62,800 micro-USD
    // judge:     500*10 + 100*50 + 10000*0.25 = 12,500 micro-USD
    expect(result.listCostUsd).toEqual({
      total: 0.0753, byRole: { scenario: 0.0628, judge: 0.0125, calibration: 0, isolation: 0 },
      byModel: { "model-a": 0.0628, "model-b": 0.0125 }, unpriced: [], notListPriced: 0, notReported: 1,
      clientReportedUsd: { total: 0.083, byRole: { scenario: 0.07, judge: 0.013, calibration: 0, isolation: 0 }, attempts: 2 },
      prices: "evals/price-list.json", priceSource: "https://example.invalid/pricing", priceAccessDate: "2026-09-30",
    });
  });

  it("counts an attempt with no usage in listCostUsd.notReported and keeps the total as the reported attempts' sum", () => {
    const reported = usageFromCalls(threeAttempts().slice(0, 2), prices).listCostUsd;
    const cost = usageFromCalls(threeAttempts(), prices).listCostUsd;
    expect(reported.notReported).toBe(0);
    expect(cost.notReported).toBe(1);
    expect(cost.total).toBe(reported.total);
    expect(cost.total).toBe(0.0753);
  });

  it("bills 1-hour cache writes above 5-minute ones rather than folding them into one rate", () => {
    const oneHour = usageFromCalls([attempt("scenario", "model-a", usage(0, 0, 1_000_000, 0, 0))], prices);
    const fiveMinute = usageFromCalls([attempt("scenario", "model-a", usage(0, 0, 0, 1_000_000, 0))], prices);
    expect(oneHour.usage.total).toEqual(fiveMinute.usage.total);
    expect(oneHour.listCostUsd.total).toBe(8);
    expect(fiveMinute.listCostUsd.total).toBe(5);
  });

  it("leaves a model missing from the price list unpriced, never estimated, and withholds every total it touches", () => {
    const calls = [...threeAttempts(), attempt("calibration", "model-z", usage(10, 10, 0, 0, 0), 0.001)];
    const cost = usageFromCalls(calls, prices).listCostUsd;
    expect(cost.unpriced).toEqual(["model-z"]);
    expect(cost.byModel).toEqual({ "model-a": 0.0628, "model-b": 0.0125, "model-z": null });
    expect(cost.byRole).toEqual({ scenario: 0.0628, judge: 0.0125, calibration: null, isolation: 0 });
    expect(cost.total).toBeNull();
    expect(cost.clientReportedUsd.total).toBe(0.084);
  });

  it.each([
    ["a fast-mode attempt", { speed: "fast" }],
    ["a non-standard service tier", { service_tier: "priority" }],
    ["US-only inference", { inference_geo: "us" }],
    ["cache writes with no TTL split", { cache_creation: undefined }],
    ["a TTL split that disagrees with the write total", { cache_creation: { ephemeral_1h_input_tokens: 1, ephemeral_5m_input_tokens: 1 } }],
  ])("counts %s as not list-priced and withholds the total", (_label, patch) => {
    const odd = attempt("isolation", "model-a", { ...usage(10, 10, 0, 7, 0), ...patch });
    const cost = usageFromCalls([...threeAttempts(), odd], prices).listCostUsd;
    expect(cost.notListPriced).toBe(1);
    expect(cost.byRole.isolation).toBeNull();
    expect(cost.total).toBeNull();
    expect(cost.byRole.scenario).toBe(0.0628);
  });

  it("does not attribute an attempt whose usage spans more than one model", () => {
    const mixed = attempt("judge", "model-a", usage(10, 10, 0, 0, 0));
    (mixed.native as { modelUsage: object }).modelUsage = { "model-a": {}, "model-b": {} };
    const cost = usageFromCalls([mixed], prices).listCostUsd;
    expect(cost.notListPriced).toBe(1);
    expect(cost.byModel).toEqual({});
    expect(cost.total).toBeNull();
  });

  it.each([
    ["a non-array calls file", { calls: {} }],
    ["an unknown role", { calls: [attempt("reviewer", "model-a", usage(1, 1, 0, 0, 0))] }],
    ["a price list without a source", { prices: { ...prices, source: "" } }],
    ["a price list without an access date", { prices: { ...prices, accessDate: "yesterday" } }],
    ["a price entry missing a rate", { prices: { ...prices, "model-a": { inputPerMTok: 4 } } }],
  ])("refuses %s", (_label, override: { calls?: unknown; prices?: unknown }) => {
    expect(() => usageFromCalls(override.calls ?? threeAttempts(), override.prices ?? prices)).toThrow();
  });

  it("prices every attempt of the recorded run 24 fixture from the committed price list", () => {
    const calls = JSON.parse(readFileSync("test/evals/fixtures/historical-replay/run-24/calls.json", "utf8"));
    const list = JSON.parse(readFileSync("evals/price-list.json", "utf8"));
    const result = usageFromCalls(calls, list);
    expect(result.usage.attempts).toBe(55);
    expect(result.usage.notReported).toBe(0);
    const sum = (role: string, field: string) => calls.filter((call: { role: string }) => call.role === role)
      .reduce((total: number, call: { native: { usage: Record<string, number> } }) => total + (call.native.usage[field] ?? 0), 0);
    expect(result.usage.byRole.judge.input).toBe(sum("judge", "input_tokens"));
    expect(result.usage.byRole.scenario.cacheRead).toBe(sum("scenario", "cache_read_input_tokens"));
    expect(result.usage.total.output).toBe(sum("judge", "output_tokens") + sum("scenario", "output_tokens"));
    expect(result.usage.total.output).toBeGreaterThan(0);
    const cost = result.listCostUsd;
    expect(cost.unpriced).toEqual([]); expect(cost.notListPriced).toBe(0);
    expect(Object.keys(cost.byModel).toSorted()).toEqual(["claude-fable-5-1", "claude-opus-5"]);
    expect(cost.total).toBeGreaterThan(0);
    expect(cost.total).toBeCloseTo(cost.byRole.judge + cost.byRole.scenario, 6);
    expect(cost.clientReportedUsd.attempts).toBe(55);
    expect(cost.priceAccessDate).toBe(list.accessDate);
  });

  it("keeps a committed price list that names its source, its access date and both cache-write rates", () => {
    const list = JSON.parse(readFileSync("evals/price-list.json", "utf8"));
    expect(list.source).toMatch(/^https:\/\/platform\.claude\.com\//);
    expect(list.accessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const models = Object.keys(list).filter(key => key !== "source" && key !== "accessDate");
    expect(models).toEqual(expect.arrayContaining(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5"]));
    for (const model of models) {
      expect(Object.keys(list[model]).toSorted(), model).toEqual(
        ["cacheReadPerMTok", "cacheWrite1hPerMTok", "cacheWrite5mPerMTok", "inputPerMTok", "outputPerMTok"]);
      expect(list[model].cacheWrite1hPerMTok, model).toBeGreaterThan(list[model].cacheWrite5mPerMTok);
    }
  });
});
