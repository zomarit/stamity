import { describe, expect, it } from "vitest";
import { gateCommand } from "../../../src/cli/commands/gate.ts";
import { runInProcess } from "../../support/inProcess.ts";

/**
 * p1a-classifier-verb (REQ-FLOW-061): `stamity gate classify --paths`, through
 * the in-process funnel, so each case also covers the 0/1/2 exit contract and
 * the one JSON document. `--paths` classifies by path rules alone and reads no
 * file and no git, so no fixture repository is needed and nothing is stubbed.
 */

const run = (argv: readonly string[]) => runInProcess([gateCommand], ["gate", ...argv]);

describe("stamity gate classify --paths", () => {
  it("prints the JSON document for a docs path", async () => {
    const result = await run(["classify", "--paths", "docs/x.md", "--json"]);

    expect(result.code).toBe(0);
    const doc = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(doc).toEqual({
      ok: true,
      command: "gate",
      version: expect.any(String) as string,
      subcommand: "classify",
      base: null,
      paths: ["docs/x.md"],
      class: "docs",
      checks: ["scan", "tests-selected", "review-once"],
      lenses: [],
      reason: expect.stringContaining("no base was given") as string,
      byPath: [{ path: "docs/x.md", class: "docs", rule: "docs/**" }],
    });
  });

  it("takes several paths and reports the strongest class", async () => {
    const result = await run(["classify", "--paths", "docs/x.md", ".stamity/manifest.json", "--json"]);

    expect(result.code).toBe(0);
    const doc = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(doc["class"]).toBe("security-sensitive");
    expect(doc["lenses"]).toEqual(["stamity-security"]);
    expect(doc["paths"]).toEqual(["docs/x.md", ".stamity/manifest.json"]);
  });

  it("prints the class, checks, lenses, reason and one row per path for a person", async () => {
    const result = await run(["classify", "--paths", "docs/x.md", "src/x.ts"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("class: product");
    expect(result.stdout).toContain("checks: scan, gates-all, review");
    expect(result.stdout).toContain("lenses: none");
    expect(result.stdout).toContain("reason: ");
    expect(result.stdout).toMatch(/^ {2}docs\/x\.md {2}docs {2}\(docs\/\*\*\)$/m);
    expect(result.stdout).toMatch(/^ {2}src\/x\.ts {2}product /m);
  });

  it("strips control characters from a path before it reaches the terminal", async () => {
    const result = await run(["classify", "--paths", "docs/a\u001b[31m.md"]);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("\u001b");
  });

  it("exits 2 on an unknown subcommand", async () => {
    const result = await run(["bogus", "--paths", "docs/x.md"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("bogus");
    expect(result.stdout).toBe("");
  });

  it("exits 2 with no path source", async () => {
    const result = await run(["classify", "--json"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--paths");
    expect(result.stdout).toBe("");
  });

  it("exits 2 on an unknown option", async () => {
    const result = await run(["classify", "--paths", "docs/x.md", "--bogus"]);

    expect(result.code).toBe(2);
  });

  it("is hidden and reads only: no --dry-run is registered", async () => {
    expect(gateCommand.hidden).toBe(true);
    expect(gateCommand.mutating).toBe(false);
    const result = await run(["classify", "--paths", "docs/x.md", "--dry-run"]);
    expect(result.code).toBe(2);
  });
});
