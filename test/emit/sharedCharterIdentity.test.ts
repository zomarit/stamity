import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CODEX_AGENTS_OVERRIDE_FILE } from "../../src/adapters/codex.ts";
import { applySync, planSync, type SyncPlan } from "../../src/cli/commands/sync/engine.ts";
import { AGENTS_MD_FILE } from "../../src/emit/agentsMd.ts";
import { readManifest, writeManifest } from "../../src/manifest/manifest.ts";
import { wrapInManagedBlock } from "../../src/merge/managedBlocks.ts";
import type { Tool } from "../../src/types/core.ts";
import {
  GOLDEN_ENGINE_VERSION,
  GOLDEN_NOW,
  GOLDEN_NPM_CHANNEL,
  GOLDEN_PACKAGE_NAME,
  GOLDEN_SEED_FILES,
  goldenGitRunner,
  makeGoldenRepo,
  readEmittedTree,
  type GoldenRepo,
} from "./goldenFixture.ts";

/**
 * The shared root `AGENTS.md` is the same file with and without Codex
 * (REQ-PROVE-005), and Codex's rules appendix lives in a Codex-only root
 * `AGENTS.override.md` (REQ-PROVE-003).
 *
 * The location is a measurement, not a reading of a vendor page: in a fixture
 * holding both files, codex-cli 0.155.1 quoted a marker placed only in the
 * override, and Claude Code 2.1.285, cursor-agent 2026.09.28 and Copilot CLI
 * 1.0.89 each answered that they saw none (live check of run
 * 2026-09-30_optimization-sweep). A second Codex run with a different marker in
 * each file quoted only the override's, so Codex reads the override INSTEAD of
 * `AGENTS.md` — which is why the override repeats the whole shared file, the
 * operator's own text included, ahead of the appendix.
 *
 * Every case runs the real init and sync pipelines into a temp directory; the
 * git seam is the one stub (`goldenGitRunner`, justified in the fixture: it
 * keeps the working-tree probe off child processes and off this checkout).
 */

/** Each case pays for one or two whole-repository emissions; the sync proof's own measured budget. */
const CASE_TIMEOUT_MS = 60_000;
vi.setConfig({ testTimeout: CASE_TIMEOUT_MS, hookTimeout: CASE_TIMEOUT_MS });

/** Heading the codex appendix opens with, in the override and nowhere else. */
const APPENDIX_HEADING = "## Conditional rules (Codex down-conversion)";

/** A line only an operator would write, so its presence in the override is traceable to them. */
const OPERATOR_TEXT = "## Team notes\n\nOperator line QX-4471: deploys go through the release train.\n";

async function withRepo<T>(tools: readonly Tool[], body: (repo: GoldenRepo) => Promise<T>, seed?: Readonly<Record<string, string>>): Promise<T> {
  const repo = await makeGoldenRepo({ tools, ...(seed === undefined ? {} : { seed }) });
  try {
    return await body(repo);
  } finally {
    await repo.cleanup();
  }
}

function plan(repo: GoldenRepo): Promise<SyncPlan> {
  return planSync(repo.rootDir, GOLDEN_ENGINE_VERSION, {
    runner: goldenGitRunner,
    packageName: GOLDEN_PACKAGE_NAME,
    npmChannel: GOLDEN_NPM_CHANNEL,
  });
}

function apply(repo: GoldenRepo, syncPlan: SyncPlan, force = false): ReturnType<typeof applySync> {
  return applySync(repo.rootDir, syncPlan, {
    engineVersion: GOLDEN_ENGINE_VERSION,
    force,
    dryRun: false,
    now: GOLDEN_NOW,
  });
}

/** The disposition sync would give one path — the drift `check` reports is this plan. */
function actionOf(syncPlan: SyncPlan, path: string): string | undefined {
  return syncPlan.entries.find((entry) => entry.path === path)?.action;
}

/** Record an import decision for the root charter, as init does for a pre-existing `AGENTS.md`. */
async function decideCharter(repo: GoldenRepo, mode: "supplement" | "skip"): Promise<void> {
  const manifest = await readManifest(repo.rootDir);
  if (manifest === null) throw new Error("fixture lost its manifest");
  await writeManifest(
    repo.rootDir,
    { ...manifest, importChoice: [{ path: AGENTS_MD_FILE, mode }] },
    { now: GOLDEN_NOW },
  );
}

/** The text with every marker line and surrounding blank space normalised away, for containment checks. */
function withoutMarkers(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.startsWith("<!-- STAMITY:"))
    .join("\n")
    .trim();
}

describe("the shared root AGENTS.md does not depend on Codex being selected", () => {
  it("emits AGENTS.md byte-identical for [claude, codex] and [claude]", async () => {
    const withCodex = await withRepo(["claude", "codex"], async (repo) => readEmittedTree(repo.rootDir));
    const withoutCodex = await withRepo(["claude"], async (repo) => readEmittedTree(repo.rootDir));

    const shared = withCodex[AGENTS_MD_FILE];
    expect(shared).toBeDefined();
    expect(shared).toBe(withoutCodex[AGENTS_MD_FILE]);
    expect(shared).not.toContain(APPENDIX_HEADING);

    // Non-degenerate: the appendix exists, it simply lives in the Codex-only file.
    const override = withCodex[CODEX_AGENTS_OVERRIDE_FILE] ?? "";
    expect(override).toContain(APPENDIX_HEADING);
    expect(override.startsWith((shared ?? "").trimEnd())).toBe(true);
    expect(withoutCodex[CODEX_AGENTS_OVERRIDE_FILE]).toBeUndefined();
  });

  it("puts the appendix in the same one file for a Codex-only repository", async () => {
    await withRepo(["codex"], async (repo) => {
      const tree = await readEmittedTree(repo.rootDir);
      expect(tree[AGENTS_MD_FILE]).not.toContain(APPENDIX_HEADING);
      expect(tree[CODEX_AGENTS_OVERRIDE_FILE]).toContain(APPENDIX_HEADING);
      const owners = repo.manifest.ledger
        .filter((row) => row.path === CODEX_AGENTS_OVERRIDE_FILE)
        .map((row) => `${row.adapter}:${row.artifactType}`);
      expect(owners).toEqual(["codex:infra"]);
    });
  });
});

describe("deselecting codex", () => {
  it("reclaims the override and leaves the shared AGENTS.md byte-intact", async () => {
    await withRepo(["claude", "codex"], async (repo) => {
      const before = await readEmittedTree(repo.rootDir);
      expect(before[CODEX_AGENTS_OVERRIDE_FILE]).toContain(APPENDIX_HEADING);

      const manifest = await readManifest(repo.rootDir);
      if (manifest === null) throw new Error("fixture lost its manifest");
      await writeManifest(repo.rootDir, { ...manifest, tools: ["claude"] }, { now: GOLDEN_NOW });
      const report = await apply(repo, await plan(repo));

      const after = await readEmittedTree(repo.rootDir);
      // A stale override would keep Codex reading the old charter and appendix after the
      // operator removed it, so the sweep taking it is the behaviour, not a tidy-up.
      expect(after[CODEX_AGENTS_OVERRIDE_FILE]).toBeUndefined();
      expect(after[AGENTS_MD_FILE]).toBe(before[AGENTS_MD_FILE]);
      expect(report.manifest?.ledger.some((row) => row.path === CODEX_AGENTS_OVERRIDE_FILE)).toBe(false);
    });
  });
});

describe("the override follows the AGENTS.md bytes sync writes", () => {
  it("carries the operator's own text from a supplemented AGENTS.md, and check sees an edit to it", async () => {
    await withRepo(["claude", "codex"], async (repo) => {
      // The supplement posture: the engine's block on top, the operator's text below it.
      const charterPath = join(repo.rootDir, AGENTS_MD_FILE);
      const emitted = await readFile(charterPath, "utf8");
      await writeFile(charterPath, `${wrapInManagedBlock(emitted, AGENTS_MD_FILE, GOLDEN_ENGINE_VERSION)}\n${OPERATOR_TEXT}`, "utf8");
      await decideCharter(repo, "supplement");

      const first = await plan(repo);
      expect(actionOf(first, CODEX_AGENTS_OVERRIDE_FILE)).toBe("update");
      await apply(repo, first);

      const charter = await readFile(charterPath, "utf8");
      const override = await readFile(join(repo.rootDir, CODEX_AGENTS_OVERRIDE_FILE), "utf8");
      expect(charter).toContain("Operator line QX-4471");
      expect(override).toContain("Operator line QX-4471");
      // The override is the shared file as written, markers aside, then the appendix.
      expect(override.startsWith(withoutMarkers(charter))).toBe(true);
      expect(override.indexOf("Operator line QX-4471")).toBeLessThan(override.indexOf(APPENDIX_HEADING));
      // Engine-owned and marker-less: an edit to it is drift, never a merge.
      expect(override).not.toContain("STAMITY:BEGIN");

      // Converged: a second plan moves nothing.
      const settled = await plan(repo);
      expect(actionOf(settled, CODEX_AGENTS_OVERRIDE_FILE)).toBe("unchanged");
      expect(actionOf(settled, AGENTS_MD_FILE)).toBe("unchanged");

      // The operator edits their text after the sync: AGENTS.md itself is still clean (the
      // edit is outside the block), and the override is what drifts.
      await writeFile(charterPath, charter.replace("QX-4471", "QX-9902"), "utf8");
      const drifted = await plan(repo);
      expect(actionOf(drifted, AGENTS_MD_FILE)).toBe("unchanged");
      expect(actionOf(drifted, CODEX_AGENTS_OVERRIDE_FILE)).toBe("update");

      await apply(repo, drifted);
      const refreshed = await readFile(join(repo.rootDir, CODEX_AGENTS_OVERRIDE_FILE), "utf8");
      expect(refreshed).toContain("QX-9902");
      expect(refreshed).not.toContain("QX-4471");
    });
  });

  it("reclaims the appendix from an existing install's AGENTS.md block on the first sync", async () => {
    await withRepo(["claude", "codex"], async (repo) => {
      // An install from before the move: the block held charter plus appendix.
      const charterPath = join(repo.rootDir, AGENTS_MD_FILE);
      const override = await readFile(join(repo.rootDir, CODEX_AGENTS_OVERRIDE_FILE), "utf8");
      await writeFile(charterPath, `${wrapInManagedBlock(override, AGENTS_MD_FILE, GOLDEN_ENGINE_VERSION)}\n${OPERATOR_TEXT}`, "utf8");
      await decideCharter(repo, "supplement");

      await apply(repo, await plan(repo));

      const charter = await readFile(charterPath, "utf8");
      expect(charter).not.toContain(APPENDIX_HEADING);
      expect(charter).toContain("Operator line QX-4471");
      const rewritten = await readFile(join(repo.rootDir, CODEX_AGENTS_OVERRIDE_FILE), "utf8");
      expect(rewritten.split(APPENDIX_HEADING)).toHaveLength(2);
    });
  });

  it("repeats an operator's skipped AGENTS.md verbatim ahead of the appendix", async () => {
    await withRepo(["claude", "codex"], async (repo) => {
      const charterPath = join(repo.rootDir, AGENTS_MD_FILE);
      await writeFile(charterPath, OPERATOR_TEXT, "utf8");
      await decideCharter(repo, "skip");

      await apply(repo, await plan(repo));

      expect(await readFile(charterPath, "utf8")).toBe(OPERATOR_TEXT);
      const override = await readFile(join(repo.rootDir, CODEX_AGENTS_OVERRIDE_FILE), "utf8");
      expect(override.startsWith(OPERATOR_TEXT.trimEnd())).toBe(true);
      expect(override).toContain(APPENDIX_HEADING);
    });
  });
});

describe("an operator's own root AGENTS.override.md", () => {
  const OPERATOR_OVERRIDE = "# My own Codex override\n\nKeep this.\n";

  it("is refused without --force and backed up with it", async () => {
    await withRepo(
      ["codex"],
      async (repo) => {
        const target = join(repo.rootDir, CODEX_AGENTS_OVERRIDE_FILE);
        // Init keeps the writer's skip: the file is not the engine's to claim.
        expect(await readFile(target, "utf8")).toBe(OPERATOR_OVERRIDE);
        expect(repo.manifest.ledger.some((row) => row.path === CODEX_AGENTS_OVERRIDE_FILE)).toBe(false);

        const refused = await plan(repo);
        expect(refused.collisions).toEqual([CODEX_AGENTS_OVERRIDE_FILE]);
        const kept = await apply(repo, refused);
        expect(kept.refused).toEqual([CODEX_AGENTS_OVERRIDE_FILE]);
        expect(await readFile(target, "utf8")).toBe(OPERATOR_OVERRIDE);

        await apply(repo, await plan(repo), true);
        expect(await readFile(target, "utf8")).toContain(APPENDIX_HEADING);
        const backups = (await readdir(repo.rootDir)).filter(
          (name) => name.startsWith(`${CODEX_AGENTS_OVERRIDE_FILE}.`) && name.endsWith(".bak"),
        );
        expect(backups).toHaveLength(1);
        expect(await readFile(join(repo.rootDir, backups[0] ?? ""), "utf8")).toBe(OPERATOR_OVERRIDE);
      },
      { ...GOLDEN_SEED_FILES, [CODEX_AGENTS_OVERRIDE_FILE]: OPERATOR_OVERRIDE },
    );
  });
});
