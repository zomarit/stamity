import { describe, expect, it } from "vitest";
import { planSync } from "../../src/cli/commands/sync/engine.ts";
import { createApp } from "../../src/index.ts";
import { createManifest, writeManifest } from "../../src/manifest/manifest.ts";
import { OWNED_PATHS } from "../../src/manifest/ownedPaths.ts";
import { TOOLS } from "../../src/types/core.ts";
import { STATE_DIR } from "../../src/types/markers.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * REQ-FLOW-038: every file the engine writes into a folder where users keep
 * files of their own carries a `stamity-` or `st-` name segment, so a
 * hand-written file never shares a name with an engine one and a reviewer
 * tells the two apart by name. The only unprefixed paths are the state
 * directory and the fixed client files a client reads by name.
 *
 * Measured on 1.11.0: of the 201 paths a four-client `init` records, 11 carried
 * no prefixed segment — the fixed client files, the three charters and
 * Cursor's two guards. The guards were the only engine files in a folder
 * owners write to (`.cursor/hooks/`) without the prefix; this suite keeps the
 * next one out.
 */

const ENGINE_VERSION = createApp().version;
const T0 = new Date("2026-10-07T09:00:00.000Z");
const getTemp = useTempDir("name-prefix");

/** The charters, matched by basename at any depth (a package's own charter included). */
const CHARTER_NAMES: ReadonlySet<string> = new Set(["AGENTS.md", "AGENTS.override.md", "CLAUDE.md"]);

/**
 * The fixed client files: a client reads each by this exact name, so the
 * engine cannot choose one. A literal on purpose — the bound's `exact` list
 * also keeps the guards' 1.11.0 names so their rows validate, and those are
 * exactly the names this suite exists to refuse.
 */
const FIXED_CLIENT_FILES: ReadonlySet<string> = new Set([
  ".claude/settings.json",
  ".cursor/hooks.json",
  ".cursor/mcp.json",
  ".codex/config.toml",
  ".codex/hooks.json",
  ".mcp.json",
  ".vscode/mcp.json",
  ".github/hooks/stamity.json",
  ".github/workflows/copilot-setup-steps.yml",
]);

/** A path segment the engine minted: `stamity-…`, or `st-…`, optionally after a two-digit ordering prefix. */
const PREFIXED_SEGMENT = /^(?:\d{2}-)?(?:stamity-|st-)/;

/** The planned paths that break the rule; an empty list is a pass. */
function unprefixed(paths: readonly string[]): string[] {
  return paths.filter((path) => {
    if (path.startsWith(`${STATE_DIR}/`)) return false;
    if (FIXED_CLIENT_FILES.has(path)) return false;
    const segments = path.split("/");
    if (CHARTER_NAMES.has(segments.at(-1) ?? "")) return false;
    return !segments.some((segment) => PREFIXED_SEGMENT.test(segment));
  });
}

/** Every path `sync` plans for all four clients with two MCP servers selected. */
async function plannedPaths(): Promise<string[]> {
  const root = getTemp().path("repo");
  await writeManifest(
    root,
    {
      ...createManifest({
        tools: [...TOOLS],
        selection: { items: { agent: [], skill: [], rule: [], command: [] } },
        generatorVersion: ENGINE_VERSION,
        now: T0,
      }),
      mcp: { servers: ["github", "context7"] },
    },
    { now: T0 },
  );
  const plan = await planSync(root, ENGINE_VERSION, { runner: () => "" });
  return [...new Set(plan.outputs.map((output) => output.path))].toSorted();
}

describe("the engine's files carry the stamity- prefix (REQ-FLOW-038)", () => {
  it("holds every planned path outside .stamity/ and the fixed client files to a stamity- or st- segment, for four clients and two MCP servers", async () => {
    const paths = await plannedPaths();

    // Non-degenerate: every client's shared folders and both MCP documents are
    // in the set, so a pass is a pass over the surface the rule is about.
    expect(paths.length).toBeGreaterThan(100);
    for (const path of [
      ".cursor/hooks/stamity-subagent-guard.mjs",
      ".cursor/hooks/stamity-mcp-guard.mjs",
      ".cursor/mcp.json",
      ".vscode/mcp.json",
      ".mcp.json",
      ".codex/config.toml",
      "AGENTS.md",
      "CLAUDE.md",
    ]) {
      expect(paths, path).toContain(path);
    }
    for (const prefix of [".claude/agents/", ".cursor/rules/", ".github/agents/", ".agents/skills/", ".codex/agents/"]) {
      expect(paths.some((path) => path.startsWith(prefix)), prefix).toBe(true);
    }

    expect(unprefixed(paths)).toEqual([]);
  }, 60_000);

  it("fails naming the path when a planner emits an engine file without the prefix", () => {
    expect(unprefixed([".cursor/hooks/guard.mjs", ".cursor/hooks/stamity-mcp-guard.mjs", ".cursor/hooks.json"])).toEqual([
      ".cursor/hooks/guard.mjs",
    ]);
    // The guards' 1.11.0 names are what the rule refuses.
    expect(unprefixed([".cursor/hooks/subagent-guard.mjs", ".cursor/hooks/mcp-guard.mjs"])).toEqual([
      ".cursor/hooks/subagent-guard.mjs",
      ".cursor/hooks/mcp-guard.mjs",
    ]);
    // A prefixed folder covers what sits in it; a charter is matched at any depth.
    expect(unprefixed([".agents/skills/st-verify/references/x.md", "packages/app/AGENTS.md", ".stamity/manifest.json"])).toEqual([]);
  });

  it("names only fixed client files the bound itself owns", () => {
    for (const path of FIXED_CLIENT_FILES) expect(OWNED_PATHS.exact, path).toContain(path);
    for (const name of CHARTER_NAMES) expect(OWNED_PATHS.exact, name).toContain(name);
  });
});
