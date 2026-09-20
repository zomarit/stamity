import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { inputsFor, rowFor, runPluginClients } from "../../scripts/qa/plugin-runs.mjs";

/**
 * The QA lane that turns the route smoke's four legs into one row per client
 * (`scripts/qa/plugin-runs.mjs`).
 *
 * Seven cases in three groups. Six are pure folds over a report this suite composes, which is the
 * only way to drive the interesting shapes: a `failed` leg beside a `SKIPPED` one, a client whose
 * legs are missing entirely, a label set that belongs to another client. The seventh drives
 * `runPluginClients` for real, against a `--dist` that is not a distribution root — the smoke then
 * exits 2 without touching a client, and what is under test is the ROW that failure produces:
 * `not-run`, never a pass, and carrying no absolute path.
 */

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const HOME = homedir();

interface Leg {
  leg: string;
  status: "PASS" | "FAIL" | "SKIPPED";
  reason: string;
  command: string | null;
  exitCode: number | null;
  binaryVersion: string | null;
  transcriptSha256: string | null;
}

interface Row {
  client: string;
  status: string;
  reason: string;
  inputs?: { path: string; sha256: string }[];
}

function leg(name: string, status: Leg["status"], overrides: Partial<Leg> = {}): Leg {
  return {
    leg: name,
    status,
    reason: `${name} said so`,
    command: null,
    exitCode: null,
    binaryVersion: null,
    transcriptSha256: null,
    ...overrides,
  };
}

/** The four legs, all passing — the shape every case below perturbs by exactly one leg. */
function allPassing(): Leg[] {
  return [
    leg("structure", "PASS"),
    leg("install", "PASS", { binaryVersion: "2.1.278", exitCode: 0, transcriptSha256: "a".repeat(64) }),
    leg("discovery", "PASS", { binaryVersion: "2.1.278", exitCode: 0, transcriptSha256: "b".repeat(64) }),
    leg("invocation", "PASS", { binaryVersion: "2.1.278", exitCode: 0, transcriptSha256: "c".repeat(64) }),
  ];
}

describe("rowFor — the row's status is its weakest leg", () => {
  it("is passed only when every leg passed, and carries all four leg lines with their hashes", () => {
    const row = rowFor("claude", { legs: allPassing() }) as Row;

    expect(row.status).toBe("passed");
    for (const name of ["structure", "install", "discovery", "invocation"]) {
      expect(row.reason, name).toContain(`${name} PASS`);
    }
    // The hashes are what a run record cites; a reason carrying only the verdict sends the next
    // reader back to a transcript nobody kept.
    expect(row.reason).toContain(`transcript sha256 ${"a".repeat(64)}`);
    expect(row.reason).toContain(`transcript sha256 ${"c".repeat(64)}`);
    expect(row.reason).toContain("[2.1.278]");
  });

  it("is not-run when any leg was SKIPPED, however many passed beside it", () => {
    const legs = allPassing();
    legs[3] = leg("invocation", "SKIPPED", { reason: "needs --invoke" });

    const row = rowFor("codex", { legs }) as Row;

    expect(row.status).toBe("not-run");
    expect(row.reason).toContain("invocation SKIPPED: needs --invoke");
    // Non-degenerate: three legs really did pass, and the row still refuses to round up.
    expect(row.reason).toContain("structure PASS");
    expect(row.reason).toContain("install PASS");
  });

  it("is failed when any leg FAILED, and a failure outranks a skip", () => {
    const legs = allPassing();
    legs[1] = leg("install", "FAIL", { reason: "nothing was deployed" });
    legs[2] = leg("discovery", "SKIPPED", { reason: "the install leg failed" });

    const row = rowFor("copilot", { legs }) as Row;

    expect(row.status).toBe("failed");
    expect(row.reason).toContain("install FAIL: nothing was deployed");
    expect(row.reason).toContain("discovery SKIPPED");
  });

  it("reports a client the smoke wrote no leg for instead of inventing one", () => {
    expect((rowFor("cursor", undefined) as Row).status).toBe("not-run");
    expect((rowFor("cursor", { legs: [] }) as Row).reason).toContain("wrote no leg for this client");
  });
});

describe("inputsFor — logical labels, this client's and the shared ones", () => {
  const sha256s: Record<string, string> = {
    "scripts/plugin-route-smoke.mjs": "1".repeat(64),
    "dist/claude/stamity-plugin.json": "2".repeat(64),
    "dist/claude/hooks/hooks.json": "3".repeat(64),
    "dist/codex/stamity-plugin.json": "4".repeat(64),
  };

  it("takes this client's root files and the shared instrument, and no other client's", () => {
    const inputs = inputsFor("claude", sha256s) as { path: string; sha256: string }[];

    expect(inputs.map((input) => input.path)).toEqual([
      "dist/claude/hooks/hooks.json",
      "dist/claude/stamity-plugin.json",
      "scripts/plugin-route-smoke.mjs",
    ]);
    // Sorted, so two runs that enumerated the report differently produce one row hash.
    expect(inputs.map((input) => input.sha256)).toEqual(["3".repeat(64), "2".repeat(64), "1".repeat(64)]);
  });

  it("never carries a path that would name the checkout the distribution was built in", () => {
    for (const input of inputsFor("codex", sha256s) as { path: string }[]) {
      expect(input.path, input.path).not.toMatch(/^[/\\]|^[A-Za-z]:[/\\]/);
    }
  });
});

describe("runPluginClients — the smoke could not run", () => {
  const temps: string[] = [];

  afterEach(() => {
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("writes one not-run row per client, redacted, when no --json document was produced", async () => {
    const dir = mkdtempSync(join(tmpdir(), "stamity-qa-plugin-runs-case-"));
    temps.push(dir);

    // A directory with no `release.json` is not a distribution root, so the smoke exits 2 before it
    // reaches a client, a credential or a model call.
    const rows = (await runPluginClients({
      clients: ["claude", "codex"],
      repoRoot: REPO_ROOT,
      distDir: dir,
    })) as Row[];

    expect(rows.map((row) => row.client)).toEqual(["claude", "codex"]);
    for (const row of rows) {
      expect(row.status, row.reason).toBe("not-run");
      expect(row.reason).toContain("wrote no --json document");
      expect(row.reason).toContain("exit 2");
      // The smoke's own words, and the reason it could not run — with nothing in them that names
      // this checkout, this operator's home, or the directory that was passed.
      expect(row.reason).toContain("carries no release.json");
      expect(row.reason, row.reason).not.toContain(HOME);
      expect(row.reason, row.reason).not.toContain(REPO_ROOT);
      expect(row.reason, row.reason).not.toContain(dir);
      expect(row.reason, row.reason).not.toMatch(/\/Users\/|\/home\/[a-z]/);
    }
  }, 60_000);
});
