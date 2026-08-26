import { readdir, readFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as RosterModule from "../../src/roster/agentPolicies.ts";
import {
  LIVE_CAPABILITY_INPUTS,
  renderCapabilityMatrixFrom,
} from "../../src/emit/capabilityMatrix.ts";
import { planHooksInfra } from "../../src/emit/hooksInfra.ts";
import {
  buildCoreEmissionPlan,
  composeEmissionPlanner,
  type AdapterDialectFacts,
  type CoreEmissionPlan,
  type EmissionContext,
  type ResidueEmission,
  type ResiduePlanner,
} from "../../src/emit/planner.ts";
import { projectSkills } from "../../src/emit/skillsProjection.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import type { CatalogFs } from "../../src/content/catalog.ts";
import type { ResolvedPackContent } from "../../src/pack/projection.ts";
import type { Tool } from "../../src/types/core.ts";
import { EngineError } from "../../src/types/errors.ts";
import type { ImportDecision, McpConfig } from "../../src/types/manifest.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Gap-closing lane for the `src/emit/` core: the refusal guards, absence
 * renderings, and failure paths the behavioural suites had no reason to reach,
 * because each needs an input a healthy corpus never produces (a roster that
 * fails its own validator, a directory entry that is neither file nor
 * directory, a residue planner that rejects with a non-Error).
 *
 * Existing suites are untouched; nothing here weakens or replaces an assertion
 * they already make. Each `describe` names the single branch it closes so a
 * later reader can tell why the case exists at all.
 *
 * The agent-policy roster is WRAPPED, not replaced: every other export of that
 * module stays real, and only the roster constant carries the one defect that
 * makes `validateToolPolicies` produce an issue — the input that turns the
 * roster-warning mapper from dead code into a reachable path.
 */

/**
 * A roster row that is well-formed except for the one field the validator
 * rejects. Declared through `vi.hoisted` because the mock factory below is
 * hoisted above every module-level binding in this file.
 */
const roster = vi.hoisted(() => ({
  rows: [{ agentId: "stamity-fixture-agent", allow: ["read"], rationale: "   " }],
}));

vi.mock("../../src/roster/agentPolicies.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof RosterModule>();
  return {
    ...actual,
    AGENT_POLICY_ROSTER: roster.rows,
    RUNTIME_AGENT_IDS: roster.rows.map((row) => row.agentId),
  };
});

const getTemp = useTempDir("emit-gaps");

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

/**
 * Seeds the fixture corpus and returns its root.
 *
 * The skill deliberately carries BOTH a `refs/` directory and a `refs.md`
 * file. The walk emits directory-name order (`refs` before `refs.md`, since
 * the shorter name sorts first), while the projected PATHS sort the other way
 * (`refs.md` before `refs/x.md`, because `.` precedes `/` in codepoint order).
 * The flattened per-skill rows are therefore genuinely out of order, which is
 * the input the projection's final path sort exists for.
 */
async function seedCorpus(): Promise<string> {
  await getTemp().seedFiles({
    "corpus/charter/stamity-charter.md": CHARTER_FIXTURE,
    "corpus/skills/stamity-alpha/SKILL.md": SKILL_FIXTURE,
    "corpus/skills/stamity-alpha/refs.md": "Sibling note.\n",
    "corpus/skills/stamity-alpha/refs/x.md": "Nested note.\n",
  });
  return getTemp().path("corpus");
}

// TEST CHANGE, justified: `mcp` and `importChoice` are additive optional
// parameters on these two local helpers. Every existing call site passes
// neither and is unaffected; the additions exist so the import-decision case
// below can vary one manifest field without duplicating the fixture.
function manifestFor(
  tools: Tool[],
  mcp?: McpConfig,
  // A decision LIST, matching the manifest shape.
  importChoice?: readonly ImportDecision[],
): ReturnType<typeof createManifest> {
  return createManifest({
    tools,
    selection: { items: { agent: [], skill: ["alpha"], rule: [], command: [] } },
    generatorVersion: ENGINE_VERSION,
    now: FIXED_NOW,
    ...(mcp === undefined ? {} : { mcp }),
    ...(importChoice === undefined ? {} : { importChoice }),
  });
}

function ctxOf(
  tools: Tool[],
  contentRoot: string,
  mcp?: McpConfig,
  importChoice?: readonly ImportDecision[],
): EmissionContext {
  return {
    rootDir: getTemp().path("repo"),
    manifest: manifestFor(tools, mcp, importChoice),
    engineVersion: ENGINE_VERSION,
    facts: { greenfield: true, monorepoPackages: [] },
    contentRoot,
  };
}

/** Live capability inputs with one client's facts patched — derive, never duplicate. */
const withFacts = (
  tool: Tool,
  patch: Partial<AdapterDialectFacts>,
): typeof LIVE_CAPABILITY_INPUTS => ({
  ...LIVE_CAPABILITY_INPUTS,
  facts: LIVE_CAPABILITY_INPUTS.facts.map((row) => (row.tool === tool ? { ...row, ...patch } : row)),
});

const factsFor = (tool: Tool): AdapterDialectFacts => {
  const facts = LIVE_CAPABILITY_INPUTS.facts.find((row) => row.tool === tool);
  if (facts === undefined) throw new Error(`no live facts for ${tool}`);
  return facts;
};

afterEach(() => {
  vi.restoreAllMocks();
});

// ── src/emit/capabilityMatrix.ts ───────────────────────────────────────────

describe("capabilityMatrix: a data set naming one client twice", () => {
  it("refuses the duplicate rather than rendering the first row and dropping the second", () => {
    const call = (): string =>
      renderCapabilityMatrixFrom({
        ...LIVE_CAPABILITY_INPUTS,
        facts: [...LIVE_CAPABILITY_INPUTS.facts, { ...factsFor("claude") }],
      });

    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/dialect-facts set declares `claude` twice/);
  });

  it("applies the same duplicate check to the guarantee table", () => {
    const guarantees = LIVE_CAPABILITY_INPUTS.guarantees;
    const first = guarantees[0];
    expect(first).toBeDefined();

    expect(() =>
      renderCapabilityMatrixFrom({
        ...LIVE_CAPABILITY_INPUTS,
        guarantees: [...guarantees, { ...first! }],
      }),
    ).toThrowError(/hook-guarantee table declares `.+` twice/);
  });
});

describe("capabilityMatrix: a citation whose URL is blank", () => {
  it("refuses to render the client's row, naming the client at fault", () => {
    // Whitespace, not empty string: the guard trims before testing, so a
    // blank-looking URL is caught the same way a truly empty one is.
    const call = (): string =>
      renderCapabilityMatrixFrom(
        withFacts("copilot", { citations: [{ url: "   ", accessDate: "2026-08-14" }] }),
      );

    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/`copilot` adapter declares a citation with no URL/);
  });
});

describe("capabilityMatrix: a client declaring no caps at all", () => {
  it("renders the absence as a sentence instead of an empty table", () => {
    const page = renderCapabilityMatrixFrom(withFacts("claude", { caps: [] }));

    expect(page).toContain("Declared caps: none.");
    // The other clients still render their cap tables, so the absence is
    // per-client rather than a page-wide fallback.
    expect(page).toContain("| Cap | Declared value |");
  });
});

// ── src/emit/hooksInfra.ts ─────────────────────────────────────────────────

describe("hooksInfra: a roster that fails its own validator", () => {
  it("reports each roster issue as a prefixed plan warning instead of dropping it", async () => {
    const plan = await planHooksInfra({
      rootDir: getTemp().path("repo"),
      manifest: { tools: ["claude"] },
    });

    const rosterWarnings = plan.warnings.filter((w) => w.startsWith("agent-tool-policy roster: "));
    expect(rosterWarnings).toHaveLength(1);
    expect(rosterWarnings[0]).toContain("stamity-fixture-agent");
    expect(rosterWarnings[0]).toContain("rationale");
    // The plan still produces its document — a roster defect is reported, not fatal.
    expect(plan.policyDocument.content).toContain("stamity-fixture-agent");
  });
});

// ── src/emit/skillsProjection.ts ───────────────────────────────────────────

describe("skillsProjection: a directory entry that is neither file nor directory", () => {
  it("skips it rather than projecting it as a regular file", async () => {
    const corpus = await seedCorpus();
    const dangling = {
      name: "dangling-link.md",
      isDirectory: () => false,
      isFile: () => false,
      isSymbolicLink: () => true,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isFIFO: () => false,
      isSocket: () => false,
    } as unknown as Dirent;

    // The real fs is wrapped, not replaced: only the one skill directory gains
    // the extra entry, so every other read in the walk is the genuine corpus.
    // Its entries come back REVERSED as well, so the walk's own name sort is
    // handed a genuinely unordered listing rather than an already-sorted one.
    const fs: CatalogFs = {
      readFile,
      readdir: (async (path: unknown, options: unknown) => {
        const entries = (await (readdir as (p: unknown, o: unknown) => Promise<unknown[]>)(
          path,
          options,
        )) as Dirent[];
        return String(path).endsWith("stamity-alpha") ? [...entries.toReversed(), dangling] : entries;
      }) as CatalogFs["readdir"],
    };

    const rows = await projectSkills(
      { manifest: manifestFor(["claude"]), engineVersion: ENGINE_VERSION },
      { contentRoot: corpus, fs },
    );

    // Codepoint-sorted regardless of the listing order the fs returned, and
    // the non-regular entry never becomes a row.
    expect(rows.map((row) => row.path)).toEqual([
      ".agents/skills/stamity-alpha/SKILL.md",
      ".agents/skills/stamity-alpha/refs.md",
      ".agents/skills/stamity-alpha/refs/x.md",
    ]);
    expect(rows.some((row) => row.path.includes("dangling-link.md"))).toBe(false);
  });
});

// ── src/emit/planner.ts ────────────────────────────────────────────────────

describe("planner: a manifest pinning an MCP protocol revision", () => {
  it("carries the pinned revision into the emission instead of the engine default", async () => {
    const corpus = await seedCorpus();
    const pinned = "2025-06-18";

    const core = await buildCoreEmissionPlan(
      ctxOf(["claude"], corpus, { servers: ["context7"], protocolVersion: pinned }),
    );
    const emissions = core.mcpFor("claude");

    expect(emissions).toHaveLength(1);
    expect(emissions[0]?.content).toContain(pinned);

    // Same inputs without the pin: the revision is the emitter's own default,
    // so the assertion above tracks the manifest and not a constant.
    const unpinned = await buildCoreEmissionPlan(
      ctxOf(["claude"], corpus, { servers: ["context7"] }),
    );
    expect(unpinned.mcpFor("claude")[0]?.content).not.toContain(pinned);
  });
});

describe("planner: pack skill rows that sort ahead of the corpus rows", () => {
  it("interleaves them into one codepoint-ordered skills set", async () => {
    const corpus = await seedCorpus();
    // Injected rather than installed: `buildCoreEmissionPlan` takes the
    // resolved pack content directly, so the merge order is exercised without
    // a pack ledger. The row's path sorts BEFORE every corpus row, which is
    // what makes the concatenation unordered and the merge sort observable.
    const packs: ResolvedPackContent = {
      packs: [],
      packRoots: [],
      items: [],
      // Empty: this case exercises the skill-row merge order, and the MCP lane
      // resolves separately from the catalog walk — no server contributes here.
      mcpServers: [],
      // Same reason: no pack agent participates in a skills-ordering case.
      agents: [],
      skillRows: [
        {
          path: ".agents/skills/aaa-pack-skill/SKILL.md",
          content: "# Pack skill\n",
          artifactId: "pack-skill",
          artifactType: "skill",
        },
      ],
    };

    const core = await buildCoreEmissionPlan(ctxOf(["claude"], corpus), packs);

    expect(core.skills.map((row) => row.path)).toEqual([
      ".agents/skills/aaa-pack-skill/SKILL.md",
      ".agents/skills/stamity-alpha/SKILL.md",
      ".agents/skills/stamity-alpha/refs.md",
      ".agents/skills/stamity-alpha/refs/x.md",
    ]);
    // TEST CHANGE, justified: a maintainer ruling deleted the Agent-Plugins
    // container, so "the container lists the pack skill beside the corpus ones"
    // has no surface left to assert on. The behaviour it stood for — a pack
    // skill is reachable exactly the way a corpus skill is — now reads off the
    // one projection directly: the pack row carries its own ledger identity and
    // artifact type in the same merged set as the corpus rows, which is what
    // made it emittable and reclaimable in the first place.
    const packRow = core.skills.find(
      (row) => row.path === ".agents/skills/aaa-pack-skill/SKILL.md",
    );
    expect(packRow).toBeDefined();
    expect(packRow!.artifactId).toBe("pack-skill");
    expect(packRow!.artifactType).toBe(
      core.skills.find((row) => row.path === ".agents/skills/stamity-alpha/SKILL.md")!.artifactType,
    );
  });
});

describe("planner: an import decision naming a path this plan does not emit", () => {
  it("is inert in every mode — the plan is byte-identical to the undecided one", async () => {
    const corpus = await seedCorpus();
    // Core-only composition: no residue planner is registered, so the rows are
    // the shared core set and the decision below is the only variable.
    const planner = composeEmissionPlanner({});
    const baseline = await planner.plan(ctxOf(["claude"], corpus));

    // The premise the case rests on: rows exist, and none sits on the decided
    // path — an instruction file for a client whose adapter emits nothing there.
    const unplanned = "docs/legacy-instructions.md";
    expect(baseline.length).toBeGreaterThan(0);
    expect(baseline.some((row) => row.path === unplanned)).toBe(false);

    // `supplement` is what pins the absence guard rather than merely passing
    // through it: without the `row === undefined` return, the mode would read
    // `.content` off the missing row and throw instead of leaving the plan be.
    // Mode list derived from the type, so a fourth mode fails to compile here
    // rather than silently going unexercised.
    const modes = [
      "skip",
      "supplement",
      "replace",
    ] as const satisfies readonly ImportDecision["mode"][];
    const decided = await Promise.all(
      modes.map((mode) =>
        planner.plan(ctxOf(["claude"], corpus, undefined, [{ path: unplanned, mode }])),
      ),
    );
    for (const plan of decided) expect(plan).toEqual(baseline);
  });
});

describe("planner: a residue planner rejecting with a non-Error value", () => {
  it("names what came back and states that nothing was written", async () => {
    const corpus = await seedCorpus();
    const thrown: ResiduePlanner = {
      tool: "claude",
      facts: factsFor("claude"),
      planResidue: (): Promise<ResidueEmission> => Promise.reject("the adapter returned a string"),
    };

    const planner = composeEmissionPlanner({ claude: thrown });
    const call = planner.plan(ctxOf(["claude"], corpus));

    await expect(call).rejects.toThrowError(EngineError);
    await expect(call).rejects.toThrowError(/the adapter returned a string/);
    await expect(call).rejects.toThrowError(/No files were written/);
  });

  it("reports an Error rejection through the same path, using its message", async () => {
    const corpus = await seedCorpus();
    const thrown: ResiduePlanner = {
      tool: "cursor",
      facts: factsFor("cursor"),
      planResidue: (_core: CoreEmissionPlan): Promise<ResidueEmission> =>
        Promise.reject(new Error("dialect table missing")),
    };

    await expect(
      composeEmissionPlanner({ cursor: thrown }).plan(ctxOf(["cursor"], corpus)),
    ).rejects.toThrowError(/dialect table missing/);
  });
});
