import { execFileSync } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeCliFixture } from "../support/cliHarness.ts";

const compiler = join(dirname(createRequire(import.meta.url).resolve("typescript/package.json")), "bin", "tsc");

describe("REQ-FINISH-004 — a fresh repository's technical first change", () => {
  it("recovers a missing generated charter and proves one change through every declared gate", { timeout: 120_000 }, async () => {
    const fixture = await makeCliFixture({ git: true, seed: {
      "package.json": JSON.stringify({ name: "first-change-fixture", private: true, type: "module", scripts: {
        lint: "node --check src/count.mjs",
        typecheck: `${JSON.stringify(process.execPath)} ${JSON.stringify(compiler)} --allowJs --checkJs --noEmit --skipLibCheck --target ES2022 src/count.mjs`,
        test: "node --test test/count.test.mjs",
      } }),
      "src/count.mjs": "/** @param {number} left @param {number} right */\nexport const count = (left, right) => left - right;\n",
      "test/count.test.mjs": "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { count } from '../src/count.mjs';\ntest('combines both nonzero counts', () => assert.equal(count(2, 3), 5));\n",
    } });
    const timings: { step: string; milliseconds: number; exitCode: number }[] = [];
    async function run(args: string[]) {
      const start = performance.now();
      const result = await fixture.run(args);
      timings.push({ step: args.join(" "), milliseconds: Math.round(performance.now() - start), exitCode: result.code });
      return result;
    }
    try {
      expect((await run(["init", "--tools", "claude", "-y"])).code).toBe(0);
      expect((await run(["check"])).code).toBe(0);
      const charter = await readFile(join(fixture.repoDir, "AGENTS.md"), "utf8");
      expect(charter).toContain("npm run lint");
      expect(charter).toContain("npm run typecheck");
      expect(charter).toContain("npm run test");
      await unlink(join(fixture.repoDir, "AGENTS.md"));
      expect((await run(["check"])).code).toBe(1);
      expect((await run(["sync"])).code).toBe(0);
      expect(await readFile(join(fixture.repoDir, "AGENTS.md"), "utf8")).toBe(charter);
      expect((await run(["check"])).code).toBe(0);
      expect(() => execFileSync(process.execPath, ["--test", "test/count.test.mjs"], { cwd: fixture.repoDir, stdio: "pipe" })).toThrow();
      await writeFile(join(fixture.repoDir, "src/count.mjs"), "/** @param {number} left @param {number} right */\nexport const count = (left, right) => left + right;\n");
      for (const [name, command, args] of [
        ["lint", process.execPath, ["--check", "src/count.mjs"]],
        ["typecheck", process.execPath, [compiler, "--allowJs", "--checkJs", "--noEmit", "--skipLibCheck", "--target", "ES2022", "src/count.mjs"]],
        ["test", process.execPath, ["--test", "test/count.test.mjs"]],
      ] as const) {
        const start = performance.now();
        try { execFileSync(command, [...args], { cwd: fixture.repoDir, stdio: "pipe" }); }
        catch (error) { throw new Error(`${name}: ${String((error as { stdout?: Buffer }).stdout)}`, { cause: error }); }
        timings.push({ step: name, milliseconds: Math.round(performance.now() - start), exitCode: 0 });
      }
      // The compiler is the repository's pinned development dependency; this proves a
      // technical journey, not a cold network install or a real beginner's elapsed time.
      console.info(`AGENT_RUN_TIMINGS ${JSON.stringify(timings)}`);
    } finally {
      await fixture.cleanup();
    }
  });
});
