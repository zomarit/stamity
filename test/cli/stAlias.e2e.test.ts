import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { buildChildEnv, spawnCollect, type CliRunResult } from "../support/cliHarness.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * REQ-FLOW-049: `st` is its own entry, says once that it is going, and otherwise behaves as
 * `stamity`.
 *
 * Both entries run through the TypeScript loader, as `test/smoke.test.ts` runs the CLI, in a
 * pseudo-home the harness's isolation env points at, so no developer state is read. The harness's
 * fixture only spawns `src/cli.ts` or `dist/cli.js`, so this file spawns the two sources itself
 * with the harness's own env builder and collector.
 */

const ST_ENTRY = fileURLToPath(new URL("../../src/st.ts", import.meta.url));
const CLI_ENTRY = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));
const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const DEPRECATION = "stamity: the st command is deprecated and is removed in 2.0.0; run stamity instead.\n";
const getTemp = useTempDir("st-alias");

async function run(entry: string, args: readonly string[]): Promise<CliRunResult> {
  const temp = getTemp();
  const home = {
    home: temp.path("home"),
    configDir: temp.path("home", ".config"),
    cacheDir: temp.path("home", ".cache"),
    stateDir: temp.path("home", ".local", "state"),
  };
  await Promise.all(
    [home.configDir, home.cacheDir, home.stateDir, temp.path("repo")].map((dir) => mkdir(dir, { recursive: true })),
  );
  return spawnCollect(process.execPath, ["--import", TSX_LOADER, entry, ...args], {
    cwd: temp.path("repo"),
    env: buildChildEnv(home),
  });
}

describe("the st alias", () => {
  it("prints the same version as stamity on stdout, and exactly the deprecation line on stderr", async () => {
    const viaSt = await run(ST_ENTRY, ["--version"]);
    const viaStamity = await run(CLI_ENTRY, ["--version"]);

    expect(viaStamity.code).toBe(0);
    expect(viaStamity.stdout).toMatch(/^\d+\.\d+\.\d+/);
    expect(viaSt.code).toBe(0);
    expect(viaSt.stdout).toBe(viaStamity.stdout);
    expect(viaSt.stderr).toBe(DEPRECATION);
  });

  it("leaves stamity's own stderr empty", async () => {
    const result = await run(CLI_ENTRY, ["--version"]);
    expect(result.stderr).toBe("");
  });

  it("keeps --json output to one JSON document on stdout, the line on stderr only", async () => {
    // `--json` is the verb's flag (`check --json`); before the verb both entries refuse it alike.
    const viaSt = await run(ST_ENTRY, ["check", "--json"]);
    const viaStamity = await run(CLI_ENTRY, ["check", "--json"]);

    // An empty folder is not set up, so `check` fails its manifest probe: a non-zero exit, the same on both.
    expect(viaStamity.code).not.toBe(0);
    expect(viaSt.code).toBe(viaStamity.code);
    const document = JSON.parse(viaSt.stdout) as Record<string, unknown>;
    expect(document["command"]).toBe("check");
    expect(viaSt.stdout).not.toContain("deprecated");
    expect(viaSt.stderr.startsWith(DEPRECATION)).toBe(true);
    expect(viaSt.stderr.slice(DEPRECATION.length)).toBe(viaStamity.stderr);
  });
});
