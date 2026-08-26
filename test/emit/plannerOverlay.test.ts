import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADAPTER_REGISTRY } from "../../src/adapters/registry.ts";
import { contentRootsOf, type ContentRoots } from "../../src/content/catalog.ts";
import {
  composeEmissionPlanner,
  type AdapterDialectFacts,
  type EmissionContext,
  type ResiduePlanner,
} from "../../src/emit/planner.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import { applyPackInstall, planPackInstall } from "../../src/pack/install.ts";
import type { AdapterOutput } from "../../src/types/content.ts";
import type { Tool } from "../../src/types/core.ts";
import type { SetupManifest } from "../../src/types/manifest.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * What an INSTALLED PACK does to the rest of the emission — the two seams in
 * `src/emit/planner.ts` that only a pack-having repo reaches, and that a
 * pack-free suite therefore cannot see fail.
 *
 * 1. `buildCoreEmissionPlan` hands the resolved pack agents to
 *    `planHooksInfra`, so the emitted policy document carries a row for every
 *    agent an install added. Without the hand-off the document holds the
 *    shipped roster alone and the generated guard answers `NO_POLICY` for the
 *    pack's agents: a pack that installed cleanly and can do nothing.
 * 2. `residueContext` rebuilds the content-root spec around the pack roots,
 *    and every part it does not carry is a layer that disappears for
 *    pack-having repos alone. The override tree is the one that matters:
 *    dropping it does not error, it silently emits the SHIPPED body under an
 *    id the repo replaced.
 *
 * Both are asserted as BEHAVIOUR, and both in the paired shape the defects
 * hid in — the same fixture with and without a pack installed, because either
 * half alone passes on the broken code. Real temp directories throughout: an
 * installed pack is ledger state plus bytes under `.stamity/packs/`, and the
 * guard is a script another runtime executes, so the only assertion worth
 * making about it is to run it.
 *
 * The first seam is also covered end to end by the install-smoke lane
 * (`test/pack/installSmoke.e2e.test.ts`), through the real bin over a real
 * `sync`. That case proves the whole pipeline and costs a child-process
 * install to do it; these run in-process against the plan, so the composer's
 * hand-off has a guard that fails in under a second and names the seam that
 * dropped it rather than the command that noticed.
 */

const getRepo = useTempDir("planner-overlay");

const FIXED_NOW = new Date("2026-08-17T00:00:00.000Z");
const ENGINE_VERSION = "0.0.0-test";

/** Core rows the cases below read out of a plan. */
const POLICY_DOC = ".stamity/generated/agent-tool-policies.json";
const CLAUDE_GUARD = ".stamity/generated/hooks/claude/stamity-pre-tool-use-guard.mjs";

/** A bundled rule every client emits with no `tools:` limit — the override takes its id. */
const SHADOWED_RULE_ID = "testing";

/** A sentence that appears in the authored body and nowhere in the corpus. */
const USER_MARKER = "House rule: name every branch after the ticket it closes.";

const sha256 = (body: string): string => createHash("sha256").update(body, "utf8").digest("hex");

// ── Fixtures ─────────────────────────────────────────────────────

/** An agent as a pack ships it: bare id, capabilities declared in frontmatter. */
function packAgent(id: string, capabilities: readonly string[]): string {
  return [
    "---",
    `id: ${id}`,
    `description: synthetic pack ${id} agent`,
    "tags: [review]",
    `capabilities: [${capabilities.join(", ")}]`,
    "---",
    "",
    `# ${id}`,
    "",
    "Survey the repository and report.",
    "",
  ].join("\n");
}

/** A pack-supplied rule — glob-scoped, so every client has somewhere to put it. */
function packRule(id: string): string {
  return [
    "---",
    `id: ${id}`,
    "type: rule",
    "description: Pack-supplied deployment guard rule.",
    "tags:",
    "  - devops",
    "load: on-demand",
    "obsolete_when: the deploy pipeline enforces it",
    "scope: conditional",
    'globs: ["**/*.md"]',
    "---",
    "",
    "Watch the rollout counters before declaring the deploy done.",
    "",
  ].join("\n");
}

/** The repo's own body for a shipped rule id — the customization layer's payload. */
function override(id: string): string {
  return [
    "---",
    `id: ${id}`,
    "type: rule",
    "description: The house version of this rule, authored in this repo.",
    "tags:",
    "  - review",
    "load: on-demand",
    "obsolete_when: the repository's own linter enforces it",
    "scope: conditional",
    'globs: ["**/*.md"]',
    "---",
    "",
    USER_MARKER,
    "",
  ].join("\n");
}

/**
 * Stage a pack this repo does not ship, with an integrity map computed over its
 * own files, and return the absolute directory `planPackInstall` accepts.
 */
async function stagePack(
  packId: string,
  files: Record<string, string>,
  permissions?: { toolFootprint: string[] },
): Promise<string> {
  const repo = getRepo();
  const manifest = {
    name: packId,
    version: "1.0.0",
    integrity: Object.fromEntries(Object.entries(files).map(([rel, body]) => [rel, sha256(body)])),
    ...(permissions === undefined ? {} : { permissions }),
  };
  await repo.seedFiles({
    ...Object.fromEntries(
      Object.entries(files).map(([rel, body]) => [`pack-src/${packId}/${rel}`, body]),
    ),
    [`pack-src/${packId}/pack.json`]: `${JSON.stringify(manifest, null, 2)}\n`,
  });
  return repo.path("pack-src", packId);
}

/** Install through the real plan/apply path, so the ledger state is a user's. */
async function installPack(packDir: string, manifest: SetupManifest): Promise<SetupManifest> {
  const plan = await planPackInstall(getRepo().dir, packDir, { allowUntrusted: true });
  expect(plan.collisions).toEqual([]);
  const applied = await applyPackInstall(getRepo().dir, plan, manifest, {
    engineVersion: ENGINE_VERSION,
    now: FIXED_NOW,
  });
  expect(applied.result.errors).toEqual([]);
  expect(applied.result.installed).toBe(true);
  return applied.manifest;
}

function manifestFor(tools: Tool[]): SetupManifest {
  return createManifest({
    tools,
    // Empty on purpose: a pack artifact is admitted by installation and a user
    // artifact by presence, so an empty selection is the strictest statement
    // that neither reached the plan through the selection record.
    selection: { items: { agent: [], skill: [], rule: [], command: [] } },
    generatorVersion: ENGINE_VERSION,
    now: FIXED_NOW,
  });
}

function ctxOf(manifest: SetupManifest, contentRoot?: ContentRoots): EmissionContext {
  return {
    rootDir: getRepo().dir,
    manifest,
    engineVersion: ENGINE_VERSION,
    facts: { greenfield: true, monorepoPackages: [] },
    ...(contentRoot === undefined ? {} : { contentRoot }),
  };
}

/** The repo's override tree, as the CLI seam names it. */
const overrideRootOf = (): string => join(getRepo().dir, ".stamity", "overrides");

const contentOf = (plan: readonly AdapterOutput[], path: string): string => {
  const row = plan.find((output) => output.path === path);
  expect(row, `plan carries no row for ${path}`).toBeDefined();
  return row!.content;
};

// ── Guard execution ──────────────────────────────────────────────

interface PolicyDocument {
  schema: string;
  policies: { agentId: string; allow: string[]; source?: { kind: string; packId: string } }[];
}

interface GuardResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Write the two planned rows the guard needs into the repo at the paths the
 * plan names, then run it exactly as a client would: JSON payload on stdin,
 * verdict in the exit status. The relative layout is the subject — the guard
 * resolves the policy document from its own location — so nothing here may
 * relocate either file.
 */
async function placeAndRunGuard(
  plan: readonly AdapterOutput[],
  agentId: string,
  tool: string,
): Promise<GuardResult> {
  const repo = getRepo();
  await Promise.all(
    [POLICY_DOC, CLAUDE_GUARD].map(async (path) => {
      const target = join(repo.dir, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contentOf(plan, path), "utf8");
    }),
  );
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env["STAMITY_REPO_ROOT"];
  const result = spawnSync(process.execPath, [join(repo.dir, CLAUDE_GUARD)], {
    input: JSON.stringify({ agent_type: agentId, agent_id: `${agentId}-01`, tool_name: tool }),
    env,
    encoding: "utf8",
  });
  return { code: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

/** The refusal a blocked call reported, parsed off stderr. */
function refusal(result: GuardResult): Record<string, unknown> {
  return JSON.parse(result.stderr.trim().split("\n").at(-1) ?? "") as Record<string, unknown>;
}

// ── Pack agent grants reach the policy document ──────────────────

describe("pack agents in the emitted policy document", () => {
  const PACK_ID = "fieldpack";
  const AGENT_ID = "stamity-fieldops";

  it("carries an installed pack agent's grant into the document, and the guard admits it", async () => {
    const packDir = await stagePack(
      PACK_ID,
      { "agents/stamity-fieldops.md": packAgent("fieldops", ["read", "execute"]) },
      { toolFootprint: ["read", "execute"] },
    );
    const manifest = await installPack(packDir, manifestFor(["claude"]));

    // Core-only composition: the policy document is a shared CORE row, so no
    // adapter participates in producing it.
    const plan = await composeEmissionPlanner({}).plan(ctxOf(manifest));
    const document = JSON.parse(contentOf(plan, POLICY_DOC)) as PolicyDocument;

    const row = document.policies.find((entry) => entry.agentId === AGENT_ID);
    expect(row?.allow, AGENT_ID).toEqual(["read", "execute"]);
    expect(row?.source).toEqual({ kind: "pack", packId: PACK_ID });
    // The shipped roster is untouched by the install: this is an addition to
    // the document, never a replacement of it.
    expect(document.policies.map((entry) => entry.agentId)).toContain("stamity-reviewer");

    // The enforcement point itself, on the bytes the plan emits. `Read` maps to
    // the granted `read` category, so the guard stays silent and exits 0.
    expect(await placeAndRunGuard(plan, AGENT_ID, "Read")).toEqual({
      code: 0,
      stdout: "",
      stderr: "",
    });

    // And the grant is BOUNDED, not blanket — the distinction that separates a
    // real row from a missing one. `Write` maps to `edit`, which the pack did
    // not declare: the refusal is CATEGORY_DENIED (a row exists and does not
    // reach), never NO_POLICY (no row at all, the symptom this case pins).
    const denied = await placeAndRunGuard(plan, AGENT_ID, "Write");
    expect(denied.code).toBe(2);
    expect(refusal(denied)).toMatchObject({
      agentId: AGENT_ID,
      tool: "Write",
      category: "edit",
      reasonCode: "CATEGORY_DENIED",
    });
  });

  it("grants the intersection, not the pack's declared footprint", async () => {
    // Non-degenerate on both sides: the pack discloses three categories and the
    // agent claims two of them, so the row can only be right by intersecting.
    // A row that echoed the FOOTPRINT would grant `edit` here — the widening an
    // operator never read on any agent's frontmatter. (The mirror case, an
    // agent claiming more than its pack disclosed, cannot reach emission at
    // all: `src/pack/permissions.ts::checkAgentCapabilities` refuses that pack
    // at install, which is why it is not staged here.)
    const packDir = await stagePack(
      PACK_ID,
      { "agents/stamity-fieldops.md": packAgent("fieldops", ["read", "execute"]) },
      { toolFootprint: ["read", "edit", "execute"] },
    );
    const manifest = await installPack(packDir, manifestFor(["claude"]));

    const plan = await composeEmissionPlanner({}).plan(ctxOf(manifest));
    const document = JSON.parse(contentOf(plan, POLICY_DOC)) as PolicyDocument;

    expect(document.policies.find((entry) => entry.agentId === AGENT_ID)?.allow).toEqual([
      "read",
      "execute",
    ]);
  });

  it("emits the shipped roster alone when no pack is installed", async () => {
    // The other half of the pairing: the hand-off adds rows for installs and
    // invents none, so a pack-free repo's document is exactly the roster.
    const plan = await composeEmissionPlanner({}).plan(ctxOf(manifestFor(["claude"])));
    const document = JSON.parse(contentOf(plan, POLICY_DOC)) as PolicyDocument;

    expect(document.policies.some((entry) => entry.source !== undefined)).toBe(false);
    expect(document.policies.map((entry) => entry.agentId)).toContain("stamity-reviewer");

    const refused = await placeAndRunGuard(plan, AGENT_ID, "Read");
    expect(refused.code).toBe(2);
    expect(refusal(refused)).toMatchObject({ agentId: AGENT_ID, reasonCode: "NO_POLICY" });
  });
});

// ── The override layer survives an installed pack ────────────────

describe("override layer under an installed pack", () => {
  const PACK_ID = "opspack";

  it("emits the authored body to every client with and without a pack installed", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      [`.stamity/overrides/rules/${SHADOWED_RULE_ID}.md`]: override(SHADOWED_RULE_ID),
    });
    const packDir = await stagePack(PACK_ID, {
      "rules/stamity-opsguard.md": packRule("opsguard"),
    });
    const planner = composeEmissionPlanner(ADAPTER_REGISTRY);
    const tools: Tool[] = ["claude", "cursor", "copilot", "codex"];
    const contentRoot: ContentRoots = { overrideRoot: overrideRootOf() };

    // Before: the layer reaches all four clients through four dialects.
    const before = await planner.plan(ctxOf(manifestFor(tools), contentRoot));
    const carrying = (plan: readonly AdapterOutput[]): string[] =>
      plan.filter((row) => row.content.includes(USER_MARKER)).map((row) => row.path).toSorted();
    expect(carrying(before)).toEqual([
      ".claude/rules/stamity-testing.md",
      ".cursor/rules/stamity-testing.mdc",
      ".github/instructions/stamity-testing.instructions.md",
      // codex down-converts rules into the root appendix rather than a file.
      "AGENTS.md",
    ]);

    // After: same repo, same fixture, one pack installed.
    const manifest = await installPack(packDir, manifestFor(tools));
    const after = await planner.plan(ctxOf(manifest, contentRoot));

    // The pack arrived — which is what makes the residue rebuild run at all,
    // so this is the precondition of the assertion below, not decoration.
    expect(after.some((row) => row.path.includes("opsguard"))).toBe(true);
    // And the layer is still there, on every path it reached before.
    expect(carrying(after)).toEqual(carrying(before));
  });

  it("keeps the SHIPPED body out of the plan for an overridden id, pack installed", async () => {
    // Precedence, not merely presence: the failure mode was the shipped body
    // emitting under the id the repo replaced, which a marker-presence check
    // alone would call green if both bodies landed.
    const repo = getRepo();
    await repo.seedFiles({
      [`.stamity/overrides/rules/${SHADOWED_RULE_ID}.md`]: override(SHADOWED_RULE_ID),
    });
    const packDir = await stagePack(PACK_ID, {
      "rules/stamity-opsguard.md": packRule("opsguard"),
    });
    const manifest = await installPack(packDir, manifestFor(["claude"]));

    const plan = await composeEmissionPlanner(ADAPTER_REGISTRY).plan(
      ctxOf(manifest, { overrideRoot: overrideRootOf() }),
    );

    const rule = contentOf(plan, `.claude/rules/stamity-${SHADOWED_RULE_ID}.md`);
    expect(rule).toContain(USER_MARKER);
    // One row under that id, carrying one body.
    expect(plan.filter((row) => row.path.includes(SHADOWED_RULE_ID))).toHaveLength(1);
  });

  it("hands residue planners all three content-root parts once a pack is installed", async () => {
    // The seam itself, localized: whatever an adapter does with the spec, the
    // composer must not narrow it. Asserted through a fake residue so a failure
    // reads as "the composer dropped a part" rather than as an adapter defect.
    const packDir = await stagePack(PACK_ID, {
      "rules/stamity-opsguard.md": packRule("opsguard"),
    });
    const manifest = await installPack(packDir, manifestFor(["claude"]));
    const seen: (string | ContentRoots | undefined)[] = [];
    const capture: ResiduePlanner = {
      tool: "claude",
      facts: fakeFacts("claude"),
      planResidue: async (_core, ctx) => {
        seen.push(ctx.contentRoot);
        return { outputs: [] };
      },
    };
    const planner = composeEmissionPlanner({ claude: capture });

    await planner.plan(ctxOf(manifest, { overrideRoot: overrideRootOf() }));
    const withOverride = contentRootsOf(seen.at(-1));
    expect(withOverride.overrideRoot).toBe(overrideRootOf());
    expect(withOverride.packRoots.map((root) => root.pack)).toEqual([PACK_ID]);

    // The other leg of the same rebuild: a pack-having repo that named no
    // override root still gets exactly the two parts it passed in.
    await planner.plan(ctxOf(manifest));
    const withoutOverride = contentRootsOf(seen.at(-1));
    expect(withoutOverride.overrideRoot).toBeUndefined();
    expect(withoutOverride.packRoots.map((root) => root.pack)).toEqual([PACK_ID]);

    // And with no pack at all the context is passed through by identity, which
    // is what makes a pack-free plan byte-identical to a pack-unaware build.
    const bare = ctxOf(manifestFor(["claude"]), { overrideRoot: overrideRootOf() });
    await composeEmissionPlanner({ claude: capture }).plan(bare);
    expect(seen.at(-1)).toBe(bare.contentRoot);
  });
});

/** Dialect facts for the capture planner; no adapter behaviour depends on them. */
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
    citations: [{ url: "https://example.com/docs", accessDate: "2026-08-17" }],
  };
}
