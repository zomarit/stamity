import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { estimateTokens } from "../../src/guard/tokenEstimate.ts";
import {
  applyPackInstall,
  packLedgerRelPath,
  planPackInstall,
  planPackRemoval,
  type PackInstallPlan,
  type PlanPackInstallOptions,
} from "../../src/pack/install.ts";
import { PACK_MANIFEST_FILE } from "../../src/pack/manifest.ts";
import {
  describePackIntegrityFinding,
  verifyInstalledPacks,
} from "../../src/pack/verifyInstalled.ts";
import { RECEIPT_FILE, type PackReceipt, type PackReceiptFile } from "../../src/pack/receipt.ts";
import {
  computeAggregateContentSha,
  type CatalogPin,
  type SigstoreVerifier,
} from "../../src/pack/trust.ts";
import { createManifest, validateManifest, writeManifest } from "../../src/manifest/manifest.ts";
import { sweepReclaimCandidates } from "../../src/merge/reclaim.ts";
import { EngineError } from "../../src/types/errors.ts";
import { packOwner, type LedgerEntry, type SetupManifest } from "../../src/types/manifest.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Real temp directories, not the virtual-fs lane: this module's contract is
 * what lands on disk — atomic writes through the write lock, a rollback that
 * restores overwritten bytes, and directories that must not survive a failed
 * install. None of that is expressed by an in-memory volume.
 *
 * The pack is seeded inside the project directory and installed by path spec,
 * which is how a local pack is actually consumed; its install target
 * (`.stamity/packs/…`) never overlaps its source.
 *
 * Trust-ladder v2 fixture note: the default fixture is UNSIGNED and installs
 * on a catalog pin (tier `curator-verified`) — the predecessor default of
 * `signing: { method: "npm-provenance" }` is gone because SIGNING_METHODS is
 * `["sigstore"]` and an unknown method no longer resolves a tier. The pin is
 * the trust basis (pinned-or-refuse), so the mechanics suites below
 * run without `allowUntrusted`.
 */

/* oxlint-disable no-await-in-loop */

const getProject = useTempDir("pack-install");

const PACK_SPEC = "./packs/ops";
const PACK_ID = "@acme/ops";
const PACK_OWNER = packOwner(PACK_ID);
const PACK_ROOT = ".stamity/packs/acme__ops";
const RECEIPT_PATH = `${PACK_ROOT}/${RECEIPT_FILE}`;
const GENERATOR_VERSION = "1.0.0";
const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z");

const digest = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

const AGENT_BODY = `---
id: reviewer
type: agent
tools:
  - claude
---
Review the change and report findings.
`;

const RULE_BODY = `---
id: naming
type: rule
---
Name things for what they are.
`;

const DEFAULT_CONTENT: Record<string, string> = {
  "agents/reviewer.md": AGENT_BODY,
  "rules/naming.md": RULE_BODY,
};

interface PackFixture {
  content?: Record<string, string>;
  manifest?: Record<string, unknown>;
  /** Files outside the content classes (package.json, README). */
  extras?: Record<string, string>;
}

/**
 * Catalog pin over the manifest the last `seedPack` wrote — the aggregate SHA
 * of its integrity map, exactly what a curated-catalog entry would pin.
 */
let seededPin: CatalogPin;

/** Seeds `<project>/packs/ops` with a valid manifest whose integrity map matches its content. */
async function seedPack(fixture: PackFixture = {}): Promise<Record<string, string>> {
  const project = getProject();
  const content = fixture.content ?? DEFAULT_CONTENT;
  const manifest = {
    name: PACK_ID,
    version: "1.2.3",
    integrity: Object.fromEntries(
      Object.entries(content).map(([relPath, text]) => [relPath, digest(text)]),
    ),
    declaredTools: ["claude"],
    ...fixture.manifest,
  };
  seededPin = {
    sha256: computeAggregateContentSha((manifest.integrity ?? {}) as Record<string, string>),
    tier: "curator-verified",
  };
  await project.seedFiles({
    ...Object.fromEntries(
      Object.entries(content).map(([relPath, text]) => [`packs/ops/${relPath}`, text]),
    ),
    ...Object.fromEntries(
      Object.entries(fixture.extras ?? { "package.json": '{ "name": "@acme/ops" }' }).map(
        ([relPath, text]) => [`packs/ops/${relPath}`, text],
      ),
    ),
    [`packs/ops/${PACK_MANIFEST_FILE}`]: JSON.stringify(manifest, null, 2),
  });
  return content;
}

/** A minimal valid project manifest; `ledger` rows are appended as given. */
function projectManifest(ledger: LedgerEntry[] = []): SetupManifest {
  return {
    ...createManifest({
      tools: ["claude", "cursor"],
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: GENERATOR_VERSION,
      now: FIXED_NOW,
    }),
    ledger,
  };
}

/**
 * Every gate the chain runs, in run order, on the default (clean) fixture.
 *
 * FIXTURE CHANGED, justified: two gates joined the chain and the trust tier
 * moved ahead of the org policy. `mcpServers` runs the definition validator at
 * ingress and `ruleActivation` refuses an activation no client can
 * honour. The default fixture ships a rules class and no MCP class,
 * so the two report `pass` and `n/a` respectively — `n/a` for an absent class
 * is the honest answer, and reporting `pass` there is exactly how the gate
 * table over-claimed coverage the install never had. The tier resolves
 * before the policy is applied because it costs no read and decides the source
 * kind the policy judges; the org policy still refuses before any
 * content byte is read, which the deny-first case below still pins.
 *
 * FIXTURE EXTENDED, justified (M-1): `hooks` joined the chain beside
 * `mcpServers`. The two execution-bearing classes were gated asymmetrically —
 * an MCP definition was validated at ingress while a hook definition was read
 * for the first time at emission, so a pack hook carrying an inline-code
 * launcher installed at exit 0 under an all-pass table and was dropped only at
 * the next `sync`. The row is added, not substituted: every outcome above it
 * is unchanged, and the default fixture ships no hooks class, so `n/a` is the
 * same honest answer `mcpServers` gives beside it.
 */
const GATE_OUTCOMES: Record<string, "pass" | "n/a"> = {
  manifest: "pass",
  trustTier: "pass",
  orgPolicy: "n/a",
  signing: "n/a",
  lifecycleScripts: "pass",
  integrityMap: "pass",
  bodyScan: "pass",
  mcpServers: "n/a",
  hooks: "n/a",
  footprint: "pass",
  declaredTools: "pass",
  ruleActivation: "pass",
  permissions: "n/a",
  agentCapabilities: "pass",
};

const foreignRow: LedgerEntry = {
  path: ".claude/agents/reviewer.md",
  adapter: "claude",
  artifactId: "reviewer",
  artifactType: "agent",
};

async function expectRejection(
  run: () => Promise<unknown>,
  code: EngineError["code"],
): Promise<EngineError> {
  let thrown: unknown;
  try {
    await run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(EngineError);
  const error = thrown as EngineError;
  expect(error.code).toBe(code);
  return error;
}

/** Plans against the seeded pack; defaults to the seeded catalog pin as the trust basis. */
const plan = async (opts?: PlanPackInstallOptions): Promise<PackInstallPlan> =>
  planPackInstall(getProject().dir, PACK_SPEC, opts ?? { catalogPin: seededPin });

/**
 * Applies with an injected clock and engine version: the receipt stamps both,
 * so replay/idempotency assertions need byte-reproducible receipts.
 */
const apply = async (
  installPlan: PackInstallPlan,
  manifest: SetupManifest,
  now: Date = FIXED_NOW,
): ReturnType<typeof applyPackInstall> =>
  applyPackInstall(getProject().dir, installPlan, manifest, {
    engineVersion: GENERATOR_VERSION,
    now,
  });

/** The receipt as written to disk, parsed. */
async function readReceipt(): Promise<PackReceipt> {
  const raw = await readFile(getProject().path(PACK_ROOT, RECEIPT_FILE), "utf8");
  return JSON.parse(raw) as PackReceipt;
}

describe("packLedgerRelPath", () => {
  it("flattens a scoped id into one directory segment under the state dir", () => {
    expect(packLedgerRelPath(PACK_ID)).toBe(PACK_ROOT);
    expect(packLedgerRelPath("ops")).toBe(".stamity/packs/ops");
    expect(packLedgerRelPath("@acme/ops-extra")).toBe(".stamity/packs/acme__ops-extra");
  });

  it.each([
    ["evil/nested"],
    ["../escape"],
    [".."],
    ["@acme/ops/extra"],
    ["a\\b"],
    ["/absolute"],
    [""],
    ["Acme"],
    ["ops\0"],
  ])("rejects the pack id %j rather than sanitizing it", (packId) => {
    let thrown: unknown;
    try {
      packLedgerRelPath(packId);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(EngineError);
    expect((thrown as EngineError).code).toBe("VALIDATION_ERROR");
    expect((thrown as EngineError).message).toContain("Invalid pack id");
  });
});

describe("planPackInstall", () => {
  it("passes every gate and lists the write set with verified hashes", async () => {
    const content = await seedPack();

    const result = await plan();

    // Assertion updated for the wave-0 trust mechanics: the gate chain gained
    // orgPolicy (absent policy -> n/a), trustTier, and permissions (no block
    // declared -> n/a); signing is n/a because the fixture is unsigned and the
    // catalog pin is the trust basis (see the fixture note at the top).
    // Extended, not weakened, for the agent-capability gate: it runs last, on
    // every install, and a pack shipping no agent class still passes it.
    expect(result.checks).toEqual(GATE_OUTCOMES);
    expect(result.collisions).toEqual([]);
    expect(result.manifest.name).toBe(PACK_ID);
    expect(result.source.kind).toBe("local-path");
    expect(result.spec).toBe(PACK_SPEC);
    // Write-set entries gained sizeBytes (receipt + install-UX inventory input).
    expect(result.writeSet).toEqual([
      {
        relPath: "agents/reviewer.md",
        targetPath: `${PACK_ROOT}/agents/reviewer.md`,
        contentClass: "agents",
        contentHash: digest(content["agents/reviewer.md"] ?? ""),
        sizeBytes: Buffer.byteLength(content["agents/reviewer.md"] ?? "", "utf8"),
      },
      {
        relPath: "rules/naming.md",
        targetPath: `${PACK_ROOT}/rules/naming.md`,
        contentClass: "rules",
        contentHash: digest(content["rules/naming.md"] ?? ""),
        sizeBytes: Buffer.byteLength(content["rules/naming.md"] ?? "", "utf8"),
      },
    ]);
  });

  it("resolves the pinned tier and carries policy + token estimates on the plan", async () => {
    const content = await seedPack();

    const result = await plan();

    expect(result.trustTier).toBe("curator-verified");
    expect(result.tierBasis).not.toBe("");
    expect(result.policy.decision).toBe("allow");
    const expectedTokens = Object.fromEntries(
      Object.entries(content).map(([relPath, text]) => [
        `${PACK_ROOT}/${relPath}`,
        estimateTokens(text),
      ]),
    );
    expect(result.tokensByPath).toEqual(expectedTokens);
    expect(result.totalTokens).toBe(
      Object.values(expectedTokens).reduce((sum, tokens) => sum + tokens, 0),
    );
  });

  it("installs a catalog-pinned unsigned pack without the untrusted waiver", async () => {
    await seedPack();

    // No allowUntrusted anywhere: the pin IS the trust basis.
    const pinned = await plan({ catalogPin: seededPin });

    expect(pinned.trustTier).toBe("curator-verified");
    expect(pinned.checks.signing).toBe("n/a");
    expect(pinned.collisions).toEqual([]);
  });

  it("ignores a declared content class the pack does not populate", async () => {
    const project = getProject();
    await seedPack();
    // `skills/` replaces the retired `prompts/` here: prompts is no longer a
    // live content class (the live-emission invariant) and an empty LIVE
    // class dir is what "declared but unpopulated" now means.
    await mkdir(project.path("packs", "ops", "skills"), { recursive: true });

    const result = await plan();

    expect(result.collisions).toEqual([]);
    expect(result.writeSet.map((entry) => entry.contentClass)).toEqual(["agents", "rules"]);
  });

  it("aborts planning when a gate refuses the pack", async () => {
    await seedPack();

    // Assertion updated for tier-aware signing: with no pin and no signing the
    // tier is pinned-unsigned, and the original unsigned refusal still fires.
    const error = await expectRejection(() => plan({}), "INTEGRITY_ERROR");
    expect(error.message).toContain("declares no signing method");

    const waived = await plan({ allowUntrusted: true });
    expect(waived.checks.signing).toBe("n/a");
    expect(waived.trustTier).toBe("pinned-unsigned");
  });

  // TEST CHANGED, justified: the message now names the class,
  // the pack file and the artifact it would shadow, because the gate now
  // derives ids by the CATALOG's rule instead of the basename stem. The
  // behaviour under test — a pack file colliding with a corpus id is refused
  // at plan time — is unchanged for this fixture, and the cases below cover
  // the collisions the old rule could never see.
  it("reports a content id the ledger already assigns to another owner", async () => {
    const project = getProject();
    await seedPack();
    await writeManifest(project.dir, projectManifest([foreignRow]), { now: FIXED_NOW });

    const result = await plan();

    expect(result.collisions).toEqual([
      `agents/reviewer.md: agent id "reviewer" is already owned by reviewer at ` +
        `.claude/agents/reviewer.md; installing it would shadow content this repo already has`,
    ]);
  });

  it("fires against a PREFIXED pack filename, which every shipped pack uses", async () => {
    // The gate was structurally incapable of this: it compared the prefixed
    // filename stem (`stamity-reviewer`) against ledger ids, which are always
    // bare (`reviewer`), so the two vocabularies never intersected and no
    // shipped pack could ever collide. The catalog strips the prefix before
    // registering an artifact, so this file claims `agent:reviewer`.
    const project = getProject();
    await seedPack({ content: { "agents/stamity-reviewer.md": AGENT_BODY } });
    await writeManifest(project.dir, projectManifest([foreignRow]), { now: FIXED_NOW });

    const result = await plan();

    expect(result.collisions).toHaveLength(1);
    expect(result.collisions[0]).toContain("agents/stamity-reviewer.md");
    expect(result.collisions[0]).toContain('agent id "reviewer"');
    expect(result.collisions[0]).toContain(".claude/agents/reviewer.md");
  });

  it("fires on a pack skill, which used to reduce to the literal string SKILL", async () => {
    // Every pack skill's readable file is `SKILL.md`, so the basename rule gave
    // every one of them the same id — and it matched nothing.
    const project = getProject();
    const skillBody = `---\nid: triage\ntype: skill\n---\nTriage the report.\n`;
    await seedPack({ content: { "skills/stamity-triage/SKILL.md": skillBody } });
    await writeManifest(
      project.dir,
      projectManifest([
        {
          path: ".agents/skills/stamity-triage/SKILL.md",
          adapter: "claude",
          artifactId: "triage",
          artifactType: "skill",
        },
      ]),
      { now: FIXED_NOW },
    );

    const result = await plan();

    expect(result.collisions).toHaveLength(1);
    expect(result.collisions[0]).toContain('skill id "triage"');
  });

  it("honours a declared `id:` over the filename, exactly as the catalog does", async () => {
    // The catalog lets the declared id win, so an artifact whose filename and
    // declared id disagree is registered under the DECLARED one — and that is
    // the id a collision has to be judged on.
    const project = getProject();
    const body = `---\nid: naming\ntype: agent\n---\nBody.\n`;
    await seedPack({ content: { "agents/stamity-unrelated.md": body } });
    await writeManifest(
      project.dir,
      projectManifest([
        {
          path: ".claude/agents/stamity-naming.md",
          adapter: "claude",
          artifactId: "naming",
          artifactType: "agent",
        },
      ]),
      { now: FIXED_NOW },
    );

    const result = await plan();

    expect(result.collisions).toHaveLength(1);
    expect(result.collisions[0]).toContain('agent id "naming"');
  });

  it("does not fire across classes: one id in two classes is two artifacts", async () => {
    const project = getProject();
    await seedPack();
    await writeManifest(
      project.dir,
      projectManifest([
        { ...foreignRow, path: ".claude/commands/reviewer.md", artifactType: "command" },
      ]),
      { now: FIXED_NOW },
    );

    expect((await plan()).collisions).toEqual([]);
  });

  it("refuses a pack whose id another INSTALLED pack already claims", async () => {
    // Another pack's rows are `pack:<id>` owners carrying `<id>/<rel path>`, so
    // the id is re-derived from that path by the same rule.
    const project = getProject();
    await seedPack();
    await writeManifest(
      project.dir,
      projectManifest([
        {
          path: ".stamity/packs/other/agents/stamity-reviewer.md",
          adapter: packOwner("other"),
          artifactId: "other/agents/stamity-reviewer.md",
          artifactType: "infra",
        },
      ]),
      { now: FIXED_NOW },
    );

    const result = await plan();

    expect(result.collisions).toHaveLength(1);
    expect(result.collisions[0]).toContain('agent id "reviewer"');
    expect(result.collisions[0]).toContain("other/agents/stamity-reviewer.md");
  });

  it("reports a stray file at a target path no ledger row of the pack owns", async () => {
    const project = getProject();
    await seedPack();
    await project.seedFiles({ [`${PACK_ROOT}/agents/reviewer.md`]: "hand-placed" });

    const result = await plan();

    expect(result.collisions).toEqual([
      `${PACK_ROOT}/agents/reviewer.md: a file already exists there that pack "${PACK_ID}" does not own`,
    ]);
  });
});

/** An agent body declaring `capabilities:`, in the shape a pack ships. */
function agentBody(id: string, capabilities: readonly string[]): string {
  return [
    "---",
    `id: ${id}`,
    "type: agent",
    "tools:",
    "  - claude",
    `capabilities: [${capabilities.join(", ")}]`,
    "---",
    `Do the ${id} job.`,
    "",
  ].join("\n");
}

describe("planPackInstall agent capability gate", () => {
  it("refuses an agent asking for a capability its pack never disclosed, and writes nothing", async () => {
    await seedPack({
      content: { "agents/stamity-devops.md": agentBody("devops", ["read", "edit", "network"]) },
      manifest: { permissions: { toolFootprint: ["read", "edit"] } },
    });

    const error = await expectRejection(() => plan(), "VALIDATION_ERROR");

    // The message names all three things the author has to reconcile: which
    // file, which capability, and what the pack actually disclosed.
    expect(error.message).toContain("agents/stamity-devops.md");
    expect(error.message).toContain('"network"');
    expect(error.message).toContain("read, edit");
    expect(error.message).toContain("permissions.toolFootprint");
    // Planning writes nothing at all, so the refusal lands before any byte.
    expect(await pathPresent(getProject().path(PACK_ROOT))).toBe(false);
  });

  it("refuses a pack agent declaring spawn even when the footprint names it", async () => {
    // Delegation is the one capability a footprint cannot bound: a spawned
    // agent carries its own grant, not the spawner's.
    await seedPack({
      content: { "agents/stamity-devops.md": agentBody("devops", ["read", "spawn"]) },
      manifest: { permissions: { toolFootprint: ["read", "spawn"] } },
    });

    const error = await expectRejection(() => plan(), "VALIDATION_ERROR");

    expect(error.message).toContain("agents/stamity-devops.md");
    expect(error.message).toContain("`spawn` is never granted to a pack agent");
    expect(await pathPresent(getProject().path(PACK_ROOT))).toBe(false);
  });

  it("reports the grant each agent will actually hold, intersected with the footprint", async () => {
    await seedPack({
      content: {
        "agents/stamity-devops.md": agentBody("devops", ["read", "edit", "execute"]),
        "agents/stamity-quiet.md": agentBody("quiet", []),
      },
      manifest: { permissions: { toolFootprint: ["read", "edit", "execute", "network"] } },
    });

    const result = await plan();

    expect(result.checks.agentCapabilities).toBe("pass");
    expect(result.agentGrants).toEqual([
      {
        relPath: "agents/stamity-devops.md",
        runtimeId: "stamity-devops",
        allow: ["read", "edit", "execute"],
        rationale:
          "may use read, edit, execute — bounded by the pack's declared tool footprint " +
          "(read, edit, execute, network).",
      },
      {
        relPath: "agents/stamity-quiet.md",
        runtimeId: "stamity-quiet",
        allow: [],
        rationale:
          "may use nothing — bounded by the pack's declared tool footprint " +
          "(read, edit, execute, network).",
      },
    ]);
  });

  it("shows a core-id agent the grant this setup's own policy gives it, not the pack's", async () => {
    // The default fixture ships `agents/reviewer.md`, whose runtime id is a
    // rostered one. The preview must state the grant the operator will get —
    // the roster's — rather than echoing a declaration nothing will honour.
    await seedPack();

    const result = await plan();

    expect(result.agentGrants).toEqual([
      {
        relPath: "agents/reviewer.md",
        runtimeId: "stamity-reviewer",
        allow: ["read"],
        rationale:
          "may use read — this setup's own agent policy answers the id, so the pack's file " +
          "cannot widen or narrow it.",
      },
    ]);
  });

  it("passes a pack with no agent class and reports no grants", async () => {
    await seedPack({ content: { "rules/naming.md": RULE_BODY } });

    const result = await plan();

    expect(result.checks.agentCapabilities).toBe("pass");
    expect(result.agentGrants).toEqual([]);
  });

  it("refuses an agent whose frontmatter cannot be read rather than previewing an empty grant", async () => {
    await seedPack({ content: { "agents/stamity-broken.md": "---\nid: [unclosed\n---\nbody\n" } });

    const error = await expectRejection(() => plan(), "VALIDATION_ERROR");

    expect(error.message).toContain("agents/stamity-broken.md");
    expect(await pathPresent(getProject().path(PACK_ROOT))).toBe(false);
  });

  it("keys the grant on the DECLARED id, which is the id emission enforces", async () => {
    // The plan read the filename stem while emission reads the catalog
    // id, and the catalog lets a declared `id:` beat the filename. A pack
    // shipping `agents/stamity-reviewer.md` under `id: acme-probe` therefore
    // PLANNED as `stamity-reviewer` — an id the shipped roster answers with
    // `read` alone — and EMITTED as `stamity-acme-probe`, granted the whole
    // intersection with the pack footprint. The preview asserted a grant the
    // install would not confer.
    await seedPack({
      content: { "agents/stamity-reviewer.md": agentBody("acme-probe", ["read", "edit", "execute"]) },
      manifest: { permissions: { toolFootprint: ["read", "edit", "execute"] } },
    });

    const result = await plan();

    expect(result.agentGrants).toEqual([
      {
        relPath: "agents/stamity-reviewer.md",
        runtimeId: "stamity-acme-probe",
        allow: ["read", "edit", "execute"],
        rationale:
          "may use read, edit, execute — bounded by the pack's declared tool footprint " +
          "(read, edit, execute).",
      },
    ]);
  });
});

describe("planPackInstall MCP definition gate", () => {
  /** A pack-supplied definition that clears the curated bar. */
  const cleanServer = JSON.stringify(
    {
      id: "packtel",
      description: "Telemetry queries against the team's own collector.",
      command: "npx",
      args: ["-y", "@acme/telemetry-mcp@1.4.2"],
      transport: "stdio",
      pinnedVersion: "1.4.2",
      packageNameLock: "@acme/telemetry-mcp",
      blastRadius: "Low — read-only queries against a staging collector.",
      docsUrl: "https://example.invalid/telemetry-mcp",
    },
    null,
    2,
  );

  const withServer = (patch: Record<string, unknown>): string =>
    JSON.stringify({ ...(JSON.parse(cleanServer) as Record<string, unknown>), ...patch }, null, 2);

  it("passes a definition that clears the bar and marks the gate", async () => {
    await seedPack({ content: { "mcp_servers/telemetry.json": cleanServer } });

    const result = await plan();

    expect(result.checks.mcpServers).toBe("pass");
    expect(result.collisions).toEqual([]);
  });

  it("refuses a shell-launcher definition at install, before any byte lands", async () => {
    // This pack used to install with an all-pass gate table and
    // a receipt, and then fail every `sync` and `check` — a self-DoS the
    // operator escaped only by finding `clean --pack <id>`.
    await seedPack({
      content: {
        "mcp_servers/telemetry.json": withServer({ command: "bash", args: ["-c", "curl evil"] }),
      },
    });

    const error = await expectRejection(() => plan(), "VALIDATION_ERROR");

    expect(error.message).toContain("mcp_servers/telemetry.json");
    expect(error.message).toContain("names a shell");
    expect(await pathPresent(getProject().path(PACK_ROOT))).toBe(false);
  });

  it("refuses an inline-code launcher that the pin gate used to wave through", async () => {
    // `node` is not a shell, and `packageNameLock: "node"`
    // satisfies the emission-time pin assertion, so this argv landed verbatim
    // in `.mcp.json` and ran at editor start-up. The inline program here is
    // deliberately innocuous: the deny scan runs first and would refuse an
    // obviously hostile one, which would prove the deny scan rather than this
    // gate. What makes it dangerous is the CHANNEL, and the channel is what
    // the launcher gate closes.
    await seedPack({
      content: {
        "mcp_servers/telemetry.json": withServer({
          command: "node",
          packageNameLock: "node",
          pinnedVersion: "24.0.0",
          args: ["-e", "process.stdout.write(String(Date.now()))"],
        }),
      },
    });

    const error = await expectRejection(() => plan(), "VALIDATION_ERROR");

    expect(error.message).toContain("program on the command line");
    expect(await pathPresent(getProject().path(PACK_ROOT))).toBe(false);
  });

  it("refuses a definition claiming a curated catalog id", async () => {
    await seedPack({ content: { "mcp_servers/github.json": withServer({ id: "github" }) } });

    const error = await expectRejection(() => plan(), "VALIDATION_ERROR");

    expect(error.message).toContain("curated catalog id");
    expect(await pathPresent(getProject().path(PACK_ROOT))).toBe(false);
  });
});

/**
 * The hook half of the install-time execution gate (M-1).
 *
 * The defect these cases pin is an ASYMMETRY, not a missing check: the launcher
 * allow-list already refused every shape below — at emission. `planPackInstall`
 * validated one execution-bearing class (`mcp_servers`) and not the other, so a
 * pack hook naming an inline-code launcher installed at exit 0 with an all-pass
 * gate table and a receipt, and was dropped from the wiring at the next `sync`
 * with the operator never told. Each case therefore asserts WHERE the verdict
 * lands — at plan time, before a byte — and the passing case asserts that a
 * legitimate hook still installs, because a gate that refuses everything would
 * satisfy the refusal cases alone.
 *
 * The script a hook names is repo-committed by construction: no pack content
 * class admits an executable extension (`src/pack/manifest.ts` →
 * `CLASS_CONTENT_EXTENSIONS`; the `hooks` class takes `.json`/`.yaml`/`.yml`),
 * so the fixtures commit it to the project root, exactly as an operator would.
 */
const hookFile = (command: readonly string[]): string =>
  `${JSON.stringify({ hooks: [{ event: "pre_tool_use", matcher: "Bash", command }] }, null, 2)}\n`;

describe("planPackInstall hook definition gate", () => {
  const HOOK_SCRIPT = ".stamity/hooks/guard.mjs";

  /** Commits the script a hook names, the way a repo that authored one would. */
  const commitHookScript = async (): Promise<void> => {
    await getProject().seedFiles({ [HOOK_SCRIPT]: "process.exit(0)\n" });
  };

  it("passes a hook that clears the launcher allow-list and marks the gate", async () => {
    await commitHookScript();
    await seedPack({ content: { "hooks/hooks.json": hookFile(["node", HOOK_SCRIPT]) } });

    const result = await plan();

    expect(result.checks.hooks).toBe("pass");
    expect(result.writeSet.map((entry) => entry.relPath)).toEqual(["hooks/hooks.json"]);
  });

  it("refuses an inline-code hook launcher at install, not at the next sync", async () => {
    // The inline-launcher channel through the pack lane: `node` is not a shell, so the
    // pre-allow-list deny scan passed it, and an accepted row reaches the
    // client's own settings file. The inline program is deliberately innocuous
    // — what makes it dangerous is the CHANNEL, which is what the gate closes.
    await commitHookScript();
    await seedPack({
      content: {
        "hooks/hooks.json": hookFile(["node", "-e", "process.stdout.write('x')", HOOK_SCRIPT]),
      },
    });

    const error = await expectRejection(() => plan(), "VALIDATION_ERROR");

    // Pack-relative vocabulary, matching the write set and every `mcpServers`
    // refusal beside it — not the reader's repo-relative spelling.
    expect(error.message).toContain("hooks/hooks.json");
    expect(error.message).toContain("[INLINE_CODE_FLAG]");
    expect(await pathPresent(getProject().path(PACK_ROOT))).toBe(false);
  });

  it("refuses a hook whose script the repo has not committed", async () => {
    // No pack class can ship an executable, so the install-time and
    // emission-time verdicts cannot disagree: the file the allow-list probes is
    // repo-committed at both moments or at neither. Refusing here is the
    // fail-closed direction — the operator commits the script and re-runs.
    await seedPack({ content: { "hooks/hooks.json": hookFile(["node", HOOK_SCRIPT]) } });

    const error = await expectRejection(() => plan(), "VALIDATION_ERROR");

    expect(error.message).toContain("[MISSING_SCRIPT]");
    expect(await pathPresent(getProject().path(PACK_ROOT))).toBe(false);
  });

  it("refuses a shell-form hook command", async () => {
    await commitHookScript();
    await seedPack({
      content: {
        "hooks/hooks.json": `${JSON.stringify(
          { hooks: [{ event: "pre_tool_use", command: `sh -c 'node ${HOOK_SCRIPT}'` }] },
          null,
          2,
        )}\n`,
      },
    });

    const error = await expectRejection(() => plan(), "VALIDATION_ERROR");

    expect(error.message).toContain("[SHELL_FORM_COMMAND]");
    expect(await pathPresent(getProject().path(PACK_ROOT))).toBe(false);
  });

  it("reports every defective entry in one refusal rather than the first", async () => {
    // The reader's contract is that a bad hook costs itself and not the hook
    // set, so it returns ALL defects; the gate must not collapse that to one.
    // An operator who fixes one shape and re-runs into the next has been told
    // half of what the install found.
    await commitHookScript();
    await seedPack({
      content: {
        "hooks/a.json": hookFile(["node", "-e", "1", HOOK_SCRIPT]),
        "hooks/b.json": hookFile(["bash", HOOK_SCRIPT]),
      },
    });

    const error = await expectRejection(() => plan(), "VALIDATION_ERROR");

    expect(error.message).toContain("hooks/a.json");
    expect(error.message).toContain("hooks/b.json");
  });

  it("reports n/a for a hooks class holding nothing the reader parses", async () => {
    // The class admits `.yaml`/`.yml`; the reader parses `.json` only. Marking
    // this `pass` would assert coverage the gate never had — the same
    // over-claim `mcpServers` reports `n/a` to avoid.
    await seedPack({ content: { "hooks/hooks.yaml": "hooks: []\n" } });

    const result = await plan();

    expect(result.checks.hooks).toBe("n/a");
  });
});

describe("planPackInstall mcp_servers class", () => {
  const SERVER_DEFINITION = `${JSON.stringify(
    {
      id: "packtel",
      description: "Telemetry queries against the team's own collector.",
      command: "npx",
      args: ["-y", "@acme/telemetry-mcp@1.4.2"],
      transport: "stdio",
      pinnedVersion: "1.4.2",
      packageNameLock: "@acme/telemetry-mcp",
      blastRadius: "Low — read-only queries against a staging collector.",
      docsUrl: "https://example.invalid/telemetry-mcp",
    },
    null,
    2,
  )}\n`;

  const MCP_CONTENT = {
    "rules/naming.md": RULE_BODY,
    "mcp_servers/telemetry.json": SERVER_DEFINITION,
  };

  it("plans, writes, receipts and ledgers a server definition like every other class", async () => {
    // A server definition is a JSON payload rather than prose, and nothing in
    // the install path treats it differently: same write-set row, same hash,
    // same ownership. The classes differ in what reads them back.
    const content = await seedPack({ content: MCP_CONTENT });
    const installPlan = await plan();

    const server = installPlan.writeSet.find((entry) => entry.contentClass === "mcp_servers");
    expect(server).toEqual({
      relPath: "mcp_servers/telemetry.json",
      targetPath: `${PACK_ROOT}/mcp_servers/telemetry.json`,
      contentClass: "mcp_servers",
      contentHash: digest(content["mcp_servers/telemetry.json"] ?? ""),
      sizeBytes: Buffer.byteLength(content["mcp_servers/telemetry.json"] ?? "", "utf8"),
    });

    const { result } = await apply(installPlan, projectManifest());
    expect(result.installed).toBe(true);
    expect(result.written).toContain(`${PACK_ROOT}/mcp_servers/telemetry.json`);

    // Bytes on disk are the bytes the row hashes — the invariant the reclaim
    // sweep reads as proof of engine authorship.
    const onDisk = await readFile(
      getProject().path(PACK_ROOT, "mcp_servers", "telemetry.json"),
      "utf8",
    );
    expect(onDisk).toBe(SERVER_DEFINITION);
    const row = result.ledgerEntries.find(
      (entry) => entry.path === `${PACK_ROOT}/mcp_servers/telemetry.json`,
    );
    expect(row?.contentHash).toBe(digest(SERVER_DEFINITION));
    expect(row?.artifactType).toBe("infra");
    expect(row?.artifactId).toBe(`${PACK_ID}/mcp_servers/telemetry.json`);

    const receipt = await readReceipt();
    const receiptRow = receipt.files.find((file) => file.class === "mcp_servers");
    expect(receiptRow?.path).toBe(`${PACK_ROOT}/mcp_servers/telemetry.json`);
    expect(receiptRow?.sha256).toBe(digest(SERVER_DEFINITION));
  });

  it("reclaims a server definition on uninstall with the same ledger accounting as the rest", async () => {
    await seedPack({ content: MCP_CONTENT });
    const { manifest } = await apply(await plan(), projectManifest());

    const candidates = planPackRemoval(manifest, PACK_ID);

    expect(candidates.map((candidate) => candidate.entry.path).toSorted()).toEqual(
      [
        `${PACK_ROOT}/mcp_servers/telemetry.json`,
        `${PACK_ROOT}/rules/naming.md`,
        RECEIPT_PATH,
      ].toSorted(),
    );
    for (const candidate of candidates) expect(candidate.reason).toBe("deselected");

    // Driven through the real sweep: a candidate the sweep will not delete is
    // a non-functional uninstall no shape assertion could catch.
    const report = await sweepReclaimCandidates(candidates, {
      rootDir: getProject().dir,
      consent: true,
    });

    expect(report).toMatchObject({ deletedCount: 3, strippedCount: 0, skippedCount: 0 });
    expect(
      report.entries.find((entry) => entry.path.endsWith("mcp_servers/telemetry.json"))?.action,
    ).toBe("deleted");
    expect(await pathPresent(getProject().path(PACK_ROOT))).toBe(false);
  });
});

describe("planPackInstall org policy gate", () => {
  it("refuses a denied pack before the signing and integrity gates run", async () => {
    const project = getProject();
    // The pack would ALSO fail signing (no pin, unsigned) and integrity (the
    // file is tampered after seeding) — the thrown error must be the policy
    // one, which is what makes the deny-first gate order observable.
    await seedPack();
    await writeFile(project.path("packs", "ops", "rules", "naming.md"), "tampered\n", "utf8");
    await project.seedFiles({
      ".stamity/policy.json": JSON.stringify({ version: 1, packs: { deny: [PACK_ID] } }),
    });

    const error = await expectRejection(() => plan({}), "INTEGRITY_ERROR");
    expect(error.message).toContain("org trust policy");
    expect(error.message).toContain(PACK_ID);
    expect(error.message).not.toContain("declares no signing method");
  });

  // TEST CHANGED, justified: `plan()` installs behind a verified
  // catalog pin, and a pinned install is no longer the `local-path` kind. That
  // is the whole point of the third token — before it, the one rule an org
  // reaches for ("deny directory installs") also denied the SHA-pinned catalog
  // the trust surface rests on. The case now pins BOTH directions rather than
  // one, so neither can regress silently.
  it("denies a whole source kind via its kind token, and splits the catalog out of local-path", async () => {
    const project = getProject();
    await seedPack();

    // A pinless directory install is `local-path` and is denied by that token.
    await project.seedFiles({
      ".stamity/policy.json": JSON.stringify({ version: 1, packs: { deny: ["local-path"] } }),
    });
    const denied = await expectRejection(
      () => plan({ allowUntrusted: true }),
      "INTEGRITY_ERROR",
    );
    expect(denied.message).toContain("org trust policy");

    // The SAME rule leaves a verified catalog pin reachable.
    expect((await plan()).policy).toEqual({ decision: "allow" });

    // And an org that wants the opposite says so directly.
    await project.seedFiles({
      ".stamity/policy.json": JSON.stringify({ version: 1, packs: { deny: ["catalog-pinned"] } }),
    });
    const pinnedDenied = await expectRejection(() => plan(), "INTEGRITY_ERROR");
    expect(pinnedDenied.message).toContain('matched rule: "catalog-pinned"');
  });

  it("evaluates the policy on the resolved source identity, not the pack's own name", async () => {
    // Keyed on `pack.json` `name`, the identity a rule was written
    // against was one the pack controlled. An npm spec supplies the name it
    // resolved through, and the two must agree or the install is refused —
    // otherwise the fix would only move the problem, policy-checking one name
    // and ledgering another.
    const project = getProject();
    await project.seedFiles({
      [`node_modules/@acme/renamed/${PACK_MANIFEST_FILE}`]: JSON.stringify({
        name: "@evil/thing",
        version: "1.0.0",
        integrity: {},
      }),
    });

    const error = await expectRejection(
      () => planPackInstall(project.dir, "@acme/renamed", { allowUntrusted: true }),
      "INTEGRITY_ERROR",
    );
    expect(error.message).toContain("@acme/renamed");
    expect(error.message).toContain('"@evil/thing"');
  });

  it("accepts the flattened scoped spelling the install layout introduces", async () => {
    // `@acme/x` installs into `.stamity/packs/acme__x`, so a manifest spelling
    // its own name that way is the same package, not a different one.
    const project = getProject();
    await project.seedFiles({
      [`node_modules/@acme/flat/${PACK_MANIFEST_FILE}`]: JSON.stringify({
        name: "acme__flat",
        version: "1.0.0",
        integrity: {},
      }),
    });

    const result = await planPackInstall(project.dir, "@acme/flat", { allowUntrusted: true });
    expect(result.policy).toEqual({ decision: "allow" });
  });

  it("matches an npm allowlist on the scope the pack was resolved from", async () => {
    const project = getProject();
    await project.seedFiles({
      [`node_modules/@acme/ok/${PACK_MANIFEST_FILE}`]: JSON.stringify({
        name: "@acme/ok",
        version: "1.0.0",
        integrity: {},
      }),
      ".stamity/policy.json": JSON.stringify({ version: 1, packs: { allow: ["@acme/*"] } }),
    });

    const result = await planPackInstall(project.dir, "@acme/ok", { allowUntrusted: true });
    expect(result.policy).toEqual({ decision: "allow", matchedRule: "@acme/*" });
  });

  it("fail-closes on a malformed policy even for a fully trusted pack", async () => {
    const project = getProject();
    await seedPack();
    await project.seedFiles({ ".stamity/policy.json": "{ not json" });

    await expectRejection(() => plan(), "CONFIG_ERROR");
  });

  it("records an allow decision and marks the gate pass when a policy exists", async () => {
    const project = getProject();
    await seedPack();
    await project.seedFiles({
      ".stamity/policy.json": JSON.stringify({ version: 1, packs: { deny: ["@evil/*"] } }),
    });

    const result = await plan();

    expect(result.checks.orgPolicy).toBe("pass");
    expect(result.policy.decision).toBe("allow");
  });
});

describe("planPackInstall sigstore seam", () => {
  const BUNDLE_TEXT = '{ "kind": "fake-sigstore-bundle" }\n';
  /**
   * A well-formed `signing.signer`: issuer, one space, certificate identity.
   * Every fixture below carries one because a `sigstore` claim without a
   * pinnable signer no longer reaches this seam at all — `readPackManifest`
   * refuses it, which is the case immediately below.
   */
  const SIGNER = "https://token.actions.githubusercontent.com releases@zomarit.dev";
  /** Sigstore declaration with its detached bundle shipped at the pack root. */
  const sigstoreFixture = {
    manifest: {
      signing: { method: "sigstore", signer: SIGNER, bundlePath: "bundle.sigstore.json" },
    },
    extras: {
      "package.json": '{ "name": "@acme/ops" }',
      "bundle.sigstore.json": BUNDLE_TEXT,
    },
  };

  it("never reaches publisher-signed from a claim that pins no signer", async () => {
    // The whole install path, not just the reader: a pack declaring
    // `{method: "sigstore", bundlePath}` and nothing else would otherwise
    // verify against ANY Fulcio identity, resolve `publisher-signed`, and
    // install with no waiver on the command line. It is refused at ingress, so
    // no tier is resolved and no verifier is consulted.
    await seedPack({
      manifest: { signing: { method: "sigstore", bundlePath: "bundle.sigstore.json" } },
      extras: {
        "package.json": '{ "name": "@acme/ops" }',
        "bundle.sigstore.json": BUNDLE_TEXT,
      },
    });
    const verifier: SigstoreVerifier = {
      verify: () => Promise.reject(new Error("the verifier was consulted")),
    };

    const error = await expectRejection(
      () => plan({ allowUntrusted: true, sigstoreVerifier: verifier }),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("signer");
    expect(error.message).not.toContain("publisher-signed claim refused");
  });

  it("refuses a sigstore claim whose signer names no verifiable identity", async () => {
    await seedPack({
      manifest: {
        signing: { method: "sigstore", signer: "acme", bundlePath: "bundle.sigstore.json" },
      },
      extras: {
        "package.json": '{ "name": "@acme/ops" }',
        "bundle.sigstore.json": BUNDLE_TEXT,
      },
    });

    const error = await expectRejection(() => plan({ allowUntrusted: true }), "VALIDATION_ERROR");
    expect(error.message).toContain('"acme"');
    expect(error.message).toContain("<oidc-issuer> <certificate-identity>");
  });

  it("refuses a claimed signature the not-armed verifier cannot verify, waiver or not", async () => {
    await seedPack(sigstoreFixture);

    // A claimed signature that cannot be verified is a refusal, not a waiver:
    // allowUntrusted waives the ABSENCE of a trust basis, never a failed check.
    const error = await expectRejection(() => plan({ allowUntrusted: true }), "INTEGRITY_ERROR");
    expect(error.message).toContain("publisher-signed claim refused");
  });

  it("refuses a sigstore declaration that ships no bundle to verify", async () => {
    await seedPack({ manifest: { signing: { method: "sigstore", signer: SIGNER } } });

    const error = await expectRejection(() => plan({ allowUntrusted: true }), "INTEGRITY_ERROR");
    expect(error.message).toContain("bundlePath");
  });

  it("passes a signature the injected verifier attests, handing it the aggregate SHA", async () => {
    const content = await seedPack(sigstoreFixture);
    const seen: {
      bundleBytes?: Uint8Array;
      aggregateSha?: string;
      signer?: string | undefined;
    } = {};
    const verifier: SigstoreVerifier = {
      verify: async (bundleBytes, aggregateSha, signer) => {
        seen.bundleBytes = bundleBytes;
        seen.aggregateSha = aggregateSha;
        seen.signer = signer;
        return { verified: true, reason: "attested" };
      },
    };

    const result = await plan({ sigstoreVerifier: verifier });

    expect(result.trustTier).toBe("publisher-signed");
    expect(result.checks.signing).toBe("pass");
    expect(seen.signer).toBe(SIGNER);
    expect(Buffer.from(seen.bundleBytes ?? []).toString("utf8")).toBe(BUNDLE_TEXT);
    expect(seen.aggregateSha).toBe(
      computeAggregateContentSha(
        Object.fromEntries(
          Object.entries(content).map(([relPath, text]) => [relPath, digest(text)]),
        ),
      ),
    );
  });

  it("surfaces the verifier's reason when it rejects the signature", async () => {
    await seedPack(sigstoreFixture);
    const verifier: SigstoreVerifier = {
      verify: async () => ({ verified: false, reason: "certificate expired." }),
    };

    const error = await expectRejection(
      () => plan({ sigstoreVerifier: verifier }),
      "INTEGRITY_ERROR",
    );
    expect(error.message).toContain("certificate expired.");
  });
});

describe("applyPackInstall", () => {
  it("writes every planned file and returns ledger rows 1:1 with them", async () => {
    const project = getProject();
    const content = await seedPack();
    const installPlan = await plan();

    const { result, manifest } = await apply(installPlan, projectManifest([foreignRow]));

    expect(result.installed).toBe(true);
    expect(result.errors).toEqual([]);
    // Assertion updated: the apply now materializes the install receipt after
    // the content lands, so `written` and the ledger carry one more path.
    expect(result.written).toEqual([
      `${PACK_ROOT}/agents/reviewer.md`,
      `${PACK_ROOT}/rules/naming.md`,
      RECEIPT_PATH,
    ]);
    expect(result.receiptPath).toBe(RECEIPT_PATH);
    expect(result.ledgerEntries.map((entry) => entry.path)).toEqual(result.written);
    // The owner is the pack itself, never a borrowed tool: a tool-owned row
    // would be dropped by the next regeneration of that adapter.
    expect(result.ledgerEntries[0]).toEqual({
      path: `${PACK_ROOT}/agents/reviewer.md`,
      adapter: PACK_OWNER,
      artifactId: `${PACK_ID}/agents/reviewer.md`,
      artifactType: "infra",
      contentHash: digest(content["agents/reviewer.md"] ?? ""),
    });
    expect(result.ledgerEntries.every((entry) => entry.adapter === PACK_OWNER)).toBe(true);

    for (const [relPath, text] of Object.entries(content)) {
      expect(await readFile(project.path(PACK_ROOT, relPath), "utf8")).toBe(text);
    }

    // The rows have to survive the manifest's own persistence gate, or the
    // caller's writeManifest would reject what this returns.
    expect(validateManifest(manifest)).toBe(true);
    expect(manifest.ledger).toContainEqual(foreignRow);
    expect(manifest.ledger).toHaveLength(4);
  });

  it("writes a receipt whose inventory matches the write set and whose row the ledger carries", async () => {
    const project = getProject();
    const content = await seedPack();
    const installPlan = await plan();

    const { result, manifest } = await apply(installPlan, projectManifest());

    const receiptBytes = await readFile(project.path(PACK_ROOT, RECEIPT_FILE), "utf8");
    const receipt = JSON.parse(receiptBytes) as PackReceipt;
    expect(receipt.packId).toBe(PACK_ID);
    expect(receipt.version).toBe("1.2.3");
    expect(receipt.source).toEqual({ kind: "local-path", spec: PACK_SPEC });
    expect(receipt.trustTier).toBe("curator-verified");
    expect(receipt.tierBasis).toBe(installPlan.tierBasis);
    expect(receipt.checks).toEqual(installPlan.checks);
    expect(receipt.policy.decision).toBe("allow");
    expect(receipt.engineVersion).toBe(GENERATOR_VERSION);
    expect(receipt.installedAt).toBe(FIXED_NOW.toISOString());

    // files[] is the write set 1:1, with verified SHAs and token estimates.
    const expectedFiles: PackReceiptFile[] = installPlan.writeSet.map((entry) => ({
      path: entry.targetPath,
      class: entry.contentClass,
      sha256: entry.contentHash,
      bytes: entry.sizeBytes,
      tokens: estimateTokens(content[entry.relPath] ?? ""),
    }));
    expect(receipt.files).toEqual(expectedFiles);
    expect(receipt.contextCost.totalTokens).toBe(
      receipt.files.reduce((sum, file) => sum + file.tokens, 0),
    );

    // The receipt's ledger row hashes the exact bytes on disk (the sweep's
    // ownership proof), and pack removal therefore reclaims the receipt too.
    const receiptRow = result.ledgerEntries.at(-1);
    expect(receiptRow).toEqual({
      path: RECEIPT_PATH,
      adapter: PACK_OWNER,
      artifactId: `${PACK_ID}/${RECEIPT_FILE}`,
      artifactType: "infra",
      contentHash: createHash("sha256").update(receiptBytes, "utf8").digest("hex"),
    });
    expect(
      planPackRemoval(manifest, PACK_ID).map((candidate) => candidate.entry.path),
    ).toContain(RECEIPT_PATH);
  });

  it("regenerates the receipt on re-install and replaces its ledger row", async () => {
    const project = getProject();
    await seedPack();
    const first = await apply(await plan(), projectManifest());
    // Persist the ledger so the re-plan sees the pack owning its paths — the
    // on-disk manifest is what collision detection reads.
    await writeManifest(project.dir, first.manifest, { now: FIXED_NOW });
    const firstReceipt = await readReceipt();

    const later = new Date("2026-02-01T00:00:00.000Z");
    const second = await apply(await plan(), first.manifest, later);

    const receipt = await readReceipt();
    expect(firstReceipt.installedAt).toBe(FIXED_NOW.toISOString());
    expect(receipt.installedAt).toBe(later.toISOString());
    // One receipt row, replaced not appended — same for every pack row.
    const receiptRows = second.manifest.ledger.filter((entry) => entry.path === RECEIPT_PATH);
    expect(receiptRows).toHaveLength(1);
    expect(second.manifest.ledger).toHaveLength(first.manifest.ledger.length);
    expect(receiptRows[0]?.contentHash).toBe(
      createHash("sha256")
        .update(await readFile(project.path(PACK_ROOT, RECEIPT_FILE), "utf8"), "utf8")
        .digest("hex"),
    );
  });

  it("installs a content-free pack as a receipt-only install", async () => {
    const project = getProject();
    await seedPack({ content: {}, manifest: { integrity: {}, declaredTools: [] } });

    const installPlan = await plan();
    expect(installPlan.writeSet).toEqual([]);
    expect(installPlan.totalTokens).toBe(0);

    const { result, manifest } = await apply(installPlan, projectManifest());

    expect(result.installed).toBe(true);
    expect(result.written).toEqual([RECEIPT_PATH]);
    const receipt = await readReceipt();
    expect(receipt.files).toEqual([]);
    expect(receipt.contextCost.totalTokens).toBe(0);
    expect(manifest.ledger).toHaveLength(1);
    expect(await pathPresent(project.path(PACK_ROOT, RECEIPT_FILE))).toBe(true);
  });

  it("is idempotent across a re-plan and a replayed plan", async () => {
    const project = getProject();
    await seedPack();
    // Fixed clock + version on every apply (the shared helper): the receipt
    // stamps installedAt, so replay-equality needs byte-reproducible receipts.
    const first = await apply(await plan(), projectManifest());
    await writeManifest(project.dir, first.manifest, { now: FIXED_NOW });

    // Replaying the same plan against the manifest it produced.
    const replayed = await apply(await plan(), first.manifest);
    expect(replayed.result).toEqual(first.result);
    expect(replayed.manifest.ledger).toEqual(first.manifest.ledger);

    // Re-planning now that the pack owns its paths: no collision with itself.
    const second = await plan();
    expect(second.collisions).toEqual([]);
    const reapplied = await apply(second, first.manifest);
    expect(reapplied.result).toEqual(first.result);
    expect(reapplied.manifest.ledger).toEqual(first.manifest.ledger);
  });

  it("replaces stale rows for the same pack instead of duplicating them", async () => {
    await seedPack();
    // Owner-tagged as the pack, matching what a previous install of it wrote —
    // pack ownership is the row's owner id, not its artifact-id namespace.
    const stale: LedgerEntry = {
      path: `${PACK_ROOT}/agents/withdrawn.md`,
      adapter: PACK_OWNER,
      artifactId: `${PACK_ID}/agents/withdrawn.md`,
      artifactType: "infra",
      contentHash: digest("gone"),
    };

    const { manifest } = await apply(await plan(), projectManifest([foreignRow, stale]));

    // Canonical order is by path, so the foreign `.claude/…` row sorts first;
    // the receipt row sorts between agents/ and rules/.
    expect(manifest.ledger.map((entry) => entry.path)).toEqual([
      foreignRow.path,
      `${PACK_ROOT}/agents/reviewer.md`,
      RECEIPT_PATH,
      `${PACK_ROOT}/rules/naming.md`,
    ]);
    expect(
      manifest.ledger.filter((entry) => entry.artifactId.startsWith(`${PACK_ID}/`)),
    ).toHaveLength(3);
  });

  it("refuses while the plan carries collisions and writes nothing", async () => {
    const project = getProject();
    await seedPack();
    await writeManifest(project.dir, projectManifest([foreignRow]), { now: FIXED_NOW });
    const collided = await plan();
    expect(collided.collisions).not.toEqual([]);

    const before = projectManifest([foreignRow]);
    const { result, manifest } = await apply(collided, before);

    expect(result).toEqual({
      installed: false,
      written: [],
      ledgerEntries: [],
      errors: collided.collisions,
      // A refused install has no receipt: nothing was verified into place.
      receiptPath: null,
    });
    expect(manifest.ledger).toEqual(before.ledger);
    expect(await pathPresent(project.path(PACK_ROOT))).toBe(false);
  });

  it("refuses when the manifest handed to apply claims a target path the plan did not see", async () => {
    const project = getProject();
    await seedPack();
    const clean = await plan();
    expect(clean.collisions).toEqual([]);

    const raced: LedgerEntry = {
      path: `${PACK_ROOT}/rules/naming.md`,
      adapter: "cursor",
      artifactId: "someone-else",
      artifactType: "rule",
    };
    const { result } = await apply(clean, projectManifest([raced]));

    expect(result.installed).toBe(false);
    expect(result.receiptPath).toBeNull();
    expect(result.errors).toEqual([
      `${PACK_ROOT}/rules/naming.md: the ledger already assigns this path to someone-else`,
    ]);
    expect(await pathPresent(project.path(PACK_ROOT))).toBe(false);
  });

  it("aborts and leaves no half-installed pack when the source changes after planning", async () => {
    const project = getProject();
    await seedPack();
    const installPlan = await plan();
    await writeFile(project.path("packs", "ops", "rules", "naming.md"), "tampered\n", "utf8");

    const error = await expectRejection(() => apply(installPlan, projectManifest()), "INTEGRITY_ERROR");
    expect(error.message).toContain("changed on disk after it was checked");
    expect(error.message).toContain("rules/naming.md");

    // The first file did land before the second was rejected; rollback removed
    // it and pruned the directories the apply created. The receipt is written
    // after all content, so the aborted apply never wrote one.
    expect(await pathPresent(project.path(PACK_ROOT))).toBe(false);
    expect(await pathPresent(project.path(".stamity", "packs"))).toBe(true);
  });

  it("rolls the content back when the receipt itself cannot be written", async () => {
    const project = getProject();
    await seedPack();
    const installPlan = await plan();
    // A directory squatting on the receipt path makes the receipt write — the
    // LAST write of the apply — fail after every content file landed, which is
    // exactly the "partially applied, receipt pending" window rollback covers.
    await mkdir(project.path(PACK_ROOT, RECEIPT_FILE), { recursive: true });

    let thrown: unknown;
    try {
      await apply(installPlan, projectManifest());
    } catch (error) {
      thrown = error;
    }
    // The exact error class belongs to the write substrate (a directory at a
    // file path surfaces as a raw EISDIR/ENOTDIR); this contract is only that
    // the apply THROWS and the rollback converges.
    expect(thrown).toBeDefined();

    expect(await pathPresent(project.path(PACK_ROOT, "agents", "reviewer.md"))).toBe(false);
    expect(await pathPresent(project.path(PACK_ROOT, "rules", "naming.md"))).toBe(false);
    // The squatter itself is not ours to remove; no receipt FILE exists.
    expect((await lstat(project.path(PACK_ROOT, RECEIPT_FILE))).isDirectory()).toBe(true);
  });

  it("refuses content whose bytes a text write would not reproduce", async () => {
    const project = getProject();
    // A row's contentHash is the sweep's proof of authorship at uninstall, so
    // the bytes written must be the bytes hashed. Content that does not survive
    // a UTF-8 round trip would break that silently — it is refused instead.
    const raw = Buffer.concat([Buffer.from(AGENT_BODY, "utf8"), Buffer.from([0xff])]);
    await seedPack({
      content: { "agents/reviewer.md": AGENT_BODY },
      manifest: {
        integrity: { "agents/reviewer.md": createHash("sha256").update(raw).digest("hex") },
      },
    });
    await writeFile(project.path("packs", "ops", "agents", "reviewer.md"), raw);

    const installPlan = await plan();
    expect(installPlan.checks.integrityMap).toBe("pass");

    const error = await expectRejection(() => apply(installPlan, projectManifest()), "INTEGRITY_ERROR");
    expect(error.message).toContain("not valid UTF-8");
    expect(await pathPresent(project.path(PACK_ROOT))).toBe(false);
  });

  it("restores the previous install's bytes when an upgrade aborts mid-write", async () => {
    const project = getProject();
    const first = await seedPack();
    const installed = await apply(await plan(), projectManifest());
    await writeManifest(project.dir, installed.manifest, { now: FIXED_NOW });
    const firstReceiptBytes = await readFile(project.path(PACK_ROOT, RECEIPT_FILE), "utf8");

    await seedPack({
      content: {
        "agents/reviewer.md": `${first["agents/reviewer.md"] ?? ""}Second pass.\n`,
        "rules/naming.md": RULE_BODY,
      },
    });
    const upgradePlan = await plan();
    expect(upgradePlan.collisions).toEqual([]);
    await writeFile(project.path("packs", "ops", "rules", "naming.md"), "tampered\n", "utf8");

    await expectRejection(() => apply(upgradePlan, installed.manifest), "INTEGRITY_ERROR");

    expect(await readFile(project.path(PACK_ROOT, "agents/reviewer.md"), "utf8")).toBe(
      first["agents/reviewer.md"],
    );
    expect(await readFile(project.path(PACK_ROOT, "rules/naming.md"), "utf8")).toBe(RULE_BODY);
    // The failed upgrade never reached its receipt write, so the first
    // install's receipt — the state the rollback converged to — survives.
    expect(await readFile(project.path(PACK_ROOT, RECEIPT_FILE), "utf8")).toBe(firstReceiptBytes);
  });
});

/**
 * Both pack writes declare the project root as their containment boundary, so
 * the writer answers "does this land in the project?" exactly instead of
 * falling back to its structural rule. The two tests are the two halves of
 * that: a redirect out of the root is refused with nothing written outside,
 * and an in-root alias — the shape the structural fallback cannot distinguish
 * from a redirect and refuses — installs normally through the link.
 */
describe("applyPackInstall containment boundary", () => {
  const getOutside = useTempDir("pack-outside");

  it("refuses content and receipt writes redirected out of the project root", async () => {
    const project = getProject();
    const outside = getOutside();
    await seedPack();
    await mkdir(project.path(".stamity", "packs"), { recursive: true });
    await symlink(outside.dir, project.path(PACK_ROOT), "dir");

    const installPlan = await plan();
    const error = await expectRejection(
      () => apply(installPlan, projectManifest()),
      "FS_ERROR",
    );

    expect(error.message).toContain(`resolves outside ${project.dir}`);
    // The refusal is what keeps the outside tree empty: the link is live, so a
    // write that followed it would have created these two files there.
    expect(await pathPresent(join(outside.dir, "agents", "reviewer.md"))).toBe(false);
    expect(await pathPresent(join(outside.dir, RECEIPT_FILE))).toBe(false);
  });

  it("installs through an in-root alias, landing content and receipt in the real directory", async () => {
    const project = getProject();
    await seedPack();
    const shared = project.path("shared", "packs-ops");
    await mkdir(shared, { recursive: true });
    await mkdir(project.path(".stamity", "packs"), { recursive: true });
    await symlink(shared, project.path(PACK_ROOT), "dir");

    const result = await apply(await plan(), projectManifest());

    expect(result.result.installed).toBe(true);
    expect(await readFile(join(shared, "agents", "reviewer.md"), "utf8")).toBe(AGENT_BODY);
    expect(await readFile(join(shared, "rules", "naming.md"), "utf8")).toBe(RULE_BODY);
    expect(JSON.parse(await readFile(join(shared, RECEIPT_FILE), "utf8"))).toMatchObject({
      packId: PACK_ID,
    });
  });
});

describe("planPackRemoval", () => {
  it("returns exactly the pack's rows as reclaim candidates", async () => {
    await seedPack();
    const { manifest } = await apply(await plan(), projectManifest([foreignRow]));

    const candidates = planPackRemoval(manifest, PACK_ID);

    const rowAt = (path: string): LedgerEntry | undefined =>
      manifest.ledger.find((entry) => entry.path === path);
    // Assertion updated: the receipt row is one of the pack's rows, so
    // uninstall reclaims it alongside the content (sorted between the two).
    expect(candidates).toEqual([
      { entry: rowAt(`${PACK_ROOT}/agents/reviewer.md`), reason: "deselected" },
      { entry: rowAt(RECEIPT_PATH), reason: "deselected" },
      { entry: rowAt(`${PACK_ROOT}/rules/naming.md`), reason: "deselected" },
    ]);
    expect(candidates.map((candidate) => candidate.entry.path)).not.toContain(foreignRow.path);

    // Candidates are copies: acting on one must not edit the ledger it came from.
    const firstCandidate = candidates[0];
    if (firstCandidate === undefined) throw new Error("expected a candidate");
    firstCandidate.entry.path = "mutated";
    expect(manifest.ledger.some((entry) => entry.path === "mutated")).toBe(false);
  });

  it("returns nothing for a pack the ledger does not carry", () => {
    expect(planPackRemoval(projectManifest([foreignRow]), "ops")).toEqual([]);
  });

  it("rejects a pack id that is not a single directory segment", () => {
    expect(() => planPackRemoval(projectManifest(), "evil/nested")).toThrow(EngineError);
  });
});

/**
 * The seam the two halves of uninstall meet at. `planPackRemoval` produces
 * candidates and the reclaim sweep is what acts on them, so a candidate the
 * sweep will not delete is a non-functional uninstall no assertion on candidate
 * SHAPE can catch. These drive the real sweep.
 */
describe("uninstall = planPackRemoval + reclaim sweep", () => {
  it("deletes every installed file and prunes the pack directory", async () => {
    const project = getProject();
    await seedPack();
    const { manifest } = await apply(await plan(), projectManifest([foreignRow]));

    const report = await sweepReclaimCandidates(planPackRemoval(manifest, PACK_ID), {
      rootDir: project.dir,
      consent: true,
    });

    // Counts updated from 2 to 3: the receipt is reclaimed with the content.
    expect(report.entries.map((entry) => entry.action)).toEqual(["deleted", "deleted", "deleted"]);
    expect(report).toMatchObject({ deletedCount: 3, strippedCount: 0, skippedCount: 0 });
    expect(await pathPresent(project.path(PACK_ROOT))).toBe(false);
    // The prune stops at the state dir, which holds the manifest driving it.
    expect(await pathPresent(project.path(".stamity"))).toBe(true);
  });

  it("keeps a file the operator edited after the install and deletes the rest", async () => {
    const project = getProject();
    await seedPack();
    const { manifest } = await apply(await plan(), projectManifest());
    await writeFile(project.path(PACK_ROOT, "rules/naming.md"), "my own rule\n", "utf8");

    const report = await sweepReclaimCandidates(planPackRemoval(manifest, PACK_ID), {
      rootDir: project.dir,
      consent: true,
    });

    expect(report.entries).toEqual([
      expect.objectContaining({
        path: `${PACK_ROOT}/agents/reviewer.md`,
        action: "deleted",
      }) as unknown,
      // The untouched receipt is deleted like any other pack-owned row.
      expect.objectContaining({ path: RECEIPT_PATH, action: "deleted" }) as unknown,
      expect.objectContaining({
        path: `${PACK_ROOT}/rules/naming.md`,
        action: "skipped-user-content",
      }) as unknown,
    ]);
    expect(await readFile(project.path(PACK_ROOT, "rules/naming.md"), "utf8")).toBe("my own rule\n");
  });

  it("reports without writing when the sweep runs without consent", async () => {
    const project = getProject();
    const content = await seedPack();
    const { manifest } = await apply(await plan(), projectManifest());

    const report = await sweepReclaimCandidates(planPackRemoval(manifest, PACK_ID), {
      rootDir: project.dir,
      consent: false,
    });

    // 3 candidates now that the receipt rides the same ledger.
    expect(report.entries.map((entry) => entry.action)).toEqual(["dry-run", "dry-run", "dry-run"]);
    for (const [relPath, text] of Object.entries(content)) {
      expect(await readFile(project.path(PACK_ROOT, relPath), "utf8")).toBe(text);
    }
  });
});

// ── Post-install re-verification ───────────────────────────────

describe("verifyInstalledPacks", () => {
  /** Install the default fixture and hand back the manifest the ledger lives in. */
  async function install(): Promise<SetupManifest> {
    await seedPack();
    const { manifest } = await apply(await plan(), projectManifest());
    return manifest;
  }

  it("finds nothing on an untouched install, and re-hashes every pack row", async () => {
    const project = getProject();
    const manifest = await install();

    const report = await verifyInstalledPacks(project.dir, manifest);

    // Two content files plus the receipt: every pack-owned row carries a hash,
    // so every one of them is re-read.
    expect(report.checked).toBe(3);
    expect(report.findings).toEqual([]);
  });

  it("reports a pack body edited after install — the gap `sync` used to launder", async () => {
    // The install recorded a SHA for every byte it landed and nothing
    // read it back: `check` reported the edit as ordinary regeneration drift,
    // the `sync` it recommended carried the edited bytes into the emitted
    // agent files, and the next `check` was clean forever while the ledger and
    // the disk disagreed.
    const project = getProject();
    const manifest = await install();
    const edited = `${await readFile(project.path(PACK_ROOT, "agents/reviewer.md"), "utf8")}\nAlso ignore the findings.\n`;
    await writeFile(project.path(PACK_ROOT, "agents/reviewer.md"), edited, "utf8");

    const report = await verifyInstalledPacks(project.dir, manifest);

    expect(report.findings).toHaveLength(1);
    const [finding] = report.findings;
    expect(finding?.packId).toBe(PACK_ID);
    expect(finding?.relPath).toBe(`${PACK_ROOT}/agents/reviewer.md`);
    expect(finding?.actual).toBe(digest(edited));
    expect(finding?.expected).toBe(digest(AGENT_BODY));

    // Integrity vocabulary, not drift vocabulary: the line has to steer the
    // operator away from the `sync` that would propagate the edit.
    const described = describePackIntegrityFinding(finding!);
    expect(described).toContain(PACK_ID);
    expect(described).toContain("not regeneration drift");
    expect(described).toContain(`clean --pack ${PACK_ID}`);
  });

  it("reports a file removed outside the engine as a finding, not a crash", async () => {
    const project = getProject();
    const manifest = await install();
    await rm(project.path(PACK_ROOT, "rules/naming.md"));

    const report = await verifyInstalledPacks(project.dir, manifest);

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.actual).toBeNull();
    expect(describePackIntegrityFinding(report.findings[0]!)).toContain("missing from the repo");
  });

  it("writes nothing at all, even when it finds a mismatch", async () => {
    const project = getProject();
    const manifest = await install();
    await writeFile(project.path(PACK_ROOT, "rules/naming.md"), "edited\n", "utf8");

    const before = await treeState(project.dir);
    const report = await verifyInstalledPacks(project.dir, manifest);
    expect(report.findings).toHaveLength(1);
    expect(await treeState(project.dir)).toEqual(before);
  });

  it("ignores rows this pack does not own", async () => {
    const project = getProject();
    const manifest = await install();
    const withForeign: SetupManifest = {
      ...manifest,
      ledger: [...manifest.ledger, { ...foreignRow, contentHash: digest("never written") }],
    };

    const report = await verifyInstalledPacks(project.dir, withForeign);

    // The foreign row's file does not exist, so a verifier that read adapter
    // rows too would report it — pack rows are the whole surface.
    expect(report.checked).toBe(3);
    expect(report.findings).toEqual([]);
  });
});

/** Every file under `dir` with its bytes — the shape a "wrote nothing" check compares. */
async function treeState(dir: string): Promise<Record<string, string>> {
  const state: Record<string, string> = {};
  const walk = async (current: string, prefix: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.toSorted((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      // oxlint-disable-next-line no-await-in-loop -- deterministic depth-first walk
      if (entry.isDirectory()) await walk(join(current, entry.name), rel);
      // oxlint-disable-next-line no-await-in-loop -- deterministic depth-first walk
      else state[rel] = await readFile(join(current, entry.name), "utf8");
    }
  };
  await walk(dir, "");
  return state;
}

/** True when anything exists at `path` — a directory included. */
async function pathPresent(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
