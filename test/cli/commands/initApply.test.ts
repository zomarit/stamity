import { createHash } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_LISTED_MODELS,
  applyInit,
  readClientModelLists,
  type InitApplyOptions,
  type ModelLister,
} from "../../../src/cli/commands/init/apply.ts";
import type { InitDecisions } from "../../../src/cli/commands/init/plan.ts";
import {
  planOutputEntries,
  type SyncPlanEntry,
} from "../../../src/cli/commands/sync/engine.ts";
import type * as emissionModule from "../../../src/cli/engine/emission.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../../src/content/contentRoot.ts";
import { collectManifestErrors, createManifest, readManifest } from "../../../src/manifest/manifest.ts";
import { applyPackInstall, planPackInstall } from "../../../src/pack/install.ts";
import { verifyInstalledPacks } from "../../../src/pack/verifyInstalled.ts";
import { REQUIRED_GITIGNORE_ENTRIES } from "../../../src/mcp/env.ts";
import { wrapInManagedBlock } from "../../../src/merge/managedBlocks.ts";
import type { AdapterOutput } from "../../../src/types/content.ts";
import type { LedgerEntry } from "../../../src/types/manifest.ts";
import type { PredecessorDefaults } from "../../../src/migration/carry.ts";
import type { Tool } from "../../../src/types/core.ts";
import type { RepoInfo } from "../../../src/types/detect.ts";
import { EngineError } from "../../../src/types/errors.ts";
import { madeUpArtifact, writeMadeUpPack } from "../../support/packFixtures.ts";
import { seedGitRepo } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

// Fixture data kept out of the test-input census: built at run time, as a literal it names this repository's own handoffs keep file.
const HANDOFFS_KEEP = [".stamity/handoffs", ".gitkeep"].join("/");

/**
 * The planner seam is SUBSTITUTED here, and that is the whole of what the mock
 * buys: a hand-written `AdapterOutput[]` per case, so apply's write, ledger and
 * dry-run-prediction paths can be driven with an emission set small enough to
 * assert row by row — one collision, one co-owned path, one marker-less file.
 *
 * Header corrected. It used to open "the shipped emission planner is
 * the no-op", and read as an EQUIVALENCE: the mock's default `[]` was described
 * as byte-identical to the shipped planner, so a maintainer was told the
 * substitution changed nothing. That premise died when the seam flipped to the
 * composed planner — a live init emits dozens of files — and while it stood it
 * was the reason two production branches keyed on a zero-output plan
 * (`init.ts`'s dry-run write line, `panel.ts`'s installed label) looked covered
 * here while nothing exercised them against a real plan. This mock is a
 * SUBSTITUTION of the whole emission layer, not a stand-in for it.
 *
 * What covers the real planner: `./init.test.ts` drives the shipped composed
 * planner end to end against a seeded corpus and asserts what actually lands,
 * and `./syncEngine.test.ts` covers the plan/apply wiring on the sync side.
 * Behaviour that depends on what a real emission produces belongs there; what
 * belongs here is apply's own handling of an emission set it is handed.
 */
const plannerOutputs = vi.hoisted(() => ({ value: [] as AdapterOutput[] }));
/** The planner's findings channel, substituted alongside its rows: apply reads
 *  `planWithWarnings`, so a mock defining `plan` alone would not answer it. */
const plannerWarnings = vi.hoisted(() => ({ value: [] as string[] }));
vi.mock("../../../src/cli/engine/emission.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof emissionModule>();
  return {
    ...actual,
    getEmissionPlanner: () => ({
      id: "noop",
      plan: async () => structuredClone(plannerOutputs.value),
      planWithWarnings: async () => ({
        outputs: structuredClone(plannerOutputs.value),
        warnings: structuredClone(plannerWarnings.value),
      }),
    }),
  };
});

/**
 * Apply is the write half of init, so every test runs against a real temp repo
 * and reads the tree back. The clock is injected everywhere, and the bundled
 * content root is pinned per test to a directory this file controls — an empty
 * corpus by default (the honest pre-adapter state), a seeded one where the
 * selection wiring itself is under test.
 */
const getTemp = useTempDir("init-apply");

const FIXED_NOW = new Date("2026-08-13T09:00:00.000Z");
const LATER_NOW = new Date("2026-08-13T10:30:00.000Z");
const ENGINE_VERSION = "0.0.0-test";

const STATE_DIRS = [".stamity", ".stamity/learnings", ".stamity/handoffs"] as const;

/** The machine-local entries every client setup ignores (decision E1): all but `.env.mcp`, which waits for a server that needs a credential. */
const CLIENT_ENTRIES = REQUIRED_GITIGNORE_ENTRIES.filter((entry) => entry !== ".env.mcp");

/** The `.gitignore` row a first init records for `adapter` where the repo had no `.gitignore` (REQ-FLOW-016). */
function gitignoreRow(adapter: Tool): Record<string, unknown> {
  return {
    path: ".gitignore",
    adapter,
    artifactId: "gitignore",
    artifactType: "infra",
    // TEST CHANGE, justified: review/32 — the row hashes the recorded lines alone, never the file.
    contentHash: createHash("sha256").update(`stamity .gitignore lines\0${CLIENT_ENTRIES.join("\n")}`, "utf8").digest("hex"),
    coOwned: { lines: CLIENT_ENTRIES, createdFile: true },
  };
}

/** Content-root fixture directory (inside the per-test temp dir) the pin points at. */
const CONTENT_FIXTURE = "content-fixture";

beforeEach(async () => {
  // Reset the substituted planner to "emits nothing"; only the
  // planned-emission suite below hands it outputs. This is a per-test starting
  // point, NOT a claim that it matches what the shipped planner would produce
  // for the same manifest — see the module header.
  plannerOutputs.value = [];
  plannerWarnings.value = [];
  const contentDir = getTemp().path(CONTENT_FIXTURE);
  await mkdir(contentDir, { recursive: true });
  __setContentRootForTests(contentDir);
});

afterEach(() => {
  __resetContentRootCacheForTests();
});

/** A repo root inside the current test's temp dir. */
async function makeRepo(): Promise<string> {
  const root = getTemp().path("repo");
  await mkdir(root, { recursive: true });
  return root;
}

/** A complete `RepoInfo` with nothing detected. */
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

/** Default-sourced decisions for an empty greenfield repo, overridable per test. */
function decisionsFor(rootDir: string, overrides: Partial<InitDecisions> = {}): InitDecisions {
  return {
    tools: ["claude"],
    toolsSource: "default",
    detectedTools: [],
    greenfield: true,
    monorepoPackages: [],
    maturityTier: "solo",
    maturitySource: "default",
    existingConfigPaths: [],
    detected: { languages: [], linters: [], testFrameworks: [], ciProviders: [] },
    repoInfo: emptyInfo(rootDir),
    // FIXTURE RECONCILIATION (workspace init hook): `InitDecisions` gained the
    // workspace probe's result. No case in this suite is about it — `applyInit`
    // reads neither field — so the fixture carries the probe's own
    // no-workspace-here answer and every assertion here is unchanged.
    workspaceCandidates: [],
    workspaceSource: "standalone",
    ...overrides,
  };
}

function optionsFor(rootDir: string, overrides: Partial<InitApplyOptions> = {}): InitApplyOptions {
  return {
    rootDir,
    decisions: decisionsFor(rootDir),
    engineVersion: ENGINE_VERSION,
    dryRun: false,
    force: false,
    now: FIXED_NOW,
    ...overrides,
  };
}

/** Recursive `relative path -> file content` snapshot, for byte-identity assertions. */
async function snapshotTree(dir: string, prefix = ""): Promise<Record<string, string>> {
  const entries = await readdir(dir, { withFileTypes: true });
  const snapshot: Record<string, string> = {};
  for (const entry of entries.toSorted((a, b) => (a.name < b.name ? -1 : 1))) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      // oxlint-disable-next-line no-await-in-loop -- test helper walking a tiny fixture tree in deterministic order
      Object.assign(snapshot, await snapshotTree(join(dir, entry.name), relative));
    } else {
      // oxlint-disable-next-line no-await-in-loop -- same deterministic fixture walk
      snapshot[relative] = await readFile(join(dir, entry.name), "utf8");
    }
  }
  return snapshot;
}

describe("applyInit — fresh repo", () => {
  // TEST CHANGE, justified: REQ-FLOW-016 — .env.mcp is written only when a server needs a credential;
  // retitled from "… and gitignores .env.mcp", since a setup with no MCP server no longer does.
  it("scaffolds state dirs, writes a valid manifest, and gitignores the machine-local state", async () => {
    // A plain temp directory is also the non-git edge case: no repository,
    // no platform, and apply must still succeed.
    const root = await makeRepo();
    const report = await applyInit(optionsFor(root));

    // TEST CHANGE (sw10-first-run-output, REQ-FLOW-022): the report gained two
    // fields the panel counts and names — the placeholders this run created and the
    // .gitignore entries it appended. A fresh repo gets both placeholders and the
    // whole required set; every field the case pinned before is pinned unchanged.
    expect(report).toEqual({
      manifestPath: join(root, ".stamity", "manifest.json"),
      createdDirs: [...STATE_DIRS],
      createdKeeps: [".stamity/learnings/.gitkeep", HANDOFFS_KEEP],
      wrote: [],
      warnings: [],
      // TEST CHANGE, justified: REQ-FLOW-016 — .env.mcp is written only when a server needs a credential,
      // and the lines this run appended are recorded on a .gitignore row, so the ledger holds that row.
      ledgerCount: 1,
      gitignoreEnsured: true,
      gitignoreAdded: CLIENT_ENTRIES,
      // TEST CHANGE, justified (2026-10-25_autonomy-distribution-02/prove/12): the report names the kept packs init
      // took back from their receipts; a fresh repo has none.
      adoptedPacks: [],
      dryRun: false,
    });
    for (const dir of STATE_DIRS) {
      // oxlint-disable-next-line no-await-in-loop -- three sequential stats over a fixed list
      expect((await stat(join(root, dir))).isDirectory()).toBe(true);
    }

    // Round-trip through the real reader, and the raw document through the
    // full validator: zero defects.
    const manifest = await readManifest(root);
    expect(manifest).not.toBeNull();
    const raw: unknown = JSON.parse(await readFile(report.manifestPath, "utf8"));
    expect(collectManifestErrors(raw)).toEqual([]);

    expect(manifest?.tools).toEqual(["claude"]);
    expect(manifest?.generatedBy).toBe(ENGINE_VERSION);
    expect(manifest?.createdAt).toBe(FIXED_NOW.toISOString());
    expect(manifest?.updatedAt).toBe(FIXED_NOW.toISOString());
    expect(manifest?.maturityTier).toBe("solo");
    expect(manifest?.platform).toBeUndefined();
    // Empty corpus -> full-core selection is all-empty arrays. The ledger is
    // empty because the SUBSTITUTED planner was handed no outputs for this
    // case, not because a real planner over this manifest would emit none.
    expect(manifest?.selection).toEqual({ items: { agent: [], skill: [], rule: [], command: [] } });
    // TEST CHANGE, justified: REQ-FLOW-016 — the one row is the record of the .gitignore lines this run
    // appended, which `clean` takes back; no MCP server is selected, so .env.mcp gets no line.
    expect(manifest?.ledger).toEqual([gitignoreRow("claude")]);

    expect((await readFile(join(root, ".gitignore"), "utf8")).split("\n")).not.toContain(".env.mcp");
    // REQ-FLOW-016: the same lane ignores the review gate's runtime state.
    expect((await readFile(join(root, ".gitignore"), "utf8")).split("\n")).toEqual(
      expect.arrayContaining([".stamity/review-gate.json", ".stamity/review-gate.json.lock", ".stamity/review-gate.json.tmp-*"]),
    );
  });

  it("selects the full corpus when the bundled catalog carries artifacts", async () => {
    await getTemp().seedFiles({
      [`${CONTENT_FIXTURE}/agents/stamity-reviewer.md`]:
        "---\nid: reviewer\ndescription: Reviews diffs\ntags: [review]\n---\nBody.\n",
      [`${CONTENT_FIXTURE}/rules/stamity-security.md`]:
        "---\nid: security\ndescription: Security floor\ntags: [security]\n---\nBody.\n",
    });
    const root = await makeRepo();
    await applyInit(optionsFor(root));

    const manifest = await readManifest(root);
    expect(manifest?.selection).toEqual({
      items: { agent: ["reviewer"], skill: [], rule: ["security"], command: [] },
    });
  });

  it("selects the fork layer's artifacts beside the corpus's: an addition listed, a replacement listed once", async () => {
    // The fork root resolves as the corpus root's sibling `fork/`
    // (`src/content/contentRoot.ts`), so it sits beside the pinned fixture the
    // way it sits beside the bundled corpus in a fork's package. A selection
    // read off the corpus alone left every fork artifact out of the manifest
    // `init` writes, and out of every count derived from it.
    await getTemp().seedFiles({
      [`${CONTENT_FIXTURE}/agents/stamity-reviewer.md`]:
        "---\nid: reviewer\ndescription: Reviews diffs\ntags: [review]\n---\nBody.\n",
      [`${CONTENT_FIXTURE}/rules/stamity-security.md`]:
        "---\nid: security\ndescription: Security floor\ntags: [security]\n---\nBody.\n",
      "fork/agents/acme-onboarding.md":
        "---\nid: acme-onboarding\ndescription: The fork's onboarding agent\ntags: [review]\n---\nBody.\n",
      "fork/rules/security.md":
        "---\nid: security\ndescription: The fork's security floor\ntags: [security]\n---\nFork body.\n",
    });
    const root = await makeRepo();
    await applyInit(optionsFor(root));

    const manifest = await readManifest(root);
    expect(manifest?.selection).toEqual({
      items: { agent: ["reviewer", "acme-onboarding"], skill: [], rule: ["security"], command: [] },
    });
  });

  it("records a platform when the decisions carry one", async () => {
    const root = await makeRepo();
    await applyInit(
      optionsFor(root, { decisions: decisionsFor(root, { platform: "github" }) }),
    );

    expect((await readManifest(root))?.platform).toBe("github");
  });
});

describe("applyInit — the .gitignore lines it records (REQ-FLOW-016)", () => {
  it("writes no .env.mcp line for codex with no MCP server, and the other seven", async () => {
    const root = await makeRepo();
    const report = await applyInit(optionsFor(root, { decisions: decisionsFor(root, { tools: ["codex"] }) }));

    expect(report.gitignoreAdded).toEqual(CLIENT_ENTRIES);
    expect(CLIENT_ENTRIES).toHaveLength(7);
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe(`${CLIENT_ENTRIES.join("\n")}\n`);
    expect((await readManifest(root))?.ledger).toEqual([gitignoreRow("codex")]);
  });

  it("writes and records the .env.mcp line when the file is already on disk", async () => {
    const root = await makeRepo();
    await writeFile(join(root, ".env.mcp"), "GITHUB_TOKEN=\n", "utf8");

    const report = await applyInit(optionsFor(root));

    expect(report.gitignoreAdded).toEqual([...REQUIRED_GITIGNORE_ENTRIES]);
    const [row] = (await readManifest(root))?.ledger ?? [];
    expect(row?.coOwned?.lines).toEqual([...REQUIRED_GITIGNORE_ENTRIES]);
  });

  it("owns neither a line the file already covers nor one it negates", async () => {
    const root = await makeRepo();
    await writeFile(join(root, ".gitignore"), "/.stamity/\n!.env.mcp\n", "utf8");
    await writeFile(join(root, ".env.mcp"), "GITHUB_TOKEN=\n", "utf8");

    const report = await applyInit(optionsFor(root));

    expect(report.gitignoreAdded).toEqual([]);
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe("/.stamity/\n!.env.mcp\n");
    expect((await readManifest(root))?.ledger).toEqual([]);
  });

  it("carries the previous setup's record through a --force re-init that appends nothing", async () => {
    const root = await makeRepo();
    await applyInit(optionsFor(root));

    const report = await applyInit(optionsFor(root, { force: true, now: LATER_NOW }));

    expect(report.gitignoreAdded).toEqual([]);
    expect((await readManifest(root))?.ledger).toEqual([gitignoreRow("claude")]);
  });
});

describe("applyInit — existing setup", () => {
  it("refuses without force, naming sync, config, and clean as the next steps", async () => {
    const root = await makeRepo();
    await applyInit(optionsFor(root));

    const failure = await applyInit(optionsFor(root)).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(EngineError);
    expect((failure as EngineError).code).toBe("VALIDATION_ERROR");
    for (const nextStep of ["stamity sync", "stamity config", "stamity clean", "--force"]) {
      expect((failure as EngineError).message).toContain(nextStep);
    }
  });

  it("proceeds over an existing setup with force", async () => {
    const root = await makeRepo();
    await applyInit(optionsFor(root));

    const report = await applyInit(optionsFor(root, { force: true, now: LATER_NOW }));

    // The dirs already exist, so a forced re-init creates none.
    expect(report.createdDirs).toEqual([]);
    // Nor a placeholder, nor a .gitignore line: the first run put all of them there.
    expect(report.createdKeeps).toEqual([]);
    expect(report.gitignoreAdded).toEqual([]);
    const manifest = await readManifest(root);
    expect(manifest?.createdAt).toBe(LATER_NOW.toISOString());
    expect(manifest?.updatedAt).toBe(LATER_NOW.toISOString());
  });

  it("lets a corrupt manifest's CONFIG_ERROR propagate instead of treating it as absent", async () => {
    const root = await makeRepo();
    await mkdir(join(root, ".stamity"), { recursive: true });
    // Valid JSON, invalid manifest: readManifest owns the repair guidance, and
    // apply must not shadow it by initialising over broken state.
    await writeFile(join(root, ".stamity", "manifest.json"), "{}\n", "utf8");

    const failure = await applyInit(optionsFor(root)).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(EngineError);
    expect((failure as EngineError).code).toBe("CONFIG_ERROR");
  });
});

describe("applyInit — the packs a clean kept (REQ-FLOW-028)", () => {
  const PACK_ID = "acme-kept";
  const OWNER = `pack:${PACK_ID}`;

  /** A real install of a made-up pack, as `add` lands it, with no manifest beside it: what `clean -y` leaves. */
  async function keptPack(root: string): Promise<LedgerEntry[]> {
    const source = await writeMadeUpPack(getTemp().path("pack-sources"), PACK_ID, {
      "agents/stamity-acme-helper.md": madeUpArtifact("acme-helper", "agent", "Helps with acme."),
      "rules/stamity-acme-style.md": madeUpArtifact("acme-style", "rule", "The acme style."),
    });
    const plan = await planPackInstall(root, source, { allowUntrusted: true });
    const setup = createManifest({ tools: ["claude"], selection: { items: { agent: [], skill: [], rule: [], command: [] } }, generatorVersion: ENGINE_VERSION, now: FIXED_NOW });
    const { result } = await applyPackInstall(root, plan, setup, { engineVersion: ENGINE_VERSION, now: FIXED_NOW });
    expect(result.installed, result.errors.join("; ")).toBe(true);
    expect(existsSync(join(root, ".stamity", "manifest.json"))).toBe(false);
    return result.ledgerEntries;
  }

  const byPath = (rows: readonly LedgerEntry[]): LedgerEntry[] => rows.toSorted((a, b) => a.path.localeCompare(b.path));

  it("records the kept pack's rows again with the hashes its install recorded, and its integrity check passes", async () => {
    const root = await makeRepo();
    const recorded = await keptPack(root);
    expect(recorded).toHaveLength(3);

    const report = await applyInit(optionsFor(root));

    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("init wrote no manifest");
    expect(byPath(manifest.ledger.filter((row) => row.adapter === OWNER))).toEqual(byPath(recorded));
    expect(await verifyInstalledPacks(root, manifest)).toEqual({ checked: 3, findings: [] });
    expect(report.warnings.filter((warning) => warning.includes(".stamity/packs/"))).toEqual([]);
    // prove/12: the pack taken back is named, so the panel can say so.
    expect(report.adoptedPacks).toEqual([PACK_ID]);
  });

  it("names a kept pack it would take back under --dry-run too, and records nothing", async () => {
    const root = await makeRepo();
    await keptPack(root);

    const report = await applyInit(optionsFor(root, { dryRun: true }));

    expect(report.adoptedPacks).toEqual([PACK_ID]);
    expect(await readManifest(root)).toBeNull();
  });

  it("records no row of a kept pack whose file was edited, and names it in one warning that points at add", async () => {
    const root = await makeRepo();
    await keptPack(root);
    await writeFile(join(root, ".stamity", "packs", PACK_ID, "rules", "stamity-acme-style.md"), "my own rule\n", "utf8");

    const report = await applyInit(optionsFor(root));

    const manifest = await readManifest(root);
    expect(manifest?.ledger.filter((row) => row.adapter === OWNER)).toEqual([]);
    const named = report.warnings.filter((warning) => warning.includes(`.stamity/packs/${PACK_ID}/`));
    expect(named).toHaveLength(1);
    expect(named[0]).toContain("rules/stamity-acme-style.md hashes to");
    expect(named[0]).toContain("add <source>");
    // A refused pack is a warning only, never named as taken back.
    expect(report.adoptedPacks).toEqual([]);
  });
});

describe("applyInit — dry run", () => {
  it("reports the dirs and writes it would create while leaving the tree byte-identical", async () => {
    const root = await makeRepo();
    await writeFile(join(root, "README.md"), "# App\n", "utf8");
    const before = await snapshotTree(root);

    const report = await applyInit(optionsFor(root, { dryRun: true }));

    expect(report.dryRun).toBe(true);
    expect(report.createdDirs).toEqual([...STATE_DIRS]);
    expect(report.wrote).toEqual([]);
    expect(report.ledgerCount).toBe(0);
    expect(report.gitignoreEnsured).toBe(false);
    // A preview names the placeholders it would create and appends nothing.
    expect(report.createdKeeps).toEqual([".stamity/learnings/.gitkeep", HANDOFFS_KEEP]);
    expect(report.gitignoreAdded).toEqual([]);
    expect(report.manifestPath).toBe(join(root, ".stamity", "manifest.json"));

    expect(await snapshotTree(root)).toEqual(before);
    expect(await readManifest(root)).toBeNull();
  });
});

describe("applyInit — planner findings", () => {
  /**
   * The findings channel's carry half. The planner's `warnings` are not a per-file verdict —
   * a hook rejected at parse time produces no output row at all — so apply has
   * to carry them off the plan and onto the report, or the panel that renders
   * `InitApplyReport` has nothing to read. The substituted planner supplies
   * both channels here; `./init.test.ts` proves the same path against the real
   * composed planner over a genuinely malformed hook file.
   */
  const REJECTED = "user hook .stamity/hooks/broken.json [INVALID_JSON]: not valid JSON";

  it("carries the planner's findings onto the report, alongside zero writes", async () => {
    const root = await makeRepo();
    plannerWarnings.value = [REJECTED];

    const report = await applyInit(optionsFor(root));

    expect(report.warnings).toEqual([REJECTED]);
    // Not conflated with the writer's channel: nothing was written, so a
    // report that sourced warnings from `wrote[]` would carry none.
    expect(report.wrote).toEqual([]);
  });

  it("carries them under --dry-run too — planning runs in full either way", async () => {
    const root = await makeRepo();
    plannerWarnings.value = [REJECTED];

    const report = await applyInit(optionsFor(root, { dryRun: true }));

    expect(report.warnings).toEqual([REJECTED]);
    expect(await readManifest(root)).toBeNull();
  });

  it("reports an empty channel as empty rather than as absent", async () => {
    const root = await makeRepo();

    expect((await applyInit(optionsFor(root))).warnings).toEqual([]);
  });
});

describe("applyInit — predecessor defaults", () => {
  const defaults: PredecessorDefaults = {
    tools: ["cursor", "copilot"],
    maturityTier: "scaleup",
    communicationStyle: "technical",
    mcpServers: ["github"],
  };

  it("lands offered defaults in the manifest over detection-sourced decisions", async () => {
    const root = await makeRepo();
    await applyInit(optionsFor(root, { defaults }));

    const manifest = await readManifest(root);
    expect(manifest?.tools).toEqual(["cursor", "copilot"]);
    expect(manifest?.maturityTier).toBe("scaleup");
    expect(manifest?.communicationStyle).toBe("technical");
    expect(manifest?.mcp).toEqual({ servers: ["github"] });
  });

  it("lets explicit flag-sourced decisions win over the defaults", async () => {
    const root = await makeRepo();
    await applyInit(
      optionsFor(root, {
        defaults,
        decisions: decisionsFor(root, {
          tools: ["codex"],
          toolsSource: "flag",
          maturityTier: "solo",
          maturitySource: "flag",
        }),
      }),
    );

    const manifest = await readManifest(root);
    expect(manifest?.tools).toEqual(["codex"]);
    expect(manifest?.maturityTier).toBe("solo");
    // No flag competes for the MCP servers: the defaults still land.
    expect(manifest?.mcp).toEqual({ servers: ["github"] });
  });
});

/**
 * TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): the
 * `plugin` option that `stamity plugin setup` passed init left with that verb and
 * the `plugin-backed` mode, so the three cases that copied it onto the manifest
 * went with it. The case that a greenfield init writes no `plugin` key stays.
 */
describe("applyInit — no plugin block", () => {
  it("keeps the field off a manifest no caller set it on", async () => {
    const root = await makeRepo();
    const report = await applyInit(optionsFor(root));
    // Absence, not a written default: a greenfield manifest must stay
    // byte-identical to the one written before the field existed.
    const raw = JSON.parse(await readFile(report.manifestPath, "utf8")) as Record<string, unknown>;
    expect(Object.hasOwn(raw, "plugin")).toBe(false);
  });
});

describe("applyInit — planned emission (planner seam)", () => {
  /**
   * A managed-block output stamped with the test engine version.
   *
   * TEST CHANGE, justified: REQ-PLUGIN-045 — the persisted ledger must lie in
   * the owned-path bound, which reads the row's type: a `rule` only under a
   * content folder, `AGENTS.md` only as `infra`. The helper typed every row
   * `rule`, so the `AGENTS.md` cases now pass `infra`, as every release
   * records the charter.
   */
  function managedOutput(path: string, body: string, artifactType: "rule" | "infra" = "rule"): AdapterOutput {
    return {
      path,
      content: wrapInManagedBlock(body, path, ENGINE_VERSION),
      owner: { adapter: "claude", artifactId: "guide", artifactType },
    };
  }

  // TEST CHANGE, justified: REQ-PLUGIN-045 — the guide sat at
  // `docs/stamity-guide.md`, a `rule` row outside every content folder, which
  // the manifest writer now refuses; it moved into `.claude/rules/`.
  const GUIDE = ".claude/rules/stamity-guide.md";

  it("writes planner outputs through the merge engine and stands behind them in the ledger", async () => {
    plannerOutputs.value = [managedOutput(GUIDE, "Guide body.\n")];
    const root = await makeRepo();

    const report = await applyInit(optionsFor(root));

    expect(report.wrote).toEqual([
      { path: join(root, ".claude", "rules", "stamity-guide.md"), action: "created" },
    ]);
    // TEST CHANGE, justified: REQ-FLOW-016 — the ledger also records the .gitignore lines this run appended.
    expect(report.ledgerCount).toBe(2);

    const manifest = await readManifest(root);
    // Justification for the changed expectation: the row gains `contentHash`.
    // Init used to omit it while `sync` recorded it for the same emission, so
    // the ledger's shape depended on which verb wrote it last. The hash is the
    // reclaim sweep's authorship proof (`src/merge/reclaim.ts` gate 2b), and
    // its absence left init-only repos un-cleanable. Asserted as the literal
    // sha256 of the emitted content so the row pins what the sweep re-derives
    // from disk, not merely that some string is present.
    expect(manifest?.ledger).toEqual([
      {
        path: GUIDE,
        adapter: "claude",
        artifactId: "guide",
        artifactType: "rule",
        contentHash: createHash("sha256")
          .update(wrapInManagedBlock("Guide body.\n", GUIDE, ENGINE_VERSION))
          .digest("hex"),
        stampedVersion: ENGINE_VERSION,
      },
      // TEST CHANGE, justified: REQ-FLOW-016 — the record of the .gitignore lines this run appended.
      gitignoreRow("claude"),
    ]);
    // The persisted document, ledger included, passes the full validator.
    const raw: unknown = JSON.parse(await readFile(report.manifestPath, "utf8"));
    expect(collectManifestErrors(raw)).toEqual([]);
  });

  describe("the backup a replace decision takes (REQ-FLOW-027)", () => {
    const OWNER = "# Team\n\nour own instructions\n";
    const charter = (): AdapterOutput => ({
      path: "AGENTS.md",
      content: "# Charter\n\nengine charter body\n",
      owner: { adapter: "claude", artifactId: "charter", artifactType: "infra" },
    });

    async function ownerRepo(): Promise<string> {
      const root = await makeRepo();
      await writeFile(join(root, "AGENTS.md"), OWNER, "utf8");
      return root;
    }

    it("records the .bak and the hash of its bytes on the replace decision", async () => {
      plannerOutputs.value = [charter()];
      const root = await ownerRepo();

      const report = await applyInit(optionsFor(root, { importChoice: [{ path: "AGENTS.md", mode: "replace" }] }));

      expect(report.wrote[0]?.backupPath).toBe(join(root, "AGENTS.md.bak"));
      expect((await readManifest(root))?.importChoice).toEqual([
        { path: "AGENTS.md", mode: "replace", backup: { path: "AGENTS.md.bak", sha256: createHash("sha256").update(OWNER).digest("hex") } },
      ]);
      await expect(readFile(join(root, "AGENTS.md.bak"), "utf8")).resolves.toBe(OWNER);
    });

    it("records no backup on a supplement decision, nor under a dry run", async () => {
      plannerOutputs.value = [charter()];
      const supplemented = await ownerRepo();
      await applyInit(optionsFor(supplemented, { importChoice: [{ path: "AGENTS.md", mode: "supplement" }] }));
      expect((await readManifest(supplemented))?.importChoice).toEqual([{ path: "AGENTS.md", mode: "supplement" }]);

      const previewed = getTemp().path("previewed");
      await mkdir(previewed, { recursive: true });
      await writeFile(join(previewed, "AGENTS.md"), OWNER, "utf8");
      const report = await applyInit(optionsFor(previewed, { dryRun: true, importChoice: [{ path: "AGENTS.md", mode: "replace" }] }));
      expect(report.wrote[0]).not.toHaveProperty("backupPath");
      expect(existsSync(join(previewed, "AGENTS.md.bak"))).toBe(false);
    });
  });

  /**
   * REQ-FLOW-029: under `--force`, the replaced setup's client rows at the
   * instruction files join the ownership index, so the charter it wrote is
   * judged by its recorded hash rather than as an unknown file.
   */
  describe("the replaced setup's instruction rows under --force (REQ-FLOW-029)", () => {
    /** A charter whose bytes pass the engine's fingerprint (`isEngineCharterDocument`), with one varying line. */
    const charterText = (line: string): string =>
      ["# Charter", "", line, "", "## Repo facts", "", "## Invariants", "", "## Touchpoints", "", "## Conditional layer", ""].join("\n");
    const charterOutput = (line: string): AdapterOutput => ({
      path: "AGENTS.md",
      content: charterText(line),
      owner: { adapter: "claude", artifactId: "charter", artifactType: "infra" },
    });
    const backupsIn = async (root: string): Promise<string[]> =>
      (await readdir(root)).filter((name) => name.startsWith("AGENTS.md.bak")).toSorted();

    it("overwrites an unedited, committed charter with no .bak", async ({ skip }) => {
      const root = await makeRepo();
      plannerOutputs.value = [charterOutput("Maturity tier: solo")];
      await applyInit(optionsFor(root));
      // Committed, because at an instruction file the recorded hash is not the
      // whole licence: git must also hold the bytes the overwrite replaces
      // (REQ-PLUGIN-046, `merge/safeWrite.ts::overwriteNeedsRecovery`).
      try {
        await seedGitRepo(root);
      } catch (error) {
        if (error instanceof Error && error.name === "GitUnavailableError") skip();
        throw error;
      }

      plannerOutputs.value = [charterOutput("Maturity tier: team")];
      const report = await applyInit(optionsFor(root, { force: true, now: LATER_NOW }));

      expect(report.wrote[0]?.action).toBe("updated");
      expect(report.wrote[0]).not.toHaveProperty("backupPath");
      expect(report.wrote[0]?.notice).toContain("its previous content is in git history");
      expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(charterText("Maturity tier: team"));
      expect(await backupsIn(root)).toEqual([]);
    });

    it("still backs up a charter edited since it was written", async () => {
      const root = await makeRepo();
      plannerOutputs.value = [charterOutput("Maturity tier: solo")];
      await applyInit(optionsFor(root));
      const edited = charterText("Maturity tier: solo, and our own line");
      await writeFile(join(root, "AGENTS.md"), edited, "utf8");

      plannerOutputs.value = [charterOutput("Maturity tier: team")];
      const report = await applyInit(optionsFor(root, { force: true, now: LATER_NOW }));

      expect(report.wrote[0]?.backupPath).toBe(join(root, "AGENTS.md.bak"));
      await expect(readFile(join(root, "AGENTS.md.bak"), "utf8")).resolves.toBe(edited);
    });

    it("keeps a carried backup record whole when the forced write backs up the engine's edited charter", async () => {
      const OWNER = "# Team\n\nour own instructions\n";
      const root = await makeRepo();
      await writeFile(join(root, "AGENTS.md"), OWNER, "utf8");
      plannerOutputs.value = [charterOutput("Maturity tier: solo")];
      await applyInit(optionsFor(root, { importChoice: [{ path: "AGENTS.md", mode: "replace" }] }));
      const recorded = (await readManifest(root))?.importChoice ?? [];
      const ownerBackup = { path: "AGENTS.md.bak", sha256: createHash("sha256").update(OWNER).digest("hex") };
      expect(recorded).toEqual([{ path: "AGENTS.md", mode: "replace", backup: ownerBackup }]);
      await writeFile(join(root, "AGENTS.md"), charterText("Maturity tier: solo, and our own line"), "utf8");

      plannerOutputs.value = [charterOutput("Maturity tier: team")];
      const report = await applyInit(optionsFor(root, { force: true, now: LATER_NOW, importChoice: recorded }));

      // The forced write took a second backup, of the edited charter, under its own name…
      expect(report.wrote[0]?.backupPath).toMatch(/AGENTS\.md\.bak\.[0-9a-f]{8}$/);
      // …and the record still names the owner's file, the one a full clean gives back.
      expect((await readManifest(root))?.importChoice).toEqual([{ path: "AGENTS.md", mode: "replace", backup: ownerBackup }]);
      await expect(readFile(join(root, "AGENTS.md.bak"), "utf8")).resolves.toBe(OWNER);
    });
  });

  it("merges a colliding unmanaged file with a warning instead of silently losing it", async () => {
    // The brief's collision edge case: a planned path already exists as a
    // marker-less user file. Under init's write options the merge engine
    // prepends the managed block and preserves every user byte below it —
    // surfaced as a warning-bearing `wrote[]` row, never silent loss.
    plannerOutputs.value = [managedOutput("AGENTS.md", "Managed body.\n", "infra")];
    const root = await makeRepo();
    const userBytes = "## My conventions\nuser notes survive merges\n";
    await writeFile(join(root, "AGENTS.md"), userBytes, "utf8");

    const report = await applyInit(optionsFor(root));

    expect(report.wrote).toHaveLength(1);
    expect(report.wrote[0]?.action).toBe("updated");
    // TEST CHANGE, justified: a first adoption is an INFO disposition,
    // not a degradation — the file is merged, every user byte is preserved, and
    // nothing about the run is worse for it. It rides `notice` now, so the
    // panel prints it plainly instead of colouring a happy-path outcome as a
    // warning. Both halves are asserted: the report says what happened, and it
    // does NOT say it as a warning.
    expect(report.wrote[0]?.warning).toBeUndefined();
    expect(report.wrote[0]?.notice).toContain("preserved");
    expect(report.wrote[0]?.notice).toContain("adopted AGENTS.md:");

    const merged = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(merged).toContain("STAMITY:BEGIN");
    expect(merged).toContain("user notes survive merges");
    // Merged (not skipped): the run stands behind the path, so it is ledgered.
    // TEST CHANGE, justified: REQ-FLOW-016 — the ledger also records the .gitignore lines this run appended.
    expect(report.ledgerCount).toBe(2);
    expect((await readManifest(root))?.ledger.map((entry) => entry.path)).toEqual([".gitignore", "AGENTS.md"]);
  });

  it("predicts the same collision disposition under dryRun while touching nothing", async () => {
    plannerOutputs.value = [managedOutput("AGENTS.md", "Managed body.\n", "infra")];
    const root = await makeRepo();
    await writeFile(join(root, "AGENTS.md"), "user notes\n", "utf8");
    const before = await snapshotTree(root);

    const report = await applyInit(optionsFor(root, { dryRun: true }));

    // The predictor agrees with the writer on the disposition (the wet twin
    // above lands `updated`); prediction rows carry no warning field.
    expect(report.wrote).toEqual([{ path: join(root, "AGENTS.md"), action: "updated" }]);
    expect(report.ledgerCount).toBe(1);
    expect(report.gitignoreEnsured).toBe(false);

    expect(await snapshotTree(root)).toEqual(before);
    expect(await readManifest(root)).toBeNull();
  });
});

/**
 * Init declares the repo root as the write boundary, so the merge engine
 * answers containment exactly rather than falling back to its structural rule.
 * The two tests are the two halves: a redirect out of the root is refused with
 * nothing landing outside, and the in-repo alias the structural fallback
 * cannot tell apart from a redirect (a link that leaves its own directory but
 * stays in the repo) emits normally into the real directory.
 */
describe("applyInit — write boundary", () => {
  const getOutside = useTempDir("init-outside");

  function managedOutput(path: string, body: string): AdapterOutput {
    return {
      path,
      content: wrapInManagedBlock(body, path, ENGINE_VERSION),
      owner: { adapter: "claude", artifactId: "guide", artifactType: "rule" },
    };
  }

  it("refuses an output whose directory is redirected out of the repo root", async () => {
    plannerOutputs.value = [managedOutput("docs/stamity-guide.md", "Guide body.\n")];
    const root = await makeRepo();
    const outside = getOutside();
    await symlink(outside.dir, join(root, "docs"), "dir");

    let thrown: unknown;
    try {
      await applyInit(optionsFor(root));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EngineError);
    expect((thrown as EngineError).code).toBe("FS_ERROR");
    expect((thrown as EngineError).message).toContain(`resolves outside ${root}`);
    // The live link would have carried the emission into the outside tree; the
    // refusal is what leaves it empty.
    expect(await readdir(outside.dir)).toEqual([]);
  });

  it("emits through an in-repo alias into the directory the link really names", async () => {
    plannerOutputs.value = [managedOutput(".cursor/rules/stamity-guide.md", "Guide body.\n")];
    const root = await makeRepo();
    await mkdir(join(root, ".cursor"), { recursive: true });
    await mkdir(join(root, "shared", "rules"), { recursive: true });
    await symlink(join(root, "shared", "rules"), join(root, ".cursor", "rules"), "dir");

    const report = await applyInit(optionsFor(root));

    expect(report.wrote).toEqual([
      { path: join(root, ".cursor", "rules", "stamity-guide.md"), action: "created" },
    ]);
    // TEST CHANGE, justified: REQ-FLOW-016 — the ledger also records the .gitignore lines this run appended.
    expect(report.ledgerCount).toBe(2);
    expect(await readFile(join(root, "shared", "rules", "stamity-guide.md"), "utf8")).toContain(
      "Guide body.",
    );
  });
});

/**
 * The MCP lane is the one output class init does NOT route through
 * `merge/safeWrite.ts`: the three shared documents are merged by ownership
 * (`manifest/mcpFilter.ts`), so none of that module's link guards were ever on
 * this path. `sync` grew its own check; init did not, and the gap was reachable
 * through a shipped flag — `--migrate full` over a predecessor manifest
 * carrying `mcp.servers` is what puts `.mcp.json` in the emission set.
 *
 * A planted `.mcp.json` therefore came back as a fresh independent 0644 inode
 * holding the credentials it was linked to, beside the generated `mcpServers`
 * block, at exit 0 with the file unnamed in the report — while the same run
 * printed a line asserting credentials live in the gitignored `.env.mcp`.
 * `.mcp.json` is not gitignored, so the next `git add -A` commits it.
 *
 * The guard now sits on the writer both callers share, which is why these cases
 * assert through `applyInit` rather than through the writer: the writer's own
 * unit lane is `test/manifest/mcpFilter.test.ts`, and what this file has to
 * prove is that the caller which never had a check is covered by it.
 */
/** The emitted `.mcp.json`, attributed the way the real MCP planner does. */
function mcpOutput(): AdapterOutput {
  return {
    path: ".mcp.json",
    content: `${JSON.stringify({ mcpServers: { github: { command: "npx" } } }, null, 2)}\n`,
    owner: { adapter: "claude", artifactId: "mcp", artifactType: "infra" },
  };
}

/**
 * The two verbs previewing ONE tree. `init --dry-run` and `sync --dry-run` are
 * two previews of the same regeneration, so a tree they disagree about is a tree
 * where at least one of them is lying about what its apply will do.
 *
 * Init's dry-run leg used to predict these three documents from EXISTENCE alone
 * — file there, therefore `updated` — while sync's plan lane ran the real
 * ownership merge and answered `unchanged` for an already-current document and
 * `collision` for one it would refuse. So a re-init over a tree a previous init
 * had just written previewed work that would not happen, and no init preview
 * could ever show the hard-link refusal its own apply raises.
 *
 * Both halves are asserted against `planOutputEntries` — sync's own
 * classification, not a restatement of it — so the case fails if either verb
 * moves. The shared prediction they now both call is
 * `src/cli/engine/emissionWrite.ts::predictMcpDocumentMerge`, unit-tested in
 * `test/cli/engine/emissionWrite.test.ts`.
 */
describe("applyInit — merged MCP documents previewed the way sync previews them", () => {
  /** Init with a predecessor carrying `mcp.servers` — the `--migrate full`
   *  shape, and the only one that puts `.mcp.json` in the emission set. */
  function migrateOptions(root: string, overrides: Partial<InitApplyOptions> = {}): InitApplyOptions {
    const defaults: PredecessorDefaults = { mcpServers: ["github"] };
    return optionsFor(root, { defaults, ...overrides });
  }

  /** Sync's own plan-lane verdict for the same output over the same tree. */
  async function syncEntry(root: string): Promise<SyncPlanEntry | undefined> {
    const [entry] = await planOutputEntries(root, [mcpOutput()], ENGINE_VERSION, undefined, [
      "github",
    ]);
    return entry;
  }

  it("previews an already-current document as unchanged, the answer sync's plan gives", async () => {
    plannerOutputs.value = [mcpOutput()];
    const root = await makeRepo();
    // Land the document for real first: the tree under both previews is exactly
    // what a completed init leaves, which is the tree a `--force` re-init meets.
    await applyInit(migrateOptions(root));
    const target = join(root, ".mcp.json");
    const landed = await readFile(target, "utf8");

    const preview = await applyInit(migrateOptions(root, { force: true, dryRun: true }));

    expect(preview.wrote).toEqual([{ path: target, action: "unchanged" }]);
    expect((await syncEntry(root))?.action).toBe("unchanged");
    // A preview writes nothing, on this lane too.
    await expect(readFile(target, "utf8")).resolves.toBe(landed);
    expect((await readManifest(root))?.updatedAt).toBe(FIXED_NOW.toISOString());
  });

  it("previews a document the merge would really change as updated", async () => {
    // The non-degenerate half: `unchanged` must be a computed answer, not a
    // constant. Same tree shape, one hand-added server, so the merge genuinely
    // rewrites the file and both verbs have to say so.
    plannerOutputs.value = [mcpOutput()];
    const root = await makeRepo();
    await writeFile(
      join(root, ".mcp.json"),
      `${JSON.stringify({ mcpServers: { mine: { command: "own" } } }, null, 2)}\n`,
      "utf8",
    );

    const preview = await applyInit(migrateOptions(root, { dryRun: true }));

    expect(preview.wrote).toEqual([{ path: join(root, ".mcp.json"), action: "updated" }]);
    expect((await syncEntry(root))?.action).toBe("update");
  });

  it("previews an unreadable document as skipped, naming what the apply would refuse to apply", async () => {
    plannerOutputs.value = [mcpOutput()];
    const root = await makeRepo();
    await writeFile(join(root, ".mcp.json"), "{not json\n", "utf8");

    const preview = await applyInit(migrateOptions(root, { dryRun: true }));

    expect(preview.wrote[0]?.action).toBe("skipped");
    expect(preview.wrote[0]?.warning).toContain("not valid JSON");
    // Skipped means the run does not stand behind the path, so the predicted
    // ledger does not claim it either.
    expect(preview.ledgerCount).toBe(0);
    expect((await syncEntry(root))?.action).toBe("collision");
  });
});

describe.skipIf(process.platform === "win32")("applyInit — linked MCP documents", () => {
  const getOutside = useTempDir("init-mcp-outside");
  const CANARY = "GOCSPX-CANARY-PRIVATE-KEY-MATERIAL";

  /** A 0600 gcloud-shaped credentials file outside the repo. Valid JSON, which
   *  is what makes the ownership merge keep its fields one by one. */
  async function plantCredentials(name: string): Promise<string> {
    const credPath = join(getOutside().dir, name);
    await writeFile(
      credPath,
      `${JSON.stringify(
        {
          client_id: "1234.apps.googleusercontent.com",
          client_secret: CANARY,
          refresh_token: `1//RT-${CANARY}`,
          type: "authorized_user",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await chmod(credPath, 0o600);
    return credPath;
  }

  /** Init with a predecessor carrying `mcp.servers` — the `--migrate full`
   *  shape, and the only one that puts `.mcp.json` in the emission set. */
  function migrateOptions(root: string, overrides: Partial<InitApplyOptions> = {}): InitApplyOptions {
    const defaults: PredecessorDefaults = { mcpServers: ["github"] };
    return optionsFor(root, { defaults, ...overrides });
  }

  it("refuses a hard-linked .mcp.json instead of publishing the twin's bytes", async () => {
    plannerOutputs.value = [mcpOutput()];
    const root = await makeRepo();
    const cred = await plantCredentials("application_default_credentials.json");
    const target = join(root, ".mcp.json");
    await link(cred, target);
    const before = await lstat(target);
    const original = await readFile(cred, "utf8");

    await expect(applyInit(migrateOptions(root))).rejects.toMatchObject({
      code: "FS_ERROR",
      message: expect.stringContaining("hard link"),
    });

    // Inode and nlink are the discriminators: a rewrite lands a NEW inode and
    // drops the outside name's link count to 1. Mode rides along as a third leg
    // — the substrate preserves it now, so 0600 alone would no longer separate
    // a refusal from a rewrite.
    const after = await lstat(target);
    expect(after.ino).toBe(before.ino);
    expect(after.nlink).toBe(2);
    expect(after.mode & 0o777).toBe(0o600);
    await expect(readFile(target, "utf8")).resolves.toBe(original);
    expect(await readFile(target, "utf8")).not.toContain("mcpServers");
    // The manifest is the commit point and is written last, so a refusal on the
    // way there must leave no manifest claiming ownership of this path.
    expect(await readManifest(root)).toBeNull();
  });

  /**
   * The refusal init's preview could not reach. The dry-run leg returned before
   * the merge, so a hard-linked `.mcp.json` previewed as an ordinary `updated`
   * — and the apply the preview was describing raises FS_ERROR on that exact
   * path (the case above). A preview that promises a write the run refuses is
   * the failure this whole pairing exists to prevent, and sync's plan already
   * reported it as a `shared-name` collision for the same tree.
   */
  it("previews a hard-linked document as refused, where sync's plan reports the collision", async () => {
    plannerOutputs.value = [mcpOutput()];
    const root = await makeRepo();
    const cred = await plantCredentials("preview-adc.json");
    const target = join(root, ".mcp.json");
    await link(cred, target);
    const before = await lstat(target);
    const original = await readFile(cred, "utf8");

    const preview = await applyInit(migrateOptions(root, { dryRun: true }));

    expect(preview.wrote[0]?.action).toBe("skipped");
    expect(preview.wrote[0]?.warning).toContain("hard link");
    // The remedy the operator can act on, not merely the diagnosis.
    expect(preview.wrote[0]?.warning).toContain("--force does not help");
    // Nothing the preview says leaks a byte of what the link points at.
    expect(preview.wrote[0]?.warning).not.toContain(CANARY);
    expect(preview.ledgerCount).toBe(0);

    // Sync answers the same tree the same way, in its own vocabulary.
    const [entry] = await planOutputEntries(root, [mcpOutput()], ENGINE_VERSION, undefined, [
      "github",
    ]);
    expect(entry?.action).toBe("collision");
    expect(entry?.collisionKind).toBe("shared-name");

    // A preview reads; it does not publish the twin's bytes.
    const after = await lstat(target);
    expect(after.ino).toBe(before.ino);
    expect(after.nlink).toBe(2);
    await expect(readFile(target, "utf8")).resolves.toBe(original);
    expect(await readManifest(root)).toBeNull();
  });

  it("refuses a symlinked .mcp.json rather than replacing the link with the target's fields", async () => {
    plannerOutputs.value = [mcpOutput()];
    const root = await makeRepo();
    const cred = await plantCredentials("adc-symlink.json");
    const target = join(root, ".mcp.json");
    await symlink(cred, target);
    const original = await readFile(cred, "utf8");

    await expect(applyInit(migrateOptions(root))).rejects.toMatchObject({
      code: "FS_ERROR",
      message: expect.stringContaining("symbolic link"),
    });

    expect((await lstat(target)).isSymbolicLink()).toBe(true);
    await expect(readFile(cred, "utf8")).resolves.toBe(original);
    expect((await lstat(cred)).mode & 0o777).toBe(0o600);
    expect(await readManifest(root)).toBeNull();
  });

  it("merges an ordinary .mcp.json and keeps the mode the operator set", async () => {
    plannerOutputs.value = [mcpOutput()];
    const root = await makeRepo();
    const target = join(root, ".mcp.json");
    await writeFile(
      target,
      `${JSON.stringify({ mcpServers: { mine: { command: "own" } } }, null, 2)}\n`,
      "utf8",
    );
    await chmod(target, 0o600);

    // The no-false-positive half, and the mode-preservation leg for this lane in
    // one case: an operator's own single-named document still merges, their
    // hand-added server survives, and a document they deliberately made private
    // does not come back world-readable.
    const report = await applyInit(migrateOptions(root));

    expect(report.wrote).toEqual([{ path: target, action: "updated" }]);
    const merged = JSON.parse(await readFile(target, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(merged.mcpServers).toSorted()).toEqual(["github", "mine"]);
    expect((await lstat(target)).mode & 0o777).toBe(0o600);
  });
});

describe("applyInit — the client model lists (REQ-LADDER-006)", () => {
  /**
   * A lister answering from a table, recording each client it was asked about.
   * Injected through the option the command leaves at its default: the real
   * lister starts the account's own client CLI, which no test may read.
   */
  function tableLister(answers: Partial<Record<Tool, Awaited<ReturnType<ModelLister>>>>): {
    lister: ModelLister;
    asked: Tool[];
  } {
    const asked: Tool[] = [];
    const lister: ModelLister = async (tool) => {
      asked.push(tool);
      return answers[tool] ?? { kind: "absent" };
    };
    return { lister, asked };
  }

  it("reads the selected non-Claude clients once each and keeps what they listed in the cache", async () => {
    const root = await makeRepo();
    const { lister, asked } = tableLister({
      cursor: { kind: "listed", ids: ["claude-opus-5-5-high", "gpt-5.6-sol-high"], source: "cursor-agent-models" },
      codex: { kind: "timeout" },
    });

    await applyInit(
      optionsFor(root, {
        decisions: decisionsFor(root, { tools: ["claude", "cursor", "codex"], toolsSource: "flag" }),
        env: {},
        listModels: lister,
      }),
    );

    expect(asked.toSorted()).toEqual(["codex", "cursor"]);
    const manifest = await readManifest(root);
    // TEST CHANGE, justified (v17-model-list-cache, REQ-LADDER-009): the list is kept in the git-ignored
    // cache, never in the committed manifest, so the case reads it there and the manifest holds no `listed`.
    expect(JSON.parse(await readFile(join(root, ".stamity", "client-models.json"), "utf8"))).toEqual({
      listed: { cursor: { ids: ["claude-opus-5-5-high", "gpt-5.6-sol-high"], source: "cursor-agent-models" } },
    });
    expect(manifest?.models?.listed).toBeUndefined();
    expect(collectManifestErrors(manifest)).toEqual([]);
  });

  it("starts no lister and writes no list under STAMITY_NO_CLIENT_PROBE=1", async () => {
    const root = await makeRepo();
    const { lister, asked } = tableLister({
      cursor: { kind: "listed", ids: ["claude-opus-5-5-high"], source: "cursor-agent-models" },
    });

    await applyInit(
      optionsFor(root, {
        decisions: decisionsFor(root, { tools: ["cursor"], toolsSource: "flag" }),
        env: { STAMITY_NO_CLIENT_PROBE: "1" },
        listModels: lister,
      }),
    );

    expect(asked).toEqual([]);
    expect((await readManifest(root))?.models).toBeUndefined();
  });

  // build/107: `init --force` over a 1.15.0 manifest resolved its lists from the manifest it composes,
  // so a list the 1.15.0 manifest saved for a client not read this run was dropped, not moved, and
  // `model-pins` read `unverified` until a `sync` read that client. It now moves them as `sync` does.
  describe("over a 1.15.0 manifest that saves its lists, under --force", () => {
    const saved = { codex: { ids: ["gpt-6-sol", "gpt-6-luna"], source: "codex-debug-models" } };
    const cacheFile = join(".stamity", "client-models.json");
    const manifestFile = join(".stamity", "manifest.json");

    /** A setup init wrote, its manifest then given back the `models.listed` a 1.15.0 manifest saved. */
    async function seed115(): Promise<string> {
      const root = await makeRepo();
      const options = { decisions: decisionsFor(root, { tools: ["codex"], toolsSource: "flag" as const }), env: { STAMITY_NO_CLIENT_PROBE: "1" } };
      await applyInit(optionsFor(root, options));
      const manifest = JSON.parse(await readFile(join(root, manifestFile), "utf8")) as Record<string, unknown>;
      await writeFile(join(root, manifestFile), `${JSON.stringify({ ...manifest, models: { listed: saved } }, null, 2)}\n`);
      expect((await readManifest(root))?.models?.listed).toEqual(saved);
      return root;
    }

    it("moves them to the cache, ignore rule first, and writes the manifest without the key, with no client read", async () => {
      const root = await seed115();
      await writeFile(join(root, ".gitignore"), ".env.mcp\n");
      const { lister, asked } = tableLister({});

      const report = await applyInit(
        optionsFor(root, {
          decisions: decisionsFor(root, { tools: ["codex"], toolsSource: "flag" }),
          env: { STAMITY_NO_CLIENT_PROBE: "1" },
          listModels: lister,
          force: true,
          now: LATER_NOW,
        }),
      );

      expect(asked).toEqual([]);
      expect(JSON.parse(await readFile(join(root, cacheFile), "utf8"))).toEqual({ listed: saved });
      expect((await readFile(join(root, ".gitignore"), "utf8")).split("\n")).toContain(".stamity/client-models.json");
      expect(await readFile(join(root, manifestFile), "utf8")).not.toContain('"listed"');
      expect(report.warnings.filter((line) => line.includes("client-models.json"))).toEqual([]);
    });

    it("moves nothing under --dry-run", async () => {
      const root = await seed115();
      const before = await readFile(join(root, manifestFile), "utf8");

      await applyInit(
        optionsFor(root, {
          decisions: decisionsFor(root, { tools: ["codex"], toolsSource: "flag" }),
          env: { STAMITY_NO_CLIENT_PROBE: "1" },
          force: true,
          dryRun: true,
          now: LATER_NOW,
        }),
      );

      expect(await readFile(join(root, manifestFile), "utf8")).toBe(before);
      expect(existsSync(join(root, cacheFile))).toBe(false);
    });
  });

  it("caps a flooded listing and drops every id without a model id's shape", async () => {
    const flood = Array.from({ length: 500 }, (_, index) => `model-${index}`);
    const hostile = ["a\nb", "two words", "", "-leading-dash", "x".repeat(101), 'quote"d', "model-0"];
    const { lister } = tableLister({
      codex: { kind: "listed", ids: [...hostile, ...flood], source: "codex-debug-models" },
      copilot: { kind: "listed", ids: ["bad id", "\u001b[31m"], source: "copilot-help-config" },
    });

    const listed = await readClientModelLists(["codex", "copilot"], {}, "/unused", lister);

    expect(MAX_LISTED_MODELS).toBe(200);
    expect(listed.codex?.ids).toEqual(flood.slice(0, MAX_LISTED_MODELS));
    expect(listed.codex?.source).toBe("codex-debug-models");
    // A listing with no id left is no answer: the client keeps what it saved.
    expect(listed.copilot).toBeUndefined();
  });

  // review/126: run in a workspace member, init keeps the WORKSPACE root out of the lister's
  // reach, as `workspace sync` does: a folder another repository of the workspace can write into
  // supplies no client program. The real lister runs against a stand-in `codex` that leaves a
  // marker when started; the control run before `workspace.json` exists starts it. POSIX only: a
  // Windows PATH would need a `.cmd` shim, which the lister does not start.
  it.skipIf(process.platform === "win32")("never starts a stand-in codex placed inside the workspace but outside the member", async () => {
    const temp = getTemp();
    const marker = temp.path("codex-started");
    await temp.seedFiles({
      "ws/tools/bin/codex": `#!/bin/sh\n: > '${marker}'\nprintf '%s' '{"models":[{"slug":"gpt-6-sol"}]}'\n`,
    });
    await chmod(temp.path("ws", "tools", "bin", "codex"), 0o755);
    const member = temp.path("ws", "apps", "api");
    await mkdir(member, { recursive: true });
    const initIn = (force: boolean) =>
      applyInit(
        optionsFor(member, {
          decisions: decisionsFor(member, { tools: ["codex"], toolsSource: "flag" }),
          env: { PATH: temp.path("ws", "tools", "bin") },
          force,
        }),
      );

    // Control: with no workspace around the member, the folder lies outside its tree and the program starts.
    await initIn(false);
    expect(existsSync(marker)).toBe(true);

    await rm(marker);
    await temp.seedFiles({
      "ws/workspace.json": `${JSON.stringify({ version: "1.0.0", defaults: { tools: ["codex"] }, repos: [{ path: "apps/api" }] })}\n`,
    });

    await initIn(true);

    expect(existsSync(marker)).toBe(false);
  });

  it("answers nothing for a client that times out, cannot be read or is absent", async () => {
    const { lister } = tableLister({
      cursor: { kind: "timeout" },
      codex: { kind: "unreadable", message: "`codex debug models` exited with status 1" },
    });

    expect(await readClientModelLists(["cursor", "codex", "copilot"], {}, "/unused", lister)).toEqual({});
  });
});
