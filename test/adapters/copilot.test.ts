import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import {
  COPILOT_AGENT_PROMPT_CAP,
  COPILOT_DIALECT_FACTS,
  COPILOT_SETUP_STEPS_PATH,
  buildAgentFile,
  buildInstructionsFile,
  buildPromptFile,
  buildSetupSteps,
  copilotResiduePlanner,
} from "../../src/adapters/copilot.ts";
import { __resetContentRootCacheForTests } from "../../src/content/contentRoot.ts";
import type { CatalogItem } from "../../src/content/catalog.ts";
import { renderCapabilityMatrix } from "../../src/emit/capabilityMatrix.ts";
import type { PackageManagerInfo } from "../../src/detect/packageManager.ts";
import { buildCoreEmissionPlan, composeEmissionPlanner, type EmissionContext } from "../../src/emit/planner.ts";
import { CLIENT_HOOK_GUARANTEES } from "../../src/hooks/model.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import { resolveAgentGrant, type ResolvedAgentGrant } from "../../src/roster/agentGrants.ts";
import type { GrantableToolCategory } from "../../src/roster/agentPolicies.ts";
import { AGENT_POLICY_ROSTER } from "../../src/roster/agentPolicies.ts";
import {
  CLIENT_MODEL_PROJECTION,
  resolveEffortValue,
  MODEL_LADDER,
} from "../../src/roster/modelLadder.ts";
import { PLATFORM_TOOL_MARKER, toCopilotToolsFrontmatter } from "../../src/tools/translator.ts";
import type { AdapterOutput, ContentSelection } from "../../src/types/content.ts";
import type { ModelClass, Tool } from "../../src/types/core.ts";
import type { PackageEntry } from "../../src/types/detect.ts";
import { EngineError } from "../../src/types/errors.ts";
import { CONTENT_PREFIX } from "../../src/types/markers.ts";
import { CORPUS_ROOT, loadCorpusIndex } from "../corpus/harness.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The Copilot residue planner. Two lanes, matching how the adapter is used:
 *
 *   - THROUGH the real emission pipeline — `composeEmissionPlanner` over the
 *     shipped corpus, into a temp repo root — for the client-surface claims
 *     (what exists, what deliberately does not, who owns it, determinism).
 *   - Direct builder calls on constructed catalog items for the dialect
 *     details a corpus fixture would only obscure (glob shapes, the prompt
 *     cap, YAML escaping).
 *
 * Planning is pure, so the "temp repo root" is never created by these runs; it
 * exists so the package-manager probe reads a KNOWN repository rather than
 * whichever one the suite happens to run inside.
 */

const getTemp = useTempDir("adapter-copilot");

const ENGINE_VERSION = "0.0.0-test";
const FIXED_NOW = new Date("2026-08-14T00:00:00.000Z");

/** The shipped corpus: the seven pipeline roles plus the three specialist lenses. */
const CORPUS_AGENT_IDS = [
  "creator",
  "design-quality",
  "fixer",
  "implementer",
  "performance",
  "researcher",
  "reviewer",
  "security",
  "spec-author",
  "test-runner",
] as const;

/** The three CQ specialist lenses, which read and never edit. */
const SPECIALIST_AGENT_IDS = ["design-quality", "performance", "security"] as const;

const CORPUS_COMMAND_IDS = [
  "ask",
  "board",
  "debug",
  "plan",
  "pr-resolve",
  "quick",
  "rework",
  "spec",
  "work",
] as const;

const CORPUS_RULE_COUNT = 12;

const EMPTY_SELECTION: ContentSelection = {
  items: { agent: [], skill: [], rule: [], command: [] },
};

/**
 * Selection with every class key ABSENT, which the emission allowlist reads as
 * unfiltered — the whole corpus ships. Distinct from {@link EMPTY_SELECTION},
 * where the classes are present and empty ("install nothing").
 */
const FULL_SELECTION: ContentSelection = { items: {} as ContentSelection["items"] };

interface CtxOptions {
  tools?: Tool[];
  contentRoot?: string;
  rootDir?: string;
  selection?: ContentSelection;
  packages?: PackageEntry[];
  mcp?: { servers: string[] };
  languages?: string[];
  pins?: Partial<Record<ModelClass, string>>;
}

function ctxOf(over: CtxOptions = {}): EmissionContext {
  return {
    rootDir: over.rootDir ?? getTemp().path("repo"),
    manifest: {
      ...createManifest({
        tools: over.tools ?? ["copilot"],
        selection: over.selection ?? FULL_SELECTION,
        generatorVersion: ENGINE_VERSION,
        now: FIXED_NOW,
        ...(over.mcp === undefined ? {} : { mcp: over.mcp }),
        detected: {
          languages: over.languages ?? [],
          linters: ["eslint"],
          testFrameworks: ["vitest"],
          ciProviders: ["github-actions"],
        },
      }),
      // `models` is an operator dial persisted after creation, so it is layered
      // on rather than passed in — the same shape `stamity config` writes.
      ...(over.pins === undefined ? {} : { models: { pins: over.pins } }),
    },
    engineVersion: ENGINE_VERSION,
    facts: { monorepoPackages: over.packages ?? [] },
    contentRoot: over.contentRoot ?? CORPUS_ROOT,
  };
}

/** The residue rows alone, straight from the planner over the core plan. */
async function planResidue(over: CtxOptions = {}): Promise<AdapterOutput[]> {
  const ctx = ctxOf(over);
  return (await copilotResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs;
}

/** The composed plan: core rows plus copilot residue, exactly as init/sync consume it. */
function planComposed(over: CtxOptions = {}): Promise<AdapterOutput[]> {
  return composeEmissionPlanner({ copilot: copilotResiduePlanner }).plan(ctxOf(over));
}

const pathsOf = (plan: readonly AdapterOutput[]): string[] => plan.map((row) => row.path);

const rowAt = (plan: readonly AdapterOutput[], path: string): AdapterOutput => {
  const row = plan.find((entry) => entry.path === path);
  expect(row, `expected a row at ${path}`).toBeDefined();
  return row!;
};

/** Frontmatter lines of an emitted document, fence excluded. */
function frontmatterLines(content: string): string[] {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  expect(match, "expected a leading frontmatter fence").not.toBeNull();
  return (match?.[1] ?? "").split("\n");
}

/** The value of one frontmatter key, raw (quoting included). */
function frontmatterValue(content: string, key: string): string | undefined {
  const line = frontmatterLines(content).find((entry) => entry.startsWith(`${key}: `));
  return line?.slice(key.length + 2);
}

/** The emitted stem for a corpus id, prefixed or not — mirrors the adapter's own rule. */
const emittedName = (id: string): string =>
  id.startsWith(CONTENT_PREFIX) ? id : `${CONTENT_PREFIX}${id}`;

/**
 * A rule's declared globs, read straight from the corpus authoring shape.
 *
 * Read here rather than through the adapter's own parse on purpose: the
 * round-trip test asks whether the EMITTED string still carries what the author
 * declared, and routing both sides through one parser would let a shared defect
 * agree with itself. Array and comma-separated forms are both authorable.
 */
function declaredGlobsOf(item: CatalogItem): string[] {
  const declared = item.frontmatter["globs"];
  const raw: unknown[] =
    typeof declared === "string" ? declared.split(",") : Array.isArray(declared) ? declared : [];
  const globs = raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  return [...new Set(globs)];
}

/** A catalog item literal — enough shape for the builders, none of the walk. */
function itemOf(over: Partial<CatalogItem> & Pick<CatalogItem, "type" | "id">): CatalogItem {
  return {
    filePath: `/virtual/${over.id}.md`,
    relativePath: `${over.type}s/stamity-${over.id}.md`,
    description: "fixture description",
    tags: [],
    body: "\n# Fixture\n\nBody text.\n",
    frontmatter: {},
    ...over,
  };
}

/** Identity renderer: the builders' substitution seam, held still. */
const asIs = (raw: string): string => raw;

/**
 * A grant as the production resolver computes it — never a hand-built literal.
 *
 * The builders take a resolved grant, and the point of the resolver is that one
 * agent gets one answer everywhere; a test that assembled the object by hand
 * would prove the emission and skip the derivation that decides it.
 */
function grantOf(
  runtimeId: string,
  frontmatter: Readonly<Record<string, unknown>> = {},
  declaredTools?: readonly GrantableToolCategory[],
): ResolvedAgentGrant {
  return resolveAgentGrant({
    runtimeId,
    frontmatter,
    ...(declaredTools === undefined ? {} : { declaredTools }),
  });
}

/** One declared capability limit, by name — the rows the capability matrix renders. */
function capOf(name: string): string | undefined {
  return COPILOT_DIALECT_FACTS.caps.find((cap) => cap.name === name)?.value;
}

/** The roster row for a runtime id — the source the corpus agents' maps must match. */
function rosterAllow(runtimeId: string): readonly GrantableToolCategory[] {
  const row = AGENT_POLICY_ROSTER.find((entry) => entry.agentId === runtimeId);
  expect(row, `roster row for ${runtimeId}`).toBeDefined();
  return row!.allow;
}

/** A stand-in for the real substitution pass, resolving exactly one token. */
const resolveLinter = (raw: string): string => raw.replaceAll("${STAMITY:LINTER}", "eslint");

function packageManagerOf(over: Partial<PackageManagerInfo> = {}): PackageManagerInfo {
  return { name: "npm", lockfile: null, fromPackageJsonField: false, ...over };
}

/** Every file under `dir`, POSIX-relative and sorted — the purity probe. */
async function tree(dir: string): Promise<string[]> {
  const entries = (await readdir(dir, { recursive: true })) as string[];
  return entries.map((entry) => entry.split(sep).join("/")).toSorted();
}

afterEach(() => {
  __resetContentRootCacheForTests();
});

// ── Rules → applyTo instructions ─────────────────────────────────

describe("rules → .github/instructions", () => {
  // Separator expectations below moved from `", "` to `","` with the constant
  // itself: the reference documents comma-only separation and shows it
  // unpadded, and the padded form depended on a trim that lives in the client's
  // matcher rather than in the published format. Behaviour asserted, not
  // spelling preference — the emitted bytes are what a reader splits.
  it("joins a conditional rule's globs into ONE quoted comma-separated applyTo string", () => {
    const output = buildInstructionsFile(
      itemOf({
        type: "rule",
        id: "security-patterns",
        description: "Floor for caller-facing code",
        frontmatter: { scope: "conditional", globs: ["**/auth/**", "**/api/**"] },
      }),
      asIs,
    );

    expect(output.path).toBe(".github/instructions/stamity-security-patterns.instructions.md");
    expect(frontmatterValue(output.content, "applyTo")).toBe('"**/auth/**,**/api/**"');
    // No padding to depend on a reader's trim for: the documented spelling is
    // the emitted one.
    expect(frontmatterValue(output.content, "applyTo")).not.toContain(", ");
    expect(frontmatterValue(output.content, "description")).toBe('"Floor for caller-facing code"');
  });

  it("round-trips every shipped rule's declared glob set through its emitted applyTo", async () => {
    const plan = await planResidue();
    const instructions = plan.filter((row) => row.path.endsWith(".instructions.md"));
    const rules = (await loadCorpusIndex()).items.filter((item) => item.type === "rule");

    expect(instructions).toHaveLength(CORPUS_RULE_COUNT);
    expect(rules).toHaveLength(CORPUS_RULE_COUNT);

    for (const item of rules) {
      const row = rowAt(instructions, `.github/instructions/${emittedName(item.id)}.instructions.md`);
      const raw = frontmatterValue(row.content, "applyTo") ?? "";
      // Parses as ONE scalar, never a YAML sequence.
      const value = (parseYaml(`applyTo: ${raw}`) as { applyTo: string }).applyTo;
      expect(typeof value, row.path).toBe("string");

      // Split on the bare comma — no trim — and the patterns come back exactly
      // as declared. A padded separator would surface here as a leading space
      // on every pattern after the first.
      const parsedBack = value.split(",");
      for (const pattern of parsedBack) expect(pattern, row.path).toBe(pattern.trim());

      const declared = declaredGlobsOf(item);
      expect(new Set(parsedBack), row.path).toEqual(
        // A rule with no globs cannot be pulled by description on this client,
        // so it attaches everywhere instead.
        new Set(declared.length === 0 ? ["**"] : declared),
      );
    }
  });

  it("emits a single glob with no separator at all", () => {
    const output = buildInstructionsFile(
      itemOf({ type: "rule", id: "learnings-schema", frontmatter: { globs: [".stamity/learnings/**"] } }),
      asIs,
    );

    expect(frontmatterValue(output.content, "applyTo")).toBe('".stamity/learnings/**"');
    expect(frontmatterValue(output.content, "applyTo")).not.toContain(",");
  });

  it("leaves a brace-expansion glob intact — the separator never reaches inside braces", () => {
    const output = buildInstructionsFile(
      itemOf({ type: "rule", id: "braces", frontmatter: { globs: ["**/*.{ts,tsx}", "**/api/**"] } }),
      asIs,
    );

    // The brace group's own comma is untouched and unpadded, so a brace-aware
    // reader sees one pattern where one was declared. Under the padded
    // separator the joined string carried a space the group did not.
    expect(frontmatterValue(output.content, "applyTo")).toBe('"**/*.{ts,tsx},**/api/**"');
    expect(frontmatterValue(output.content, "applyTo")).not.toContain(", ");
  });

  it("documents the separator constant with a vendor citation and an access date", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../../src/adapters/copilot.ts", import.meta.url)),
      "utf8",
    );

    // The one place the spelling changes carries the evidence for it, so a
    // future currency pass re-reads a page rather than guessing at intent.
    const documented = /\/\*\*(?:(?!\*\/)[\s\S])*\*\/\nconst APPLY_TO_SEPARATOR = ",";/.exec(source);
    expect(documented, "expected a doc comment directly above APPLY_TO_SEPARATOR").not.toBeNull();
    const comment = documented?.[0] ?? "";
    expect(comment).toContain("add-repository-instructions-in-your-ide");
    expect(comment).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('falls back to applyTo: "**" for an agent-requested rule — Copilot has no pull mode', () => {
    const output = buildInstructionsFile(
      itemOf({
        type: "rule",
        id: "question-protocol",
        description: "When a request is ambiguous: ask one question with a declared default.",
        frontmatter: { scope: "agent-requested" },
      }),
      asIs,
    );

    expect(frontmatterValue(output.content, "applyTo")).toBe('"**"');
    // The authored trigger phrasing is what tells the model when the file is
    // relevant, since the activation itself can no longer say so.
    expect(output.content).toContain("When a request is ambiguous");
  });

  it("YAML-escapes a glob containing a double quote instead of breaking the scalar", () => {
    const output = buildInstructionsFile(
      itemOf({ type: "rule", id: "odd", frontmatter: { globs: ['**/we"ird/**', "**/api/**"] } }),
      asIs,
    );

    const applyTo = frontmatterValue(output.content, "applyTo");
    expect(applyTo).toBe('"**/we\\"ird/**,**/api/**"');
    // Round-trips through a real YAML parser back to the intended value.
    const parsed = parseYaml(frontmatterLines(output.content).join("\n")) as { applyTo: string };
    expect(parsed.applyTo).toBe('**/we"ird/**,**/api/**');
  });

  it("reads the comma-separated authoring shape and de-duplicates repeats", () => {
    const output = buildInstructionsFile(
      itemOf({ type: "rule", id: "csv", frontmatter: { globs: "**/api/**, **/api/**, **/db/**" } }),
      asIs,
    );

    // The authoring shape may pad; the emitted shape does not.
    expect(frontmatterValue(output.content, "applyTo")).toBe('"**/api/**,**/db/**"');
  });

  it("keeps a multi-line description on one line so it cannot open a second key", () => {
    const output = buildInstructionsFile(
      itemOf({
        type: "rule",
        id: "multiline",
        description: "First half\nalwaysApply: true",
        frontmatter: { globs: ["**/*.ts"] },
      }),
      asIs,
    );

    expect(frontmatterLines(output.content)).toEqual([
      'applyTo: "**/*.ts"',
      'description: "First half alwaysApply: true"',
    ]);
  });

  it("emits one instruction file per shipped rule, through the real pipeline", async () => {
    const plan = await planResidue();

    const instructions = pathsOf(plan).filter((path) => path.endsWith(".instructions.md"));
    expect(instructions).toHaveLength(CORPUS_RULE_COUNT);
    expect(instructions.every((path) => path.startsWith(".github/instructions/stamity-"))).toBe(true);
  });
});

// ── Agents → target + least-privilege tools ──────────────────────

describe("agents → .github/agents", () => {
  it("emits every shipped agent with target: github-copilot and its roster grant as tools", async () => {
    const plan = await planResidue();

    for (const id of CORPUS_AGENT_IDS) {
      const row = rowAt(plan, `.github/agents/stamity-${id}.agent.md`);

      expect(frontmatterLines(row.content)).toEqual([
        `name: stamity-${id}`,
        `description: ${frontmatterValue(row.content, "description")}`,
        "target: github-copilot",
        `tools: ${toCopilotToolsFrontmatter(rosterAllow(`stamity-${id}`))}`,
      ]);
      expect(frontmatterValue(row.content, "tools")).not.toBe("[]");
      expect(row.owner).toEqual({ adapter: "copilot", artifactId: id, artifactType: "agent" });
    }

    expect(pathsOf(plan).filter((path) => path.endsWith(".agent.md"))).toHaveLength(
      CORPUS_AGENT_IDS.length,
    );
  });

  it("emits the three specialist lenses with read-only tool maps", async () => {
    const plan = await planResidue();

    for (const id of SPECIALIST_AGENT_IDS) {
      const row = rowAt(plan, `.github/agents/stamity-${id}.agent.md`);
      // Read and nothing else: a lens that could edit would be answering its
      // own finding in the next round.
      expect(rosterAllow(`stamity-${id}`)).toEqual(["read"]);
      expect(frontmatterValue(row.content, "tools")).toBe(toCopilotToolsFrontmatter(["read"]));
      expect(frontmatterValue(row.content, "tools")).not.toContain("edit");
    }
  });

  it("carries a core agent's roster grant unchanged when its own frontmatter would differ", () => {
    // A file shipped under a core id cannot widen (or narrow) that id's grant:
    // the roster answers, and the emitted map is the one the shipped agent has
    // always had.
    const claimed = grantOf(
      "stamity-reviewer",
      { capabilities: ["read", "edit", "execute"] },
      ["read", "edit", "execute"],
    );

    expect(claimed.source).toBe("roster");
    expect(
      frontmatterValue(
        buildAgentFile(itemOf({ type: "agent", id: "reviewer" }), claimed, asIs).content,
        "tools",
      ),
    ).toBe(toCopilotToolsFrontmatter(rosterAllow("stamity-reviewer")));
  });

  it("emits a pack agent's real least-privilege map, bounded by its pack's footprint", () => {
    // The pack-agent grant outcome: a pack agent used to emit `[]` because the
    // roster had no row for it. Its grant is now its own capabilities INTERSECTED
    // with the footprint the install preview disclosed — `execute` is asked for and
    // dropped, so what ships is narrower than the file claims.
    const grant = grantOf(
      "stamity-release",
      { capabilities: ["read", "edit", "execute"] },
      ["read", "edit"],
    );

    expect(grant.source).toBe("frontmatter");
    expect(grant.allow).toEqual(["read", "edit"]);

    const output = buildAgentFile(itemOf({ type: "agent", id: "release" }), grant, asIs);
    const tools = frontmatterValue(output.content, "tools");
    expect(tools).toBe(toCopilotToolsFrontmatter(["read", "edit"]));
    expect(tools).not.toBe("[]");
    expect(tools).not.toContain("execute");
  });

  it("never omits tools: every unresolvable grant still emits a key", () => {
    // An ABSENT tools: key grants every tool including MCP — the widest possible
    // emission — so the fail-closed answer has to be an explicit empty list, on
    // each of the three paths that reach it.
    const unresolvable: ResolvedAgentGrant[] = [
      // No roster row, no capabilities at all.
      grantOf("stamity-unrostered"),
      // Capabilities declared, but no pack footprint to bound them: a caller
      // defect resolves DOWN, never to an unbounded grant.
      grantOf("stamity-unbounded", { capabilities: ["read", "edit"] }),
      // Malformed field — nothing readable is nothing granted.
      grantOf("stamity-malformed", { capabilities: "read" }, ["read"]),
    ];

    for (const grant of unresolvable) {
      const output = buildAgentFile(itemOf({ type: "agent", id: grant.runtimeId }), grant, asIs);
      expect(grant.allow, grant.runtimeId).toEqual([]);
      expect(frontmatterValue(output.content, "tools"), grant.runtimeId).toBe("[]");
      expect(frontmatterLines(output.content).some((line) => line.startsWith("tools:"))).toBe(true);
      expect(output.content).toContain("target: github-copilot");
    }
  });

  it("fail-closes an unrostered agent through the real pipeline, capabilities notwithstanding", async () => {
    const temp = getTemp();
    await temp.seedFiles({
      "corpus/charter/stamity-charter.md": ["---", "id: charter", "---", "", "# Charter", ""].join("\n"),
      "corpus/agents/stamity-widening.md": [
        "---",
        "id: widening",
        "type: agent",
        "description: claims more than any ceiling grants",
        "capabilities: [read, edit, execute, network]",
        "---",
        "",
        "Body.",
        "",
      ].join("\n"),
    });

    const plan = await planResidue({ contentRoot: temp.path("corpus") });

    // No roster row and no pack ceiling reachable from the emission context, so
    // the frontmatter alone grants nothing — the ceiling is what bounds a
    // derived grant, and emission never substitutes a claim for it.
    expect(
      frontmatterValue(rowAt(plan, ".github/agents/stamity-widening.agent.md").content, "tools"),
    ).toBe("[]");
  });

  it("refuses an agent whose emitted prompt exceeds the 30,000-character cap, naming it", () => {
    const oversized = itemOf({
      type: "agent",
      id: "huge",
      body: `\n${"x".repeat(COPILOT_AGENT_PROMPT_CAP + 1)}\n`,
    });

    let thrown: unknown;
    try {
      buildAgentFile(oversized, grantOf("stamity-reviewer"), asIs);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EngineError);
    expect((thrown as EngineError).code).toBe("VALIDATION_ERROR");
    expect((thrown as EngineError).message).toContain("stamity-huge");
    expect((thrown as EngineError).message).toContain(String(COPILOT_AGENT_PROMPT_CAP));
  });

  it("admits a prompt exactly at the cap — the boundary is inclusive", () => {
    const atCap = itemOf({ type: "agent", id: "edge", body: `\n${"x".repeat(COPILOT_AGENT_PROMPT_CAP)}\n` });

    expect(() => buildAgentFile(atCap, grantOf("stamity-reviewer"), asIs)).not.toThrow();
  });

  it("measures the cap on the prompt below the frontmatter, not the whole document", () => {
    // A body at the cap plus frontmatter puts the FILE well over it; the
    // platform counts only what it ingests as the prompt.
    const item = itemOf({
      type: "agent",
      id: "framed",
      description: "d".repeat(500),
      body: `\n${"x".repeat(COPILOT_AGENT_PROMPT_CAP)}\n`,
    });

    const output = buildAgentFile(item, grantOf("stamity-reviewer"), asIs);
    expect(output.content.length).toBeGreaterThan(COPILOT_AGENT_PROMPT_CAP);
  });

  it("keeps every shipped agent — the three new lenses included — under the cap", async () => {
    const plan = await planResidue();
    const agents = plan.filter((row) => row.path.endsWith(".agent.md"));

    expect(agents).toHaveLength(CORPUS_AGENT_IDS.length);
    for (const row of agents) {
      const prompt = row.content.replace(/^---\n[\s\S]*?\n---\n\n/, "");
      expect(prompt.length, row.path).toBeLessThanOrEqual(COPILOT_AGENT_PROMPT_CAP);
    }
  });
});

// ── Commands → 9 prompt files ────────────────────────────────────

describe("commands → .github/prompts", () => {
  it("emits exactly the nine touchpoints, flat, with no legacy prompt subtree", async () => {
    const plan = await planResidue();

    const prompts = pathsOf(plan).filter((path) => path.startsWith(".github/prompts/"));
    expect(prompts.toSorted()).toEqual(
      CORPUS_COMMAND_IDS.map((id) => `.github/prompts/st-${id}.prompt.md`).toSorted(),
    );
    // Flat by construction: a nested board/rework/shared tree is the retired shape.
    expect(prompts.some((path) => path.slice(".github/prompts/".length).includes("/"))).toBe(false);
  });

  it("ships each touchpoint as one owned row whose body is substituted, at the route the charter names", async () => {
    const plan = await planResidue({ languages: ["typescript"] });

    for (const id of CORPUS_COMMAND_IDS) {
      const row = rowAt(plan, `.github/prompts/st-${id}.prompt.md`);

      // Reachability: the picker names a prompt by its filename, so the emitted
      // stem IS the `/stamity-<id>` route the charter's touchpoint list gives.
      expect(row.path).toBe(`.github/prompts/st-${id}.prompt.md`);
      expect(row.owner).toEqual({
        adapter: "copilot",
        artifactId: `cmd-${id}`,
        artifactType: "command",
      });
      // The body is the SUBSTITUTED body: no template variable survives into a
      // file the model reads as instructions.
      expect(row.content, row.path).not.toContain("${STAMITY:");
      expect(row.content.length).toBeGreaterThan(200);
      expect(frontmatterLines(row.content).some((line) => line.startsWith("description:"))).toBe(true);
    }

    // One row each, no duplicates from a second walk.
    expect(pathsOf(plan).filter((path) => path.startsWith(".github/prompts/"))).toHaveLength(
      CORPUS_COMMAND_IDS.length,
    );
  });

  it("emits no per-prompt agent or tools key — those are restrictions the engine cannot answer", async () => {
    const plan = await planResidue();

    for (const row of plan.filter((entry) => entry.path.startsWith(".github/prompts/"))) {
      const keys = frontmatterLines(row.content).map((line) => line.split(":")[0]);
      expect(keys, row.path).toEqual(["description"]);
    }
  });

  it("carries a description and the rendered body, with the command namespacing off the filename", () => {
    const output = buildPromptFile(
      itemOf({ type: "command", id: "cmd-work", description: "Execute a change end to end." }),
      asIs,
    );

    expect(output.path).toBe(".github/prompts/st-work.prompt.md");
    expect(frontmatterLines(output.content)).toEqual(['description: "Execute a change end to end."']);
    expect(output.content.endsWith("Body text.\n")).toBe(true);
    // The ledger keeps the catalog's own id, which is what the selection record holds.
    expect(output.owner).toEqual({ adapter: "copilot", artifactId: "cmd-work", artifactType: "command" });
  });

  it("takes a model pin on a prompt that declares a class, and stays silent otherwise", () => {
    const declared = buildPromptFile(
      itemOf({ type: "command", id: "cmd-work", frontmatter: { model_class: "standard" } }),
      asIs,
      { standard: "some-vendor/worker-2" },
    );
    const undeclared = buildPromptFile(itemOf({ type: "command", id: "cmd-ask" }), asIs, {
      standard: "some-vendor/worker-2",
    });

    expect(frontmatterValue(declared.content, "model")).toBe('"some-vendor/worker-2"');
    // The shipped nine declare no class, so the pin reaches them as silence
    // rather than as a sizing decision this engine invented for a touchpoint.
    expect(frontmatterValue(undeclared.content, "model")).toBeUndefined();
  });

  it("emits no prompt rows for a zero-command selection while instructions and agents stay", async () => {
    const plan = await planResidue({
      selection: {
        items: {
          agent: ["reviewer"],
          skill: [],
          rule: ["security-patterns"],
          command: [],
        },
      },
    });

    expect(pathsOf(plan).filter((path) => path.startsWith(".github/prompts/"))).toEqual([]);
    expect(pathsOf(plan)).toContain(".github/agents/stamity-reviewer.agent.md");
    expect(pathsOf(plan)).toContain(
      ".github/instructions/stamity-security-patterns.instructions.md",
    );
    // The workflow is infrastructure, not content: it survives a narrow selection.
    expect(pathsOf(plan)).toContain(COPILOT_SETUP_STEPS_PATH);
  });
});

// ── Body substitution ────────────────────────────────────────────

describe("body substitution", () => {
  it("resolves repo, verification-gate and platform-marker tokens in emitted bodies", async () => {
    const temp = getTemp();
    await temp.seedFiles({
      "corpus/charter/stamity-charter.md": ["---", "id: charter", "---", "", "# Charter", ""].join("\n"),
      "corpus/commands/stamity-probe.md": [
        "---",
        "id: probe",
        "type: command",
        "description: probe",
        "---",
        "",
        "Run ${STAMITY:VERIFY_GATE_TEST} with ${STAMITY:LINTER}.",
        "",
        PLATFORM_TOOL_MARKER,
        "",
      ].join("\n"),
    });

    const plan = await planResidue({
      contentRoot: temp.path("corpus"),
      languages: ["typescript"],
    });
    const prompt = rowAt(plan, ".github/prompts/st-probe.prompt.md");

    expect(prompt.content).not.toContain("${STAMITY:");
    expect(prompt.content).toContain("npm run test");
    expect(prompt.content).toContain("eslint");
    // The marker resolves to THIS client's ask-user guidance, not the neutral table.
    expect(prompt.content).toContain("GitHub Copilot documents no native question tool");
    expect(prompt.content).not.toContain(PLATFORM_TOOL_MARKER);
  });

  it("resolves tokens in frontmatter descriptions too, not only in bodies", () => {
    const item = itemOf({
      type: "rule",
      id: "tokenised",
      description: "Runs under ${STAMITY:LINTER}.",
      frontmatter: { globs: ["**/*.ts"] },
    });

    // A leaked token above the fence is no less broken than one in the body.
    expect(frontmatterValue(buildInstructionsFile(item, resolveLinter).content, "description")).toBe(
      '"Runs under eslint."',
    );
    expect(
      frontmatterValue(buildPromptFile({ ...item, type: "command" }, resolveLinter).content, "description"),
    ).toBe('"Runs under eslint."');
    expect(
      frontmatterValue(
        buildAgentFile({ ...item, type: "agent" }, grantOf("stamity-reviewer"), resolveLinter).content,
        "description",
      ),
    ).toBe('"Runs under eslint."');
  });
});

// ── Model pins and the absent effort axis ────────────────────────

describe("model pinning", () => {
  it("emits the operator's pinned id for the class an agent declares", async () => {
    const plan = await planResidue({ pins: { advanced: "some-vendor/frontier-1" } });

    // `implementer` declares `advanced`; `test-runner` declares `economy`,
    // which this run leaves unpinned.
    expect(
      frontmatterValue(rowAt(plan, ".github/agents/stamity-implementer.agent.md").content, "model"),
    ).toBe('"some-vendor/frontier-1"');
    expect(
      frontmatterValue(rowAt(plan, ".github/agents/stamity-test-runner.agent.md").content, "model"),
    ).toBeUndefined();
  });

  it("emits no model key at all with no pin — this client publishes no alias to fall back to", async () => {
    const plan = await planResidue();

    const agents = plan.filter((row) => row.path.endsWith(".agent.md"));
    expect(agents.length).toBeGreaterThan(0);
    for (const row of agents) {
      expect(frontmatterLines(row.content).some((line) => line.startsWith("model:")), row.path).toBe(
        false,
      );
    }
    expect(CLIENT_MODEL_PROJECTION.copilot.aliases).toEqual({});
  });

  it("quotes a pinned value so a colon in it cannot open a second frontmatter key", () => {
    const output = buildAgentFile(
      itemOf({ type: "agent", id: "pinned", frontmatter: { model_class: "advanced" } }),
      grantOf("stamity-reviewer"),
      asIs,
      { advanced: "vendor:model 3" },
    );

    expect(frontmatterValue(output.content, "model")).toBe('"vendor:model 3"');
    const parsed = parseYaml(frontmatterLines(output.content).join("\n")) as { model: string };
    expect(parsed.model).toBe("vendor:model 3");
  });

  it("drops the key for an artifact that declares no class, and for a class off the ladder", () => {
    const pins = { advanced: "some-vendor/frontier-1" };
    const classless = buildAgentFile(
      itemOf({ type: "agent", id: "classless" }),
      grantOf("stamity-reviewer"),
      asIs,
      pins,
    );
    const bogus = buildAgentFile(
      itemOf({ type: "agent", id: "bogus", frontmatter: { model_class: "titanic" } }),
      grantOf("stamity-reviewer"),
      asIs,
      pins,
    );

    // A frontmatter typo costs that artifact its model key, never the run.
    expect(frontmatterValue(classless.content, "model")).toBeUndefined();
    expect(frontmatterValue(bogus.content, "model")).toBeUndefined();
  });

  it("never emits an effort key: this client carries the axis nowhere", async () => {
    const plan = await planResidue({ pins: { advanced: "some-vendor/frontier-1" } });

    for (const row of plan.filter((entry) => entry.path.endsWith(".agent.md"))) {
      for (const line of frontmatterLines(row.content)) {
        expect(line, row.path).not.toMatch(/^(effort|reasoning_effort|model_reasoning_effort):/);
      }
    }

    // Data-driven, not a hand-wave: the projection declares no carrier, so the
    // resolver answers nothing for every class on the ladder. If that row ever
    // grows a carrier, this fails and points at the omission cap row.
    expect(CLIENT_MODEL_PROJECTION.copilot.effortCarrier).toBeNull();
    for (const row of MODEL_LADDER) {
      expect(resolveEffortValue(row.modelClass, "copilot")).toBeUndefined();
    }
    expect(
      COPILOT_DIALECT_FACTS.caps.find((cap) => cap.name === "effort-axis")?.value,
    ).toContain("documented omission of the reasoning-effort axis");
  });
});

// ── Setup steps workflow ─────────────────────────────────────────

describe("copilot-setup-steps.yml", () => {
  it("parses as YAML and declares the job name the coding agent runs", () => {
    const yaml = buildSetupSteps(packageManagerOf({ lockfile: "package-lock.json" }), ["typescript"]);
    const parsed = parseYaml(yaml) as { jobs: Record<string, { steps: unknown[] }> };

    expect(Object.keys(parsed.jobs)).toEqual(["copilot-setup-steps"]);
    expect(parsed.jobs["copilot-setup-steps"]?.steps.length).toBeGreaterThan(1);
    expect(yaml.endsWith("\n")).toBe(true);
  });

  it("installs frozen only when a lockfile is actually present", () => {
    expect(buildSetupSteps(packageManagerOf({ lockfile: "package-lock.json" }), [])).toContain(
      "- run: npm ci",
    );
    // `npm ci` without a lockfile fails outright, so the honest command is `install`.
    expect(buildSetupSteps(packageManagerOf({}), ["javascript"])).toContain("- run: npm install");
    expect(
      buildSetupSteps(packageManagerOf({ name: "pnpm", lockfile: "pnpm-lock.yaml" }), []),
    ).toContain("- run: pnpm install --frozen-lockfile");
    expect(
      buildSetupSteps(packageManagerOf({ name: "bun", lockfile: "bun.lock" }), []),
    ).toContain("- run: bun install --frozen-lockfile");
  });

  it("enables Corepack for the managers that need provisioning, and not for the others", () => {
    expect(buildSetupSteps(packageManagerOf({ name: "yarn", lockfile: "yarn.lock" }), [])).toContain(
      "- run: corepack enable",
    );
    expect(
      buildSetupSteps(packageManagerOf({ name: "npm", lockfile: "package-lock.json" }), []),
    ).not.toContain("corepack enable");
  });

  it("checks out and stops when no Node evidence exists, naming what was detected", () => {
    const yaml = buildSetupSteps(packageManagerOf({}), ["python"]);
    const parsed = parseYaml(yaml) as { jobs: Record<string, { steps: { uses?: string }[] }> };

    expect(parsed.jobs["copilot-setup-steps"]?.steps).toHaveLength(1);
    expect(yaml).not.toContain("npm install");
    expect(yaml).toContain("detected: python");
  });

  it("takes a Corepack pin as Node evidence on its own", () => {
    const yaml = buildSetupSteps(packageManagerOf({ name: "pnpm", fromPackageJsonField: true }), []);

    expect(yaml).toContain("actions/setup-node@v5");
    expect(yaml).toContain("- run: pnpm install");
  });

  it("is byte-stable across two plans over one repository", async () => {
    const temp = getTemp();
    await temp.seedFiles({ "repo/package-lock.json": "{}\n" });
    const rootDir = temp.path("repo");

    const first = await planResidue({ rootDir });
    const second = await planResidue({ rootDir });

    expect(rowAt(second, COPILOT_SETUP_STEPS_PATH).content).toBe(
      rowAt(first, COPILOT_SETUP_STEPS_PATH).content,
    );
    expect(rowAt(first, COPILOT_SETUP_STEPS_PATH).content).toContain("- run: npm ci");
  });
});

// ── Hooks: received, deliberately not emitted ────────────────────

describe("hooks", () => {
  it("emits no hook config row although the core plans interchange rows for this client", async () => {
    const ctx = ctxOf();
    const core = await buildCoreEmissionPlan(ctx);

    expect(core.hooks.interchangeFor("copilot").length).toBeGreaterThan(0);

    const plan = (await copilotResiduePlanner.planResidue(core, ctx)).outputs;
    const hookish = pathsOf(plan).filter(
      (path) => path.includes("hooks") || path.endsWith("settings.json"),
    );
    expect(hookish).toEqual([]);
  });

  it("records the fail-open honesty in the dialect facts, sourced from CLIENT_HOOK_GUARANTEES", () => {
    const guarantee = CLIENT_HOOK_GUARANTEES.find((row) => row.tool === "copilot");
    expect(guarantee?.failMode).toBe("fail-open");
    expect(guarantee?.blockingExitCode).toBeNull();

    expect(COPILOT_DIALECT_FACTS.hooksConfigPath).toBeNull();
    const cap = COPILOT_DIALECT_FACTS.caps.find((row) => row.name === "hook-enforcement");
    expect(cap?.value).toContain("fail-open");
    expect(cap?.value).toContain("blocking exit code: none");
    // The Preview deny-gate is disclosed rather than silently emitted.
    expect(COPILOT_DIALECT_FACTS.caps.find((row) => row.name === "deny-gate")?.value).toContain(
      "Preview",
    );
  });

  it("carries an access date on every platform citation, all from one currency pass", () => {
    expect(COPILOT_DIALECT_FACTS.citations.length).toBeGreaterThan(0);
    for (const citation of COPILOT_DIALECT_FACTS.citations) {
      expect(citation.url).toMatch(/^https:\/\/(docs\.github\.com|code\.visualstudio\.com)\//);
      expect(citation.accessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    // Currency is all-or-nothing: a pass that re-read only some pages would have
    // to split the constant rather than re-stamp the rest, so one date covers
    // the list and it is no older than the last recorded pass.
    const dates = new Set(COPILOT_DIALECT_FACTS.citations.map((citation) => citation.accessDate));
    expect(dates.size).toBe(1);
    expect([...dates][0]! >= "2026-08-17").toBe(true);

    // Every surface this adapter emits for has a page behind it.
    const urls = COPILOT_DIALECT_FACTS.citations.map((citation) => citation.url).join(" ");
    expect(urls).toContain("custom-agents-configuration");
    expect(urls).toContain("prompt-files");
    expect(urls).toContain("add-repository-instructions-in-your-ide");
    expect(urls).toContain("customize-the-agent-environment");
  });

  it("declares the command surface and the effort omission as capability rows", () => {
    expect(capOf("command-surface")).toContain(".github/prompts/");
    expect(capOf("command-surface")).toContain("/st-<id>");
    expect(capOf("effort-axis")).toContain("omitted");
    expect(COPILOT_DIALECT_FACTS.agentsFormat).toContain("model:");
    expect(COPILOT_DIALECT_FACTS.ruleShape).toContain("patterns comma-separated");

    // Both rows reach the published matrix verbatim — a declaration nothing
    // renders is a claim only this file can read.
    const matrix = renderCapabilityMatrix();
    expect(matrix).toContain(capOf("command-surface"));
    expect(matrix).toContain(capOf("effort-axis"));
    expect(matrix).toContain(COPILOT_DIALECT_FACTS.agentsFormat);
  });
});

// ── Charter is native: no mirror ─────────────────────────────────

describe("no entry-file mirror", () => {
  it("emits neither .github/copilot-instructions.md nor a second AGENTS.md", async () => {
    const residue = await planResidue();
    expect(pathsOf(residue)).not.toContain(".github/copilot-instructions.md");
    expect(pathsOf(residue).some((path) => path.endsWith("AGENTS.md"))).toBe(false);

    // In the composed plan the charter exists exactly once — the core's row.
    const composed = await planComposed();
    expect(pathsOf(composed).filter((path) => path.endsWith("AGENTS.md"))).toEqual(["AGENTS.md"]);
    expect(COPILOT_DIALECT_FACTS.entryFile).toBeNull();
  });

  it("emits no native skills copy and no plugin container — the neutral tree is the one reader", async () => {
    const residue = await planResidue();
    expect(residue.some((row) => row.path.includes("skills"))).toBe(false);
    expect(residue.some((row) => row.path.includes("plugin"))).toBe(false);

    // The composed plan carries skills exactly once, in the vendor-neutral tree
    // this client reads directly; a second copy would be duplicated context.
    const composed = await planComposed();
    const skills = pathsOf(composed).filter((path) => path.includes("skills"));
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.every((path) => path.startsWith(".agents/skills/"))).toBe(true);
    expect(COPILOT_DIALECT_FACTS.readsAgentsSkillsDir).toBe(true);

    // A maintainer ruling retired the container wording with the container itself.
    const source = await readFile(
      fileURLToPath(new URL("../../src/adapters/copilot.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/Agent Plugins/i);
  });

  it("plans no per-package rows for a monorepo — copilot reads no nested files", async () => {
    const packages: PackageEntry[] = [
      { name: "a", path: "packages/a" },
      { name: "b", path: "packages/b" },
    ];

    const residue = await planResidue({ packages });
    expect(residue.some((row) => row.path.includes("packages/"))).toBe(false);

    const composed = await planComposed({ packages });
    expect(composed.some((row) => row.path.startsWith("packages/"))).toBe(false);
  });
});

// ── MCP placement ────────────────────────────────────────────────

describe("MCP documents", () => {
  it("places both core-planned dialects verbatim, unchanged by the adapter", async () => {
    const ctx = ctxOf({ mcp: { servers: ["context7"] } });
    const core = await buildCoreEmissionPlan(ctx);
    const plan = (await copilotResiduePlanner.planResidue(core, ctx)).outputs;

    for (const emission of core.mcpFor("copilot")) {
      const row = rowAt(plan, emission.path);
      expect(row.content).toBe(emission.content);
      expect(row.owner).toEqual({
        adapter: "copilot",
        artifactId: `mcp-${emission.dialect}`,
        artifactType: "infra",
      });
    }
    expect(core.mcpFor("copilot")).toHaveLength(2);
  });

  it("places a credentialed server's document with secret NAMES only, never a value", async () => {
    // brave-search needs an API key, so this is the row that would leak one.
    const ctx = ctxOf({ mcp: { servers: ["brave-search"] } });
    const core = await buildCoreEmissionPlan(ctx);
    const plan = (await copilotResiduePlanner.planResidue(core, ctx)).outputs;

    const env = plan.find((row) => row.path.endsWith(".env"));
    expect(env, "expected the copilot repo-settings document").toBeDefined();
    expect(env!.content).toContain("COPILOT_MCP_");

    // Every value inside an `env` map is a reference to an Actions secret; a
    // literal there would be a token sitting in a file that is not gitignored.
    const values = [...env!.content.matchAll(/"env":\{([^}]*)\}/g)].flatMap((map) =>
      [...(map[1] ?? "").matchAll(/"[A-Z0-9_]+":"([^"]*)"/g)].map((entry) => entry[1] ?? ""),
    );
    // Non-vacuous: this server declares a credential, so there IS a value here
    // to be a reference rather than a token.
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(value).toMatch(/^\$COPILOT_MCP_/);
  });

  it("emits no MCP row when the manifest selects no servers", async () => {
    const plan = await planResidue();

    expect(pathsOf(plan).some((path) => path.endsWith("mcp.json"))).toBe(false);
    expect(pathsOf(plan).some((path) => path.endsWith(".env"))).toBe(false);
  });
});

// ── Ownership, determinism, purity ───────────────────────────────

describe("ownership and determinism", () => {
  it("owns every residue row as copilot, with an artifact type per class", async () => {
    const plan = await planResidue({ mcp: { servers: ["context7"] } });

    expect(plan.length).toBeGreaterThan(0);
    for (const row of plan) {
      expect(row.owner.adapter, row.path).toBe("copilot");
      expect(row.coOwners, row.path).toBeUndefined();
      expect(row.replacesSharedPath, row.path).toBeUndefined();
      expect(row.path.startsWith("/"), row.path).toBe(false);
      expect(row.path.includes("\\"), row.path).toBe(false);
    }

    expect(rowAt(plan, COPILOT_SETUP_STEPS_PATH).owner).toEqual({
      adapter: "copilot",
      artifactId: "copilot-setup-steps",
      artifactType: "infra",
    });
    expect(rowAt(plan, ".github/instructions/stamity-secrets.instructions.md").owner).toEqual({
      adapter: "copilot",
      artifactId: "secrets",
      artifactType: "rule",
    });
  });

  it("produces byte-identical plans across two runs over the same inputs", async () => {
    const rootDir = getTemp().path("repo");
    const options: CtxOptions = { rootDir, mcp: { servers: ["context7"] } };

    const first = await planComposed(options);
    const second = await planComposed(options);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(pathsOf(first)).toEqual(pathsOf(first).toSorted());
  });

  it("emits nothing for copilot when the tool is not selected", async () => {
    const plan = await planComposed({ tools: ["claude"] });

    expect(plan.some((row) => row.path.startsWith(".github/"))).toBe(false);
    for (const row of plan) expect(row.owner.adapter, row.path).toBe("claude");
  });

  it("plans without touching the filesystem: the repo root is never created", async () => {
    const temp = getTemp();
    const ghost = temp.path("ghost-repo");
    const before = await tree(temp.dir);

    const plan = await planResidue({ rootDir: ghost });

    expect(plan.length).toBeGreaterThan(0);
    expect(existsSync(ghost)).toBe(false);
    expect(await tree(temp.dir)).toEqual(before);
    // A repository that is not there yields no evidence at all: the workflow
    // says so instead of inventing an install command for it.
    expect(rowAt(plan, COPILOT_SETUP_STEPS_PATH).content).toContain(
      "No Node toolchain was detected",
    );
  });

  it("drops every deselectable row for an empty selection, keeping infrastructure and the floor", async () => {
    const plan = await planResidue({ selection: EMPTY_SELECTION });
    const paths = pathsOf(plan);

    expect(paths).toContain(COPILOT_SETUP_STEPS_PATH);
    // The `floor:*` artifacts resist deselection by design — an empty selection
    // is the hand-edited-manifest case they exist for. `stamity-security` joined
    // the agent list when it took `floor:security`: the three rules it reads
    // were floored and it was not, so a trimmed setup could ship the security
    // guidance with nothing that applies it.
    expect(paths.filter((path) => path.startsWith(".github/agents/"))).toEqual([
      ".github/agents/stamity-fixer.agent.md",
      ".github/agents/stamity-implementer.agent.md",
      ".github/agents/stamity-researcher.agent.md",
      ".github/agents/stamity-reviewer.agent.md",
      ".github/agents/stamity-security.agent.md",
      ".github/agents/stamity-test-runner.agent.md",
    ]);
    expect(paths.filter((path) => path.startsWith(".github/instructions/"))).toEqual([
      ".github/instructions/stamity-injection-screening.instructions.md",
      ".github/instructions/stamity-secrets.instructions.md",
      ".github/instructions/stamity-security-patterns.instructions.md",
    ]);
  });
});
