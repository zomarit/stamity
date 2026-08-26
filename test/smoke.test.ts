import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createApp, VERSION } from "../src/index.ts";

const execFileAsync = promisify(execFile);
const packageJson = createRequire(import.meta.url)("../package.json") as {
  version: string;
  bin: Record<string, string>;
};
const cliEntry = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

/** Runs the CLI source through the TypeScript loader; no build step required. */
async function runCli(args: readonly string[]): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--import", "tsx", cliEntry, ...args],
      { env: { ...process.env, NO_COLOR: "1" } },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: failure.code ?? -1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

describe("createApp", () => {
  it("reports the package version", () => {
    expect(createApp().version).toBe(packageJson.version);
    expect(VERSION).toBe(packageJson.version);
  });

  it("defaults its runtime to the live process", () => {
    const app = createApp();

    expect(app.runtime.cwd).toBe(process.cwd());
    expect(app.runtime.env).toBe(process.env);
    expect(app.runtime.clock.now()).toBeInstanceOf(Date);
  });

  it("takes injected runtime facts instead of reaching for globals", () => {
    const fixedNow = new Date("2026-01-01T00:00:00.000Z");
    const app = createApp({
      cwd: "/workspace/fixture",
      env: { STAMITY_TEST: "1" },
      clock: { now: () => fixedNow },
    });

    expect(app.runtime.cwd).toBe("/workspace/fixture");
    expect(app.runtime.env["STAMITY_TEST"]).toBe("1");
    expect(app.runtime.clock.now()).toBe(fixedNow);
  });
});

describe("cli", () => {
  it("prints the package version on --version and exits 0", async () => {
    const result = await runCli(["--version"]);

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(packageJson.version);
  });

  // The P0 doctor assertions (run + help-exclusion) are gone WITH the hidden
  // doctor command itself: its diagnostics were absorbed into `stamity check`
  // covered by test/cli/commands/check.test.ts and the e2e surface.
  it("prints usage on --help and exits 0", async () => {
    const result = await runCli(["--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("stamity");
    expect(result.stdout).toContain("Usage:");
  });

  it("exits 2 on an unknown command", async () => {
    const result = await runCli(["definitely-not-a-command"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown command");
  });

  it("declares the built bin entry it will ship as", () => {
    expect(packageJson.bin["stamity"]).toBe("./dist/cli.js");
  });
});
