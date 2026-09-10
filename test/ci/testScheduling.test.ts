import { readdir } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createVitest } from "vitest/node";
import config, { fixtureScheduling } from "../../vitest.config.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const HEAVY = [
  "test/cli/commands/syncMcpOwnership.test.ts",
  "test/pack/installSmoke.e2e.test.ts",
  "test/upstream/lane.test.ts",
];

// 2026-09-11: unchanged Windows inputs hit a common stall across these three
// real-filesystem suites. Check Vitest's resolved projects and actual discovery,
// not just our include literals: grouping must lose/duplicate no test, retain
// the existing budgets, and leave the rest of the suite's parallelism intact.
describe("Windows fixture scheduling", () => {
  it("isolates exactly the observed three suites without losing or repeating any test file", async () => {
    const runner = await createVitest(
      { watch: false, run: true, config: false, root: ROOT },
      { test: { ...config.test, ...fixtureScheduling("win32") } },
    );
    try {
      const specs = await runner.globTestSpecifications();
      const discovered = specs.map((spec) => relative(ROOT, spec.moduleId).replaceAll("\\", "/"));
      const files = (await readdir(new URL("../../test/", import.meta.url), { recursive: true }))
        .filter((file) => file.endsWith(".test.ts"))
        .map((file) => `test/${file.replaceAll("\\", "/")}`);
      expect(discovered.toSorted()).toEqual(files.toSorted());
      expect(new Set(discovered).size).toBe(discovered.length);

      const parallel = runner.projects.find((project) => project.name === "parallel");
      const heavy = runner.projects.find((project) => project.name === "windows-fixtures");
      expect(runner.projects.map((project) => project.name).toSorted())
        .toEqual(["parallel", "windows-fixtures"]);
      expect(specs.filter((spec) => spec.project === heavy)
        .map((spec) => relative(ROOT, spec.moduleId).replaceAll("\\", "/")).toSorted()).toEqual(HEAVY);
      expect(parallel?.config.maxWorkers).toBeUndefined();
      expect(parallel?.config.sequence.groupOrder).toBe(0);
      expect(heavy?.config.maxWorkers).toBe(1);
      expect(heavy?.config.sequence.groupOrder).toBe(1);
      for (const project of runner.projects) {
        expect(project.config.testTimeout).toBe(20_000);
        expect(project.config.hookTimeout).toBe(20_000);
        expect(project.config.isolate).toBe(true);
        expect(project.config.retry ?? 0).toBe(0);
      }
      // Coverage/reporting remain root-level and aggregate both projects.
      expect(runner.config.coverage.thresholds).toEqual(config.test?.coverage?.thresholds);
    } finally {
      await runner.close();
    }
  });

  it.each(["darwin", "linux"] as const)("keeps %s scheduling unchanged", (platform) => {
    expect(fixtureScheduling(platform)).toEqual({});
  });

  it("selects the actual host's scheduling without changing the root timeouts", () => {
    expect(config.test?.projects).toEqual(fixtureScheduling(process.platform).projects);
    expect(config.test?.testTimeout).toBe(20_000);
    expect(config.test?.hookTimeout).toBe(20_000);
  });
});
