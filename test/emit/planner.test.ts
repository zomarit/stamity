import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyInit, type InitApplyOptions } from "../../src/cli/commands/init/apply.ts";
import type { InitDecisions } from "../../src/cli/commands/init/plan.ts";
import { applySync, planSync } from "../../src/cli/commands/sync/engine.ts";
import type * as emissionModule from "../../src/cli/engine/emission.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../src/content/contentRoot.ts";
import {
  CHARTER_ARTIFACT_ID,
  POLICY_DOCUMENT_ARTIFACT_ID,
  buildCoreEmissionPlan,
  composeEmissionPlanner,
  type AdapterDialectFacts,
  type CoreEmissionPlan,
  type EmissionContext,
  type ResidueEmission,
  type ResiduePlanner,
} from "../../src/emit/planner.ts";
import { createManifest, readManifest, writeManifest } from "../../src/manifest/manifest.ts";
import { wrapInManagedBlock } from "../../src/merge/managedBlocks.ts";
import type { ResolvedPackContent } from "../../src/pack/projection.ts";
import { outputOwners, type AdapterOutput, type EmissionOwner } from "../../src/types/content.ts";
import type { Tool } from "../../src/types/core.ts";
import type { PackageEntry, RepoInfo } from "../../src/types/detect.ts";
import { EngineError } from "../../src/types/errors.ts";
import type { ImportDecision, McpConfig } from "../../src/types/manifest.ts";
import { MANAGED_BLOCK_VARIANTS, stampMarkerVersion } from "../../src/types/markers.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The core emission composer and thin-adapter seam. Unit tests use FAKE
 * residue planners only — the real adapters are wired separately — plus the
 * existing init-apply/sync-engine harness patterns (planner seam mocked at
 * `getEmissionPlanner`, real writes into a temp repo) for the co-owner
 * ledger expansion. No adapter suite is edited; the ledger assertions here are
 * additive, through the engine helpers those suites already exercise.
 */

/** Planner seam for the init/sync consumption-site tests (initApply.test.ts pattern). */
const plannerOutputs = vi.hoisted(() => ({ value: [] as AdapterOutput[] }));
vi.mock("../../src/cli/engine/emission.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof emissionModule>();
  return {
    ...actual,
    getEmissionPlanner: () => ({
      id: "co-owner-stub",
      plan: async () => structuredClone(plannerOutputs.value),
      // The consumption sites read `planWithWarnings`; a stub defining `plan`
      // alone would not answer the call they make.
      planWithWarnings: async () => ({
        outputs: structuredClone(plannerOutputs.value),
        warnings: [],
      }),
    }),
  };
});

const getTemp = useTempDir("emit-planner");

const FIXED_NOW = new Date("2026-08-14T00:00:00.000Z");
const ENGINE_VERSION = "0.0.0-test";

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

const SKILL_FIXTURE = [
  "---",
  "id: alpha",
  "type: skill",
  "description: fixture skill",
  "tags: [implementation]",
  "---",
  "",
  "# Alpha Skill",
  "",
  "Do the thing.",
  "",
].join("\n");

/** Core paths of the fixture corpus, as the composer emits them. */
const P = {
  agentsMd: "AGENTS.md",
  skillMain: ".agents/skills/stamity-alpha/SKILL.md",
  skillRef: ".agents/skills/stamity-alpha/references/notes.md",
  policyDoc: ".stamity/generated/agent-tool-policies.json",
  hooksRoot: ".stamity/generated/hooks",
} as const;

const HOOK_FILES = [
  "stamity-session-start.mjs",
  "stamity-pre-tool-use-guard.mjs",
  "stamity-config-tamper-notice.mjs",
] as const;

/** Seeds the fixture corpus (charter + one skill with a reference) and returns its root. */
async function seedCorpus(): Promise<string> {
  const temp = getTemp();
  await temp.seedFiles({
    "corpus/charter/stamity-charter.md": CHARTER_FIXTURE,
    "corpus/skills/stamity-alpha/SKILL.md": SKILL_FIXTURE,
    "corpus/skills/stamity-alpha/references/notes.md": "Reference notes.\n",
  });
  return temp.path("corpus");
}

function ctxOf(
  tools: Tool[],
  contentRoot: string,
  over: {
    mcp?: McpConfig;
    packages?: PackageEntry[];
    rootDir?: string;
    /**
     * The persisted decision LIST, as the manifest holds it. Singular here
     * before the decision list landed: the helper could not express a two-file repo, so every
     * import case in this suite was a one-decision case by construction and the
     * multi-file defect had no way to fail a test.
     */
    importChoice?: readonly ImportDecision[];
  } = {},
): EmissionContext {
  return {
    // Absent by default: hooks-dir absence is a planning non-event, and the
    // purity probe wants a root that never comes into being.
    rootDir: over.rootDir ?? getTemp().path("repo"),
    manifest: createManifest({
      tools,
      selection: { items: { agent: [], skill: ["alpha"], rule: [], command: [] } },
      generatorVersion: ENGINE_VERSION,
      now: FIXED_NOW,
      ...(over.mcp === undefined ? {} : { mcp: over.mcp }),
      ...(over.importChoice === undefined ? {} : { importChoice: over.importChoice }),
    }),
    engineVersion: ENGINE_VERSION,
    facts: { greenfield: true, monorepoPackages: over.packages ?? [] },
    contentRoot,
  };
}

function fakeFacts(tool: Tool): AdapterDialectFacts {
  return {
    tool,
    ruleShape: "test-shape",
    hooksConfigPath: null,
    readsAgentsSkillsDir: true,
    agentsFormat: "markdown",
    mcpDialect: "claude-json",
    entryFile: null,
    caps: [{ name: "test-cap", value: "1" }],
    citations: [{ url: "https://example.com/docs", accessDate: "2026-08-14" }],
  };
}

/** A fake residue planner counting its invocations; rows are built per call. */
function fakeResidue(
  tool: Tool,
  rowsFor: (core: CoreEmissionPlan, ctx: EmissionContext) => AdapterOutput[],
): ResiduePlanner & { calls: number } {
  const planner = {
    tool,
    facts: fakeFacts(tool),
    calls: 0,
    async planResidue(core: CoreEmissionPlan, ctx: EmissionContext): Promise<ResidueEmission> {
      planner.calls += 1;
      return { outputs: rowsFor(core, ctx) };
    },
  };
  return planner;
}

const ownerOf = (tool: Tool, artifactId: string, artifactType: EmissionOwner["artifactType"]): EmissionOwner => ({
  adapter: tool,
  artifactId,
  artifactType,
});

const adaptersOf = (output: AdapterOutput): Tool[] => outputOwners(output).map((o) => o.adapter);

const byPath = (plan: readonly AdapterOutput[]): Map<string, AdapterOutput> =>
  new Map(plan.map((output) => [output.path, output]));

/** The rejection an async call produced, or `null` when it resolved. */
async function rejectionOf(promise: Promise<unknown>): Promise<EngineError | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    expect(err).toBeInstanceOf(EngineError);
    return err as EngineError;
  }
}

/** Every file under `dir`, POSIX-relative and sorted, for purity snapshots. */
async function tree(dir: string): Promise<string[]> {
  const entries = (await readdir(dir, { recursive: true })) as string[];
  return entries.map((entry) => entry.split(sep).join("/")).toSorted();
}

afterEach(() => {
  __resetContentRootCacheForTests();
});

// ── Core-only composition ────────────────────────────────────────

describe("composeEmissionPlanner({}) — core rows only", () => {
  it("co-owns shared rows across [claude, codex], owns per-tool rows singly, nests for codex", async () => {
    const corpus = await seedCorpus();
    const ctx = ctxOf(["claude", "codex"], corpus, {
      packages: [{ name: "a", path: "packages/a" }],
    });

    const plan = await composeEmissionPlanner({}).plan(ctx);

    expect(plan.map((output) => output.path)).toEqual([
      P.skillMain,
      P.skillRef,
      P.policyDoc,
      ...HOOK_FILES.map((file) => `${P.hooksRoot}/claude/${file}`),
      ...HOOK_FILES.map((file) => `${P.hooksRoot}/codex/${file}`),
      P.agentsMd,
      "packages/a/AGENTS.md",
    ].toSorted());

    // A maintainer ruling removed the Agent-Plugins container as a concept, not
    // merely as a deselectable row: the composer plans nothing under
    // `.agents/plugins/` for any selection. Stated on its own rather than left
    // implicit in the exact list above, so a row reappearing there names the
    // ruling it breaks.
    expect(plan.filter((output) => output.path.startsWith(".agents/plugins/"))).toEqual([]);

    const rows = byPath(plan);

    // Root charter: one row, owner claude + coOwner codex, frontmatter-free render.
    const root = rows.get(P.agentsMd)!;
    expect(root.owner).toEqual(ownerOf("claude", CHARTER_ARTIFACT_ID, "infra"));
    expect(root.coOwners).toEqual([ownerOf("codex", CHARTER_ARTIFACT_ID, "infra")]);
    expect(root.content).toContain("# Test Charter");
    expect(root.content).not.toContain("obsolete_when");

    // Skills: co-owned by the full selection.
    for (const path of [P.skillMain, P.skillRef]) {
      const row = rows.get(path)!;
      expect(adaptersOf(row)).toEqual(["claude", "codex"]);
      expect(row.owner.artifactId).toBe("alpha");
      expect(row.owner.artifactType).toBe("skill");
    }

    // TEST CHANGE, justified: a maintainer ruling deleted the Agent-Plugins
    // container, and with it the row that carried "a shared core row is one
    // write co-owned by the whole selection". The guarantee is unchanged, so it
    // moves off that one path and onto the whole SURVIVING shared-core set —
    // charter, skills tree, policy document — asserted as a set rather than
    // spot-checked, which is strictly more than the deleted lines proved.
    expect(
      [P.agentsMd, P.skillMain, P.skillRef, P.policyDoc].map((path) => ({
        path,
        writes: plan.filter((output) => output.path === path).length,
        owners: adaptersOf(rows.get(path)!),
      })),
    ).toEqual(
      [P.agentsMd, P.skillMain, P.skillRef, P.policyDoc].map((path) => ({
        path,
        writes: 1,
        owners: ["claude", "codex"],
      })),
    );

    // Policy document: co-owned, stable infra id.
    const policy = rows.get(P.policyDoc)!;
    expect(adaptersOf(policy)).toEqual(["claude", "codex"]);
    expect(policy.owner.artifactId).toBe(POLICY_DOCUMENT_ARTIFACT_ID);

    // Hook script copies: owned singly by their tool, ids from the file name.
    for (const tool of ["claude", "codex"] as const) {
      for (const file of HOOK_FILES) {
        const row = rows.get(`${P.hooksRoot}/${tool}/${file}`)!;
        expect(adaptersOf(row)).toEqual([tool]);
        expect(row.owner).toEqual(ownerOf(tool, file.replace(/\.mjs$/, ""), "infra"));
        expect(row.coOwners).toBeUndefined();
      }
    }

    // Nested charter copy: codex-owned alone, root render verbatim.
    const nested = rows.get("packages/a/AGENTS.md")!;
    expect(adaptersOf(nested)).toEqual(["codex"]);
    expect(nested.owner.artifactId).toBe(CHARTER_ARTIFACT_ID);
    expect(nested.content).toBe(root.content);
  });

  it("plans no nested AGENTS.md rows plan-wide when the monorepo facts are empty", async () => {
    const corpus = await seedCorpus();

    const plan = await composeEmissionPlanner({}).plan(ctxOf(["claude", "codex"], corpus));

    expect(plan.some((output) => output.path.endsWith("/AGENTS.md"))).toBe(false);
    expect(plan.filter((output) => output.path === P.agentsMd)).toHaveLength(1);
  });

  it("emits nothing owned by an unselected tool, and never invokes its residue planner", async () => {
    const corpus = await seedCorpus();
    const claude = fakeResidue("claude", () => [
      { path: "CLAUDE.md", content: "x\n", owner: ownerOf("claude", "entry", "infra") },
    ]);

    const plan = await composeEmissionPlanner({ claude }).plan(
      ctxOf(["cursor"], corpus, { packages: [{ name: "a", path: "packages/a" }] }),
    );

    expect(claude.calls).toBe(0);
    expect(plan.length).toBeGreaterThan(0);
    for (const output of plan) {
      expect(adaptersOf(output), output.path).toEqual(["cursor"]);
    }
    // cursor is not a per-package tool, so the packages produce no nested copies.
    expect(plan.some((output) => output.path === "packages/a/AGENTS.md")).toBe(false);
    expect(plan.some((output) => output.path === "CLAUDE.md")).toBe(false);
  });
});

// ── Residue merging ──────────────────────────────────────────────

describe("residue merging", () => {
  it("includes a residue planner's rows exactly once, in stable path order, byte-identical across runs", async () => {
    const corpus = await seedCorpus();
    const claude = fakeResidue("claude", (core) => [
      // Built per call so cross-run identity is earned, not aliased.
      { path: "CLAUDE.md", content: `@${P.agentsMd}\n`, owner: ownerOf("claude", "entry", "infra") },
      {
        path: ".claude/settings.json",
        content: `{"hooks":${core.hooks.interchangeFor("claude").length}}\n`,
        owner: ownerOf("claude", "settings", "infra"),
      },
    ]);
    const planner = composeEmissionPlanner({ claude });
    const ctx = ctxOf(["claude", "codex"], corpus);

    const first = await planner.plan(ctx);
    const second = await planner.plan(ctx);

    expect(first.filter((output) => output.path === "CLAUDE.md")).toHaveLength(1);
    expect(first.filter((output) => output.path === ".claude/settings.json")).toHaveLength(1);
    expect(first.map((output) => output.path)).toEqual(
      first.map((output) => output.path).toSorted(),
    );
    expect(second).toEqual(first);
    // Byte-identical, not merely deep-equal: key order and every code unit agree.
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("dedups two planners' identical-content path into one output with unioned owners", async () => {
    const corpus = await seedCorpus();
    const shared = ".shared/notes.md";
    const claude = fakeResidue("claude", () => [
      { path: shared, content: "Shared body.\n", owner: ownerOf("claude", "notes", "infra") },
    ]);
    const codex = fakeResidue("codex", () => [
      { path: shared, content: "Shared body.\n", owner: ownerOf("codex", "notes", "infra") },
    ]);

    const plan = await composeEmissionPlanner({ claude, codex }).plan(
      ctxOf(["claude", "codex"], corpus),
    );

    const rows = plan.filter((output) => output.path === shared);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.owner).toEqual(ownerOf("claude", "notes", "infra"));
    expect(rows[0]!.coOwners).toEqual([ownerOf("codex", "notes", "infra")]);
  });

  it("refuses two planners' DIFFERENT content for one path, naming path and owners", async () => {
    const corpus = await seedCorpus();
    const shared = ".shared/notes.md";
    const claude = fakeResidue("claude", () => [
      { path: shared, content: "From claude.\n", owner: ownerOf("claude", "notes", "infra") },
    ]);
    const codex = fakeResidue("codex", () => [
      { path: shared, content: "From codex.\n", owner: ownerOf("codex", "notes", "infra") },
    ]);

    const err = await rejectionOf(
      composeEmissionPlanner({ claude, codex }).plan(ctxOf(["claude", "codex"], corpus)),
    );

    expect(err?.code).toBe("VALIDATION_ERROR");
    expect(err?.message).toContain(shared);
    expect(err?.message).toContain("claude");
    expect(err?.message).toContain("codex");
  });

  it("propagates a throwing residue planner with tool attribution, never swallowing the cause", async () => {
    const corpus = await seedCorpus();
    const boom = new Error("dialect table missing");
    const codex = fakeResidue("codex", () => {
      throw boom;
    });

    const err = await rejectionOf(
      composeEmissionPlanner({ codex }).plan(ctxOf(["claude", "codex"], corpus)),
    );

    expect(err?.code).toBe("ADAPTER_ERROR");
    expect(err?.message).toContain('"codex"');
    expect(err?.message).toContain("dialect table missing");
    expect(err?.cause).toBe(boom);
  });
});

// ── Shared-path replacement ──────────────────────────────────────

describe("shared-path replacement contract", () => {
  const replacement = (tool: Tool, path: string, content: string): AdapterOutput => ({
    path,
    content,
    owner: ownerOf(tool, CHARTER_ARTIFACT_ID, "infra"),
    replacesSharedPath: true,
  });

  it("substitutes a flagged row's content into the shared AGENTS.md row with owners unioned", async () => {
    const corpus = await seedCorpus();
    const codex = fakeResidue("codex", () => [
      replacement("codex", P.agentsMd, "# Test Charter with appendix\n"),
    ]);

    const plan = await composeEmissionPlanner({ codex }).plan(ctxOf(["claude", "codex"], corpus));

    const rows = plan.filter((output) => output.path === P.agentsMd);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.content).toBe("# Test Charter with appendix\n");
    // Owners union: the shared row already carried both; the replacement
    // collapses onto them (ledger identity is per adapter+path).
    expect(adaptersOf(rows[0]!)).toEqual(["claude", "codex"]);
  });

  it("refuses a replacement for a path the core plan does not share", async () => {
    const corpus = await seedCorpus();
    const codex = fakeResidue("codex", () => [
      replacement("codex", ".codex/not-shared.md", "body\n"),
    ]);

    const err = await rejectionOf(
      composeEmissionPlanner({ codex }).plan(ctxOf(["claude", "codex"], corpus)),
    );

    expect(err?.code).toBe("VALIDATION_ERROR");
    expect(err?.message).toContain(".codex/not-shared.md");
    expect(err?.message).toContain("replacesSharedPath");
  });

  it("refuses two replacements for one path", async () => {
    const corpus = await seedCorpus();
    const claude = fakeResidue("claude", () => [
      replacement("claude", P.agentsMd, "# Claude body\n"),
    ]);
    const codex = fakeResidue("codex", () => [replacement("codex", P.agentsMd, "# Codex body\n")]);

    const err = await rejectionOf(
      composeEmissionPlanner({ claude, codex }).plan(ctxOf(["claude", "codex"], corpus)),
    );

    expect(err?.code).toBe("VALIDATION_ERROR");
    expect(err?.message).toContain(P.agentsMd);
    expect(err?.message).toContain("one replacement");
  });
});

// ── Identity and purity ──────────────────────────────────────────

describe("planner identity and purity", () => {
  it("carries a stable diagnostic id derived from the registered residue set, never the context", async () => {
    const corpus = await seedCorpus();
    const claude = fakeResidue("claude", () => []);

    expect(composeEmissionPlanner({}).id).toBe("core+residue[]");
    expect(composeEmissionPlanner({ claude }).id).toBe("core+residue[claude]");

    const planner = composeEmissionPlanner({ claude });
    const before = planner.id;
    await planner.plan(ctxOf(["claude"], corpus));
    await planner.plan(ctxOf(["claude", "codex"], corpus));
    expect(planner.id).toBe(before);
  });

  it("never touches the filesystem while planning: ghost root stays absent, temp tree unchanged", async () => {
    const corpus = await seedCorpus();
    const temp = getTemp();
    const ghost = temp.path("ghost-repo");
    const before = await tree(temp.dir);

    const plan = await composeEmissionPlanner({}).plan(
      ctxOf(["claude", "codex"], corpus, { rootDir: ghost }),
    );

    expect(plan.length).toBeGreaterThan(0);
    expect(existsSync(ghost)).toBe(false);
    expect(await tree(temp.dir)).toEqual(before);
  });
});

// ── Findings channel ─────────────────────────────────────────────

/**
 * The composer builds `core.hooks.warnings` on every run and used to drop it on
 * the way out, which is what made a rejected hook, an empty pack-agent grant
 * and an over-cap policy document silent everywhere downstream. These cases pin
 * the carry, and pin that the narrow view is the same pass with the findings
 * removed rather than a second one.
 */
describe("planWithWarnings", () => {
  it("returns what the core pass found instead of dropping it", async () => {
    const corpus = await seedCorpus();
    const temp = getTemp();
    // A user hook that fails the ingress at JSON parse — the guard already
    // refuses it; the finding was that the refusal reached nobody.
    await temp.seedFiles({ "warned-repo/.stamity/hooks/broken.json": "{not json" });

    const result = await composeEmissionPlanner({}).planWithWarnings(
      ctxOf(["claude"], corpus, { rootDir: temp.path("warned-repo") }),
    );

    const rejection = result.warnings.find((warning) => warning.includes("broken.json"));
    expect(rejection).toContain("user hook");
    expect(rejection).toContain(".stamity/hooks/broken.json");
    expect(rejection).toContain("INVALID_JSON");
    // The rows are unaffected: one malformed hook costs itself, not the plan.
    expect(result.outputs.some((row) => row.path === P.agentsMd)).toBe(true);
  });

  it("reports an empty channel for a repo with nothing wrong, and still emits", async () => {
    const corpus = await seedCorpus();

    const result = await composeEmissionPlanner({}).planWithWarnings(ctxOf(["claude"], corpus));

    expect(result.warnings).toEqual([]);
    expect(result.outputs.length).toBeGreaterThan(0);
  });

  it("hands out fresh arrays: a caller that mutates its plan cannot reach the next one", async () => {
    const corpus = await seedCorpus();
    const temp = getTemp();
    await temp.seedFiles({ "mutating-repo/.stamity/hooks/broken.json": "{not json" });
    const ctx = ctxOf(["claude"], corpus, { rootDir: temp.path("mutating-repo") });
    const planner = composeEmissionPlanner({});

    const first = await planner.planWithWarnings(ctx);
    expect(first.warnings.length).toBeGreaterThan(0);
    first.warnings.push("mutated");
    first.warnings[0] = "clobbered";

    const second = await planner.planWithWarnings(ctx);
    expect(second.warnings).not.toContain("mutated");
    expect(second.warnings[0]).toContain("broken.json");
  });

  it("is the same pass as `plan`, with the findings removed rather than a second run", async () => {
    const corpus = await seedCorpus();
    const claude = fakeResidue("claude", () => []);
    const planner = composeEmissionPlanner({ claude });
    const ctx = ctxOf(["claude"], corpus);

    const rows = await planner.plan(ctx);
    const full = await planner.planWithWarnings(ctx);

    expect(rows).toEqual(full.outputs);
  });
});

// ── MCP substrate routing ────────────────────────────────────────

describe("mcpFor", () => {
  it("returns each tool's own dialect emissions; copilot gets two; codex is reserved empty", async () => {
    const corpus = await seedCorpus();
    const core = await buildCoreEmissionPlan(
      ctxOf(["claude", "cursor", "copilot", "codex"], corpus, {
        mcp: { servers: ["context7"] },
      }),
    );

    const claude = core.mcpFor("claude");
    expect(claude.map((e) => [e.dialect, e.path])).toEqual([["claude-json", ".mcp.json"]]);
    expect(claude[0]!.content).toContain("@upstash/context7-mcp@2.1.1");

    expect(core.mcpFor("cursor").map((e) => [e.dialect, e.path])).toEqual([
      ["cursor-json", ".cursor/mcp.json"],
    ]);
    expect(core.mcpFor("copilot").map((e) => [e.dialect, e.path])).toEqual([
      ["vscode-json", ".vscode/mcp.json"],
      ["copilot-env", ".stamity/mcp/copilot-repo-settings.env"],
    ]);
    // codex-toml is excluded from generic core placement: .codex/config.toml
    // is a composed document the codex residue planner owns whole.
    expect(core.mcpFor("codex")).toEqual([]);
  });

  it("answers empty for every tool with zero servers, and the composed plan emits no .mcp.json", async () => {
    const corpus = await seedCorpus();
    const ctx = ctxOf(["claude", "codex"], corpus);

    const core = await buildCoreEmissionPlan(ctx);
    for (const tool of ["claude", "cursor", "copilot", "codex"] as const) {
      expect(core.mcpFor(tool)).toEqual([]);
    }

    const plan = await composeEmissionPlanner({}).plan(ctx);
    expect(plan.some((output) => output.path === ".mcp.json")).toBe(false);
  });
});

// ── Pack / corpus skill directory clash ──────────────────────────

/**
 * A resolved pack content set carrying one skill row, injected rather than
 * installed: `buildCoreEmissionPlan` takes the resolved set directly, so the
 * merge is exercised without a pack ledger on disk.
 */
function packWithSkillRow(over: {
  path: string;
  artifactId: string;
  packId?: string;
}): ResolvedPackContent {
  return {
    packs: [],
    packRoots: [],
    // Present only when the case is about NAMING the supplier; a set assembled
    // by hand may legitimately carry rows and no items, which is the fallback
    // branch the second case below covers.
    items:
      over.packId === undefined
        ? []
        : [
            {
              type: "skill" as const,
              id: over.artifactId,
              filePath: `/packs/${over.packId}/skills/stamity-alpha/SKILL.md`,
              relativePath: "skills/stamity-alpha/SKILL.md",
              description: "fixture pack skill",
              tags: ["implementation"],
              body: "Pack body.\n",
              frontmatter: { id: over.artifactId, type: "skill" },
              provenance: { pack: over.packId, declaredTools: [] },
            },
          ],
    // Empty: this case is about the skills merge, and no MCP server or pack
    // agent participates in a directory-name clash.
    mcpServers: [],
    agents: [],
    skillRows: [
      { path: over.path, content: "# Pack skill\n", artifactId: over.artifactId, artifactType: "skill" },
    ],
  };
}

describe("pack skill directory clashing with a corpus skill", () => {
  it("refuses by name — the pack, the corpus skill, and what the operator can do", async () => {
    const corpus = await seedCorpus();
    // Same DIRECTORY as the fixture corpus skill (`stamity-alpha`), different
    // id — so the catalog's id-shadowing refusal never fires and the two
    // projections collide path for path instead.
    const packs = packWithSkillRow({
      path: P.skillMain,
      artifactId: "house-drill",
      packId: "ops",
    });

    const err = await rejectionOf(buildCoreEmissionPlan(ctxOf(["claude"], corpus), packs));

    expect(err?.code).toBe("VALIDATION_ERROR");
    // The pack that introduced the directory, and the corpus skill already in
    // it. The pre-fix message named neither: it named four adapters that had
    // nothing to do with the clash, because the collision surfaced as the
    // composer's content-equality dedup two steps later.
    expect(err?.message).toContain(`"ops"`);
    expect(err?.message).toContain(`"house-drill"`);
    expect(err?.message).toContain(`"alpha"`);
    expect(err?.message).toContain(P.skillMain);
    // Two remedies an operator can act on, not two an adapter author could.
    expect(err?.message).toMatch(/[Rr]ename the skill's directory/);
    expect(err?.message).toContain("clean --pack ops");
    expect(err?.message).not.toContain("replacesSharedPath");
  });

  it("still refuses when the resolved set names no supplier, without inventing one", async () => {
    const corpus = await seedCorpus();
    const packs = packWithSkillRow({ path: P.skillMain, artifactId: "house-drill" });

    const err = await rejectionOf(buildCoreEmissionPlan(ctxOf(["claude"], corpus), packs));

    expect(err?.code).toBe("VALIDATION_ERROR");
    expect(err?.message).toContain("An installed pack");
    expect(err?.message).toContain("clean --pack <pack-id>");
  });

  it("merges a pack skill in its own directory without complaint", async () => {
    const corpus = await seedCorpus();
    const packs = packWithSkillRow({
      path: ".agents/skills/stamity-house-drill/SKILL.md",
      artifactId: "house-drill",
      packId: "ops",
    });

    const core = await buildCoreEmissionPlan(ctxOf(["claude"], corpus), packs);

    // Non-degenerate: both sources contribute, in one codepoint-ordered set.
    expect(core.skills.map((row) => row.path)).toEqual([
      ".agents/skills/stamity-alpha/SKILL.md",
      ".agents/skills/stamity-alpha/references/notes.md",
      ".agents/skills/stamity-house-drill/SKILL.md",
    ]);
  });
});

// ── Persisted import decisions ───────────────────────────────────

describe("import decisions over the finished row set", () => {
  /** The HTML BEGIN marker as the wrap writes it: stamped with the engine version. */
  const BEGIN = stampMarkerVersion(MANAGED_BLOCK_VARIANTS[0]!.start, ENGINE_VERSION);

  /** A residue planner emitting one JSON row — the shape a supplement cannot wrap. */
  const settingsResidue = fakeResidue("claude", () => [
    {
      path: ".claude/settings.json",
      content: '{"hooks":{}}\n',
      owner: ownerOf("claude", "settings", "infra"),
    },
  ]);

  it("wraps the named row for supplement, and stays put on a second pass", async () => {
    const corpus = await seedCorpus();
    const planner = composeEmissionPlanner({});
    const ctx = ctxOf(["claude"], corpus, {
      importChoice: [{ path: P.agentsMd, mode: "supplement" }],
    });

    const first = byPath(await planner.plan(ctx));
    const charter = first.get(P.agentsMd)!.content;
    expect(charter).toContain(BEGIN);
    expect(charter).toContain("# Test Charter");

    // Idempotent: planning again produces the same bytes, with ONE block —
    // the decision set is re-applied every plan, and a row already carrying a
    // block is left alone rather than wrapped a second time.
    const second = byPath(await planner.plan(ctx));
    expect(second.get(P.agentsMd)!.content).toBe(charter);
    expect(charter.split(BEGIN)).toHaveLength(2);
  });

  it("leaves a row that already carries a block alone, instead of nesting a second one", async () => {
    const corpus = await seedCorpus();
    // The `CLAUDE.md` bridge shape: an adapter row that is already a managed
    // block. Supplementing it again would wrap the wrapper, and the merge lane
    // would then own bytes it did not write.
    const bridged = wrapInManagedBlock(`@${P.agentsMd}\n`, "CLAUDE.md", ENGINE_VERSION);
    const claude = fakeResidue("claude", () => [
      { path: "CLAUDE.md", content: bridged, owner: ownerOf("claude", "entry", "infra") },
    ]);

    const plan = byPath(
      await composeEmissionPlanner({ claude }).plan(
        ctxOf(["claude"], corpus, { importChoice: [{ path: "CLAUDE.md", mode: "supplement" }] }),
      ),
    );

    expect(plan.get("CLAUDE.md")!.content).toBe(bridged);
    expect(plan.get("CLAUDE.md")!.content.split(BEGIN)).toHaveLength(2);
  });

  it("drops the named row for skip and leaves every other row alone", async () => {
    const corpus = await seedCorpus();
    const ctx = ctxOf(["claude"], corpus, { importChoice: [{ path: P.agentsMd, mode: "skip" }] });

    const plan = await composeEmissionPlanner({}).plan(ctx);

    expect(plan.some((output) => output.path === P.agentsMd)).toBe(false);
    // Non-degenerate: the rest of the plan is untouched, so `skip` is a row
    // drop rather than a plan-wide suppression.
    expect(plan.some((output) => output.path === P.skillMain)).toBe(true);
  });

  it("leaves the bytes alone for replace — that decision is taken in the write lane", async () => {
    const corpus = await seedCorpus();
    const withDecision = byPath(
      await composeEmissionPlanner({}).plan(
        ctxOf(["claude"], corpus, { importChoice: [{ path: P.agentsMd, mode: "replace" }] }),
      ),
    );
    const without = byPath(await composeEmissionPlanner({}).plan(ctxOf(["claude"], corpus)));

    expect(withDecision.get(P.agentsMd)!.content).toBe(without.get(P.agentsMd)!.content);
  });

  it("is inert for a path the plan does not emit", async () => {
    const corpus = await seedCorpus();
    const ctx = ctxOf(["claude"], corpus, {
      importChoice: [{ path: "CLAUDE.md", mode: "supplement" }],
    });

    const plan = await composeEmissionPlanner({}).plan(ctx);

    expect(plan.some((output) => output.path === "CLAUDE.md")).toBe(false);
    expect(plan.every((output) => !output.content.includes(BEGIN))).toBe(true);
  });

  it("applies EVERY persisted decision, so a two-file repo has both rows dropped", async () => {
    // The flip this case was written for (closed): it used to assert
    // the defect — one decision honoured, a second detected file emitted as an
    // ordinary engine-owned row the operator was never asked about — because
    // the manifest held ONE record and `importDecisionsOf` wrapped it into a
    // 0-or-1 array. The manifest holds a list now and the wrap is gone, so the
    // same fixture asserts the fix: `applyImportDecisions` already looped, and
    // it finally receives more than one decision to loop over.
    //
    // Two paths, one mode, exactly as init records it: a single answer mapped
    // over `existingConfigPaths`. Both must disappear from the plan — a `skip`
    // that reaches one of two files is a lost decision, not a partial one.
    const corpus = await seedCorpus();
    const bridge = `@${P.agentsMd}\n`;
    const claude = fakeResidue("claude", () => [
      { path: "CLAUDE.md", content: bridge, owner: ownerOf("claude", "entry", "infra") },
    ]);

    const plan = byPath(
      await composeEmissionPlanner({ claude }).plan(
        ctxOf(["claude"], corpus, {
          importChoice: [
            { path: P.agentsMd, mode: "skip" },
            { path: "CLAUDE.md", mode: "skip" },
          ],
        }),
      ),
    );

    expect(plan.has(P.agentsMd)).toBe(false);
    expect(plan.has("CLAUDE.md")).toBe(false);
    // Non-degenerate: the decisions dropped two named rows, not the plan.
    expect(plan.has(P.skillMain)).toBe(true);
  });

  it("applies a second decision in a different mode from the first", async () => {
    // Same two-file repo, mixed modes — the case a per-repo (rather than
    // per-path) decision cannot express at all. `skip` removes its row and
    // `supplement` wraps its own; neither leaks onto the other's path.
    const corpus = await seedCorpus();
    const bridge = `@${P.agentsMd}\n`;
    const claude = fakeResidue("claude", () => [
      { path: "CLAUDE.md", content: bridge, owner: ownerOf("claude", "entry", "infra") },
    ]);

    const plan = byPath(
      await composeEmissionPlanner({ claude }).plan(
        ctxOf(["claude"], corpus, {
          importChoice: [
            { path: P.agentsMd, mode: "skip" },
            { path: "CLAUDE.md", mode: "supplement" },
          ],
        }),
      ),
    );

    expect(plan.has(P.agentsMd)).toBe(false);
    const claudeMd = plan.get("CLAUDE.md")?.content ?? "";
    expect(claudeMd).toContain(BEGIN);
    expect(claudeMd).toContain(bridge.trim());
  });

  it("refuses to wrap a JSON row, naming the file and the two modes that fit it", async () => {
    const corpus = await seedCorpus();
    const ctx = ctxOf(["claude"], corpus, {
      importChoice: [{ path: ".claude/settings.json", mode: "supplement" }],
    });

    const err = await rejectionOf(composeEmissionPlanner({ claude: settingsResidue }).plan(ctx));

    // The markers module states plain JSON is never wrapped; before this guard
    // nothing enforced it, and the default HTML variant obliged — producing a
    // settings file the client could no longer parse.
    expect(err?.code).toBe("VALIDATION_ERROR");
    expect(err?.message).toContain(".claude/settings.json");
    expect(err?.message).toContain("comment syntax");
    expect(err?.message).toContain('"skip"');
    expect(err?.message).toContain('"replace"');
    expect(err?.message).toContain(".stamity/manifest.json");
  });

  it("emits the same JSON row untouched under skip's sibling modes", async () => {
    const corpus = await seedCorpus();
    const plan = byPath(
      await composeEmissionPlanner({ claude: settingsResidue }).plan(
        ctxOf(["claude"], corpus, { importChoice: [{ path: ".claude/settings.json", mode: "replace" }] }),
      ),
    );

    // The refusal above is scoped to the one mode that rewrites bytes here.
    expect(plan.get(".claude/settings.json")!.content).toBe('{"hooks":{}}\n');
  });
});

// ── Owner expansion helper ───────────────────────────────────────

describe("outputOwners", () => {
  const base: AdapterOutput = {
    path: "AGENTS.md",
    content: "x\n",
    owner: ownerOf("claude", "charter", "infra"),
  };

  it("yields exactly the single owner when coOwners is absent (pre-co-owner behavior)", () => {
    const owners = outputOwners(base);
    expect(owners).toEqual([ownerOf("claude", "charter", "infra")]);
    // Fresh objects — mutating the result cannot reach back into the output.
    expect(owners[0]).not.toBe(base.owner);
  });

  it("collapses a duplicate adapter so one (adapter, path) pair yields one row", () => {
    const owners = outputOwners({
      ...base,
      coOwners: [
        ownerOf("codex", "charter", "infra"),
        ownerOf("claude", "other-id", "skill"),
        ownerOf("codex", "charter", "infra"),
      ],
    });
    expect(owners).toEqual([
      ownerOf("claude", "charter", "infra"),
      ownerOf("codex", "charter", "infra"),
    ]);
  });
});

// ── Co-owner ledger expansion through the consumption sites ──────

/** A managed co-owned output: one write, several designated owners. */
function coOwnedOutput(coOwners: EmissionOwner[]): AdapterOutput {
  return {
    path: "AGENTS.md",
    content: wrapInManagedBlock("Shared charter body.\n", "AGENTS.md", ENGINE_VERSION),
    owner: ownerOf("claude", CHARTER_ARTIFACT_ID, "infra"),
    coOwners,
  };
}

/** A complete `RepoInfo` with nothing detected (initApply harness shape). */
function emptyInfo(rootDir: string): RepoInfo {
  return {
    rootDir,
    languages: [],
    frameworks: [],
    linters: [],
    testFrameworks: [],
    ciProviders: [],
    monorepoPackages: [],
    hasDockerfile: false,
    hasDataArtifacts: false,
    hasExistingAgents: false,
    existingTools: [],
  };
}

function initOptions(rootDir: string, tools: Tool[]): InitApplyOptions {
  const decisions: InitDecisions = {
    tools,
    toolsSource: "default",
    detectedTools: [],
    greenfield: true,
    monorepoPackages: [],
    maturityTier: "solo",
    maturitySource: "default",
    existingConfigPaths: [],
    detected: { languages: [], linters: [], testFrameworks: [], ciProviders: [] },
    repoInfo: emptyInfo(rootDir),
  };
  return {
    rootDir,
    decisions,
    engineVersion: ENGINE_VERSION,
    dryRun: false,
    force: false,
    now: FIXED_NOW,
  };
}

describe("co-owner ledger expansion", () => {
  beforeEach(async () => {
    plannerOutputs.value = [];
    __setContentRootForTests(await seedCorpus());
  });

  it("init apply records one ledger row per owner for a co-owned path, writing it once", async () => {
    plannerOutputs.value = [
      // The duplicated claude co-owner must collapse: rowKey identity is the
      // (adapter, path) pair, so the ledger takes claude once and codex once.
      coOwnedOutput([
        ownerOf("codex", CHARTER_ARTIFACT_ID, "infra"),
        ownerOf("claude", CHARTER_ARTIFACT_ID, "infra"),
      ]),
    ];
    const root = getTemp().path("init-repo");
    await mkdir(root, { recursive: true });

    const report = await applyInit(initOptions(root, ["claude", "codex"]));

    expect(report.wrote).toHaveLength(1);
    expect(report.ledgerCount).toBe(2);
    // Justification for the changed expectation: these rows previously carried
    // NO `contentHash`, because init omitted it while `sync` recorded it — the
    // two writers disagreed on the shape of a row describing the same emission.
    // The hash is the reclaim sweep's only authorship proof for block-less
    // whole-file output at a platform-mandated path, so the omission made a
    // freshly-inited repo un-cleanable until a sync backfilled it. Asserting the
    // hash EXPLICITLY (rather than accepting any string) is what pins the
    // contract the sweep depends on: it is sha256 of the full emitted content,
    // and both co-owner rows carry the one hash of the single write — the same
    // property the sync-side twin below asserts.
    const sharedHash = createHash("sha256")
      .update(wrapInManagedBlock("Shared charter body.\n", "AGENTS.md", ENGINE_VERSION))
      .digest("hex");
    expect((await readManifest(root))?.ledger).toEqual([
      {
        path: "AGENTS.md",
        adapter: "claude",
        artifactId: CHARTER_ARTIFACT_ID,
        artifactType: "infra",
        contentHash: sharedHash,
        stampedVersion: ENGINE_VERSION,
      },
      {
        path: "AGENTS.md",
        adapter: "codex",
        artifactId: CHARTER_ARTIFACT_ID,
        artifactType: "infra",
        contentHash: sharedHash,
        stampedVersion: ENGINE_VERSION,
      },
    ]);
  });

  it("sync engine expands co-owners through plan and apply: one write, one hashed row per owner", async () => {
    plannerOutputs.value = [coOwnedOutput([ownerOf("codex", CHARTER_ARTIFACT_ID, "infra")])];
    const root = getTemp().path("sync-repo");
    await mkdir(root, { recursive: true });
    await writeManifest(
      root,
      createManifest({
        tools: ["claude", "codex"],
        selection: { items: { agent: [], skill: [], rule: [], command: [] } },
        generatorVersion: ENGINE_VERSION,
        now: FIXED_NOW,
      }),
      { now: FIXED_NOW },
    );

    const plan = await planSync(root, ENGINE_VERSION, { runner: () => "" });
    expect(plan.collisions).toEqual([]);
    expect(plan.reclaim).toEqual([]);

    const report = await applySync(root, plan, {
      engineVersion: ENGINE_VERSION,
      force: false,
      dryRun: false,
      now: FIXED_NOW,
    });

    expect(report.wrote).toHaveLength(1);
    const ledger = report.manifest?.ledger ?? [];
    expect(ledger.map((entry) => [entry.adapter, entry.path])).toEqual([
      ["claude", "AGENTS.md"],
      ["codex", "AGENTS.md"],
    ]);
    // One write backs both rows: identical hash, identical stamp.
    expect(new Set(ledger.map((entry) => entry.contentHash)).size).toBe(1);
    expect(ledger.every((entry) => entry.stampedVersion === ENGINE_VERSION)).toBe(true);
  });
});
