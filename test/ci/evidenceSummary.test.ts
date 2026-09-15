import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — import-safe native ESM contributor helper, outside the product package.
import { compactSummary } from "../../scripts/evidence-summary.mjs";

const script = resolve("scripts/evidence-summary.mjs");
const temporary: string[] = [];
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const storage = { kind: "compact-summary", manifest: "ARCHIVE.json", originalPath: "summary.json" };
function original() {
  return { runId: "2026-09-11-run-24", configurationHash: "c".repeat(64), status: "FAIL",
    startedAt: "2026-09-11T12:00:00.000Z", advisory: { failures: ["case-1:A1"], repeats: ["case-1:A1"] },
    aggregate: { rows: [{ caseId: "case-1", samples: [{ grade: { verdict: "FAIL" } }] }],
      pass: false, metrics: [{ score: 0.5, threshold: 1, pass: false }],
      floors: [{ caseId: "case-1", pass: false }], cases: [{ caseId: "case-1", graded: 3, passes: 2, pass: false }] },
    coverage: [{ caseId: "case-1", samples: [{ grade: { verdict: "FAIL" } }] }],
    calibration: [{ fixture: "C3", match: false, grade: { verdict: "FAIL", binding: [{ verdict: "fail" }] } }],
    terminal: true, terminalDetail: { reason: "calibration-C3-mismatch" }, notDone: ["human-qa-pending"],
    futureField: { mustStay: [false, 0, null, "retained"] } };
}
function pointer() {
  return { schemaVersion: 1, source: { repository: "zomarit/stamity", commit: "a".repeat(40), capture: "git",
    paths: ["evals/runs/2026-09-11-run-24/summary.json"] },
    archive: { file: "run24.tar.gz", sha256: "b".repeat(64), bytes: 200,
      url: "https://github.com/zomarit/stamity/releases/download/evidence/run24.tar.gz" },
    files: 1, payloadBytes: 1000, format: "tar.gz" };
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "stamity-evidence-summary-")); temporary.push(dir);
  const source = join(dir, "original.json"), output = join(dir, "summary.json"), manifest = join(dir, "ARCHIVE.json");
  writeFileSync(source, JSON.stringify(original())); writeFileSync(manifest, JSON.stringify(pointer()));
  const run = (...extra: string[]) => spawnSync(process.execPath,
    [script, "--source", source, "--output", output, "--manifest", manifest, ...extra],
    { encoding: "utf8", timeout: 10_000 });
  return { source, output, manifest, run };
}

describe("compact archived eval summaries", () => {
  it("removes only payload rows and coverage while preserving every other value and the source object", () => {
    const source = original(), before = structuredClone(source);
    const compact = compactSummary(source);
    const expected = structuredClone(source) as Record<string, unknown>;
    delete expected.coverage;
    delete (expected.aggregate as Record<string, unknown>).rows;
    expect(compact).toEqual({ ...expected, archiveStorage: storage });
    expect(source).toEqual(before);
    expect(compact.advisory).toEqual({ failures: ["case-1:A1"], repeats: ["case-1:A1"] });
    expect(compact).toMatchObject({ status: "FAIL", terminal: true, notDone: ["human-qa-pending"] });
    compact.futureField.mustStay.push("separate clone");
    expect(source).toEqual(before);
  });

  it("preserves real run 24 metrics, verdicts, calibration and advisory gating with real nonempty payloads", () => {
    const recorded = JSON.parse(readFileSync("evals/runs/2026-09-11-run-24/summary.json", "utf8"));
    // The storage migration keeps this summary's facts locally and archives its full rows.
    // Exact recorded replay calls supply nonempty payloads without fetching the full archive.
    const source = structuredClone(recorded);
    delete source.archiveStorage;
    const calls = JSON.parse(readFileSync("test/evals/fixtures/historical-replay/run-24/calls.json", "utf8"));
    source.aggregate.rows = calls.filter((call: { role: string }) => call.role === "judge");
    source.coverage = calls.filter((call: { role: string }) => call.role === "scenario");
    expect(source.aggregate.rows).toHaveLength(28);
    expect(source.coverage).toHaveLength(27);
    const compact = compactSummary(source);
    const restored = structuredClone(compact);
    delete restored.archiveStorage;
    restored.aggregate.rows = source.aggregate.rows;
    restored.coverage = source.coverage;
    expect(restored).toEqual(source);
    for (const key of ["configurationHash", "status", "startedAt", "advisory", "calibration", "notDone"])
      expect(compact[key], key).toEqual(recorded[key]);
    expect(compact.aggregate.metrics).toEqual(recorded.aggregate.metrics);
    expect(compact.aggregate.floors).toEqual(recorded.aggregate.floors);
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(source).length / 2);
  });

  it("keeps absent and null aggregate variants intact without inventing a score", () => {
    expect(compactSummary({ status: "BLOCKED", aggregate: null, calibration: [], notDone: ["missing-key"] }))
      .toEqual({ status: "BLOCKED", aggregate: null, calibration: [], notDone: ["missing-key"], archiveStorage: storage });
    expect(compactSummary({ status: "BLOCKED" })).toEqual({ status: "BLOCKED", archiveStorage: storage });
  });

  it.each(["../ARCHIVE.json", "/ARCHIVE.json", "nested/ARCHIVE.json", "..\\ARCHIVE.json", "https://example.invalid/ARCHIVE.json"])(
    "rejects a manifest reference outside the adjacent archive pointer: %s", manifest => {
      expect(() => compactSummary(original(), manifest)).toThrow("adjacent ARCHIVE.json");
    });

  it.each([null, [], "summary", { aggregate: [] }, { archiveStorage: storage }])(
    "refuses malformed or already compacted input: %j", value => {
      expect(() => compactSummary(value)).toThrow();
    });

  it("imports without running the CLI or writing files", () => {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e",
      `await import(${JSON.stringify(pathToFileURL(script).href)});`], { encoding: "utf8", timeout: 10_000 });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(""); expect(result.stderr).toBe("");
  });

  it("writes a new compact file after validating the pointer and leaves both inputs untouched", () => {
    const f = fixture(), sourceHash = hash(f.source), manifestHash = hash(f.manifest);
    const result = f.run();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(f.output, "utf8"))).toEqual(compactSummary(original()));
    expect(hash(f.source)).toBe(sourceHash); expect(hash(f.manifest)).toBe(manifestHash);
  });

  it("refuses to overwrite either an existing output or the source", () => {
    const f = fixture(); writeFileSync(f.output, "keep this output");
    expect(f.run().status).not.toBe(0);
    expect(readFileSync(f.output, "utf8")).toBe("keep this output");
    const before = hash(f.source);
    const result = spawnSync(process.execPath, [script, "--source", f.source, "--output", f.source,
      "--manifest", f.manifest], { encoding: "utf8", timeout: 10_000 });
    expect(result.status).not.toBe(0); expect(hash(f.source)).toBe(before);
  });

  it.each(["traversal", "absolute", "backslash", "wrong-repository-url", "missing-url", "invalid-schema", "wrong-capture"])(
    "rejects an invalid archive pointer before writing: %s", kind => {
      const f = fixture(), data = pointer();
      if (kind === "traversal") data.source.paths = ["../summary.json"];
      if (kind === "absolute") data.source.paths = ["/summary.json"];
      if (kind === "backslash") data.source.paths = ["evals\\..\\summary.json"];
      if (kind === "wrong-repository-url") data.archive.url = "https://github.com/other/repo/releases/download/evidence/run24.tar.gz";
      if (kind === "missing-url") data.archive.url = "";
      if (kind === "invalid-schema") data.schemaVersion = 2;
      if (kind === "wrong-capture") data.source.capture = "unspecified";
      writeFileSync(f.manifest, JSON.stringify(data));
      expect(f.run().status).not.toBe(0); expect(existsSync(f.output)).toBe(false);
    });

  it("refuses a missing or malformed manifest without echoing its contents", () => {
    const f = fixture(); rmSync(f.manifest);
    expect(f.run().status).not.toBe(0); expect(existsSync(f.output)).toBe(false);
    writeFileSync(f.manifest, "untrusted-sensitive-placeholder");
    const result = f.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).not.toContain("untrusted-sensitive-placeholder");
    expect(existsSync(f.output)).toBe(false);
  });
});
