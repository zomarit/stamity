import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLAUDE_COMMANDS_DIR,
  CLAUDE_DIALECT_FACTS,
  CLAUDE_MD_PATH,
  CLAUDE_REVIEW_GATE_PATH,
  CLAUDE_SETTINGS_PATH,
  CLAUDE_SKILLS_DIR,
  claudeResiduePlanner,
} from "../../src/adapters/claude.ts";
import { buildContentIndex, type CatalogItem } from "../../src/content/catalog.ts";
import { parseFrontmatter } from "../../src/content/frontmatter.ts";
import { HOOKS_GENERATED_DIR } from "../../src/emit/hooksInfra.ts";
import {
  buildCoreEmissionPlan,
  type CoreEmissionPlan,
  type EmissionContext,
} from "../../src/emit/planner.ts";
import { NATIVE_SKILL_DIRS, SKILLS_PROJECTION_DIR } from "../../src/emit/skillsProjection.ts";
import { CLIENT_EXTENSION_EVENTS } from "../../src/hooks/model.ts";
import {
  REVIEW_GATE_FILE,
  REVIEW_GATE_STATE_FILE,
  buildReviewGateScript,
} from "../../src/hooks/scripts.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import { extractCustomContent } from "../../src/merge/managedBlocks.ts";
import { AGENT_POLICY_ROSTER } from "../../src/roster/agentPolicies.ts";
import { DEFAULT_MAX_REVIEW_ITERATIONS } from "../../src/roster/reviewCaps.ts";
import { toClaudeToolsFrontmatter } from "../../src/tools/translator.ts";
import type { AdapterOutput, ContentSelection } from "../../src/types/content.ts";
import type { McpConfig, ModelConfig } from "../../src/types/manifest.ts";
import { getMarkersForPath, stampMarkerVersion } from "../../src/types/markers.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The claude residue planner: the CLAUDE.md bridge, the NATIVE `.claude/skills`
 * copy, the `.claude/rules` / `.claude/agents` / `.claude/commands` dialects,
 * the settings document (hook transform + the three Claude-only extension
 * wirings + the read-only permissions chain), the work-scoped review gate, and
 * verbatim MCP placement. The main suite runs over the REAL bundled corpus so
 * the plan-fixed counts (12 rules, 10 agents, 9 commands) are asserted against
 * what actually ships; a seeded fixture corpus covers the shapes the real
 * corpus does not carry (absent `model_class`, an unrostered agent, a
 * pack-shaped agent declaring its own `capabilities:`, a comma-bearing glob, a
 * command body carrying both token families).
 */

const getTemp = useTempDir("adapter-claude");

const CONTENT_ROOT = fileURLToPath(new URL("../../content", import.meta.url));
const ADAPTER_SOURCE = fileURLToPath(new URL("../../src/adapters/claude.ts", import.meta.url));
const ENGINE_VERSION = "0.0.0-test";
const FIXED_NOW = new Date("2026-08-14T00:00:00.000Z");

/**
 * Canonical `model_class` → the frontmatter this client emits with no operator
 * pin, restated to pin the projection. The three alias classes must survive the
 * move off the adapter's own table byte-for-byte; `frontier` has no alias on
 * this client, so it omits the key rather than inventing a size.
 */
const EXPECTED_MODEL: Record<string, string | undefined> = {
  frontier: undefined,
  advanced: "opus",
  standard: "sonnet",
  economy: "haiku",
};

/** Ladder effort per class — the level this client writes into its own `effort:` key. */
const EXPECTED_EFFORT: Record<string, string> = {
  frontier: "high",
  advanced: "high",
  standard: "medium",
  economy: "low",
};

/** The generated hook script commands, as the settings transform renders them. */
const HOOK_COMMANDS = {
  sessionStart: "node .stamity/generated/hooks/claude/stamity-session-start.mjs",
  guard: "node .stamity/generated/hooks/claude/stamity-pre-tool-use-guard.mjs",
  tamper: "node .stamity/generated/hooks/claude/stamity-config-tamper-notice.mjs",
  reviewGate: "node .stamity/generated/hooks/claude/stamity-review-gate.mjs",
} as const;

const EMPTY_SELECTION: ContentSelection = {
  items: { agent: [], skill: [], rule: [], command: [] },
};

interface SettingsShape {
  permissions: { allow: string[] };
  hooks: Record<
    string,
    { matcher?: string; hooks: { type: string; command: string; timeout?: number }[] }[]
  >;
}

interface PlanOverrides {
  selection?: ContentSelection;
  mcp?: McpConfig;
  models?: ModelConfig;
  contentRoot?: string;
  rootDir?: string;
}

/** Every rule, agent and command of the real corpus, selected by bare catalog id. */
async function fullCorpusSelection(): Promise<ContentSelection> {
  const index = await buildContentIndex(CONTENT_ROOT);
  const idsOf = (type: CatalogItem["type"]): string[] =>
    index.items.filter((item) => item.type === type).map((item) => item.id);
  return {
    items: {
      agent: idsOf("agent"),
      skill: idsOf("skill"),
      rule: idsOf("rule"),
      command: idsOf("command"),
    },
  };
}

async function ctxOf(over: PlanOverrides = {}): Promise<EmissionContext> {
  const manifest = createManifest({
    tools: ["claude"],
    selection: over.selection ?? (await fullCorpusSelection()),
    generatorVersion: ENGINE_VERSION,
    now: FIXED_NOW,
    ...(over.mcp === undefined ? {} : { mcp: over.mcp }),
  });
  // `createManifest` takes no `models` option — the operator dials are written
  // by `stamity config`, so a test that needs them assigns the persisted shape.
  if (over.models !== undefined) manifest.models = over.models;
  return {
    rootDir: over.rootDir ?? getTemp().path("repo"),
    manifest,
    engineVersion: ENGINE_VERSION,
    facts: { greenfield: true, monorepoPackages: [] },
    contentRoot: over.contentRoot ?? CONTENT_ROOT,
  };
}

async function planned(
  over: PlanOverrides = {},
): Promise<{ rows: AdapterOutput[]; core: CoreEmissionPlan; ctx: EmissionContext }> {
  const ctx = await ctxOf(over);
  const core = await buildCoreEmissionPlan(ctx);
  const rows = (await claudeResiduePlanner.planResidue(core, ctx)).outputs;
  return { rows, core, ctx };
}

const byPath = (rows: readonly AdapterOutput[]): Map<string, AdapterOutput> =>
  new Map(rows.map((row) => [row.path, row]));

function settingsOf(rows: readonly AdapterOutput[]): SettingsShape {
  const row = byPath(rows).get(CLAUDE_SETTINGS_PATH);
  expect(row).toBeDefined();
  return JSON.parse(row!.content) as SettingsShape;
}

/** One declared capability value from the dialect facts, or `""` when the row is absent. */
function cap(name: string): string {
  return CLAUDE_DIALECT_FACTS.caps.find((row) => row.name === name)?.value ?? "";
}

function agentHead(rows: readonly AdapterOutput[], runtimeId: string): Record<string, unknown> {
  const row = byPath(rows).get(`.claude/agents/${runtimeId}.md`);
  expect(row, runtimeId).toBeDefined();
  return parseFrontmatter(row!.content, row!.path).frontmatter;
}

describe("claude residue over the real corpus", () => {
  it("emits the CLAUDE.md bridge as one stamped managed block: import plus native skills pointer", async () => {
    const { rows } = await planned();
    const row = byPath(rows).get(CLAUDE_MD_PATH);
    expect(row).toBeDefined();

    const begin = stampMarkerVersion(getMarkersForPath(CLAUDE_MD_PATH).start, ENGINE_VERSION);
    expect(row!.content.startsWith(`${begin}\n`)).toBe(true);
    expect(row!.content.endsWith("<!-- STAMITY:END -->\n")).toBe(true);
    expect(row!.content).toContain("@AGENTS.md");

    // CHANGED: the pointer named `.agents/skills/` and disclaimed any
    // load path, because the container never delivered the bodies. The native
    // copy replaces both halves — it names the directory this client reads, and
    // the disclaimer is now false, so asserting it would pin a wrong sentence.
    expect(row!.content).toContain(`${CLAUDE_SKILLS_DIR}/`);
    expect(row!.content).not.toContain(SKILLS_PROJECTION_DIR);
    expect(row!.content).not.toContain("does not load them on its own");
    expect(row!.content).not.toContain(".agents/plugins/");

    // The row content is ONLY the managed block — user prose around it on
    // disk is the merge engine's to preserve, so nothing may sit outside the
    // markers, and exactly one block exists.
    expect(extractCustomContent(row!.content, CLAUDE_MD_PATH)).toBe("");
    expect(row!.content.match(/STAMITY:BEGIN/g)).toHaveLength(1);
    expect(row!.content.match(/STAMITY:END/g)).toHaveLength(1);
    expect(row!.owner).toEqual({
      adapter: "claude",
      artifactId: "claude-md-bridge",
      artifactType: "infra",
    });
  });

  it("carries no plugin-container wording anywhere in the adapter source", () => {
    // The build-side half of removing the plugin container: it is gone, so every
    // sentence that described one has to go with it — including the ones in
    // comments, which are what a maintainer reads before changing this file.
    const source = readFileSync(ADAPTER_SOURCE, "utf8");
    expect(/agent plugins/i.test(source), "adapter source names Agent Plugins").toBe(false);
    expect(/plugin container/i.test(source), "adapter source names a plugin container").toBe(false);
    expect(source).not.toContain("pluginContainer");
  });

  it("emits the bridge default-on: tool options cannot switch it off or change it", async () => {
    const plain = await planned();
    const optedOut = await ctxOf();
    // No opt-in/opt-out flag exists; a legacy-shaped option bag must be inert.
    optedOut.manifest.toolOptions = { claude: { bridge: false, claudeMd: false } };
    const core = await buildCoreEmissionPlan(optedOut);
    const rows = (await claudeResiduePlanner.planResidue(core, optedOut)).outputs;

    expect(byPath(rows).get(CLAUDE_MD_PATH)?.content).toBe(
      byPath(plain.rows).get(CLAUDE_MD_PATH)?.content,
    );
  });

  it("copies the projection to the native skills directory, byte-identical row for row", async () => {
    const { rows, core } = await planned();

    // The location is the projection's to state; this adapter reads it.
    expect(CLAUDE_SKILLS_DIR).toBe(NATIVE_SKILL_DIRS.claude);
    expect(CLAUDE_SKILLS_DIR).toBe(".claude/skills");
    expect(core.skills.length).toBeGreaterThan(0);

    const emitted = byPath(rows);
    for (const file of core.skills) {
      expect(file.path.startsWith(`${SKILLS_PROJECTION_DIR}/`), file.path).toBe(true);
      const native = `${CLAUDE_SKILLS_DIR}/${file.path.slice(SKILLS_PROJECTION_DIR.length + 1)}`;
      const row = emitted.get(native);

      expect(row, native).toBeDefined();
      // Byte-identical: one render, two targets. A second render is how two
      // trees drift, and the composer would then refuse the path rather than
      // pick a winner.
      expect(row!.content, native).toBe(file.content);
      // Adapter-owned and SOLE-owned, unlike the co-owned vendor-neutral tree:
      // this copy exists for one client, so it leaves with that client.
      expect(row!.owner, native).toEqual({
        adapter: "claude",
        artifactId: file.artifactId,
        artifactType: file.artifactType,
      });
      expect(row!.coOwners, native).toBeUndefined();
    }

    // Two paths, not one deduped row: the composer dedups by PATH, and these
    // differ in path, owner, and reclaim behaviour.
    const nativeRows = rows.filter((row) => row.path.startsWith(`${CLAUDE_SKILLS_DIR}/`));
    expect(nativeRows).toHaveLength(core.skills.length);
    expect(rows.some((row) => row.path.startsWith(`${SKILLS_PROJECTION_DIR}/`))).toBe(false);
  });

  it("emits every corpus rule under .claude/rules with canonical globs as a paths list", async () => {
    const { rows } = await planned();
    const index = await buildContentIndex(CONTENT_ROOT);
    const canonical = index.items.filter((item) => item.type === "rule");
    expect(canonical).toHaveLength(12);

    const ruleRows = rows.filter((row) => row.path.startsWith(".claude/rules/"));
    expect(ruleRows).toHaveLength(12);

    let withPaths = 0;
    let withoutPaths = 0;
    for (const item of canonical) {
      const row = byPath(rows).get(`.claude/rules/stamity-${item.id}.md`);
      expect(row, item.id).toBeDefined();
      expect(row!.owner).toEqual({ adapter: "claude", artifactId: item.id, artifactType: "rule" });

      const parsed = parseFrontmatter(row!.content, row!.path);
      expect(parsed.hadFrontmatter).toBe(true);
      expect(parsed.frontmatter["description"]).toBe(item.description);

      const globs = item.frontmatter["globs"];
      if (Array.isArray(globs)) {
        withPaths += 1;
        // The paths list must match the canonical globs exactly — same
        // members, same order.
        expect(parsed.frontmatter["paths"]).toEqual(globs);
      } else {
        withoutPaths += 1;
        // agent-requested authoring shape: description-only. On THIS client
        // that is an unconditional launch load, not a pull — the emission is
        // still right (the client offers no pull shape), and the cost is
        // stated in the dialect facts rather than wished away here.
        expect(Object.hasOwn(parsed.frontmatter, "paths")).toBe(false);
      }

      // Body shipped: the canonical body's first heading survives emission.
      const heading = /^# .+$/m.exec(item.body)?.[0];
      expect(heading).toBeDefined();
      expect(parsed.body).toContain(heading!);
    }
    // TEST CHANGE, justified: this line used to read `expect(withPaths).toBe(9)`
    // and failed when `stamity-contract-census` moved from agent-requested to
    // conditional in `content/rules/` — an authoring edit that left this
    // adapter exactly right. The split between the two shapes is a CORPUS fact
    // with its own owner: `test/corpus/invariants.test.ts` invariant 6 refuses
    // any rule that is neither glob-scoped-with-globs nor agent-requested, and
    // the total is still pinned at 12 above, so nothing this line covered is
    // now uncovered. What the adapter owes is the per-rule correspondence
    // asserted in the loop, and it means something only while BOTH shapes are
    // present — a corpus that lost one would exercise one branch and pass.
    expect(withPaths).toBeGreaterThan(0);
    expect(withoutPaths).toBeGreaterThan(0);
    expect(withPaths + withoutPaths).toBe(canonical.length);
  });

  it("emits every corpus agent with resolver-derived tools and ladder model frontmatter", async () => {
    const { rows } = await planned();
    const index = await buildContentIndex(CONTENT_ROOT);
    const canonical = index.items.filter((item) => item.type === "agent");
    expect(canonical).toHaveLength(10);

    const agentRows = rows.filter((row) => row.path.startsWith(".claude/agents/"));
    expect(agentRows).toHaveLength(10);

    for (const item of canonical) {
      const runtimeId = `stamity-${item.id}`;
      const row = byPath(rows).get(`.claude/agents/${runtimeId}.md`);
      expect(row, item.id).toBeDefined();
      expect(row!.owner).toEqual({ adapter: "claude", artifactId: item.id, artifactType: "agent" });

      const roster = AGENT_POLICY_ROSTER.find((entry) => entry.agentId === runtimeId);
      expect(roster, runtimeId).toBeDefined();

      const parsed = parseFrontmatter(row!.content, row!.path);
      expect(parsed.frontmatter["name"]).toBe(runtimeId);
      expect(parsed.frontmatter["description"]).toBe(item.description);
      // The shared resolver answers a rostered id with the row verbatim, so
      // these bytes are the ones the roster lookup produced before pack agents
      // gained a grant path of their own.
      expect(parsed.frontmatter["tools"]).toBe(toClaudeToolsFrontmatter(roster!.allow));

      const modelClass = item.frontmatter["model_class"] as string;
      expect(Object.hasOwn(EXPECTED_MODEL, modelClass), modelClass).toBe(true);
      expect(parsed.frontmatter["model"], runtimeId).toBe(EXPECTED_MODEL[modelClass]);
      // NEW: this client carries the effort axis in a standalone key,
      // so the class's level is emitted rather than dropped.
      expect(parsed.frontmatter["effort"], runtimeId).toBe(EXPECTED_EFFORT[modelClass]);
    }

    // The read-only reviewer pins the dialect: read-class names only — which,
    // after the category resolution, includes Skill (procedure ingestion).
    expect(agentHead(rows, "stamity-reviewer")["tools"]).toBe("Read, Grep, Glob, Skill");

    // No row this adapter RENDERS leaks a well-formed unresolved substitution
    // token. CHANGED: the assertion used to cover every row, which was
    // the same set — the adapter rendered all of them. The native skills copy
    // is re-targeted, not rendered, so it carries whatever the core produced;
    // its correctness is byte-equality with the core, asserted above.
    const rendered = rows.filter((row) => !row.path.startsWith(`${CLAUDE_SKILLS_DIR}/`));
    // Both halves non-empty, so the filter is narrowing a real set rather than
    // quietly emptying the loop it guards.
    expect(rendered.length).toBeGreaterThan(0);
    expect(rows.length).toBeGreaterThan(rendered.length);
    for (const row of rendered) {
      expect(row.content, row.path).not.toMatch(/\$\{STAMITY:[A-Z_]+\}/);
    }
  });

  it("carries a skill reference file to both trees with the corpus bytes untouched", async () => {
    const { rows, core } = await planned();
    const projected = (relative: string): string | undefined =>
      core.skills.find((file) => file.path === `${SKILLS_PROJECTION_DIR}/${relative}`)?.content;
    const corpusBytes = (relative: string): string =>
      readFileSync(`${CONTENT_ROOT}/skills/${relative}`, "utf8");

    const relative = "stamity-verify/references/testability.md";
    const native = byPath(rows).get(`${CLAUDE_SKILLS_DIR}/${relative}`);
    const source = projected(relative);

    expect(source, relative).toBeDefined();
    expect(native, relative).toBeDefined();
    // TEST CHANGE, justified: this case proved "copied, not rendered" by
    // asserting the file still carried an unresolved `${STAMITY:...}` token —
    // the very finding the old comment recorded against the corpus, which the
    // corpus has since fixed by writing the tokens out of its reference files.
    // The property is kept and widened rather than dropped: the chain now runs
    // corpus bytes → projection copy → native copy, so a substitution pass
    // introduced at EITHER hop fails here, and it keeps failing whether or not
    // any corpus reference file happens to carry a token. The token-bearing
    // shape itself is covered on seeded input by
    // `test/emit/skillsProjection.test.ts` ("projects references byte-identical
    // to source"), which owns the projection's half of this contract.
    expect(source).toBe(corpusBytes(relative));
    // One render, two targets: the native copy re-renders nothing.
    expect(native!.content).toBe(source);

    // Non-vacuous: the projection DOES render what sits at `SKILL.md`, so
    // "copied verbatim" above is a distinction the projection draws, not an
    // artefact of a corpus with nothing left to substitute.
    const rendered = "stamity-onboard/SKILL.md";
    expect(projected(rendered), rendered).toBeDefined();
    expect(corpusBytes(rendered)).toMatch(/\$\{STAMITY:[A-Z_]+\}/);
    expect(projected(rendered)).not.toBe(corpusBytes(rendered));
    expect(projected(rendered)).not.toMatch(/\$\{STAMITY:[A-Z_]+\}/);
  });

  it("emits the three specialists through the ordinary agent path, no adapter change", async () => {
    const { rows } = await planned();

    for (const [id, model] of [
      ["security", "opus"],
      ["design-quality", "opus"],
      ["performance", "sonnet"],
    ] as const) {
      const head = agentHead(rows, `stamity-${id}`);
      expect(head["name"]).toBe(`stamity-${id}`);
      // Their read-only roster grant, through the translator — the same string
      // every other read-only agent gets, not a specialist-specific list.
      expect(head["tools"], id).toBe(toClaudeToolsFrontmatter(["read"]));
      expect(head["model"], id).toBe(model);
    }
  });

  it("emits every touchpoint command as a native slash command with a substituted body", async () => {
    const { rows } = await planned();
    const index = await buildContentIndex(CONTENT_ROOT);
    const canonical = index.items.filter((item) => item.type === "command");
    expect(canonical).toHaveLength(9);

    const commandRows = rows.filter((row) => row.path.startsWith(`${CLAUDE_COMMANDS_DIR}/`));
    expect(commandRows).toHaveLength(9);

    for (const item of canonical) {
      // The catalog namespaces command ids (`cmd-`); the client invokes a
      // command by its FILE NAME, so the namespace is stripped and the content
      // prefix restored.
      const bare = item.id.replace(/^cmd-/, "");
      const row = byPath(rows).get(`${CLAUDE_COMMANDS_DIR}/stamity-${bare}.md`);
      expect(row, item.id).toBeDefined();
      expect(row!.owner).toEqual({
        adapter: "claude",
        artifactId: item.id,
        artifactType: "command",
      });

      const parsed = parseFrontmatter(row!.content, row!.path);
      expect(parsed.frontmatter["description"], item.id).toBe(item.description);
      // Description-only: a guessed `allowed-tools` reads as a restriction
      // while actually being a session-widening grant, and `model`/`effort`
      // here would override the per-role allocation the agent files carry.
      expect(Object.keys(parsed.frontmatter), item.id).toEqual(["description"]);
    }

    // The gate tokens resolve through the same renderer the agents use: the
    // work command's ladder names runnable commands, not template variables.
    const work = byPath(rows).get(`${CLAUDE_COMMANDS_DIR}/stamity-work.md`);
    expect(work).toBeDefined();
    expect(work!.content).not.toMatch(/\$\{STAMITY:/);
    expect(work!.content).toContain("npm run test");
  });

  it("emits settings.json with the hook transform, all three extensions, and the 3-row chain", async () => {
    const { rows } = await planned();
    const settings = settingsOf(rows);

    // Whole-file JSON: permissions and hooks, nothing else — no teammate
    // modes, no experimental flags.
    expect(Object.keys(settings)).toEqual(["permissions", "hooks"]);
    const raw = byPath(rows).get(CLAUDE_SETTINGS_PATH)!.content;
    // CHANGED: `TaskCompleted` used to be asserted ABSENT as one of the
    // predecessor's Agent-Teams echo gates. It is now a deliberate carrier for
    // the work-scoped review gate, so only the echo-gate surface stays banned.
    for (const dropped of ["TeammateIdle", "experimental", "teammateMode"]) {
      expect(raw).not.toContain(dropped);
    }
    // The advisory-hooks rule class died with the prose-hook model.
    expect(rows.some((row) => row.path.includes("advisory"))).toBe(false);

    // SessionStart carries the portable wiring of both scripts, in
    // declaration order: context load first, then the tamper notice (whose
    // body is written to double as session-start drift guidance).
    const sessionStart = settings.hooks["SessionStart"];
    expect(sessionStart?.map((entry) => entry.hooks[0]?.command)).toEqual([
      HOOK_COMMANDS.sessionStart,
      HOOK_COMMANDS.tamper,
    ]);

    // The guard fires on every tool call: exec-form command, no matcher.
    const preToolUse = settings.hooks["PreToolUse"];
    expect(preToolUse).toHaveLength(1);
    expect(preToolUse?.[0]?.hooks[0]).toEqual({ type: "command", command: HOOK_COMMANDS.guard });
    expect(preToolUse?.[0]?.matcher).toBeUndefined();

    // The Claude-only ConfigChange extension wires the SAME tamper script the
    // portable event carries — per-change alert beside session-start guidance.
    const configChange = settings.hooks["ConfigChange"];
    expect(configChange).toHaveLength(1);
    expect(configChange?.[0]?.hooks[0]?.command).toBe(HOOK_COMMANDS.tamper);

    // Read-only permission rows, in canonical category order, re-derived here
    // from the roster union INTERSECTED with the session-pre-approvable
    // categories, through the translator table, minus the two guard-map-only
    // names (Task: spawn alias; Skill: procedure ingestion).
    const union = [...new Set(AGENT_POLICY_ROSTER.flatMap((row) => row.allow))];
    const derived = toClaudeToolsFrontmatter(union.filter((category) => category === "read"))
      .split(", ")
      .filter((name) => name !== "Task" && name !== "Skill");
    expect(settings.permissions.allow).toEqual(derived);
    // A command surface and a skills surface must not widen the chain: the
    // rows are still the three read-class names.
    expect(settings.permissions.allow).toEqual(["Read", "Grep", "Glob"]);

    // The point of the row set: an allow row is session-global and covers the
    // main thread the PreToolUse guard exempts, so shell, network, and write
    // tools must stay on the client's own approval path.
    for (const withheld of [
      "Edit",
      "Write",
      "NotebookEdit",
      "Bash",
      "PowerShell",
      "WebFetch",
      "WebSearch",
    ]) {
      expect(settings.permissions.allow).not.toContain(withheld);
    }

    const row = byPath(rows).get(CLAUDE_SETTINGS_PATH)!;
    expect(row.owner).toEqual({
      adapter: "claude",
      artifactId: "claude-settings",
      artifactType: "infra",
    });
  });

  it("places the core MCP document verbatim at the core-chosen path", async () => {
    const { rows, core } = await planned({ mcp: { servers: ["context7"] } });
    const emissions = core.mcpFor("claude");
    expect(emissions).toHaveLength(1);

    const row = byPath(rows).get(".mcp.json");
    expect(row).toBeDefined();
    expect(row!.content).toBe(emissions[0]!.content);
    expect(row!.owner).toEqual({
      adapter: "claude",
      artifactId: "mcp-claude-json",
      artifactType: "infra",
    });
  });

  it("keeps the protected floor on an empty selection, plus the bridge, settings and gate", async () => {
    const { rows } = await planned({ selection: EMPTY_SELECTION });
    const paths = rows.map((row) => row.path).toSorted();

    // Infrastructure is unconditional...
    expect(paths).toContain(CLAUDE_SETTINGS_PATH);
    expect(paths).toContain(CLAUDE_MD_PATH);
    expect(paths).toContain(CLAUDE_REVIEW_GATE_PATH);
    // ...and so is the floor. An empty selection is the hand-edited-manifest
    // case the `floor:*` mechanism exists for: the five spine agents and the
    // security rules survive it, and nothing else does.
    expect(paths.filter((path) => path.startsWith(".claude/agents/"))).toEqual([
      ".claude/agents/stamity-fixer.md",
      ".claude/agents/stamity-implementer.md",
      ".claude/agents/stamity-researcher.md",
      ".claude/agents/stamity-reviewer.md",
      ".claude/agents/stamity-test-runner.md",
    ]);
    expect(paths.filter((path) => path.startsWith(".claude/rules/"))).toEqual([
      ".claude/rules/stamity-injection-screening.md",
      ".claude/rules/stamity-secrets.md",
      ".claude/rules/stamity-security-patterns.md",
    ]);
    // No command is floor-tagged, so a hand-emptied selection drops the whole
    // slash-command surface — the deselection is honoured, not overridden.
    expect(paths.filter((path) => path.startsWith(`${CLAUDE_COMMANDS_DIR}/`))).toEqual([]);

    // Hooks-only settings still carry the full wiring.
    const settings = settingsOf(rows);
    expect(settings.hooks["SessionStart"]).toHaveLength(2);
    expect(settings.hooks["PreToolUse"]).toHaveLength(1);
    expect(settings.hooks["ConfigChange"]).toHaveLength(1);
    expect(settings.permissions.allow).toHaveLength(3);
  });

  it("emits only claude-owned residue paths, never a core-owned one", async () => {
    const { rows } = await planned({ mcp: { servers: ["context7"] } });
    for (const row of rows) {
      expect(row.owner.adapter).toBe("claude");
      // The residue surface, exhaustively: the bridge, the .claude tree, the
      // client's MCP document, and the ONE adapter-owned script under the
      // per-tool generated hooks directory.
      expect(
        row.path === CLAUDE_MD_PATH ||
          row.path.startsWith(".claude/") ||
          row.path === ".mcp.json" ||
          row.path === CLAUDE_REVIEW_GATE_PATH,
        row.path,
      ).toBe(true);
    }
    // Core-owned paths must not appear: charter, the vendor-neutral skills
    // projection, the core hook scripts, the policy document.
    const paths = rows.map((row) => row.path);
    expect(paths).not.toContain("AGENTS.md");
    expect(paths.some((path) => path.startsWith(".agents/"))).toBe(false);
    // CHANGED: `.stamity/` used to be entirely core territory. The
    // review gate is the one adapter-owned row there, so the assertion narrows
    // from "no `.stamity/` path" to "no `.stamity/` path but that one".
    expect(paths.filter((path) => path.startsWith(".stamity/"))).toEqual([CLAUDE_REVIEW_GATE_PATH]);
  });

  it("plans byte-identically across two runs over identical input", async () => {
    const first = await planned();
    const second = await planned({ rootDir: first.ctx.rootDir });
    expect(JSON.stringify(second.rows)).toBe(JSON.stringify(first.rows));
  });

  it("declares dialect facts with current access-dated citations", () => {
    expect(claudeResiduePlanner.tool).toBe("claude");
    expect(claudeResiduePlanner.facts).toBe(CLAUDE_DIALECT_FACTS);
    expect(CLAUDE_DIALECT_FACTS.entryFile).toBe(CLAUDE_MD_PATH);
    expect(CLAUDE_DIALECT_FACTS.mcpDialect).toBe("claude-json");
    expect(CLAUDE_DIALECT_FACTS.hooksConfigPath).toBe(CLAUDE_SETTINGS_PATH);
    // Still false, and now for the only reason left: the client reads its OWN
    // skills directory, not the vendor-neutral tree.
    expect(CLAUDE_DIALECT_FACTS.readsAgentsSkillsDir).toBe(false);

    // CHANGED: the row said "no automatic load path"; the native copy
    // makes that false, and this string is what the capability matrix renders.
    expect(cap("skills-access")).toContain(CLAUDE_SKILLS_DIR);
    expect(cap("skills-access")).not.toContain("no automatic load path");
    // NEW: the two surfaces the client gained.
    expect(cap("command-surface")).toContain(CLAUDE_COMMANDS_DIR);
    for (const event of ["TaskCompleted", "SubagentStop"]) {
      expect(cap("review-gate"), event).toContain(event);
    }
    expect(cap("review-gate")).toContain("fail-closed");
    expect(cap("permission-rows")).toBe("3");

    // CHANGED: the row claimed description-only rules "load on model
    // pull". They do not on this client — a `.claude/rules/` file with no
    // `paths:` is "loaded at launch with the same priority as
    // `.claude/CLAUDE.md`" and "loaded unconditionally"
    // (code.claude.com/docs/en/memory § "Organize rules with
    // `.claude/rules/`", accessed 2026-08-18). The matrix renders this string
    // verbatim, so the false claim shipped into every generated repo's docs.
    expect(CLAUDE_DIALECT_FACTS.ruleShape).not.toContain("model pull");
    expect(CLAUDE_DIALECT_FACTS.ruleShape).toContain("unconditionally at launch");

    // No cap may claim a container delivers anything — the whole point of
    // removing it is that the claim was never true.
    for (const row of CLAUDE_DIALECT_FACTS.caps) {
      expect(/plugin/i.test(row.value), row.name).toBe(false);
      expect(/container/i.test(row.value), row.name).toBe(false);
    }

    expect(CLAUDE_DIALECT_FACTS.citations.length).toBeGreaterThanOrEqual(4);
    for (const citation of CLAUDE_DIALECT_FACTS.citations) {
      expect(citation.url).toMatch(/^https:\/\//);
      // Re-verified in this unit's research pass; a stale date on a shipped
      // dialect claim is the failure mode the field exists to prevent. Moved
      // to 2026-08-18 by the re-read that corrected the rule load mode
      // above — the whole set was checked in that pass, so one date covers it.
      expect(citation.accessDate).toBe("2026-08-18");
    }
    // The skills + commands dialect has its own page, and it is the one that
    // establishes both native directories.
    expect(CLAUDE_DIALECT_FACTS.citations.map((row) => row.url)).toContain(
      "https://code.claude.com/docs/en/skills",
    );
  });
});

describe("the work-scoped review gate", () => {
  it("emits the script once, beside the core set, under the per-tool hooks directory", async () => {
    const { rows } = await planned();

    expect(CLAUDE_REVIEW_GATE_PATH).toBe(`${HOOKS_GENERATED_DIR}/claude/${REVIEW_GATE_FILE}`);
    const gateRows = rows.filter((row) => row.path === CLAUDE_REVIEW_GATE_PATH);
    expect(gateRows).toHaveLength(1);
    expect(gateRows[0]!.owner).toEqual({
      adapter: "claude",
      artifactId: "claude-review-gate",
      artifactType: "infra",
    });
    // The cap and the fail mode are the engine's, not this adapter's: the body
    // is exactly what the builder produces for this repo's clamped cap.
    expect(gateRows[0]!.content).toBe(
      buildReviewGateScript({
        statePath: REVIEW_GATE_STATE_FILE,
        maxIterations: DEFAULT_MAX_REVIEW_ITERATIONS,
        failMode: "fail-closed",
      }),
    );
  });

  it("carries the operator's clamped cap into the emitted script", async () => {
    const { rows } = await planned({ models: { reviewCap: 99 } });
    const gate = byPath(rows).get(CLAUDE_REVIEW_GATE_PATH);

    expect(gate).toBeDefined();
    // 99 is outside the band, so the one clamp every consumer shares applies:
    // the script states the hard maximum, not the number that was asked for.
    expect(gate!.content).toContain("const MAX_ROUNDS = 10;");
    expect(gate!.content).not.toContain("const MAX_ROUNDS = 99;");
  });

  it("wires the gate to the two extension events, in the ConfigChange entry shape", async () => {
    const { rows } = await planned();
    const settings = settingsOf(rows);

    // The pair is the table's, minus the event the tamper notice claims.
    const extensions = CLIENT_EXTENSION_EVENTS.filter((row) => row.tool === "claude").map(
      (row) => row.event,
    );
    expect(extensions).toEqual(["ConfigChange", "TaskCompleted", "SubagentStop"]);

    for (const event of ["TaskCompleted", "SubagentStop"]) {
      const entries = settings.hooks[event];
      expect(entries, event).toHaveLength(1);
      // Same shape as the ConfigChange wiring: no matcher, one exec-form
      // `type: "command"` handler, no timeout the interchange never requested.
      expect(entries?.[0], event).toEqual({
        hooks: [{ type: "command", command: HOOK_COMMANDS.reviewGate }],
      });
    }
  });

  it("never rides a canonical event — the six portable intents are untouched", async () => {
    const { rows } = await planned();
    const settings = settingsOf(rows);

    // Wiring the gate to `Stop` would gate every session rather than a work
    // run's completion, so the canonical keys must carry only what they did.
    for (const event of ["SessionStart", "PreToolUse", "Stop", "SessionEnd"]) {
      const commands = (settings.hooks[event] ?? []).flatMap((entry) =>
        entry.hooks.map((hook) => hook.command),
      );
      expect(commands, event).not.toContain(HOOK_COMMANDS.reviewGate);
    }
    expect(settings.hooks["ConfigChange"]?.[0]?.hooks[0]?.command).toBe(HOOK_COMMANDS.tamper);
  });
});

describe("model and effort projection", () => {
  it("emits an operator pin verbatim, in place of the client's own alias", async () => {
    const pinned = await planned({
      models: { pins: { advanced: "claude-opus-5", frontier: "claude-fable-5" } },
    });

    // The pin outranks the ladder on the class it names...
    expect(agentHead(pinned.rows, "stamity-implementer")["model"]).toBe("claude-opus-5");
    // ...and reaches a class the client publishes no alias for, which is the
    // only way `frontier` gets a model key at all.
    expect(agentHead(pinned.rows, "stamity-reviewer")["model"]).toBe("claude-opus-5");
    // An unpinned class still resolves through the client's own alias.
    expect(agentHead(pinned.rows, "stamity-fixer")["model"]).toBe("sonnet");
  });

  it("honours an operator effort override per class", async () => {
    // `low` on a class the ladder runs at `high`: the override has to be
    // distinguishable from the default it replaces, or the test passes on a
    // no-op. (The engine's band is low/medium/high; this client documents two
    // levels above that, which is a ladder-data question, not an adapter one.)
    const { rows } = await planned({ models: { effort: { advanced: "low" } } });

    expect(agentHead(rows, "stamity-implementer")["effort"]).toBe("low");
    // Untouched classes keep the ladder's own level.
    expect(agentHead(rows, "stamity-fixer")["effort"]).toBe("medium");
  });

  it("leaves the three alias classes byte-identical to the table this replaced", async () => {
    const { rows } = await planned();

    // The no-regression check for the model-key rework: deleting the adapter's
    // local alias table must not move a single emitted model value. A mismatch
    // here means the ladder data is wrong, not that this adapter should compensate.
    for (const [runtimeId, expected] of [
      ["stamity-implementer", "opus"],
      ["stamity-fixer", "sonnet"],
      ["stamity-test-runner", "haiku"],
    ] as const) {
      expect(agentHead(rows, runtimeId)["model"], runtimeId).toBe(expected);
    }
  });
});

describe("fixture corpus edges", () => {
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

  const GHOST_AGENT_FIXTURE = [
    "---",
    "id: ghost",
    "type: agent",
    "description: Fixture agent with no model class and no roster row.",
    "tags: [implementation]",
    "---",
    "",
    "# Ghost",
    "",
    "Does fixture things.",
    "",
  ].join("\n");

  /** A pack-shaped agent: no roster row, its own `capabilities:` list, no pack footprint in reach. */
  const SUPPLIED_AGENT_FIXTURE = [
    "---",
    "id: supplied",
    "type: agent",
    "description: Fixture agent declaring its own capabilities, as a pack agent does.",
    "tags: [implementation]",
    "capabilities: [read, edit, execute]",
    "model_class: standard",
    "---",
    "",
    "# Supplied",
    "",
    "Does supplied things.",
    "",
  ].join("\n");

  const BRACES_RULE_FIXTURE = [
    "---",
    "id: braces",
    "type: rule",
    "description: Fixture rule whose glob carries a comma inside a brace expansion.",
    "tags: [implementation]",
    "scope: conditional",
    'globs: ["src/**/*.{ts,tsx}", "lib/**"]',
    "---",
    "",
    "# Braces",
    "",
    "Fixture body.",
    "",
  ].join("\n");

  const TOKENS_COMMAND_FIXTURE = [
    "---",
    "id: tokens",
    "type: command",
    "description: Fixture command carrying both token families.",
    "tags: [orchestration]",
    "---",
    "",
    "# Tokens",
    "",
    "Linter: ${STAMITY:LINTER}. Gate: ${STAMITY:VERIFY_GATE_TEST}.",
    "",
  ].join("\n");

  async function fixturePlan(): Promise<AdapterOutput[]> {
    const temp = getTemp();
    await temp.seedFiles({
      "corpus/charter/stamity-charter.md": CHARTER_FIXTURE,
      "corpus/agents/stamity-ghost.md": GHOST_AGENT_FIXTURE,
      "corpus/agents/stamity-supplied.md": SUPPLIED_AGENT_FIXTURE,
      "corpus/rules/stamity-braces.md": BRACES_RULE_FIXTURE,
      "corpus/commands/stamity-tokens.md": TOKENS_COMMAND_FIXTURE,
    });
    const ctx = await ctxOf({
      contentRoot: temp.path("corpus"),
      selection: {
        items: {
          agent: ["ghost", "supplied"],
          skill: [],
          rule: ["braces"],
          command: ["cmd-tokens"],
        },
      },
    });
    // Non-degenerate detection, so the repo token resolves to a named value
    // rather than to the "unknown" placeholder an empty list renders.
    ctx.manifest.detected = {
      languages: ["typescript"],
      linters: ["oxlint"],
      testFrameworks: ["vitest"],
      ciProviders: ["github-actions"],
    };
    const core = await buildCoreEmissionPlan(ctx);
    return (await claudeResiduePlanner.planResidue(core, ctx)).outputs;
  }

  it("omits the model key when model_class is absent and fails closed on an unrostered agent", async () => {
    const rows = await fixturePlan();
    const row = byPath(rows).get(".claude/agents/stamity-ghost.md");
    expect(row).toBeDefined();

    const parsed = parseFrontmatter(row!.content, row!.path);
    expect(parsed.frontmatter["name"]).toBe("stamity-ghost");
    // No model_class declared → neither key is invented, effort included: the
    // ladder answers nothing for a class it does not assign.
    expect(Object.hasOwn(parsed.frontmatter, "model")).toBe(false);
    expect(Object.hasOwn(parsed.frontmatter, "effort")).toBe(false);
    // No roster row and no capabilities → the explicit EMPTY list: an absent
    // tools key would inherit every tool, while an empty one refuses the spawn
    // — the same verdict the guard reaches for an unrostered id (NO_POLICY).
    expect(row!.content).toContain('tools: ""');
    expect(parsed.frontmatter["tools"]).toBe("");
  });

  it("still emits a key for an agent that declares capabilities with no pack footprint in reach", async () => {
    const rows = await fixturePlan();
    const row = byPath(rows).get(".claude/agents/stamity-supplied.md");
    expect(row).toBeDefined();

    const parsed = parseFrontmatter(row!.content, row!.path);
    // Every path through the resolver produces a `tools:` key — the fail-closed
    // end of the dialect, never an absent key.
    expect(Object.hasOwn(parsed.frontmatter, "tools")).toBe(true);
    // And with no ceiling to bound the declaration against, the answer is the
    // empty grant rather than the declaration itself. Granting read+edit+execute
    // from frontmatter alone would make the pack ceiling a no-op and hand a
    // hand-edited file whatever it asked for. See `grantFor` — the emission
    // hand-off that supplies the footprint is the composer wiring the policy
    // document is also waiting on.
    expect(parsed.frontmatter["tools"]).toBe("");
    // The ladder still answers the class, so the two axes are independent.
    expect(parsed.frontmatter["model"]).toBe("sonnet");
    expect(parsed.frontmatter["effort"]).toBe("medium");
  });

  it("keeps a comma-bearing glob whole in the YAML paths list", async () => {
    const rows = await fixturePlan();
    const row = byPath(rows).get(".claude/rules/stamity-braces.md");
    expect(row).toBeDefined();

    // List form, each glob its own quoted element — a CSV join would split
    // the brace expansion at its comma.
    expect(row!.content).toContain('paths: ["src/**/*.{ts,tsx}", "lib/**"]');
    const parsed = parseFrontmatter(row!.content, row!.path);
    expect(parsed.frontmatter["paths"]).toEqual(["src/**/*.{ts,tsx}", "lib/**"]);
  });

  it("resolves both token families in a command body, through the shared renderer", async () => {
    const rows = await fixturePlan();
    const row = byPath(rows).get(`${CLAUDE_COMMANDS_DIR}/stamity-tokens.md`);
    expect(row).toBeDefined();

    // A repo token and a gate token, both resolved to the values this repo's
    // detection produced — the command lane runs the same pipeline the agents
    // do, so a command that says "run the tests" names a runnable command.
    expect(row!.content).toContain("Linter: oxlint.");
    expect(row!.content).toContain("Gate: npm run test.");
    expect(row!.content).not.toMatch(/\$\{STAMITY:/);
  });
});

describe("user hook lane", () => {
  it("carries user hooks after the core scripts, with matcher and second-rounded timeout", async () => {
    const temp = getTemp();
    await temp.seedFiles({
      "repo/.stamity/hooks/10-user.json": `${JSON.stringify({
        hooks: [
          {
            event: "pre_tool_use",
            matcher: "Bash",
            command: ["node", ".stamity/hooks/run.mjs"],
            timeoutMs: 1500,
          },
          { event: "session_start", command: ["node", ".stamity/hooks/run.mjs"] },
        ],
      })}\n`,
      "repo/.stamity/hooks/run.mjs": "// fixture user hook\n",
    });

    const { rows } = await planned({
      selection: EMPTY_SELECTION,
      rootDir: temp.path("repo"),
    });
    const settings = settingsOf(rows);

    // Declaration order: core scripts first, then user rows as the reader
    // returned them.
    expect(settings.hooks["PreToolUse"]?.map((entry) => entry.hooks[0]?.command)).toEqual([
      HOOK_COMMANDS.guard,
      "node .stamity/hooks/run.mjs",
    ]);
    const userEntry = settings.hooks["PreToolUse"]?.[1];
    expect(userEntry?.matcher).toBe("Bash");
    // 1500 ms rounds UP to the client's whole-second unit.
    expect(userEntry?.hooks[0]?.timeout).toBe(2);

    expect(settings.hooks["SessionStart"]?.map((entry) => entry.hooks[0]?.command)).toEqual([
      HOOK_COMMANDS.sessionStart,
      HOOK_COMMANDS.tamper,
      "node .stamity/hooks/run.mjs",
    ]);
    // The ConfigChange extension still targets the tamper script, not the
    // user's session-start hook.
    expect(settings.hooks["ConfigChange"]?.[0]?.hooks[0]?.command).toBe(HOOK_COMMANDS.tamper);
  });
});

/**
 * The emitted line re-split by a REAL shell, exactly as the client would parse
 * it. The criterion is what `sh` does with the string, and a re-splitter written
 * here would only assert that two of the same guesses agree. `printf` re-uses
 * its format once per argument, so one word in yields one line out — including
 * an empty one, which is the element a naive splitter loses.
 */
function reSplit(command: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const printed = execFileSync("/bin/sh", ["-c", `printf '%s\\n' ${command}`], {
    encoding: "utf8",
    env,
  });
  return printed.split("\n").slice(0, -1);
}

/**
 * The join back into one command string. The client's `command` field
 * is a STRING it hands to a shell, so the exec-form argv the interchange carries
 * is rendered here — and the rendering it used to get was double quotes applied
 * only to elements carrying whitespace or a quote. That let `back\slash` through
 * bare, where `sh` reads the backslash as an escape and the client runs
 * `backslash`: the argument boundaries the exec-form author declared did not
 * survive emission. These cases pin the two halves of the contract that replaced
 * it — what the POSIX single-quoting DOES hold (every declared element, through
 * a real shell) and what it does not and cannot (whether the command should run
 * at all, which the ingress allow-list owns).
 */
describe("hook argv joining", () => {
  /** The three quote-forcing characters plus the empty element, one row each. */
  const QUOTING_TABLE: readonly { label: string; element: string; quoted: string }[] = [
    { label: "space", element: "a b", quoted: `'a b'` },
    { label: "double quote", element: 'say "hi"', quoted: `'say "hi"'` },
    { label: "backslash", element: "back\\slash", quoted: `'back\\slash'` },
    { label: "single quote", element: "it's", quoted: `'it'\\''s'` },
    { label: "empty", element: "", quoted: `''` },
  ];

  /** A plan driven through the REAL hook ingress, from a repo seeded on disk. */
  async function settingsFromHooks(
    document: unknown,
    extraFiles: Record<string, string> = {},
  ): Promise<{ settings: SettingsShape; raw: string; core: CoreEmissionPlan }> {
    const temp = getTemp();
    await temp.seedFiles({
      "repo/.stamity/hooks/10-user.json": `${JSON.stringify(document)}\n`,
      "repo/.stamity/hooks/run.mjs": "// fixture user hook\n",
      ...extraFiles,
    });
    const { rows, core } = await planned({
      selection: EMPTY_SELECTION,
      rootDir: temp.path("repo"),
    });
    return { settings: settingsOf(rows), raw: byPath(rows).get(CLAUDE_SETTINGS_PATH)!.content, core };
  }

  /** The line the adapter emits for `argv`, as the client's `command` field. */
  async function joinedCommand(argv: readonly string[]): Promise<string> {
    const { settings } = await settingsFromHooks({
      hooks: [{ event: "session_start", command: [...argv] }],
    });
    // Last SessionStart entry is the user row — the two core scripts precede it.
    return settings.hooks["SessionStart"]?.at(-1)?.hooks[0]?.command ?? "";
  }

  it("renders every quote-forcing element in the POSIX single-quoted form", async () => {
    const argv = ["node", ".stamity/hooks/run.mjs", ...QUOTING_TABLE.map((row) => row.element)];

    const command = await joinedCommand(argv);

    // Row by row, so a failure names the character that broke.
    for (const row of QUOTING_TABLE) {
      expect(command, row.label).toContain(row.quoted);
    }
    // The whole line, exactly: a `toContain` per row cannot see an element that
    // was dropped, duplicated or re-ordered, and the empty element is invisible
    // to it entirely.
    expect(command).toBe(
      `node .stamity/hooks/run.mjs ${QUOTING_TABLE.map((row) => row.quoted).join(" ")}`,
    );
  });

  // POSIX-ONLY: the criterion is field splitting by /bin/sh (POSIX.1-2017 XCU
  // §2.6.5), a primitive Windows has no equivalent of — cmd.exe and PowerShell
  // parse a different grammar, so re-splitting there would answer a different
  // question. The rendering itself is asserted above on every platform.
  it.skipIf(process.platform === "win32")(
    "renders it so a POSIX shell re-splits the line into the declared argv",
    async () => {
      const argv = ["node", ".stamity/hooks/run.mjs", ...QUOTING_TABLE.map((row) => row.element)];

      const words = reSplit(await joinedCommand(argv));

      // Row by row, so a failure names the character that broke: the element
      // survives the shell, and this is the rendering that carried it.
      for (const [index, row] of QUOTING_TABLE.entries()) {
        expect(words[index + 2], row.label).toBe(row.element);
      }
      // And nothing else moved: no word gained, none lost, none re-ordered. The
      // empty element is what a `toContain` check cannot see on its own — it is
      // a line of zero length in the middle of the list.
      expect(words).toEqual(argv);
    },
  );

  it("hands an expansion character to the client as the element, not as what a shell would make of it", async () => {
    const argv = ["node", ".stamity/hooks/run.mjs", "$STAMITY_FIXTURE_VAR"];

    // `$` is outside the shell-safe set, so the element is quoted rather than
    // written bare — which is what the predecessor did with it, having asked
    // only about whitespace and quotes.
    expect(await joinedCommand(argv)).toBe("node .stamity/hooks/run.mjs '$STAMITY_FIXTURE_VAR'");
  });

  // POSIX-ONLY: same /bin/sh field-splitting primitive as above, with the
  // variable actually SET — the non-degenerate input. If the quoting were wrong
  // the element would come back as the value, and an empty environment would
  // hide that behind an empty string.
  it.skipIf(process.platform === "win32")(
    "keeps the expansion character unexpanded through a shell that defines the variable",
    async () => {
      const argv = ["node", ".stamity/hooks/run.mjs", "$STAMITY_FIXTURE_VAR"];

      const command = await joinedCommand(argv);

      expect(
        reSplit(command, { ...process.env, STAMITY_FIXTURE_VAR: "expanded-by-the-shell" }),
      ).toEqual(argv);
    },
  );

  it("states the join's real guarantee in the source, and never the retired boundary claim", () => {
    const source = readFileSync(ADAPTER_SOURCE, "utf8");

    // CHANGED: the docstring said double-quoting meant the join
    // "cannot change the argument boundaries the exec-form author declared" —
    // a promise the rendering it described did not keep, since an element with
    // no whitespace and no quote was never quoted at all. The sentence is
    // retired with the rendering; this fails if either comes back.
    expect(/cannot change the argument boundaries/.test(source)).toBe(false);
    expect(source).toContain("single-quoting");
    // And the guarantee that IS true names the control it stops short of, by
    // path: boundaries are this function's, what may run is the allow-list's.
    expect(source).toContain("src/shared/launcherAllowlist.ts");
  });

  it("keeps an argv the launcher allow-list refuses out of the emitted command line", async () => {
    const { settings, raw, core } = await settingsFromHooks(
      {
        hooks: [
          { event: "session_start", command: ["node", ".stamity/hooks/run.mjs"] },
          // Inline code: the flag is the whole defect — the launcher is allowed.
          { event: "session_start", command: ["node", "-e", "process.exit(0)"] },
          // Unlisted launcher: the script exists and is committed, so the
          // refusal can only be the launcher itself.
          { event: "session_start", command: ["bash", ".stamity/hooks/run.sh"] },
        ],
      },
      { "repo/.stamity/hooks/run.sh": "# fixture user hook\n" },
    );

    // The healthy row still lands: one refused entry does not disarm the file.
    expect(settings.hooks["SessionStart"]?.map((entry) => entry.hooks[0]?.command)).toEqual([
      HOOK_COMMANDS.sessionStart,
      HOOK_COMMANDS.tamper,
      "node .stamity/hooks/run.mjs",
    ]);
    // Neither refused argv ever reaches the join, so no trace of either can be
    // in the file the client runs.
    expect(raw).not.toContain("process.exit(0)");
    expect(raw).not.toContain("run.sh");
    // ...and each refusal is reported rather than swallowed, with the code that
    // says which condition failed.
    const warnings = core.hooks.warnings.join("\n");
    expect(warnings).toContain("[INLINE_CODE_FLAG]");
    expect(warnings).toContain("[LAUNCHER_NOT_ALLOWED]");
  });
});
