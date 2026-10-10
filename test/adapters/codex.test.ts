import { describe, expect, it } from "vitest";
import {
  CODEX_AGENTS_DIR,
  CODEX_AGENTS_MD_BUDGET_BYTES,
  CODEX_AGENTS_OVERRIDE_FILE,
  CODEX_SKILLS_LIST_BUDGET_CHARS,
  CODEX_COMMANDS_DIR,
  CODEX_CONFIG_FILE,
  CODEX_HOOKS_FILE,
  buildAgentToml,
  buildHooksJson,
  codexConfigTableRendering,
  codexResiduePlanner,
  composeConfigToml,
  downConvertRules,
  shownSkillRows,
  skillsListCharacters,
} from "../../src/adapters/codex.ts";
import { buildContentIndex, type CatalogItem } from "../../src/content/catalog.ts";
import { NO_DEMOTED_RULES } from "../../src/content/ruleDelivery.ts";
import { resolveBundledContentRoot } from "../../src/content/contentRoot.ts";
import { LIVE_CAPABILITY_INPUTS } from "../../src/emit/capabilityMatrix.ts";
import {
  buildCoreEmissionPlan,
  composeEmissionPlanner,
  type CoreEmissionPlan,
  type EmissionContext,
} from "../../src/emit/planner.ts";
import type { CoreHooksPlan, PlannedHookScript } from "../../src/emit/hooksInfra.ts";
import { SKILLS_PROJECTION_DIR } from "../../src/emit/skillsProjection.ts";
import { type HookInterchange } from "../../src/hooks/model.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import { segmentTomlTables } from "../../src/manifest/tomlTables.ts";
import { CURATED_MCP_SERVERS, type PackSuppliedServer } from "../../src/mcp/catalog.ts";
import { emitCodexToml } from "../../src/mcp/emit.ts";
import { resolveAgentGrant, type ResolvedAgentGrant } from "../../src/roster/agentGrants.ts";
import { toCodexToolsFrontmatter } from "../../src/tools/translator.ts";
import { outputOwners, type AdapterOutput, type RulePrecedence } from "../../src/types/content.ts";
import { MODEL_CLASSES, type Tool } from "../../src/types/core.ts";
import type { PackageEntry } from "../../src/types/detect.ts";
import { EngineError } from "../../src/types/errors.ts";
import { STATE_DIR } from "../../src/types/markers.ts";
import {
  RULE_DELIVERY_DEFAULT,
  type McpConfig,
  type ModelConfig,
  type RuleDelivery,
  type SetupManifest,
} from "../../src/types/manifest.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The package and version the core scripts' CLI hints pin (sw26-engine-cli-call-form,
 * REQ-FLOW-002). Passed as a literal, not read from this checkout, so the bytes
 * under test are the same in a renamed fork.
 */
const CLI_PIN = { packageName: "@zomarit/stamity", version: "1.0.0-golden" };

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

/** A touchpoint command, to prove it ships as a shared skill and nowhere else. */
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
  ruleDelivery?: RuleDelivery;
  tools?: Tool[];
  agents?: string[];
  rules?: readonly string[];
  /**
   * Content skills. Added 2026-09-15 for the one case that measures the
   * skills-list budget over the FULL selection: every other case here is about
   * rules, so the default stays the empty list it always was.
   */
  skills?: readonly string[];
  commands?: readonly string[];
  packages?: PackageEntry[];
  mcp?: McpConfig;
  models?: ModelConfig;
  rootDir?: string;
  /** The manifest's plugin record; absent everywhere but the ownership cases. */
  plugin?: SetupManifest["plugin"];
}

function ctxOf(options: CtxOptions): EmissionContext {
  const manifest = createManifest({
    tools: options.tools ?? ["codex"],
    selection: {
      items: {
        agent: options.agents ?? ["reviewer"],
        skill: [...(options.skills ?? [])],
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
    manifest: {
      ...manifest,
      ...(options.models === undefined ? {} : { models: options.models }),
      ...(options.ruleDelivery === undefined ? {} : { ruleDelivery: options.ruleDelivery }),
      ...(options.plugin === undefined ? {} : { plugin: options.plugin }),
    },
    engineVersion: ENGINE_VERSION,
    facts: { monorepoPackages: options.packages ?? [] },
    contentRoot: options.contentRoot,
  };
}

const byPath = (rows: readonly AdapterOutput[]): Map<string, AdapterOutput> =>
  new Map(rows.map((row) => [row.path, row]));



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

describe("hooks.json — native command strings and trust controls", () => {
  it("registers canonical events through a repository-root launcher without unsupported trust fields", async () => {
    const core = await buildCoreEmissionPlan(ctxOf({ contentRoot: await seedCorpus() }));
    const document = JSON.parse(buildHooksJson(core, CLI_PIN));
    expect(Object.keys(document.hooks)).toEqual(["SessionStart", "PreToolUse"]);
    expect(document.description).toContain("/hooks");
    expect(document).not.toHaveProperty("stamity");
    for (const groups of Object.values(document.hooks) as { hooks: { command: string; commandWindows: string }[] }[][]) {
      for (const entry of groups.flatMap((group) => group.hooks)) {
        expect(entry.command).toContain("process.cwd()");
        expect(entry.commandWindows).toContain("process.cwd()");
        expect(entry).not.toHaveProperty("sha256");
      }
    }
  });
  it("states all three loading steps in the one field JSON gives the operator", async () => {
    const core = await buildCoreEmissionPlan(ctxOf({ contentRoot: await seedCorpus() }));
    const document = JSON.parse(buildHooksJson(core, CLI_PIN));

    // JSON carries no comments, so `description` is the only channel this file
    // has to the person who opens it after a hook did not fire. Naming `/hooks`
    // and stopping there was the gap: it left the feature flag — the step that
    // makes every other byte here inert — unmentioned.
    expect(document.description).toContain("`features.hooks = true`");
    // review/189: the key is written explicitly, so no vendor default is claimed.
    expect(document.description).toContain("the client's default does not decide it");
    expect(document.description).not.toMatch(/defaults? (it|the flag )?OFF|OFF by default/u);
    expect(document.description).toContain('`projects.<path>.trust_level = "trusted"`');
    expect(document.description).toContain("`/hooks`");
    expect(document.description).toContain("`--dangerously-bypass-hook-trust`");
    expect(document.description).toContain(
      "learn.chatgpt.com/docs/config-file/config-reference (accessed 2026-09-15)",
    );
    // One line, not the comment block's line breaks leaking into JSON.
    expect(document.description).not.toContain("\n");
    expect(document.description).not.toMatch(/ {2}/u);
  });

  it("preserves user argv, matcher and millisecond timeout behind the native seconds request", () => {
    const row: HookInterchange = { event: "pre_tool_use", command: ["node", "--enable-source-maps", "scripts/with space.mjs", "$(literal)"], matcher: "Bash", timeoutMs: 1501 };
    const document = JSON.parse(buildHooksJson(coreWithHooks(hooksPlan([], [row])), CLI_PIN));
    const group = document.hooks.PreToolUse[0];
    expect(group.matcher).toBe("Bash");
    const entry = group.hooks[0];
    expect(entry.timeout).toBe(2);
    expect(JSON.parse(Buffer.from(entry.command.split(" ").at(-1), "base64url").toString())).toEqual(row);
  });

  // HOOK-5. Trust here is recorded against this file's hash, and the scripts it
  // points at sit in the workspace an agent can write — a boundary the operator
  // only meets in this one field. learn.chatgpt.com/docs/hooks, 2026-09-17.
  it("says in the description that the script bytes are outside the trust hash", async () => {
    const core = await buildCoreEmissionPlan(ctxOf({ contentRoot: await seedCorpus() }));
    const description = JSON.parse(buildHooksJson(core, CLI_PIN)).description as string;
    expect(description).toContain("Trust is recorded against this file's hash only");
    expect(description).toContain(".stamity/generated/hooks/codex/");
    // TEST CHANGE (sw26-engine-cli-call-form, G3): the control is named as the
    // installed verb and the pinned npx call; this file is inside the trust
    // hash, so the pinned version re-asks for approval after an upgrade.
    expect(description).toContain(
      "so the check verb (`stamity check` where the CLI is installed, else " +
        "`npx -y @zomarit/stamity@1.0.0-golden check`) is the control",
    );
    expect(description).not.toContain("\n");
  });

  it("pins the sync call into both command fields of every repository row, and the fork's name when given one", () => {
    // G3: `.codex/hooks.json` carries the pinned form like every other client.
    const row: HookInterchange = { event: "pre_tool_use", command: ["node", ".stamity/generated/hooks/codex/stamity-pre-tool-use-guard.mjs"] };
    const document = JSON.parse(
      buildHooksJson(coreWithHooks(hooksPlan([], [row])), { packageName: "@acme/stamity", version: "1.8.0" }),
    ) as { description: string; hooks: { PreToolUse: { hooks: { command: string; commandWindows: string }[] }[] } };
    const [hook] = document.hooks.PreToolUse[0]!.hooks;
    expect(hook!.command).toContain("run npx -y @acme/stamity@1.8.0 sync");
    expect(hook!.commandWindows).toContain("run npx -y @acme/stamity@1.8.0 sync");
    expect(document.description).toContain("npx -y @acme/stamity@1.8.0 check");
    expect(JSON.stringify(document)).not.toContain("@zomarit/stamity");
  });

  it("launches the runner from the plugin root, with no cwd-walking starter, on both command fields", () => {
    const ROOT = "${PLUGIN_ROOT}/hooks";
    const rows: HookInterchange[] = [
      { event: "session_start", command: ["node", `${ROOT}/stamity-session-start.mjs`] },
      { event: "pre_tool_use", command: ["node", `${ROOT}/stamity-pre-tool-use-guard.mjs`] },
    ];

    const document = JSON.parse(buildHooksJson(coreWithHooks(hooksPlan([], rows)), CLI_PIN));

    const entries = (Object.values(document.hooks) as { hooks: { command: string; commandWindows: string }[] }[][])
      .flat()
      .flatMap((group) => group.hooks);
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      // The starter exists to walk up to the directory holding the trusted
      // `.codex/hooks.json`; a root variable the client expands has already
      // answered that, so it is not emitted — and the two command fields agree,
      // because double quotes read the same on cmd and PowerShell.
      expect(entry.command.startsWith(`node "${ROOT}/stamity-portable-hook.mjs" `)).toBe(true);
      expect(entry.command).not.toContain("node -e");
      expect(entry.command).not.toContain("process.cwd()");
      expect(entry.commandWindows).toBe(entry.command);
    }
    const raw = JSON.stringify(document.hooks);
    expect(raw).not.toContain(".stamity/generated");
  });

  it("writes the SessionEnd ceiling even when the row requests no timeout", () => {
    // Left out, the key inherits this client's one-second default, which is not
    // the budget a session-end handoff write was sized against.
    const untimed: HookInterchange = { event: "session_end", command: ["node", ".stamity/hooks/close.mjs"] };
    const generous: HookInterchange = { event: "session_end", command: ["node", ".stamity/hooks/slow.mjs"], timeoutMs: 30_000 };
    const modest: HookInterchange = { event: "session_end", command: ["node", ".stamity/hooks/quick.mjs"], timeoutMs: 1200 };
    const entries = JSON.parse(buildHooksJson(coreWithHooks(hooksPlan([], [untimed, generous, modest])), CLI_PIN))
      .hooks.SessionEnd[0].hooks as { timeout: number }[];
    expect(entries.map((entry) => entry.timeout)).toEqual([3, 3, 2]);

    // Other events keep the absent-means-absent rule: only SessionEnd carries a
    // default this engine has to override.
    const startRow: HookInterchange = { event: "session_start", command: ["node", ".stamity/hooks/open.mjs"] };
    const start = JSON.parse(buildHooksJson(coreWithHooks(hooksPlan([], [startRow])), CLI_PIN))
      .hooks.SessionStart[0].hooks[0] as Record<string, unknown>;
    expect(start).not.toHaveProperty("timeout");
  });

  it("resolves the hook script from the directory holding .codex/hooks.json, not the nearest one above the cwd", () => {
    const row: HookInterchange = { event: "pre_tool_use", command: ["node", ".stamity/generated/hooks/codex/stamity-pre-tool-use-guard.mjs"] };
    const command = JSON.parse(buildHooksJson(coreWithHooks(hooksPlan([], [row])), CLI_PIN)).hooks.PreToolUse[0].hooks[0].command as string;
    // The trusted definition is what identifies the project; the generated
    // directory is then read beside it rather than searched for on its own.
    expect(command).toContain("'.codex','hooks.json'");
    expect(command.indexOf("'.codex','hooks.json'")).toBeLessThan(
      command.indexOf(".stamity/generated/hooks/codex/stamity-portable-hook.mjs"),
    );
  });
});

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
    // No delivery option in play: every rule reaches this client as appendix
    // text, which is what every case outside the on-demand suite asserts.
    demotedRules: NO_DEMOTED_RULES,
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
        "# Key set: learn.chatgpt.com/docs/agent-configuration/subagents (accessed 2026-09-10).",
        `# Stamity role grant: ${toolsValue}. No native tools key is documented.`,
        "# sandbox_mode binds the filesystem boundary; category restrictions remain prompt-level.",
        "",
        'name = "stamity-reviewer"',
        'description = "Reviews a change set and returns a verdict."',
        'sandbox_mode = "read-only"',
        'model_reasoning_effort = "high"',
        'developer_instructions = """',
        "# reviewer",
        "",
        "Read the diff.",
        "",
        // TEST CHANGE 2026-09-30, justified — sw05-read-only-git-grants: the
        // reviewer's row carries `readOnlyGit`, so the role sentence appends the
        // read-only git permission; the sandbox stays `read-only`.
        `Role tool policy: only use tools in these categories: ${grant.allow.join(", ")}. If work needs another category, return that dependency to the parent. Native sandbox and approval controls still apply. You may also run read-only git: git log, git show, git diff, git rev-list, git merge-base; nothing else in a shell.`,
        '"""',
        "",
      ].join("\n"),
    );
  });

  it("names exactly the five read-only git subcommands for a verdict role, and none for the implementer", () => {
    const reviewer = buildAgentToml(reviewerItem, grantOf(reviewerItem));
    expect(reviewer).toContain('sandbox_mode = "read-only"');
    const sentence = /You may also run read-only git: ([^;]+); nothing else in a shell\./.exec(reviewer);
    expect(sentence?.[1]?.split(", ")).toEqual([
      "git log",
      "git show",
      "git diff",
      "git rev-list",
      "git merge-base",
    ]);

    const implementer = agentItem("advanced", "implementer");
    const toml = buildAgentToml(implementer, grantOf(implementer));
    // The control: the implementer holds `execute` and no `readOnlyGit`.
    expect(toml).toContain("Role tool policy:");
    expect(toml).not.toContain("read-only git");
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
    expect(toml).not.toContain("\ntools = ");
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

  it("emits a level above the old band once the operator asks for one", () => {
    // This client documents `xhigh`; the three-level band could not express it.
    const toml = buildAgentToml(agentItem("frontier"), grantOf(agentItem("frontier")), "Body.", {
      efforts: { frontier: "xhigh" },
    });
    expect(tomlValue(toml, "model_reasoning_effort")).toBe('"xhigh"');
  });

  // TEST CHANGE, justified (2026-10-10, q4b-codex-scale): the config reference, re-read
  // 2026-10-10, lists `max` and `ultra` on this client's scale, so an operator `max` is written
  // as `max` rather than clamped to `xhigh`; the rule that the key carries a level the scale
  // holds is unchanged.
  it("emits `max` as `max` now that its documented scale runs to `ultra`", () => {
    const toml = buildAgentToml(agentItem("frontier"), grantOf(agentItem("frontier")), "Body.", {
      efforts: { frontier: "max" },
    });
    expect(tomlValue(toml, "model_reasoning_effort")).toBe('"max"');
    const top = buildAgentToml(agentItem("frontier"), grantOf(agentItem("frontier")), "Body.", {
      efforts: { frontier: "ultra" },
    });
    expect(tomlValue(top, "model_reasoning_effort")).toBe('"ultra"');
  });

  // TEST CHANGE, justified (2026-10-10, q4b-codex-scale): `minimal` left this client's
  // documented scale and is accepted as a legacy level; the emission writes the documented floor,
  // `low`, so no emitted file carries a level the current reference does not list.
  it("writes a legacy `minimal` as the documented floor, `low`", () => {
    const toml = buildAgentToml(agentItem("economy"), grantOf(agentItem("economy")), "Body.", {
      efforts: { economy: "minimal" },
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

  it.each(MODEL_CLASSES)("emits an exact Astra pin for %s with its existing default effort", (modelClass) => {
    const expectedEffort = { frontier: "high", advanced: "high", standard: "medium", economy: "low" };
    const item = agentItem(modelClass);
    const grant = grantOf(item);

    const unpinned = buildAgentToml(item, grant, "Body.");
    const pinned = buildAgentToml(item, grant, "Body.", {
      pins: { [modelClass]: "gpt-6-astra" },
    });

    expect(unpinned).not.toContain("\nmodel = ");
    expect(tomlValue(pinned, "model")).toBe('"gpt-6-astra"');
    expect(tomlValue(pinned, "model_reasoning_effort")).toBe(`"${expectedEffort[modelClass]}"`);
    expect(tomlValue(pinned, "model_reasoning_effort")).toBe(tomlValue(unpinned, "model_reasoning_effort"));
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

  it("writes no agent at the legacy `minimal` across the shipped roster", async () => {
    // The shipped corpus rather than the one-agent fixture, so the economy class has a real
    // member to carry the operator's legacy level: the test-runner is written at `low`, and
    // the reviewer, whose class the operator did not touch, keeps its `high`.
    const index = await buildContentIndex();
    const ctx = ctxOf({
      contentRoot: resolveBundledContentRoot(),
      agents: index.items.filter((item) => item.type === "agent").map((item) => item.id),
      models: { effort: { economy: "minimal" } },
    });

    const outputs = (await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs;
    const agentFiles = outputs.filter((row) => row.path.startsWith(`${CODEX_AGENTS_DIR}/`));
    expect(agentFiles.length).toBeGreaterThan(1);
    for (const row of agentFiles) {
      expect(row.content, row.path).not.toContain('model_reasoning_effort = "minimal"');
    }
    const rows = byPath(outputs);
    expect(rows.get(`${CODEX_AGENTS_DIR}/stamity-test-runner.toml`)!.content).toContain(
      'model_reasoning_effort = "low"',
    );
    expect(rows.get(`${CODEX_AGENTS_DIR}/stamity-reviewer.toml`)!.content).toContain(
      'model_reasoning_effort = "high"',
    );
  });

  it("states the re-read scale, the model dependence and the legacy level in its capability row", () => {
    const row = codexResiduePlanner.facts.caps.find((cap) => cap.name === "effort-scale")?.value ?? "";
    expect(row).toContain("low, medium, high, xhigh, max, ultra");
    expect(row).toContain("learn.chatgpt.com/docs/config-file/config-reference, accessed 2026-10-10");
    expect(row).toMatch(/depend on the model/);
    // TEST CHANGE, justified (2026-10-10, q4b-codex-scale, review/5): the case held the row to
    // "depend on the model" alone, which also passed while the row promised that a level the
    // model does not offer "falls back to that model's own default". The reference read on
    // 2026-10-10 says only "Available levels depend on the model and client", so the row is
    // held to those words and to making no fallback promise.
    expect(row).toContain("the available levels depend on the model and client");
    expect(row).not.toMatch(/falls? back|own default/);
    expect(row).toContain("`minimal` is accepted and written as `low`");
    expect(row).not.toMatch(/accessed 2026-09-17/);
    expect(row).not.toMatch(/cannot be asked for `max`/);
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
    expect(toml).not.toContain("\ntools = ");
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
    expect(toml).not.toContain("\ntools = ");
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

  it("keeps the four verdict roles read-only although their roster rows name report write paths", async () => {
    // Non-degenerate: every verdict row really carries `writePaths` (C8), the
    // key the Claude adapter turns into a path-scoped `Write`. `sandbox_mode`
    // cannot scope a write to the reports folder, so the key moves nothing
    // here and the roles return their full report inline.
    const verdictIds = ["reviewer", "security", "performance", "design-quality"];
    for (const id of verdictIds) {
      const grant = resolveAgentGrant({ runtimeId: `stamity-${id}`, frontmatter: {} });
      expect(grant.writePaths?.length ?? 0, id).toBeGreaterThan(0);
    }

    const ctx = ctxOf({ contentRoot: resolveBundledContentRoot(), agents: verdictIds, rules: [] });
    const rows = byPath(
      (await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs,
    );
    for (const id of verdictIds) {
      const toml = rows.get(`${CODEX_AGENTS_DIR}/stamity-${id}.toml`)?.content ?? "";
      expect(toml, id).toContain('sandbox_mode = "read-only"');
      const grantLines = toml.split("\n").filter((line) => line.includes("Stamity role grant:"));
      expect(grantLines.length, id).toBeGreaterThan(0);
      for (const line of grantLines) {
        expect(line, id).toContain(`Stamity role grant: ${toCodexToolsFrontmatter(["read"])}.`);
        expect(line, id).not.toContain("Write");
      }
    }
    expect(LIVE_CAPABILITY_INPUTS.coverage.find((row) => row.tool === "codex")?.mechanism).toContain(
      "return their full report inline",
    );
  });
});

// ── 2d. Command surface ──────────────────────────────────────────

describe("command surface", () => {
  // TEST CHANGE, justified (sw17-touchpoints-as-shared-skills, REQ-FLOW-026): the
  // three cases here held the `null` command directory — no touchpoint rows, a
  // "none" cap, a disclosure on every run. The contract moved: the nine bodies
  // now ship as shared skills under `.agents/skills/`, the tree this client
  // reads, invoked as `$st-<id>`. Custom prompts are still not used, and the
  // cap still says why, with its citation.
  it("names the shared skills tree as the project-scoped touchpoint home", () => {
    expect(CODEX_COMMANDS_DIR).toBe(SKILLS_PROJECTION_DIR);
  });

  it("records the surface and its invocation form as a dialect cap", () => {
    const cap = codexResiduePlanner.facts.caps.find((row) => row.name === "command-surface");
    expect(cap).toBeDefined();
    expect(cap!.value).toContain(`${SKILLS_PROJECTION_DIR}/st-<id>/SKILL.md`);
    expect(cap!.value).toContain("$st-<id>");
    expect(cap!.value).toContain("allow_implicit_invocation: false");
    // TEST CHANGE (sw17 review/156): the cap states only what is measured or cited — the
    // key the companion carries and the 2026-09-30 live check that `$st-work` loads the
    // touchpoint. No page in `citations` documents the key, and no run measured a plain ask,
    // so the negative is named unmeasured rather than asserted.
    expect(cap!.value).toContain("`$st-work` loads the touchpoint");
    expect(cap!.value).toContain("unmeasured");
    expect(cap!.value).not.toMatch(/starts only when named/);
    // Why not custom prompts: still stated, still cited.
    expect(cap!.value).toContain("home directory");
    expect(cap!.value).toContain("deprecated");
    expect(codexResiduePlanner.facts.citations.map((row) => row.url)).toContain(
      "https://learn.chatgpt.com/docs/custom-prompts",
    );
    for (const citation of codexResiduePlanner.facts.citations) {
      expect(citation.accessDate, citation.url).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("emits a selected touchpoint as a shared skill, and keeps its body out of the instruction files", async () => {
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

    const residue = await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx);
    const rows = residue.outputs;

    const touchpoint = rows.filter((row) => row.owner.artifactType === "command");
    expect(touchpoint.map((row) => row.path)).toEqual([
      `${SKILLS_PROJECTION_DIR}/st-work/SKILL.md`,
      `${SKILLS_PROJECTION_DIR}/st-work/agents/openai.yaml`,
    ]);
    for (const row of touchpoint) {
      expect(row.owner).toEqual({ adapter: "codex", artifactId: "cmd-work", artifactType: "command" });
    }
    const skill = touchpoint[0]!.content;
    expect(skill).toContain("name: st-work");
    expect(skill).toContain("disable-model-invocation: true");
    expect(skill).toContain("Command body nothing on this client reads.");
    expect(touchpoint[1]!.content).toContain("allow_implicit_invocation: false");

    // Only the skill file carries the body: no `.codex/` file and no appendix section.
    for (const row of rows.filter((candidate) => candidate.owner.artifactType !== "command")) {
      expect(row.content, row.path).not.toContain("Command body nothing on this client reads.");
    }
    // The run no longer discloses a missing surface.
    expect((residue.warnings ?? []).join("\n")).not.toContain("touchpoints [codex]");
  });

  // TEST CHANGE, justified (u3-codex-shown-rows, run 2026-10-03_pack-engine-defects):
  // this case used to assert the touchpoint WAS counted and the run refused. codex-cli
  // 0.160.0 (`codex debug prompt-input`, measured 2026-10-03) shows its model none of
  // the nine touchpoints — each carries `policy.allow_implicit_invocation: false` in
  // its `agents/openai.yaml` — so the count moved to the rows Codex shows, and the same
  // touchpoint-heavy setup now plans. The over-cap description is kept, so the case
  // still proves the touchpoint row is present and would have been past the cap.
  it("leaves the touchpoints out of the skills list: their policy hides them from the model", async () => {
    const temp = getTemp();
    const long = "d".repeat(CODEX_SKILLS_LIST_BUDGET_CHARS);
    await temp.seedFiles({
      "corpus/charter/stamity-charter.md": CHARTER_FIXTURE,
      "corpus/commands/stamity-work.md": COMMAND_FIXTURE.replace(
        'description: "Execute a change end to end."',
        `description: "${long}"`,
      ),
    });
    const over = ctxOf({ contentRoot: temp.path("corpus"), rules: [], commands: ["cmd-work"] });

    const residue = await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(over), over);

    // Non-degenerate: the touchpoint shipped, its listing line alone is past the cap,
    // and its companion is the policy that hides it — so planning is the exclusion.
    const touchpoint = residue.outputs.filter((row) => row.owner.artifactType === "command");
    expect(skillsListCharacters(touchpoint)).toBeGreaterThan(CODEX_SKILLS_LIST_BUDGET_CHARS);
    expect(touchpoint.map((row) => row.content).join("\n")).toContain(
      "allow_implicit_invocation: false",
    );
    expect(shownSkillRows(touchpoint)).toEqual([]);
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

  it("turns lifecycle hooks on by writing the key explicitly, so the client default does not decide it", async () => {
    const contentRoot = await seedCorpus();
    // Two servers, so the MCP tables the feature table sits beside are real:
    // an empty selection would prove nothing about the two blocks coexisting.
    const ctx = ctxOf({ contentRoot, mcp: { servers: ["github", "context7"] } });

    const content = composeConfigToml(await buildCoreEmissionPlan(ctx), ctx);

    expect(content).toContain("[features]\nhooks = true\n");
    // Exactly one table, or TOML reads the second header as a redefinition.
    expect(content.match(/^\[features\]$/gmu)).toHaveLength(1);
    // The flag sits ahead of the MCP tables, and both survive composition.
    expect(content.indexOf("[features]")).toBeLessThan(content.indexOf("[mcp_servers."));
    expect(content).toContain("[mcp_servers.github]");
    // Why the key is here at all: written explicitly, so the client's default does not decide it
    // (review/189: no vendor default is claimed; the page read states none).
    expect(content).toContain("the client's default does not decide it");
    expect(content).not.toMatch(/OFF by default|defaults? (it|the flag )?OFF/u);
    expect(content).toContain("learn.chatgpt.com/docs/config-file/config-reference (accessed 2026-09-15)");
    expect(content).toContain("`features.codex_hooks`");
    expect(content).toContain("`codex exec --enable hooks`");
    // TEST CHANGE, justified: REQ-FLOW-037 — the Codex config is owned per table.
    // A [features] table of the owner's is now KEPT instead of the engine's
    // (S16, amended 2026-10-07: Codex runs hooks by default), so the comment
    // no longer tells the owner to add `hooks = true` into their table, and an
    // edited table stays the owner's rather than being restored by `sync`.
    expect(content).toContain("A [features]\n# table of your own is kept instead of this one; Codex runs hooks unless it sets\n# `hooks = false`.");
    expect(content).not.toContain("INTO your existing [features] table");
    // S-2: the preamble states the cost of turning the key off.
    expect(content).toContain("makes every emitted hook inert with no other");
    expect(content).toContain("Edit this table and it becomes yours: sync keeps it as you left it");
    expect(content).not.toContain("`sync` restores `hooks = true`");
  });

  it("says which tables are the engine's, and drops the whole-file claims", async () => {
    const contentRoot = await seedCorpus();
    const ctx = ctxOf({ contentRoot, mcp: { servers: ["github"] } });

    const content = composeConfigToml(await buildCoreEmissionPlan(ctx), ctx);

    expect(content).toContain(
      "# stamity owns the [features] table and each [mcp_servers.<id>] table it renders; every\n" +
        "# other table and top-level key here is yours, and sync and clean keep it.",
    );
    expect(content).not.toContain("Generated file: regenerate rather than editing");
    expect(content).not.toContain("local edits are overwritten");
    expect(content).not.toContain("refuses to overwrite a file it does not own");
  });

  it("cuts into the engine's own tables alone, the preamble riding with [features] as one unbroken comment block", async () => {
    const contentRoot = await seedCorpus();
    const ctx = ctxOf({ contentRoot, mcp: { servers: ["github", "context7"] } });

    const content = composeConfigToml(await buildCoreEmissionPlan(ctx), ctx);

    const cut = segmentTomlTables(content);
    if (!cut.ok) throw new Error(cut.reason);
    expect(cut.segments.map((segment) => segment.key)).toEqual([null, ["features"], ["mcp_servers", "github"], ["mcp_servers", "context7"]]);
    expect(cut.segments[0]?.text).toBe("");
    const features = cut.segments[1]?.text ?? "";
    expect(features.startsWith("# stamity — Codex CLI configuration.")).toBe(true);
    // No blank line before the header: an owned table's comments count from the
    // last blank line among them, so one here would hand the preamble to the owner.
    expect(features.slice(0, features.indexOf("[features]"))).not.toMatch(/\n\n/u);
  });

  it("names all three hook-loading steps above the flag, not the flag alone", async () => {
    const contentRoot = await seedCorpus();
    const ctx = ctxOf({ contentRoot, mcp: { servers: ["github"] } });

    const content = composeConfigToml(await buildCoreEmissionPlan(ctx), ctx);

    // Step 1 is this file's; steps 2 and 3 are the operator's, and a comment
    // that stopped at step 1 would read as "hooks are now enforced".
    expect(content).toContain("Three steps stand between this file and a hook the client runs.");
    expect(content).toContain('`projects.<path>.trust_level = "trusted"`');
    expect(content).toContain("`/hooks`");
    expect(content).toContain("`--dangerously-bypass-hook-trust`");
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

describe("codexConfigTableRendering — the engine's rendering of one table", () => {
  it("renders [features] and the bare [mcp_servers] exactly as the empty selection writes them", async () => {
    const contentRoot = await seedCorpus();
    const ctx = ctxOf({ contentRoot });
    const content = composeConfigToml(await buildCoreEmissionPlan(ctx), ctx);
    const render = codexConfigTableRendering([]);

    expect(`${render("features")}\n${render("mcp_servers")}`).toBe(content);
  });

  it("renders a curated server's table as a selection of it writes it, and nothing for a name it cannot resolve", async () => {
    const contentRoot = await seedCorpus();
    const ctx = ctxOf({ contentRoot, mcp: { servers: ["github"] } });
    const content = composeConfigToml(await buildCoreEmissionPlan(ctx), ctx);
    const render = codexConfigTableRendering([]);

    expect(content.endsWith(render("mcp_servers.github") ?? "<none>")).toBe(true);
    expect(render("mcp_servers.unknown")).toBeNull();
    expect(render("profiles")).toBeNull();
  });

  it("renders a pack-supplied server under its quoted name, and only when the supply carries it", () => {
    const supplied: PackSuppliedServer = { ...(CURATED_MCP_SERVERS["context7"] as PackSuppliedServer), id: "acme.tools", firstParty: false, sourcePackId: "opspack" };

    const rendered = codexConfigTableRendering([supplied])('mcp_servers."acme.tools"');

    expect(rendered).toContain('[mcp_servers."acme.tools"]\n');
    expect(codexConfigTableRendering([])('mcp_servers."acme.tools"')).toBeNull();
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
    expect(rows.map((row) => row.path).filter((path) => path.startsWith(`${STATE_DIR}/`) && path.endsWith("AGENTS.md"))).toEqual(
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
  /**
   * The root `AGENTS.md` this client receives under one delivery mode.
   *
   * The mode became an ARGUMENT on 2026-09-15, when `RULE_DELIVERY_DEFAULT`
   * flipped to `on-demand`. Most cases in this block are about BUDGET SHAPING —
   * which rules the 32 KiB ceiling drops, in what order, and what the omission
   * notice says — and that is a property of the `always-on` appendix: under the
   * default, three floor-class rules reach the appendix and nothing is dropped,
   * so those cases would pass over an empty set and cover nothing. They pass the
   * mode they are about; the default's own behaviour has its own cases below.
   */
  async function shippedRoot(delivery: RuleDelivery = "always-on"): Promise<string> {
    const index = await buildContentIndex();
    const ctx = ctxOf({
      contentRoot: resolveBundledContentRoot(),
      rules: index.items.filter((item) => item.type === "rule").map((item) => item.id),
      agents: ["reviewer"],
      ruleDelivery: delivery,
    });
    const rows = (await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs;
    // TEST CHANGE (sw18): the root appendix row moved from the shared AGENTS.md to the Codex-only
    // AGENTS.override.md, which Codex reads instead; the content asserted below is unchanged.
    const root = rows.find((row) => row.path === CODEX_AGENTS_OVERRIDE_FILE);
    expect(root, "the root AGENTS.override.md row").toBeDefined();
    return root!.content;
  }

  it("pins which rules are inlined and which the budget omits", async () => {
    const { inlined, omitted } = deliveredAndOmitted(await shippedRoot());

    // `Verification gates` is an H3 of the charter head, not a rule section.
    //
    // MOVED 2026-09-02, re-measured rather than widened: the closure run grew
    // `content/rules/stamity-injection-screening.md` by ~29 lines, and that rule
    // carries `floor:security`, so it holds its place and the appendix pays for
    // it out of the tail. `api-versioning` — no floor tag, `normal` precedence —
    // is the next id down and is now omitted. Codex therefore receives five
    // rules where it received six.
    expect(inlined).toEqual([
      "Verification gates",
      "ai-evals",
      "injection-screening",
      "secrets",
      "security-patterns",
    ]);
    expect(omitted).toEqual([
      "api-versioning",
      "contract-census",
      "learnings-schema",
      "migrations",
      "question-protocol",
      "resilience",
      "testing",
      "ui-states",
    ]);

    // MOVED 2026-09-15 to its own case below, which measures under the mode the
    // page actually describes. Leaving the pin here would have held the
    // published figure to the `always-on` appendix while the page disclosed the
    // default — the exact drift the pin exists to stop, in the other direction.
  });

  it("holds the matrix's published drop count to the emission under the shipped default", async () => {
    const { inlined, omitted } = deliveredAndOmitted(await shippedRoot(RULE_DELIVERY_DEFAULT));

    // `docs/capability-matrix.md` publishes this count as part of the
    // cross-client cost of co-selecting codex, and it is one of two figures on
    // that page with no constant behind it — both need an emission, and that
    // renderer is synchronous. Measured under `RULE_DELIVERY_DEFAULT` because
    // that is the mode the page states it measured; the `always-on` case above
    // pins the shaping itself.
    expect(
      LIVE_CAPABILITY_INPUTS.alwaysOn.codexDroppedRuleCount,
      "docs/capability-matrix.md states how many rules the appendix drops; update " +
        "`codexDroppedRuleCount` in src/emit/capabilityMatrix.ts and regenerate the page.",
    ).toBe(omitted.length);
    // Non-degenerate: the appendix is not empty, it is SHAPED — the floors the
    // page names by id are in it, so a zero drop count means "everything that
    // reached it fitted", not "nothing reached it".
    expect(inlined).toEqual(
      expect.arrayContaining([...LIVE_CAPABILITY_INPUTS.alwaysOn.codexFoldedRuleIds]),
    );
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

  it("delivers every floor-tagged rule, and says the floor ranks ahead of precedence", async () => {
    const index = await buildContentIndex();
    const floorTagged = index.items
      .filter((item) => item.type === "rule" && item.tags.some((tag) => tag.startsWith("floor:")))
      .map((item) => item.id);
    const root = await shippedRoot();
    const { inlined, omitted } = deliveredAndOmitted(root);

    // Derived from the corpus rather than listed, so a rule that gains or loses
    // a `floor:*` tag is measured here instead of drifting past a literal. The
    // case above pins the three ids today's ordering spends the budget on; this
    // one pins the PROPERTY — a rule that encodes a charter floor is the last to
    // leave, whatever the floor is called.
    expect(floorTagged.length, "the corpus declares at least one floor-tagged rule").toBeGreaterThan(
      0,
    );
    for (const id of floorTagged) {
      expect(inlined, `${id} carries a floor tag and must survive budget shaping`).toContain(id);
      expect(omitted, id).not.toContain(id);
    }

    // The notice is the operator-facing half: an ordering nobody can read off
    // the file it shaped is an ordering nobody can check.
    expect(root).toContain(
      "rules marked critical are kept longest, then floor-tagged rules, then by declared " +
        "precedence, then by id",
    );

    // ADDED 2026-09-15: the same property under the shipped default, where the
    // floors are what REACHES the appendix rather than what survives it. The
    // notice is absent there because nothing is dropped, so the two halves are
    // asserted apart — the property holds under both modes, the notice only
    // where there is something to notice.
    const defaulted = await shippedRoot(RULE_DELIVERY_DEFAULT);
    const underDefault = deliveredAndOmitted(defaulted);
    for (const id of floorTagged) {
      expect(underDefault.inlined, `${id} carries a floor tag and is never demoted`).toContain(id);
    }
    expect(underDefault.omitted).toEqual([]);
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
    // TEST CHANGE (sw18): Codex reads the root AGENTS.override.md instead of the root AGENTS.md,
    // so the concatenation the notice tells the reader to measure starts there.
    expect(root).toContain("`cat AGENTS.override.md path/to/dir/AGENTS.md | wc -c`");
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
    expect(root).toContain("floor-tagged");
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
  // TEST CHANGE (sw18): this case pinned the root charter as the one shared-path replacement.
  // The appendix now ships in the Codex-only AGENTS.override.md, a plain codex row, so the
  // adapter flags NO row as a replacement and the shared AGENTS.md is not among its rows.
  it("owns every row as codex, the root appendix in its own override file, and replaces no shared path", async () => {
    const contentRoot = await seedCorpus();
    // MODE PINNED 2026-09-15, explicitly `always-on`. The claim is about
    // OWNERSHIP of the root replacement row, so the fixture has to produce one.
    // None of this fixture's five rules is critical, floor-tagged or unanchored-
    // but-mandatory, so under the shipped default every rule either anchors into
    // a nested file or becomes a skill, the root appendix is empty and no root
    // row exists to own. That case is asserted on its own below.
    const ctx = ctxOf({ contentRoot, mcp: { servers: ["context7"] }, ruleDelivery: "always-on" });

    const rows = (await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs;

    // Sorted by path; `packages/a` is a plain anchor here because this context
    // declares no workspace packages, so no core charter copy claims that file.
    expect(rows.map((row) => row.path)).toEqual([
      `${CODEX_AGENTS_DIR}/stamity-reviewer.toml`,
      CODEX_CONFIG_FILE,
      CODEX_HOOKS_FILE,
      ".stamity/generated/hooks/codex/stamity-portable-hook.mjs",
      CODEX_AGENTS_OVERRIDE_FILE,
      "packages/a/AGENTS.md",
      "src/db/AGENTS.md",
    ]);
    for (const row of rows) {
      expect(outputOwners(row).map((owner) => owner.adapter), row.path).toEqual(["codex"]);
    }
    expect(rows.filter((row) => row.replacesSharedPath === true)).toEqual([]);
  });

  it("plans byte-identically across runs", async () => {
    const contentRoot = await seedCorpus();
    const ctx = ctxOf({ contentRoot, mcp: { servers: ["context7"] } });
    const core = await buildCoreEmissionPlan(ctx);

    const first = (await codexResiduePlanner.planResidue(core, ctx)).outputs;
    const second = (await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs;
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  // TEST CHANGE (sw18): this case asserted the composer SUBSTITUTED the shared AGENTS.md with
  // charter + appendix. The appendix now lives in the Codex-only AGENTS.override.md, so the shared
  // row stays the core charter (owners still unioned) and the override is codex's alone. The
  // "charter first, appendix after" shape is asserted on the override instead.
  it("leaves the shared AGENTS.md as the core charter and puts charter + appendix in the override", async () => {
    const contentRoot = await seedCorpus();
    // MODE PINNED 2026-09-15, same reason as the case above: the root appendix row
    // is only observable while there IS one.
    const ctx = ctxOf({ contentRoot, tools: ["claude", "codex"], ruleDelivery: "always-on" });
    const core = await buildCoreEmissionPlan(ctx);

    const plan = await composeEmissionPlanner({ codex: codexResiduePlanner }).plan(ctx);

    const charterRows = plan.filter((row) => row.path === "AGENTS.md");
    expect(charterRows).toHaveLength(1);
    const charter = charterRows[0]!;
    expect(charter.content).toBe(core.agentsMd.root.content);
    expect(charter.content).not.toContain("## Conditional rules (Codex down-conversion)");
    expect(outputOwners(charter).map((owner) => owner.adapter)).toEqual(["claude", "codex"]);

    const override = plan.find((row) => row.path === CODEX_AGENTS_OVERRIDE_FILE);
    expect(override).toBeDefined();
    expect(override!.content.startsWith(core.agentsMd.root.content.trimEnd())).toBe(true);
    expect(override!.content).toContain("## Conditional rules (Codex down-conversion)");
    expect(outputOwners(override!).map((owner) => owner.adapter)).toEqual(["codex"]);
  });

  it("reads the operator's AGENTS.md only under a decision that keeps their text", async () => {
    // The override repeats the shared AGENTS.md as the run leaves it (sw18). With no
    // import decision, or `replace`, the engine writes the charter whole, so nothing on
    // disk is read; `supplement` keeps the operator's text around the block, and `skip`
    // leaves their file as the whole shared text.
    const contentRoot = await seedCorpus();
    const temp = getTemp();
    await temp.seedFiles({ "planted/AGENTS.md": "## Team notes\n\nOperator line QX-3310.\n" });
    const base = ctxOf({
      contentRoot,
      tools: ["claude", "codex"],
      ruleDelivery: "always-on",
      rootDir: temp.path("planted"),
    });
    const core = await buildCoreEmissionPlan(base);
    const overrideUnder = async (mode?: "replace" | "supplement" | "skip"): Promise<string> => {
      const ctx: EmissionContext =
        mode === undefined
          ? base
          : { ...base, manifest: { ...base.manifest, importChoice: [{ path: "AGENTS.md", mode }] } };
      const rows = (await codexResiduePlanner.planResidue(core, ctx)).outputs;
      return rows.find((row) => row.path === CODEX_AGENTS_OVERRIDE_FILE)!.content;
    };
    const appendix = "## Conditional rules (Codex down-conversion)";

    const unread = await Promise.all([overrideUnder(), overrideUnder("replace")]);
    for (const [index, text] of unread.entries()) {
      expect(text, String(index)).not.toContain("QX-3310");
      expect(text.startsWith(core.agentsMd.root.content.trimEnd()), String(index)).toBe(true);
    }

    // No block on disk yet: the first adoption puts the block on top and the file below it.
    // The block body is trimmed, as the managed-block writer trims it.
    const supplemented = await overrideUnder("supplement");
    expect(supplemented.startsWith(core.agentsMd.root.content.trim())).toBe(true);
    expect(supplemented.indexOf("QX-3310")).toBeGreaterThan(core.agentsMd.root.content.trim().length);
    expect(supplemented.indexOf("QX-3310")).toBeLessThan(supplemented.indexOf(appendix));

    const skipped = await overrideUnder("skip");
    expect(skipped.startsWith("## Team notes\n\nOperator line QX-3310.")).toBe(true);
    expect(skipped).not.toContain(core.agentsMd.root.content.trim().split("\n")[0]!);
    expect(skipped).toContain(appendix);
  });

  it("warns when the operator's own AGENTS.md alone leaves the override over budget", async () => {
    // ADDED with sw18 review r1 (M-2): under `skip` the override's head is the operator's file,
    // which no rule drop can shrink, so the overflow is named on the warning channel.
    const contentRoot = await seedCorpus();
    const temp = getTemp();
    await temp.seedFiles({ "big/AGENTS.md": "Operator line QX-7781.\n".repeat(2_000) });
    const base = ctxOf({ contentRoot, tools: ["codex"], ruleDelivery: "always-on", rootDir: temp.path("big") });
    const core = await buildCoreEmissionPlan(base);
    const planned = async (mode?: "skip"): Promise<{ bytes: number; warnings: readonly string[] }> => {
      const ctx: EmissionContext =
        mode === undefined ? base : { ...base, manifest: { ...base.manifest, importChoice: [{ path: "AGENTS.md", mode }] } };
      const result = await codexResiduePlanner.planResidue(core, ctx);
      const override = result.outputs.find((row) => row.path === CODEX_AGENTS_OVERRIDE_FILE)!;
      return { bytes: Buffer.byteLength(override.content, "utf8"), warnings: result.warnings ?? [] };
    };

    const over = await planned("skip");
    expect(over.bytes).toBeGreaterThan(CODEX_AGENTS_MD_BUDGET_BYTES);
    expect(over.warnings.filter((line) => line.includes(`${CODEX_AGENTS_OVERRIDE_FILE} is ${over.bytes} bytes`))).toHaveLength(1);

    // Non-degenerate: the same corpus with the file unread stays under budget and says nothing.
    const under = await planned();
    expect(under.bytes).toBeLessThanOrEqual(CODEX_AGENTS_MD_BUDGET_BYTES);
    expect(under.warnings.some((line) => line.includes(`${CODEX_AGENTS_OVERRIDE_FILE} is `))).toBe(false);
  });

  it("emits no root replacement under the default when every rule anchors or demotes", async () => {
    // ADDED 2026-09-15, the other half of the two cases above. Under
    // `on-demand` this fixture's glob-less and unanchorable rules are delivered
    // as skills and the anchorable ones as nested files, so the root appendix
    // has nothing to carry — and a root `AGENTS.md` replacement with an empty
    // appendix would be this client rewriting a SHARED file for no content.
    const contentRoot = await seedCorpus();
    const ctx = ctxOf({ contentRoot, ruleDelivery: "on-demand" });

    const core = await buildCoreEmissionPlan(ctx);
    const rows = (await codexResiduePlanner.planResidue(core, ctx)).outputs;

    expect(rows.some((row) => row.path === "AGENTS.md")).toBe(false);
    // ADDED (sw18): nor the Codex-only override, which exists only to carry a root appendix.
    expect(rows.some((row) => row.path === CODEX_AGENTS_OVERRIDE_FILE)).toBe(false);
    expect(rows.some((row) => row.replacesSharedPath === true)).toBe(false);
    // Non-degenerate: the nested anchors still land, and the two rules that
    // could not anchor are delivered — as skills, not dropped.
    expect(rows.map((row) => row.path)).toEqual(
      expect.arrayContaining(["src/db/AGENTS.md", "packages/a/AGENTS.md"]),
    );
    const skillDirs = core.skills
      .filter((row) => row.path.endsWith("/SKILL.md"))
      .map((row) => row.path.split("/").at(-2));
    expect(skillDirs).toEqual(
      expect.arrayContaining(["stamity-ask-first", "stamity-auth-guard"]),
    );
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
    // TEST CHANGE (sw18): the rerouted rule lands in the root appendix, which now lives in the
    // Codex-only AGENTS.override.md rather than the shared AGENTS.md.
    const charter = plan.find((row) => row.path === CODEX_AGENTS_OVERRIDE_FILE)!;
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
    // Every emitted AGENTS.md sits under the client's budget — and, since sw18, the root
    // AGENTS.override.md too, which carries the root appendix the budget shapes.
    for (const row of plan.filter(
      (entry) => entry.path.endsWith("AGENTS.md") || entry.path === CODEX_AGENTS_OVERRIDE_FILE,
    )) {
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

  // N1, golden-free: a `tools: [codex]`-only rule that is glob-less,
  // non-critical, non-floor and non-anchored used to be DEMOTED under
  // `on-demand` (nothing in the pre-N1 predicate read `tools:`) and then
  // refused a shared `.agents/skills/` row (W3, since `tools:` does not name
  // cursor or copilot too) — delivered through no door at all. With the N1
  // guard, codex refuses to demote it in the first place, so it stays
  // inlined in the root appendix. No golden byte-comparison: this asserts
  // the one property N1 exists to hold, not the appendix's exact shape.
  it("keeps a tools:[codex]-only rule inlined in the appendix under on-demand delivery", async () => {
    const temp = getTemp();
    await temp.seedFiles({
      "corpus/charter/stamity-charter.md": CHARTER_FIXTURE,
      "corpus/agents/stamity-reviewer.md": REVIEWER_FIXTURE,
      "corpus/rules/stamity-codex-private.md": ruleFixture("codex-private", {
        description: "For codex only.",
        tools: ["codex"],
        body: "Guidance only codex should carry, demoted nowhere else it can land.",
      }),
    });
    const ctx = ctxOf({
      contentRoot: temp.path("corpus"),
      rules: ["codex-private"],
      ruleDelivery: "on-demand",
    });

    const plan = await composeEmissionPlanner({ codex: codexResiduePlanner }).plan(ctx);
    // TEST CHANGE (sw18): the root appendix moved from the shared AGENTS.md to the Codex-only
    // AGENTS.override.md — which also means the codex-only rule no longer reaches the file
    // other clients read, asserted on the shared row below.
    const override = plan.find((row) => row.path === CODEX_AGENTS_OVERRIDE_FILE);

    expect(override).toBeDefined();
    expect(override!.content).toContain(
      "Guidance only codex should carry, demoted nowhere else it can land.",
    );
    expect(plan.find((row) => row.path === "AGENTS.md")!.content).not.toContain(
      "Guidance only codex should carry",
    );
  });
});


// ── 8. The delivery option ───────────────────────────────────────

/**
 * `ruleDelivery: "on-demand"` on the client with no conditional rule layer.
 *
 * This is the one client where the option changes what is DELIVERED rather than
 * only where it is delivered from: the appendix was dropping eight rules for
 * budget, and the rules it now folds are exactly the ones a floor argument
 * keeps in front of the model unconditionally. The pins below are the record of
 * that — inlined set, skills set, and dropped set, all three asserted in one
 * case, because a rule that left the appendix and reached no skill directory
 * would otherwise look like a budget saving.
 */
describe("the shipped Codex emission under ruleDelivery: on-demand", () => {
  /** The rules that stay inlined: critical, or floor-tagged. */
  const FOLDED = ["injection-screening", "secrets", "security-patterns"] as const;

  async function shipped(delivery: RuleDelivery): Promise<AdapterOutput[]> {
    const index = await buildContentIndex();
    const ctx = ctxOf({
      contentRoot: resolveBundledContentRoot(),
      rules: index.items.filter((item) => item.type === "rule").map((item) => item.id),
      agents: ["reviewer"],
      ruleDelivery: delivery,
    });
    const core = await buildCoreEmissionPlan(ctx);
    const residue = (await codexResiduePlanner.planResidue(core, ctx)).outputs;
    // Core rows carry no per-tool owner; this client reads them from the
    // vendor-neutral tree, so they are folded in as-is with a placeholder owner.
    const coreRows: AdapterOutput[] = [];
    for (const row of core.skills) {
      coreRows.push({
        path: row.path,
        content: row.content,
        owner: { adapter: "codex", artifactId: row.artifactId, artifactType: row.artifactType },
      });
    }
    return [...coreRows, ...residue];
  }

  it("inlines only the floor rules and drops nothing, with every other rule reachable as a skill", async () => {
    const rows = await shipped("on-demand");
    // TEST CHANGE (sw18): the root appendix row moved to the Codex-only AGENTS.override.md.
    const root = rows.find((row) => row.path === CODEX_AGENTS_OVERRIDE_FILE);
    expect(root, "the root AGENTS.override.md row").toBeDefined();
    const { inlined, omitted } = deliveredAndOmitted(root!.content);

    // `Verification gates` is an H3 of the charter head, not a rule section.
    expect(inlined).toEqual(["Verification gates", ...FOLDED]);
    expect(omitted).toEqual([]);

    const index = await buildContentIndex();
    const demoted = index.items
      .filter((item) => item.type === "rule" && !FOLDED.includes(item.id as (typeof FOLDED)[number]))
      .map((item) => item.id)
      .toSorted();
    expect(demoted).toHaveLength(9);
    const skillPaths = new Set(rows.map((row) => row.path));
    for (const id of demoted) {
      expect(skillPaths.has(`.agents/skills/stamity-${id}/SKILL.md`), id).toBe(true);
    }
    // ...and nothing folded is ALSO a skill: one rule, one door.
    for (const id of FOLDED) {
      expect(skillPaths.has(`.agents/skills/stamity-${id}/SKILL.md`), id).toBe(false);
    }
  });

  it("measures a skills list well under the client's cap on the shipped corpus", async () => {
    const rows = await shipped("on-demand");
    const total = skillsListCharacters(rows.filter((row) => row.path.startsWith(".agents/skills/")));

    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(CODEX_SKILLS_LIST_BUDGET_CHARS);
  });

  it("holds the matrix's published skills-list total to the FULL selection", async () => {
    // ADDED 2026-09-15. `docs/capability-matrix.md` publishes this total against
    // the cap as the budget the rule-delivery option spends, and the renderer
    // cannot run an emission to take the reading itself. The case above selects
    // no content skills, so its total is the projected rules alone; the page
    // says "the full selection", and the client does not distinguish where a
    // skill came from, so the pin is taken over everything the corpus offers.
    const index = await buildContentIndex();
    const idsOf = (type: string): string[] =>
      index.items.filter((item) => item.type === type).map((item) => item.id);
    const ctx = ctxOf({
      contentRoot: resolveBundledContentRoot(),
      rules: idsOf("rule"),
      skills: idsOf("skill"),
      agents: idsOf("agent"),
      commands: idsOf("command"),
      ruleDelivery: RULE_DELIVERY_DEFAULT,
    });
    const core = await buildCoreEmissionPlan(ctx);
    // TEST CHANGE, justified (sw17-touchpoints-as-shared-skills): the listing
    // now also holds the nine touchpoints, which this adapter emits into the
    // same `.agents/skills/` tree rather than the core projection, so the
    // measured list is the core rows plus the residue's rows under that tree —
    // everything the client finds there, which is what the page publishes.
    const residue = await codexResiduePlanner.planResidue(core, ctx);
    const listed = [
      ...core.skills,
      ...residue.outputs
        .filter((row) => row.path.startsWith(`${SKILLS_PROJECTION_DIR}/`))
        .map((row) => ({ path: row.path, content: row.content, artifactType: row.owner.artifactType })),
    ];
    // TEST CHANGE, justified (u3-codex-shown-rows, run 2026-10-03_pack-engine-defects):
    // the pin now measures the rows Codex SHOWS its model. codex-cli 0.160.0
    // (`codex debug prompt-input`, measured 2026-10-03) lists the 8 shipped skills and
    // the 9 rule-skills, and none of the nine touchpoints, whose `agents/openai.yaml`
    // sets `policy.allow_implicit_invocation: false`. `listed` still holds all three
    // kinds, so the non-degenerate checks below keep proving the projection is whole.
    const shown = shownSkillRows(listed);
    const total = skillsListCharacters(shown);

    // Non-degenerate: the full selection carries all THREE kinds of skill, so a
    // projection that lost the rules, the content skills or the touchpoints
    // fails here rather than quietly measuring part of the list.
    const dirs = listed
      .filter((row) => row.path.endsWith("/SKILL.md"))
      .map((row) => row.path.split("/").at(-2) ?? "");
    expect(dirs.filter((dir) => dir.startsWith("stamity-")).length).toBe(9);
    expect(dirs.filter((dir) => dir.startsWith("st-")).length).toBeGreaterThan(9);
    const touchpointDirs = listed
      .filter((row) => row.artifactType === "command" && row.path.endsWith("/SKILL.md"))
      .map((row) => row.path.split("/").at(-2) ?? "");
    expect(touchpointDirs).toHaveLength(9);
    expect(new Set(dirs).size).toBe(dirs.length);
    // What the client shows: the 17 rows of the 2026-10-03 measurement, no touchpoint
    // among them, and a total strictly below the whole tree's.
    const shownDirs = shown
      .filter((row) => row.path.endsWith("/SKILL.md"))
      .map((row) => row.path.split("/").at(-2) ?? "");
    expect(shownDirs).toHaveLength(17);
    for (const dir of touchpointDirs) expect(shownDirs, dir).not.toContain(dir);
    expect(total).toBeLessThan(skillsListCharacters(listed));

    expect(
      LIVE_CAPABILITY_INPUTS.alwaysOn.codexSkillsListChars,
      "docs/capability-matrix.md publishes the measured skills-list total; update " +
        "`codexSkillsListChars` in src/emit/capabilityMatrix.ts and regenerate the page.",
    ).toBe(total);
    expect(LIVE_CAPABILITY_INPUTS.alwaysOn.codexSkillsListCap).toBe(CODEX_SKILLS_LIST_BUDGET_CHARS);
    expect(total).toBeLessThanOrEqual(CODEX_SKILLS_LIST_BUDGET_CHARS);
  });

  it("emits byte-identically to today under always-on", async () => {
    const defaulted = await shipped("always-on");
    const explicit = await shipped("on-demand");

    expect(defaulted.map((row) => row.path)).not.toEqual(explicit.map((row) => row.path));
    // TEST CHANGE (sw18): the root appendix row moved to the Codex-only AGENTS.override.md.
    const root = defaulted.find((row) => row.path === CODEX_AGENTS_OVERRIDE_FILE)!;
    const { inlined, omitted } = deliveredAndOmitted(root.content);
    expect(inlined).toEqual([
      "Verification gates",
      "ai-evals",
      "injection-screening",
      "secrets",
      "security-patterns",
    ]);
    expect(omitted).toHaveLength(8);
  });
});

/** One projected SKILL.md row whose description is `descriptionLength` characters. */
function skillRow(
  index: number,
  descriptionLength: number,
): { path: string; content: string; artifactId: string; artifactType: "skill" } {
  const name = `st-fixture-${index}`;
  return {
    path: `.agents/skills/${name}/SKILL.md`,
    content: `---\nname: ${name}\ndescription: ${"d".repeat(descriptionLength)}\n---\n\nBody.\n`,
    artifactId: `fixture-${index}`,
    artifactType: "skill",
  };
}

describe("the skills-list budget", () => {
  it("sums name + description + 3 over every projected SKILL.md, support files excluded", () => {
    const rows = [
      skillRow(1, 100),
      skillRow(2, 200),
      { path: ".agents/skills/st-fixture-1/references/deep.md", content: "x".repeat(5_000), artifactId: "fixture-1", artifactType: "skill" as const },
    ];

    // 2 rows: ("st-fixture-1".length = 12) + 100 + 3, and the same with 200.
    expect(skillsListCharacters(rows)).toBe(12 + 100 + 3 + (12 + 200 + 3));
  });

  it("refuses a 9,000-character skills list on codex, naming the total and the cap", async () => {
    const rows = Array.from({ length: 20 }, (_, index) => skillRow(index, 435));
    const total = skillsListCharacters(rows);
    expect(total).toBeGreaterThan(9_000);

    const core: CoreEmissionPlan = { ...coreWithHooks(hooksPlan([], [])), skills: rows };
    const ctx = ctxOf({ contentRoot: await seedCorpus(), ruleDelivery: "on-demand" });

    await expect(codexResiduePlanner.planResidue(core, ctx)).rejects.toThrow(EngineError);
    await expect(codexResiduePlanner.planResidue(core, ctx)).rejects.toThrow(
      new RegExp(`${total} characters; this setup caps it at ${CODEX_SKILLS_LIST_BUDGET_CHARS}`),
    );
  });

  it("admits a list exactly at the cap — the refusal is past it, not at it", async () => {
    const rows = [skillRow(1, CODEX_SKILLS_LIST_BUDGET_CHARS - 12 - 3)];
    expect(skillsListCharacters(rows)).toBe(CODEX_SKILLS_LIST_BUDGET_CHARS);

    const core: CoreEmissionPlan = { ...coreWithHooks(hooksPlan([], [])), skills: rows };
    const ctx = ctxOf({ contentRoot: await seedCorpus(), ruleDelivery: "on-demand" });

    await expect(codexResiduePlanner.planResidue(core, ctx)).resolves.toBeDefined();
  });

  it("drops a folder whose agents/openai.yaml hides it, and keeps display-only and malformed companions", () => {
    const companion = (index: number, content: string) => ({
      path: `.agents/skills/st-fixture-${index}/agents/openai.yaml`,
      content,
      artifactId: `fixture-${index}`,
      artifactType: "skill" as const,
    });
    const rows = [
      skillRow(1, 100),
      companion(1, "policy:\n  allow_implicit_invocation: false\n"),
      skillRow(2, 200),
      // The shape the bundled skills ship: display fields only, so the client lists it.
      companion(2, 'interface:\n  display_name: "Two"\n'),
      skillRow(3, 300),
      // A companion that does not parse: counted, because a budget never under-counts
      // on a parse failure.
      companion(3, "policy: [unclosed\n"),
      skillRow(4, 400),
      // An explicit `true` is not the hiding policy.
      companion(4, "policy:\n  allow_implicit_invocation: true\n"),
      skillRow(5, 500),
    ];

    const shown = shownSkillRows(rows);

    expect(shown.map((row) => row.path)).not.toContain(".agents/skills/st-fixture-1/SKILL.md");
    expect(shown.map((row) => row.path)).not.toContain(
      ".agents/skills/st-fixture-1/agents/openai.yaml",
    );
    // Folders 2 to 5 stay listed: 4 SKILL.md rows of name 12 + description + 3.
    expect(skillsListCharacters(shown)).toBe(
      12 + 200 + 3 + (12 + 300 + 3) + (12 + 400 + 3) + (12 + 500 + 3),
    );
    expect(skillsListCharacters(rows) - skillsListCharacters(shown)).toBe(12 + 100 + 3);
  });

  /** One corpus-shaped skill or command, with a description of `length` characters. */
  function listedArtifact(id: string, type: "skill" | "command", length: number): string {
    return [
      "---",
      `id: ${id}`,
      `type: ${type}`,
      `description: "${"d".repeat(length)}"`,
      "tags: [orchestration]",
      "load: on-demand",
      `obsolete_when: fixture ${id} trigger`,
      "---",
      "",
      `# ${id}`,
      "",
      "Fixture body.",
      "",
    ].join("\n");
  }

  /**
   * A corpus with one core skill, plus the given pack roots, selected whole, and the
   * core plan those packs would produce. The pack skills' `.agents/skills/` rows are
   * added to the core plan by hand: `buildCoreEmissionPlan` reads pack skills only
   * from INSTALLED packs (receipts under the repo), which a residue-level suite has no
   * install verb to write; the shape built here is the one `projectOnePackSkill`
   * emits — `name` from the directory, every file of the folder as its own row. The
   * pack roots still reach the residue context, which is where the attribution reads.
   */
  async function packedPlan(
    packs: Record<string, Record<string, string>>,
    selected: { skills: string[]; commands?: string[] },
  ): Promise<{ ctx: EmissionContext; core: CoreEmissionPlan }> {
    const temp = getTemp();
    const files: Record<string, string> = {
      "corpus/charter/stamity-charter.md": CHARTER_FIXTURE,
      "corpus/skills/st-core-one/SKILL.md": listedArtifact("core-one", "skill", 100),
    };
    const packRows: CoreEmissionPlan["skills"] = [];
    for (const [pack, packFiles] of Object.entries(packs)) {
      for (const [rel, body] of Object.entries(packFiles)) {
        files[`packs/${pack}/${rel}`] = body;
        const [kind, dir, ...rest] = rel.split("/");
        if (kind !== "skills" || dir === undefined) continue;
        const id = dir.slice("st-".length);
        const description = /^description: "(.*)"$/mu.exec(body)?.[1];
        packRows.push({
          path: `${SKILLS_PROJECTION_DIR}/${dir}/${rest.join("/")}`,
          content:
            rest.join("/") === "SKILL.md"
              ? `---\nname: ${dir}\ndescription: ${description ?? ""}\n---\n\nFixture body.\n`
              : body,
          artifactId: id,
          artifactType: "skill",
        });
      }
    }
    await temp.seedFiles(files);
    const ctx = ctxOf({
      contentRoot: temp.path("corpus"),
      rules: [],
      skills: ["core-one", ...selected.skills],
      commands: selected.commands ?? [],
    });
    ctx.contentRoot = {
      root: temp.path("corpus"),
      packRoots: Object.keys(packs).map((pack) => ({ pack, root: temp.path(`packs/${pack}`) })),
    };
    const plan = await buildCoreEmissionPlan(ctx);
    return { ctx, core: { ...plan, skills: [...plan.skills, ...packRows] } };
  }

  /** `count` pack skills `st-<prefix>-<n>`, each with a 900-character description. */
  function packSkills(prefix: string, count: number, companion?: string): Record<string, string> {
    const files: Record<string, string> = {};
    for (let n = 1; n <= count; n += 1) {
      files[`skills/st-${prefix}-${n}/SKILL.md`] = listedArtifact(`${prefix}-${n}`, "skill", 900);
      if (companion !== undefined) files[`skills/st-${prefix}-${n}/agents/openai.yaml`] = companion;
    }
    return files;
  }

  it("names each installed pack's share and the core's in the refusal, keeping the pinned total", async () => {
    // Two packs, so the attribution is per pack and not one lump: acme-demo's eight
    // 900-character skills and beta-tools' one take the list past 8,000 together.
    const { ctx, core } = await packedPlan(
      { "acme-demo": packSkills("acme-skill", 8), "beta-tools": packSkills("beta-skill", 1) },
      {
        skills: [
          ...Array.from({ length: 8 }, (_, index) => `acme-skill-${index + 1}`),
          "beta-skill-1",
        ],
      },
    );
    const total = skillsListCharacters(shownSkillRows(core.skills));
    const shareOf = (prefix: string): number =>
      skillsListCharacters(core.skills.filter((row) => row.artifactId.startsWith(prefix)));
    // Non-degenerate: every share is non-zero, and the three add up to the total.
    const acme = shareOf("acme-skill-");
    const beta = shareOf("beta-skill-");
    const coreShare = shareOf("core-one");
    expect(acme).toBe(8 * (15 + 900 + 3));
    expect(beta).toBe(15 + 900 + 3);
    expect(coreShare).toBe(11 + 100 + 3);
    expect(acme + beta + coreShare).toBe(total);
    expect(total).toBeGreaterThan(CODEX_SKILLS_LIST_BUDGET_CHARS);

    const refusal = await codexResiduePlanner.planResidue(core, ctx).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(refusal).toBeInstanceOf(EngineError);
    const message = (refusal as EngineError).message;
    expect(message).toContain(`is ${total} characters; this setup caps it at ${CODEX_SKILLS_LIST_BUDGET_CHARS}`);
    expect(message).toContain(`the core selection takes ${coreShare} characters (1 skill)`);
    expect(message).toContain(
      `installed packs add: acme-demo ${acme} characters (8 skills), ` +
        `beta-tools ${beta} characters (1 skill)`,
    );
    // TEST CHANGE, justified: REQ-PLUGIN-048 (inbox row 486) — the remedy named the bare
    // `stamity clean --pack <id>`, which runs only where a global install put the binary; it now
    // names the pinned call from the adapter's own CLI context, as every other remedy does.
    expect(message).toContain(`\`npx -y @zomarit/stamity@${ENGINE_VERSION} clean --pack <id>\``);
    expect(message).not.toContain("`stamity clean");
    expect(message).toContain('`ruleDelivery: "always-on"`');

    // A registry fork's context carries its registry into the same remedy.
    const forked = await codexResiduePlanner
      .planResidue(core, { ...ctx, packageName: "@acme/stamity", npmRegistry: "https://npm.pkg.github.com" })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect((forked as EngineError).message).toContain(
      `\`npx -y --@acme:registry=https://npm.pkg.github.com @acme/stamity@${ENGINE_VERSION} clean --pack <id>\``,
    );
  });

  it("names the core's share only when no pack is installed", async () => {
    const rows = Array.from({ length: 20 }, (_, index) => skillRow(index, 435));
    const total = skillsListCharacters(rows);
    const core: CoreEmissionPlan = { ...coreWithHooks(hooksPlan([], [])), skills: rows };
    const ctx = ctxOf({ contentRoot: await seedCorpus(), ruleDelivery: "on-demand" });

    const refusal = await codexResiduePlanner.planResidue(core, ctx).then(
      () => undefined,
      (error: unknown) => error,
    );

    const message = (refusal as EngineError).message;
    expect(message).toContain(`the core selection takes ${total} characters (20 skills)`);
    expect(message).not.toContain("installed packs add");
    expect(message).not.toContain("clean --pack");
    expect(message).toContain("Narrow the content selection");
  });

  it("does not count a pack skill that ships its own hiding policy, nor a pack's commands", async () => {
    const hidden = "policy:\n  allow_implicit_invocation: false\n";
    const commands: Record<string, string> = {};
    for (let n = 1; n <= 3; n += 1) {
      commands[`commands/st-acme-cmd-${n}.md`] = listedArtifact(`acme-cmd-${n}`, "command", 900);
    }
    const { ctx, core } = await packedPlan(
      { "acme-demo": { ...packSkills("acme-skill", 9, hidden), ...commands } },
      {
        skills: Array.from({ length: 9 }, (_, index) => `acme-skill-${index + 1}`),
        commands: ["acme-cmd-1", "acme-cmd-2", "acme-cmd-3"],
      },
    );
    // Non-degenerate: counted whole, the pack skills alone are past the cap.
    expect(skillsListCharacters(core.skills)).toBeGreaterThan(CODEX_SKILLS_LIST_BUDGET_CHARS);

    const residue = await codexResiduePlanner.planResidue(core, ctx);

    const listed = [...core.skills, ...residue.outputs.filter((row) => row.path.startsWith(`${SKILLS_PROJECTION_DIR}/`))];
    expect(listed.filter((row) => row.path.endsWith("/SKILL.md"))).toHaveLength(1 + 9 + 3);
    expect(skillsListCharacters(shownSkillRows(listed))).toBe(11 + 100 + 3);
  });
});

describe("the omission notice under on-demand", () => {
  it("names the on-demand home of a dropped rule that has a skill row", () => {
    // An over-budget root, so the shaper has to drop: two big rules, one of them
    // also projected as a skill (the shape a floor-tagged glob-less rule takes
    // when claude demotes it and codex keeps it).
    const fat = "F".repeat(CODEX_AGENTS_MD_BUDGET_BYTES);
    const items = [
      ruleItem("kept", { tags: ["floor:security"], body: fat }),
      ruleItem("elsewhere", { body: fat }),
    ];

    const { rootReplacement } = downConvertRules(items, "# Charter\n", [], new Set(["elsewhere"]));

    expect(rootReplacement).toContain("`elsewhere` (on demand at .agents/skills/stamity-elsewhere/)");
    expect(rootReplacement).not.toContain("`kept` (on demand");
  });

  it("names a dropped rule plainly when nothing projected it", () => {
    const fat = "F".repeat(CODEX_AGENTS_MD_BUDGET_BYTES);
    const items = [
      ruleItem("kept", { tags: ["floor:security"], body: fat }),
      ruleItem("gone", { body: fat }),
    ];

    const { rootReplacement } = downConvertRules(items, "# Charter\n", []);

    expect(rootReplacement).toContain("`gone`");
    expect(rootReplacement).not.toContain("on demand at");
  });
});

describe("codex residue under plugin ownership", () => {
  it("drops the agent and hook rows the record names and keeps the composed config", async () => {
    const contentRoot = await seedCorpus();
    const ctx = ctxOf({
      contentRoot,
      plugin: {
        mode: "plugin-backed",
        clients: { codex: { version: "1.9.0", classes: ["agent", "hooks"] } },
      },
    });

    const paths = (await codexResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx))
      .outputs.map((row) => row.path);

    expect(paths.filter((path) => path.startsWith(`${CODEX_AGENTS_DIR}/`))).toEqual([]);
    expect(paths).not.toContain(CODEX_HOOKS_FILE);
    expect(paths.filter((path) => path.includes("/hooks/codex/"))).toEqual([]);

    // `.codex/config.toml` is this client's WHOLE configuration — MCP tables,
    // the features flag, the subagent pointers — and this adapter owns it whole
    // under either install mode, so it is not on the hook id list.
    expect(paths).toContain(CODEX_CONFIG_FILE);
  });
});
