import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { ADAPTER_REGISTRY } from "../../src/adapters/registry.ts";
import { buildContentIndex } from "../../src/content/catalog.ts";
import { composeEmissionPlanner, type EmissionContext } from "../../src/emit/planner.ts";
import { computeReclaimCandidates } from "../../src/manifest/ledger.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import { getServerMeta, resolveServerMeta } from "../../src/mcp/catalog.ts";
import { applyPackInstall, planPackInstall, planPackRemoval } from "../../src/pack/install.ts";
import {
  discoverInstalledPacks,
  discoverInstalledPacksWithPolicy,
  packContentRoots,
  packHookDefinitions,
  packMcpServers,
  resolveInstalledPackContent,
} from "../../src/pack/projection.ts";
import { outputOwners, type AdapterOutput, type ContentSelection } from "../../src/types/content.ts";
import type { Tool } from "../../src/types/core.ts";
import { EngineError } from "../../src/types/errors.ts";
import { isPackOwner, type LedgerEntry, type SetupManifest } from "../../src/types/manifest.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Live-emission wiring: installed pack content joins the emission
 * corpus. The suite runs the REAL machinery end to end — the real install
 * path (`planPackInstall`/`applyPackInstall`) into a temp repo, the real
 * four-adapter registry composed by the real planner — over a seeded fixture
 * corpus, so every assertion is about bytes the shipped pipeline produces.
 */

const getTemp = useTempDir("pack-projection");

const ENGINE_VERSION = "0.0.0-test";
const FIXED_NOW = new Date("2026-08-15T00:00:00.000Z");

// ── Fixture corpus ─────────────────────────────────────────────

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

/** Distinctive body sentinels, so content assertions cannot false-positive. */
const BASE_RULE_SENTINEL = "BASE-RULE-BODY";
const GUARD_RULE_SENTINEL = "GUARD-RULE-BODY";

/**
 * Corpus rule sized so it fits the codex 32,768-byte root budget alone but
 * not beside the pack rule — one long line, staying far under the cursor
 * 500-line rule cap.
 */
const BASE_RULE_BODY = `${BASE_RULE_SENTINEL} ${"Keep the runway clear and the checklists current. ".repeat(400)}`;

/** Pack rule body: higher precedence, sized to force the budget choice. */
const GUARD_RULE_BODY = `${GUARD_RULE_SENTINEL} ${"Route releases through the paved path and record the outcome. ".repeat(240)}`;

function artifact(head: Record<string, string>, body: string): string {
  const lines = Object.entries(head).map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join("\n")}\n---\n\n${body}\n`;
}

function corpusFiles(): Record<string, string> {
  return {
    "corpus/charter/stamity-charter.md": CHARTER_FIXTURE,
    "corpus/skills/stamity-alpha/SKILL.md": artifact(
      { id: "alpha", description: "fixture skill", tags: "[implementation]" },
      "# Alpha Skill\n\nDo the thing.",
    ),
    "corpus/rules/stamity-base.md": artifact(
      { id: "base", description: "fixture base rule", tags: "[implementation]", precedence: "low" },
      BASE_RULE_BODY,
    ),
    "corpus/agents/stamity-scout.md": artifact(
      { id: "scout", description: "fixture corpus agent", tags: "[review]" },
      "# Scout\n\nSurvey the repository and report.",
    ),
    "corpus/commands/stamity-ship.md": artifact(
      { id: "ship", description: "fixture corpus command", tags: "[devops]" },
      "# Ship\n\nCut the build and hand it over.",
    ),
  };
}

// ── Fixture packs ──────────────────────────────────────────────

const RUNBOOK_SKILL = artifact(
  { id: "runbook", description: "pack runbook skill", tags: "[devops]" },
  "# Runbook\n\nFollow the runbook steps in order.",
);
const RUNBOOK_NOTES = "Reference notes for the runbook.\n";

/**
 * The six top-level keys the Agent Skills spec permits; a strict validator
 * rejects the whole file on any other (code.claude.com/docs/en/skills § "Using
 * skill frontmatter outside Claude Code", accessed 2026-08-16). Held here as
 * the pack lane's own copy of the bar, so this suite fails if the projection
 * ever widens the head rather than following it silently.
 */
const SPEC_FRONTMATTER_KEYS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "allowed-tools",
  "metadata",
]);

/** Distinctive argv token, so the hook-liveness assertions cannot false-positive. */
const PACK_HOOK_SENTINEL = "--pack-hook-sentinel";

/**
 * The committed script the pack's hook runs.
 *
 * It belongs to the REPO, not to the pack, and that is the shape the product
 * enforces from both ends. `src/shared/launcherAllowlist.ts` requires every hook
 * command to name exactly one repo-contained script that exists, so a bare
 * `["node", "--flag"]` is refused `NO_SCRIPT_ARGUMENT` and never reaches a
 * client config; and the `hooks` pack class accepts only `.json`/`.yaml`/`.yml`
 * (`src/pack/manifest.ts` → `HOOK_DEFINITION_EXTENSIONS`), so a pack cannot ship
 * an executable of its own. A pack hook therefore names code the operator
 * already committed — which is exactly the reviewable property both gates exist
 * for, and what this fixture has to model to test the seam honestly.
 */
const PACK_HOOK_SCRIPT = ".stamity/hooks/pack-probe.mjs";

/** Body of {@link PACK_HOOK_SCRIPT}: a real file, never run by these tests. */
const PACK_HOOK_SCRIPT_BODY = "process.exit(0)\n";

/**
 * The tool footprint the fixture packs disclose in `pack.json` — the ceiling
 * every pack agent's grant is bounded by, and the disclosure the install
 * preview shows before a byte lands. Deliberately WIDER than the sentinel
 * agent's own `capabilities:` list, so an emitted grant equal to this set
 * would mean the footprint was being handed out as the grant.
 */
const PACK_FOOTPRINT = ["read", "edit", "execute"] as const;

/** The pack-supplied MCP server id, and the pin every dialect must carry verbatim. */
const PACK_SERVER_ID = "acme-telemetry";
const PACK_SERVER_PACKAGE = "@acme/telemetry-mcp";
const PACK_SERVER_VERSION = "3.2.1";
const PACK_SERVER_SPEC = `${PACK_SERVER_PACKAGE}@${PACK_SERVER_VERSION}`;
const PACK_SERVER_VAR = "ACME_TELEMETRY_TOKEN";

/**
 * A pack-supplied server definition, held to the curated catalog's own bar:
 * exact pin against an exact package name, a launcher that is not a shell, and
 * credentials by `${env:VAR}` reference only.
 */
function packServerJson(overrides: Record<string, unknown> = {}): string {
  return `${JSON.stringify(
    {
      id: PACK_SERVER_ID,
      description: "Deployment telemetry queries.",
      command: "npx",
      args: ["-y", PACK_SERVER_SPEC, "--token", `\${env:${PACK_SERVER_VAR}}`],
      transport: "stdio",
      requiresEnv: [{ name: PACK_SERVER_VAR, description: "Read-only telemetry API token" }],
      pinnedVersion: PACK_SERVER_VERSION,
      packageNameLock: PACK_SERVER_PACKAGE,
      blastRadius: "Low — read-only telemetry queries against a staging project.",
      docsUrl: "https://example.invalid/acme-telemetry",
      ...overrides,
    },
    null,
    2,
  )}\n`;
}

/** Pack-relative file map for the main fixture pack. */
function opspackFiles(): Record<string, string> {
  return {
    // `capabilities:` is deliberately NARROWER than PACK_FOOTPRINT below: the
    // install-ingress gate already refuses the other direction, so the
    // intersection this side proves is that a grant is the agent's own claim
    // and not the whole footprint its pack disclosed.
    "agents/stamity-sentinel.md": artifact(
      {
        id: "sentinel",
        description: "pack sentinel agent",
        tags: "[review]",
        capabilities: "[read, edit]",
      },
      "# Sentinel\n\nWatch the deployment and report drift.",
    ),
    "rules/stamity-guard.md": artifact(
      { id: "guard", description: "pack guard rule", tags: "[devops]", precedence: "critical" },
      GUARD_RULE_BODY,
    ),
    "commands/stamity-launch.md": artifact(
      { id: "launch", description: "pack launch command", tags: "[devops]" },
      "# Launch\n\nStart the rollout and watch the counters.",
    ),
    "skills/stamity-runbook/SKILL.md": RUNBOOK_SKILL,
    "skills/stamity-runbook/references/notes.md": RUNBOOK_NOTES,
    // mcp_servers/ is back in the fixture because it is back in the class set
    // (the live-emission invariant): the MCP substrate now resolves ids
    // from pack supply beside the curated catalog, so an installed definition
    // has a consuming seam (src/pack/projection.ts -> packMcpServers) and no
    // longer installs dead. The suite below is what proves the seam is live.
    "mcp_servers/telemetry.json": packServerJson(),
    "hooks/hooks.json": `${JSON.stringify(
      {
        hooks: [
          {
            event: "pre_tool_use",
            matcher: "Bash",
            command: ["node", PACK_HOOK_SCRIPT, PACK_HOOK_SENTINEL],
            timeoutMs: 3000,
          },
        ],
      },
      null,
      2,
    )}\n`,
  };
}

function zpackFiles(): Record<string, string> {
  return {
    "agents/stamity-zeta.md": artifact(
      { id: "zeta", description: "second pack agent", tags: "[review]" },
      "# Zeta\n\nSecond pack fixture agent.",
    ),
  };
}

/** `pack.json` with a computed integrity map over the given file set. */
function packManifestJson(name: string, files: Record<string, string>): string {
  const integrity = Object.fromEntries(
    Object.entries(files).map(([relPath, content]) => [
      relPath,
      createHash("sha256").update(content, "utf8").digest("hex"),
    ]),
  );
  return `${JSON.stringify(
    {
      name,
      version: "1.0.0",
      integrity,
      permissions: { toolFootprint: [...PACK_FOOTPRINT] },
    },
    null,
    2,
  )}\n`;
}

// ── Harness ────────────────────────────────────────────────────

const CORPUS_SELECTION: ContentSelection = {
  items: { agent: ["scout"], skill: ["alpha"], rule: ["base"], command: ["ship"] },
};

interface Fixture {
  corpusRoot: string;
  repoRoot: string;
  /** Source directory of the un-installed fixture pack. */
  packDir: string;
  manifest: SetupManifest;
}

async function seedFixture(selection: ContentSelection = CORPUS_SELECTION): Promise<Fixture> {
  const temp = getTemp();
  const pack = opspackFiles();
  await temp.seedFiles({
    ...corpusFiles(),
    "repo/.keep": "",
    // The repo-committed script the pack's hook names. Without it the hook is
    // refused at ingress rather than armed, which is the allow-list working.
    [`repo/${PACK_HOOK_SCRIPT}`]: PACK_HOOK_SCRIPT_BODY,
    ...prefixed("pack-src/opspack", pack),
    "pack-src/opspack/pack.json": packManifestJson("opspack", pack),
  });
  return {
    corpusRoot: temp.path("corpus"),
    repoRoot: temp.path("repo"),
    packDir: temp.path("pack-src/opspack"),
    manifest: createManifest({
      tools: ["claude", "copilot"],
      selection,
      generatorVersion: ENGINE_VERSION,
      now: FIXED_NOW,
    }),
  };
}

function prefixed(prefix: string, files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([relPath, content]) => [`${prefix}/${relPath}`, content]),
  );
}

/** Run the real install path; returns the manifest carrying the pack's ledger rows. */
async function installPack(
  repoRoot: string,
  packDir: string,
  manifest: SetupManifest,
): Promise<SetupManifest> {
  const plan = await planPackInstall(repoRoot, packDir, { allowUntrusted: true });
  expect(plan.collisions).toEqual([]);
  const applied = await applyPackInstall(repoRoot, plan, manifest, {
    engineVersion: ENGINE_VERSION,
    now: FIXED_NOW,
  });
  expect(applied.result.installed).toBe(true);
  return applied.manifest;
}

function ctxOf(fixture: Fixture, manifest: SetupManifest, tools?: Tool[]): EmissionContext {
  return {
    rootDir: fixture.repoRoot,
    manifest: tools === undefined ? manifest : { ...manifest, tools },
    engineVersion: ENGINE_VERSION,
    facts: { monorepoPackages: [] },
    contentRoot: fixture.corpusRoot,
  };
}

async function planAll(ctx: EmissionContext): Promise<AdapterOutput[]> {
  return composeEmissionPlanner(ADAPTER_REGISTRY).plan(ctx);
}

const byPath = (rows: readonly AdapterOutput[]): Map<string, AdapterOutput> =>
  new Map(rows.map((row) => [row.path, row]));

/** `.claude/settings.json` read structurally — the client's own hook wiring. */
interface ClaudeSettings {
  hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]>;
}

/** Owner triples of one row, order-independent. */
function ownersOf(row: AdapterOutput): { adapter: Tool; artifactId: string; artifactType: string }[] {
  return outputOwners(row).toSorted((a, b) => (a.adapter < b.adapter ? -1 : 1));
}

/** Ledger rows a write of `rows` would record — one per owner, per the ledger contract. */
function ledgerOf(rows: readonly AdapterOutput[]): LedgerEntry[] {
  return rows.flatMap((row) =>
    outputOwners(row).map((owner) => ({
      path: row.path,
      adapter: owner.adapter,
      artifactId: owner.artifactId,
      artifactType: owner.artifactType,
    })),
  );
}

// The `seedInstalledPackState` helper was removed with the MCP consumption
// suite it existed for (see the note further down): it hand-built an
// installed state to re-gate mcp_servers definitions on read, and no other
// scenario needs a pack state the real install path cannot produce.

// ── Projection through the composed plan ───────────────────────

describe("live-emission wiring: installed packs join the emission corpus", () => {
  it("projects a pack skill into .agents/skills — spec head, verbatim body, whole directory shape, adapter-owned", async () => {
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    const rows = byPath(await planAll(ctxOf(fixture, manifest)));

    const skill = rows.get(".agents/skills/stamity-runbook/SKILL.md");
    const notes = rows.get(".agents/skills/stamity-runbook/references/notes.md");
    expect(skill).toBeDefined();
    expect(notes).toBeDefined();

    /*
     * INVERTED. This case previously asserted
     * `expect(skill!.content).toBe(RUNBOOK_SKILL)` under the comment "Verbatim:
     * the bytes previewed and installed are the bytes that emit". That pinned a
     * defect: a pack `SKILL.md` lands in the SAME `.agents/skills/` tree as a
     * corpus skill and is re-targeted into `.claude/skills/` from those same
     * bytes, so it meets the same strict validator — six permitted top-level
     * keys, whole-file rejection on any other, and `name` required
     * (code.claude.com/docs/en/skills § "Using skill frontmatter outside Claude
     * Code", accessed 2026-08-16). Pack skills are authored in the engine's own
     * vocabulary, so verbatim projection shipped installed packs that hard-fail
     * packaging while the corpus half beside them passed.
     *
     * The verbatim contract is NARROWED, not dropped, and the two halves below
     * are what hold that line: the BODY is still byte-identical to the installed
     * source (nothing the deny scan read is rewritten), and support files are
     * untouched. Only the head is reshaped, by the core lane's existing
     * projector — no pack-specific semantics (park P-G).
     */
    const head = parse(/^---\n([\s\S]*?)\n---\n/.exec(skill!.content)![1]!) as Record<
      string,
      unknown
    >;
    expect(Object.keys(head).filter((key) => !SPEC_FRONTMATTER_KEYS.has(key))).toEqual([]);
    expect(head["name"]).toBe("stamity-runbook");
    expect(head["description"]).toBe("pack runbook skill");
    // Lossless: the engine vocabulary moves under `metadata` rather than dropping.
    expect(head["metadata"]).toMatchObject({ id: "runbook", tags: ["devops"] });
    // Body verbatim: everything after the head is the installed bytes, unrewritten.
    expect(skill!.content.split(/^---\n/m)[2]).toBe(RUNBOOK_SKILL.split(/^---\n/m)[2]);
    // Support files stay byte-verbatim — the transform is the `SKILL.md` head only.
    expect(notes!.content).toBe(RUNBOOK_NOTES);

    // Adapter-owned, co-owned by every selected tool that READS this tree, like
    // any core skill row.
    //
    // TEST CHANGE, justified: `claude` used to be an owner of the
    // vendor-neutral projection even though its own dialect facts declare
    // `readsAgentsSkillsDir: false` and its adapter writes a native copy under
    // `.claude/skills/`. Owning a tree it never opens is what emitted the whole
    // projection into claude-only repositories — 18 duplicate files — and what
    // kept the tree alive after its last real reader was deselected. The
    // ownership assertion is now derived from the declaration rather than
    // hard-coding the four, so it moves with the adapters.
    const projectionReaders = fixture.manifest.tools.filter(
      (tool) => ADAPTER_REGISTRY[tool].facts.readsAgentsSkillsDir,
    );
    expect(projectionReaders).toEqual(["copilot"]);
    for (const row of [skill!, notes!]) {
      expect(ownersOf(row)).toEqual(
        projectionReaders.map((adapter) => ({
          adapter,
          artifactId: "runbook",
          artifactType: "skill",
        })),
      );
    }

    // Re-pointed from the `.agents/plugins/stamity/plugin.json` container row
    // (the container was deleted, so the case now asserts
    // the same thing — pack skill beside corpus skill, one shared projection —
    // against a surviving shared-core row). The corpus skill still projects
    // into the same tree, so the pack's arrival added to that tree rather than
    // replacing it.
    const corpusSkill = rows.get(".agents/skills/stamity-alpha/SKILL.md");
    expect(corpusSkill).toBeDefined();
    expect(ownersOf(corpusSkill!)).toEqual(
      projectionReaders.map((adapter) => ({
        adapter,
        artifactId: "alpha",
        artifactType: "skill",
      })),
    );
    expect(
      [...rows.keys()].filter((path) => path.startsWith(".agents/skills/")).toSorted(),
    ).toEqual([
      ".agents/skills/stamity-alpha/SKILL.md",
      ".agents/skills/stamity-runbook/SKILL.md",
      ".agents/skills/stamity-runbook/references/notes.md",
    ]);

    // Install-once: sync never plans a write into the pack's own directory.
    expect([...rows.keys()].filter((path) => path.startsWith(".stamity/packs/"))).toEqual([]);
  });

  it("projects pack rules, agents and commands through each tool's own residue surface", async () => {
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    const rows = byPath(
      await planAll(ctxOf(fixture, manifest, ["claude", "cursor", "copilot"])),
    );

    const expected: [string, Tool, string, string][] = [
      [".claude/rules/stamity-guard.md", "claude", "guard", "rule"],
      [".claude/agents/stamity-sentinel.md", "claude", "sentinel", "agent"],
      [".cursor/rules/stamity-guard.mdc", "cursor", "guard", "rule"],
      [".cursor/agents/stamity-sentinel.md", "cursor", "sentinel", "agent"],
      [".github/instructions/stamity-guard.instructions.md", "copilot", "guard", "rule"],
      [".github/agents/stamity-sentinel.agent.md", "copilot", "sentinel", "agent"],
      // CONTRACT CHANGE (pack surface unified onto `st-`): this row read
      // `.github/prompts/stamity-launch.prompt.md` while pack origin
      // special-cased the prefix. A pack command is typed after a slash exactly
      // like a corpus one, so it is now prefixed by CLASS — `st-` — and the
      // three rows above it prove the other half of the same rule: a pack's
      // agents and rules still emit under `stamity-`.
      [".github/prompts/st-launch.prompt.md", "copilot", "cmd-launch", "command"],
    ];
    for (const [path, adapter, artifactId, artifactType] of expected) {
      const row = rows.get(path);
      expect(row, path).toBeDefined();
      expect(row!.owner).toEqual({ adapter, artifactId, artifactType });
    }

    // Corpus content still emits beside the pack's, through the same surfaces.
    expect(rows.get(".claude/rules/stamity-base.md")).toBeDefined();
    expect(rows.get(".github/prompts/st-ship.prompt.md")).toBeDefined();
  });

  it("keeps installed = selected without widening the corpus selection", async () => {
    // The corpus agent is deselected; the pack agent must still project.
    const fixture = await seedFixture({
      items: { agent: [], skill: ["alpha"], rule: ["base"], command: ["ship"] },
    });
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    const rows = byPath(await planAll(ctxOf(fixture, manifest, ["claude"])));

    expect(rows.get(".claude/agents/stamity-sentinel.md")).toBeDefined();
    expect(rows.get(".claude/agents/stamity-scout.md")).toBeUndefined();
  });

  it("orders pack rule precedence among corpus rules: the codex budget drops lowest first", async () => {
    const fixture = await seedFixture();

    // Baseline: the low-precedence corpus rule fits the root budget alone.
    const baseline = byPath(await planAll(ctxOf(fixture, fixture.manifest, ["codex"])));
    expect(baseline.get("AGENTS.md")!.content).toContain(BASE_RULE_SENTINEL);

    // With the pack's critical rule installed, the two no longer fit together:
    // the corpus rule is the lower precedence and is the one dropped, by name.
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    const packed = byPath(await planAll(ctxOf(fixture, manifest, ["codex"])));
    const agentsMd = packed.get("AGENTS.md")!.content;
    expect(agentsMd).toContain(GUARD_RULE_SENTINEL);
    expect(agentsMd).not.toContain(BASE_RULE_SENTINEL);
    // Wording tracks the codex notice after M-14: the old "lowest precedence
    // first" sentence misdescribed the selector, so the emitter now discloses
    // the risk-aware order it actually applies. Assertion re-pointed at the
    // current sentence, not relaxed — the drop is still proven by name below.
    expect(agentsMd).toContain("dropped, lowest risk first");
    expect(agentsMd).toContain("base");
  });

  it("omits projections after pack removal and proves the reclaim path", async () => {
    const fixture = await seedFixture();
    const never = await planAll(ctxOf(fixture, fixture.manifest));

    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    const planA = await planAll(ctxOf(fixture, manifest));
    const adapterLedger = ledgerOf(planA);

    // Removal: the uninstall sweep reclaims the SOURCE bytes via the pack's
    // own rows, and the manifest drops them in the same event.
    expect(planPackRemoval(manifest, "opspack").length).toBeGreaterThan(0);
    const afterRemoval: SetupManifest = {
      ...manifest,
      ledger: manifest.ledger.filter((entry) => !isPackOwner(entry.adapter)),
    };
    await rm(join(fixture.repoRoot, ".stamity", "packs", "opspack"), {
      recursive: true,
      force: true,
    });

    // Rows gone -> the next plan is byte-identical to a never-installed repo.
    const planB = await planAll(ctxOf(fixture, afterRemoval));
    expect(JSON.stringify(planB)).toBe(JSON.stringify(never));

    // ...and the projections the install added are exactly what the reclaim
    // diff now sweeps: adapter-owned copies, judged deselected.
    const candidates = computeReclaimCandidates(
      adapterLedger,
      new Set(planB.map((row) => row.path)),
      new Set<Tool>(["claude", "copilot"]),
    );
    const candidatePaths = new Set(candidates.map((candidate) => candidate.entry.path));
    expect(candidatePaths).toContain(".agents/skills/stamity-runbook/SKILL.md");
    expect(candidatePaths).toContain(".agents/skills/stamity-runbook/references/notes.md");
    expect(candidatePaths).toContain(".claude/rules/stamity-guard.md");
    // CONTRACT CHANGE (pack surface unified onto `st-`): the pack command now
    // emits — and so reclaims — under `st-`. The path had to move with the
    // emission, or the sweep would be asserted against a file nothing writes.
    expect(candidatePaths).toContain(".github/prompts/st-launch.prompt.md");
    for (const candidate of candidates) expect(candidate.reason).toBe("deselected");
  });

  it("plans a no-packs repo without pack machinery: stable bytes, no pack paths, no discovery hits", async () => {
    const fixture = await seedFixture();
    const first = await planAll(ctxOf(fixture, fixture.manifest));
    const second = await planAll(ctxOf(fixture, fixture.manifest));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.some((row) => row.path.includes("stamity-runbook"))).toBe(false);

    const resolved = await resolveInstalledPackContent(
      fixture.repoRoot,
      fixture.manifest,
      fixture.corpusRoot,
    );
    expect(resolved).toEqual({
      packs: [],
      packRoots: [],
      items: [],
      skillRows: [],
      // No pack, so no agent declaration and no ceiling to carry: the agent
      // lane answers empty exactly like the four beside it.
      agents: [],
      mcpServers: [],
      // FIXTURE EXTENDED, justified: the resolution now consults the
      // org trust policy and reports which installed packs it removed. A repo
      // with no packs and no policy removes none, so the field is empty —
      // which is what keeps a no-packs plan byte-identical to a pack-unaware
      // one.
      policyWarnings: [],
    });
  });

  it("projects two installed packs deterministically, sorted by pack id", async () => {
    const fixture = await seedFixture();
    const temp = getTemp();
    const zpack = zpackFiles();
    await temp.seedFiles({
      ...prefixed("pack-src/zpack", zpack),
      "pack-src/zpack/pack.json": packManifestJson("zpack", zpack),
    });
    let manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    manifest = await installPack(fixture.repoRoot, temp.path("pack-src/zpack"), manifest);

    const resolved = await resolveInstalledPackContent(
      fixture.repoRoot,
      manifest,
      fixture.corpusRoot,
    );
    expect(resolved.packs.map((pack) => pack.id)).toEqual(["opspack", "zpack"]);
    expect(packContentRoots(resolved.packs).map((root) => root.pack)).toEqual([
      "opspack",
      "zpack",
    ]);

    const ctx = ctxOf(fixture, manifest, ["claude"]);
    const first = await planAll(ctx);
    const second = await planAll(ctx);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(byPath(first).get(".claude/agents/stamity-zeta.md")).toBeDefined();
    expect(byPath(first).get(".claude/agents/stamity-sentinel.md")).toBeDefined();
  });

  it("projects a pack file edited after install as its current bytes (drift is check's concern)", async () => {
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);

    const installedNotes = join(
      fixture.repoRoot,
      ".stamity",
      "packs",
      "opspack",
      "skills",
      "stamity-runbook",
      "references",
      "notes.md",
    );
    const edited = `${await readFile(installedNotes, "utf8")}EDITED-MARKER\n`;
    await writeFile(installedNotes, edited, "utf8");

    const rows = byPath(await planAll(ctxOf(fixture, manifest)));
    expect(rows.get(".agents/skills/stamity-runbook/references/notes.md")!.content).toBe(edited);
  });

  it("refuses to plan when ledger rows point at a manually deleted pack directory", async () => {
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    await rm(join(fixture.repoRoot, ".stamity", "packs", "opspack"), {
      recursive: true,
      force: true,
    });

    const failure = await planAll(ctxOf(fixture, manifest)).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(EngineError);
    expect((failure as EngineError).code).toBe("CONFIG_ERROR");
    expect((failure as EngineError).message).toContain("clean --pack opspack");
  });
});

// ── Discovery + catalog defence in depth ───────────────────────

describe("discovery and the merged walk", () => {
  it("discovers installed packs from the ledger with classes in declaration order", async () => {
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);

    const packs = await discoverInstalledPacks(fixture.repoRoot, manifest);
    expect(packs).toHaveLength(1);
    expect(packs[0]!.id).toBe("opspack");
    expect(packs[0]!.root).toBe(join(fixture.repoRoot, ".stamity", "packs", "opspack"));
    // Six classes, in PACK_CONTENT_CLASSES declaration order: every class a
    // pack may ship has a consuming seam (the live-emission invariant), so
    // `mcp_servers` installs and is discovered like the other five rather than
    // being refused at ingress for having nowhere to go.
    expect(packs[0]!.classesPresent).toEqual([
      "agents",
      "skills",
      "rules",
      "commands",
      "hooks",
      "mcp_servers",
    ]);
  });

  it("projects nothing for a pack the org trust policy denies, and names it", async () => {
    // Org policy was consumed from `planPackInstall` and nowhere else, so
    // a repo that installed a pack and LATER adopted a policy denying it kept
    // projecting that pack's agents, rules, hooks and MCP definitions on every
    // sync — a pack hook still reached `.claude/settings.json` — while `add`
    // correctly refused new installs and `check` said all green.
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    await writeFile(
      join(fixture.repoRoot, ".stamity", "policy.json"),
      JSON.stringify({ version: 1, packs: { deny: ["*"] } }),
      "utf8",
    );

    const resolved = await resolveInstalledPackContent(
      fixture.repoRoot,
      manifest,
      fixture.corpusRoot,
    );
    expect(resolved.packs).toEqual([]);
    expect(resolved.packRoots).toEqual([]);
    expect(resolved.items).toEqual([]);
    expect(resolved.skillRows).toEqual([]);
    expect(resolved.agents).toEqual([]);
    expect(resolved.mcpServers).toEqual([]);
    // Named, not silent: the operator has to be able to connect the missing
    // content to the rule that removed it.
    expect(resolved.policyWarnings).toHaveLength(1);
    expect(resolved.policyWarnings?.[0]).toContain("opspack");
    expect(resolved.policyWarnings?.[0]).toContain('matched rule: "*"');
    expect(resolved.policyWarnings?.[0]).toContain("clean --pack opspack");

    // …and the whole emitted plan carries none of the pack's content, hook row
    // included. That is the half a projection-blind policy left open.
    const rows = byPath(await planAll(ctxOf(fixture, manifest, ["claude"])));
    expect([...rows.keys()].some((path) => path.includes("stamity-runbook"))).toBe(false);
    expect(rows.get(".claude/settings.json")?.content ?? "").not.toContain(PACK_HOOK_SENTINEL);

    // Degrades rather than fails: the files and the ledger rows are untouched,
    // so `clean --pack` still works and re-allowing the source restores the
    // pack with no re-install.
    expect(manifest.ledger.some((entry) => isPackOwner(entry.adapter))).toBe(true);
    expect(
      await readFile(
        join(fixture.repoRoot, ".stamity", "packs", "opspack", "skills", "stamity-runbook", "SKILL.md"),
        "utf8",
      ),
    ).toBe(RUNBOOK_SKILL);
  });

  it("hands the denied set back with the rule that decided", async () => {
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    await writeFile(
      join(fixture.repoRoot, ".stamity", "policy.json"),
      JSON.stringify({ version: 1, packs: { deny: ["opspack"] } }),
      "utf8",
    );

    const discovery = await discoverInstalledPacksWithPolicy(fixture.repoRoot, manifest);
    expect(discovery.packs).toEqual([]);
    expect(discovery.denied).toEqual([{ id: "opspack", matchedRule: "opspack" }]);
  });

  it("keeps projecting a pack the policy allows by name while denying the kind it is not", async () => {
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    await writeFile(
      join(fixture.repoRoot, ".stamity", "policy.json"),
      JSON.stringify({ version: 1, packs: { deny: ["npm-package"] } }),
      "utf8",
    );

    const resolved = await resolveInstalledPackContent(
      fixture.repoRoot,
      manifest,
      fixture.corpusRoot,
    );
    expect(resolved.packs.map((pack) => pack.id)).toEqual(["opspack"]);
    expect(resolved.policyWarnings).toEqual([]);
  });

  it("fail-closes on a malformed policy rather than projecting past it", async () => {
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    await writeFile(join(fixture.repoRoot, ".stamity", "policy.json"), "{ not json", "utf8");

    const failure = await discoverInstalledPacks(fixture.repoRoot, manifest).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(EngineError);
    expect((failure as EngineError).code).toBe("CONFIG_ERROR");
  });

  it("carries pack rows outside the install layout with no classes and no directory probe", async () => {
    // Drift-check fixtures (and any hand-authored row) may record pack rows
    // whose artifactIds do not follow `<pack>/<class>/…`. Such a pack claims
    // no projectable content, so planning must neither refuse on the absent
    // canonical directory nor project anything for it.
    const fixture = await seedFixture();
    const manifest: SetupManifest = {
      ...fixture.manifest,
      ledger: [
        {
          path: "docs/pack-guide.md",
          adapter: "pack:demo",
          artifactId: "guide",
          artifactType: "skill",
        },
      ],
    };

    const packs = await discoverInstalledPacks(fixture.repoRoot, manifest);
    expect(packs).toHaveLength(1);
    expect(packs[0]!.classesPresent).toEqual([]);
    expect(packContentRoots(packs)).toEqual([]);

    const rows = await planAll(ctxOf(fixture, manifest));
    expect(JSON.stringify(rows)).toBe(
      JSON.stringify(await planAll(ctxOf(fixture, fixture.manifest))),
    );
  });

  it("collide-refuses a pack artifact whose id the corpus already claims", async () => {
    const temp = getTemp();
    await temp.seedFiles({
      ...corpusFiles(),
      "clash-pack/rules/stamity-base.md": artifact(
        { id: "base", description: "shadowing rule", tags: "[devops]" },
        "A pack trying to claim a corpus id.",
      ),
    });

    const failure = await buildContentIndex(temp.path("corpus"), {
      packRoots: [{ pack: "clash", root: temp.path("clash-pack") }],
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(EngineError);
    expect((failure as EngineError).code).toBe("VALIDATION_ERROR");
    expect((failure as EngineError).message).toContain('pack "clash"');
    expect((failure as EngineError).message).toContain('rule "base"');
    expect((failure as EngineError).message).toContain("rules/stamity-base.md");
  });
});

// ── MCP consumption ────────────────────────────────────────────

describe("packMcpServers", () => {
  it("reads an installed definition into a resolvable row, tagged with its pack", async () => {
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    const packs = await discoverInstalledPacks(fixture.repoRoot, manifest);

    const servers = await packMcpServers(packs, fixture.repoRoot);
    expect(servers).toHaveLength(1);
    const [server] = servers;
    expect(server!.id).toBe(PACK_SERVER_ID);
    expect(server!.sourcePackId).toBe("opspack");
    // Not pack-declarable: vendor-published is a claim about the publisher of
    // the service being fronted, so the seam fixes it rather than reading it.
    expect(server!.firstParty).toBe(false);
    expect(server!.args).toContain(PACK_SERVER_SPEC);
    // `description` from the pack becomes the curated row's `comment`, and a
    // pack supplies no issuing URL — one unreviewed link fewer in .env.mcp.
    expect(server!.requiresEnv).toEqual([
      { name: PACK_SERVER_VAR, comment: "Read-only telemetry API token", url: "" },
    ]);

    // The resolution seam is what makes the row live: it resolves beside the
    // curated table without displacing it.
    expect(resolveServerMeta(PACK_SERVER_ID, servers)).toBe(server);
    expect(resolveServerMeta(PACK_SERVER_ID)).toBeUndefined();
    expect(resolveServerMeta("github", servers)).toBe(getServerMeta("github"));
  });

  it("carries the rows on the resolved pack content the composer consumes", async () => {
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);

    const resolved = await resolveInstalledPackContent(
      fixture.repoRoot,
      manifest,
      fixture.corpusRoot,
    );
    expect(resolved.mcpServers.map((server) => server.id)).toEqual([PACK_SERVER_ID]);
  });

  it("projects the definition as its current bytes, not as install-time hashed", async () => {
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    const installed = join(
      fixture.repoRoot,
      ".stamity",
      "packs",
      "opspack",
      "mcp_servers",
      "telemetry.json",
    );
    await writeFile(installed, packServerJson({ description: "EDITED-DESCRIPTION" }), "utf8");

    const packs = await discoverInstalledPacks(fixture.repoRoot, manifest);
    const [server] = await packMcpServers(packs, fixture.repoRoot);
    expect(server!.description).toBe("EDITED-DESCRIPTION");
  });

  it("re-runs the ingress gate on read: an operator-edited definition that unpins is refused", async () => {
    // "Projection reads bytes" cuts both ways — the edited definition is what
    // projects, so the pin gate has to stand at the read as well as at install.
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    await writeFile(
      join(fixture.repoRoot, ".stamity", "packs", "opspack", "mcp_servers", "telemetry.json"),
      packServerJson({ args: ["-y", `${PACK_SERVER_PACKAGE}@latest`] }),
      "utf8",
    );

    const packs = await discoverInstalledPacks(fixture.repoRoot, manifest);
    await expect(packMcpServers(packs, fixture.repoRoot)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("refuses two installed packs claiming one server id, naming both", async () => {
    const fixture = await seedFixture();
    const temp = getTemp();
    // A second pack shipping the SAME id. Neither pack is more authoritative
    // than the other, and install order is an accident, so the seam refuses
    // rather than letting the sort decide which launcher the name means.
    const rival = { ...zpackFiles(), "mcp_servers/telemetry.json": packServerJson() };
    await temp.seedFiles({
      ...prefixed("pack-src/zpack", rival),
      "pack-src/zpack/pack.json": packManifestJson("zpack", rival),
    });
    let manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    manifest = await installPack(fixture.repoRoot, temp.path("pack-src/zpack"), manifest);

    const packs = await discoverInstalledPacks(fixture.repoRoot, manifest);
    const failure = await packMcpServers(packs, fixture.repoRoot).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(EngineError);
    const message = (failure as EngineError).message;
    expect(message).toContain(PACK_SERVER_ID);
    expect(message).toContain("opspack");
    expect(message).toContain("zpack");
  });

  it("names ONE pack when one pack's own definitions collide, with a remedy that fits", async () => {
    // The cross-pack check was standing in for the within-pack one, so
    // two definitions in a single pack were reported as two packs and the
    // operator was told to "uninstall one of the packs" — naming the same pack
    // twice and offering a remedy that removes the definition they still want.
    // Ingress refuses this shape now, so reaching the read means the installed
    // bytes were edited afterwards, and the message says so.
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    await writeFile(
      join(fixture.repoRoot, ".stamity", "packs", "opspack", "mcp_servers", "copy.json"),
      packServerJson(),
      "utf8",
    );

    const packs = await discoverInstalledPacks(fixture.repoRoot, manifest);
    const failure = await packMcpServers(packs, fixture.repoRoot).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(EngineError);
    const message = (failure as EngineError).message;
    expect(message).toContain("One installed pack defines the same MCP server id more than once");
    expect(message).toContain("opspack");
    expect(message).toContain("edited after the install");
    expect(message).not.toContain("Uninstall one of the packs");
  });

  it("refuses a pack id that shadows a curated row, naming the curated id", async () => {
    // Ingress refuses this too, so reaching the seam means the installed bytes
    // were edited afterwards — which is exactly the path the read has to hold.
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    await writeFile(
      join(fixture.repoRoot, ".stamity", "packs", "opspack", "mcp_servers", "telemetry.json"),
      packServerJson({ id: "github" }),
      "utf8",
    );

    const packs = await discoverInstalledPacks(fixture.repoRoot, manifest);
    const failure = await packMcpServers(packs, fixture.repoRoot).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(EngineError);
    expect((failure as EngineError).message).toContain("github");
    // The curated row still wins resolution, which is why the collision can
    // never silently take over the name.
    expect(resolveServerMeta("github", [])).toBe(getServerMeta("github"));
  });

  it("returns nothing for a pack with no mcp_servers class and touches no directory", async () => {
    const fixture = await seedFixture();
    const temp = getTemp();
    const zpack = zpackFiles();
    await temp.seedFiles({
      ...prefixed("pack-src/zpack", zpack),
      "pack-src/zpack/pack.json": packManifestJson("zpack", zpack),
    });
    const manifest = await installPack(
      fixture.repoRoot,
      temp.path("pack-src/zpack"),
      fixture.manifest,
    );

    const packs = await discoverInstalledPacks(fixture.repoRoot, manifest);
    expect(packs[0]!.classesPresent).not.toContain("mcp_servers");
    expect(await packMcpServers(packs, fixture.repoRoot)).toEqual([]);
  });

  it("keeps installed separate from selected: the pack emits no MCP document at all", async () => {
    // The trust boundary. Installing a pack makes its servers SELECTABLE;
    // `config mcp add` is still the selection act, so a repo that installed
    // the pack and selected nothing must plan byte-identically to one that
    // never installed it — no client MCP document, for any tool.
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    expect(manifest.mcp?.servers ?? []).toEqual([]);

    const rows = await planAll(ctxOf(fixture, manifest, ["claude", "cursor", "copilot", "codex"]));
    const mcpPaths = [
      ".mcp.json",
      ".cursor/mcp.json",
      ".vscode/mcp.json",
      ".stamity/mcp/copilot-repo-settings.env",
    ];
    for (const path of mcpPaths) expect(byPath(rows).get(path), path).toBeUndefined();
    // ...and nothing anywhere names the pack server either.
    expect(rows.some((row) => row.content.includes(PACK_SERVER_ID))).toBe(false);
  });

  it("emits a SELECTED pack server into every client dialect, pin intact", async () => {
    // The other half of the same boundary, and the regression this case
    // exists for: selecting a pack-supplied id is what `config mcp add`
    // records, so emission has to RESOLVE it. Dropping pack supply on the way
    // into the render made every plan throw "nothing resolves them" — sync and
    // check both exited non-zero on a repo whose only sin was using the pack
    // it had installed, and the only remedy the message offered was to
    // deselect the server.
    const fixture = await seedFixture();
    const installed = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    const manifest: SetupManifest = { ...installed, mcp: { servers: [PACK_SERVER_ID] } };

    const rows = byPath(
      await planAll(ctxOf(fixture, manifest, ["claude", "cursor", "copilot", "codex"])),
    );
    // One document per dialect, the codex one composed by its own adapter.
    const documents = [
      ".mcp.json",
      ".cursor/mcp.json",
      ".vscode/mcp.json",
      ".stamity/mcp/copilot-repo-settings.env",
      ".codex/config.toml",
    ];
    for (const path of documents) {
      const content = rows.get(path)?.content;
      expect(content, path).toBeDefined();
      // Pack supply renders under the curated rules: the exact pin, verbatim.
      expect(content, path).toContain(PACK_SERVER_SPEC);
    }
    // Keyed by catalog id in the four dialects that key by id; the Copilot
    // repo-settings dialect names the entry after the id instead.
    for (const path of [".mcp.json", ".cursor/mcp.json", ".vscode/mcp.json", ".codex/config.toml"]) {
      expect(rows.get(path)!.content, path).toContain(PACK_SERVER_ID);
    }
    expect(rows.get(".stamity/mcp/copilot-repo-settings.env")!.content).toContain(
      "COPILOT_MCP_ACME_TELEMETRY=",
    );

    // Each dialect's own reference form, not a neighbour's.
    expect(rows.get(".mcp.json")!.content).toContain(`\${${PACK_SERVER_VAR}}`);
    expect(rows.get(".cursor/mcp.json")!.content).toContain(`\${env:${PACK_SERVER_VAR}}`);
    expect(rows.get(".vscode/mcp.json")!.content).toContain("${input:acme-telemetry-token}");
    // Codex interpolates nothing, so it carries no env table at all.
    expect(rows.get(".codex/config.toml")!.content).not.toContain(PACK_SERVER_VAR + " =");
  });

  it("names the pack in the refusal when a selected id resolves nowhere", async () => {
    // The honest failure the false diagnostic used to shadow: an id that
    // really does resolve nowhere still refuses, and still points at the
    // deselection command.
    const fixture = await seedFixture();
    const installed = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    const manifest: SetupManifest = { ...installed, mcp: { servers: ["not-a-server"] } };

    await expect(planAll(ctxOf(fixture, manifest, ["claude"]))).rejects.toThrow(
      /config mcp remove not-a-server/,
    );
  });
});

// ── Pack agent grants ──────────────────────────────────────────

describe("pack agent grants", () => {
  /** The emitted policy document the generated pre-tool-use guard parses. */
  interface PolicyDocument {
    policies: { agentId: string; allow: string[]; source?: { kind: string; packId?: string } }[];
  }

  it("gives an installed pack's agent a policy row bounded by its pack's footprint", async () => {
    // The live-emission invariant, agent class. Without the composer's hand-off the document
    // carried the shipped roster alone, so the generated guard answered
    // NO_POLICY for every agent an install added and refused its every tool
    // call — a pack that installed cleanly and did nothing.
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);

    const rows = byPath(await planAll(ctxOf(fixture, manifest, ["claude"])));
    const document = JSON.parse(
      rows.get(".stamity/generated/agent-tool-policies.json")!.content,
    ) as PolicyDocument;

    const row = document.policies.find((candidate) => candidate.agentId === "stamity-sentinel");
    // The agent's own `capabilities:`, not the wider footprint its pack declared.
    expect(row?.allow).toEqual(["read", "edit"]);
    expect(row?.source).toEqual({ kind: "pack", packId: "opspack" });
    expect(PACK_FOOTPRINT).toContain("execute");
    expect(row?.allow).not.toContain("execute");

    // Every shipped roster row survives the extension: pack rows are appended
    // to the roster, never a replacement for it.
    expect(document.policies.some((candidate) => candidate.agentId === "stamity-reviewer")).toBe(
      true,
    );
  });

  it("carries the same grant into every client's own agent file", async () => {
    // Two enforcement points, one verdict. A policy row the guard admits plus
    // an empty `tools:` on the emitted sub-agent is still an inert install —
    // the client refuses before the guard is ever consulted.
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);

    const rows = byPath(
      await planAll(ctxOf(fixture, manifest, ["claude", "cursor", "copilot", "codex"])),
    );
    const claude = rows.get(".claude/agents/stamity-sentinel.md")!.content;
    // The client-side grant is the same intersection, and NOT the empty
    // `tools: ""` a client reads as "this agent may use nothing".
    expect(claude).toMatch(/^tools: \S/m);
    expect(claude).not.toMatch(/^tools: ""$/m);

    // Codex renders the grant as a sandbox posture: a granted agent is not
    // read-only.
    expect(rows.get(".codex/agents/stamity-sentinel.toml")!.content).not.toContain(
      "readonly = true",
    );
  });

  it("denies by default when the receipt carries no footprint", async () => {
    // The fallback has to fail CLOSED: a receipt an operator deleted or
    // hand-edited leaves no readable disclosure, and "no disclosure" must mean
    // no ceiling to intersect against rather than an unbounded grant.
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    await rm(join(fixture.repoRoot, ".stamity", "packs", "opspack", "receipt.json"));

    const rows = byPath(await planAll(ctxOf(fixture, manifest, ["claude"])));
    const document = JSON.parse(
      rows.get(".stamity/generated/agent-tool-policies.json")!.content,
    ) as PolicyDocument;
    expect(document.policies.some((row) => row.agentId === "stamity-sentinel")).toBe(false);
    expect(rows.get(".claude/agents/stamity-sentinel.md")!.content).toMatch(/^tools: ""$/m);
  });
});

// ── Hook consumption ───────────────────────────────────────────

describe("packHookDefinitions", () => {
  it("hands pack hook files to the user-hook lane reader with repo-relative provenance", async () => {
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);
    const packs = await discoverInstalledPacks(fixture.repoRoot, manifest);

    const result = await packHookDefinitions(packs, fixture.repoRoot);
    expect(result.errors).toEqual([]);
    expect(result.hooks).toHaveLength(1);
    expect(result.hooks[0]).toMatchObject({
      event: "pre_tool_use",
      matcher: "Bash",
      command: ["node", PACK_HOOK_SCRIPT, PACK_HOOK_SENTINEL],
      sourceFile: ".stamity/packs/opspack/hooks/hooks.json",
    });
  });

  it("arms a pack hook in the emitted client config — the class is live, not inert", async () => {
    const fixture = await seedFixture();
    const manifest = await installPack(fixture.repoRoot, fixture.packDir, fixture.manifest);

    // The whole point of the hooks seam: the composer reads the installed
    // pack's hooks/ through the user-hook lane and every selected client's
    // config carries the row. Without the planner wiring the install is
    // inert — bytes on disk nothing ever reads.
    const rows = byPath(await planAll(ctxOf(fixture, manifest)));
    const settings = rows.get(".claude/settings.json");
    expect(settings).toBeDefined();
    const hooks = (JSON.parse(settings!.content) as ClaudeSettings).hooks;
    const preToolUse = hooks["PreToolUse"] ?? [];
    expect(
      preToolUse.some(
        (entry) =>
          entry.matcher === "Bash" &&
          entry.hooks.some((hook) => hook.command.includes(PACK_HOOK_SENTINEL)),
      ),
      `pack hook missing from .claude/settings.json:\n${settings!.content}`,
    ).toBe(true);

    // Order contract: core script rows come first, pack supply last.
    const commands = preToolUse.flatMap((entry) => entry.hooks.map((hook) => hook.command));
    expect(commands.at(-1)).toContain(PACK_HOOK_SENTINEL);

    // Uninstall reclaims it: with the pack's rows gone the row is gone too.
    const withoutPack: SetupManifest = {
      ...manifest,
      ledger: manifest.ledger.filter((entry) => !isPackOwner(entry.adapter)),
    };
    const afterRows = byPath(await planAll(ctxOf(fixture, withoutPack)));
    expect(afterRows.get(".claude/settings.json")?.content).not.toContain(PACK_HOOK_SENTINEL);
  });
});
