import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { HUMAN_ANSWERS, ROW_STATUSES, carryForward, hashFile, hashInputs, inputHashMap, recordHumanAnswers, rowHash, sha256 } from "../../scripts/qa/bind.mjs";

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
  acceptedAt?: string;
  acceptedBy?: string;
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

/**
 * `accepted-unwalked` (plan 013-02, unit qa-harness-accepted-unwalked, census S8): a person may sign
 * a row off WITHOUT walking it, and the evidence file says so rather than rounding it up to
 * `performed`. Every harness row id starts with `H` — each one is a release-QA row — so an
 * acceptance is good for the run that recorded it and NEVER carries: the next run reopens it
 * whatever its hash, and a person walks it or accepts it again. `performed` keeps carrying.
 */
describe("the accepted-unwalked status", () => {
  const accepted: Row = {
    row: "H1c",
    automated: false,
    status: "accepted-unwalked",
    reason: "no headless CLI on this machine",
    inputHashes: inputHashMap(inputs),
    rowHash: rowHash(inputs),
    acceptedAt: "2026-09-13",
    acceptedBy: "the maintainer",
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

  it("is a row status, and a human answer beside performed", () => {
    expect(ROW_STATUSES).toEqual(["passed", "failed", "not-run", "performed", "accepted-unwalked", "unperformed"]);
    expect([...(HUMAN_ANSWERS as Set<string>)].toSorted()).toEqual(["accepted-unwalked", "performed"]);
  });

  it("never carries on an equal hash: the row reopens as unperformed, naming accepted-unwalked", () => {
    const [carried] = carryForward({ rows: [accepted] }, [openRow()]) as Row[];

    expect(carried!.status).toBe("unperformed");
    expect(carried!.reason).toContain("accepted-unwalked");
    expect(carried!.reason).toContain("walk it or accept it again");
    // The acceptance's own date and name stay out of the row's fields: the row is open, and a
    // reader of the fields alone must not see a signature on it.
    expect(carried!.acceptedAt).toBeUndefined();
    expect(carried!.acceptedBy).toBeUndefined();
    expect(carried!.reason).toContain("2026-09-13");
    expect(carried!.reason).toContain("no headless CLI on this machine");
  });

  it("never carries for ANY row id — the carry exception keys on the status, not on the id letter", () => {
    for (const id of ["H1", "H1c", "H5", "M2", "L1"]) {
      const [carried] = carryForward({ rows: [{ ...accepted, row: id }] }, [openRow({ row: id })]) as Row[];
      expect(carried!.status, id).toBe("unperformed");
      expect(carried!.reason, id).toContain("accepted-unwalked");
    }
  });

  it("reopens with both hashes named when the hash moved", () => {
    const moved = [...inputs.slice(0, 2), { path: inputs[2]!.path, sha256: "d".repeat(64) }];
    const [carried] = carryForward({ rows: [accepted] }, [
      openRow({ inputHashes: inputHashMap(moved), rowHash: rowHash(moved) }),
    ]) as Row[];

    expect(carried!.status).toBe("unperformed");
    expect(carried!.reason).toContain("accepted-unwalked");
    expect(carried!.reason).toContain(accepted.rowHash);
    expect(carried!.reason).toContain(rowHash(moved));
    expect(carried!.reason).toContain(
      `reopened: accepted-unwalked against rowHash ${accepted.rowHash} on 2026-09-13, ` +
        `and this run's inputs hash to ${rowHash(moved)}`,
    );
  });

  it("keeps the performed reopening text byte-identical to the text before accepted-unwalked existed", () => {
    const moved = [...inputs.slice(0, 2), { path: inputs[2]!.path, sha256: "e".repeat(64) }];
    const performed: Row = { ...accepted, status: "performed", performedAt: "2026-09-12", performedBy: "the maintainer" };
    delete performed.acceptedAt;
    delete performed.acceptedBy;
    const [carried] = carryForward({ rows: [performed] }, [
      openRow({ reason: "", inputHashes: inputHashMap(moved), rowHash: rowHash(moved) }),
    ]) as Row[];

    expect(carried!.reason).toBe(
      `reopened: performed against rowHash ${performed.rowHash} on 2026-09-12, and this run's inputs hash to ${rowHash(moved)}`,
    );
  });

  it("lets this run's measurement win over a prior acceptance", () => {
    const measuredPass = openRow({ automated: true, status: "passed", reason: "12 stops" });
    const measuredFail = openRow({ automated: true, status: "failed", reason: "the hook recorded no call at all" });

    const [passed, failed] = carryForward({ rows: [accepted] }, [measuredPass, { ...measuredFail, row: "H1c" }]) as Row[];

    expect(passed).toEqual(measuredPass);
    expect(failed!.status).toBe("failed");
    expect(failed!.reason).toBe("the hook recorded no call at all");
  });
});

/** Four rows, one per shape an answer meets: reopened, unmeasured, measured passed, measured failed. */
function answerRows(): Row[] {
  return [
    { row: "H1c", automated: false, status: "unperformed", reason: "reopened", inputHashes: {}, rowHash: "1".repeat(64) },
    { row: "H2", automated: true, status: "not-run", reason: "browser skipped", inputHashes: {}, rowHash: "2".repeat(64) },
    { row: "H3a", automated: true, status: "passed", reason: "18 stops", inputHashes: {}, rowHash: "3".repeat(64) },
    { row: "H3b", automated: true, status: "failed", reason: "a stop with no ring", inputHashes: {}, rowHash: "4".repeat(64) },
  ];
}

describe("recordHumanAnswers", () => {
  const rows = answerRows;

  it("records a walk as performed and an acceptance as accepted-unwalked, with the date and the name", () => {
    const input = rows();
    const out = recordHumanAnswers(input, {
      walked: ["H1c"],
      accepted: ["H2"],
      by: "the maintainer",
      on: "2026-09-30",
    }) as Row[];

    expect(out[0]).toMatchObject({ status: "performed", performedAt: "2026-09-30", performedBy: "the maintainer" });
    expect(out[0]!.acceptedAt).toBeUndefined();
    expect(out[1]).toMatchObject({ status: "accepted-unwalked", acceptedAt: "2026-09-30", acceptedBy: "the maintainer" });
    expect(out[1]!.performedAt).toBeUndefined();
    // Rows nobody answered pass through as the harness left them.
    expect(out[2]).toEqual(input[2]);
    expect(out[3]).toEqual(input[3]);
    // New objects: the caller's rows are not mutated.
    expect(input[0]!.status).toBe("unperformed");
    expect(input[1]!.status).toBe("not-run");
  });

  it("turns a row reopened from an acceptance into performed when a person walks it", () => {
    const prior: Row = { ...rows()[0]!, status: "accepted-unwalked", acceptedAt: "2026-09-13", acceptedBy: "the maintainer" };
    const [reopened] = carryForward({ rows: [prior] }, [{ ...rows()[0]!, status: "not-run" }]) as Row[];
    expect(reopened!.status).toBe("unperformed");

    const [walked] = recordHumanAnswers([reopened], { walked: ["H1c"], by: "the maintainer", on: "2026-09-30" }) as Row[];

    expect(walked!.status).toBe("performed");
    expect(walked!.performedAt).toBe("2026-09-30");
  });

  it("drops the reopen text when a person answers a reopened row, so a walk never carries 'walk it or accept it again'", () => {
    const harness = { ...rows()[0]!, status: "not-run", reason: "the hook lane was skipped (--skip-hooks)" };
    const prior: Row = { ...rows()[0]!, status: "accepted-unwalked", acceptedAt: "2026-09-13", acceptedBy: "the maintainer" };
    const [reopened] = carryForward({ rows: [prior] }, [harness]) as Row[];
    expect(reopened!.reason).toContain("walk it or accept it again");

    const [walked] = recordHumanAnswers([reopened], { walked: ["H1c"], by: "the maintainer", on: "2026-09-30" }) as Row[];
    expect(walked!.reason).toBe("the hook lane was skipped (--skip-hooks)");
    const [accepted] = recordHumanAnswers([reopened], { accepted: ["H1c"], by: "the maintainer", on: "2026-09-30" }) as Row[];
    expect(accepted!.reason).toBe("the hook lane was skipped (--skip-hooks)");

    // The next run carries the walk with the harness's reason, not the reopen text.
    const [carried] = carryForward({ rows: [walked] }, [harness]) as Row[];
    expect(carried).toMatchObject({ status: "performed", reason: "the hook lane was skipped (--skip-hooks)" });

    // A reopen with no harness reason behind it leaves an empty reason.
    const [bare] = carryForward({ rows: [prior] }, [{ ...harness, reason: "" }]) as Row[];
    const [bareWalked] = recordHumanAnswers([bare], { walked: ["H1c"], by: "the maintainer", on: "2026-09-30" }) as Row[];
    expect(bareWalked!.reason).toBe("");
  });

  it("drops the moved-hash reopen text too when the reopened row is walked", () => {
    const prior: Row = { ...rows()[0]!, status: "performed", performedAt: "2026-09-13", rowHash: "a".repeat(64) };
    const harness = { ...rows()[0]!, status: "not-run", reason: "browser skipped", rowHash: "b".repeat(64) };
    const [reopened] = carryForward({ rows: [prior] }, [harness]) as Row[];
    expect(reopened!.reason).toContain("inputs hash to");

    const [walked] = recordHumanAnswers([reopened], { walked: ["H1c"], by: "the maintainer", on: "2026-09-30" }) as Row[];
    expect(walked!.reason).toBe("browser skipped");
  });

  it("keeps a reason carryForward did not write", () => {
    const [walked] = recordHumanAnswers(rows(), { walked: ["H1c"], by: "the maintainer", on: "2026-09-30" }) as Row[];
    expect(walked!.reason).toBe("reopened");
  });

  it("refuses a malformed --on or an empty --by even when no row is answered", () => {
    expect(() => recordHumanAnswers(rows(), { on: "2026-13-01" })).toThrow(new Error("--on 2026-13-01 is not a YYYY-MM-DD date"));
    for (const by of ["", "  "]) {
      expect(() => recordHumanAnswers(rows(), { by, on: "2026-09-30" })).toThrow(
        new Error("--by names nobody; give a name or leave the flag out"),
      );
    }
    // A well-formed name with no answer is accepted, and nothing is recorded.
    expect(recordHumanAnswers(rows(), { by: "the maintainer", on: "2026-09-30" })).toEqual(rows());
  });

  it("returns the rows unchanged when nobody answered, and needs no --by then", () => {
    const input = rows();
    expect(recordHumanAnswers(input, { on: "2026-09-30" })).toEqual(input);
  });

  it("refuses an answer with no --by", () => {
    expect(() => recordHumanAnswers(rows(), { walked: ["H1c"], on: "2026-09-30" })).toThrow(
      new Error("--by is required when --walked or --accept-unwalked is given"),
    );
    expect(() => recordHumanAnswers(rows(), { accepted: ["H1c"], by: "", on: "2026-09-30" })).toThrow(
      new Error("--by is required when --walked or --accept-unwalked is given"),
    );
  });

  it("refuses a row id the evidence file does not carry", () => {
    expect(() => recordHumanAnswers(rows(), { accepted: ["H9"], by: "the maintainer", on: "2026-09-30" })).toThrow(
      new Error("row H9 is not in this evidence file"),
    );
  });

  it("refuses a human answer on a row the harness measured, passed or failed", () => {
    expect(() => recordHumanAnswers(rows(), { walked: ["H3a"], by: "the maintainer", on: "2026-09-30" })).toThrow(
      new Error("row H3a was measured passed by the harness; a measured row takes no human answer"),
    );
    expect(() => recordHumanAnswers(rows(), { accepted: ["H3b"], by: "the maintainer", on: "2026-09-30" })).toThrow(
      new Error("row H3b was measured failed by the harness; a measured row takes no human answer"),
    );
  });

  it("refuses a row named by both --walked and --accept-unwalked", () => {
    expect(() =>
      recordHumanAnswers(rows(), { walked: ["H1c"], accepted: ["H1c"], by: "the maintainer", on: "2026-09-30" }),
    ).toThrow(new Error("row H1c is named by both --walked and --accept-unwalked"));
  });

  it("refuses an --on that is not a YYYY-MM-DD date", () => {
    for (const on of ["30.09.2026", "2026-9-30", "2026-02-30", "yesterday"]) {
      expect(() => recordHumanAnswers(rows(), { walked: ["H1c"], by: "the maintainer", on })).toThrow(
        new Error(`--on ${on} is not a YYYY-MM-DD date`),
      );
    }
  });
});
