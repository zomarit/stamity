import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGACY_CURSOR_GUARD_PATHS } from "../../src/adapters/cursor.ts";
import {
  CURSOR_1_11_0_GUARD_ENTRIES,
  CURSOR_1_11_0_RUNTIME_AGENT_IDS,
  CURSOR_1_11_0_VERSION,
  render1110CursorGuards,
} from "../../src/adapters/cursorLegacyGuards.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The frozen 1.11.0 Cursor guard builder (`src/adapters/cursorLegacyGuards.ts`,
 * REQ-FLOW-038) held to the bytes the PUBLISHED 1.11.0 package wrote, never to
 * the current source.
 *
 * The fixtures under `./fixtures/cursor-guards-1.11.0/` were captured on
 * 2026-10-08 from `@zomarit/stamity@1.11.0`, whose
 * `npm view @zomarit/stamity@1.11.0 dist.integrity` is
 * `sha512-dlbXliTpgkD9ftlavjgS6ztZG/yp0rXqumOgvP6Azm9J7XQCT8cdodvU4jXAQ945Q66Sj3x0KRgP7TJqtQ9ijg==`.
 * Each capture ran in a fresh `git init` scratch repository:
 *
 * - `mcp-guard.mjs.txt`, `subagent-guard.mjs.txt` (a core setup):
 *   `npx -y @zomarit/stamity@1.11.0 init -y --tools cursor`; the ledger held the
 *   ten shipped agents' Cursor rows, `.cursor/agents/stamity-<id>.md`.
 * - `subagent-guard-ops.mjs.txt` (a setup with a pack): the same `init`, then
 *   `add <dir> -y --allow-untrusted` of a local pack holding the `ops` pack's two
 *   agent files (`agents/stamity-devops.md`, `agents/stamity-incident-responder.md`)
 *   and nothing else, then `sync`. The ledger held the ten rows plus
 *   `.cursor/agents/stamity-devops.md` and
 *   `.cursor/agents/stamity-incident-responder.md`. The curated `ops` pack
 *   itself cannot be captured: 1.11.0's own `sync` refuses it on Cursor ("Two
 *   planners emitted different content for
 *   `.agents/skills/st-incident-response/SKILL.md`"), so no 1.11.0 Cursor setup
 *   ever ran with it.
 * - `subagent-guard-override.mjs.txt` (a setup with an override agent): the
 *   same `init`, then `.stamity/overrides/agents/stamity-site-reliability.md`
 *   (`id: site-reliability`, `type: agent`), then `sync`. The ledger held the
 *   ten rows plus `.cursor/agents/stamity-site-reliability.md`.
 *
 * The MCP guard embeds no roster: both later captures wrote the same bytes as
 * the core one. The `.cursor/hooks.json` each capture wrote ran the guards with
 * exactly the two entries {@link CURSOR_1_11_0_GUARD_ENTRIES} pins.
 */

const FIXTURES = join(import.meta.dirname, "fixtures", "cursor-guards-1.11.0");
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");

const SUBAGENT = ".cursor/hooks/subagent-guard.mjs";
const MCP = ".cursor/hooks/mcp-guard.mjs";
const CANONICAL = "@zomarit/stamity";
const OPS_AGENTS = ["stamity-devops", "stamity-incident-responder"];
const OVERRIDE_AGENT = "stamity-site-reliability";

/** The pinned call every embedded hint of a canonical guard carries. */
const CANONICAL_CALL = `npx -y ${CANONICAL}@1.11.0 `;

function guardsFor(agentIds: readonly string[], packageName = CANONICAL, npmChannel?: boolean): ReadonlyMap<string, string> {
  return render1110CursorGuards({ agentIds, packageName, ...(npmChannel === undefined ? {} : { npmChannel }) });
}

describe("the frozen 1.11.0 Cursor guard builder reproduces the published 1.11.0 bytes", () => {
  it("renders both guards at 1.11.0's names, the paths the engine reads as the old guards", () => {
    expect([...guardsFor(CURSOR_1_11_0_RUNTIME_AGENT_IDS).keys()].toSorted()).toEqual([...LEGACY_CURSOR_GUARD_PATHS].toSorted());
    expect(CURSOR_1_11_0_VERSION).toBe("1.11.0");
    expect(CURSOR_1_11_0_RUNTIME_AGENT_IDS).toHaveLength(10);
  });

  it("a core setup: the ten shipped ids and the canonical package give each guard's published bytes", () => {
    const guards = guardsFor(CURSOR_1_11_0_RUNTIME_AGENT_IDS);
    expect(guards.get(SUBAGENT)).toBe(fixture("subagent-guard.mjs.txt"));
    expect(guards.get(MCP)).toBe(fixture("mcp-guard.mjs.txt"));
    // The canonical package has an npm channel: `true` renders as an absent channel does.
    expect(guardsFor(CURSOR_1_11_0_RUNTIME_AGENT_IDS, CANONICAL, true)).toEqual(guards);
  });

  it("a setup with a pack: the pack's agents widen the spawn guard's roster, and the MCP guard is unchanged", () => {
    const guards = guardsFor([...CURSOR_1_11_0_RUNTIME_AGENT_IDS, ...OPS_AGENTS]);
    expect(guards.get(SUBAGENT)).toBe(fixture("subagent-guard-ops.mjs.txt"));
    expect(guards.get(SUBAGENT)).not.toBe(fixture("subagent-guard.mjs.txt"));
    expect(guards.get(MCP)).toBe(fixture("mcp-guard.mjs.txt"));
  });

  it("a setup with an override agent: its id joins the roster as 1.11.0 rendered it", () => {
    const guards = guardsFor([...CURSOR_1_11_0_RUNTIME_AGENT_IDS, OVERRIDE_AGENT]);
    expect(guards.get(SUBAGENT)).toBe(fixture("subagent-guard-override.mjs.txt"));
  });

  it("the roster is de-duplicated and sorted, as 1.11.0 did: order and repeats do not move a byte", () => {
    const shuffled = [...OPS_AGENTS, ...CURSOR_1_11_0_RUNTIME_AGENT_IDS.toReversed(), ...OPS_AGENTS];
    expect(guardsFor(shuffled).get(SUBAGENT)).toBe(fixture("subagent-guard-ops.mjs.txt"));
  });

  it("a fork's package name and no npm channel: each guard is the core bytes with every embedded call respelled, and differs nowhere else", () => {
    const guards = guardsFor(CURSOR_1_11_0_RUNTIME_AGENT_IDS, "@acme/stamity", false);
    for (const [path, name] of [
      [SUBAGENT, "subagent-guard.mjs.txt"],
      [MCP, "mcp-guard.mjs.txt"],
    ] as const) {
      const core = fixture(name);
      const calls = core.split(CANONICAL_CALL).length - 1;
      expect(calls, path).toBeGreaterThan(0);
      expect(guards.get(path), path).toBe(core.replaceAll(CANONICAL_CALL, "npx --no @acme/stamity@1.11.0 "));
      // Only the lines carrying a call moved.
      const before = core.split("\n");
      const after = (guards.get(path) ?? "").split("\n");
      expect(after).toHaveLength(before.length);
      const moved = before.filter((line, index) => line !== after[index]);
      expect(moved.length, path).toBeGreaterThan(0);
      for (const line of moved) expect(line, path).toContain(CANONICAL_CALL);
    }
  });

  it("refuses a package name 1.11.0 could not render, as its cliCallHint did", () => {
    expect(() => guardsFor(CURSOR_1_11_0_RUNTIME_AGENT_IDS, "-rf")).toThrow(/not a runnable npm package name/u);
  });

  it("pins the .cursor/hooks.json entry 1.11.0 rendered for each guard, under its event", () => {
    expect(Object.fromEntries(CURSOR_1_11_0_GUARD_ENTRIES)).toEqual({
      [SUBAGENT]: { event: "subagentStart", entry: { command: `node ${SUBAGENT}`, failClosed: true } },
      [MCP]: { event: "beforeMCPExecution", entry: { command: `node ${MCP}`, failClosed: true } },
    });
  });
});

/**
 * The copy against a live 1.11.0 CLI, armed in the pattern of
 * `test/ci/pluginLifecycle.test.ts`'s walks: `STAMITY_V1_11_0_BIN` names a
 * 1.11.0 CLI (an executable, or a `.js` entry run with this Node). Skipped
 * otherwise; the hermetic cases above hold the copy to the captured bytes.
 */
const V1_11_0_BIN = process.env["STAMITY_V1_11_0_BIN"];
const getTemp = useTempDir("cursor-legacy-guards");

describe.skipIf(V1_11_0_BIN === undefined)("the copy against a live 1.11.0 CLI (armed by STAMITY_V1_11_0_BIN; skipped when unset)", () => {
  it("init -y --tools cursor in a scratch repository writes the copy's core bytes and each pinned entry", async () => {
    const bin = V1_11_0_BIN ?? "";
    const root = getTemp().path("repo");
    await getTemp().seedFiles({ "repo/.keep": "" });
    expect(spawnSync("git", ["init", "-q"], { cwd: root }).status).toBe(0);
    const [command, args] = bin.endsWith(".js") ? [process.execPath, [bin]] : [bin, []];
    const run = spawnSync(command, [...args, "init", "-y", "--tools", "cursor"], { cwd: root, encoding: "utf8" });
    expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);

    const guards = guardsFor(CURSOR_1_11_0_RUNTIME_AGENT_IDS);
    for (const path of LEGACY_CURSOR_GUARD_PATHS) {
      expect(readFileSync(join(root, path), "utf8"), path).toBe(guards.get(path));
    }
    const hooks = (JSON.parse(readFileSync(join(root, ".cursor", "hooks.json"), "utf8")) as { hooks: Record<string, unknown[]> }).hooks;
    for (const [path, pin] of CURSOR_1_11_0_GUARD_ENTRIES) {
      expect(hooks[pin.event], path).toEqual([pin.entry]);
    }
  }, 120_000);
});
