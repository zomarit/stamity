import { readFileSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPluginSetup,
  planPluginSetup,
  type PluginSetupRoot,
} from "../../../src/cli/commands/plugin/setup.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../../src/content/contentRoot.ts";
import { collectManifestErrors, readManifest } from "../../../src/manifest/manifest.ts";
import type { PluginCapabilityFile } from "../../../src/plugins/capabilityFile.ts";
import { EngineError } from "../../../src/types/errors.ts";
import { PLUGIN_OWNED_CLASSES } from "../../../src/types/manifest.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * The companion package a generated root names, READ from this checkout rather
 * than spelled. `test/ci/forkIdentity.test.ts` holds every CLI suite to that:
 * a downstream fork renames the package and must not have to edit a test, and
 * the name is incidental to everything asserted here anyway.
 */
const COMPANION_PACKAGE = (
  JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
    name: string;
  }
).name;

/**
 * The setup engine behind `stamity plugin setup` (REQ-PLUGIN-015).
 *
 * No mocks, including the emission planner: `beforeEach` seeds the minimal
 * charter-bearing corpus at the pinned content root — the same technique
 * `./init.test.ts` uses, and for the same reason. The whole
 * claim of this unit is WHICH FILES a plugin-backed setup writes, and a
 * substituted planner would let that claim pass against an emission set the
 * test itself invented.
 *
 * What this unit owns and what it does not: the boundary is RECORDED here (the
 * manifest's `plugin` field, built from each root's capability file), and it is
 * ENFORCED by unit C3's ownership pass in the emission planner.
 *
 * Filed beside the other command suites rather than under `test/plugins/`
 * because the module under test is a CLI-layer one: `src/cli/commands/plugin/setup.ts`
 * composes init's two halves and therefore cannot live in the engine (see that
 * file's header). The flattened name follows `./initPlan.test.ts` and
 * `./configMcp.test.ts`, which is how this tree spells a nested command module. Until C3 lands,
 * a plugin-backed apply still emits the classes the plugin carries, so the
 * cases that assert their absence are `it.skip` with C3 named as the owner
 * rather than weakened into an assertion that would pass either way.
 */

const getTemp = useTempDir("plugin-setup");

/**
 * A corpus with one artifact of every class the boundary can move, plus the
 * charter core emission requires and one GLOB-scoped rule.
 *
 * Non-degenerate on purpose. A charter-only corpus emits no agent, skill or
 * command file at all, so "0 files of a carried class" would hold against an
 * engine that had never heard of the boundary — the assertion would pass for
 * the wrong reason. The glob-scoped rule is the other half: REQ-PLUGIN-015
 * names `.claude/rules/*` as a path the repository keeps even when the plugin
 * carries everything else, and only a rule with `globs` renders there.
 */
function artifact(
  id: string,
  type: string,
  extra: readonly string[] = [],
  body = "Fixture guidance body.",
): string {
  return [
    "---",
    `id: ${id}`,
    `type: ${type}`,
    `description: "fixture ${type} ${id}"`,
    "tags: [orchestration]",
    "load: on-demand",
    `obsolete_when: fixture ${id} trigger`,
    ...extra,
    "---",
    "",
    `# ${id}`,
    "",
    body,
    "",
  ].join("\n");
}

const CORPUS_FIXTURE: Record<string, string> = {
  "corpus/charter/stamity-charter.md": artifact("charter", "charter", []).replace(
    "load: on-demand",
    "load: always",
  ),
  "corpus/agents/stamity-fixture-agent.md": artifact("fixture-agent", "agent", [
    "capabilities: [read]",
    "model_class: standard",
  ]),
  "corpus/skills/stamity-fixture-skill/SKILL.md": artifact("fixture-skill", "skill"),
  "corpus/commands/stamity-fixture-command.md": artifact("fixture-command", "command", [
    "readonly: true",
  ]),
  "corpus/rules/stamity-fixture-rule.md": artifact("fixture-rule", "rule", [
    'globs: ["src/**"]',
  ]),
};

const ENGINE_VERSION = "0.0.0-test";
const FIXED_NOW = new Date("2026-09-17T09:00:00.000Z");

beforeEach(async () => {
  __setContentRootForTests(getTemp().path("corpus"));
  await getTemp().seedFiles(CORPUS_FIXTURE);
});

afterEach(() => {
  __resetContentRootCacheForTests();
});

async function makeRepo(sub = "repo"): Promise<string> {
  const root = getTemp().path(sub);
  await mkdir(root, { recursive: true });
  return root;
}

/**
 * A capability file as a generated root carries one. Shaped by hand rather than
 * read off a root because the ROOT is not what is under test here — the reader
 * that produces this shape from real bytes is proven in `./capabilityFile.test.ts`,
 * and repeating that walk per case would make every assertion below depend on
 * the writer's fixture instead of on the setup engine.
 */
function capabilityFor(
  client: PluginCapabilityFile["client"],
  overrides: Partial<PluginCapabilityFile["classes"]> = {},
): PluginCapabilityFile {
  return {
    schemaVersion: 1,
    client,
    version: "1.9.0",
    sourceCommit: "b".repeat(40),
    invocation: { commands: "/stamity:<id>" },
    clientFloor: { version: "2.1.224" },
    prerequisites: { node: ">=22.22.2", git: "optional" },
    classes: {
      agent: { status: "carried", count: 10 },
      skill: { status: "carried", count: 14 },
      command: { status: "carried", count: 10 },
      rule: { status: "repository-owned", reason: "the plugin manifest has no rules field" },
      hooks: { status: "carried", count: 4 },
      mcp: { status: "repository-owned", reason: "server selection stays the repository's" },
      ...overrides,
    },
    runtime: {
      path: "runtime",
      locator: "runtime/locate.mjs",
      companion: { package: COMPANION_PACKAGE, compatible: "^1.9.0" },
    },
  };
}

/**
 * One entry of `PluginSetupInput.roots`, with a plausible on-disk root path.
 * Typed as the exported {@link PluginSetupRoot} rather than structurally, so
 * the fixture is held to the shape C4's verb will build rather than to a
 * lookalike this file happens to agree with today.
 */
function rootFor(
  client: PluginCapabilityFile["client"],
  overrides: Partial<PluginCapabilityFile["classes"]> = {},
): PluginSetupRoot {
  return {
    tool: client,
    root: getTemp().path(`${client}-plugin-root`),
    file: capabilityFor(client, overrides),
  };
}

/**
 * Written paths, repo-relative and POSIX-addressed. The preview and the real
 * run deliberately target two different temp roots — a preview over the repo it
 * previews would answer with that repo's own state — so the comparison has to
 * drop the root before it can mean anything.
 */
function relativeTo(repo: string, paths: readonly string[]): string[] {
  return paths.map((path) => path.slice(repo.length + 1).split(sep).join("/")).toSorted();
}

/** Every file under `dir`, repo-relative and POSIX-addressed. */
async function walk(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      // oxlint-disable-next-line no-await-in-loop -- deterministic walk over a tiny fixture tree
      out.push(...(await walk(join(dir, entry.name), relative)));
    } else {
      out.push(relative);
    }
  }
  return out.toSorted();
}

/**
 * Paths REQ-PLUGIN-015 names as the repository's own under a plugin-backed
 * setup: the charter and its per-client copy, glob-scoped rules, client
 * settings, MCP documents when servers are selected, and the state directory.
 * A predicate rather than a literal list, because the corpus decides how many
 * rule files land and the requirement is about which CLASS of path may.
 */
function isRepositoryOwned(path: string): boolean {
  return (
    path === "AGENTS.md" ||
    path === "CLAUDE.md" ||
    path === "AGENT.md" ||
    path === ".gitignore" ||
    path === ".mcp.json" ||
    path.startsWith(".claude/rules/") ||
    path === ".claude/settings.json" ||
    path.startsWith(".cursor/rules/") ||
    path === ".github/copilot-instructions.md" ||
    // `.stamity/` is the repository's state — EXCEPT the generated hook scripts,
    // which are the `hooks` class a plugin can carry and therefore not state.
    (path.startsWith(".stamity/") && !path.startsWith(".stamity/generated/hooks/"))
  );
}

describe("planPluginSetup", () => {
  it("records every carried class per client and asks init to plan for those tools", async () => {
    const root = await makeRepo();
    const { decisions, plugin } = await planPluginSetup({
      rootDir: root,
      roots: [rootFor("claude"), rootFor("cursor")],
      engineVersion: ENGINE_VERSION,
      dryRun: false,
      now: FIXED_NOW,
    });

    // Two roots, so the degenerate one-client path is not what is being proven.
    expect(decisions.tools).toEqual(["claude", "cursor"]);
    expect(decisions.toolsSource).toBe("flag");
    expect(plugin).toEqual({
      mode: "plugin-backed",
      clients: {
        claude: { version: "1.9.0", classes: ["agent", "skill", "command", "hooks"] },
        cursor: { version: "1.9.0", classes: ["agent", "skill", "command", "hooks"] },
      },
    });
  });

  it("leaves a repository-owned class out of that client's record", async () => {
    const root = await makeRepo();
    const { plugin } = await planPluginSetup({
      rootDir: root,
      roots: [
        rootFor("claude"),
        rootFor("codex", {
          hooks: { status: "repository-owned", reason: "the client wires hooks itself" },
        }),
      ],
      engineVersion: ENGINE_VERSION,
      dryRun: false,
      now: FIXED_NOW,
    });

    expect(plugin.clients?.claude?.classes).toEqual(["agent", "skill", "command", "hooks"]);
    // The codex spike outcome: hooks stay generated for that client alone.
    expect(plugin.clients?.codex?.classes).toEqual(["agent", "skill", "command"]);
  });

  it("refuses a root whose declared client is not the tool it was requested for", async () => {
    const root = await makeRepo();
    const claudeRoot = rootFor("claude");
    await expect(
      planPluginSetup({
        rootDir: root,
        roots: [{ ...claudeRoot, tool: "cursor" }],
        engineVersion: ENGINE_VERSION,
        dryRun: false,
        now: FIXED_NOW,
      }),
    ).rejects.toThrow(/declares client claude/);
  });

  it("refuses two roots claiming the same client", async () => {
    const root = await makeRepo();
    await expect(
      planPluginSetup({
        rootDir: root,
        roots: [rootFor("claude"), rootFor("claude")],
        engineVersion: ENGINE_VERSION,
        dryRun: false,
        now: FIXED_NOW,
      }),
    ).rejects.toThrow(/claude/);
  });

  it("refuses a root that carries nothing, rather than recording an empty class list", async () => {
    const root = await makeRepo();
    const empty = Object.fromEntries(
      PLUGIN_OWNED_CLASSES.map((name) => [
        name,
        { status: "repository-owned" as const, reason: "not carried by this root" },
      ]),
    ) as Partial<PluginCapabilityFile["classes"]>;
    await expect(
      planPluginSetup({
        rootDir: root,
        roots: [rootFor("claude", empty)],
        engineVersion: ENGINE_VERSION,
        dryRun: false,
        now: FIXED_NOW,
      }),
    ).rejects.toThrow(/carries no class/);
  });

  it("refuses a call naming no root at all", async () => {
    const root = await makeRepo();
    await expect(
      planPluginSetup({
        rootDir: root,
        roots: [],
        engineVersion: ENGINE_VERSION,
        dryRun: false,
        now: FIXED_NOW,
      }),
    ).rejects.toBeInstanceOf(EngineError);
  });
});

describe("applyPluginSetup", () => {
  it("writes the repository-owned paths and a manifest carrying the planned boundary", async () => {
    const root = await makeRepo();
    const input = {
      rootDir: root,
      roots: [rootFor("claude")],
      engineVersion: ENGINE_VERSION,
      dryRun: false,
      now: FIXED_NOW,
    };
    const { plugin } = await planPluginSetup(input);
    const report = await applyPluginSetup(input);

    expect(report.dryRun).toBe(false);
    expect(report.wrote.length).toBeGreaterThan(0);

    const manifest = await readManifest(root);
    expect(manifest?.plugin).toEqual(plugin);
    expect(manifest?.plugin?.mode).toBe("plugin-backed");
    expect(manifest?.tools).toEqual(["claude"]);
    // The document on disk, through the full validator: a `plugin` block the
    // writer produced must be one the reader accepts.
    const raw: unknown = JSON.parse(await readFile(report.manifestPath, "utf8"));
    expect(collectManifestErrors(raw)).toEqual([]);

    // The repository's own files really landed — not merely "nothing unexpected did".
    const onDisk = await walk(root);
    expect(onDisk).toContain("AGENTS.md");
    expect(onDisk).toContain("CLAUDE.md");
    expect(onDisk).toContain(".claude/settings.json");
    expect(onDisk).toContain(".stamity/manifest.json");
    // The glob-scoped rule REQ-PLUGIN-015 names: the repository keeps it even
    // where the plugin carries every other class.
    expect(onDisk.some((path) => path.startsWith(".claude/rules/"))).toBe(true);
  });

  // eslint-disable-next-line vitest/no-disabled-tests -- see the skip reason below.
  it.skip("writes 0 files of a class the root declares carried (owner: unit C3)", async () => {
    // The ownership PASS is C3's (`src/emit/ownership.ts` + the planner edit),
    // building in parallel with this unit. C6 records the boundary on the
    // manifest; until C3 reads it, a plugin-backed apply still emits agents,
    // skills, commands and hook scripts. Asserting their absence today would be
    // red for a reason this unit cannot fix, and weakening the assertion to
    // something that passes either way would leave the requirement uncovered
    // the day C3 lands. It is skipped with its owner named instead.
    const root = await makeRepo();
    await applyPluginSetup({
      rootDir: root,
      roots: [rootFor("claude")],
      engineVersion: ENGINE_VERSION,
      dryRun: false,
      now: FIXED_NOW,
    });

    const onDisk = await walk(root);
    expect(onDisk.filter((path) => !isRepositoryOwned(path))).toEqual([]);
    expect(await readFile(join(root, ".claude", "settings.json"), "utf8")).not.toContain("hooks");
  });

  it("writes nothing under dryRun and reports the same paths a real run would write", async () => {
    const previewRepo = await makeRepo("preview");
    const realRepo = await makeRepo("real");
    const roots = [rootFor("claude")];

    const preview = await applyPluginSetup({
      rootDir: previewRepo,
      roots,
      engineVersion: ENGINE_VERSION,
      dryRun: true,
      now: FIXED_NOW,
    });
    const real = await applyPluginSetup({
      rootDir: realRepo,
      roots,
      engineVersion: ENGINE_VERSION,
      dryRun: false,
      now: FIXED_NOW,
    });

    expect(preview.dryRun).toBe(true);
    expect(relativeTo(previewRepo, preview.wrote.map((row) => row.path))).toEqual(
      relativeTo(realRepo, real.wrote.map((row) => row.path)),
    );
    expect(preview.wrote.length).toBeGreaterThan(0);
    // Nothing at all: not the manifest, not a state directory, not a file.
    expect(await walk(previewRepo)).toEqual([]);
  });

  it("refuses a second setup with init's own already-initialised error", async () => {
    const root = await makeRepo();
    const input = {
      rootDir: root,
      roots: [rootFor("claude")],
      engineVersion: ENGINE_VERSION,
      dryRun: false,
      now: FIXED_NOW,
    };
    await applyPluginSetup(input);

    // The translation into the `stamity clean -y` sentence is unit C4's; what
    // this unit owes is that the refusal arrives, classified, with no writes.
    let error: unknown;
    try {
      await applyPluginSetup(input);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe("VALIDATION_ERROR");
    expect((error as EngineError).message).toContain("already initialised");
  });

  it("writes one manifest with a record per client when two roots arrive together", async () => {
    const root = await makeRepo();
    const report = await applyPluginSetup({
      rootDir: root,
      roots: [rootFor("cursor"), rootFor("claude")],
      engineVersion: ENGINE_VERSION,
      dryRun: false,
      now: FIXED_NOW,
    });

    const manifest = await readManifest(root);
    // Tool order is the engine's canonical one, not the caller's argument order.
    expect(manifest?.tools).toEqual(["claude", "cursor"]);
    expect(Object.keys(manifest?.plugin?.clients ?? {}).toSorted()).toEqual(["claude", "cursor"]);
    expect(manifest?.plugin?.clients?.cursor?.version).toBe("1.9.0");
    expect(report.manifestPath).toBe(join(root, ".stamity", "manifest.json"));

    const onDisk = await walk(root);
    expect(onDisk).toContain("CLAUDE.md");
    expect(onDisk.some((path) => path.startsWith(".cursor/"))).toBe(true);
  });
});
