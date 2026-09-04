import { createHash } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyInit, type InitApplyOptions } from "../../../src/cli/commands/init/apply.ts";
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
import { collectManifestErrors, readManifest } from "../../../src/manifest/manifest.ts";
import { wrapInManagedBlock } from "../../../src/merge/managedBlocks.ts";
import type { AdapterOutput } from "../../../src/types/content.ts";
import type { PredecessorDefaults } from "../../../src/migration/carry.ts";
import type { RepoInfo } from "../../../src/types/detect.ts";
import { EngineError } from "../../../src/types/errors.ts";
import { useTempDir } from "../../support/tempDir.ts";

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
  it("scaffolds state dirs, writes a valid manifest, and gitignores .env.mcp", async () => {
    // A plain temp directory is also the non-git edge case: no repository,
    // no platform, and apply must still succeed.
    const root = await makeRepo();
    const report = await applyInit(optionsFor(root));

    expect(report).toEqual({
      manifestPath: join(root, ".stamity", "manifest.json"),
      createdDirs: [...STATE_DIRS],
      wrote: [],
      warnings: [],
      ledgerCount: 0,
      gitignoreEnsured: true,
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
    expect(manifest?.ledger).toEqual([]);

    expect(await readFile(join(root, ".gitignore"), "utf8")).toContain(".env.mcp");
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

  it("records a platform when the decisions carry one", async () => {
    const root = await makeRepo();
    await applyInit(
      optionsFor(root, { decisions: decisionsFor(root, { platform: "github" }) }),
    );

    expect((await readManifest(root))?.platform).toBe("github");
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

describe("applyInit — planned emission (planner seam)", () => {
  /** A managed-block output stamped with the test engine version. */
  function managedOutput(path: string, body: string): AdapterOutput {
    return {
      path,
      content: wrapInManagedBlock(body, path, ENGINE_VERSION),
      owner: { adapter: "claude", artifactId: "guide", artifactType: "rule" },
    };
  }

  it("writes planner outputs through the merge engine and stands behind them in the ledger", async () => {
    plannerOutputs.value = [managedOutput("docs/stamity-guide.md", "Guide body.\n")];
    const root = await makeRepo();

    const report = await applyInit(optionsFor(root));

    expect(report.wrote).toEqual([
      { path: join(root, "docs", "stamity-guide.md"), action: "created" },
    ]);
    expect(report.ledgerCount).toBe(1);

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
        path: "docs/stamity-guide.md",
        adapter: "claude",
        artifactId: "guide",
        artifactType: "rule",
        contentHash: createHash("sha256")
          .update(wrapInManagedBlock("Guide body.\n", "docs/stamity-guide.md", ENGINE_VERSION))
          .digest("hex"),
        stampedVersion: ENGINE_VERSION,
      },
    ]);
    // The persisted document, ledger included, passes the full validator.
    const raw: unknown = JSON.parse(await readFile(report.manifestPath, "utf8"));
    expect(collectManifestErrors(raw)).toEqual([]);
  });

  it("merges a colliding unmanaged file with a warning instead of silently losing it", async () => {
    // The brief's collision edge case: a planned path already exists as a
    // marker-less user file. Under init's write options the merge engine
    // prepends the managed block and preserves every user byte below it —
    // surfaced as a warning-bearing `wrote[]` row, never silent loss.
    plannerOutputs.value = [managedOutput("AGENTS.md", "Managed body.\n")];
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
    expect(report.ledgerCount).toBe(1);
    expect((await readManifest(root))?.ledger.map((entry) => entry.path)).toEqual(["AGENTS.md"]);
  });

  it("predicts the same collision disposition under dryRun while touching nothing", async () => {
    plannerOutputs.value = [managedOutput("AGENTS.md", "Managed body.\n")];
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
    expect(report.ledgerCount).toBe(1);
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
