import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLAUDE_MD_PATH } from "../../src/adapters/claude.ts";
import { CODEX_CONFIG_FILE, CODEX_HOOKS_FILE } from "../../src/adapters/codex.ts";
import { COPILOT_SETUP_STEPS_PATH } from "../../src/adapters/copilot.ts";
import {
  CURSOR_HOOKS_CONFIG_PATH,
  MCP_GUARD_PATH,
  SUBAGENT_GUARD_PATH,
} from "../../src/adapters/cursor.ts";
import { applySync, planSync, type SyncPlan } from "../../src/cli/commands/sync/engine.ts";
import { renderSyncReport, syncJsonPayload } from "../../src/cli/commands/sync/report.ts";
import { makePalette } from "../../src/cli/kit/terminal.ts";
import { AGENTS_MD_FILE } from "../../src/emit/agentsMd.ts";
import { AGENT_TOOL_POLICIES_PATH, HOOKS_GENERATED_DIR } from "../../src/emit/hooksInfra.ts";
import { SKILLS_PROJECTION_DIR } from "../../src/emit/skillsProjection.ts";
import { readManifest, writeManifest } from "../../src/manifest/manifest.ts";
import { TOOLS, type Tool } from "../../src/types/core.ts";
import { MANIFEST_FILE } from "../../src/types/manifest.ts";
import { STATE_DIR } from "../../src/types/markers.ts";
import {
  GOLDEN_ENGINE_VERSION,
  GOLDEN_NOW,
  GOLDEN_SEED_FILES,
  goldenGitRunner,
  makeGoldenRepo,
  readEmittedTree,
  type GoldenRepo,
} from "./goldenFixture.ts";

/**
 * The sync-loop proof, end to end on the golden fixture: init writes, sync
 * re-plans, drift is detected, deselection reclaims — through the shipped
 * `planSync`/`applySync` with nothing mocked but the git seam (a stubbed runner
 * keeps the working-tree probe off child processes and off the developer's own
 * repository state).
 *
 * Each test owns a fresh fixture. These cases mutate the repo — a shared one
 * would make the suite order-dependent, and an order-dependent regression net
 * is one that passes for the wrong reason.
 *
 * The reclaim expectations encode the sweep's SAFETY gate as it actually is
 * (`src/merge/reclaim.ts`), not as a naive reading of "deselect deletes": a
 * candidate is deleted only when its name proves engine authorship (the
 * `stamity-` prefix, or `SKILL.md` inside a prefixed directory) or a recorded
 * hash still matches its bytes somewhere a hash is admissible — the state
 * directory, or the caller's trusted-infra allowlist. Platform-named files the
 * engine writes whole (`.codex/config.toml`, a package's `AGENTS.md`) are on
 * that allowlist, so untouched ones ARE reclaimed and an operator-EDITED one is
 * kept and disclosed as salvage. That asymmetry — provable authorship deletes,
 * drifted bytes survive — is the guarantee, so the tests assert both halves.
 */

/** Tools the proof runs with; codex is the one deselected mid-flight. */
const ALL_TOOLS: readonly Tool[] = TOOLS;
const DESELECTED: Tool = "codex";
const SURVIVING_TOOLS: readonly Tool[] = TOOLS.filter((tool) => tool !== DESELECTED);

/** Heading the codex adapter appends to the shared charter through the replacement contract. */
const CODEX_APPENDIX_HEADING = "## Conditional rules (Codex down-conversion)";

/** Repo-relative manifest path — the one file an idempotent apply is allowed to move. */
const MANIFEST_PATH = `${STATE_DIR}/${MANIFEST_FILE}`;

/** Colour-free palette, so report assertions match on text rather than escapes. */
const plainPalette = makePalette(false);

/** A tree with the manifest dropped, for before/after byte comparisons. */
function withoutManifest(tree: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(tree).filter(([path]) => path !== MANIFEST_PATH));
}

let repo: GoldenRepo;

beforeEach(async () => {
  repo = await makeGoldenRepo({ tools: ALL_TOOLS });
});

afterEach(async () => {
  await repo.cleanup();
});

/** `planSync` at the fixture's pinned engine version, with the git seam stubbed. */
function plan(version: string = GOLDEN_ENGINE_VERSION): Promise<SyncPlan> {
  return planSync(repo.rootDir, version, { runner: goldenGitRunner });
}

/** `applySync` for a plan, at the same pinned version and clock. */
function apply(syncPlan: SyncPlan): ReturnType<typeof applySync> {
  return applySync(repo.rootDir, syncPlan, {
    engineVersion: GOLDEN_ENGINE_VERSION,
    force: false,
    dryRun: false,
    now: GOLDEN_NOW,
  });
}

/** Entries whose disposition is anything but `unchanged`, as `action:path` labels. */
function moved(syncPlan: SyncPlan): string[] {
  return syncPlan.entries
    .filter((entry) => entry.action !== "unchanged")
    .map((entry) => `${entry.action}:${entry.path}`);
}

/** Rewrites the manifest's tool list on disk — the user editing their selection. */
async function selectTools(tools: readonly Tool[]): Promise<void> {
  const manifest = await readManifest(repo.rootDir);
  if (manifest === null) throw new Error("fixture lost its manifest");
  await writeManifest(repo.rootDir, { ...manifest, tools: [...tools] }, { now: GOLDEN_NOW });
}

describe("sync idempotency", () => {
  it("re-plans an untouched init as all-unchanged with nothing to reclaim", async () => {
    const first = await plan();

    expect(moved(first)).toEqual([]);
    expect(first.entries.length).toBeGreaterThan(0);
    expect(first.collisions).toEqual([]);
    expect(first.reclaim).toEqual([]);
  });

  it("leaves every emitted byte in place when that plan is applied", async () => {
    const before = await readEmittedTree(repo.rootDir);

    const report = await apply(await plan());

    expect(report.created).toBe(0);
    expect(report.updated).toBe(0);
    expect(report.skipped).toBe(0);
    expect(report.unchanged).toBe(report.wrote.length);

    // The manifest is the one legitimate mover: apply records a content hash
    // per emitted path that init (which writes before it can hash) left absent.
    const after = await readEmittedTree(repo.rootDir);
    expect(withoutManifest(after)).toEqual(withoutManifest(before));
  });

  it("does not detect its own emitted copilot workflow as a CI provider", async () => {
    // The shared seed always ships `.github/workflows/ci.yml`, which is exactly
    // why the byte-exact net never saw this posture: with NO real CI, the
    // copilot adapter's `copilot-setup-steps.yml` was the only workflow file,
    // and directory-existence CI detection read the engine's own output back as
    // a repo fact — flipping the charter's CI line on the second run.
    const noCi = await makeGoldenRepo({
      tools: ALL_TOOLS,
      seed: Object.fromEntries(
        Object.entries(GOLDEN_SEED_FILES).filter(([path]) => path !== ".github/workflows/ci.yml"),
      ),
    });
    try {
      expect(noCi.manifest.detected?.ciProviders).toEqual([]);
      expect(
        Object.keys(await readEmittedTree(noCi.rootDir)).some((path) =>
          path.startsWith(".github/workflows/"),
        ),
      ).toBe(true);

      const before = await readEmittedTree(noCi.rootDir);
      const replan = await planSync(noCi.rootDir, GOLDEN_ENGINE_VERSION, {
        runner: goldenGitRunner,
      });
      expect(
        replan.entries.filter((entry) => entry.action !== "unchanged").map((entry) => entry.path),
      ).toEqual([]);

      await applySync(noCi.rootDir, replan, {
        engineVersion: GOLDEN_ENGINE_VERSION,
        force: false,
        dryRun: false,
        now: GOLDEN_NOW,
      });
      const after = await readEmittedTree(noCi.rootDir);
      expect(withoutManifest(after)).toEqual(withoutManifest(before));
    } finally {
      await noCi.cleanup();
    }
  });
});

describe("drift detection", () => {
  it("flips exactly the mutated managed file to `update` and restores to clean", async () => {
    const target = join(repo.rootDir, CLAUDE_MD_PATH);
    const original = await readFile(target, "utf8");
    const blockStart = original.indexOf("\n") + 1;
    expect(original.slice(0, blockStart)).toContain("STAMITY:BEGIN");

    await writeFile(
      target,
      `${original.slice(0, blockStart)}DRIFTED LINE INSIDE THE MANAGED BLOCK\n${original.slice(blockStart)}`,
      "utf8",
    );

    const drifted = await plan();
    expect(moved(drifted)).toEqual([`update:${CLAUDE_MD_PATH}`]);
    expect(drifted.collisions).toEqual([]);

    await writeFile(target, original, "utf8");
    expect(moved(await plan())).toEqual([]);
  });

  it("never queues a user file the engine does not emit", async () => {
    await writeFile(join(repo.rootDir, "src", "index.ts"), "export const fixture = false;\n", "utf8");
    await writeFile(join(repo.rootDir, "NOTES.md"), "Hand-written, engine-owned by nobody.\n", "utf8");

    const planned = await plan();

    expect(planned.entries.map((entry) => entry.path)).not.toContain("src/index.ts");
    expect(planned.entries.map((entry) => entry.path)).not.toContain("NOTES.md");
    expect(moved(planned)).toEqual([]);
    expect(planned.reclaim).toEqual([]);
  });

  it("treats an engine-version bump as an update, never a collision", async () => {
    const bumped = await plan("1.1.0-golden");

    expect(bumped.collisions).toEqual([]);
    expect(moved(bumped).length).toBeGreaterThan(0);
    for (const entry of bumped.entries) {
      expect(entry.action === "unchanged" || entry.action === "update").toBe(true);
    }
  });

  it("queues a deleted workspace package's nested charter for reclaim", async () => {
    await rm(join(repo.rootDir, "packages", "beta"), { recursive: true, force: true });

    const planned = await plan();

    expect(planned.reclaim.map((candidate) => candidate.entry.path)).toEqual([
      `packages/beta/${AGENTS_MD_FILE}`,
    ]);
  });
});

describe("deselection reclaim", () => {
  it("queues the deselected tool's paths and no co-owned survivor", async () => {
    await selectTools(SURVIVING_TOOLS);

    const planned = await plan();
    const queued = planned.reclaim.map((candidate) => candidate.entry.path);

    expect(queued.length).toBeGreaterThan(0);
    for (const candidate of planned.reclaim) {
      expect(candidate.entry.adapter).toBe(DESELECTED);
      expect(candidate.reason).toBe("adapter-removed");
    }
    expect(queued).toContain(CODEX_CONFIG_FILE);
    expect(queued).toContain(CODEX_HOOKS_FILE);
    expect(queued).toContain(`packages/alpha/${AGENTS_MD_FILE}`);
    expect(queued.some((path) => path.startsWith(`${HOOKS_GENERATED_DIR}/${DESELECTED}/`))).toBe(true);

    // The multi-owner ledger seam: a path the other three still emit is not a
    // candidate at all, however many rows the deselected tool held on it.
    //
    // TEST CHANGE, justified: a maintainer ruling deleted the Agent-Plugins
    // container, so its path leaves this survivor list. The seam it helped
    // prove is unchanged and still proved by the two co-owned paths that
    // remain plus the whole skills projection asserted just below.
    for (const survivor of [AGENTS_MD_FILE, AGENT_TOOL_POLICIES_PATH]) {
      expect(queued).not.toContain(survivor);
    }
    expect(queued.filter((path) => path.startsWith(`${SKILLS_PROJECTION_DIR}/`))).toEqual([]);
  });

  it("sweeps the deselected tool's files and leaves the shared set byte-intact", async () => {
    // A sync first, so the ledger carries the content hashes the sweep's
    // state-directory gate needs; init records identity without them.
    await apply(await plan());
    const before = await readEmittedTree(repo.rootDir);

    await selectTools(SURVIVING_TOOLS);
    const planned = await plan();
    const report = await apply(planned);
    const after = await readEmittedTree(repo.rootDir);

    const removed = Object.keys(before).filter((path) => !(path in after));
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.some((path) => path.startsWith(`${HOOKS_GENERATED_DIR}/${DESELECTED}/`))).toBe(true);

    // Deleted where authorship is provable: an engine-minted name, or a
    // recorded hash somewhere a hash is admissible — the state directory, or
    // the caller's trusted-infra allowlist. Sync now passes that allowlist
    // (`trustedInfraPaths`, the same set `clean` passes), so the deselected
    // client's block-less platform-named files are reclaimed instead of
    // stranded.
    //
    // TEST CHANGE, justified: this assertion previously pinned CODEX_CONFIG_FILE,
    // CODEX_HOOKS_FILE and the two nested charters as `skipped-unsafe-path`. That
    // was the defect it had frozen, not a guarantee — the same run dropped their
    // ledger rows, so the files survived permanently unowned, no later sync or
    // clean could reach them, and re-adding the tool hard-failed on an
    // INTEGRITY_ERROR collision with the engine's own leftovers. The safety
    // property the old assertion protected is untouched and pinned by the next
    // test: an EDITED infra file still fails the hash gate and is kept.
    expect((report.reclaimed?.entries ?? []).map((entry) => entry.action)).toEqual(
      (report.reclaimed?.entries ?? []).map(() => "deleted"),
    );
    for (const path of [
      CODEX_CONFIG_FILE,
      CODEX_HOOKS_FILE,
      `packages/alpha/${AGENTS_MD_FILE}`,
      `packages/beta/${AGENTS_MD_FILE}`,
    ]) {
      expect(removed).toContain(path);
    }

    // Survivors: every co-owned path still on disk, byte-identical — except the
    // shared charter, which legitimately loses the deselected client's appendix
    // (the shared-path replacement contract stops applying) while keeping its
    // remaining owners.
    for (const path of Object.keys(before).filter((key) => key.startsWith(`${SKILLS_PROJECTION_DIR}/`))) {
      expect(after[path]).toBe(before[path]);
    }
    // TEST CHANGE, justified: a maintainer ruling deleted the Agent-Plugins
    // container, so this line can no longer assert that path survived the
    // sweep byte-intact. Inverted rather than dropped — the engine now plans
    // nothing under `.agents/plugins/` on either side of the sweep, which is
    // the ruling's actual claim — while the guarantee the line carried
    // ("a co-owned infra path survives a deselection byte-identically") stays
    // pinned by the policy document below and the skills projection above.
    for (const tree of [before, after]) {
      expect(Object.keys(tree).filter((path) => path.startsWith(".agents/plugins/"))).toEqual([]);
    }
    expect(after[AGENT_TOOL_POLICIES_PATH]).toBe(before[AGENT_TOOL_POLICIES_PATH]);

    expect(before[AGENTS_MD_FILE]).toContain(CODEX_APPENDIX_HEADING);
    expect(after[AGENTS_MD_FILE]).toBeDefined();
    expect(after[AGENTS_MD_FILE]).not.toContain(CODEX_APPENDIX_HEADING);

    const owners = (report.manifest?.ledger ?? [])
      .filter((row) => row.path === AGENTS_MD_FILE)
      .map((row) => row.adapter)
      .toSorted();
    expect(owners).toEqual([...SURVIVING_TOOLS].toSorted());
    expect(report.manifest?.ledger.some((row) => row.adapter === DESELECTED)).toBe(false);
  });

  it("reclaims every removed client's platform-named infra on the tool-removal flow", async () => {
    // The advertised flow end to end (`stamity config set tools claude`, then
    // `sync`): three clients leave at once. Their block-less platform-named
    // files carry no engine-minted name, so without the trusted-infra allowlist
    // each one was refused while the same run dropped its rows — live cursor
    // hooks and a live codex config, on disk and unowned forever.
    await apply(await plan());
    const before = await readEmittedTree(repo.rootDir);

    await selectTools(["claude"]);
    const report = await apply(await plan());
    const after = await readEmittedTree(repo.rootDir);

    for (const path of [
      CODEX_CONFIG_FILE,
      CODEX_HOOKS_FILE,
      CURSOR_HOOKS_CONFIG_PATH,
      MCP_GUARD_PATH,
      SUBAGENT_GUARD_PATH,
      COPILOT_SETUP_STEPS_PATH,
    ]) {
      expect(before[path]).toBeDefined();
      expect(after[path]).toBeUndefined();
    }
    expect(
      (report.reclaimed?.entries ?? []).filter((entry) => entry.action === "skipped-unsafe-path"),
    ).toEqual([]);

    // The downstream failure the leftovers caused: re-adding a client collided
    // with the engine's own orphans and refused with INTEGRITY_ERROR, advising
    // a --force that fought its own output. With the paths reclaimed, the
    // re-add is a clean set of creates.
    await selectTools(ALL_TOOLS);
    const readd = await plan();
    expect(readd.collisions).toEqual([]);
    expect(readd.entries.filter((entry) => entry.path === COPILOT_SETUP_STEPS_PATH)).toEqual([
      expect.objectContaining({ action: "create" }),
    ]);
  });

  it("keeps an edited infra file and discloses it as salvage", async () => {
    // The allowlist exempts a path from the ownership-marker gate ONLY. Bytes
    // that no longer hash to what the engine recorded are the user's, so the
    // sweep keeps them — and because their rows are dropped anyway, the report
    // has to say so or the file is silently orphaned.
    await apply(await plan());
    const edited = join(repo.rootDir, CODEX_CONFIG_FILE);
    const original = await readFile(edited, "utf8");
    await writeFile(edited, `${original}\n# hand-edited by the operator\n`, "utf8");

    await selectTools(SURVIVING_TOOLS);
    const report = await apply(await plan());

    const kept = (report.reclaimed?.entries ?? []).filter((entry) => entry.action !== "deleted");
    expect(kept.map((entry) => entry.path)).toEqual([CODEX_CONFIG_FILE]);
    await expect(readFile(edited, "utf8")).resolves.toContain("hand-edited by the operator");

    const rendered = renderSyncReport(await plan(), report, plainPalette);
    expect(rendered).toContain("their ledger rows are dropped");
    expect(rendered).toContain(CODEX_CONFIG_FILE);
    expect(syncJsonPayload(await plan(), report).counts).toMatchObject({ reclaimSalvaged: 1 });
  });
});
