import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ADAPTER_REGISTRY } from "../../src/adapters/registry.ts";
import { composeEmissionPlanner, type EmissionContext } from "../../src/emit/planner.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import { outputOwners } from "../../src/types/content.ts";
import { TOOLS, type Tool } from "../../src/types/core.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The typed static adapter registry: completeness over the closed
 * Tool union, per-row key/planner/facts agreement, immutability, a smoke
 * compose through the real four-adapter set, and the import discipline the
 * registry module header declares (adapter modules + type surfaces only,
 * never the CLI seam). The architecture boundaries suite already checks the
 * graph-shape rules generically (barrel ban, layering, cycles); this one pins
 * the registry's exact import set, so a drive-by value import that happens to
 * satisfy every generic rule still fails here. It follows that suite's
 * line-anchored specifier-scanning convention.
 */

const REGISTRY_SOURCE_URL = new URL("../../src/adapters/registry.ts", import.meta.url);

const getTemp = useTempDir("adapter-registry");

const ENGINE_VERSION = "0.0.0-test";
const FIXED_NOW = new Date("2026-08-14T00:00:00.000Z");

/** Minimal viable corpus: the charter is the only artifact core emission requires. */
const CHARTER_FIXTURE = [
  "---",
  "id: charter",
  "type: charter",
  "description: fixture charter",
  "tags: [orchestration]",
  "load: always",
  "obsolete_when: fixture trigger",
  "---",
  "",
  "# Test Charter",
  "",
  "Charter guidance body.",
  "",
].join("\n");

async function minimalCtx(tools: Tool[]): Promise<EmissionContext> {
  const temp = getTemp();
  await temp.seedFiles({ "corpus/charter/stamity-charter.md": CHARTER_FIXTURE });
  return {
    rootDir: temp.path("repo"),
    manifest: createManifest({
      tools,
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: ENGINE_VERSION,
      now: FIXED_NOW,
    }),
    engineVersion: ENGINE_VERSION,
    facts: { monorepoPackages: [] },
    contentRoot: temp.path("corpus"),
  };
}

describe("ADAPTER_REGISTRY", () => {
  it("carries exactly the four TOOLS keys — complete by construction", () => {
    expect(Object.keys(ADAPTER_REGISTRY).toSorted()).toEqual([...TOOLS].toSorted());
  });

  it("keys, planner tool fields, and facts tool fields agree row-for-row", () => {
    for (const tool of TOOLS) {
      const planner = ADAPTER_REGISTRY[tool];
      expect(planner.tool, `registry["${tool}"].tool`).toBe(tool);
      expect(planner.facts.tool, `registry["${tool}"].facts.tool`).toBe(tool);
      expect(typeof planner.planResidue, `registry["${tool}"].planResidue`).toBe("function");
    }
  });

  it("is frozen: the registry is data, not a runtime registration surface", () => {
    expect(Object.isFrozen(ADAPTER_REGISTRY)).toBe(true);
    expect(() => {
      (ADAPTER_REGISTRY as Record<string, unknown>).claude = null;
    }).toThrow(TypeError);
  });
});

describe("composeEmissionPlanner(ADAPTER_REGISTRY) smoke", () => {
  it("plans all four selected tools over a minimal ctx: shared charter, claude bridge, four owner sets", async () => {
    const planner = composeEmissionPlanner(ADAPTER_REGISTRY);

    // The id enumerates the registered residue set in canonical order — the
    // four-adapter registry is visible in the planner identity itself.
    expect(planner.id).toBe("core+residue[claude,cursor,copilot,codex]");

    const rows = await planner.plan(await minimalCtx([...TOOLS]));
    const paths = rows.map((row) => row.path);

    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain("CLAUDE.md");
    // Single-writer per path, and deterministic codepoint ordering.
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual([...paths].toSorted());

    // Every selected tool owns at least one row — the compose really ran each
    // registered planner, not a subset.
    const owningTools = new Set(
      rows.flatMap((row) => outputOwners(row).map((owner) => owner.adapter)),
    );
    expect([...owningTools].toSorted()).toEqual([...TOOLS].toSorted());
  });
});

/**
 * Line-anchored, comment-safe specifier extraction, following the
 * architecture boundaries suite's scanning convention.
 */
function importSpecifiers(source: string): { specifier: string; typeOnly: boolean }[] {
  const rules = [
    { pattern: /^[ \t]*import[ \t]+type[ \t][^"']*?from[ \t]*["']([^"']+)["']/gm, typeOnly: true },
    {
      pattern: /^[ \t]*import[ \t]+(?!type[ \t])[^"'()]*?from[ \t]*["']([^"']+)["']/gm,
      typeOnly: false,
    },
    { pattern: /^[ \t]*import[ \t]*["']([^"']+)["']/gm, typeOnly: false },
    { pattern: /^[ \t]*export[ \t]+type[ \t][^"']*?from[ \t]*["']([^"']+)["']/gm, typeOnly: true },
    { pattern: /^[ \t]*export[ \t]+(?:\*|\{)[^"']*?from[ \t]*["']([^"']+)["']/gm, typeOnly: false },
    { pattern: /\bimport[ \t]*\(\s*["']([^"']+)["']\s*\)/g, typeOnly: false },
  ];
  const found: { specifier: string; typeOnly: boolean }[] = [];
  for (const rule of rules) {
    for (const match of source.matchAll(rule.pattern)) {
      if (match[1] !== undefined) found.push({ specifier: match[1], typeOnly: rule.typeOnly });
    }
  }
  return found;
}

describe("registry import discipline", () => {
  it("imports adapter modules as values and planner/core types only — never the CLI seam", () => {
    const source = readFileSync(fileURLToPath(REGISTRY_SOURCE_URL), "utf8");
    const specifiers = importSpecifiers(source);
    expect(specifiers.length).toBeGreaterThan(0);

    const valueImports = specifiers
      .filter((entry) => !entry.typeOnly)
      .map((entry) => entry.specifier)
      .toSorted();
    const typeImports = specifiers
      .filter((entry) => entry.typeOnly)
      .map((entry) => entry.specifier)
      .toSorted();

    // Runtime edges: exactly the four adapter modules. Type edges carry no
    // runtime cycle risk but stay pinned so a drive-by value import shows up.
    expect(valueImports).toEqual(["./claude.ts", "./codex.ts", "./copilot.ts", "./cursor.ts"]);
    expect(typeImports).toEqual(["../emit/planner.ts", "../types/core.ts"]);

    // The cycle that must never form: registry -> CLI seam -> registry.
    for (const { specifier } of specifiers) {
      expect(specifier, "registry must never import the CLI layer").not.toMatch(/\/cli[./]/);
      expect(specifier, "registry must never import the emission seam").not.toContain(
        "emission.ts",
      );
    }
  });
});
