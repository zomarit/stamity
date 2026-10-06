import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ADAPTER_REGISTRY } from "../../src/adapters/registry.ts";
import type { ContentRoots } from "../../src/content/catalog.ts";
import { composeEmissionPlanner, type EmissionContext } from "../../src/emit/planner.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import { applyPackInstall, planPackInstall } from "../../src/pack/install.ts";
import type { PackReach } from "../../src/types/content.ts";
import type { Tool } from "../../src/types/core.ts";
import { EngineError } from "../../src/types/errors.ts";
import type { SetupManifest } from "../../src/types/manifest.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The emission plan's `packReach` (run 2026-10-03_pack-engine-defects, unit
 * u4b-pack-reach-row): per installed pack, which selected clients each
 * artifact reaches and why it misses the others. `check`'s `pack-reach` row
 * reads it, so a pack that installs and reaches no client — a command-only pack
 * under a plugin that carries commands — stops passing as healthy.
 *
 * No mocks: real temp repositories, packs installed through the engine's own
 * plan/apply path, the bundled corpus, and the production adapter registry.
 * Each judged case is anchored to the rows the same plan emits, so a reach
 * verdict that disagreed with what the adapters wrote would fail here.
 */

const getRepo = useTempDir("planner-pack-reach");

const FIXED_NOW = new Date("2026-10-03T00:00:00.000Z");
const ENGINE_VERSION = "0.0.0-test";
const ALL: Tool[] = ["claude", "cursor", "copilot", "codex"];

const sha256 = (body: string): string => createHash("sha256").update(body, "utf8").digest("hex");

/** A corpus-shaped artifact; `tools` adds the frontmatter restriction. */
function artifact(id: string, type: string, tools?: readonly Tool[]): string {
  return [
    "---",
    `id: ${id}`,
    `type: ${type}`,
    `description: "Fixture ${type} ${id} for the pack-reach suite."`,
    "tags: [orchestration]",
    "load: on-demand",
    `obsolete_when: fixture ${id} trigger`,
    ...(tools === undefined ? [] : [`tools: [${tools.join(", ")}]`]),
    "---",
    "",
    `# ${id}`,
    "",
    "Fixture body.",
    "",
  ].join("\n");
}

const HOOKS = `${JSON.stringify(
  {
    hooks: [
      {
        event: "pre_tool_use",
        matcher: "Bash",
        command: ["node", ".stamity/hooks/acme-probe.mjs"],
        timeoutMs: 2500,
      },
    ],
  },
  null,
  2,
)}\n`;

/** A pack-supplied MCP definition that clears the install gate (`test/pack/install.test.ts`). */
const SERVER = `${JSON.stringify(
  {
    id: "packtel",
    description: "Telemetry queries against the team's own collector.",
    command: "npx",
    args: ["-y", "@acme/telemetry-mcp@1.4.2"],
    transport: "stdio",
    pinnedVersion: "1.4.2",
    packageNameLock: "@acme/telemetry-mcp",
    blastRadius: "Low — read-only queries against a staging collector.",
    docsUrl: "https://example.invalid/telemetry-mcp",
  },
  null,
  2,
)}\n`;

/** One of every class a pack ships. */
const EVERY_CLASS: Record<string, string> = {
  "skills/st-acme-skill/SKILL.md": artifact("acme-skill", "skill"),
  "commands/st-acme-cmd.md": artifact("acme-cmd", "command"),
  "agents/stamity-acme-agent.md": artifact("acme-agent", "agent"),
  "rules/stamity-acme-rule.md": artifact("acme-rule", "rule"),
  "hooks/hooks.json": HOOKS,
  "mcp_servers/telemetry.json": SERVER,
};

/**
 * Stage a pack outside the state dir, with a sha256 integrity map over its
 * files. `declaredTools` is the install gate's cross-check: content that names a
 * client in its `tools:` list must find it declared here.
 */
async function stagePack(
  packId: string,
  files: Record<string, string>,
  declaredTools?: readonly Tool[],
): Promise<string> {
  const manifest = {
    name: packId,
    version: "1.0.0",
    integrity: Object.fromEntries(Object.entries(files).map(([rel, body]) => [rel, sha256(body)])),
    ...(declaredTools === undefined ? {} : { declaredTools }),
  };
  await getRepo().seedFiles({
    ...Object.fromEntries(
      Object.entries(files).map(([rel, body]) => [`pack-src/${packId}/${rel}`, body]),
    ),
    [`pack-src/${packId}/pack.json`]: `${JSON.stringify(manifest, null, 2)}\n`,
  });
  return getRepo().path("pack-src", packId);
}

async function installPack(
  packId: string,
  files: Record<string, string>,
  manifest: SetupManifest,
  declaredTools?: readonly Tool[],
): Promise<SetupManifest> {
  // The script a pack hook names must exist (the hook lane's launcher check).
  await getRepo().seedFiles({ ".stamity/hooks/acme-probe.mjs": "process.exit(0)\n" });
  const plan = await planPackInstall(
    getRepo().dir,
    await stagePack(packId, files, declaredTools),
    { allowUntrusted: true },
  );
  expect(plan.collisions).toEqual([]);
  const applied = await applyPackInstall(getRepo().dir, plan, manifest, {
    engineVersion: ENGINE_VERSION,
    now: FIXED_NOW,
  });
  expect(applied.result.installed).toBe(true);
  return applied.manifest;
}

function manifestFor(tools: Tool[], plugin?: SetupManifest["plugin"]): SetupManifest {
  return {
    ...createManifest({
      tools,
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: ENGINE_VERSION,
      now: FIXED_NOW,
    }),
    ...(plugin === undefined ? {} : { plugin }),
  };
}

function ctxOf(manifest: SetupManifest, contentRoot?: ContentRoots): EmissionContext {
  return {
    rootDir: getRepo().dir,
    manifest,
    engineVersion: ENGINE_VERSION,
    facts: { monorepoPackages: [] },
    ...(contentRoot === undefined ? {} : { contentRoot }),
  };
}

async function planOf(
  manifest: SetupManifest,
): Promise<{ paths: string[]; packReach: PackReach[] | undefined }> {
  const plan = await composeEmissionPlanner(ADAPTER_REGISTRY).planWithWarnings(ctxOf(manifest));
  return { paths: plan.outputs.map((row) => row.path), packReach: plan.packReach };
}

const HOOK_FILE = ".stamity/packs/acme/hooks/hooks.json";

describe("composeEmissionPlanner — packReach", () => {
  it("is empty when no pack is installed", async () => {
    const { packReach } = await planOf(manifestFor(["cursor"]));
    expect(packReach).toEqual([]);
  });

  it("judges every class of a pack reached by all four clients in generated mode", async () => {
    const manifest = await installPack("acme", EVERY_CLASS, manifestFor(ALL));

    const { paths, packReach } = await planOf(manifest);

    expect(packReach).toEqual([
      {
        packId: "acme",
        artifacts: expect.arrayContaining([
          { kind: "skill", id: "st-acme-skill", reachedBy: ALL, dropped: [] },
          { kind: "command", id: "st-acme-cmd", reachedBy: ALL, dropped: [] },
          { kind: "agent", id: "stamity-acme-agent", reachedBy: ALL, dropped: [] },
          { kind: "rule", id: "stamity-acme-rule", reachedBy: ALL, dropped: [] },
          { kind: "hooks", id: HOOK_FILE, reachedBy: ALL, dropped: [] },
          // TEST CHANGE, justified: 2026-10-06, run 2026-10-03_pack-engine-defects
          // review/25. This entry pinned `reachedBy: ALL` for a server this
          // manifest never selects, and emission writes only the ids
          // `manifest.mcp.servers` selects (`src/mcp/emit.ts` →
          // `McpRenderOptions.packServers`), so the old pin asserted a delivery
          // no row makes. The selected case is its own test below.
          { kind: "mcp-server", id: "packtel", reachedBy: [], dropped: [{ reason: "not selected" }] },
        ]),
      },
    ]);
    expect(packReach?.[0]?.artifacts).toHaveLength(6);
    // The rows agree: no MCP document is written for an unselected server.
    expect(paths).not.toContain(".mcp.json");
    // Anchored to the rows: what the reach calls delivered, the adapters wrote.
    expect(paths).toEqual(
      expect.arrayContaining([
        ".claude/commands/st-acme-cmd.md",
        ".github/prompts/st-acme-cmd.prompt.md",
        ".agents/skills/st-acme-cmd/SKILL.md",
        ".claude/agents/stamity-acme-agent.md",
        ".cursor/agents/stamity-acme-agent.md",
        ".github/agents/stamity-acme-agent.agent.md",
        ".codex/agents/stamity-acme-agent.toml",
        ".claude/skills/st-acme-skill/SKILL.md",
        ".agents/skills/st-acme-skill/SKILL.md",
      ]),
    );
  });

  it("drops a class each client's plugin carries, and keeps the pack skill everywhere", async () => {
    const manifest = await installPack(
      "acme",
      EVERY_CLASS,
      manifestFor(["claude", "codex"], {
        mode: "plugin-backed",
        clients: {
          claude: { version: "1.11.0", classes: ["agent", "skill", "command", "hooks"] },
          codex: { version: "1.11.0", classes: ["skill", "hooks"] },
        },
      }),
    );

    const { paths, packReach } = await planOf(manifest);
    const byKind = new Map(packReach?.[0]?.artifacts.map((entry) => [entry.kind, entry]));

    expect(byKind.get("skill")).toEqual({
      kind: "skill",
      id: "st-acme-skill",
      reachedBy: ["claude", "codex"],
      dropped: [],
    });
    expect(byKind.get("command")).toEqual({
      kind: "command",
      id: "st-acme-cmd",
      reachedBy: ["codex"],
      dropped: [{ reason: "plugin-owned", tool: "claude", cls: "command" }],
    });
    expect(byKind.get("agent")?.reachedBy).toEqual(["codex"]);
    expect(byKind.get("rule")).toEqual({
      kind: "rule",
      id: "stamity-acme-rule",
      reachedBy: ["claude", "codex"],
      dropped: [],
    });
    expect(byKind.get("hooks")).toEqual({
      kind: "hooks",
      id: HOOK_FILE,
      reachedBy: [],
      dropped: [
        { reason: "plugin-owned", tool: "claude", cls: "hooks" },
        { reason: "plugin-owned", tool: "codex", cls: "hooks" },
      ],
    });
    // The rows agree: Codex receives the command, Claude does not.
    expect(paths).toContain(".agents/skills/st-acme-cmd/SKILL.md");
    expect(paths).not.toContain(".claude/commands/st-acme-cmd.md");
    expect(paths).toContain(".claude/skills/st-acme-skill/SKILL.md");
  });

  it("reads an artifact's own tools: list — a drop only when it names no selected client", async () => {
    const manifest = await installPack(
      "acme",
      {
        "commands/st-acme-cmd.md": artifact("acme-cmd", "command", ["copilot"]),
        "agents/stamity-acme-agent.md": artifact("acme-agent", "agent", ["claude", "copilot"]),
      },
      manifestFor(["claude", "cursor"]),
      ["claude", "copilot"],
    );

    const { paths, packReach } = await planOf(manifest);

    expect(packReach).toEqual([
      {
        packId: "acme",
        artifacts: [
          {
            kind: "agent",
            id: "stamity-acme-agent",
            reachedBy: ["claude"],
            // Cursor is not a drop: the artifact never named it.
            dropped: [],
          },
          {
            kind: "command",
            id: "st-acme-cmd",
            reachedBy: [],
            dropped: [{ reason: "declares no selected client", declared: ["copilot"] }],
          },
        ],
      },
    ]);
    expect(paths).toContain(".claude/agents/stamity-acme-agent.md");
    expect(paths).not.toContain(".cursor/agents/stamity-acme-agent.md");
  });

  it("counts a pack's MCP server as reaching nothing until the manifest selects it", async () => {
    const manifest = await installPack(
      "acme",
      { "mcp_servers/telemetry.json": SERVER },
      manifestFor(ALL),
    );

    const { paths, packReach } = await planOf(manifest);

    expect(packReach).toEqual([
      {
        packId: "acme",
        artifacts: [
          { kind: "mcp-server", id: "packtel", reachedBy: [], dropped: [{ reason: "not selected" }] },
        ],
      },
    ]);
    expect(paths).not.toContain(".mcp.json");
    expect(paths).not.toContain(".cursor/mcp.json");
    expect(paths).not.toContain(".vscode/mcp.json");
  });

  it("counts a selected pack MCP server as reaching every selected client", async () => {
    const installed = await installPack(
      "acme",
      { "mcp_servers/telemetry.json": SERVER },
      manifestFor(ALL),
    );
    const manifest: SetupManifest = { ...installed, mcp: { ...installed.mcp, servers: ["packtel"] } };

    const plan = await composeEmissionPlanner(ADAPTER_REGISTRY).planWithWarnings(ctxOf(manifest));

    expect(plan.packReach).toEqual([
      {
        packId: "acme",
        artifacts: [{ kind: "mcp-server", id: "packtel", reachedBy: ALL, dropped: [] }],
      },
    ]);
    // Anchored to the rows: each client's MCP document carries the server.
    const contentOf = (path: string): string =>
      plan.outputs.find((row) => row.path === path)?.content ?? "";
    for (const path of [".mcp.json", ".cursor/mcp.json", ".vscode/mcp.json", ".codex/config.toml"]) {
      expect(contentOf(path), path).toContain("packtel");
    }
  });

  it("reports each installed pack under its own id, sorted, with only its own artifacts", async () => {
    const first = await installPack(
      "zeta",
      { "commands/st-zeta-cmd.md": artifact("zeta-cmd", "command") },
      manifestFor(["claude"], {
        mode: "plugin-backed",
        clients: { claude: { version: "1.11.0", classes: ["command"] } },
      }),
    );
    const manifest = await installPack(
      "alpha",
      { "skills/st-alpha-skill/SKILL.md": artifact("alpha-skill", "skill") },
      first,
    );

    const { packReach } = await planOf(manifest);

    expect(packReach).toEqual([
      {
        packId: "alpha",
        artifacts: [{ kind: "skill", id: "st-alpha-skill", reachedBy: ["claude"], dropped: [] }],
      },
      {
        packId: "zeta",
        artifacts: [
          {
            kind: "command",
            id: "st-zeta-cmd",
            reachedBy: [],
            dropped: [{ reason: "plugin-owned", tool: "claude", cls: "command" }],
          },
        ],
      },
    ]);
  });
});

/**
 * The name-clash refusal's fixed text has to fit every clash it can carry
 * (review/23 of run 2026-10-03_pack-engine-defects): no "hides the command"
 * where no command is involved, no empty "Move one owner" heading when every
 * owner is core, and a next step that does not assume `sync` raised it. Both
 * cases plan a fixture corpus with no pack and no override: the clash is the
 * package's own, which only a defective package (or fork) can ship.
 */
describe("composeEmissionPlanner — a name clash only core content claims", () => {
  async function refusalFor(files: Record<string, string>): Promise<EngineError> {
    await getRepo().seedFiles(
      Object.fromEntries(Object.entries(files).map(([rel, body]) => [`corpus/${rel}`, body])),
    );
    const outcome = await composeEmissionPlanner(ADAPTER_REGISTRY)
      .planWithWarnings(ctxOf(manifestFor(["cursor"]), { root: getRepo().path("corpus") }))
      .then(
        () => null,
        (cause: unknown) => cause,
      );
    expect(outcome, "the plan built; a name clash must refuse it").toBeInstanceOf(EngineError);
    return outcome as EngineError;
  }

  it("names the clash as the package's defect, with no remedy heading", async () => {
    const refusal = await refusalFor({
      "commands/st-drill.md": artifact("drill", "command"),
      "skills/st-drill/SKILL.md": artifact("drill", "skill"),
    });

    expect(refusal.code).toBe("VALIDATION_ERROR");
    expect(refusal.message).toContain(
      "st-drill: every owner is core content shipped with this package",
    );
    expect(refusal.message).not.toContain("Move one owner");
    expect(refusal.why).toContain("on Claude a skill hides the command");
    expect(refusal.next).toContain("report the clash to the package's maintainers");
    expect(refusal.next).not.toContain("stamity sync");
  });

  it("says nothing of a hidden command when the clash is a skill and a rule", async () => {
    // A rule delivered as a skill lands in `stamity-<id>`, the folder this
    // skill's directory also names: two skill folders, no command at all.
    const refusal = await refusalFor({
      "rules/stamity-acme.md": artifact("acme", "rule"),
      "skills/stamity-acme/SKILL.md": artifact("stamity-acme", "skill"),
    });

    expect(refusal.message).toContain("stamity-acme — ");
    expect(refusal.why).toContain("one skill folder");
    expect(refusal.why).not.toContain("command");
  });
});
