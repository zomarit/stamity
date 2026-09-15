import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { carryForward, hashFile, hashInputs, inputHashMap, rowHash, sha256 } from "../../scripts/qa/bind.mjs";

/**
 * The binding layer decides whether a human QA answer still describes the tree it was given
 * against. Everything it promises is a property of these pure functions, so they are tested
 * directly rather than through a harness run that needs a browser and four client binaries.
 */

const temps: string[] = [];

/** A real directory, because `hashFile` reads bytes off disk and a mocked fs would test the mock. */
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "stamity-qa-bind-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Input {
  path: string;
  sha256: string;
}

interface Row {
  row: string;
  automated: boolean;
  status: string;
  reason: string;
  inputHashes: Record<string, string>;
  rowHash: string;
  performedAt?: string;
  performedBy?: string;
}

const inputs: Input[] = [
  { path: "website/build/index.html", sha256: "a".repeat(64) },
  { path: "website/build/docs/capability-matrix/index.html", sha256: "b".repeat(64) },
  { path: "fixture(claude)/.claude/settings.json", sha256: "c".repeat(64) },
];

describe("rowHash", () => {
  it("is independent of the order the caller enumerated the inputs in", () => {
    const forward = rowHash(inputs);
    const reversed = rowHash(inputs.toReversed());
    const shuffled = rowHash([inputs[1], inputs[2], inputs[0]]);

    expect(forward).toBe(reversed);
    expect(forward).toBe(shuffled);
    // Guard against the degenerate implementation that returns a constant.
    expect(forward).not.toBe(rowHash(inputs.slice(0, 2)));
  });

  it("changes when a single byte of a single input changes", () => {
    const before = rowHash(inputs);
    const after = rowHash([
      inputs[0],
      inputs[1],
      { path: inputs[2]!.path, sha256: `${"c".repeat(63)}d` },
    ]);

    expect(after).not.toBe(before);
    expect(after).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores fields beyond path and sha256, so an enriched record keeps its identity", () => {
    const enriched = inputs.map((input) => ({ ...input, size: 1234, mtime: "2026-09-14" }));

    expect(rowHash(enriched)).toBe(rowHash(inputs));
  });

  it("hashes real files by their bytes, and one changed byte moves the row's hash", () => {
    const dir = scratch();
    const page = join(dir, "index.html");
    writeFileSync(page, "<h1>one</h1>\n", "utf8");
    const other = join(dir, "matrix.html");
    writeFileSync(other, "<table><th scope=\"col\">a</th></table>\n", "utf8");

    const entries = [
      { path: "site/index.html", absolute: page },
      { path: "site/matrix.html", absolute: other },
    ];
    const first = hashInputs(entries);
    const firstHash = rowHash(first);
    expect(first[0]!.sha256).toBe(hashFile(page));
    expect(inputHashMap(first)["site/index.html"]).toBe(sha256("<h1>one</h1>\n"));

    writeFileSync(page, "<h1>onf</h1>\n", "utf8");
    expect(rowHash(hashInputs(entries))).not.toBe(firstHash);
  });
});

describe("carryForward", () => {
  const performed: Row = {
    row: "H1c",
    automated: false,
    status: "performed",
    reason: "walked by hand against the 1.7.0 tree",
    inputHashes: { "fixture(cursor)/.cursor/hooks.json": "c".repeat(64) },
    rowHash: rowHash(inputs),
    performedAt: "2026-09-13",
    performedBy: "the maintainer",
  };

  const openRow = (overrides: Partial<Row> = {}): Row => ({
    row: "H1c",
    automated: false,
    status: "not-run",
    reason: "no headless CLI on this machine",
    inputHashes: inputHashMap(inputs),
    rowHash: rowHash(inputs),
    ...overrides,
  });

  it("keeps a performed row performed, with its original date, while the hash holds", () => {
    const [carried] = carryForward({ rows: [performed] }, [openRow()]) as Row[];

    expect(carried!.status).toBe("performed");
    expect(carried!.performedAt).toBe("2026-09-13");
    expect(carried!.performedBy).toBe("the maintainer");
    expect(carried!.rowHash).toBe(rowHash(inputs));
  });

  it("reopens the row as unperformed when one input's hash moves, naming both hashes", () => {
    const moved = [...inputs.slice(0, 2), { path: inputs[2]!.path, sha256: "d".repeat(64) }];
    const [carried] = carryForward({ rows: [performed] }, [
      openRow({ inputHashes: inputHashMap(moved), rowHash: rowHash(moved) }),
    ]) as Row[];

    expect(carried!.status).toBe("unperformed");
    expect(carried!.performedAt).toBeUndefined();
    expect(carried!.reason).toContain(performed.rowHash);
    expect(carried!.reason).toContain(rowHash(moved));
    // The row's own reason survives beside the reopening, so an operator still reads why the
    // harness could not measure it either.
    expect(carried!.reason).toContain("no headless CLI on this machine");
  });

  it("never paints a signature over a measurement this run took", () => {
    const measured = openRow({ automated: true, status: "failed", reason: "the hook recorded no call at all" });

    const [carried] = carryForward({ rows: [performed] }, [measured]) as Row[];

    expect(carried!.status).toBe("failed");
    expect(carried!.reason).toBe("the hook recorded no call at all");
    expect(carried!.performedAt).toBeUndefined();
  });

  it("leaves a row the previous run never carried exactly as this run computed it", () => {
    const fresh = openRow({ row: "H3d", status: "passed", automated: true, reason: "12 stops" });

    const [carried] = carryForward({ rows: [performed] }, [fresh]) as Row[];

    expect(carried!).toEqual(fresh);
  });

  it("accepts a bare array, an evidence object, or nothing as the previous run", () => {
    expect((carryForward([performed], [openRow()]) as Row[])[0]!.status).toBe("performed");
    expect((carryForward(null, [openRow()]) as Row[])[0]!.status).toBe("not-run");
    expect((carryForward(undefined, [openRow()]) as Row[])[0]!.status).toBe("not-run");
  });

  it("does not mutate either argument", () => {
    const previous = { rows: [{ ...performed }] };
    const current = [openRow()];

    carryForward(previous, current);

    expect(previous.rows[0]!.status).toBe("performed");
    expect(current[0]!.status).toBe("not-run");
    expect(current[0]!.performedAt).toBeUndefined();
  });
});
