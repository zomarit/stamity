import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCodexModels, parseCopilotHelpConfig, parseCursorModels } from "../../src/cli/engine/clientModels.ts";
import {
  EFFORT_TOKEN,
  MODEL_PRIORITY,
  MODEL_PRIORITY_CITATION,
  modelMapPath,
  pickModel,
  type ListingClient,
} from "../../src/roster/modelDefaults.ts";
import { EFFORT_LEVELS, MODEL_CLASSES, TOOLS } from "../../src/types/core.ts";

/**
 * The shipped priority list and the pick over an account's list (REQ-LADDER-006).
 *
 * The account lists come from the dated captures in `test/fixtures/client-models/`, parsed by the
 * lister's own parsers, so the list and the pick are held against what each client really printed
 * on the day the rows were read rather than against a list written to agree with them.
 */

const LISTING_CLIENTS: readonly ListingClient[] = ["cursor", "copilot", "codex"];

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/client-models/${name}`, import.meta.url), "utf8");
}

function captured(client: ListingClient): string[] {
  const ids =
    client === "cursor"
      ? parseCursorModels(fixture("cursor-agent-models-2026-10-14.txt"))
      : client === "codex"
        ? parseCodexModels(fixture("codex-debug-models-2026-10-14.json"))
        : parseCopilotHelpConfig(fixture("copilot-help-config-2026-10-14.txt"));
  if (ids === null) throw new Error(`the ${client} capture no longer parses`);
  return ids;
}

describe("MODEL_PRIORITY", () => {
  it("gives every listing client a non-empty order for every class, and Claude Code none", () => {
    expect(Object.keys(MODEL_PRIORITY).toSorted()).toEqual([...LISTING_CLIENTS].toSorted());
    for (const client of LISTING_CLIENTS) {
      for (const modelClass of MODEL_CLASSES) {
        expect(MODEL_PRIORITY[client][modelClass].length, `${client}/${modelClass}`).toBeGreaterThan(0);
      }
    }
    expect(pickModel("claude", "standard", "medium")).toBeUndefined();
    expect(pickModel("claude", "standard", "medium", ["sonnet"])).toBeUndefined();
  });

  it("carries the effort token on Cursor only, where the client lists one id per effort variant", () => {
    for (const client of LISTING_CLIENTS) {
      for (const modelClass of MODEL_CLASSES) {
        for (const candidate of MODEL_PRIORITY[client][modelClass]) {
          expect(candidate.id.includes(EFFORT_TOKEN), `${client}/${candidate.id}`).toBe(client === "cursor");
        }
      }
    }
  });

  it("names only ids the client's own CLI listed on the access date", () => {
    for (const client of LISTING_CLIENTS) {
      const listed = new Set(captured(client));
      for (const modelClass of MODEL_CLASSES) {
        for (const candidate of MODEL_PRIORITY[client][modelClass]) {
          const variants = EFFORT_LEVELS.map((level) => candidate.id.replace(EFFORT_TOKEN, level));
          expect(
            variants.some((id) => listed.has(id)),
            `${client}/${modelClass}: ${candidate.id} is on no captured list`,
          ).toBe(true);
        }
      }
    }
  });

  it("puts a display name on every Copilot candidate and on no other client's", () => {
    for (const client of LISTING_CLIENTS) {
      for (const modelClass of MODEL_CLASSES) {
        for (const candidate of MODEL_PRIORITY[client][modelClass]) {
          expect(candidate.display !== undefined, `${client}/${candidate.id}`).toBe(client === "copilot");
        }
      }
    }
  });

  it("cites a dated https source for every client's rows", () => {
    for (const client of LISTING_CLIENTS) {
      const { url, accessDate } = MODEL_PRIORITY_CITATION[client];
      expect(url, client).toMatch(/^https:\/\//);
      expect(accessDate, client).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // The captures carry the same date, so a re-read moves both.
      expect(accessDate, client).toBe("2026-10-14");
    }
  });
});

describe("pickModel with no account list", () => {
  it("gives Copilot and Codex entry 0, with the rest of the order as fallbacks", () => {
    for (const client of ["copilot", "codex"] as const) {
      for (const modelClass of MODEL_CLASSES) {
        const [first, ...rest] = MODEL_PRIORITY[client][modelClass];
        expect(pickModel(client, modelClass, "high"), `${client}/${modelClass}`).toEqual({
          id: first?.id,
          ...(first?.display === undefined ? {} : { display: first.display }),
          fallbacks: rest.map((candidate) => candidate.id),
        });
      }
    }
    expect(pickModel("copilot", "standard", "medium")).toEqual({
      id: "claude-sonnet-5",
      display: "Claude Sonnet 5",
      fallbacks: ["gpt-6-sol", "gpt-5.6-terra"],
    });
  });

  it("gives Cursor nothing, so the sub-agent inherits the session's model", () => {
    for (const modelClass of MODEL_CLASSES) {
      expect(pickModel("cursor", modelClass, "high"), modelClass).toBeUndefined();
    }
  });
});

describe("pickModel over an account's list", () => {
  it("takes the exact effort variant on Cursor and names its effort in the id", () => {
    const listed = ["auto", "claude-opus-5-5-medium", "claude-opus-5-5-high", "gpt-5.6-sol-high"];
    expect(pickModel("cursor", "advanced", "high", listed)).toEqual({
      id: "claude-opus-5-5-high",
      fallbacks: ["gpt-5.6-sol-high"],
    });
  });

  it("takes the nearest listed variant when the exact one is missing, the lower of two at one distance", () => {
    const listed = ["claude-opus-5-5-medium", "claude-opus-5-5-xhigh"];
    expect(pickModel("cursor", "advanced", "high", listed)?.id).toBe("claude-opus-5-5-medium");
    expect(pickModel("cursor", "advanced", "max", listed)?.id).toBe("claude-opus-5-5-xhigh");
  });

  it("skips a candidate the account lacks and takes the next one it holds", () => {
    expect(pickModel("codex", "advanced", "high", ["gpt-6-sol", "gpt-6-luna"])).toEqual({
      id: "gpt-6-sol",
      fallbacks: [],
    });
    expect(pickModel("copilot", "economy", "low", ["gpt-5.4-mini", "gpt-6-luna"])).toEqual({
      id: "gpt-6-luna",
      display: "GPT-6 Luna",
      fallbacks: ["gpt-5.4-mini"],
    });
  });

  it("answers undefined when the account holds no candidate at all", () => {
    for (const client of LISTING_CLIENTS) {
      expect(pickModel(client, "standard", "medium", ["some-other-model"]), client).toBeUndefined();
      expect(pickModel(client, "standard", "medium", []), client).toBeUndefined();
    }
  });

  it("leaves a templated candidate unresolved when no effort level is known", () => {
    expect(pickModel("cursor", "advanced", undefined, ["claude-opus-5-5-high"])).toBeUndefined();
  });

  it("picks a listed id for every class on every client from the captured lists", () => {
    const efforts = { frontier: "high", advanced: "high", standard: "medium", economy: "low" } as const;
    const picks = Object.fromEntries(
      LISTING_CLIENTS.map((client) => [
        client,
        Object.fromEntries(
          MODEL_CLASSES.map((modelClass) => [
            modelClass,
            pickModel(client, modelClass, efforts[modelClass], captured(client))?.id,
          ]),
        ),
      ]),
    );
    expect(picks).toEqual({
      cursor: {
        frontier: "claude-opus-5-5-high",
        advanced: "claude-opus-5-5-high",
        standard: "claude-sonnet-5-5-medium",
        economy: "claude-haiku-5-5-low",
      },
      copilot: {
        frontier: "claude-fable-5.1",
        advanced: "claude-opus-5.5",
        standard: "claude-sonnet-5",
        economy: "claude-haiku-4.5",
      },
      codex: {
        frontier: "gpt-6-astra",
        advanced: "gpt-6-astra",
        standard: "gpt-6-sol",
        economy: "gpt-6-luna",
      },
    });
  });
});

describe("modelMapPath", () => {
  it("puts each client's map under the generated models folder", () => {
    for (const tool of TOOLS) expect(modelMapPath(tool)).toBe(`.stamity/generated/models/${tool}.json`);
  });
});
