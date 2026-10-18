import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import {
  COPILOT_AGENT_PROMPT_CAP,
  COPILOT_DIALECT_FACTS,
  COPILOT_EVENT_NAMES,
  COPILOT_HOOKS_PATH,
  COPILOT_RUN_AGENT_PATH,
  COPILOT_SETUP_STEPS_PATH,
  buildAgentFile,
  buildCopilotHooksJson,
  buildInstructionsFile,
  buildPromptFile,
  buildRunAgentFile,
  buildSetupSteps,
  copilotResiduePlanner,
  engineRangeFloor,
  NO_SETUP_STEPS_PINS,
  readSetupStepsPins,
  runAgentRows,
  copilotMatcherWarnings,
  translateCopilotMatcher,
} from "../../src/adapters/copilot.ts";
import { __resetContentRootCacheForTests } from "../../src/content/contentRoot.ts";
import type { CatalogItem } from "../../src/content/catalog.ts";
import { renderCapabilityMatrix } from "../../src/emit/capabilityMatrix.ts";
import type { PackageManagerInfo } from "../../src/detect/packageManager.ts";
import { buildCoreEmissionPlan, composeEmissionPlanner, type EmissionContext } from "../../src/emit/planner.ts";
import { CLIENT_HOOK_GUARANTEES } from "../../src/hooks/model.ts";
import { sanitizeLabel } from "../../src/cli/kit/prompts.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import { ownedPathKind } from "../../src/manifest/ownedPaths.ts";
import { ledgerHashIndex, ledgerPathSet, safeWriteFile } from "../../src/merge/safeWrite.ts";
import { resolveAgentGrant, type ResolvedAgentGrant } from "../../src/roster/agentGrants.ts";
import type { GrantableToolCategory } from "../../src/roster/agentPolicies.ts";
import { AGENT_POLICY_ROSTER } from "../../src/roster/agentPolicies.ts";
import {
  CLIENT_MODEL_PROJECTION,
  effortDisclosures,
  type EffortMap,
} from "../../src/roster/modelLadder.ts";
import {
  ADAPTER_ALLOWLIST_COVERAGE,
  PLATFORM_TOOL_MARKER,
  toCopilotToolsFrontmatter,
} from "../../src/tools/translator.ts";
import type { AdapterOutput, ContentSelection } from "../../src/types/content.ts";
import type { ModelConfig, RuleDelivery } from "../../src/types/manifest.ts";
import type { Tool } from "../../src/types/core.ts";
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

/**
 * The effort each shipped agent's declared class asks for, as literals: `advanced` runs `high`,
 * `standard` `medium`, `economy` `low`. Restated here, not read through the resolver the adapter
 * calls, so the emission is held to the ladder as designed and not to itself.
 */
const CORPUS_AGENT_EFFORT: Readonly<Record<(typeof CORPUS_AGENT_IDS)[number], string>> = {
  creator: "medium",
  "design-quality": "high",
  fixer: "medium",
  implementer: "high",
  performance: "medium",
  researcher: "medium",
  reviewer: "high",
  security: "high",
  "spec-author": "high",
  "test-runner": "low",
};

/**
 * The model lines a shipped agent carries with no pin and no saved list, keyed by the effort its
 * class asks for (one class per level): the shipped priority list's entry 0 as `model`, its
 * display name in the qualified `<name> (copilot)` form, and the class's CLI ids in priority order
 * as `models` (REQ-LADDER-007). Literals, like the effort table above.
 */
const SHIPPED_PICK_LINES: Readonly<Record<string, readonly string[]>> = {
  high: ['model: "Claude Opus 5.5 (copilot)"', 'models: ["claude-opus-5.5", "gpt-6-astra", "claude-opus-5"]'],
  medium: ['model: "Claude Sonnet 5 (copilot)"', 'models: ["claude-sonnet-5", "gpt-6-sol", "gpt-5.6-terra"]'],
  low: ['model: "Claude Haiku 4.5 (copilot)"', 'models: ["claude-haiku-4.5", "gpt-6-luna", "gpt-5.4-mini"]'],
};

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
  ruleDelivery?: RuleDelivery;
  contentRoot?: string;
  rootDir?: string;
  selection?: ContentSelection;
  packages?: PackageEntry[];
  mcp?: { servers: string[] };
  languages?: string[];
  // TEST CHANGE, justified (e1-pins-contract, REQ-LADDER-005): the manifest's pin shape, a
  // per-client map per class at 2.0.0, where it was one string per class; every caller below
  // passes the `all` key a 1.0.0 string migrates to, so each case resolves the id it did.
  pins?: ModelConfig["pins"];
  efforts?: EffortMap;
  /** The ids a Copilot CLI listed for the account, persisted as `models.listed.copilot`. */
  listed?: readonly string[];
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
      ...(over.pins === undefined && over.efforts === undefined && over.listed === undefined
        ? {}
        : {
            models: {
              ...(over.pins === undefined ? {} : { pins: over.pins }),
              ...(over.efforts === undefined ? {} : { effort: over.efforts }),
              ...(over.listed === undefined
                ? {}
                : { listed: { copilot: { ids: [...over.listed], source: "copilot-help-config" as const } } }),
            },
          }),
      ...(over.ruleDelivery === undefined ? {} : { ruleDelivery: over.ruleDelivery }),
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
    // MODE PINNED 2026-09-15, explicitly `always-on`. The claim is the instruction
    // dialect over EVERY shipped rule — the glob-less ones included, which is the
    // `applyTo: "**"` branch below. The engine default is now `on-demand`, which
    // delivers those two as skills, so under the default this case would stop
    // covering that branch while still passing. The default's own file set has
    // its own case at the foot of this file.
    const plan = await planResidue({ ruleDelivery: "always-on" });
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
    // Fixture data kept out of the test-input census: the glob is built at run time, as a literal it names every learning.
    const glob = [".stamity/learnings", "**"].join("/");
    const output = buildInstructionsFile(
      itemOf({ type: "rule", id: "learnings-schema", frontmatter: { globs: [glob] } }),
      asIs,
    );

    expect(frontmatterValue(output.content, "applyTo")).toBe(`"${glob}"`);
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
    // MODE PINNED 2026-09-15, same reason as the round-trip case above: one file
    // per rule is the `always-on` shape, and `CORPUS_RULE_COUNT` is the count of
    // rules in the corpus rather than the count this client receives as rules
    // under the shipped default.
    const plan = await planResidue({ ruleDelivery: "always-on" });

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

      // TEST CHANGE, justified (2026-10-10, q6b-copilot-instructions-key): the exact list gains
      // `include-custom-instructions: true` between `target` and `tools`. The contract moved
      // because a live sub-agent check on Copilot CLI 1.0.89 found that an agent dispatched
      // through `task` without the key loads no `AGENTS.md` (REQ-FLOW-071); every other line is
      // unchanged.
      // TEST CHANGE, justified (2026-10-10, q6c-copilot-effort-key): the exact list gains
      // `reasoning-effort: <level>` as its last line, at the default of the class the agent
      // declares. The contract moved because the Copilot CLI's custom-agent loader reads that key
      // (changelog 1.0.66 and 1.0.88; the 1.0.89 loader) and the engine now writes it
      // (REQ-LADDER-004); every other line is unchanged.
      // TEST CHANGE, justified (2026-10-14, e8-copilot-codex-claude-pins): the exact list gains
      // the class's `model` and `models` lines between `tools` and `reasoning-effort`. The
      // contract moved because an unpinned class no longer resolves to nothing on this client:
      // it takes the shipped priority list's entry 0 when no account list was saved
      // (REQ-LADDER-006, REQ-LADDER-007); every other line is unchanged.
      expect(frontmatterLines(row.content)).toEqual([
        `name: stamity-${id}`,
        `description: ${frontmatterValue(row.content, "description")}`,
        "target: github-copilot",
        "include-custom-instructions: true",
        `tools: ${toCopilotToolsFrontmatter(rosterAllow(`stamity-${id}`))}`,
        ...(SHIPPED_PICK_LINES[CORPUS_AGENT_EFFORT[id]] ?? []),
        `reasoning-effort: ${CORPUS_AGENT_EFFORT[id]}`,
      ]);
      expect(frontmatterValue(row.content, "tools")).not.toBe("[]");
      expect(row.owner).toEqual({ adapter: "copilot", artifactId: id, artifactType: "agent" });
    }

    // TEST CHANGE, justified (2026-10-18, v9-copilot-entry, REQ-FLOW-118): the count gains one,
    // the cloud agent's entry `stamity-run.agent.md`, emitted beside the work prompt and with no
    // corpus file or roster row; its own frontmatter is pinned in "Copilot's entry agent" below.
    // Every corpus agent above is still held to its roster grant, one file each.
    expect(pathsOf(plan).filter((path) => path.endsWith(".agent.md"))).toHaveLength(
      CORPUS_AGENT_IDS.length + 1,
    );
  });

  it("opts every agent into the repository instructions, and no prompt file (REQ-FLOW-071)", async () => {
    const plan = await planResidue({ pins: { advanced: { all: "some-vendor/frontier-1" } } });

    const agents = plan.filter((row) => row.path.endsWith(".agent.md"));
    // TEST CHANGE, justified (2026-10-18, v9-copilot-entry, REQ-FLOW-118): the count gains the
    // cloud agent's entry `stamity-run.agent.md`, which the loop below holds to the same opt-in
    // and key order as the ten corpus agents.
    expect(agents).toHaveLength(CORPUS_AGENT_IDS.length + 1);
    for (const row of agents) {
      const keys = frontmatterLines(row.content).map((line) => line.split(":")[0]);
      expect(frontmatterValue(row.content, "include-custom-instructions"), row.path).toBe("true");
      // After `target`, before `tools`, and still ahead of a pinned model line.
      expect(keys.indexOf("include-custom-instructions"), row.path).toBe(keys.indexOf("target") + 1);
      expect(keys.indexOf("tools"), row.path).toBe(keys.indexOf("include-custom-instructions") + 1);
    }
    // Non-degenerate: the pin reaches at least one agent, so the order check above
    // ran against a frontmatter that carries a model line too.
    // TEST CHANGE, justified (2026-10-10, q6c-copilot-effort-key): the pinned model line was the
    // last frontmatter line; `reasoning-effort` now follows it, so the model line is found one
    // from the end. What the pin shows, a model line below `tools`, is unchanged.
    // TEST CHANGE, justified (2026-10-14, e8-copilot-codex-claude-pins): the pin rides as the
    // first id of `models`, the CLI's priority list, followed by the class's shipped candidates;
    // a pin with no display name in the shipped list writes no `model:` line, which takes a
    // display name (REQ-LADDER-007). What the pin shows, a model line below `tools`, is unchanged.
    expect(
      frontmatterLines(rowAt(plan, ".github/agents/stamity-implementer.agent.md").content).at(-2),
    ).toBe('models: ["some-vendor/frontier-1", "claude-opus-5.5", "gpt-6-astra", "claude-opus-5"]');

    // A prompt file runs in the session that already carries the instructions: no key.
    const prompts = plan.filter((row) => row.path.startsWith(".github/prompts/"));
    expect(prompts.length).toBeGreaterThan(0);
    for (const row of prompts) {
      expect(row.content, row.path).not.toContain("include-custom-instructions");
    }

    // The declared agent format names the key the files carry.
    expect(COPILOT_DIALECT_FACTS.agentsFormat).toContain("`include-custom-instructions: true`");
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

  it("keeps the four verdict roles read-only although their roster rows name report write paths", async () => {
    // Non-degenerate: every verdict row really carries `writePaths` (C8), the
    // key the Claude adapter turns into a path-scoped `Write`. Copilot's alias
    // list cannot scope a write to the reports folder, so the key moves nothing
    // here and the roles return their full report inline.
    const verdictIds = ["reviewer", "security", "performance", "design-quality"] as const;
    for (const id of verdictIds) {
      const grant = resolveAgentGrant({ runtimeId: `stamity-${id}`, frontmatter: {} });
      expect(grant.writePaths?.length ?? 0, id).toBeGreaterThan(0);
    }

    const plan = await planResidue();
    for (const id of verdictIds) {
      const row = rowAt(plan, `.github/agents/stamity-${id}.agent.md`);
      expect(frontmatterValue(row.content, "tools"), id).toBe('["read", "search"]');
    }
    expect(ADAPTER_ALLOWLIST_COVERAGE.find((row) => row.tool === "copilot")?.mechanism).toContain(
      "return their full report inline",
    );
  });

  it("gives no verdict role execute although their roster rows carry readOnlyGit", async () => {
    // Non-degenerate: every verdict row really carries `readOnlyGit`, the key
    // the Claude adapter turns into a command-checked `Bash`. Copilot's alias
    // list has no per-command granularity, so the key moves nothing here and
    // the brief must carry the diff.
    const verdictIds = ["reviewer", "security", "performance", "design-quality"] as const;
    for (const id of verdictIds) {
      const grant = resolveAgentGrant({ runtimeId: `stamity-${id}`, frontmatter: {} });
      expect(grant.readOnlyGit, id).toBe(true);
    }

    const plan = await planResidue();
    for (const id of verdictIds) {
      const row = rowAt(plan, `.github/agents/stamity-${id}.agent.md`);
      expect(frontmatterValue(row.content, "tools"), id).not.toContain('"execute"');
    }
    expect(ADAPTER_ALLOWLIST_COVERAGE.find((row) => row.tool === "copilot")?.mechanism).toContain(
      "the brief must carry the diff",
    );
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

    // TEST CHANGE, justified (2026-10-18, v9-copilot-entry, REQ-FLOW-118): the count gains the
    // cloud agent's entry, which the loop below holds to the same cap as the corpus agents.
    expect(agents).toHaveLength(CORPUS_AGENT_IDS.length + 1);
    for (const row of agents) {
      const prompt = row.content.replace(/^---\n[\s\S]*?\n---\n\n/, "");
      expect(prompt.length, row.path).toBeLessThanOrEqual(COPILOT_AGENT_PROMPT_CAP);
    }
  });
});

// ── The cloud agent's entry ──────────────────────────────────────

describe("Copilot's entry agent (REQ-FLOW-117, REQ-FLOW-118)", () => {
  const WORK_PROMPT = ".github/prompts/st-work.prompt.md";

  /** The markdown below the frontmatter: what the platform measures against its cap. */
  const promptOf = (content: string): string => content.replace(/^---\n[\s\S]*?\n---\n\n/, "");

  it("is emitted with Copilot selected, beside the work prompt it names, owned as an agent row the bound admits", async () => {
    const plan = await planResidue();
    const row = rowAt(plan, COPILOT_RUN_AGENT_PATH);

    expect(COPILOT_RUN_AGENT_PATH).toBe(".github/agents/stamity-run.agent.md");
    expect(pathsOf(plan)).toContain(WORK_PROMPT);
    // Every tool (`["*"]`: the entry runs the whole flow, MCP servers included) and no model
    // line (the cloud agent picks its model when the task starts), nor any roster grant.
    expect(frontmatterLines(row.content)).toEqual([
      "name: stamity-run",
      `description: ${frontmatterValue(row.content, "description")}`,
      "target: github-copilot",
      "include-custom-instructions: true",
      'tools: ["*"]',
    ]);
    expect(frontmatterValue(row.content, "description")).toMatch(/^".+"$/);
    expect(row.owner).toEqual({ adapter: "copilot", artifactId: "run", artifactType: "agent" });
    // The manifest refuses a row outside the owned-path bound; an `infra` row here would be one.
    expect(ownedPathKind({ path: row.path, adapter: row.owner.adapter, artifactType: row.owner.artifactType })).toBe(
      "content",
    );
  });

  it("names the prompt file and the plan, points an unattended run at its skill, and never inlines the prompt", async () => {
    const plan = await planResidue();
    const prompt = promptOf(rowAt(plan, COPILOT_RUN_AGENT_PATH).content);
    const work = promptOf(rowAt(plan, WORK_PROMPT).content);

    expect(prompt).toContain(`\`${WORK_PROMPT}\``);
    expect(prompt).toContain("the plan file the issue names");
    expect(prompt).toContain("`Mode: unattended`");
    expect(prompt).toContain("`st-unattended` skill");
    // Non-degenerate: the work prompt is far over the entry's budget, so a copy of it, or of
    // its first phase, would show in both the size and the text.
    expect(work.length).toBeGreaterThan(COPILOT_AGENT_PROMPT_CAP);
    expect(work).toContain("## Phase 0 — Frame");
    expect(prompt).not.toContain("## Phase 0 — Frame");
    expect(prompt.length).toBeLessThan(2_000);
    expect(prompt.length * 10).toBeLessThan(COPILOT_AGENT_PROMPT_CAP);
  });

  it("states the chain of sessions and the roles run in line where no sub-agent tool exists", () => {
    const prompt = promptOf(buildRunAgentFile().content);

    expect(prompt).toContain("59 minutes");
    expect(prompt).toContain("before about minute 45");
    expect(prompt).toContain("`stamity run checkpoint`");
    expect(prompt).toContain("`@copilot continue`");
    expect(prompt).toContain("resumes from the committed record");
    expect(prompt).toContain("run the flow's roles in line, one at a time in their order");
    expect(prompt).toContain("the proof block says so");
    // Built once, byte-stable: a second sync writes the same file.
    expect(buildRunAgentFile().content).toBe(buildRunAgentFile().content);
  });

  it("is not emitted without the work prompt it names, and is with it", async () => {
    const without = await planResidue({
      selection: { items: { agent: [], skill: [], rule: [], command: ["cmd-ask"] } },
    });
    const withWork = await planResidue({
      selection: { items: { agent: [], skill: [], rule: [], command: ["cmd-work"] } },
    });

    expect(pathsOf(without)).toContain(".github/prompts/st-ask.prompt.md");
    expect(pathsOf(without)).not.toContain(WORK_PROMPT);
    expect(pathsOf(without)).not.toContain(COPILOT_RUN_AGENT_PATH);
    expect(pathsOf(withWork)).toContain(WORK_PROMPT);
    expect(pathsOf(withWork)).toContain(COPILOT_RUN_AGENT_PATH);
  });

  it("is not emitted when Copilot is not selected", async () => {
    const claudeOnly = await planComposed({ tools: ["claude"] });
    const withCopilot = await planComposed({ tools: ["claude", "copilot"] });

    expect(pathsOf(claudeOnly).length).toBeGreaterThan(0);
    expect(pathsOf(claudeOnly)).not.toContain(COPILOT_RUN_AGENT_PATH);
    expect(pathsOf(withCopilot)).toContain(COPILOT_RUN_AGENT_PATH);
  });

  it("refuses an agent whose emitted name collides with the entry, naming the path", () => {
    const work: AdapterOutput = {
      path: WORK_PROMPT,
      content: "---\ndescription: \"w\"\n---\n\nbody\n",
      owner: { adapter: "copilot", artifactId: "cmd-work", artifactType: "command" },
    };
    const clash: AdapterOutput = {
      path: COPILOT_RUN_AGENT_PATH,
      content: "---\nname: stamity-run\n---\n\npack agent\n",
      owner: { adapter: "copilot", artifactId: "run", artifactType: "agent" },
    };

    expect(runAgentRows([work])).toHaveLength(1);
    expect(runAgentRows([])).toEqual([]);
    let thrown: unknown;
    try {
      runAgentRows([work, clash]);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(EngineError);
    expect((thrown as EngineError).code).toBe("VALIDATION_ERROR");
    expect((thrown as EngineError).message).toContain(COPILOT_RUN_AGENT_PATH);
  });

  it("adds no roster row: the shipped agent policies stay the ten corpus agents", () => {
    const ids = AGENT_POLICY_ROSTER.map((row) => row.agentId);

    expect(ids).toHaveLength(CORPUS_AGENT_IDS.length);
    expect(ids).not.toContain("stamity-run");
    expect(ids.toSorted()).toEqual(CORPUS_AGENT_IDS.map((id) => `stamity-${id}`).toSorted());
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

  it("writes no model line for a pin typed as a display name, as the agent files and the map do not (review/138)", () => {
    const item = itemOf({ type: "command", id: "cmd-work", frontmatter: { model_class: "standard" } });
    const display = buildPromptFile(item, asIs, { standard: "Claude Sonnet 5 (copilot)" });

    // Sync warns that such a pin is written nowhere; the prompt file keeps that true.
    expect(frontmatterValue(display.content, "model")).toBeUndefined();
    expect(display.content).not.toContain("(copilot)");
    // Non-degenerate: an id pin on the same class and prompt still binds.
    const id = buildPromptFile(item, asIs, { standard: "claude-sonnet-5" });
    expect(frontmatterValue(id.content, "model")).toBe('"claude-sonnet-5"');
  });

  it("re-picks a pin the saved list lacks as the agent files do, and still writes no line without a pin (review/140)", () => {
    const item = itemOf({ type: "command", id: "cmd-work", frontmatter: { model_class: "standard" } });
    const pins = { standard: "gpt-5.5" };

    // The account lacks the pin, so the class's pick from its list, as an agent file would carry.
    const repicked = buildPromptFile(item, asIs, pins, ["unrelated-1", "gpt-6-sol"]);
    expect(frontmatterValue(repicked.content, "model")).toBe('"gpt-6-sol"');
    expect(repicked.content).not.toContain("gpt-5.5");
    // A list holding none of the class's candidates keeps the operator's value.
    expect(frontmatterValue(buildPromptFile(item, asIs, pins, ["unrelated-1"]).content, "model")).toBe('"gpt-5.5"');
    // A pin the list holds binds as typed; with no saved list the pin is written as before.
    expect(frontmatterValue(buildPromptFile(item, asIs, pins, ["gpt-5.5"]).content, "model")).toBe('"gpt-5.5"');
    expect(frontmatterValue(buildPromptFile(item, asIs, pins).content, "model")).toBe('"gpt-5.5"');
    // No pin, no line, whatever the list holds: a prompt takes a model only under a pin.
    expect(frontmatterValue(buildPromptFile(item, asIs, {}, ["gpt-6-sol"]).content, "model")).toBeUndefined();
  });

  it("writes the same model into a prompt file as into the agent file and the map for a pinned class (review/140)", async () => {
    const ctx = ctxOf({ pins: { advanced: { copilot: "gpt-5.5" } }, listed: ["claude-opus-5", "claude-haiku-4.5"] });
    const prompt = buildPromptFile(
      itemOf({ type: "command", id: "cmd-work", frontmatter: { model_class: "advanced" } }),
      asIs,
      { advanced: "gpt-5.5" },
      ["claude-opus-5", "claude-haiku-4.5"],
    );
    const residue = await copilotResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx);
    const map = JSON.parse(rowAt(residue.outputs, ".stamity/generated/models/copilot.json").content) as {
      classes: Record<string, { model?: string }>;
    };

    expect(map.classes["advanced"]?.model).toBe("claude-opus-5");
    expect(rowAt(residue.outputs, ".github/agents/stamity-implementer.agent.md").content).toContain(
      'models: ["claude-opus-5"',
    );
    expect(frontmatterValue(prompt.content, "model")).toBe('"claude-opus-5"');
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
    // TEST CHANGE, justified (2026-10-15, unit e12-translator; REQ-FLOW-080): the pin read
    // "GitHub Copilot documents no native question tool"; Copilot ships `askQuestions` (VS Code)
    // and `ask_user` (Copilot CLI) now, and the rendered note names both.
    expect(prompt.content).toContain("ask through the `askQuestions` tool");
    expect(prompt.content).toContain("Copilot CLI use `ask_user`");
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
  /** The `models` list of an emitted file's frontmatter, parsed as YAML; `undefined` with no key. */
  const modelsOf = (content: string): unknown =>
    (parseYaml(frontmatterLines(content).join("\n")) as { models?: unknown }).models;
  const agentAt = (plan: readonly AdapterOutput[], id: string): string =>
    rowAt(plan, `.github/agents/stamity-${id}.agent.md`).content;

  // TEST CHANGE, justified (2026-10-14, e8-copilot-codex-claude-pins): the assertions read the
  // `model:` line; a pin now rides as the first id of `models`, and these pins have no shipped
  // display name, so no `model:` line is written (REQ-LADDER-007). Which pin binds is unchanged.
  it("takes the class's copilot pin over its every-client pin, and ignores another client's (REQ-LADDER-005)", async () => {
    const plan = await planResidue({
      pins: {
        advanced: { copilot: "copilot-only-x", all: "every-client-y" },
        economy: { cursor: "cursor-only-x", all: "every-client-z" },
      },
    });

    expect((modelsOf(agentAt(plan, "implementer")) as string[])[0]).toBe("copilot-only-x");
    expect(agentAt(plan, "implementer")).not.toContain("every-client-y");
    expect((modelsOf(agentAt(plan, "test-runner")) as string[])[0]).toBe("every-client-z");
    expect(agentAt(plan, "test-runner")).not.toContain("cursor-only-x");
  });

  // TEST CHANGE, justified (2026-10-14, e8-copilot-codex-claude-pins): the unpinned class used
  // to emit no model at all; it now takes the shipped pick (REQ-LADDER-006), and the pin rides in
  // `models` with the class's shipped candidates behind it, for a plan that cannot access it.
  it("emits the operator's pinned id first, with the class's shipped candidates behind it", async () => {
    const plan = await planResidue({ pins: { advanced: { all: "some-vendor/frontier-1" } } });

    // `implementer` declares `advanced`; `test-runner` declares `economy`, which this run leaves
    // unpinned.
    expect(modelsOf(agentAt(plan, "implementer"))).toEqual([
      "some-vendor/frontier-1",
      "claude-opus-5.5",
      "gpt-6-astra",
      "claude-opus-5",
    ]);
    // No shipped display name for the pin, so no `model:` line (the plan's edge case).
    expect(frontmatterValue(agentAt(plan, "implementer"), "model")).toBeUndefined();
    expect(frontmatterValue(agentAt(plan, "test-runner"), "model")).toBe('"Claude Haiku 4.5 (copilot)"');
  });

  // TEST CHANGE, justified (2026-10-14, e8-copilot-codex-claude-pins): the case read "emits no
  // model key at all with no pin — this client publishes no alias to fall back to". The "never
  // invent a value" rule is superseded (REQ-LADDER-006): with no pin and no saved list, Copilot
  // takes the shipped priority list's entry 0, so every agent now carries `model` and `models`.
  it("carries the shipped pick with no pin and no saved list, and never `modelPolicy` (REQ-LADDER-007)", async () => {
    const plan = await planResidue();

    for (const id of CORPUS_AGENT_IDS) {
      const lines = frontmatterLines(agentAt(plan, id));
      const expected = SHIPPED_PICK_LINES[CORPUS_AGENT_EFFORT[id]] ?? [];
      expect(expected, id).toHaveLength(2);
      expect(lines.filter((line) => /^models?:/.test(line)), id).toEqual(expected);
      expect(lines.some((line) => line.startsWith("modelPolicy")), id).toBe(false);
    }
    // Still no alias: the value comes from the pick, not from a vocabulary this client lacks.
    expect(CLIENT_MODEL_PROJECTION.copilot.aliases).toEqual({});
  });

  it("picks each class's first shipped candidate the account's saved list holds", async () => {
    const plan = await planResidue({ listed: ["unrelated-1", "gpt-6-luna", "claude-opus-5", "gpt-6-astra"] });

    // `advanced`: its entry 0 (`claude-opus-5.5`) is not listed, so the next candidate wins and the
    // list keeps only what the account offers.
    expect(frontmatterValue(agentAt(plan, "implementer"), "model")).toBe('"GPT-6 Astra (copilot)"');
    expect(modelsOf(agentAt(plan, "implementer"))).toEqual(["gpt-6-astra", "claude-opus-5"]);
    expect(frontmatterValue(agentAt(plan, "test-runner"), "model")).toBe('"GPT-6 Luna (copilot)"');
    expect(modelsOf(agentAt(plan, "test-runner"))).toEqual(["gpt-6-luna"]);
    // TEST CHANGE, justified (fix round 1, ledger row 2026-10-14_cli-native/build/66): the case
    // asserted the resolver's old fallback, the shipped entry 0 (`claude-sonnet-5`) written although
    // the account does not list it. By the sign-off a saved list that holds none of a class's
    // candidates writes no model key, so the session's model applies.
    // `standard` has no candidate on this list.
    expect(frontmatterValue(agentAt(plan, "fixer"), "model")).toBeUndefined();
    expect(modelsOf(agentAt(plan, "fixer"))).toBeUndefined();
    expect(agentAt(plan, "fixer")).not.toContain("claude-sonnet-5");
  });

  it("names a pinned model by its display name when the shipped list gives one, and re-picks a pin the list lacks", async () => {
    const known = await planResidue({ pins: { advanced: { copilot: "gpt-6-astra" } } });
    expect(frontmatterValue(agentAt(known, "implementer"), "model")).toBe('"GPT-6 Astra (copilot)"');
    expect(modelsOf(agentAt(known, "implementer"))).toEqual(["gpt-6-astra", "claude-opus-5.5", "claude-opus-5"]);

    // An id the account lacks fails the call, so the class takes the pick from the saved list.
    const repicked = await planResidue({
      pins: { advanced: { copilot: "gpt-5.5" } },
      listed: ["claude-opus-5", "claude-haiku-4.5"],
    });
    expect(frontmatterValue(agentAt(repicked, "implementer"), "model")).toBe('"Claude Opus 5 (copilot)"');
    expect(modelsOf(agentAt(repicked, "implementer"))).toEqual(["claude-opus-5"]);
    expect(agentAt(repicked, "implementer")).not.toContain("gpt-5.5");
  });

  it("flattens control characters a display-form pin carries before the warning prints it (review/114)", async () => {
    const raw = "Bad\u001b[2J\u0007 Name (copilot)";
    const ctx = ctxOf({ pins: { standard: { copilot: raw } } });
    const residue = await copilotResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx);

    const warnings = (residue.warnings ?? []).filter((line) => line.startsWith("model pin [copilot]: standard"));
    expect(warnings).toHaveLength(1);
    // The same form `check`'s model-pins row prints (`sanitizeLabel`): ESC and BEL dropped.
    expect(warnings[0]).toContain(`"${sanitizeLabel(raw)}"`);
    expect(warnings[0]).toContain('"Bad[2J Name (copilot)"');
    expect(warnings[0]).not.toContain("\u001b");
    expect(warnings[0]).not.toContain("\u0007");
    // Nothing of the pin reaches the agent file either.
    expect(rowAt(residue.outputs, ".github/agents/stamity-fixer.agent.md").content).not.toContain("Name (copilot)");
  });

  it("drops a pin typed as a display name, picks the class from the list, and warns once naming the class (build/65)", async () => {
    const ctx = ctxOf({ pins: { advanced: { copilot: "Claude Opus 5.5 (copilot)" } }, listed: ["gpt-6-astra"] });
    const residue = await copilotResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx);
    const implementer = rowAt(residue.outputs, ".github/agents/stamity-implementer.agent.md").content;

    // Neither in `models`, which takes CLI ids, nor moved to `model:`: the class takes the pick.
    expect(implementer).not.toContain("Claude Opus 5.5 (copilot)");
    expect(modelsOf(implementer)).toEqual(["gpt-6-astra"]);
    const map = JSON.parse(rowAt(residue.outputs, ".stamity/generated/models/copilot.json").content) as {
      classes: Record<string, { model?: string }>;
    };
    expect(map.classes["advanced"]?.model).toBe("gpt-6-astra");

    // One warning, naming the client, the class and the value, and saying what a pin takes.
    const warnings = (residue.warnings ?? []).filter((line) => line.includes("Claude Opus 5.5 (copilot)"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("[copilot]");
    expect(warnings[0]).toContain("advanced");
    expect(warnings[0]).toContain("Copilot pins take model ids");

    // Non-degenerate: an id pin on the same class binds and raises no such warning.
    const idCtx = ctxOf({ pins: { advanced: { copilot: "gpt-6-astra" } } });
    const idResidue = await copilotResiduePlanner.planResidue(await buildCoreEmissionPlan(idCtx), idCtx);
    expect((idResidue.warnings ?? []).some((line) => line.includes("model ids"))).toBe(false);
    expect(modelsOf(rowAt(idResidue.outputs, ".github/agents/stamity-implementer.agent.md").content)).toEqual([
      "gpt-6-astra",
      "claude-opus-5.5",
      "claude-opus-5",
    ]);
  });

  // TEST CHANGE, justified (2026-10-14, e8-copilot-codex-claude-pins): the pin is quoted inside
  // `models` now, where it used to be the `model:` scalar (REQ-LADDER-007); what is pinned, a
  // colon that cannot open a second key, is unchanged.
  it("quotes a pinned value so a colon in it cannot open a second frontmatter key", () => {
    const output = buildAgentFile(
      itemOf({ type: "agent", id: "pinned", frontmatter: { model_class: "advanced" } }),
      grantOf("stamity-reviewer"),
      asIs,
      { advanced: "vendor:model 3" },
    );

    expect(frontmatterValue(output.content, "models")).toBe(
      '["vendor:model 3", "claude-opus-5.5", "gpt-6-astra", "claude-opus-5"]',
    );
    expect(modelsOf(output.content)).toEqual(["vendor:model 3", "claude-opus-5.5", "gpt-6-astra", "claude-opus-5"]);
    expect(frontmatterLines(output.content).filter((line) => line.startsWith("vendor"))).toEqual([]);
  });

  // TEST CHANGE, justified (2026-10-14, e8-copilot-codex-claude-pins): `models` is the second
  // model key, so its absence is asserted beside `model`'s; the behaviour is unchanged.
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
    expect(modelsOf(classless.content)).toBeUndefined();
    expect(modelsOf(bogus.content)).toBeUndefined();
  });

  it("writes the class-to-model map, which parses and lists every role (REQ-LADDER-007)", async () => {
    const plan = await planResidue({ pins: { advanced: { copilot: "gpt-6-astra" } } });
    const row = rowAt(plan, ".stamity/generated/models/copilot.json");
    expect(row.owner).toEqual({ adapter: "copilot", artifactId: "copilot-model-map", artifactType: "infra" });
    expect(row.content.endsWith("\n")).toBe(true);

    const map = JSON.parse(row.content) as {
      classes: Record<string, { model?: string; fallbacks: string[] }>;
      roles: Record<string, string>;
    };
    // Every ladder class, `frontier` included: a flow escalates a role to it on the call.
    expect(map.classes).toEqual({
      frontier: { model: "claude-fable-5.1", fallbacks: ["claude-opus-5.5", "gpt-6-astra"] },
      advanced: { model: "gpt-6-astra", fallbacks: ["claude-opus-5.5", "claude-opus-5"] },
      standard: { model: "claude-sonnet-5", fallbacks: ["gpt-6-sol", "gpt-5.6-terra"] },
      economy: { model: "claude-haiku-4.5", fallbacks: ["gpt-6-luna", "gpt-5.4-mini"] },
    });
    expect(Object.keys(map.roles)).toEqual(CORPUS_AGENT_IDS.map((id) => `stamity-${id}`));
    const classByEffort: Record<string, string> = { high: "advanced", medium: "standard", low: "economy" };
    for (const id of CORPUS_AGENT_IDS) {
      expect(map.roles[`stamity-${id}`], id).toBe(classByEffort[CORPUS_AGENT_EFFORT[id]]);
      // A file and the map never disagree on a role's model.
      const modelClass = map.roles[`stamity-${id}`] ?? "";
      expect((modelsOf(agentAt(plan, id)) as string[])[0], id).toBe(map.classes[modelClass]?.model);
    }
  });

  // TEST CHANGE, justified (2026-10-10, q6c-copilot-effort-key): the case read "never emits an
  // effort key: this client carries the axis nowhere" and refused `reasoning-effort` on every agent
  // file, with a `null` carrier and the cap row's "this engine does not write it yet". The Copilot
  // CLI's custom-agent loader reads that key (changelog 1.0.66 and 1.0.88; the 1.0.89 loader, read
  // 2026-10-10), and the plan gate chose to emit it (REQ-LADDER-004), so the case now pins the
  // emission: the key, its level per class, its place, and the files that carry none.
  it("emits `reasoning-effort` at each class's default, after the model line, and on no prompt file", async () => {
    const plan = await planResidue({ pins: { advanced: { all: "some-vendor/frontier-1" } } });

    for (const id of CORPUS_AGENT_IDS) {
      const row = rowAt(plan, `.github/agents/stamity-${id}.agent.md`);
      const lines = frontmatterLines(row.content);
      // Bare, like the file's other fixed-vocabulary values, and always the last line.
      expect(lines.at(-1), row.path).toBe(`reasoning-effort: ${CORPUS_AGENT_EFFORT[id]}`);
      // The one spelling this client's loader carries: no other rides along.
      expect(lines.filter((line) => /effort/i.test(line.split(":")[0] ?? "")), row.path).toHaveLength(1);
    }
    // Non-degenerate: all three class defaults are on the page, and a pinned agent carries the
    // effort line directly below its model line.
    // TEST CHANGE, justified (2026-10-14, e8-copilot-codex-claude-pins): the pin's model line is
    // `models`, the CLI's priority list with the pin first; a pin with no shipped display name
    // writes no `model:` line (REQ-LADDER-007). The effort line's place is unchanged.
    expect(new Set(Object.values(CORPUS_AGENT_EFFORT))).toEqual(new Set(["high", "medium", "low"]));
    expect(
      frontmatterLines(rowAt(plan, ".github/agents/stamity-reviewer.agent.md").content).slice(-2),
    ).toEqual([
      'models: ["some-vendor/frontier-1", "claude-opus-5.5", "gpt-6-astra", "claude-opus-5"]',
      "reasoning-effort: high",
    ]);
    expect(CLIENT_MODEL_PROJECTION.copilot.effortKey).toBe("reasoning-effort");

    // A prompt file runs in the session, at the session's own effort: no key.
    const prompts = plan.filter((row) => row.path.startsWith(".github/prompts/"));
    expect(prompts).toHaveLength(CORPUS_COMMAND_IDS.length);
    for (const row of prompts) expect(row.content, row.path).not.toContain("reasoning-effort");

    // An agent with no class, or a class off the ladder, has asked for no level.
    for (const frontmatter of [{}, { model_class: "titanic" }]) {
      const output = buildAgentFile(
        itemOf({ type: "agent", id: "unsized", frontmatter }),
        grantOf("stamity-reviewer"),
        asIs,
        {},
        { advanced: "max" },
      );
      expect(frontmatterValue(output.content, "reasoning-effort")).toBeUndefined();
    }
  });

  it("writes an operator's level narrowed to this client's scale, and discloses each narrowing once", async () => {
    // `ultra` is above this client's documented top and `minimal` is its legacy level below the
    // floor; `xhigh` is a level the scale holds, the control that an operator level is written as
    // asked. Through the composed planner, so the files and the warnings come from one pass.
    const efforts: EffortMap = { advanced: "ultra", standard: "xhigh", economy: "minimal" };
    const ctx = ctxOf({ efforts });
    const result = await composeEmissionPlanner({ copilot: copilotResiduePlanner }).planWithWarnings(ctx);

    const effortOf = (id: string): string | undefined =>
      frontmatterValue(rowAt(result.outputs, `.github/agents/stamity-${id}.agent.md`).content, "reasoning-effort");
    expect(effortOf("reviewer")).toBe("max");
    expect(effortOf("fixer")).toBe("xhigh");
    expect(effortOf("test-runner")).toBe("low");

    const disclosed = result.warnings.filter((warning) => warning.startsWith("effort ["));
    expect(disclosed).toEqual([
      "effort [copilot]: advanced asks for ultra; this client's scale ends at max, emitted max",
      "effort [copilot]: economy asks for minimal; this client's scale starts at low, emitted low",
    ]);
    expect(disclosed).toEqual(effortDisclosures(ctx.manifest));
  });
});

// ── Setup steps workflow ─────────────────────────────────────────

describe("copilot-setup-steps.yml", () => {
  // TEST CHANGE (sw10-first-run-output, REQ-FLOW-022): `buildSetupSteps` takes the
  // project's pre-read pins as a third argument. The cases below pass
  // `NO_SETUP_STEPS_PINS` (every value at its default) and pin the same lane
  // behaviour they pinned before; the pin cases follow them.
  it("parses as YAML and declares the job name the coding agent runs", () => {
    const yaml = buildSetupSteps(packageManagerOf({ lockfile: "package-lock.json" }), ["typescript"], NO_SETUP_STEPS_PINS);
    const parsed = parseYaml(yaml) as { jobs: Record<string, { steps: unknown[] }> };

    expect(Object.keys(parsed.jobs)).toEqual(["copilot-setup-steps"]);
    expect(parsed.jobs["copilot-setup-steps"]?.steps.length).toBeGreaterThan(1);
    expect(yaml.endsWith("\n")).toBe(true);
  });

  it("bounds the job with timeout-minutes, under the platform's 59 on every lane (REQ-FLOW-117)", () => {
    for (const yaml of [
      buildSetupSteps(packageManagerOf({ lockfile: "package-lock.json" }), ["typescript"], NO_SETUP_STEPS_PINS),
      buildSetupSteps(packageManagerOf({}), ["python"], NO_SETUP_STEPS_PINS),
    ]) {
      const parsed = parseYaml(yaml) as { jobs: Record<string, { "timeout-minutes"?: unknown }> };
      const timeout = parsed.jobs["copilot-setup-steps"]?.["timeout-minutes"];

      expect(typeof timeout).toBe("number");
      expect(timeout as number).toBeGreaterThan(0);
      expect(timeout as number).toBeLessThanOrEqual(59);
    }
  });

  it("installs frozen only when a lockfile is actually present", () => {
    expect(buildSetupSteps(packageManagerOf({ lockfile: "package-lock.json" }), [], NO_SETUP_STEPS_PINS)).toContain(
      "- run: npm ci",
    );
    // `npm ci` without a lockfile fails outright, so the honest command is `install`.
    expect(buildSetupSteps(packageManagerOf({}), ["javascript"], NO_SETUP_STEPS_PINS)).toContain("- run: npm install");
    expect(
      buildSetupSteps(packageManagerOf({ name: "pnpm", lockfile: "pnpm-lock.yaml" }), [], NO_SETUP_STEPS_PINS),
    ).toContain("- run: pnpm install --frozen-lockfile");
    expect(
      buildSetupSteps(packageManagerOf({ name: "bun", lockfile: "bun.lock" }), [], NO_SETUP_STEPS_PINS),
    ).toContain("- run: bun install --frozen-lockfile");
  });

  it("enables Corepack for the managers that need provisioning, and not for the others", () => {
    expect(buildSetupSteps(packageManagerOf({ name: "yarn", lockfile: "yarn.lock" }), [], NO_SETUP_STEPS_PINS)).toContain(
      "- run: corepack enable",
    );
    expect(
      buildSetupSteps(packageManagerOf({ name: "npm", lockfile: "package-lock.json" }), [], NO_SETUP_STEPS_PINS),
    ).not.toContain("corepack enable");
  });

  // TEST CHANGE, justified (e6-copilot-adapter, REQ-FLOW-022): a repository with
  // no Node evidence used to get a checkout alone. The hooks this engine writes
  // for Copilot run on `node` in every repository, so the workflow now installs
  // Node there too (the LTS with no project pin) and still writes no install
  // step for a stack it cannot see. One step became two, and the comment that
  // said "a checkout only" now says why Node is there.
  it("installs Node and no dependencies when no Node evidence exists, naming what was detected", () => {
    const yaml = buildSetupSteps(packageManagerOf({}), ["python"], NO_SETUP_STEPS_PINS);
    const parsed = parseYaml(yaml) as {
      jobs: Record<string, { steps: { uses?: string; run?: string; with?: Record<string, string> }[] }>;
    };
    const steps = parsed.jobs["copilot-setup-steps"]?.steps ?? [];

    expect(steps.map((step) => step.uses)).toEqual(["actions/checkout@v6", "actions/setup-node@v7"]);
    expect(steps[1]?.with).toEqual({ "node-version": "lts/*" });
    expect(steps.some((step) => step.run !== undefined)).toBe(false);
    expect(yaml).not.toContain("npm install");
    expect(yaml).toContain("detected: python");
    // The generated file is overwritten on every sync, so it no longer invites an
    // edit; it says what the agent gets instead.
    expect(yaml).not.toContain("here.");
    expect(yaml).toContain("Node is here for the generated hooks");
  });

  it("keeps the project's own pins in a repository with no Node evidence", async () => {
    const temp = getTemp();
    const sha = "11bd71901bbe5b1630ceea73d27597364c9af683";
    await temp.seedFiles({
      "repo/.nvmrc": "22.12.0\n",
      "repo/.github/workflows/ci.yml": `jobs:\n  x:\n    steps:\n      - uses: actions/setup-node@${sha} # v4.4.0\n`,
    });

    const yaml = buildSetupSteps(packageManagerOf({}), ["python"], await readSetupStepsPins(temp.path("repo")));

    expect(yaml).toContain(`- uses: actions/setup-node@${sha} # v4.4.0`);
    expect(yaml).toContain('node-version: "22.12.0"');
    expect(yaml).not.toContain("lts/*");
    expect(yaml).not.toContain("setup-node@v7");
    // checkout is not in the project's workflow, so it takes its own default.
    expect(yaml).toContain("- uses: actions/checkout@v6");
    expect(yaml).not.toMatch(/- run: /);
    // The action left at its major tag keeps the SHA-pin advice (review/96).
    expect(yaml).toContain(
      "      # actions/checkout is at a major tag: pin it to a full-length commit SHA for a stricter supply-chain posture.",
    );
  });

  it("keeps the SHA-pin advice for setup-node when the project SHA-pins checkout alone (review/96)", async () => {
    const temp = getTemp();
    const sha = "11bd71901bbe5b1630ceea73d27597364c9af683";
    await temp.seedFiles({
      "repo/.github/workflows/ci.yml": `jobs:\n  x:\n    steps:\n      - uses: actions/checkout@${sha} # v4.2.2\n`,
    });

    const yaml = buildSetupSteps(packageManagerOf({}), ["python"], await readSetupStepsPins(temp.path("repo")));

    expect(yaml).toContain(`- uses: actions/checkout@${sha} # v4.2.2`);
    expect(yaml).toContain("- uses: actions/setup-node@v7");
    expect(yaml).toContain(
      "      # actions/setup-node is at a major tag: pin it to a full-length commit SHA for a stricter supply-chain posture.",
    );
    expect(yaml).not.toContain("actions/checkout is at a major tag");
    expect(parseYaml(yaml)).toBeTypeOf("object");
  });

  it("gives no SHA-pin advice when the project pins both actions itself", async () => {
    const temp = getTemp();
    await temp.seedFiles({
      "repo/.github/workflows/ci.yml":
        "jobs:\n  x:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n",
    });

    const yaml = buildSetupSteps(packageManagerOf({}), ["python"], await readSetupStepsPins(temp.path("repo")));

    expect(yaml).not.toContain("full-length commit SHA");
    expect(yaml).toContain("Action refs follow this project's own workflows (.github/workflows/ci.yml)");
  });

  it("references each action at its own current major when the project pins none", () => {
    const yaml = buildSetupSteps(packageManagerOf({ lockfile: "package-lock.json" }), [], NO_SETUP_STEPS_PINS);

    expect(yaml).toContain("- uses: actions/checkout@v6");
    expect(yaml).toContain("- uses: actions/setup-node@v7");
    expect(yaml).not.toMatch(/@v5\b/);
    // No project pin at all: the one line that has always advised a SHA pin.
    expect(yaml).toContain("      # Pin these to a full-length commit SHA for a stricter supply-chain posture.");
    expect(yaml).not.toContain("is at a major tag");
  });

  it("follows the project's engines.node and its own checkout ref (REQ-FLOW-022)", async () => {
    const temp = getTemp();
    await temp.seedFiles({
      "repo/package-lock.json": "{}\n",
      "repo/package.json": `${JSON.stringify({ name: "x", engines: { node: "22" } })}\n`,
      "repo/.github/workflows/ci.yml":
        "on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v7\n",
    });
    const rootDir = temp.path("repo");

    const yaml = rowAt(await planResidue({ rootDir }), COPILOT_SETUP_STEPS_PATH).content;

    expect(yaml).toContain('node-version: "22"');
    expect(yaml).toContain("- uses: actions/checkout@v7");
    // setup-node is not in the project's workflow, so it keeps the major tag.
    // TEST CHANGE, justified (e6-copilot-adapter, REQ-FLOW-022): the defaults
    // moved from v5 for both actions to checkout@v6 and setup-node@v7, so the
    // default this case expects, and the one it must not see, moved with them.
    expect(yaml).toContain("- uses: actions/setup-node@v7");
    expect(yaml).toContain("From this project's package.json engines.node");
    expect(yaml).toContain(".github/workflows/ci.yml");
    expect(yaml).not.toContain("lts/*");
    expect(yaml).not.toContain("actions/checkout@v6");
    expect(parseYaml(yaml)).toBeTypeOf("object");
  });

  it("copies a SHA pin with its trailing comment, and reads .nvmrc before engines.node", async () => {
    const temp = getTemp();
    const sha = "11bd71901bbe5b1630ceea73d27597364c9af683";
    await temp.seedFiles({
      "repo/.nvmrc": "\n  22.12.0\n",
      "repo/package.json": `${JSON.stringify({ engines: { node: ">=20" } })}\n`,
      "repo/.github/workflows/a.yaml": `jobs:\n  x:\n    steps:\n      - uses: "actions/setup-node@v6"\n`,
      "repo/.github/workflows/b.yml": `jobs:\n  x:\n    steps:\n      - uses: actions/checkout@${sha} # v4.2.2\n      - uses: actions/checkout@v3\n`,
    });

    const pins = await readSetupStepsPins(temp.path("repo"));

    expect(pins.node).toEqual({ version: "22.12.0", source: ".nvmrc" });
    expect(pins.checkout).toEqual({ ref: sha, comment: "v4.2.2", source: ".github/workflows/b.yml" });
    expect(pins.setupNode).toEqual({ ref: "v6", comment: null, source: ".github/workflows/a.yaml" });
    const yaml = buildSetupSteps(packageManagerOf({ lockfile: "package-lock.json" }), [], pins);
    expect(yaml).toContain(`- uses: actions/checkout@${sha} # v4.2.2`);
    expect(yaml).toContain("- uses: actions/setup-node@v6");
    expect(yaml).toContain('node-version: "22.12.0"');
  });

  it("never reads its own emitted workflow: a second plan over the first's output is byte-identical", async () => {
    const temp = getTemp();
    await temp.seedFiles({ "repo/package-lock.json": "{}\n" });
    const rootDir = temp.path("repo");

    const first = rowAt(await planResidue({ rootDir }), COPILOT_SETUP_STEPS_PATH).content;
    // The emitted file is the repo's only workflow. It names actions/checkout@v6,
    // so a scan that read it would find a "project" pin and rewrite the comments.
    await temp.seedFiles({ [`repo/${COPILOT_SETUP_STEPS_PATH}`]: first });
    const second = rowAt(await planResidue({ rootDir }), COPILOT_SETUP_STEPS_PATH).content;

    expect(second).toBe(first);
    expect(await readSetupStepsPins(rootDir)).toEqual(NO_SETUP_STEPS_PINS);
  });

  it("takes the floor of an engines.node range at the precision it names", () => {
    expect(engineRangeFloor("22")).toBe("22");
    expect(engineRangeFloor(">=22.12")).toBe("22.12");
    expect(engineRangeFloor(">= 22.12 <23")).toBe("22.12");
    expect(engineRangeFloor("^20.11.0 || ^22")).toBe("20.11.0");
    expect(engineRangeFloor("22.x")).toBe("22");
    // No lower bound, or a strict one: no floor, so the LTS default stays.
    expect(engineRangeFloor("<23")).toBeNull();
    expect(engineRangeFloor(">22")).toBeNull();
    expect(engineRangeFloor("*")).toBeNull();
  });

  it("does not copy a node-version value that could break the quoted scalar", async () => {
    const temp = getTemp();
    await temp.seedFiles({ "repo/.nvmrc": 'v22" evil\n', "repo/.node-version": "lts/iron\n" });

    expect((await readSetupStepsPins(temp.path("repo"))).node).toEqual({
      version: "lts/iron",
      source: ".node-version",
    });
  });

  it("takes a Corepack pin as Node evidence on its own", () => {
    const yaml = buildSetupSteps(packageManagerOf({ name: "pnpm", fromPackageJsonField: true }), [], NO_SETUP_STEPS_PINS);

    // TEST CHANGE, justified (e6-copilot-adapter, REQ-FLOW-022): setup-node's default major is v7 now.
    expect(yaml).toContain("actions/setup-node@v7");
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

  // ── The pinned CLI (REQ-FLOW-111) ──────────────────────────────

  /** The `run:` commands of an emitted setup workflow, in step order. */
  function runSteps(yaml: string): string[] {
    const parsed = parseYaml(yaml) as { jobs: Record<string, { steps: { run?: string }[] }> };
    return (parsed.jobs["copilot-setup-steps"]?.steps ?? []).flatMap((step) => (step.run === undefined ? [] : [step.run]));
  }

  /** The residue rows for a context the caller shapes past {@link ctxOf} — a fork's identity. */
  async function planResidueFor(ctx: EmissionContext): Promise<AdapterOutput[]> {
    return (await copilotResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs;
  }

  it("installs the pinned CLI after the project install, at the version the setup is generated with (REQ-FLOW-111)", async () => {
    const temp = getTemp();
    await temp.seedFiles({ "repo/package-lock.json": "{}\n", "repo/package.json": '{"name":"x"}\n' });

    const yaml = rowAt(await planResidue({ rootDir: temp.path("repo") }), COPILOT_SETUP_STEPS_PATH).content;

    // The project's own install first, then the CLI the hooks and the flows call, then the
    // proof that `stamity` resolves from PATH with no registry fetch.
    expect(runSteps(yaml)).toEqual([
      "npm ci",
      `npm install --global @zomarit/stamity@${ENGINE_VERSION}`,
      "stamity --version",
    ]);
    // The hard needs are named where a reader of the workflow meets the step.
    expect(yaml).toContain("`gate scan` and `ledger status`");
  });

  it("gives a repository with no package.json the pinned global install (REQ-FLOW-111)", async () => {
    const yaml = rowAt(await planResidue({ languages: ["python"] }), COPILOT_SETUP_STEPS_PATH).content;

    expect(runSteps(yaml)).toEqual([`npm install --global @zomarit/stamity@${ENGINE_VERSION}`, "stamity --version"]);
    // Still no install for the stack it cannot see.
    expect(yaml).toContain("detected: python");
    expect(yaml).not.toContain("npm ci");
  });

  it("carries a fork's package and registry into the pinned install line (REQ-FLOW-111)", async () => {
    const registry = "https://npm.acme.example/registry";
    const ctx: EmissionContext = { ...ctxOf({ languages: ["python"] }), packageName: "@acme/stamity", npmRegistry: registry };

    const yaml = rowAt(await planResidueFor(ctx), COPILOT_SETUP_STEPS_PATH).content;

    // The registry setting precedes the spec, as on every pinned call, so the scope's
    // package comes from the fork's registry and nothing else does.
    expect(runSteps(yaml)).toEqual([
      `npm install --global --@acme:registry=${registry} @acme/stamity@${ENGINE_VERSION}`,
      "stamity --version",
    ]);
    expect(yaml).not.toContain("@zomarit/stamity");
  });

  it("installs nothing from a registry for a package with no npm channel, and says why (REQ-FLOW-111)", async () => {
    const ctx: EmissionContext = { ...ctxOf({ languages: ["python"] }), packageName: "@acme/stamity", npmChannel: false };

    const yaml = rowAt(await planResidueFor(ctx), COPILOT_SETUP_STEPS_PATH).content;

    // A `-y` or global install would fetch whatever a third party published under the
    // fork's unpublished name; `npx --no` runs an installed copy only.
    expect(runSteps(yaml)).toEqual([]);
    expect(yaml).not.toContain("npm install --global");
    expect(yaml).toContain("has no npm channel");
    expect(parseYaml(yaml)).toBeTypeOf("object");
  });

  it("keeps naming the pinned version in the hook entries (inbox row 257, decided in v10)", async () => {
    // Decided, not changed: the starter's missing-runner remedy is the pinned `sync`, the
    // version that wrote the file, so an upgrade still rewrites `.github/hooks/stamity.json`.
    const hooks = rowAt(await planResidue(), COPILOT_HOOKS_PATH).content;

    expect(hooks).toContain(`@zomarit/stamity@${ENGINE_VERSION} sync`);
  });
});

// ── Hooks: received, deliberately not emitted ────────────────────

describe("hooks", () => {
  it("registers core hooks on the native repository surface", async () => {
    const ctx = ctxOf();
    const core = await buildCoreEmissionPlan(ctx);

    expect(core.hooks.interchangeFor("copilot").length).toBeGreaterThan(0);

    const plan = (await copilotResiduePlanner.planResidue(core, ctx)).outputs;
    const hookish = pathsOf(plan).filter(
      (path) => path.includes("hooks") || path.endsWith("settings.json"),
    );
    expect(hookish).toContain(".github/hooks/stamity.json");
    const native = JSON.parse(rowAt(plan, ".github/hooks/stamity.json").content);
    expect(native.version).toBe(1);
    // TEST CHANGE, justified (e6-copilot-adapter, REQ-FLOW-086): the file keys its
    // events camelCase now, so the guard's one entry sits under `preToolUse`.
    // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): two entries now, the core guard and
    // the person-only shell guard on the shell tools.
    expect(native.hooks.preToolUse).toHaveLength(2);
  });

  /** The interchange row a Copilot entry's starter carries, decoded from its last word. */
  const rowOf = (command: string): { event: string; command: string[] } =>
    JSON.parse(Buffer.from(command.split(" ").at(-1) ?? "", "base64url").toString()) as { event: string; command: string[] };
  const PERSON_ONLY = ".stamity/generated/hooks/copilot/stamity-person-only-guard.mjs";

  it("runs the person-only shell guard on bash and powershell through the portable runner (u20)", async () => {
    const native = JSON.parse(rowAt(await planResidue(), COPILOT_HOOKS_PATH).content) as {
      hooks: Record<string, { command: string; matcher?: string }[]>;
    };
    const guards = (native.hooks["preToolUse"] ?? []).filter((entry) => rowOf(entry.command).command[1] === PERSON_ONLY);

    // One entry, keyed by Copilot's runtime shell tool names, launching the runner (the starter's default script).
    expect(guards).toHaveLength(1);
    expect(guards[0]?.matcher).toBe("bash|powershell");
    expect(guards[0]?.command).toContain("stamity-portable-hook.mjs");
    expect(rowOf(guards[0]!.command)).toEqual({ event: "pre_tool_use", command: ["node", PERSON_ONLY], matcher: "Bash|PowerShell" });
  });

  it("refuses a force push through the emitted entry, lets a status read through, and fails closed when the guard is missing (u20)", async () => {
    const plan = await planComposed();
    const temp = getTemp();
    const runner = ".stamity/generated/hooks/copilot/stamity-portable-hook.mjs";
    await temp.seedFiles({
      [`run/${COPILOT_HOOKS_PATH}`]: rowAt(plan, COPILOT_HOOKS_PATH).content,
      [`run/${runner}`]: rowAt(plan, runner).content,
      [`run/${PERSON_ONLY}`]: rowAt(plan, PERSON_ONLY).content,
    });
    const native = JSON.parse(rowAt(plan, COPILOT_HOOKS_PATH).content) as { hooks: Record<string, { command: string }[]> };
    const command = (native.hooks["preToolUse"] ?? []).find((entry) => rowOf(entry.command).command[1] === PERSON_ONLY)!.command;
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env["STAMITY_UNATTENDED"];
    // Copilot's camelCase payload, its tool arguments serialized, as the runner normalizes them.
    const run = (shellCommand: string) =>
      spawnSync(command, {
        cwd: temp.path("run"),
        env,
        shell: true,
        input: JSON.stringify({ toolName: "bash", toolArgs: JSON.stringify({ command: shellCommand }) }),
        encoding: "utf8",
      });

    const denied = run("git push --force origin feature");
    expect(denied.status, denied.stderr).toBe(0);
    expect(JSON.parse(denied.stdout)).toMatchObject({ permissionDecision: "deny" });
    const allowed = run("git status");
    expect({ status: allowed.status, stdout: allowed.stdout }).toEqual({ status: 0, stdout: "" });

    await rm(temp.path("run", ...PERSON_ONLY.split("/")));
    // Copilot rejects a preToolUse call on any non-zero exit, so a guard that cannot run refuses the call.
    expect(run("git status").status).not.toBe(0);
  });

  it("keys every event camelCase and gives every entry a bash command equal to its command (REQ-FLOW-086)", async () => {
    const native = JSON.parse(rowAt(await planResidue(), COPILOT_HOOKS_PATH).content) as {
      hooks: Record<string, { type: string; bash?: string; command: string; cwd: string }[]>;
    };
    const keys = Object.keys(native.hooks);

    expect(keys.length).toBeGreaterThan(1);
    for (const key of keys) {
      expect(key, key).toMatch(/^[a-z]/);
      expect(Object.values(COPILOT_EVENT_NAMES)).toContain(key);
    }
    expect(keys).toContain("sessionStart");
    expect(keys).toContain("preToolUse");
    for (const entry of Object.values(native.hooks).flat()) {
      expect(entry.type).toBe("command");
      expect(typeof entry.bash).toBe("string");
      expect(entry.bash).toBe(entry.command);
      expect(entry.cwd).toBe(".");
    }
  });

  it("addresses the runner through the plugin root and keeps no repository path", () => {
    const ROOT = "${PLUGIN_ROOT}/hooks";
    const raw = buildCopilotHooksJson([
      { event: "session_start", command: ["node", `${ROOT}/stamity-session-start.mjs`] },
      { event: "pre_tool_use", command: ["node", `${ROOT}/stamity-pre-tool-use-guard.mjs`] },
    ]);
    const native = JSON.parse(raw);

    const entries = (Object.values(native.hooks) as { command: string; cwd: string }[][]).flat();
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      // Double-quoted: the variable expands to an absolute install path that may
      // hold a space, and the runner is a sibling of the scripts it launches.
      expect(entry.command.startsWith(`node "${ROOT}/stamity-portable-hook.mjs" `)).toBe(true);
      // `cwd` stays the repository root this client resolves it against — the
      // session's repository is what the hook reads, not the plugin container.
      expect(entry.cwd).toBe(".");
    }
    expect(raw).not.toContain(".stamity/generated");
  });

  // TEST CHANGE, justified (e6-copilot-adapter, REQ-FLOW-086): this case pinned the
  // PascalCase aliases, under which the matcher stayed in Claude's names. The
  // file keys its events camelCase now, the payload then names tools in
  // Copilot's runtime vocabulary, and the matcher is translated into it. The
  // timeout and cwd expectations are unchanged.
  it("keys events camelCase and translates portable tool matchers into Copilot's runtime names", () => {
    const native = JSON.parse(buildCopilotHooksJson([
      { event: "pre_tool_use", matcher: "Bash|Edit", command: ["node", "policy.mjs"], timeoutMs: 1100 },
      { event: "stop", command: ["node", "stop.mjs"] },
      { event: "user_prompt_submit", command: ["node", "prompt.mjs"] },
      { event: "session_end", command: ["node", "end.mjs"] },
    ]));
    // TEST CHANGE, justified (e6-copilot-adapter fix round 1, review/94): `apply_patch`
    // no longer stands for `Edit`; it keeps its own name and patch input, so `Edit`
    // translates to Copilot's two single-file edit tools only.
    expect(native.hooks.preToolUse[0]).toMatchObject({
      matcher: "bash|edit|str_replace_editor",
      timeoutSec: 2,
      cwd: ".",
    });
    expect(native.hooks.agentStop).toHaveLength(1);
    expect(native.hooks.userPromptSubmitted).toHaveLength(1);
    expect(native.hooks.sessionEnd).toHaveLength(1);
    for (const pascal of ["PreToolUse", "Stop", "UserPromptSubmit", "SessionEnd"]) {
      expect(native.hooks).not.toHaveProperty(pascal);
    }
  });

  // TEST CHANGE, justified (e6-copilot-adapter fix round 1, review/94, review/95, review/97):
  // the two cases below pinned a matcher read as `|`-split names, `apply_patch` under
  // `Edit`, and one warning per alternative. The matcher is now read as the regular
  // expression it is (a plain alternation of names, anchors and one group allowed;
  // anything else kept as written, unreported), `apply_patch` keeps its own name,
  // `PowerShell` gains its runtime twin, and a warning names the whole matcher.
  it("translates the tool names of a plain alternation, anchors and group kept, and leaves any other pattern alone", () => {
    expect(translateCopilotMatcher("Read|Write|Grep|Glob|Agent|AskUserQuestion")).toEqual({
      matcher: "view|create|grep|rg|glob|task|ask_user",
      untranslated: [],
      claudeNames: ["Read", "Write", "Grep", "Glob", "Agent", "AskUserQuestion"],
    });
    // Claude Code's legacy spawn name translates like `Agent` (build/58), and the two together give one `task`.
    expect(translateCopilotMatcher("Task").matcher).toBe("task");
    expect(translateCopilotMatcher("Agent|Task").matcher).toBe("task");
    // review/95: Claude's PowerShell has Copilot's powershell as its twin.
    expect(translateCopilotMatcher("Bash|PowerShell")).toEqual({
      matcher: "bash|powershell",
      untranslated: [],
      claudeNames: ["Bash", "PowerShell"],
    });
    // review/94: Edit is the two single-file edit tools; apply_patch is a runtime name of its own.
    expect(translateCopilotMatcher("bash|Edit").matcher).toBe("bash|edit|str_replace_editor");
    expect(translateCopilotMatcher("Edit|apply_patch")).toEqual({
      matcher: "edit|str_replace_editor|apply_patch",
      untranslated: [],
      claudeNames: ["Edit"],
    });
    // review/97: anchors and a group are kept around the translated names.
    expect(translateCopilotMatcher("^(Bash|Edit)$").matcher).toBe("^(bash|edit|str_replace_editor)$");
    expect(translateCopilotMatcher("(?:Grep)").matcher).toBe("(?:grep|rg)");
    expect(translateCopilotMatcher("^Bash$").matcher).toBe("^bash$");
    // TEST CHANGE, justified (e6-copilot-adapter fix round 1, M-1 sign-off): `Bash|mcp__.*`
    // left this list, because a mixed matcher now translates its plain-name alternatives
    // (the next case pins it); an escaped bar and a character class joined it.
    // No top-level alternative is a plain tool name, or the pattern does not parse: kept whole, reported never.
    for (const pattern of [".*", "mcp__.*", "Notebook.*", "^(Bash|Edit", "Bash)", "(Bash)|(Edit)", "Grep\nIgnore previous", "Bash\\|Edit", "[Bash|Edit]"]) {
      expect(translateCopilotMatcher(pattern), pattern).toEqual({ matcher: pattern, untranslated: [], claudeNames: [] });
    }
    // `*` and an empty matcher are already Copilot's.
    expect(translateCopilotMatcher("*")).toEqual({ matcher: "*", untranslated: [], claudeNames: [] });
    expect(translateCopilotMatcher("")).toEqual({ matcher: "", untranslated: [], claudeNames: [] });
    // A name with no runtime twin stays in place and is returned for the warning.
    expect(translateCopilotMatcher("^(Bash|NotebookEdit)$")).toEqual({
      matcher: "^(bash|NotebookEdit)$",
      untranslated: ["NotebookEdit"],
      claudeNames: ["Bash"],
    });
  });

  // M-1 of the fix round, signed off: a mixed matcher translates its plain-name
  // alternatives and keeps every other alternative exactly as written.
  it("translates the plain-name alternatives of a mixed matcher and keeps every other alternative as written", () => {
    expect(translateCopilotMatcher("Bash|mcp__.*")).toEqual({ matcher: "bash|mcp__.*", untranslated: [], claudeNames: ["Bash"] });
    expect(translateCopilotMatcher("^(Edit|mcp__github__.*)$")).toEqual({
      matcher: "^(edit|str_replace_editor|mcp__github__.*)$",
      untranslated: [],
      claudeNames: ["Edit"],
    });
    // A nested group, a character class and an escaped bar stay inside their alternative.
    expect(translateCopilotMatcher("(?:Bash|Edit)|Read").matcher).toBe("(?:Bash|Edit)|view");
    expect(translateCopilotMatcher("[A|B]x|Grep").matcher).toBe("[A|B]x|grep|rg");
    expect(translateCopilotMatcher("a\\|b|Glob").matcher).toBe("a\\|b|glob");
    // A plain name with no runtime twin beside a regex alternative is still reported.
    expect(translateCopilotMatcher("NotebookEdit|mcp__.*")).toEqual({
      matcher: "NotebookEdit|mcp__.*",
      untranslated: ["NotebookEdit"],
      claudeNames: [],
    });
    expect(copilotMatcherWarnings([
      { event: "pre_tool_use", matcher: "Bash|mcp__.*", command: ["node", "a.mjs"] },
      { event: "pre_tool_use", matcher: "NotebookEdit|mcp__.*", command: ["node", "b.mjs"] },
      { event: "post_tool_use", matcher: "NotebookEdit|mcp__.*", command: ["node", "c.mjs"] },
    ])).toEqual([
      'hook matcher [copilot]: "NotebookEdit|mcp__.*" names a tool with no Copilot runtime name, which is kept as written and may match no call there.',
    ]);
    // A path guard on Edit beside a regex alternative still gets the apply_patch line.
    expect(copilotMatcherWarnings([{ event: "pre_tool_use", matcher: "Edit|mcp__.*", command: ["node", "a.mjs"] }])).toHaveLength(1);
  });

  it("translates Claude's WebFetch, WebSearch and TodoWrite into Copilot's web_fetch, web_search and update_todo, with no warning (review/132)", () => {
    expect(translateCopilotMatcher("^(WebFetch|WebSearch|TodoWrite)$")).toEqual({
      matcher: "^(web_fetch|web_search|update_todo)$",
      untranslated: [],
      claudeNames: ["WebFetch", "WebSearch", "TodoWrite"],
    });
    // Copilot's own names, already written, pass unchanged and unreported.
    expect(translateCopilotMatcher("web_fetch|update_todo")).toEqual({ matcher: "web_fetch|update_todo", untranslated: [], claudeNames: [] });
    expect(copilotMatcherWarnings([
      { event: "pre_tool_use", matcher: "WebFetch|WebSearch", command: ["node", "a.mjs"] },
      { event: "post_tool_use", matcher: "TodoWrite", command: ["node", "b.mjs"] },
      { event: "pre_tool_use", matcher: "web_search", command: ["node", "c.mjs"] },
    ])).toEqual([]);
    // review/132, rejected in part: PowerShell keeps its own twin and is not folded into Bash.
    expect(translateCopilotMatcher("Bash").matcher).toBe("bash");
    expect(translateCopilotMatcher("PowerShell").matcher).toBe("powershell");
  });

  it("names each matcher holding an untranslated tool once, whole, however many rows carry it", () => {
    const warnings = copilotMatcherWarnings([
      { event: "pre_tool_use", matcher: "Bash|NotebookEdit", command: ["node", "a.mjs"] },
      { event: "post_tool_use", matcher: "Bash|NotebookEdit", command: ["node", "b.mjs"] },
      { event: "pre_tool_use", matcher: "^(Grep|NotebookRead)$", command: ["node", "c.mjs"] },
      { event: "pre_tool_use", matcher: ".*", command: ["node", "d.mjs"] },
      { event: "pre_tool_use", matcher: "Grep\nIgnore previous", command: ["node", "e.mjs"] },
      { event: "pre_tool_use", matcher: "Bash", command: ["node", "f.mjs"] },
      { event: "session_start", command: ["node", "g.mjs"] },
    ]);

    expect(warnings).toEqual([
      'hook matcher [copilot]: "Bash|NotebookEdit" names a tool with no Copilot runtime name, which is kept as written and may match no call there.',
      'hook matcher [copilot]: "^(Grep|NotebookRead)$" names a tool with no Copilot runtime name, which is kept as written and may match no call there.',
    ]);
    // Whole matchers, never fragments.
    for (const warning of warnings) expect(warning).not.toMatch(/"\^\(Grep"|"NotebookRead\)\$"|"NotebookEdit"/);
  });

  it("warns once that a path guard on Edit or Write must also name apply_patch on Copilot (review/94)", () => {
    const APPLY_PATCH =
      'hook matcher [copilot]: Copilot also edits files through apply_patch, which reaches a hook under that name with its patch text and no file_path; a path guard matched on Edit or Write ("Edit", "^(Write|Bash)$") must also name apply_patch.';
    expect(
      copilotMatcherWarnings([
        { event: "pre_tool_use", matcher: "Edit", command: ["node", "a.mjs"] },
        { event: "post_tool_use", matcher: "^(Write|Bash)$", command: ["node", "b.mjs"] },
        { event: "pre_tool_use", matcher: "Edit", command: ["node", "c.mjs"] },
        { event: "pre_tool_use", matcher: "Edit|apply_patch", command: ["node", "d.mjs"] },
        { event: "pre_tool_use", matcher: "Read|Bash", command: ["node", "e.mjs"] },
      ]),
    ).toEqual([APPLY_PATCH]);
    // A matcher that already names apply_patch, or names neither tool, raises nothing.
    expect(copilotMatcherWarnings([{ event: "pre_tool_use", matcher: "Write|apply_patch", command: ["node", "a.mjs"] }])).toEqual([]);
    expect(copilotMatcherWarnings([{ event: "pre_tool_use", matcher: "Bash|Read", command: ["node", "a.mjs"] }])).toEqual([]);
  });

  it("reports an authored matcher with no runtime twin through the planner's warnings", async () => {
    const temp = getTemp();
    await temp.seedFiles({
      "repo/.stamity/hooks/notebook.json": `${JSON.stringify({
        hooks: [{ event: "pre_tool_use", matcher: "NotebookEdit|Bash", command: ["node", ".stamity/hooks/notebook.mjs"] }],
      })}\n`,
      "repo/.stamity/hooks/notebook.mjs": "process.exitCode = 0;\n",
    });
    const ctx = ctxOf({ rootDir: temp.path("repo") });

    const emission = await copilotResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx);
    const native = JSON.parse(rowAt(emission.outputs, COPILOT_HOOKS_PATH).content) as {
      hooks: Record<string, { matcher?: string }[]>;
    };

    expect(native.hooks.preToolUse?.map((entry) => entry.matcher)).toContain("NotebookEdit|bash");
    // TEST CHANGE, justified (e6-copilot-adapter fix round 1, review/97): the warning
    // names the whole matcher, never one alternative of it.
    expect((emission.warnings ?? []).filter((warning) => warning.startsWith("hook matcher [copilot]"))).toEqual([
      'hook matcher [copilot]: "NotebookEdit|Bash" names a tool with no Copilot runtime name, which is kept as written and may match no call there.',
    ]);
  });

  it("keeps a recoverable copy when an upgrade replaces a 1.14 PascalCase hooks file", async () => {
    const temp = getTemp();
    const root = temp.path("repo");
    // The shape 1.14 wrote: PascalCase keys, a relative command and no `bash` key.
    const earlier = `${JSON.stringify(
      { version: 1, hooks: { PreToolUse: [{ type: "command", command: "node .stamity/generated/hooks/copilot/stamity-portable-hook.mjs eyJ9", cwd: "." }] } },
      null,
      2,
    )}\n`;
    await temp.seedFiles({ [`repo/${COPILOT_HOOKS_PATH}`]: earlier });
    const incoming = buildCopilotHooksJson([{ event: "pre_tool_use", command: ["node", "policy.mjs"] }]);
    const hash = createHash("sha256").update(earlier).digest("hex");

    // The ledger records the 1.14 bytes, exactly as the earlier sync left them.
    const result = await safeWriteFile(join(root, COPILOT_HOOKS_PATH), incoming, {
      ledgerPaths: ledgerPathSet(root, [COPILOT_HOOKS_PATH]),
      ledgerHashes: ledgerHashIndex(root, [{ path: COPILOT_HOOKS_PATH, contentHash: hash }]),
      boundaryDir: root,
    });

    expect(result.action).toBe("updated");
    expect(await readFile(join(root, COPILOT_HOOKS_PATH), "utf8")).toBe(incoming);
    const folder = join(root, ".github/hooks");
    const backups = (await readdir(folder)).filter((name) => name.startsWith("stamity.json.bak"));
    expect(backups).toHaveLength(1);
    expect(await readFile(join(folder, backups[0] ?? ""), "utf8")).toBe(earlier);
  });

  // HOOK-2. Four surfaces said this client could not inject session-start
  // context; its hooks reference says a sessionStart hook injects through
  // `additionalContext`. The planner warning is one of the four.
  it("tells the operator session-start context reaches the session, with the page and date behind it", async () => {
    const ctx = ctxOf();
    const emission = await copilotResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx);
    const fallback = (emission.warnings ?? []).find((warning) => warning.startsWith("hook fallback [copilot]"));
    expect(fallback).toBeDefined();
    expect(fallback).toContain("injected as additionalContext");
    expect(fallback).toContain("docs.github.com hooks reference, 2026-09-17");
    expect(fallback).not.toMatch(/manually|does not inject/);
    // The honest half of the row is unchanged: timeouts still fail open.
    expect(fallback).toContain("fail-open");

    const guarantee = CLIENT_HOOK_GUARANTEES.find((row) => row.tool === "copilot");
    expect(guarantee?.notes).toContain("injected as additionalContext");
    expect(guarantee?.notes).not.toContain("does not inject");
  });

  it("records timeout fail-open honesty in the dialect facts, sourced from CLIENT_HOOK_GUARANTEES", () => {
    const guarantee = CLIENT_HOOK_GUARANTEES.find((row) => row.tool === "copilot");
    expect(guarantee?.failMode).toBe("fail-closed");
    expect(guarantee?.blockingExitCode).toBe(2);

    expect(COPILOT_DIALECT_FACTS.hooksConfigPath).toBe(".github/hooks/stamity.json");
    const cap = COPILOT_DIALECT_FACTS.caps.find((row) => row.name === "hook-enforcement");
    expect(cap?.value).toContain("fail-open");
    expect(cap?.value).toContain("Timeouts always fail-open");
    // Runtime timeout behavior qualifies the native deny guarantee.
    expect(COPILOT_DIALECT_FACTS.caps.find((row) => row.name === "deny-gate")?.value).toContain(
      "timeouts fail-open",
    );
  });

  it("carries an access date on every platform citation, all from one currency pass", () => {
    expect(COPILOT_DIALECT_FACTS.citations.length).toBeGreaterThan(0);
    for (const citation of COPILOT_DIALECT_FACTS.citations) {
      expect(citation.url).toMatch(/^https:\/\/(docs\.github\.com|code\.visualstudio\.com)\//);
      expect(citation.accessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    // TEST CHANGE (audit HOOK-2, HOOK-4): the pin read "one date covers the
    // list". The 2026-09-17 audit re-read exactly one of these pages — the
    // hooks reference, which is where the sessionStart `additionalContext`
    // claim and the entry-key vocabulary come from — so the constant SPLITS
    // rather than being re-stamped whole, which is the behaviour the original
    // comment already prescribed for a partial pass.
    // TEST CHANGE, justified (2026-10-14, e8-copilot-codex-claude-pins): the hooks reference was
    // re-read whole on 2026-10-14 for the camelCase event names and the `bash` key the hooks file
    // took that day (REQ-FLOW-086), every other claim its comment names re-checked with them, so
    // its one date moves; the custom-agents page keeps the list's 2026-09-10 stamp.
    expect(
      COPILOT_DIALECT_FACTS.citations.find((citation) => citation.url.includes("hooks-reference"))
        ?.accessDate,
    ).toBe("2026-10-14");
    const dates = new Set(COPILOT_DIALECT_FACTS.citations.map((citation) => citation.accessDate));
    expect(dates.has("2026-09-10")).toBe(true);
    for (const date of dates) expect(date >= "2026-08-17", date).toBe(true);

    // Every surface this adapter emits for has a page behind it.
    const urls = COPILOT_DIALECT_FACTS.citations.map((citation) => citation.url).join(" ");
    expect(urls).toContain("custom-agents-configuration");
    expect(urls).toContain("prompt-files");
    expect(urls).toContain("add-repository-instructions-in-your-ide");
    expect(urls).toContain("customize-the-agent-environment");

    // The CLI command reference joined the list on 2026-10-10 (unit q6c-copilot-effort-key): the
    // effort scale, the fallback for a level a model does not offer, and the
    // `--no-custom-instructions` flag's priority are read from it, under its own date.
    expect(
      COPILOT_DIALECT_FACTS.citations.find((citation) =>
        citation.url.endsWith("/copilot-cli-reference/cli-command-reference"),
      )?.accessDate,
    ).toBe("2026-10-10");
  });

  it("declares the command surface and the effort key as capability rows", () => {
    expect(capOf("command-surface")).toContain(".github/prompts/");
    expect(capOf("command-surface")).toContain("/st-<id>");
    // REQ-FLOW-026 (sw17): the double listing beside the shared touchpoint skills is declared,
    // with what the live check measured about the explicit-invocation key.
    expect(capOf("command-surface")).toContain("`.agents/skills/`");
    expect(capOf("command-surface")).toContain("list twice");
    expect(capOf("command-surface")).toContain("out of the model's own skills list");
    // TEST CHANGE, justified (2026-10-10, q6c-copilot-effort-key): the pin read "not emitted",
    // while the engine left the client's `reasoning-effort` key unwritten. It writes the key now
    // (REQ-LADDER-004), so the row opens "emitted" on the key and its scale, and never claims the
    // cloud agent honours it; `test/emit/capabilityMatrix.test.ts` holds the row's whole text.
    const effortAxis = capOf("effort-axis");
    expect(effortAxis).toMatch(/^emitted — `reasoning-effort: <level>` per agent, on the scale `low` … `max` /);
    expect(effortAxis).toContain("the cloud agent's handling of the key is undocumented");
    expect(effortAxis).not.toContain("does not write it");
    expect(COPILOT_DIALECT_FACTS.agentsFormat).toContain("`reasoning-effort:`");
    expect(COPILOT_DIALECT_FACTS.agentsFormat).toContain("model:");
    expect(COPILOT_DIALECT_FACTS.ruleShape).toContain("patterns comma-separated");
    // A live run on 1.0.89 has loaded an agent carrying the key (QA row 2 of 2026-10-10_next-tier).
    expect(effortAxis).toContain("a live run on Copilot CLI 1.0.89 (2026-10-11) loaded an agent carrying");
    expect(effortAxis).toContain("on the `records` branch");

    // Both rows reach the published matrix verbatim — a declaration nothing
    // renders is a claim only this file can read.
    const matrix = renderCapabilityMatrix();
    expect(matrix).toContain(capOf("command-surface"));
    expect(matrix).toContain(capOf("effort-axis"));
    expect(matrix).toContain(COPILOT_DIALECT_FACTS.agentsFormat);
  });

  it("declares the sub-agent instructions key with its evidence and its limits (REQ-FLOW-071)", () => {
    const row = capOf("sub-agent-instructions");
    expect(row).toBeDefined();
    expect(row).toMatch(/^emitted — /);
    expect(row).toContain("`include-custom-instructions: true` on every agent");
    // The first live check showed the gap; a second live run with the key showed its effect.
    // TEST CHANGE, justified (2026-10-14, e8-copilot-codex-claude-pins; ledger row
    // 2026-10-14_cli-native/build/38): the comment read "the live check only shows the gap", while
    // QA row 2 of run 2026-10-10_next-tier ran an agent carrying the key on 1.0.89 and its
    // sub-agent quoted the charter. The row now names that run; the earlier claims stay pinned.
    expect(row).toContain("Copilot CLI changelog 1.0.86");
    expect(row).toContain("1.0.89 loader's frontmatter keys");
    expect(row).toContain("live sub-agent check on Copilot CLI 1.0.89 (2026-10-10)");
    expect(row).toContain("loads no `AGENTS.md`");
    expect(row).toContain(
      "a live run on 1.0.89 (2026-10-11) with the key emitted loaded it: the sub-agent quoted the charter's version line",
    );
    // TEST CHANGE, justified (fix round 1, review/111): the cite read the bare path, which main does
    // not carry; it now says the record lives on the `records` branch.
    expect(row).toContain("`.stamity/runs/2026-10-10_next-tier/record.md` on the `records` branch, QA row 2");
    // TEST CHANGE, justified (2026-10-10, q6c-copilot-effort-key; ledger rows review/21 and
    // review/23): the pin read "`--no-custom-instructions` still overrides it", a clause with no
    // source and no mark. The clause now names the page it was read from, which the citation
    // list carries, and says no live run on 1.0.89 passed the flag.
    expect(row).toContain(
      "`--no-custom-instructions` overrides it (Copilot CLI command reference, accessed 2026-10-10; " +
        "unverified on 1.0.89, where no live run passed the flag)",
    );
    expect(row).not.toContain("still overrides it");
    // Never a claim that the cloud agent honours the key.
    expect(row).toContain("the cloud agent's handling of the key is undocumented");
    expect(row).toContain("custom-agents configuration page, accessed 2026-10-10");

    // Dated inline: the all-or-nothing citation stamp is not re-stamped by one claim.
    expect(
      COPILOT_DIALECT_FACTS.citations.find((citation) =>
        citation.url.includes("custom-agents-configuration"),
      )?.accessDate,
    ).toBe("2026-09-10");

    expect(renderCapabilityMatrix()).toContain(row);
  });

  it("declares the model pick, and that the cloud agent's picker decides the cloud model (REQ-LADDER-007)", () => {
    const pick = capOf("model-pick");
    expect(pick).toMatch(/^emitted — /);
    expect(pick).toContain("`models: [<id>, …]` per agent");
    expect(pick).toContain("`<name> (copilot)`");
    expect(pick).toContain("No `modelPolicy` is written");
    // review/109: the `models` behaviour is the reference's claim, not a measured one.
    expect(pick).toContain("no live run has loaded an agent carrying `models` or `model`");
    // review/110: whether VS Code reads `model:` on these agents is unverified.
    expect(pick).toContain("unverified");
    expect(pick).toContain("`target: github-copilot`");
    expect(pick).not.toContain("form VS Code reads");
    expect(pick).toContain(".stamity/generated/models/copilot.json");
    // The CLI reference's own caveat: under Auto, a sub-agent inherits the session's model.
    expect(pick).toContain("Auto");

    const cloud = capOf("cloud-model");
    expect(cloud).toContain("the task's model picker decides");
    expect(cloud).not.toMatch(/agent file's `models?` (binds|decides)/);

    expect(COPILOT_DIALECT_FACTS.agentsFormat).toContain("`models:`");
    expect(COPILOT_DIALECT_FACTS.agentsFormat).not.toContain("only under an operator pin");
    expect(COPILOT_DIALECT_FACTS.agentsFormat).toContain("unverified");
    // review/113: the shipped first entry only when no list was read, and nothing when the list
    // holds no candidate.
    expect(COPILOT_DIALECT_FACTS.agentsFormat).not.toContain("else the shipped list —");
    expect(COPILOT_DIALECT_FACTS.agentsFormat).toContain("only when no list was read");
    expect(COPILOT_DIALECT_FACTS.agentsFormat).toContain(
      "a saved list holding none of the class's candidates writes neither key",
    );
    expect(pick).toContain("whenever the class resolves");
    const urls = COPILOT_DIALECT_FACTS.citations.map((citation) => citation.url);
    expect(urls).toContain("https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/changing-the-ai-model");
    expect(urls).toContain("https://code.visualstudio.com/docs/agent-customization/custom-agents");

    const matrix = renderCapabilityMatrix();
    expect(matrix).toContain(pick);
    expect(matrix).toContain(cloud);
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


/**
 * The delivery option on this client: an instructions file with no `applyTo`
 * globs attaches to EVERY file (`applyTo: "**"`), so a glob-less rule is
 * always-on here too — and those are exactly the ones `on-demand` moves into
 * the `.agents/skills/` tree this client reads directly.
 */
describe("copilot under ruleDelivery: on-demand", () => {
  const GLOBLESS = ["question-protocol", "ai-evals"] as const;

  it("writes no instructions file for a glob-less rule, and the core projects it as a skill", async () => {
    const composed = await planComposed({ ruleDelivery: "on-demand" });
    const paths = new Set(pathsOf(composed));

    for (const id of GLOBLESS) {
      expect(paths.has(`.github/instructions/stamity-${id}.instructions.md`), id).toBe(false);
      expect(paths.has(`.agents/skills/stamity-${id}/SKILL.md`), id).toBe(true);
    }
  });

  it("keeps every glob-scoped rule as an instructions file", async () => {
    const index = await loadCorpusIndex();
    const globbed = index.items
      .filter(
        (item) =>
          item.type === "rule" && !GLOBLESS.includes(item.id as (typeof GLOBLESS)[number]),
      )
      .map((item) => item.id);
    const paths = new Set(pathsOf(await planComposed({ ruleDelivery: "on-demand" })));

    expect(globbed).toHaveLength(CORPUS_RULE_COUNT - GLOBLESS.length);
    for (const id of globbed) {
      expect(paths.has(`.github/instructions/stamity-${id}.instructions.md`), id).toBe(true);
    }
  });

  it("carries the rule's description into the projected skill head", async () => {
    const composed = await planComposed({ ruleDelivery: "on-demand" });
    const row = rowAt(composed, ".agents/skills/stamity-ai-evals/SKILL.md");
    const index = await loadCorpusIndex();
    const rule = index.items.find((item) => item.type === "rule" && item.id === "ai-evals");

    expect(frontmatterValue(row.content, "name")).toBe("stamity-ai-evals");
    expect(row.content).toContain(rule!.description);
    expect(row.content).toContain("delivery: on-demand");
  });

  // FLIPPED 2026-09-15 with the engine default, which moved from `always-on` to
  // `on-demand`. The old assertion — an absent key emits the pre-option file set
  // — was true of the old default and is exactly what would have kept passing on
  // the wrong half of the option. The claim is unchanged in shape: an absent key
  // resolves to one named mode, and both modes are still reachable.
  it("reads an absent ruleDelivery key as on-demand, and always-on restores the instruction files", async () => {
    const defaulted = await planComposed();
    const onDemand = await planComposed({ ruleDelivery: "on-demand" });
    const alwaysOn = await planComposed({ ruleDelivery: "always-on" });

    expect(pathsOf(onDemand)).toEqual(pathsOf(defaulted));
    expect(onDemand.map((row) => row.content)).toEqual(defaulted.map((row) => row.content));

    // The two modes disagree about this rule, so neither half passes by accident.
    expect(
      pathsOf(defaulted).includes(".github/instructions/stamity-ai-evals.instructions.md"),
    ).toBe(false);
    expect(pathsOf(defaulted).some((path) => path.includes("stamity-ai-evals/SKILL.md"))).toBe(true);
    expect(pathsOf(alwaysOn).includes(".github/instructions/stamity-ai-evals.instructions.md")).toBe(
      true,
    );
    expect(pathsOf(alwaysOn).some((path) => path.includes("stamity-ai-evals/SKILL.md"))).toBe(false);
  });
});

// TEST CHANGE, justified (v16-manifest-plugin-block, REQ-PLUGIN-014): the case comparing copilot's
// residue under a held `plugin` block with the residue without one left. The block is dropped
// on read, so no manifest the adapter sees carries it; `test/cli/commands/syncEngine.test.ts`
// pins that a block on disk moves no emitted byte, for all four clients.
