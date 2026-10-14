import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool.
import { comparatorKey, sameConfiguration } from "../../scripts/eval/run.mjs";
import { REPO_ROOT } from "../evals/support.ts";

/**
 * The comparator cases that read a committed run's `inputs.json` under `evals/runs/`, in the records
 * suite (REQ-PROVE-025): those run folders are records that leave `main`. The describe name is
 * `test/evals/manualRunner.test.ts`'s, so each case keeps its full name; the synthetic comparator
 * cases stay there.
 */

const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");
/**
 * The claude profile's two model pairs, the literals `test/evals/manualRunner.test.ts` declares at
 * module scope beside its comparator fixtures: copied rather than imported, since a test file is not
 * a module another test imports.
 */
const OPUS_5 = { scenario: "claude-opus-5", judge: "claude-fable-5-1" };
const OPUS_5_5 = { scenario: "claude-opus-5-5", judge: "claude-fable-5-1" };

describe("full run admission and strict aggregation", () => {
  // TEST CHANGE, justified (2026-10-14, r1b-records-suite-eval-cases): moved unchanged from
  // test/evals/manualRunner.test.ts, because it reads run 43's committed `inputs.json`, a record that
  // leaves `main`.
  // ADDED 2026-10-08 (REQ-PROVE-036, unit c3-release-rules, inbox rows 274 and 275): a pin of what
  // the comparator already does, so a later change that drops `harness` from the key fails here. On
  // the driver route `harness` carries the client and its version — read off run 43's own committed
  // `inputs.json` rather than typed — so two client versions are two configurations.
  it("keys two client versions apart through the harness, and reads an unrecorded harness as not compared", () => {
    const run43 = JSON.parse(read("evals/runs/2026-10-08-run-43/inputs.json")) as { configuration: object };
    const older = comparatorKey(run43.configuration);
    expect(older.harness).toBe("claude-code-cli 2.1.286");
    expect(older.models).toEqual(OPUS_5_5);
    const newer = { ...older, harness: "claude-code-cli 2.1.291" };
    expect(sameConfiguration(older, newer)).toBe(false);
    expect(sameConfiguration(older, { ...older })).toBe(true);
    // The older run recorded no harness: the other fields decide, both ways.
    const unrecorded = { ...older, harness: null };
    expect(sameConfiguration(unrecorded, newer)).toBe(true);
    expect(sameConfiguration(unrecorded, { ...newer, models: OPUS_5 })).toBe(false);
  });
});
