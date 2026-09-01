import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CODEX_AGENTS_DIR,
  CODEX_AGENTS_MD_BUDGET_BYTES,
  CODEX_COMMANDS_DIR,
  CODEX_CONFIG_FILE,
  CODEX_HOOKS_FILE,
  buildAgentToml,
  buildHooksJson,
  codexResiduePlanner,
  composeConfigToml,
  downConvertRules,
} from "../../src/adapters/codex.ts";
import { buildContentIndex, type CatalogItem } from "../../src/content/catalog.ts";
import { resolveBundledContentRoot } from "../../src/content/contentRoot.ts";
import {
  buildCoreEmissionPlan,
  composeEmissionPlanner,
  type CoreEmissionPlan,
  type EmissionContext,
} from "../../src/emit/planner.ts";
import type { CoreHooksPlan, PlannedHookScript } from "../../src/emit/hooksInfra.ts";
import { CLAUDE_EVENT_NAMES, type HookInterchange } from "../../src/hooks/model.ts";
import { buildPreToolUseGuardScript } from "../../src/hooks/scripts.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import { emitCodexToml } from "../../src/mcp/emit.ts";
import { resolveAgentGrant, type ResolvedAgentGrant } from "../../src/roster/agentGrants.ts";
import { toCodexToolsFrontmatter } from "../../src/tools/translator.ts";
import { outputOwners, type AdapterOutput, type RulePrecedence } from "../../src/types/content.ts";
import type { Tool } from "../../src/types/core.ts";
import type { PackageEntry } from "../../src/types/detect.ts";
import { EngineError } from "../../src/types/errors.ts";
import { STATE_DIR } from "../../src/types/markers.ts";
import type { McpConfig, ModelConfig } from "../../src/types/manifest.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The codex residue planner: hook config in the interchange shape with
 * trust-by-hash, TOML subagents carrying the ladder's allocation and the shared
 * grant resolver's verdict, the single-writer `config.toml`, and the lossy glob
 * down-conversion with its risk-ordered 32 KiB budget.
 *
 * Emission-level cases run through the REAL composer over a fixture corpus in
 * a temp directory, because the two contracts that matter across units — the
 * shared-path replacement for the root charter and single-writer-per-path —
 * only exist there. Shaping and anchoring run against synthetic catalog items,
 * which is the only practical way to build an over-budget appendix; the
 * risk-ordering cases run BOTH ways, because the defect they close
 * (`security-patterns` dropped on alphabet) was a property of the shipped rule
 * set and a synthetic pair alone would not prove it gone.
 */

const getTemp = useTempDir("adapter-codex");

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

const REVIEWER_FIXTURE = [
  "---",
  "id: reviewer",
  "type: agent",
  'description: "Reviews a change set and returns a verdict."',
  "tags: [review]",
  "capabilities: [read]",
  "model_class: advanced",
  "---",
  "",
  "# reviewer",
  "",
  "Read the diff. Return a verdict.",
  "",
].join("\n");

/** An agent with no roster row — the deny-by-default path. */
const STRAY_FIXTURE = [
  "---",
  "id: stray",
  "type: agent",
  'description: "Unrostered fixture agent."',
  "tags: [review]",
  "---",
  "",
  "# stray",
  "",
  "Body.",
  "",
].join("\n");

/** A touchpoint command, to prove no client-native command surface consumes it. */
const COMMAND_FIXTURE = [
  "---",
  "id: work",
  "type: command",
  'description: "Execute a change end to end."',
  "tags: [orchestration]",
  "---",
  "",
  "# work",
  "",
  "Command body nothing on this client reads.",
  "",
].join("\n");

interface RuleOptions {
  globs?: string[];
  precedence?: RulePrecedence;
  description?: string;
  body?: string;
  tags?: string[];
}

function ruleFixture(id: string, options: RuleOptions & { tools?: readonly string[] } = {}): string {
  return [
    "---",
    `id: ${id}`,
    "type: rule",
    `description: ${JSON.stringify(options.description ?? `fixture rule ${id}`)}`,
    `tags: [${(options.tags ?? ["implementation"]).join(", ")}]`,
    ...(options.precedence === undefined ? [] : [`precedence: ${options.precedence}`]),
    ...(options.globs === undefined ? [] : [`globs: ${JSON.stringify(options.globs)}`]),
    ...(options.tools === undefined ? [] : [`tools: [${options.tools.join(", ")}]`]),
    "---",
    "",
    `# ${id} title`,
    "",
    "## Floor",
    "",
    options.body ?? `Guidance for ${id}.`,
    "",
  ].join("\n");
}

/** Rule ids the fixture corpus ships, with the anchors they should resolve to. */
const RULE_IDS = ["ask-first", "auth-guard", "db-index", "db-queries", "pkg-scoped"] as const;

async function seedCorpus(): Promise<string> {
  const temp = getTemp();
  await temp.seedFiles({
    "corpus/charter/stamity-charter.md": CHARTER_FIXTURE,
    "corpus/agents/stamity-reviewer.md": REVIEWER_FIXTURE,
    "corpus/rules/stamity-db-index.md": ruleFixture("db-index", { globs: ["src/db/**"] }),
    "corpus/rules/stamity-db-queries.md": ruleFixture("db-queries", {
      globs: ["src/db/**", "src/db/query/**"],
    }),
    "corpus/rules/stamity-auth-guard.md": ruleFixture("auth-guard", { globs: ["**/auth/**"] }),
    "corpus/rules/stamity-ask-first.md": ruleFixture("ask-first", {
      description: "Ask before an irreversible action.",
    }),
    "corpus/rules/stamity-pkg-scoped.md": ruleFixture("pkg-scoped", { globs: ["packages/a/**"] }),
  });
  return temp.path("corpus");
}

interface CtxOptions {
  contentRoot: string;
  tools?: Tool[];
  agents?: string[];
  rules?: readonly string[];
  commands?: readonly string[];
  packages?: PackageEntry[];
  mcp?: McpConfig;
  models?: ModelConfig;
  rootDir?: string;
}

function ctxOf(options: CtxOptions): EmissionContext {
  const manifest = createManifest({
    tools: options.tools ?? ["codex"],
    selection: {
      items: {
        agent: options.agents ?? ["reviewer"],
        skill: [],
        rule: [...(options.rules ?? RULE_IDS)],
        command: [...(options.commands ?? [])],
      },
    },
    generatorVersion: ENGINE_VERSION,
    now: FIXED_NOW,
    ...(options.mcp === undefined ? {} : { mcp: options.mcp }),
  });
  return {
    rootDir: options.rootDir ?? getTemp().path("repo"),
    // `models` is a persisted manifest field with no `createManifest` argument
    // (that constructor belongs to the manifest unit); attaching it here is the
    // same shape a repo carries after `stamity config` writes a pin.
    manifest: options.models === undefined ? manifest : { ...manifest, models: options.models },
    engineVersion: ENGINE_VERSION,
    facts: { monorepoPackages: options.packages ?? [] },
    contentRoot: options.contentRoot,
  };
}

const byPath = (rows: readonly AdapterOutput[]): Map<string, AdapterOutput> =>
  new Map(rows.map((row) => [row.path, row]));

const sha256 = (content: string): string =>
  createHash("sha256").update(content, "utf8").digest("hex");

/** A synthetic catalog rule; `frontmatter.globs` is where anchoring reads from. */
function ruleItem(id: string, options: RuleOptions = {}): CatalogItem {
  return {
    type: "rule",
    id,
    filePath: `/corpus/rules/stamity-${id}.md`,
    relativePath: `rules/stamity-${id}.md`,
    description: options.description ?? `fixture rule ${id}`,
    tags: options.tags ?? ["implementation"],
    ...(options.precedence === undefined ? {} : { precedence: options.precedence }),
    body: `\n# ${id} title\n\n## Floor\n\n${options.body ?? `Guidance for ${id}.`}\n`,
    frontmatter: {
      id,
      ...(options.globs === undefined ? {} : { globs: options.globs }),
    },
  };
}

/** The shipped rule corpus, as emission reads it. */
async function shippedRules(): Promise<CatalogItem[]> {
  const index = await buildContentIndex();
  return index.items.filter((item) => item.type === "rule");
}

/** The globs a rule declares, in the array-or-legacy-string shapes anchoring parses. */
function readDeclaredGlobs(item: CatalogItem): string[] {
  const declared = item.frontmatter.globs;
  const raw = Array.isArray(declared) ? declared : typeof declared === "string" ? declared.split(",") : [];
  return raw.filter((value): value is string => typeof value === "string").map((value) => value.trim());
}

/** A corpus agent item at the given class; the id keeps it on a roster row. */
function agentItem(modelClass: string, id = "reviewer"): CatalogItem {
  return {
    type: "agent",
    id,
    filePath: `/corpus/agents/stamity-${id}.md`,
    relativePath: `agents/stamity-${id}.md`,
    description: "Reviews a change set and returns a verdict.",
    tags: ["review"],
    body: "\n# reviewer\n\nRead the diff.\n",
    frontmatter: { id, model_class: modelClass },
  };
}

/**
 * A pack-supplied agent: no roster row, a `capabilities:` list of its own, and
 * its supplier's disclosed footprint stamped on the item the way the installed
 * pack projection stamps it.
 */
function packAgentItem(capabilities: string[], declaredTools: string[] = []): CatalogItem {
  return {
    type: "agent",
    id: "release",
    filePath: "/packs/ops/agents/stamity-release.md",
    relativePath: "agents/stamity-release.md",
    description: "Cuts a release.",
    tags: ["devops"],
    body: "Body.",
    frontmatter: { id: "release", capabilities },
    provenance: { pack: "ops", declaredTools },
  };
}

/** The grant the shared resolver answers for one item, with no pack footprint. */
function grantOf(item: CatalogItem): ResolvedAgentGrant {
  return resolveAgentGrant({ runtimeId: `stamity-${item.id}`, frontmatter: item.frontmatter });
}

/** The value a TOML document assigns to `key`, or undefined when the key is absent. */
function tomlValue(document: string, key: string): string | undefined {
  const prefix = `${key} = `;
  return document
    .split("\n")
    .find((line) => line.startsWith(prefix))
    ?.slice(prefix.length);
}

/** A charter body sized so the appendix under it cannot fit whole. */
function charterHead(bytes: number): string {
  return `# Charter\n\n${"c".repeat(bytes)}\n`;
}

/** A rule big enough that two of them overflow the budget together. */
function bulkyRule(id: string, options: RuleOptions = {}): CatalogItem {
  return ruleItem(id, { ...options, body: "x".repeat(12_000) });
}

// ── 1. Hook configuration ────────────────────────────────────────

describe("hooks.json — interchange shape plus trust-by-hash", () => {
  it("renames canonical events to the interchange's PascalCase names, keeping exec-form argv", async () => {
    const ctx = ctxOf({ contentRoot: await seedCorpus() });
    const core = await buildCoreEmissionPlan(ctx);

    const document = JSON.parse(buildHooksJson(core)) as {
      hooks: Record<string, { matcher?: string; hooks: { type: string; command: string[] }[] }[]>;
      stamity: Record<string, unknown>;
    };

    // Canonical order, canonical spelling: every key is a CLAUDE_EVENT_NAMES value.
    expect(Object.keys(document.hooks)).toEqual(["SessionStart", "PreToolUse"]);
    for (const event of Object.keys(document.hooks)) {
      expect(Object.values(CLAUDE_EVENT_NAMES)).toContain(event);
    }

    // The two session-start scripts share one matcher-less group; the guard is its own event.
    expect(document.hooks.SessionStart).toHaveLength(1);
    expect(document.hooks.SessionStart![0]!.hooks).toHaveLength(2);
    expect(document.hooks.PreToolUse![0]!.hooks).toHaveLength(1);

    for (const groups of Object.values(document.hooks)) {
      for (const entry of groups.flatMap((group) => group.hooks)) {
        expect(entry.type).toBe("command");
        // argv, never a shell line — the trust posture the core plan states.
        expect(Array.isArray(entry.command)).toBe(true);
        expect(entry.command[0]).toBe("node");
      }
    }

    // Guarantee honesty travels with the configuration it governs.
    expect(document.stamity).toMatchObject({
      interchange: "claude-shape",
      failMode: "fail-closed",
      blockingExitCode: 2,
    });
    expect(String(document.stamity.guarantee)).toContain("exit-2");
  });

  it("carries a sha256 over the exact script bytes the same plan emits, for every codex script", async () => {
    const ctx = ctxOf({ contentRoot: await seedCorpus() });
    const core = await buildCoreEmissionPlan(ctx);

    const document = JSON.parse(buildHooksJson(core)) as {
      hooks: Record<string, { hooks: { command: string[]; sha256?: string }[] }[]>;
    };
    const entries = Object.values(document.hooks).flatMap((groups) =>
      groups.flatMap((group) => group.hooks),
    );
    expect(entries).toHaveLength(3);

    for (const entry of entries) {
      const script = core.hooks.scripts.find(
        (planned) => planned.tool === "codex" && planned.path === entry.command[1],
      );
      expect(script, entry.command[1]).toBeDefined();
      // Recomputed here from the plan's own bytes: a digest taken from anything
      // else would pin a file this run is not writing.
      expect(entry.sha256).toBe(sha256(script!.content));
    }

    // Exactly the scripts the core planned FOR THIS TOOL — no more, and none
    // missing. A digest for another client's copy would vouch for bytes this
    // configuration never runs.
    const digested = entries.map((entry) => entry.command[1]).toSorted();
    const plannedForCodex = core.hooks.scripts
      .filter((script) => script.tool === "codex")
      .map((script) => script.path)
      .toSorted();
    expect(digested).toEqual(plannedForCodex);
  });

  it("locates the digest by argv scan, so a command that grows a flag keeps its trust hash", () => {
    const script = guardFor("../../agent-tool-policies.json");
    const document = JSON.parse(
      buildHooksJson(
        coreWithHooks(
          hooksPlan(
            [script],
            [
              {
                event: "pre_tool_use",
                command: ["node", "--enable-source-maps", script.path, "--strict"],
              },
            ],
          ),
        ),
      ),
    ) as { hooks: Record<string, { hooks: { sha256?: string }[] }[]> };

    // Trust must not hang on the interpreter-then-script argv SHAPE the core
    // builds today: a digest that vanished when a flag appeared would leave the
    // hook running with nothing vouching for its bytes, and would do it without
    // a diagnostic.
    expect(document.hooks.PreToolUse![0]!.hooks[0]!.sha256).toBe(sha256(script.content));
  });

  it("re-hashes when the guard's baked policy path changes, and leaves user hooks unhashed", () => {
    const userRow: HookInterchange = { event: "stop", command: ["./scripts/notify.sh"] };

    const digestFor = (policiesJsonPath: string): string => {
      const script = guardFor(policiesJsonPath);
      const document = JSON.parse(
        buildHooksJson(
          coreWithHooks(hooksPlan([script], [{ event: "pre_tool_use", command: ["node", script.path] }, userRow])),
        ),
      ) as { hooks: Record<string, { hooks: { command: string[]; sha256?: string }[] }[]> };

      const stop = document.hooks.Stop![0]!.hooks[0]!;
      // A user hook is wired verbatim and vouched for by nobody: no digest.
      expect(stop.command).toEqual(["./scripts/notify.sh"]);
      expect(stop.sha256).toBeUndefined();

      const guard = document.hooks.PreToolUse![0]!.hooks[0]!;
      expect(guard.sha256).toBe(sha256(script.content));
      return guard.sha256!;
    };

    // Substituting the policy path changes the guard bytes, so the digest must
    // move with them — a stale pin is exactly what trust-by-hash must not allow.
    expect(digestFor("../../agent-tool-policies.json")).not.toBe(
      digestFor("../../elsewhere/agent-tool-policies.json"),
    );
  });
});

/** The guard script as the core plan places it for codex, for a given policy path. */
function guardFor(policiesJsonPath: string): PlannedHookScript {
  return {
    path: ".stamity/generated/hooks/codex/stamity-pre-tool-use-guard.mjs",
    content: buildPreToolUseGuardScript({ policiesJsonPath, failMode: "fail-closed" }),
    tool: "codex",
  };
}

/** A hooks plan carrying just the rows a hook-config test needs. */
function hooksPlan(scripts: PlannedHookScript[], rows: HookInterchange[]): CoreHooksPlan {
  return {
    scripts,
    policyDocument: {
      path: ".stamity/generated/agent-tool-policies.json",
      content: "{}\n",
      owners: ["codex"],
    },
    interchangeFor: () => rows,
    warnings: [],
  };
}

/**
 * A core plan whose only meaningful half is its hooks.
 *
 * No `plugin` member: the Agent Plugins container is gone (a maintainer ruling
 * of 2026-08-16 — skills emit to each client's native location instead), so
 * `CoreEmissionPlan` carries no such field and this fixture must not name the
 * `.agents/plugins/…` path it used to pin.
 */
function coreWithHooks(hooks: CoreHooksPlan): CoreEmissionPlan {
  return {
    agentsMd: { root: { content: "", byteLength: 0, lineCount: 0 }, nestedFor: () => [] },
    skills: [],
    hooks,
    // No installed packs in this fixture, so the composed config resolves its
    // ids against the curated catalog alone.
    packMcpServers: [],
    mcpFor: () => [],
  };
}

// ── 2. Subagent definitions ──────────────────────────────────────

describe("subagent TOML", () => {
  const reviewerItem = agentItem("advanced");

  it("emits the documented key set with the read-only grant, byte for byte", () => {
    const grant = resolveAgentGrant({
      runtimeId: "stamity-reviewer",
      frontmatter: reviewerItem.frontmatter,
    });
    expect(grant.source).toBe("roster");
    // The tool NAMES come from the client dialect table (src/tools/translator.ts),
    // which owns that vocabulary — the golden asserts the line's shape and its
    // value's provenance rather than restating a table this unit does not own.
    const toolsValue = toCodexToolsFrontmatter(grant.allow);
    expect(toolsValue).toContain("Read");

    expect(buildAgentToml(reviewerItem, grant)).toBe(
      [
        '# stamity — Codex subagent "stamity-reviewer". Generated file: regenerate rather than',
        "# editing it; local edits are overwritten.",
        "#",
        "# Key set: learn.chatgpt.com/docs/agent-configuration/subagents (accessed 2026-08-17).",
        "# PROVISIONAL — Codex documents no per-agent tool allowlist, so `tools` carries the",
        "# placeholder comma-list dialect and `sandbox_mode` is the primitive that binds.",
        "",
        'name = "stamity-reviewer"',
        'description = "Reviews a change set and returns a verdict."',
        `tools = "${toolsValue}"`,
        'sandbox_mode = "read-only"',
        'model_reasoning_effort = "high"',
        'developer_instructions = """',
        "# reviewer",
        "",
        "Read the diff.",
        '"""',
        "",
      ].join("\n"),
    );
  });

  it("widens sandbox_mode only for a grant that changes the workspace", () => {
    const implementer = agentItem("advanced", "implementer");
    const toml = buildAgentToml(implementer, grantOf(implementer));
    expect(toml).toContain('sandbox_mode = "workspace-write"');
    expect(toml).toContain('name = "stamity-implementer"');
  });

  it("denies by default for an agent with no resolvable grant and says so in the file", () => {
    const stray = { ...reviewerItem, id: "stray", frontmatter: {} };
    const grant = grantOf(stray);
    expect(grant.source).toBe("none");

    const toml = buildAgentToml(stray, grant);
    expect(toml).toContain('tools = ""');
    expect(toml).toContain('sandbox_mode = "read-only"');
    // "No resolvable grant", not "no policy row": a pack agent legitimately has
    // no roster row and still resolves one from its own capabilities.
    expect(toml).toContain("No resolvable grant");
    expect(toml).not.toContain("No policy row");
    // An unknown/absent model class omits both allocation keys rather than guessing.
    expect(toml).not.toContain("model_reasoning_effort");
    expect(toml).not.toContain("\nmodel = ");
  });

  it("keeps the scannable keys above the body, with developer_instructions last", () => {
    const pinned = buildAgentToml(reviewerItem, grantOf(reviewerItem), reviewerItem.body, {
      pins: { advanced: "gpt-fixture-pro" },
    });
    const keyOrder = pinned
      .split("\n")
      .filter((line) => /^[a-z_]+ = /.test(line))
      .map((line) => line.slice(0, line.indexOf(" ")));

    // Fixed by construction, so two builds of one agent are byte-identical.
    expect(keyOrder).toEqual([
      "name",
      "description",
      "tools",
      "sandbox_mode",
      "model",
      "model_reasoning_effort",
      "developer_instructions",
    ]);
  });

  it("emits one file per selected agent through the planner, named by runtime id", async () => {
    const contentRoot = await seedCorpus();
    await getTemp().seedFiles({ "corpus/agents/stamity-stray.md": STRAY_FIXTURE });
    const ctx = ctxOf({ contentRoot, agents: ["reviewer", "stray"] });

    const rows = byPath((await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs);

    const reviewer = rows.get(`${CODEX_AGENTS_DIR}/stamity-reviewer.toml`);
    expect(reviewer?.owner).toEqual({
      adapter: "codex",
      artifactId: "reviewer",
      artifactType: "agent",
    });
    expect(reviewer?.content).toContain("Read the diff. Return a verdict.");
    expect(rows.has(`${CODEX_AGENTS_DIR}/stamity-stray.toml`)).toBe(true);
  });

  it("drops a deselected agent", async () => {
    const contentRoot = await seedCorpus();
    const ctx = ctxOf({ contentRoot, agents: [] });

    const rows = byPath((await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs);
    expect([...rows.keys()].some((path) => path.startsWith(CODEX_AGENTS_DIR))).toBe(false);
  });
});

// ── 2b. Model pin + effort, both from the ladder ─────────────────

describe("model allocation", () => {
  /**
   * The effort table this adapter used to own, kept here as the BASELINE the
   * ladder must reproduce. Deleting the local table was meant to be a swap of
   * source, not a change of output, and this is the only way to prove that once
   * the table is gone.
   */
  const RETIRED_LOCAL_TABLE: Record<string, string> = {
    advanced: "high",
    standard: "medium",
    economy: "low",
  };

  it.each(Object.entries(RETIRED_LOCAL_TABLE))(
    "resolves %s through the ladder to the same effort the retired local table emitted",
    (modelClass, effort) => {
      expect(tomlValue(buildAgentToml(agentItem(modelClass), grantOf(agentItem(modelClass))), "model_reasoning_effort")).toBe(
        `"${effort}"`,
      );
    },
  );

  it("lets an operator effort override beat the class default", () => {
    const toml = buildAgentToml(agentItem("advanced"), grantOf(agentItem("advanced")), "Body.", {
      efforts: { advanced: "low" },
    });
    expect(tomlValue(toml, "model_reasoning_effort")).toBe('"low"');
  });

  it("emits the client's model key with the operator's pinned id", () => {
    const toml = buildAgentToml(agentItem("advanced"), grantOf(agentItem("advanced")), "Body.", {
      pins: { advanced: "gpt-fixture-pro" },
    });
    // Verified key name: `model`, alongside `model_reasoning_effort` and
    // `sandbox_mode` (learn.chatgpt.com/docs/agent-configuration/subagents,
    // accessed 2026-08-17).
    expect(tomlValue(toml, "model")).toBe('"gpt-fixture-pro"');
    // The pin covers one class only; a different class stays unpinned.
    expect(buildAgentToml(agentItem("standard"), grantOf(agentItem("standard")), "Body.", {
      pins: { advanced: "gpt-fixture-pro" },
    })).not.toContain("\nmodel = ");
  });

  it("omits the model key entirely with no pin, because this client publishes no class aliases", () => {
    const toml = buildAgentToml(agentItem("advanced"), grantOf(agentItem("advanced")));
    expect(toml).not.toContain("\nmodel = ");
    // Silence, not a re-declared default: an absent key leaves the choice to the
    // client, where a literal would be a sizing decision the engine invented.
    expect(toml).toContain('model_reasoning_effort = "high"');
  });

  it("omits both keys for a class the ladder does not assign", () => {
    const toml = buildAgentToml(agentItem("turbo"), grantOf(agentItem("turbo")), "Body.", {
      pins: { advanced: "gpt-fixture-pro" },
      efforts: { advanced: "low" },
    });
    expect(toml).not.toContain("\nmodel = ");
    expect(toml).not.toContain("model_reasoning_effort");
  });

  it("carries the operator's pins and efforts from the manifest through the planner", async () => {
    const contentRoot = await seedCorpus();
    const models: ModelConfig = {
      pins: { advanced: "gpt-fixture-pro" },
      effort: { advanced: "low" },
    };
    const ctx = ctxOf({ contentRoot, models });

    const rows = byPath((await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs);
    const reviewer = rows.get(`${CODEX_AGENTS_DIR}/stamity-reviewer.toml`)!.content;

    expect(reviewer).toContain('model = "gpt-fixture-pro"');
    expect(reviewer).toContain('model_reasoning_effort = "low"');
  });
});

// ── 2c. Grants: roster, pack, and the deny-by-default floor ──────

describe("grants reach this client through the shared resolver", () => {
  it("gives a pack agent a real grant and a writable sandbox when its pack disclosed one", () => {
    const item = packAgentItem(["read", "edit", "execute"]);
    const grant = resolveAgentGrant({
      runtimeId: "stamity-release",
      frontmatter: item.frontmatter,
      declaredTools: ["read", "edit", "execute"],
    });
    expect(grant.source).toBe("frontmatter");

    const toml = buildAgentToml(item, grant);
    expect(toml).not.toContain('tools = ""');
    expect(toml).toContain('sandbox_mode = "workspace-write"');
    // A real grant is not the no-grant path: the refusal block must not appear.
    expect(toml).not.toContain("No resolvable grant");
  });

  it("takes the intersection, never the pack's declaration alone", () => {
    const item = packAgentItem(["read", "edit", "execute"]);
    // The operator accepted a read-only footprint at install; the agent asks for
    // more. Widening here would grant privilege the install preview never showed.
    const grant = resolveAgentGrant({
      runtimeId: "stamity-release",
      frontmatter: item.frontmatter,
      declaredTools: ["read"],
    });

    const toml = buildAgentToml(item, grant);
    expect(toml).toContain('sandbox_mode = "read-only"');
    expect(toml).toContain("Read");
  });

  it("stays read-only for a pack agent whose footprint never arrived", () => {
    const item = packAgentItem(["read", "edit"]);
    // No footprint is the caller-defect branch, and it resolves DOWN: an
    // unbounded frontmatter grant is exactly what the ceiling exists to refuse.
    const grant = resolveAgentGrant({ runtimeId: "stamity-release", frontmatter: item.frontmatter });
    expect(grant.source).toBe("none");

    const toml = buildAgentToml(item, grant);
    expect(toml).toContain('tools = ""');
    expect(toml).toContain('sandbox_mode = "read-only"');
    expect(toml).toContain("No resolvable grant");
  });

  it("refuses to widen the sandbox for a category outside the grantable six", () => {
    const item = packAgentItem([]);
    // `git` is a declared-but-reserved category: it is in the taxonomy, is not
    // grantable, and collapses to nothing in the client dialect. A sandbox
    // decision that asked "is this not read-only?" would widen on it; asking
    // "does it hold a mutating grant?" narrows, which is the required direction.
    const grant: ResolvedAgentGrant = {
      runtimeId: "stamity-release",
      allow: ["git"] as unknown as ResolvedAgentGrant["allow"],
      source: "frontmatter",
      diagnostics: [],
    };

    const toml = buildAgentToml(item, grant);
    expect(toml).toContain('sandbox_mode = "read-only"');
    expect(toml).toContain('tools = ""');
  });

  it("emits the three specialists read-only, at the effort their declared class asks for", async () => {
    const index = await buildContentIndex();
    const specialists = ["security", "design-quality", "performance"];
    const effortByClass: Record<string, string> = { advanced: "high", standard: "medium" };

    for (const id of specialists) {
      const item = index.items.find((entry) => entry.type === "agent" && entry.id === id);
      expect(item, id).toBeDefined();

      const grant = resolveAgentGrant({
        runtimeId: `stamity-${id}`,
        frontmatter: item!.frontmatter,
      });
      expect(grant.source, id).toBe("roster");

      const toml = buildAgentToml(item!, grant);
      // A reviewing specialist that could edit would answer its own finding in
      // the next round; read-only is the whole point of the role.
      expect(toml, id).toContain('sandbox_mode = "read-only"');
      const declaredClass = String(item!.frontmatter.model_class);
      expect(toml, id).toContain(`model_reasoning_effort = "${effortByClass[declaredClass]}"`);
    }
  });

  it("plans the three specialists as read-only .codex/agents rows", async () => {
    const temp = getTemp();
    const index = await buildContentIndex();
    const seeds: Record<string, string> = { "corpus/charter/stamity-charter.md": CHARTER_FIXTURE };
    for (const id of ["security", "design-quality", "performance"]) {
      const item = index.items.find((entry) => entry.type === "agent" && entry.id === id)!;
      seeds[`corpus/agents/stamity-${id}.md`] = [
        "---",
        `id: ${id}`,
        "type: agent",
        `description: ${JSON.stringify(item.description)}`,
        "tags: [review]",
        `capabilities: ${JSON.stringify(item.frontmatter.capabilities)}`,
        `model_class: ${String(item.frontmatter.model_class)}`,
        "---",
        "",
        "Specialist body.",
        "",
      ].join("\n");
    }
    await temp.seedFiles(seeds);

    const ctx = ctxOf({
      contentRoot: temp.path("corpus"),
      agents: ["security", "design-quality", "performance"],
      rules: [],
    });
    const rows = byPath((await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs);

    for (const id of ["security", "design-quality", "performance"]) {
      const row = rows.get(`${CODEX_AGENTS_DIR}/stamity-${id}.toml`);
      expect(row, id).toBeDefined();
      expect(row!.content, id).toContain('sandbox_mode = "read-only"');
    }
  });
});

// ── 2d. Command surface ──────────────────────────────────────────

describe("command surface", () => {
  it("declares no project-scoped command directory", () => {
    // Verified 2026-08-17: this client's custom prompts live in the user's Codex
    // home directory and are documented as deprecated in favour of skills, so
    // there is no repo-committed surface to emit into. `null` is the honest
    // answer; an invented `.codex/prompts/` would be a fabricated pin.
    expect(CODEX_COMMANDS_DIR).toBeNull();
  });

  it("records the gap as a dialect cap instead of leaving it to be inferred", () => {
    const cap = codexResiduePlanner.facts.caps.find((row) => row.name === "command-surface");
    expect(cap).toBeDefined();
    expect(cap!.value).toContain("none");
    expect(cap!.value).toContain("home directory");
    expect(cap!.value).toContain("deprecated");

    // The claim carries a citation with an access date, like every other fact.
    expect(codexResiduePlanner.facts.citations.map((row) => row.url)).toContain(
      "https://learn.chatgpt.com/docs/custom-prompts",
    );
    for (const citation of codexResiduePlanner.facts.citations) {
      expect(citation.accessDate, citation.url).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("emits no command rows and keeps command bodies out of the AGENTS.md budget", async () => {
    const temp = getTemp();
    await temp.seedFiles({
      "corpus/charter/stamity-charter.md": CHARTER_FIXTURE,
      "corpus/agents/stamity-reviewer.md": REVIEWER_FIXTURE,
      "corpus/commands/stamity-work.md": COMMAND_FIXTURE,
    });
    const ctx = ctxOf({
      contentRoot: temp.path("corpus"),
      rules: [],
      commands: ["cmd-work"],
    });

    const rows = (await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs;

    // A selected command produces no row anywhere: not a `.codex/` file, and not
    // an appendix section stuffed into the shared charter to fake delivery.
    expect(rows.some((row) => row.path.includes("work"))).toBe(false);
    for (const row of rows) {
      expect(row.content, row.path).not.toContain("Command body nothing on this client reads.");
    }
  });
});

// ── 3. Composed config.toml ──────────────────────────────────────

describe("config.toml — one composed document, one writer", () => {
  it("splices the MCP tables in byte-identically, caveat comment included", async () => {
    const contentRoot = await seedCorpus();
    const servers = ["github", "context7"];
    const ctx = ctxOf({ contentRoot, mcp: { servers } });
    const core = await buildCoreEmissionPlan(ctx);

    const content = composeConfigToml(core, ctx);

    expect(content).toContain(emitCodexToml(servers));
    // The comment names the variables the SHELL must carry, because the file
    // carries no `env` table: Codex expands nothing here, so an env value would
    // be set literally and shadow the inherited credential.
    expect(content).toContain("Codex expands nothing in this file");
    expect(content).not.toContain('GITHUB_PAT = "$GITHUB_PAT"');
    expect(content).toContain("[mcp_servers.github]");
    // One document: the adapter header opens it, the MCP tables close it.
    expect(content.startsWith("# stamity — Codex CLI configuration")).toBe(true);
    expect(content.endsWith("\n")).toBe(true);
  });

  it("still emits the file with zero servers, in the documented empty-map spelling", async () => {
    const contentRoot = await seedCorpus();
    const ctx = ctxOf({ contentRoot });

    const content = composeConfigToml(await buildCoreEmissionPlan(ctx), ctx);
    expect(content).toContain("# No MCP servers selected.\n[mcp_servers]\n");

    // The row is planned too: hooks and subagents reference this path.
    const rows = byPath((await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs);
    expect(rows.get(CODEX_CONFIG_FILE)?.content).toBe(content);
  });

  it("refuses to compose when the core plan also placed a codex MCP document", async () => {
    const contentRoot = await seedCorpus();
    const ctx = ctxOf({ contentRoot, mcp: { servers: ["context7"] } });
    const core = await buildCoreEmissionPlan(ctx);
    const doubled: CoreEmissionPlan = {
      ...core,
      mcpFor: () => [
        { dialect: "codex-toml", path: CODEX_CONFIG_FILE, content: "[mcp_servers]\n" },
      ],
    };

    expect(() => composeConfigToml(doubled, ctx)).toThrow(EngineError);
    expect(() => composeConfigToml(doubled, ctx)).toThrow(/one path takes one writer/);
  });
});

// ── 4. Glob down-conversion ──────────────────────────────────────

describe("glob down-conversion", () => {
  it("anchors a rule at its globs' directory and opens the section with the lossy notice", () => {
    const result = downConvertRules([ruleItem("db-index", { globs: ["src/db/**"] })], "# Charter\n");

    expect(result.nested.map((file) => file.path)).toEqual(["src/db/AGENTS.md"]);
    const content = result.nested[0]!.content;
    expect(content).toContain("`src/db/**`");
    expect(content).toContain("codex#34002");
    expect(content).toContain("Codex cannot scope a rule by glob");
    expect(content).toContain("Guidance for db-index.");
    // Anchored rules leave the root alone.
    expect(result.rootReplacement).toBeNull();
    expect(result.dropped).toEqual([]);
  });

  it("sends an unanchorable glob to the root appendix, appended to the core charter body", () => {
    const charter = "# Test Charter\n\nCharter guidance body.\n";
    const result = downConvertRules([ruleItem("auth-guard", { globs: ["**/auth/**"] })], charter);

    expect(result.nested).toEqual([]);
    const root = result.rootReplacement!;
    expect(root.startsWith(charter)).toBe(true);
    expect(root).toContain("## Conditional rules (Codex down-conversion)");
    expect(root).toContain("### auth-guard");
    expect(root).toContain("`**/auth/**`");
    expect(root).toContain("codex#34002");
  });

  it("merges two rules sharing an anchor into one file, in id codepoint order", () => {
    const result = downConvertRules(
      [
        ruleItem("db-queries", { globs: ["src/db/**", "src/db/query/**"] }),
        ruleItem("db-index", { globs: ["src/db/**"] }),
      ],
      "# Charter\n",
    );

    expect(result.nested).toHaveLength(1);
    const content = result.nested[0]!.content;
    expect(result.nested[0]!.path).toBe("src/db/AGENTS.md");
    expect(content.indexOf("## db-index")).toBeGreaterThan(-1);
    expect(content.indexOf("## db-index")).toBeLessThan(content.indexOf("## db-queries"));
    // Body headings shift under the section heading; the duplicated H1 title goes.
    expect(content).toContain("### Floor");
    expect(content).not.toContain("# db-index title");
  });

  it("routes a rule with no declared globs to the root, naming its description as the trigger", () => {
    const result = downConvertRules(
      [ruleItem("ask-first", { description: "Ask before an irreversible action." })],
      "# Charter\n",
    );

    const root = result.rootReplacement!;
    expect(root).toContain("**Trigger:** Ask before an irreversible action.");
    expect(root).toContain("no description-triggered rule layer");
    expect(result.dropped).toEqual([]);
  });

  it("reroutes an anchor already owned by a core nested charter copy, never doubling the path", () => {
    const result = downConvertRules(
      [ruleItem("pkg-scoped", { globs: ["packages/a/**"] })],
      "# Charter\n",
      ["packages/a/AGENTS.md"],
    );

    expect(result.nested).toEqual([]);
    const root = result.rootReplacement!;
    expect(root).toContain("### pkg-scoped");
    expect(root).toContain("`packages/a/**`");
    expect(root).toContain("workspace-package charter copy with its own writer");
  });
});

// ── 4b. The engine's own state directory is not an anchor ────────

/**
 * A rule ABOUT the state directory used to be inlined INTO it: globs
 * `.stamity/learnings/**` anchored at `.stamity/learnings`, so the planner wrote
 * `.stamity/learnings/AGENTS.md` — a markdown file with no learning frontmatter,
 * inside the directory the validate command, the session banner and the
 * learnings reader all walk as learnings. A fresh four-tool init then failed its
 * own `stamity validate`. The refusal is on the first segment, which is the
 * difference between "this engine's store" and "a directory whose name starts
 * the same way".
 */
describe("state-directory globs anchor nowhere", () => {
  it("routes a rule scoped to the learnings store to the root appendix, writing no file inside it", () => {
    const result = downConvertRules(
      [ruleItem("learnings-schema", { globs: [`${STATE_DIR}/learnings/**`] })],
      "# Charter\n",
    );

    // The whole point: no row addressed into the store. Before the refusal this
    // was `[".stamity/learnings/AGENTS.md"]`.
    expect(result.nested).toEqual([]);
    const root = result.rootReplacement!;
    // Nothing is lost by the reroute — the guidance and its declared scope both
    // land in the file Codex is certain to read.
    expect(root).toContain("### learnings-schema");
    expect(root).toContain(`\`${STATE_DIR}/learnings/**\``);
    expect(root).toContain("Guidance for learnings-schema.");
    expect(result.dropped).toEqual([]);
  });

  it("refuses the state directory through every spelling that normalizes to it", () => {
    for (const glob of [
      `${STATE_DIR}/**`,
      `./${STATE_DIR}/**`,
      `${STATE_DIR}\\learnings\\**`,
      `./${STATE_DIR}/handoffs/*.md`,
    ]) {
      const result = downConvertRules([ruleItem("scoped", { globs: [glob] })], "# Charter\n");
      expect(result.nested, glob).toEqual([]);
      expect(result.rootReplacement, glob).toContain("### scoped");
    }
  });

  it("catches the store by equality on the first segment, not by prefix or by name anywhere", () => {
    // A sibling directory that merely starts with the same string belongs to
    // somebody else and anchors normally — a prefix test would swallow it.
    expect(
      downConvertRules([ruleItem("lookalike", { globs: [`${STATE_DIR}x/**`] })], "# Charter\n")
        .nested.map((file) => file.path),
    ).toEqual([`${STATE_DIR}x/AGENTS.md`]);

    // A nested directory of the same name is not this engine's store either:
    // the store is at the repository root, and only a root-segment match is it.
    expect(
      downConvertRules([ruleItem("nested-name", { globs: [`src/${STATE_DIR}/**`] })], "# Charter\n")
        .nested.map((file) => file.path),
    ).toEqual([`src/${STATE_DIR}/AGENTS.md`]);
  });

  it("takes the whole rule to the root when one of its globs is refused", () => {
    // `src/**` alone would anchor at `src`. Anchoring there while the sibling
    // glob covers the store would silently stop covering half the rule.
    const result = downConvertRules(
      [ruleItem("mixed", { globs: [`${STATE_DIR}/**`, "src/**"] })],
      "# Charter\n",
    );

    expect(result.nested).toEqual([]);
    expect(result.rootReplacement).toContain("### mixed");
  });

  it("writes nothing into the state directory for the shipped rule set", async () => {
    const rules = await shippedRules();
    const stateScoped = rules.filter((rule) =>
      readDeclaredGlobs(rule).some((glob) => glob.startsWith(`${STATE_DIR}/`)),
    );
    // Non-degenerate: the corpus really does ship rules about the store, which
    // is what made this reachable rather than theoretical.
    expect(stateScoped.map((rule) => rule.id)).toEqual(["injection-screening", "learnings-schema"]);

    const result = downConvertRules(rules, "# Charter\n");

    expect(result.nested.filter((file) => file.path.startsWith(`${STATE_DIR}/`))).toEqual([]);
  });

  it("plans no row under the state directory, over the real corpus", async () => {
    const index = await buildContentIndex();
    const ctx = ctxOf({
      contentRoot: resolveBundledContentRoot(),
      rules: index.items.filter((item) => item.type === "rule").map((item) => item.id),
      agents: ["reviewer"],
    });

    const rows = (await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs;

    // The end state the finding was about: a fresh init has no engine-written
    // `AGENTS.md` inside `.stamity/`, so `stamity validate` reads the learnings
    // store and finds only learnings.
    expect(rows.map((row) => row.path).filter((path) => path.startsWith(`${STATE_DIR}/`))).toEqual(
      [],
    );
  });
});

// ── 4c. What the reroute costs the shipped emission ──────────────

/**
 * The reroute above is a placement fix with a delivery price, and the price is
 * only visible over the REAL corpus behind the REAL charter head: the root
 * appendix is already over budget there, so a rule sent to it is not thereby
 * delivered. An assertion that a rule's id appears in the root passes on the
 * id's appearance in the omission LIST, which is the opposite outcome — so
 * these cases split the two states by name and pin both sets exactly.
 *
 * A failure here means the set of rules Codex actually receives changed. That
 * is a real product change, not test drift: re-measure, decide, then edit the
 * expectation. Widening an assertion until it passes would restore exactly the
 * blind spot this block exists to remove.
 */
/** Ids with their own `### id` section, versus ids named only as omitted. */
function deliveredAndOmitted(root: string): { inlined: string[]; omitted: string[] } {
  const notice = root.indexOf(`### Omitted for the ${CODEX_AGENTS_MD_BUDGET_BYTES}-byte budget`);
  const body = notice === -1 ? root : root.slice(0, notice);
  return {
    inlined: [...body.matchAll(/^### (.+)$/gm)].map((match) => match[1]!),
    omitted:
      notice === -1 ? [] : [...root.slice(notice).matchAll(/`([a-z-]+)`/g)].map((m) => m[1]!),
  };
}

describe("the shipped Codex emission, rule by rule", () => {
  async function shippedRoot(): Promise<string> {
    const index = await buildContentIndex();
    const ctx = ctxOf({
      contentRoot: resolveBundledContentRoot(),
      rules: index.items.filter((item) => item.type === "rule").map((item) => item.id),
      agents: ["reviewer"],
    });
    const rows = (await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs;
    const root = rows.find((row) => row.path === "AGENTS.md");
    expect(root, "the root AGENTS.md replacement row").toBeDefined();
    return root!.content;
  }

  it("pins which rules are inlined and which the budget omits", async () => {
    const { inlined, omitted } = deliveredAndOmitted(await shippedRoot());

    // `Verification gates` is an H3 of the charter head, not a rule section.
    expect(inlined).toEqual([
      "Verification gates",
      "ai-evals",
      "api-versioning",
      "injection-screening",
      "secrets",
      "security-patterns",
    ]);
    expect(omitted).toEqual([
      "contract-census",
      "learnings-schema",
      "migrations",
      "question-protocol",
      "resilience",
      "testing",
      "ui-states",
    ]);
  });

  it("records that the rerouted rule itself is delivered nowhere", async () => {
    const root = await shippedRoot();
    const { inlined, omitted } = deliveredAndOmitted(root);

    // The state-directory reroute took `learnings-schema` out of its own
    // `.stamity/learnings/AGENTS.md`, where it was delivered in full, and into a
    // root that has no room for it: it carries no risk flag, so it ranks last
    // under `compareDropOrder` and drops first. Codex now gets its NAME and
    // nothing else. Named, not silent — and not endorsed: the source comment on
    // `anchorOfGlob` carries the measurement, and restoring delivery needs a
    // corpus-side rank (`content/rules/stamity-learnings-schema.md`), which this
    // unit does not own.
    expect(inlined).not.toContain("learnings-schema");
    expect(omitted).toContain("learnings-schema");
    expect(root).not.toContain("### learnings-schema");

    // Collateral, and the part a maintainer has not ruled on: `contract-census`
    // was inlined at the root before the reroute and is evicted by
    // `injection-screening`, which outranks it on `floor:security`.
    expect(inlined).not.toContain("contract-census");
    expect(omitted).toContain("contract-census");
  });

  it("keeps the security-floor rules the eviction is settled in favour of", async () => {
    const { inlined } = deliveredAndOmitted(await shippedRoot());

    // Whatever the ruling on the two losses, these three are what the ordering
    // spent the budget on; a change here means risk ranking itself moved.
    for (const id of ["injection-screening", "secrets", "security-patterns"]) {
      expect(inlined, id).toContain(id);
    }
  });
});

// ── 5. 32 KiB budget shaping, risk-ordered ───────────────────────

describe("32 KiB budget shaping", () => {
  it("drops lowest-precedence sections first, names them in-file, and lands under budget", () => {
    const result = downConvertRules(
      [
        bulkyRule("a-critical", { precedence: "critical" }),
        bulkyRule("b-low", { precedence: "low" }),
        bulkyRule("c-low", { precedence: "low" }),
      ],
      "# Charter\n",
    );

    const root = result.rootReplacement!;
    expect(Buffer.byteLength(root, "utf8")).toBeLessThanOrEqual(CODEX_AGENTS_MD_BUDGET_BYTES);
    // No risk flag anywhere in this set, so precedence decides and the alphabet
    // settles the tie: lowest precedence goes first, last id among equals.
    expect(result.dropped).toEqual(["c-low"]);
    expect(root).toContain(`Omitted for the ${CODEX_AGENTS_MD_BUDGET_BYTES}-byte budget`);
    expect(root).toContain("`c-low`");
    expect(root).toContain("### a-critical");
    expect(root).toContain("### b-low");
    expect(root).not.toContain("### c-low");
  });

  it("holds the budget for a nested file too, independently of the root", () => {
    const result = downConvertRules(
      [
        ruleItem("db-a", { globs: ["src/db/**"], precedence: "high", body: "y".repeat(20_000) }),
        ruleItem("db-b", { globs: ["src/db/**"], precedence: "low", body: "z".repeat(20_000) }),
      ],
      "# Charter\n",
    );

    const nested = result.nested[0]!;
    expect(nested.path).toBe("src/db/AGENTS.md");
    expect(Buffer.byteLength(nested.content, "utf8")).toBeLessThanOrEqual(
      CODEX_AGENTS_MD_BUDGET_BYTES,
    );
    expect(result.dropped).toEqual(["db-b"]);
    expect(nested.content).toContain("`db-b`");
  });

  it("stops at an over-budget charter body, having dropped and named every section it added", () => {
    const charter = `# Charter\n\n${"c".repeat(CODEX_AGENTS_MD_BUDGET_BYTES)}\n`;
    const result = downConvertRules([ruleItem("a-low", { precedence: "low" })], charter);

    // The charter body belongs to the core emission. Shaping drops what THIS
    // adapter appended and then stops rather than trimming another emitter's
    // content, so the overflow is reported instead of hidden — and the loop
    // terminates on an input no amount of dropping can fit.
    expect(result.dropped).toEqual(["a-low"]);
    expect(Buffer.byteLength(result.rootReplacement!, "utf8")).toBeGreaterThan(
      CODEX_AGENTS_MD_BUDGET_BYTES,
    );
    expect(result.rootReplacement).toContain("`a-low`");
    expect(result.rootReplacement).not.toContain("### a-low");
  });

  it("drops nothing and emits no omission notice when the plan is under budget", () => {
    const result = downConvertRules(
      [ruleItem("a-critical", { precedence: "critical" }), ruleItem("b-low", { precedence: "low" })],
      "# Charter\n",
    );

    expect(result.dropped).toEqual([]);
    expect(result.rootReplacement).not.toContain("Omitted for the");
    expect(result.rootReplacement).toContain("### b-low");
  });
});

// ── 5c. The notice states what the shaper actually checked ───────

/**
 * The shaper measures one file; the client measures the concatenation of every
 * instruction file a session loads. The notice used to close on "nothing was
 * trimmed silently", which reads as an all-clear for a total nothing had
 * computed — and this corpus already ships a tree whose files each fit while
 * their sum does not.
 */
describe("the omission notice scopes its claim to the file it shaped", () => {
  const notice = (): string =>
    downConvertRules(
      [bulkyRule("ai-evals", { tags: ["ai"] }), bulkyRule("security-patterns", { tags: ["floor:security"] })],
      charterHead(12_000),
    ).rootReplacement!;

  it("makes no all-clear claim about what was not measured", () => {
    const root = notice();

    expect(root).not.toContain("Nothing was trimmed silently");
    // The scope is stated, not implied: this file, on its own.
    expect(root).toContain("Per-file shaping only — the aggregate is not enforced.");
    expect(root).toContain("Nothing here measures that total");
  });

  it("names the concatenation the client actually caps, and how to measure it", () => {
    const root = notice();

    expect(root).toContain("CONCATENATION a session loads");
    // A gap the reader can close: an executable check, not an advisory.
    expect(root).toContain("`cat AGENTS.md path/to/dir/AGENTS.md | wc -c`");
    expect(root).toContain(String(CODEX_AGENTS_MD_BUDGET_BYTES));
  });

  it("still reports this file's own drops, ordering included", () => {
    const root = notice();

    // Softening the claim must not cost the disclosure that was already right.
    expect(root).toContain(`Omitted for the ${CODEX_AGENTS_MD_BUDGET_BYTES}-byte budget`);
    expect(root).toContain("lowest risk first");
    expect(root).toContain("`ai-evals`");
    expect(root).toContain("Narrow the content selection to bring them back.");
  });
});

// ── 5b. Risk ordering ────────────────────────────────────────────

describe("budget drops are ordered by risk before alphabet", () => {
  it("keeps a security-floor rule and drops the lower-risk one, reversing the alphabetical outcome", () => {
    const result = downConvertRules(
      [
        bulkyRule("ai-evals", { tags: ["ai"] }),
        bulkyRule("security-patterns", { tags: ["implementation", "review", "floor:security"] }),
      ],
      charterHead(12_000),
    );

    // Both rules sit at the default precedence, so the retired ordering had only
    // the alphabet to go on and dropped `security-patterns` — the rule that
    // governs what the setup PERMITS — because its id sorts last. Risk first
    // inverts the outcome on the identical input.
    expect(result.dropped).toEqual(["ai-evals"]);
    expect(result.rootReplacement).toContain("### security-patterns");
    expect(result.rootReplacement).not.toContain("### ai-evals");
  });

  it("keeps the one critical rule last of all, below every security-floor rule", () => {
    const result = downConvertRules(
      [
        bulkyRule("secrets", { precedence: "critical", tags: ["devops", "floor:security"] }),
        bulkyRule("security-patterns", { tags: ["review", "floor:security"] }),
        bulkyRule("ai-evals", { tags: ["ai"] }),
      ],
      charterHead(12_000),
    );

    // Two must go; the critical rule is neither of them, and the security-floor
    // rule outlives the one with no risk flag at all.
    expect(result.dropped).toEqual(["ai-evals", "security-patterns"]);
    expect(result.rootReplacement).toContain("### secrets");
  });

  it("names the ordering in the omission notice, not just the casualties", () => {
    const result = downConvertRules(
      [bulkyRule("ai-evals", { tags: ["ai"] }), bulkyRule("security-patterns", { tags: ["floor:security"] })],
      charterHead(12_000),
    );

    const root = result.rootReplacement!;
    // A risk-ordered drop that silently changed which rule vanished would be
    // worse than the alphabetical one; the file states the rank it applied.
    expect(root).toContain("lowest risk first");
    expect(root).toContain("critical");
    expect(root).toContain("security-floor");
    expect(root).toContain("`ai-evals`");
  });

  it("derives risk from frontmatter the rules already declare, adding no new key", async () => {
    const rules = await shippedRules();
    const keys = new Set(rules.flatMap((rule) => Object.keys(rule.frontmatter)));
    // The rules layer sanctions one risk flag (spelled `precedence: critical`
    // here) and the `floor:security` tag already carries the security class.
    // Inventing a second vocabulary would be an unledgered spec extension.
    expect(keys).not.toContain("risk");
    expect(keys).not.toContain("security_class");
    expect(rules.some((rule) => rule.precedence === "critical")).toBe(true);
    expect(rules.some((rule) => rule.tags.includes("floor:security"))).toBe(true);
  });

  it("keeps the shipped security rules while lower-risk rules go, on the real corpus", async () => {
    const rules = await shippedRules();
    // No synthetic head: the shipped rule set already overflows one AGENTS.md,
    // which is the state the cross-client golden records and the state the
    // risk-ordering fix was raised against.
    const result = downConvertRules(rules, "# Charter\n");

    expect(result.dropped.length).toBeGreaterThan(0);
    expect(result.dropped).not.toContain("secrets");
    expect(result.dropped).not.toContain("security-patterns");
    expect(result.rootReplacement).toContain("### secrets");
    expect(result.rootReplacement).toContain("### security-patterns");
    // The proof that alphabet no longer decides: a rule whose id sorts AFTER
    // `security-patterns` is gone while `security-patterns` stays. Under the
    // retired ordering the two could only fall in id order.
    expect(result.dropped.some((id) => id > "security-patterns")).toBe(true);
  });

  it("orders totally and deterministically: tightening the budget only ever drops more", async () => {
    const rules = await shippedRules();
    const droppedAt = (headBytes: number): string[] =>
      downConvertRules(rules, `# Charter\n\n${"c".repeat(headBytes)}\n`).dropped;

    const sizes = [0, 8_000, 16_000, 24_000, 30_000];
    const runs = sizes.map((size) => droppedAt(size));

    for (const [index, dropped] of runs.entries()) {
      // Determinism: the same input drops the same rules, every time.
      expect(droppedAt(sizes[index]!)).toEqual(dropped);
      if (index === 0) continue;
      // Totality: with a total order the victim sequence is fixed, so a tighter
      // budget can only extend it. A tie anywhere in the key would let two rules
      // swap places between runs and break the nesting.
      for (const id of runs[index - 1]!) expect(dropped, `budget ${sizes[index]}`).toContain(id);
    }
    expect(runs.at(-1)!.length).toBeGreaterThan(runs[0]!.length);
  });
});

// ── 6. Planner output and composer integration ───────────────────

describe("residue planning", () => {
  it("owns every row as codex and flags only the root charter as a shared-path replacement", async () => {
    const contentRoot = await seedCorpus();
    const ctx = ctxOf({ contentRoot, mcp: { servers: ["context7"] } });

    const rows = (await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs;

    // Sorted by path; `packages/a` is a plain anchor here because this context
    // declares no workspace packages, so no core charter copy claims that file.
    expect(rows.map((row) => row.path)).toEqual([
      `${CODEX_AGENTS_DIR}/stamity-reviewer.toml`,
      CODEX_CONFIG_FILE,
      CODEX_HOOKS_FILE,
      "AGENTS.md",
      "packages/a/AGENTS.md",
      "src/db/AGENTS.md",
    ]);
    for (const row of rows) {
      expect(outputOwners(row).map((owner) => owner.adapter), row.path).toEqual(["codex"]);
    }
    expect(rows.filter((row) => row.replacesSharedPath === true).map((row) => row.path)).toEqual([
      "AGENTS.md",
    ]);
  });

  it("plans byte-identically across runs", async () => {
    const contentRoot = await seedCorpus();
    const ctx = ctxOf({ contentRoot, mcp: { servers: ["context7"] } });
    const core = await buildCoreEmissionPlan(ctx);

    const first = (await codexResiduePlanner.planResidue(core, ctx)).outputs;
    const second = (await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs;
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("substitutes the root charter through the composer: one AGENTS.md row, owners unioned", async () => {
    const contentRoot = await seedCorpus();
    const ctx = ctxOf({ contentRoot, tools: ["claude", "codex"] });
    const core = await buildCoreEmissionPlan(ctx);

    const plan = await composeEmissionPlanner({ codex: codexResiduePlanner }).plan(ctx);

    const charterRows = plan.filter((row) => row.path === "AGENTS.md");
    expect(charterRows).toHaveLength(1);
    const charter = charterRows[0]!;
    expect(charter.content.startsWith(core.agentsMd.root.content)).toBe(true);
    expect(charter.content).toContain("## Conditional rules (Codex down-conversion)");
    expect(outputOwners(charter).map((owner) => owner.adapter)).toEqual(["claude", "codex"]);
  });

  it("keeps one row for a package AGENTS.md the core already emits, appendix rerouted to the root", async () => {
    const contentRoot = await seedCorpus();
    const ctx = ctxOf({
      contentRoot,
      packages: [{ name: "a", path: "packages/a" }],
    });
    const core = await buildCoreEmissionPlan(ctx);

    const plan = await composeEmissionPlanner({ codex: codexResiduePlanner }).plan(ctx);

    const nested = plan.filter((row) => row.path === "packages/a/AGENTS.md");
    expect(nested).toHaveLength(1);
    // The core's charter copy stands; the rule that anchored there moved to the
    // root. Reroute rather than in-place merge, because the composer's
    // replacement contract covers only SHARED core rows (root charter, skills,
    // policy document) — a per-tool nested charter copy is added after that set
    // is sealed, so `replacesSharedPath` on this path is refused and a plain row
    // with different bytes collides. Composing charter body plus appendix HERE
    // needs the composer to widen replacement to per-tool rows; until it does,
    // the rule travels to the root with its scope named in-file.
    expect(nested[0]!.content).toBe(core.agentsMd.root.content);
    const charter = plan.find((row) => row.path === "AGENTS.md")!;
    expect(charter.content).toContain("### pkg-scoped");
    expect(charter.content).toContain("workspace-package charter copy with its own writer");
  });

  it("emits every residue path once through the composer, with the hook and config rows present", async () => {
    const contentRoot = await seedCorpus();
    const ctx = ctxOf({ contentRoot, mcp: { servers: ["github"] } });

    const plan = await composeEmissionPlanner({ codex: codexResiduePlanner }).plan(ctx);

    const paths = plan.map((row) => row.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of [CODEX_HOOKS_FILE, CODEX_CONFIG_FILE, "src/db/AGENTS.md"]) {
      expect(paths).toContain(path);
    }
    // Every emitted AGENTS.md sits under the client's budget.
    for (const row of plan.filter((entry) => entry.path.endsWith("AGENTS.md"))) {
      expect(Buffer.byteLength(row.content, "utf8"), row.path).toBeLessThanOrEqual(
        CODEX_AGENTS_MD_BUDGET_BYTES,
      );
    }
  });
});

describe("codex honours the tools: restriction", () => {
  /**
   * The other three adapters filter on `tools:`; this one did not, while its own
   * JSDoc claimed the same selection predicate. The consequence was not a stray
   * file: codex also down-converts agents and rules into the SHARED root
   * `AGENTS.md`, so an artifact scoped away from codex leaked into the document
   * every client in the repo reads.
   */
  async function planWithScopedRule(): Promise<readonly { path: string; content: string }[]> {
    const temp = getTemp();
    await temp.seedFiles({
      "corpus/charter/stamity-charter.md": CHARTER_FIXTURE,
      "corpus/agents/stamity-reviewer.md": REVIEWER_FIXTURE,
      "corpus/rules/stamity-elsewhere.md": ruleFixture("elsewhere", {
        description: "For another client only.",
        tools: ["claude"],
        body: "Guidance nobody outside claude should read.",
      }),
    });
    const ctx = ctxOf({ contentRoot: temp.path("corpus"), rules: ["elsewhere"] });
    return composeEmissionPlanner({ codex: codexResiduePlanner }).plan(ctx);
  }

  it("emits no .codex row for an artifact restricted to another client", async () => {
    const plan = await planWithScopedRule();
    const codexRows = plan.filter((row) => row.path.startsWith(".codex/"));
    for (const row of codexRows) {
      expect(row.content, row.path).not.toContain("elsewhere");
    }
  });

  it("keeps the restricted artifact out of the shared root AGENTS.md", async () => {
    const plan = await planWithScopedRule();
    const shared = plan.find((row) => row.path === "AGENTS.md");
    expect(shared).toBeDefined();
    expect(shared!.content).not.toContain("Guidance nobody outside claude should read.");
  });
});
