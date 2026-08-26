import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanCommand } from "../../../src/cli/commands/clean.ts";
import { applyInit } from "../../../src/cli/commands/init/apply.ts";
import type { InitDecisions } from "../../../src/cli/commands/init/plan.ts";
import { applySync, planSync, type SyncPlan } from "../../../src/cli/commands/sync/engine.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../../src/content/contentRoot.ts";
import { createManifest, readManifest, writeManifest } from "../../../src/manifest/manifest.ts";
import { applyPackInstall, planPackInstall } from "../../../src/pack/install.ts";
import { discoverInstalledPacks, packMcpServers } from "../../../src/pack/projection.ts";
import type { ContentSelection } from "../../../src/types/content.ts";
import type { Tool } from "../../../src/types/core.ts";
import type { RepoInfo } from "../../../src/types/detect.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * Ownership of a PACK-SUPPLIED MCP server, asserted at the LANE — `planSync` /
 * `applySync` / `applyInit` over a real temp repo with a real installed pack —
 * rather than at the library function the lane calls.
 *
 * Why a suite of its own. `mcp/emit.ts::engineOwnedServerIds` takes pack supply
 * as a tail argument, and every existing test that proves the argument works
 * supplies it FROM THE TEST (`test/manifest/mcpFilter.test.ts`,
 * `test/mcp/emit.test.ts`). Those cases proved the library while all three
 * production callers passed three arguments, so the shipped behaviour was the
 * opposite of the tested one: a pack-supplied entry the engine itself wrote was
 * judged an unowned USER row, `manifest/mcpFilter.ts` preserved it verbatim, and
 * a deselected third-party server never left `.mcp.json`, `.cursor/mcp.json` or
 * `.vscode/mcp.json` — it kept launching with whatever `.env.mcp` holds. Because
 * the PLAN lane made the same call, `sync --dry-run` and `check` both reported
 * `unchanged` over that live revocation failure.
 *
 * So every assertion here drives a shipped entry point and reads bytes back off
 * disk. Nothing in this file passes an ownership set to the merge layer; the
 * lane computes its own, which is the only thing that was ever in doubt.
 *
 * Both halves are asserted on purpose: the plan lane PREDICTING the removal and
 * the apply lane PERFORMING it. A fix that removed the entry without predicting
 * it would leave `check` reporting a clean tree over a pending revocation, which
 * is the same operator-facing silence in a different place.
 */

const ENGINE_VERSION = "1.0.0-mcp-ownership";
const T0 = new Date("2026-08-17T00:00:00.000Z");
const T1 = new Date("2026-08-17T01:00:00.000Z");

/** Tools chosen for coverage of all three MERGED MCP documents, one each. */
const TOOLS: readonly Tool[] = ["claude", "cursor", "copilot"];

/** The document the operator's hand-added entry is planted in. */
const CLAUDE_DOC = ".mcp.json";

/** The three shared client documents, in the order the assertions read them. */
const MERGED_DOCS: readonly string[] = [CLAUDE_DOC, ".cursor/mcp.json", ".vscode/mcp.json"];

/** Curated id selected alongside the pack's, so no assertion is about a lone row. */
const CURATED_ID = "github";

const PACK_ID = "opsmcp";
const SERVER_ID = "acme-telemetry";
const SERVER_PACKAGE = "@acme/telemetry-mcp";
const SERVER_VERSION = "3.2.1";
const SERVER_VAR = "ACME_TELEMETRY_TOKEN";

/** An operator's own entry, hand-added beside the engine's. Never engine-owned. */
const USER_SERVER_ID = "internal-tools";
const USER_SERVER_DEFINITION = { command: "node", args: ["./scripts/internal-mcp.mjs"] };

const getTemp = useTempDir("sync-mcp-ownership");

afterEach(() => {
  __resetContentRootCacheForTests();
});

// ── Fixture ────────────────────────────────────────────────────

/** Minimal viable corpus: core emission requires a charter and nothing else. */
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

/**
 * A pack-supplied server definition held to the curated catalog's bar: an exact
 * pin against an exact package name, a launcher that is not a shell, and the
 * credential by `${env:VAR}` reference only. Anything looser is refused at the
 * projection read, which would make this fixture prove the ingress gate instead
 * of the ownership lane.
 */
const PACK_SERVER_JSON = `${JSON.stringify(
  {
    id: SERVER_ID,
    description: "Deployment telemetry queries.",
    command: "npx",
    args: ["-y", `${SERVER_PACKAGE}@${SERVER_VERSION}`, "--token", `\${env:${SERVER_VAR}}`],
    transport: "stdio",
    requiresEnv: [{ name: SERVER_VAR, description: "Read-only telemetry API token" }],
    pinnedVersion: SERVER_VERSION,
    packageNameLock: SERVER_PACKAGE,
    blastRadius: "Low — read-only telemetry queries against a staging project.",
    docsUrl: "https://example.invalid/acme-telemetry",
  },
  null,
  2,
)}\n`;

/** Pack-relative file map: `mcp_servers/` alone, so nothing else moves emission. */
const PACK_FILES: Readonly<Record<string, string>> = Object.freeze({
  "mcp_servers/telemetry.json": PACK_SERVER_JSON,
});

/** `pack.json` carrying the integrity map the install gate verifies. */
function packManifestJson(): string {
  const integrity = Object.fromEntries(
    Object.entries(PACK_FILES).map(([relPath, content]) => [
      relPath,
      createHash("sha256").update(content, "utf8").digest("hex"),
    ]),
  );
  return `${JSON.stringify(
    { name: PACK_ID, version: "1.0.0", integrity, permissions: { toolFootprint: ["read"] } },
    null,
    2,
  )}\n`;
}

function emptySelection(): ContentSelection {
  return { items: { agent: [], skill: [], rule: [], command: [] } };
}

/**
 * A repo with the fixture pack installed through the REAL install path and a
 * manifest on disk carrying the pack's ledger rows; returns the repo root,
 * which sits beside the fixture corpus rather than above it.
 *
 * The install path is used rather than a hand-written ledger because the ledger
 * IS the input under test: `discoverInstalledPacks` reads `pack:<id>` rows to
 * decide which packs exist, so a hand-seeded row would let this suite pass over
 * a state the shipped installer cannot produce.
 */
async function seedRepoWithPack(selected: readonly string[]): Promise<string> {
  const handle = getTemp();
  __setContentRootForTests(handle.path("corpus"));
  await handle.seedFiles({
    "corpus/charter/stamity-charter.md": CHARTER_FIXTURE,
    "repo/.keep": "",
    ...Object.fromEntries(
      Object.entries(PACK_FILES).map(([relPath, content]) => [
        `pack-src/${PACK_ID}/${relPath}`,
        content,
      ]),
    ),
    [`pack-src/${PACK_ID}/pack.json`]: packManifestJson(),
  });

  const rootDir = handle.path("repo");
  const base = createManifest({
    tools: [...TOOLS],
    selection: emptySelection(),
    generatorVersion: ENGINE_VERSION,
    now: T0,
  });

  const plan = await planPackInstall(rootDir, handle.path(`pack-src/${PACK_ID}`), {
    allowUntrusted: true,
  });
  expect(plan.collisions).toEqual([]);
  const applied = await applyPackInstall(rootDir, plan, base, {
    engineVersion: ENGINE_VERSION,
    now: T0,
  });
  expect(applied.result.errors).toEqual([]);
  expect(applied.result.installed).toBe(true);

  await writeManifest(rootDir, { ...applied.manifest, mcp: { servers: [...selected] } }, { now: T0 });
  return rootDir;
}

/** Rewrites the manifest's MCP selection on disk — the operator revoking a server. */
async function selectServers(rootDir: string, servers: readonly string[]): Promise<void> {
  const manifest = await readManifest(rootDir);
  if (manifest === null) throw new Error("fixture lost its manifest");
  await writeManifest(rootDir, { ...manifest, mcp: { servers: [...servers] } }, { now: T1 });
}

/** The git seam stubbed to a clean tree: no child process, no host repo state. */
function planFor(rootDir: string): Promise<SyncPlan> {
  return planSync(rootDir, ENGINE_VERSION, { runner: () => "" });
}

function applyFor(rootDir: string, plan: SyncPlan): ReturnType<typeof applySync> {
  return applySync(rootDir, plan, {
    engineVersion: ENGINE_VERSION,
    force: false,
    dryRun: false,
    now: T1,
  });
}

/** The plan's predicted disposition for one path, or `null` when it plans none. */
function actionOf(plan: SyncPlan, path: string): string | null {
  return plan.entries.find((entry) => entry.path === path)?.action ?? null;
}

/**
 * The servers map of an on-disk MCP document, under whichever spelling it uses
 * (`mcpServers` for Claude and Cursor, `servers` for VS Code).
 */
async function serversIn(rootDir: string, relPath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(join(rootDir, ...relPath.split("/")), "utf8");
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const map = doc["mcpServers"] ?? doc["servers"];
  if (typeof map !== "object" || map === null) {
    throw new Error(`${relPath} carries no servers map: ${raw}`);
  }
  return map as Record<string, unknown>;
}

/** Server ids present in an on-disk document, sorted. */
async function idsIn(rootDir: string, relPath: string): Promise<string[]> {
  return Object.keys(await serversIn(rootDir, relPath)).toSorted();
}

/** File contents, or `null` when the path is not there — an absence assertion
 *  that distinguishes "removed" from "unreadable for another reason". */
async function readIfPresent(absPath: string): Promise<string | null> {
  try {
    return await readFile(absPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * `[document, sorted ids]` for all three merged documents, read in parallel.
 *
 * One labelled assertion over the whole set rather than three bare ones: a
 * failure names WHICH client document diverged, and a lane that emitted only
 * some of them fails on the missing pair instead of passing the ones it wrote.
 */
async function idsByDoc(rootDir: string): Promise<[string, string[]][]> {
  return Promise.all(
    MERGED_DOCS.map(async (doc): Promise<[string, string[]]> => [doc, await idsIn(rootDir, doc)]),
  );
}

/** The {@link idsByDoc} shape for a repo where every client document agrees. */
function sameIdsEverywhere(ids: readonly string[]): [string, string[]][] {
  return MERGED_DOCS.map((doc) => [doc, [...ids].toSorted()]);
}

/** The {@link idsByDoc} shape when only the Claude document carries extra ids. */
function idsWithClaudeExtra(ids: readonly string[], claudeIds: readonly string[]): [string, string[]][] {
  return MERGED_DOCS.map((doc) => [
    doc,
    (doc === CLAUDE_DOC ? [...claudeIds] : [...ids]).toSorted(),
  ]);
}

/** The VS Code document's `inputs` row ids, in order; `[]` when it has none. */
async function inputIdsIn(rootDir: string): Promise<string[]> {
  const raw = await readFile(join(rootDir, ".vscode", "mcp.json"), "utf8");
  const doc = JSON.parse(raw) as { inputs?: unknown };
  if (!Array.isArray(doc.inputs)) return [];
  return doc.inputs
    .map((row) => (row as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string");
}

/** Hand-adds the operator's own server to a document the engine already wrote. */
async function addUserServer(rootDir: string, relPath: string): Promise<void> {
  const path = join(rootDir, ...relPath.split("/"));
  const doc = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  const key = "mcpServers" in doc ? "mcpServers" : "servers";
  const map = doc[key] as Record<string, unknown>;
  doc[key] = { ...map, [USER_SERVER_ID]: USER_SERVER_DEFINITION };
  await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

// ── Sync lane ──────────────────────────────────────────────────

/**
 * A repo where the pack server was selected, synced, and then deselected — the
 * state both lanes are asserted over. `.mcp.json` also carries the operator's
 * own hand-added entry by this point, so no assertion downstream is about a
 * document the engine wrote alone.
 */
async function revokedRepo(): Promise<string> {
  const rootDir = await seedRepoWithPack([CURATED_ID, SERVER_ID]);

  // Selected: the pack id resolves, so all three documents carry it beside the
  // curated one. Two entries, not one — a lane that dropped every managed row
  // would pass a single-row assertion.
  await applyFor(rootDir, await planFor(rootDir));
  expect(await idsByDoc(rootDir)).toEqual(sameIdsEverywhere([SERVER_ID, CURATED_ID]));

  // The operator's own server, added by hand after the engine wrote the file.
  // It must survive the revocation, which is what separates "the engine removed
  // what it owns" from "the engine rewrote the file".
  await addUserServer(rootDir, ".mcp.json");

  // Revocation: `config mcp remove acme-telemetry` writes exactly this.
  await selectServers(rootDir, [CURATED_ID]);
  return rootDir;
}

describe("sync — pack-supplied MCP server ownership", () => {
  it("plans the removal: every client document is predicted `update`, not `unchanged`", async () => {
    const rootDir = await revokedRepo();

    const plan = await planFor(rootDir);

    // The plan lane is half the defect and is asserted on its own because it
    // fails on its own: before the fix it answered `unchanged` for all three, so
    // `stamity check` (which runs this same plan as its drift gate) and
    // `sync --dry-run` reported a clean tree while the deselected third-party
    // server was still on disk and still launching with the `.env.mcp`
    // credentials.
    for (const doc of MERGED_DOCS) {
      expect([doc, actionOf(plan, doc)]).toEqual([doc, "update"]);
    }
  });

  it("applies the removal: the entry leaves every client document, the operator's own stays", async () => {
    const rootDir = await revokedRepo();

    await applyFor(rootDir, await planFor(rootDir));

    expect(await idsByDoc(rootDir)).toEqual(
      idsWithClaudeExtra([CURATED_ID], [CURATED_ID, USER_SERVER_ID]),
    );
    // The user row is preserved verbatim, not re-rendered: ownership is proved
    // by re-rendering the bytes, and these bytes are not the engine's.
    expect((await serversIn(rootDir, CLAUDE_DOC))[USER_SERVER_ID]).toEqual(USER_SERVER_DEFINITION);
  });

  it("records the ledger hash of the MERGED bytes, so the reclaim sweep can still prove authorship", async () => {
    // The knock-on of the merge, and the reason it is not only a display bug.
    // `contentHash` has exactly one reader — the reclaim sweep, which re-hashes
    // the file on disk to prove the engine wrote it and nobody edited it since
    // (`src/merge/reclaim.ts` gates 2b/4). These three documents land as
    // emission ∪ preserved operator content, so hashing what was HANDED to the
    // writer recorded a document that was never written: the sweep then read
    // the engine's own file as "edited since" and could never reclaim it.
    const rootDir = await revokedRepo();

    await applyFor(rootDir, await planFor(rootDir));

    const manifest = await readManifest(rootDir);
    const recorded = await Promise.all(
      MERGED_DOCS.map(async (doc): Promise<[string, string[], string[]]> => {
        const onDisk = await readFile(join(rootDir, ...doc.split("/")), "utf8");
        const rows = (manifest?.ledger ?? []).filter((row) => row.path === doc);
        const onDiskHash = createHash("sha256").update(onDisk).digest("hex");
        // Every co-owner row carries the hash of the one write they share, so
        // the expectation is that same hash repeated per row — and a document
        // with no rows at all fails on the empty-vs-expected mismatch.
        return [doc, rows.map((row) => row.contentHash ?? "«no hash recorded»"), rows.map(() => onDiskHash)];
      }),
    );
    for (const [doc, actual, expected] of recorded) {
      expect([doc, actual.length > 0, actual]).toEqual([doc, true, expected]);
    }
    // …and the divergence is real here rather than vacuous: `.mcp.json` holds
    // the operator's hand-added entry, so its bytes cannot equal the emission.
    expect(await idsIn(rootDir, CLAUDE_DOC)).toContain(USER_SERVER_ID);
  });

  it("settles: the sync after the removal plans the documents unchanged", async () => {
    const rootDir = await seedRepoWithPack([CURATED_ID, SERVER_ID]);
    await applyFor(rootDir, await planFor(rootDir));
    await selectServers(rootDir, [CURATED_ID]);
    await applyFor(rootDir, await planFor(rootDir));

    const settled = await planFor(rootDir);

    for (const doc of MERGED_DOCS) {
      expect([doc, actionOf(settled, doc)]).toEqual([doc, "unchanged"]);
    }
  });

  it("keeps the operator's entry when the LAST server is deselected and the documents leave emission", async () => {
    // The lane the merged-bytes ledger hash opened, asserted end to end.
    //
    // Deselecting every server takes all three documents out of emission, so
    // they stop being merge targets and become reclaim candidates instead. Their
    // ledger rows carry the hash of the MERGED bytes — the fix that made them
    // reclaimable at all — and nothing has edited the files since, so they match
    // it exactly. Read as proof of sole authorship that match made the sweep
    // unlink `.mcp.json` whole: `sync` exited 0, printed `deleted .mcp.json —
    // Whole-file engine output`, and the operator's hand-added server was gone
    // with no backup and no line saying it had been theirs.
    const rootDir = await seedRepoWithPack([CURATED_ID, SERVER_ID]);
    await applyFor(rootDir, await planFor(rootDir));
    await addUserServer(rootDir, CLAUDE_DOC);

    await selectServers(rootDir, []);
    const report = await applyFor(rootDir, await planFor(rootDir));

    // The operator's definition survives, byte for byte, in a file that stayed.
    expect(await idsIn(rootDir, CLAUDE_DOC)).toEqual([USER_SERVER_ID]);
    expect((await serversIn(rootDir, CLAUDE_DOC))[USER_SERVER_ID]).toEqual(USER_SERVER_DEFINITION);
    expect(
      report.reclaimed?.entries.find((entry) => entry.path === CLAUDE_DOC)?.action,
    ).toBe("co-owned-reduced");

    // …and the reduction costs no reclaim coverage: the two documents holding
    // nothing but the engine's own entries are still removed outright, which is
    // what separates this from simply refusing to touch a co-owned path.
    const gone = await Promise.all(
      MERGED_DOCS.filter((doc) => doc !== CLAUDE_DOC).map(async (doc) => [
        doc,
        await readIfPresent(join(rootDir, ...doc.split("/"))),
      ]),
    );
    expect(gone).toEqual(MERGED_DOCS.filter((doc) => doc !== CLAUDE_DOC).map((doc) => [doc, null]));
  });

  it("leaves a hand-tuned pack entry alone: ownership is proved by bytes, not by id", async () => {
    // The guard on the fix's blast radius. Widening the ownership computation to
    // pack ids must not become name-based ownership — an operator who edited the
    // engine's pack entry owns it from that moment, exactly as they would a
    // tuned curated one.
    const rootDir = await seedRepoWithPack([CURATED_ID, SERVER_ID]);
    await applyFor(rootDir, await planFor(rootDir));

    const tuned = { command: "npx", args: ["-y", `${SERVER_PACKAGE}@${SERVER_VERSION}`, "--mine"] };
    const path = join(rootDir, ".mcp.json");
    const doc = JSON.parse(await readFile(path, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    doc.mcpServers[SERVER_ID] = tuned;
    await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");

    await selectServers(rootDir, [CURATED_ID]);
    await applyFor(rootDir, await planFor(rootDir));

    expect(await idsIn(rootDir, CLAUDE_DOC)).toEqual([SERVER_ID, CURATED_ID].toSorted());
    expect((await serversIn(rootDir, ".mcp.json"))[SERVER_ID]).toEqual(tuned);
  });
});

// ── Init lane ──────────────────────────────────────────────────

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

function decisionsFor(rootDir: string): InitDecisions {
  return {
    tools: [...TOOLS],
    toolsSource: "flag",
    detectedTools: [],
    greenfield: true,
    monorepoPackages: [],
    maturityTier: "solo",
    maturitySource: "default",
    existingConfigPaths: [],
    detected: { languages: [], linters: [], testFrameworks: [], ciProviders: [] },
    repoInfo: emptyInfo(rootDir),
  };
}

describe("init — pack-supplied MCP server ownership", () => {
  /** A `--force` re-init over `rootDir`, seeding the MCP selection via the carry. */
  async function reinit(rootDir: string, selected: readonly string[]): Promise<void> {
    await applyInit({
      rootDir,
      decisions: decisionsFor(rootDir),
      // The migration carry is the only surface that seeds MCP servers into a
      // fresh manifest, so this is how init reaches the MCP substrate at all.
      defaults: { mcpServers: [...selected] },
      engineVersion: ENGINE_VERSION,
      dryRun: false,
      force: true,
      now: T1,
    });
  }

  it("carries the pack's ledger rows across a --force re-init, so the pack stays recorded", async () => {
    // The BOUNDARY this suite previously documented as open, now closed.
    // `--force` rebuilds the ledger from its own emission, and pack rows are not
    // part of that emission — init replaces the generated setup, it does not
    // uninstall anything, and `.stamity/packs/` stays on disk untouched. Dropping
    // the rows therefore left real files with no record of them, and everything
    // downstream reads installed packs FROM those rows: the pack became
    // unselectable, its already-emitted entries went unowned in all three client
    // documents, and no surface said so.
    const rootDir = await seedRepoWithPack([CURATED_ID, SERVER_ID]);
    await applyFor(rootDir, await planFor(rootDir));
    expect(await idsIn(rootDir, CLAUDE_DOC)).toContain(SERVER_ID);

    await reinit(rootDir, [CURATED_ID]);

    const manifest = await readManifest(rootDir);
    expect(manifest?.ledger.filter((row) => row.adapter === `pack:${PACK_ID}`).length).toBeGreaterThan(0);
    // Recorded means resolvable: the pack's servers are once again something
    // this repo can select, which is what `config mcp add` refused without them.
    expect(await packMcpServers(await discoverInstalledPacks(rootDir, manifest!), rootDir)).toEqual([
      expect.objectContaining({ id: SERVER_ID, sourcePackId: PACK_ID }),
    ]);
  });

  it("revokes a pack entry through the init lane once the pack is recorded", async () => {
    // The consequence of the row carry, and the reason it is not cosmetic: with
    // the pack resolvable, init can PROVE it wrote the entry by re-rendering it,
    // so a re-init that drops the server from the selection removes it from all
    // three documents. Before, init judged its own emission an unowned user row
    // and the deselected third-party server kept launching with the `.env.mcp`
    // credential — the revocation silence this suite exists to close, reachable
    // through init instead of sync.
    const rootDir = await seedRepoWithPack([CURATED_ID, SERVER_ID]);
    await applyFor(rootDir, await planFor(rootDir));
    expect(await idsByDoc(rootDir)).toEqual(sameIdsEverywhere([SERVER_ID, CURATED_ID]));

    await reinit(rootDir, [CURATED_ID]);

    expect(await idsByDoc(rootDir)).toEqual(sameIdsEverywhere([CURATED_ID]));
    expect((await readManifest(rootDir))?.mcp?.servers).toEqual([CURATED_ID]);
  });

  it("drops a carried row whose pack directory is gone, so --force still repairs", async () => {
    // The blast-radius guard on the row carry. `discoverInstalledPacks` refuses
    // a row whose content directory is missing — correctly, a row is an
    // ownership claim over files — so carrying one unconditionally would turn
    // `--force` into a hard CONFIG_ERROR on exactly the broken state it exists
    // to repair. A pack removed outside the engine is not installed, and the
    // truthful record is no row at all.
    const rootDir = await seedRepoWithPack([CURATED_ID, SERVER_ID]);
    await applyFor(rootDir, await planFor(rootDir));
    await rm(join(rootDir, ".stamity", "packs", PACK_ID), { recursive: true, force: true });

    await expect(reinit(rootDir, [CURATED_ID])).resolves.toBeUndefined();

    const manifest = await readManifest(rootDir);
    expect(manifest?.ledger.filter((row) => row.adapter === `pack:${PACK_ID}`)).toEqual([]);
  });

  it("records the ledger hash of the MERGED bytes, matching the sync lane row for row", async () => {
    // The init half of the same contract. Both writers produce the same ledger
    // for the same emission or the ownership model answers differently
    // depending on which verb ran last — and init reaches these three paths
    // through the identical merge, so it has the identical divergence between
    // what it hands the writer and what lands on disk.
    const rootDir = await seedRepoWithPack([CURATED_ID, SERVER_ID]);
    await applyFor(rootDir, await planFor(rootDir));
    await addUserServer(rootDir, CLAUDE_DOC);

    await reinit(rootDir, [CURATED_ID, SERVER_ID]);

    const manifest = await readManifest(rootDir);
    const onDisk = await readFile(join(rootDir, CLAUDE_DOC), "utf8");
    const rows = (manifest?.ledger ?? []).filter((row) => row.path === CLAUDE_DOC);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((row) => row.contentHash)).toEqual(
      rows.map(() => createHash("sha256").update(onDisk).digest("hex")),
    );
    // Non-vacuous: the operator's row is in those bytes and in no emission.
    expect(await idsIn(rootDir, CLAUDE_DOC)).toContain(USER_SERVER_ID);
  });

  it("still keeps a pack entry it cannot prove it wrote", async () => {
    // The no-false-positive half, kept from the boundary case it replaces: the
    // carry widens what init can PROVE, never what it is willing to delete
    // unproven. An operator who tuned the pack's entry no longer matches the
    // engine's rendering, so their definition is unowned and survives the same
    // re-init that removes the untouched copies.
    const rootDir = await seedRepoWithPack([CURATED_ID, SERVER_ID]);
    await applyFor(rootDir, await planFor(rootDir));

    const tunedPath = join(rootDir, CLAUDE_DOC);
    const doc = JSON.parse(await readFile(tunedPath, "utf8")) as Record<string, unknown>;
    const map = doc["mcpServers"] as Record<string, Record<string, unknown>>;
    map[SERVER_ID] = { ...map[SERVER_ID], args: [...(map[SERVER_ID]!["args"] as string[]), "--mine"] };
    await writeFile(tunedPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");

    await reinit(rootDir, [CURATED_ID]);

    // Tuned copy kept, untouched copies removed — ownership decided by bytes,
    // not by id, exactly as the sync lane decides it.
    expect(await idsByDoc(rootDir)).toEqual(idsWithClaudeExtra([CURATED_ID], [CURATED_ID, SERVER_ID]));
    expect((await serversIn(rootDir, CLAUDE_DOC))[SERVER_ID]).toEqual(map[SERVER_ID]);
  });

  it("writes only the selected curated server into a fresh repo with no pack installed", async () => {
    // The no-packs control: the ownership question resolves empty for a reason
    // that has nothing to do with init, and the document is still correct.
    const handle = getTemp();
    __setContentRootForTests(handle.path("corpus"));
    await handle.seedFiles({ "corpus/charter/stamity-charter.md": CHARTER_FIXTURE });
    const rootDir = handle.path("repo");
    await mkdir(rootDir, { recursive: true });

    await applyInit({
      rootDir,
      decisions: decisionsFor(rootDir),
      defaults: { mcpServers: [CURATED_ID] },
      engineVersion: ENGINE_VERSION,
      dryRun: false,
      force: false,
      now: T0,
    });

    expect(await idsByDoc(rootDir)).toEqual(sameIdsEverywhere([CURATED_ID]));
  });
});

// ── Uninstall lane: clean --pack ───────────────────────────────

/**
 * The ORDER-INDEPENDENCE half of the same ownership contract, and the one
 * ordering nothing covered.
 *
 * Deselect-first (`config mcp remove <id>` then `sync`, then `clean --pack`) is
 * the sequence every case above drives, and it ends clean. Uninstall-first —
 * `clean --pack` while the server is still selected — is the sequence an
 * operator reaches by reading the uninstall verb as the whole uninstall, and it
 * used to be a one-way door: the scoped clean dropped the pack's files and its
 * `pack:<id>` rows without visiting the client documents, so from the next
 * command onwards nothing could RENDER the pack's id. `engineOwnedServerIds`
 * proves authorship by re-rendering, so the entry the engine itself wrote became
 * unprovable, and every lane then correctly-conservatively judged it the
 * operator's: `sync` failed with `Unknown MCP server id(s)`, its own remedy
 * (`config mcp remove <id>`) left the full third-party launcher — credential
 * reference, VS Code prompt row and all — in `.mcp.json`, `.cursor/mcp.json` and
 * `.vscode/mcp.json`, `check` reported drift clean over it, and a later FULL
 * `clean` preserved it too. The last moment the engine can prove what it wrote
 * is inside the scoped clean itself, which is why the removal belongs there.
 *
 * Both directions again: the pack's own entries must LEAVE, and everything that
 * is not the pack's — the curated server still selected, the operator's
 * hand-added row, their credential prompt — must stay.
 */

/** `stamity clean --pack <id>` through the in-process CLI funnel. */
function runCleanPack(
  rootDir: string,
  argv: readonly string[] = [],
): ReturnType<typeof runInProcess> {
  return runInProcess([cleanCommand], ["clean", "--pack", PACK_ID, "-y", ...argv], {
    cwd: rootDir,
  });
}

/**
 * A synced repo with the pack's server selected beside the curated one, the
 * operator's own entry hand-added to `.mcp.json`, and a second sync so the
 * ledger records the hash of the MERGED bytes. The state an operator is in when
 * they type `clean --pack`.
 */
async function repoBeforeUninstall(): Promise<string> {
  const rootDir = await seedRepoWithPack([CURATED_ID, SERVER_ID]);
  await applyFor(rootDir, await planFor(rootDir));
  await addUserServer(rootDir, CLAUDE_DOC);
  await applyFor(rootDir, await planFor(rootDir));

  // Preconditions, asserted rather than assumed: all three documents carry the
  // pack's entry beside the curated one, the operator's row is in `.mcp.json`,
  // and VS Code has a prompt row per credential.
  expect(await idsByDoc(rootDir)).toEqual(
    idsWithClaudeExtra([SERVER_ID, CURATED_ID], [SERVER_ID, CURATED_ID, USER_SERVER_ID]),
  );
  expect(await inputIdsIn(rootDir)).toEqual(["github-pat", "acme-telemetry-token"]);
  return rootDir;
}

describe("clean --pack — uninstall-first ordering", () => {
  it("takes the pack's server out of every client document while the pack can still be proved", async () => {
    const rootDir = await repoBeforeUninstall();

    const result = await runCleanPack(rootDir);

    expect(result.code).toBe(0);
    // The pack's entry is gone from all three documents; the curated server the
    // operator still selected and their own hand-added row are untouched.
    expect(await idsByDoc(rootDir)).toEqual(
      idsWithClaudeExtra([CURATED_ID], [CURATED_ID, USER_SERVER_ID]),
    );
    expect((await serversIn(rootDir, CLAUDE_DOC))[USER_SERVER_ID]).toEqual(USER_SERVER_DEFINITION);
    // The VS Code prompt row the removed server referenced goes with it; the
    // curated server's stays, because the curated server stays.
    expect(await inputIdsIn(rootDir)).toEqual(["github-pat"]);
  });

  it("drops the pack's ids from the selection, so the next sync resolves and settles", async () => {
    // The other half of the stranding. Leaving the id selected is what made the
    // next `sync` fail with `Unknown MCP server id(s)` and sent the operator to
    // the remedy that could no longer remove anything.
    const rootDir = await repoBeforeUninstall();

    await runCleanPack(rootDir);

    expect((await readManifest(rootDir))?.mcp?.servers).toEqual([CURATED_ID]);
    const settled = await planFor(rootDir);
    for (const doc of MERGED_DOCS) {
      expect([doc, actionOf(settled, doc)]).toEqual([doc, "unchanged"]);
    }
  });

  it("leaves the documents reclaimable: their ledger rows hash the bytes now on disk", async () => {
    // A rewrite that did not refresh the row would leave the ledger asserting a
    // document that is no longer there — the record every other lane reads as
    // "what the engine last wrote here".
    const rootDir = await repoBeforeUninstall();

    await runCleanPack(rootDir);

    const manifest = await readManifest(rootDir);
    const recorded = await Promise.all(
      MERGED_DOCS.map(async (doc): Promise<[string, string[], string[]]> => {
        const onDisk = await readFile(join(rootDir, ...doc.split("/")), "utf8");
        const rows = (manifest?.ledger ?? []).filter((row) => row.path === doc);
        const onDiskHash = createHash("sha256").update(onDisk).digest("hex");
        return [doc, rows.map((row) => row.contentHash ?? "«none»"), rows.map(() => onDiskHash)];
      }),
    );
    for (const [doc, actual, expected] of recorded) {
      expect([doc, actual.length > 0, actual]).toEqual([doc, true, expected]);
    }
  });

  it("writes nothing under --dry-run and previews the removal", async () => {
    const rootDir = await repoBeforeUninstall();
    const before = await Promise.all(
      MERGED_DOCS.map((doc) => readFile(join(rootDir, ...doc.split("/")), "utf8")),
    );

    const result = await runCleanPack(rootDir, ["--dry-run"]);

    expect(result.code).toBe(0);
    expect(
      await Promise.all(MERGED_DOCS.map((doc) => readFile(join(rootDir, ...doc.split("/")), "utf8"))),
    ).toEqual(before);
    expect((await readManifest(rootDir))?.mcp?.servers).toEqual([CURATED_ID, SERVER_ID]);
    expect(result.stdout).toContain(SERVER_ID);
  });

  it("keeps a hand-tuned pack entry, and still stops selecting it", async () => {
    // The blast-radius guard, in the uninstall verb's spelling. Removal is
    // proved by re-rendering the bytes, so an operator who edited the engine's
    // pack entry owns it from that moment and it survives — but the selection
    // still has to let go of an id nothing can resolve any more, or every later
    // sync fails on it.
    const rootDir = await repoBeforeUninstall();
    const tuned = { command: "npx", args: ["-y", `${SERVER_PACKAGE}@${SERVER_VERSION}`, "--mine"] };
    const path = join(rootDir, CLAUDE_DOC);
    const doc = JSON.parse(await readFile(path, "utf8")) as { mcpServers: Record<string, unknown> };
    doc.mcpServers[SERVER_ID] = tuned;
    await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");

    await runCleanPack(rootDir);

    expect(await idsByDoc(rootDir)).toEqual(
      idsWithClaudeExtra([CURATED_ID], [CURATED_ID, SERVER_ID, USER_SERVER_ID]),
    );
    expect((await serversIn(rootDir, CLAUDE_DOC))[SERVER_ID]).toEqual(tuned);
    expect((await readManifest(rootDir))?.mcp?.servers).toEqual([CURATED_ID]);
  });

  it("leaves a repo whose pack supplies no selected server byte-identical in its documents", async () => {
    // The no-op control. The uninstall only reaches the client documents when
    // the pack's supply is actually selected; a pack nobody selected must cost
    // the documents nothing, or every `clean --pack` becomes a rewrite of files
    // it has no business in.
    const rootDir = await seedRepoWithPack([CURATED_ID]);
    await applyFor(rootDir, await planFor(rootDir));
    const before = await Promise.all(
      MERGED_DOCS.map((doc) => readFile(join(rootDir, ...doc.split("/")), "utf8")),
    );

    expect((await runCleanPack(rootDir)).code).toBe(0);

    expect(
      await Promise.all(MERGED_DOCS.map((doc) => readFile(join(rootDir, ...doc.split("/")), "utf8"))),
    ).toEqual(before);
    expect((await readManifest(rootDir))?.mcp?.servers).toEqual([CURATED_ID]);
  });
});
