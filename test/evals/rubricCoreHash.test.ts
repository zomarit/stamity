import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, RUBRIC_FILE } from "./support.ts";

/**
 * The grading core of the rubric is pinned to the run of record.
 *
 * Every byte of `evals/rubric-v7.md` ABOVE the `## Calibration protocol` heading is the excised
 * rubric each judge call receives, and its sha-256 is the `rubricCoreHash` the incremental rule of
 * `evals/SET-v7.md` compares before composing a release's run with the prior complete run. An edit
 * anywhere above that heading — a selector sentence, a citation, a currency note — moves the hash,
 * and the private driver then refuses to compose the next increment: the choice becomes a restore
 * of the bytes or a full baseline of the whole set. Until this file, nothing in the tree pinned it,
 * so such an edit passed every gate green: observed 2026-09-20, when session 1's currency fix
 * (`c989e10`) rewrote lines 3-5 and the 1.9.0 increment could not compose until they were restored.
 * That observation was carried as a learning until this pin met its retire condition; the learning
 * was retired on 2026-09-23 and this file is now where the rule lives. prove/212 is the finding
 * that asked for the pin.
 *
 * The boundary and the byte count are the private driver's exactly, and they are read off the
 * newest committed run's public `inputs.json` rather than typed: the text BEFORE the heading line,
 * with the newline that ends the line above it included and the heading itself excluded — the same
 * `split("## Calibration protocol\n")[0]` `test/evals/manualRunner.test.ts` uses for v7's own hash
 * assertion. On run 31 that is 9137 bytes at `6209d8df…`.
 *
 * Red-checked by hand on 2026-09-22: one byte changed above the boundary turned the hash assertion
 * red with the rule in its message; the byte was restored and the core hashed back to the run's
 * value before the file was committed.
 */

const CALIBRATION_BOUNDARY = "## Calibration protocol\n";

/** The run directory with the highest run number — the run of record for this pin. */
function newestRun(): string {
  const runs = readdirSync(join(REPO_ROOT, "evals", "runs"))
    .map((id) => ({ id, n: Number(/-run-(\d+)$/.exec(id)?.[1] ?? Number.NaN) }))
    .filter((entry) => Number.isFinite(entry.n))
    .toSorted((a, b) => a.n - b.n);
  const newest = runs.at(-1);
  expect(newest, "evals/runs/ holds no <date>-run-<n> directory").toBeDefined();
  return newest?.id ?? "";
}

describe("the rubric's grading core is pinned to the run of record", () => {
  it("hashes the bytes above the calibration boundary to the newest run's rubricCoreHash", () => {
    const rubric = readFileSync(join(REPO_ROOT, RUBRIC_FILE), "utf8");
    const parts = rubric.split(CALIBRATION_BOUNDARY);
    expect(parts, `${RUBRIC_FILE} must carry exactly one \`${CALIBRATION_BOUNDARY.trim()}\` heading`).toHaveLength(2);
    const core = parts[0] ?? "";

    const run = newestRun();
    const inputs = JSON.parse(readFileSync(join(REPO_ROOT, "evals", "runs", run, "inputs.json"), "utf8")) as {
      configuration?: { rubricCoreHash?: string; rubricCoreBytes?: number };
    };
    const recorded = inputs.configuration?.rubricCoreHash;
    const recordedBytes = inputs.configuration?.rubricCoreBytes;
    expect(recorded, `${run}/inputs.json records no configuration.rubricCoreHash`).toMatch(/^[0-9a-f]{64}$/);
    expect(recordedBytes, `${run}/inputs.json records no configuration.rubricCoreBytes`).toBeTypeOf("number");

    const actual = createHash("sha256").update(core).digest("hex");
    const rule =
      `the grading core of ${RUBRIC_FILE} — every byte above \`${CALIBRATION_BOUNDARY.trim()}\` — hashes to ` +
      `${actual} (${String(Buffer.byteLength(core))} bytes), but the run of record ${run} was scored against ` +
      `${recorded ?? "?"} (${String(recordedBytes)} bytes). The incremental rule of evals/SET-v7.md composes a ` +
      "release's run with the prior complete run only when the core hash is unchanged, so this edit means the " +
      "next increment cannot compose: either restore the bytes above the boundary (carry the change below it, " +
      "or into evals/README.md) or run a full baseline and retain it, which is the maintainer's call. The " +
      "header of test/evals/rubricCoreHash.test.ts records the 2026-09-20 increment the driver refused for this.";
    expect(actual, rule).toBe(recorded);
    expect(Buffer.byteLength(core), rule).toBe(recordedBytes);
  });
});
