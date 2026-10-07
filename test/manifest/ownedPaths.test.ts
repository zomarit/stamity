import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { addCommand } from "../../src/cli/commands/add.ts";
import { planSync } from "../../src/cli/commands/sync/engine.ts";
import { createApp } from "../../src/index.ts";
import { createManifest, writeManifest } from "../../src/manifest/manifest.ts";
import {
  OWNED_PATHS,
  carriesEngineMintedPrefix,
  hasEngineMintedName,
  ownedPathDefect,
  ownedPathKind,
  packDirName,
  type OwnedPathRow,
} from "../../src/manifest/ownedPaths.ts";
import { packDirRelPath } from "../../src/pack/receipt.ts";
import { outputOwners } from "../../src/types/content.ts";
import { TOOLS, type Tool } from "../../src/types/core.ts";
import type { SetupManifest } from "../../src/types/manifest.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The owned-path bound (REQ-PLUGIN-045) is data, not a derivation from the
 * adapters — validation and the sweep sit below them — so this suite is what
 * proves it complete: every row every release wrote, and every row the head's
 * planner plans, lies inside it. A unit that adds an emitted path without
 * extending the bound fails the planner half here the day it lands.
 */

/* oxlint-disable no-await-in-loop */

const ENGINE_VERSION = createApp().version;
const T0 = new Date("2026-10-07T09:00:00.000Z");
const getTemp = useTempDir("owned-paths");

interface ReleasedRows {
  totalRows: number;
  hashlessRows: number;
  sources: { source: string; rows: number }[];
  rows: OwnedPathRow[];
}

const RELEASED = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "released-ledger-rows.json"), "utf8"),
) as ReleasedRows;

describe("OWNED_PATHS", () => {
  it("is frozen all the way down, so no caller can widen the bound at runtime", () => {
    expect(Object.isFrozen(OWNED_PATHS)).toBe(true);
    for (const list of [OWNED_PATHS.exact, OWNED_PATHS.contentRoots, OWNED_PATHS.stateRoots, OWNED_PATHS.importTargets]) {
      expect(Object.isFrozen(list)).toBe(true);
    }
  });

  it("lists the fourteen platform files, the twelve content folders and the two state folders", () => {
    expect(OWNED_PATHS.version).toBe(1);
    expect(OWNED_PATHS.exact).toHaveLength(14);
    expect(OWNED_PATHS.contentRoots).toHaveLength(12);
    expect(OWNED_PATHS.stateRoots).toEqual([".stamity/generated/", ".stamity/mcp/"]);
    expect(OWNED_PATHS.packRoot).toBe(".stamity/packs/");
    expect(OWNED_PATHS.charterFileName).toBe("AGENTS.md");
    for (const root of [...OWNED_PATHS.contentRoots, ...OWNED_PATHS.stateRoots]) expect(root.endsWith("/")).toBe(true);
  });
});

describe("ownedPathKind", () => {
  const tool = (path: string, artifactType = "infra", adapter = "claude"): OwnedPathRow => ({ path, adapter, artifactType });

  it("places each part of the bound", () => {
    expect(ownedPathKind(tool(".cursor/hooks.json", "infra", "cursor"))).toBe("exact");
    expect(ownedPathKind(tool("packages/app/AGENTS.md", "infra", "codex"))).toBe("charter");
    expect(ownedPathKind(tool("src/api/AGENTS.md", "infra", "codex"))).toBe("charter");
    expect(ownedPathKind(tool(".stamity/generated/hooks/claude/stamity-x.mjs"))).toBe("state");
    expect(ownedPathKind(tool(".stamity/mcp/copilot-repo-settings.env", "infra", "copilot"))).toBe("state");
    for (const type of ["agent", "skill", "rule", "command"]) {
      expect(ownedPathKind(tool(".agents/skills/my-skill/SKILL.md", type))).toBe("content");
    }
    expect(ownedPathKind({ path: ".stamity/packs/acme__ops/x.md", adapter: "pack:@acme/ops", artifactType: "infra" })).toBe("pack");
  });

  it.each([
    ["an infra row elsewhere", tool("docs/owner.md")],
    ["an infra row in a content folder", tool(".claude/agents/stamity-x.md")],
    ["an infra row in another state folder", tool(".stamity/learnings/keep-me.md")],
    ["an infra row at a state folder itself", tool(".stamity/generated/")],
    ["a root-level name the engine does not write", tool("GEMINI.md")],
    ["a content row outside every content folder", tool("notes/st-owner.md", "rule")],
    ["a content row at a content folder itself", tool(".claude/agents/", "agent")],
    ["a content row in a state folder", tool(".stamity/generated/x.md", "skill")],
    ["an unknown artifact type", tool(".claude/agents/stamity-x.md", "theme")],
    ["a pack row with a content type", { path: ".stamity/packs/ops/x.md", adapter: "pack:ops", artifactType: "agent" }],
    ["a pack row in another pack's folder", { path: ".stamity/packs/other/x.md", adapter: "pack:ops", artifactType: "infra" }],
    ["a pack row at its folder itself", { path: ".stamity/packs/ops/", adapter: "pack:ops", artifactType: "infra" }],
    ["a pack owner with no id", { path: ".stamity/packs//x.md", adapter: "pack:", artifactType: "infra" }],
    ["a tool row in a pack folder", tool(".stamity/packs/ops/x.md")],
    ["a path climbing out of a content folder", tool(".claude/agents/../../docs/x.md", "agent")],
    ["a path with a dot segment", tool(".claude/./agents/x.md", "agent")],
    ["a path with an empty segment", tool(".claude/agents//x.md", "agent")],
    ["a backslash-separated path", tool(".claude\\agents\\x.md", "agent")],
    ["an absolute path", tool("/AGENTS.md")],
  ] as const)("refuses %s", (_label, row) => {
    expect(ownedPathKind(row)).toBeNull();
    expect(ownedPathDefect(row)).toBe(
      `lies outside the paths a stamity release writes for ${row.artifactType} rows (owner ${row.adapter})`,
    );
  });

  it("has no defect to name for a row inside the bound", () => {
    expect(ownedPathDefect(tool("CLAUDE.md"))).toBeNull();
  });
});

describe("packDirName", () => {
  it.each(["ops", "@acme/ops", "acme.tools"])("agrees with the installer's folder for %j", (packId) => {
    expect(packDirName(packId)).toBe(packDirRelPath(packId).split("/").at(-1));
  });
});

describe("the content-folder name proof", () => {
  it("reads an engine prefix, with or without a two-digit ordering prefix", () => {
    expect(carriesEngineMintedPrefix("stamity-reviewer.md")).toBe(true);
    expect(carriesEngineMintedPrefix("st-work.md")).toBe(true);
    expect(carriesEngineMintedPrefix("30-stamity-style.mdc")).toBe(true);
    expect(carriesEngineMintedPrefix("30-style.mdc")).toBe(false);
    expect(carriesEngineMintedPrefix("my-skill")).toBe(false);
  });

  it("reads the basename and an engine skill folder directly under skills/, and nothing else", () => {
    expect(hasEngineMintedName(".claude/agents/stamity-reviewer.md")).toBe(true);
    expect(hasEngineMintedName(".agents/skills/st-verify/references/ui.md")).toBe(true);
    expect(hasEngineMintedName(".agents/skills/my-skill/SKILL.md")).toBe(false);
    expect(hasEngineMintedName(".claude/rules/stamity-tools/user.md")).toBe(false);
    expect(hasEngineMintedName("stamity-x.md")).toBe(true);
  });
});

describe("every row every release wrote lies in the bound", () => {
  it("covers the frozen rows of 1.0.0 to 1.11.0 and the head, every one hashed", () => {
    // Captured 2026-10-06 (the fixture's `procedure`): fifteen release ledgers
    // and four head fixtures, 5,288 rows, none without a content hash.
    expect(RELEASED.totalRows).toBe(5288);
    expect(RELEASED.hashlessRows).toBe(0);
    expect(RELEASED.sources).toHaveLength(19);
    expect(RELEASED.rows.length).toBeGreaterThan(400);
    const outside = RELEASED.rows.filter((row) => ownedPathKind(row) === null);
    expect(outside).toEqual([]);
  });

  it("puts infra rows only at platform files, charters, state and pack folders, and content rows only in content folders", () => {
    const kinds = new Map<string, Set<string>>();
    for (const row of RELEASED.rows) {
      const kind = ownedPathKind(row) as string;
      kinds.set(row.artifactType, (kinds.get(row.artifactType) ?? new Set()).add(kind));
    }
    expect([...(kinds.get("infra") ?? [])].toSorted()).toEqual(["charter", "exact", "pack", "state"]);
    for (const type of ["agent", "skill", "rule", "command"]) expect([...(kinds.get(type) ?? [])]).toEqual(["content"]);
  });
});

// ── The planner half ───────────────────────────────────────────────────────

interface Scenario {
  label: string;
  tools: readonly Tool[];
  mcp?: readonly string[];
  ruleDelivery?: SetupManifest["ruleDelivery"];
  pluginBacked?: boolean;
  pack?: boolean;
}

/** Owner files every scenario carries: a monorepo package, an API folder, a
 *  user override of each class, and a rule anchored to `src/api/`. */
const REPO_FILES: Readonly<Record<string, string>> = {
  "package.json": `${JSON.stringify({ name: "x", private: true, workspaces: ["packages/*"], scripts: { test: "node --test" } })}\n`,
  "packages/app/package.json": `${JSON.stringify({ name: "app", version: "1.0.0" })}\n`,
  "src/api/index.ts": "export const api = 1;\n",
  ".stamity/overrides/agents/my-helper.md": "---\nid: my-helper\ntype: agent\ndescription: A helper the team wrote.\n---\n\n# My helper\n\nHelp.\n",
  ".stamity/overrides/rules/my-rule.md": '---\nid: my-rule\ntype: rule\ndescription: A team rule.\nglobs: ["**/*.ts"]\n---\n\n# My rule\n\nFollow it.\n',
  ".stamity/overrides/rules/house-api.md": '---\nid: house-api\ntype: rule\ndescription: House rules for the API folder.\nglobs: ["src/api/**"]\n---\n\n# House API\n\nKeep handlers thin.\n',
  ".stamity/overrides/commands/my-cmd.md": "---\nid: my-cmd\ntype: command\ndescription: A team command.\n---\n\n# My command\n\nRun it.\n",
  ".stamity/overrides/skills/my-skill/SKILL.md": "---\nid: my-skill\ntype: skill\ndescription: A team skill for doing a thing well.\n---\n\n# My skill\n\nDo it.\n",
};

async function plannedRows(scenario: Scenario, sub: string): Promise<OwnedPathRow[]> {
  const root = getTemp().path(sub);
  for (const [path, content] of Object.entries(REPO_FILES)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content, "utf8");
  }
  const manifest: SetupManifest = {
    ...createManifest({
      tools: [...scenario.tools],
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: ENGINE_VERSION,
      now: T0,
    }),
    ...(scenario.mcp === undefined ? {} : { mcp: { servers: [...scenario.mcp] } }),
    ...(scenario.ruleDelivery === undefined ? {} : { ruleDelivery: scenario.ruleDelivery }),
    ...(scenario.pluginBacked === true
      ? {
          plugin: {
            mode: "plugin-backed" as const,
            clients: { claude: { version: "1.11.0", classes: ["agent", "skill", "command", "hooks"] as const } },
          },
        }
      : {}),
  };
  await writeManifest(root, manifest, { now: T0 });
  if (scenario.pack === true) {
    const added = await runInProcess([addCommand], ["add", "ops", "-y"], { cwd: root });
    expect(added.code, added.stderr).toBe(0);
  }
  const plan = await planSync(root, ENGINE_VERSION, { runner: () => "" });
  return plan.outputs.flatMap((output) =>
    outputOwners(output).map((owner) => ({ path: output.path, adapter: owner.adapter, artifactType: owner.artifactType })),
  );
}

const ALL = TOOLS;
const SCENARIOS: readonly Scenario[] = [
  ...TOOLS.map((tool) => ({ label: `${tool} alone`, tools: [tool] })),
  { label: "four clients with every MCP dialect", tools: ALL, mcp: ["github", "context7"] },
  { label: "four clients with on-demand rules", tools: ALL, ruleDelivery: "on-demand" },
  { label: "four clients plugin-backed", tools: ALL, pluginBacked: true },
  { label: "four clients with an installed pack", tools: ALL, pack: true },
];

describe("every row the head's planner plans lies in the bound", () => {
  it.each(SCENARIOS.map((scenario, index) => [scenario.label, scenario, index] as const))(
    "%s",
    async (_label, scenario, index) => {
      const rows = await plannedRows(scenario, `repo-${index}`);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.filter((row) => ownedPathKind(row) === null)).toEqual([]);
    },
    60_000,
  );

  it("plans the rows the overrides, the anchored rule and the package charter add", async () => {
    const rows = await plannedRows({ label: "codex", tools: ["codex"] }, "repo-codex-anchored");
    const paths = rows.map((row) => row.path);
    expect(paths).toContain(".agents/skills/my-skill/SKILL.md");
    expect(paths).toContain("src/api/AGENTS.md");
    expect(paths).toContain("packages/app/AGENTS.md");
  }, 60_000);

  it("plans every MCP dialect's document under the four clients", async () => {
    const rows = await plannedRows({ label: "mcp", tools: TOOLS, mcp: ["github"] }, "repo-mcp-dialects");
    const paths = new Set(rows.map((row) => row.path));
    for (const path of [".mcp.json", ".cursor/mcp.json", ".vscode/mcp.json", ".codex/config.toml"]) {
      expect(paths.has(path), path).toBe(true);
    }
  }, 60_000);
});
