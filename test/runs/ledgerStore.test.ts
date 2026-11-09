import { mkdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseClosuresBlock } from "../../src/runs/blocks.ts";
import { applyClosures, closeRow, reopenCount, type LedgerRow } from "../../src/runs/ledgerStore.ts";
import { parseLedger } from "../support/ledgerGrammar.ts";
import { useTempDir, type TempDirHandle } from "../support/tempDir.ts";

/**
 * A reopened finding is counted (REQ-FLOW-183, unit x-ledger-reopens): every
 * closure that leaves its row `open` — `not-fixed`, `regressed`,
 * `rejection-overturned` — adds one to the row's optional `reopens`, a row
 * without the field reads 0, any later move keeps the count, and the records
 * gate's row grammar accepts the field as a non-negative integer and nothing else.
 *
 * Real-filesystem lane, as for `ledger close`: the contract is the bytes of the
 * run's `ledger.jsonl` after each close, which a virtual volume cannot show.
 */

const tempDir = useTempDir("stamity-ledger-reopens");

const RUN = "2026-11-09_reopens";
const RUN_DIR = `.stamity/runs/${RUN}`;
const LEDGER = `${RUN_DIR}/ledger.jsonl`;
const report = (round: number): string => `${RUN_DIR}/reports/u1-reviewer-r${round}.md`;
const rid = (n: number): string => `${RUN}/review/${n}`;

function row(n: number, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: rid(n),
    phase: "review",
    source: "reviewer",
    severity: "Warning",
    evidence: `src/a.ts:${n} — finding ${n}`,
    state: "open",
    rationale: "",
    ...extra,
  });
}

async function seedRun(dir: TempDirHandle, ledger: string): Promise<void> {
  await mkdir(dir.path(RUN_DIR, "reports"), { recursive: true });
  await dir.seedFiles({ [LEDGER]: ledger });
}

async function rows(dir: TempDirHandle): Promise<Record<string, unknown>[]> {
  return (await readFile(dir.path(LEDGER), "utf8"))
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Apply one re-review, round `round`, closing each `[n, status]` pair. */
async function close(dir: TempDirHandle, round: number, pairs: readonly [number, string][]): Promise<void> {
  const block = pairs.map(([n, status]) => JSON.stringify({ ledger_id: rid(n), status }));
  const parsed = parseClosuresBlock(["# re-review", "", "```stamity-closures", ...block, "```", ""].join("\n"));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.problems));
  await applyClosures({
    rootDir: dir.dir,
    runId: RUN,
    closures: parsed.items,
    handedIds: pairs.map(([n]) => rid(n)),
    report: report(round),
    dryRun: false,
  });
}

describe("reopens on a closure", () => {
  it("counts each regressed closure on a fixed row: 1, then 2", async () => {
    const dir = tempDir();
    await seedRun(dir, `${row(1, { state: "fixed", rationale: "fixed in abc" })}\n`);

    await close(dir, 2, [[1, "regressed"]]);
    expect((await rows(dir))[0]).toMatchObject({ state: "open", reopens: 1 });

    await close(dir, 3, [[1, "fixed"]]);
    await close(dir, 4, [[1, "regressed"]]);
    expect((await rows(dir))[0]).toMatchObject({ state: "open", reopens: 2 });
  });

  it("counts not-fixed and rejection-overturned, and leaves fixed and rejection-upheld at 0", async () => {
    const dir = tempDir();
    await seedRun(dir, [row(1), row(2), row(3), row(4), ""].join("\n"));

    await close(dir, 2, [
      [1, "not-fixed"],
      [2, "rejection-overturned"],
      [3, "fixed"],
      [4, "rejection-upheld"],
    ]);

    const after = await rows(dir);
    expect(after.map((r) => [r["state"], r["reopens"]])).toEqual([
      ["open", 1],
      ["open", 1],
      ["fixed", undefined],
      ["rejected", undefined],
    ]);
    expect(after.map((r) => reopenCount(r as unknown as LedgerRow))).toEqual([1, 1, 0, 0]);
  });

  it("keeps the count when the row is later closed fixed, by a closure or by hand", async () => {
    const dir = tempDir();
    await seedRun(dir, [row(1, { reopens: 3 }), row(2, { reopens: 2 }), ""].join("\n"));

    await close(dir, 2, [[1, "fixed"]]);
    await closeRow({ rootDir: dir.dir, runId: RUN, ledgerId: rid(2), state: "fixed", rationale: "fixed in def", dryRun: false });

    expect((await rows(dir)).map((r) => [r["state"], r["reopens"]])).toEqual([
      ["fixed", 3],
      ["fixed", 2],
    ]);
  });

  it("does not count a re-run of the same closure twice", async () => {
    const dir = tempDir();
    await seedRun(dir, `${row(1)}\n`);

    await close(dir, 2, [[1, "not-fixed"]]);
    await close(dir, 2, [[1, "not-fixed"]]);

    expect((await rows(dir))[0]).toMatchObject({ state: "open", reopens: 1 });
  });
});

describe("reopenCount", () => {
  const base = JSON.parse(row(1)) as LedgerRow;

  it("reads an older row without the field as 0", () => {
    expect(reopenCount(base)).toBe(0);
  });

  it("reads a recorded count as it is", () => {
    expect(reopenCount({ ...base, reopens: 4 })).toBe(4);
  });

  it("reads a hand-mangled value as 0, not as a number it is not", () => {
    // A hand edit the records gate would refuse; the count restarts rather than carrying a string or a fraction.
    for (const reopens of ["2", -1, 1.5, null]) {
      expect(reopenCount({ ...base, reopens } as unknown as LedgerRow)).toBe(0);
    }
  });
});

describe("the records gate's row grammar", () => {
  const at = (line: string): readonly string[] => parseLedger(LEDGER, `${line}\n`).problems;

  it("accepts reopens as a non-negative integer, and a row without it", () => {
    expect(at(row(1, { reopens: 2 }))).toEqual([]);
    expect(at(row(1, { reopens: 0 }))).toEqual([]);
    expect(at(row(1))).toEqual([]);
    expect(parseLedger(LEDGER, `${row(1, { reopens: 2 })}\n`).rows).toHaveLength(1);
  });

  it("refuses reopens spelled as anything but a non-negative integer", () => {
    for (const reopens of ["2", -1, 1.5, null, true]) {
      expect(at(row(1, { reopens }))).toEqual([`${LEDGER}:1: \`reopens\` is a non-negative integer when present`]);
    }
  });

  it("accepts the bytes a regressed closure lands", async () => {
    const dir = tempDir();
    await seedRun(dir, `${row(1, { state: "fixed", rationale: "fixed in abc" })}\n`);
    await close(dir, 2, [[1, "regressed"]]);

    const parsed = parseLedger(LEDGER, await readFile(dir.path(LEDGER), "utf8"));
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
  });
});
