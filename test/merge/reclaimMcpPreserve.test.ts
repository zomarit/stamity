import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanCommand } from "../../src/cli/commands/clean.ts";
import { applySync, planSync, type SyncPlan } from "../../src/cli/commands/sync/engine.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../src/content/contentRoot.ts";
import { createManifest, readManifest, writeManifest } from "../../src/manifest/manifest.ts";
import type { ContentSelection } from "../../src/types/content.ts";
import type { Tool } from "../../src/types/core.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The reclaim sweep's co-owned lane, asserted at the SHIPPED VERBS — `applySync`
 * and the `clean` command over a real temp repo — rather than at
 * `sweepReclaimCandidates` with an ownership set the test hands it.
 *
 * Why a suite of its own, beside the ones that already exist. The co-owned lane
 * has two halves and each was proved in isolation while the pair was broken:
 * `test/merge/reclaim.test.ts` drives the sweep with a HAND-ROLLED reducer that
 * strips a marker line, and `test/manifest/mcpFilter.test.ts` drives
 * `reduceMcpDocumentToUserContent` with a `managedIds` set written by the test.
 * Both stayed green through the regression this file exists for, because neither
 * asks the question the defect lived in: does the shipped lane REACH the reducer
 * at all? A caller that omits `ReclaimOptions.coOwnedPaths` type-checks, passes
 * every existing suite, and silently restores the whole-file delete branch —
 * which is exactly how the defect arrived. So nothing here constructs a reducer,
 * a `managedIds` set, or a ledger row: the lane computes its own ownership by
 * re-rendering each entry, and every assertion reads bytes back off disk.
 *
 * The regression, for the reader who finds this suite red. The three client MCP
 * documents are written by MERGING the engine's entries into whatever the
 * operator already has, and both writers record `sha256` of the MERGED bytes so
 * the sweep can prove authorship at all. Nothing edits those files after a sync,
 * so the steady state matches the recorded hash exactly — and read as proof of
 * SOLE authorship, that match sent `.mcp.json` and `.vscode/mcp.json` down the
 * whole-file delete branch. A full deselect printed `Reclaim sweep: 4 deleted`
 * and destroyed the operator's hand-added server and their own credential-prompt
 * row, with no `.bak` on this lane and no report line saying anything of theirs
 * had been there. The exposure was never a corner: after ANY sync the documents
 * are byte-identical to the last write, so every repo with a hand-added server
 * was one deselect, one tool removal, or one `clean` away from it.
 *
 * Both directions are asserted throughout. A fix that stopped deleting merged
 * documents altogether would pass every preservation case here and fail the
 * engine-only cases, which is the point of carrying both: the sweep must still
 * reclaim what is provably the engine's.
 */

const ENGINE_VERSION = "1.0.0-reclaim-mcp-preserve";
const T0 = new Date("2026-08-18T00:00:00.000Z");
const T1 = new Date("2026-08-18T01:00:00.000Z");

/** One tool per merged document, so no assertion generalises from a single dialect. */
const TOOLS: readonly Tool[] = ["claude", "cursor", "copilot"];

const CLAUDE_DOC = ".mcp.json";
const CURSOR_DOC = ".cursor/mcp.json";
const VSCODE_DOC = ".vscode/mcp.json";
const MERGED_DOCS: readonly string[] = [CLAUDE_DOC, CURSOR_DOC, VSCODE_DOC];

/** A curated id the engine renders for all three dialects. */
const CURATED_ID = "github";
/** The credential prompt the engine derives for {@link CURATED_ID} in VS Code. */
const ENGINE_INPUT_ID = "github-pat";

/** The operator's own server, hand-added beside the engine's. Never engine-owned. */
const USER_SERVER_ID = "internal-tools";
/** The operator's own credential prompt, referenced by their own server alone. */
const USER_INPUT_ID = "my-own-secret";

const getTemp = useTempDir("reclaim-mcp-preserve");

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

function emptySelection(): ContentSelection {
  return { items: { agent: [], skill: [], rule: [], command: [] } };
}

function planFor(rootDir: string): Promise<SyncPlan> {
  // The git seam is stubbed to a clean tree: no child process, no host state.
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

/** Rewrites the manifest's MCP selection on disk — `config mcp add|remove`. */
async function selectServers(rootDir: string, servers: readonly string[]): Promise<void> {
  const manifest = await readManifest(rootDir);
  if (manifest === null) throw new Error("fixture lost its manifest");
  await writeManifest(rootDir, { ...manifest, mcp: { servers: [...servers] } }, { now: T1 });
}

/** Rewrites the manifest's tool set on disk — dropping one is an adapter removal. */
async function selectTools(rootDir: string, tools: readonly Tool[]): Promise<void> {
  const manifest = await readManifest(rootDir);
  if (manifest === null) throw new Error("fixture lost its manifest");
  await writeManifest(rootDir, { ...manifest, tools: [...tools] }, { now: T1 });
}

function abs(rootDir: string, relPath: string): string {
  return join(rootDir, ...relPath.split("/"));
}

/** File contents, or `null` when absent — distinguishes "removed" from "unreadable". */
async function readIfPresent(absPath: string): Promise<string | null> {
  try {
    return await readFile(absPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** The servers map of an on-disk document, under whichever spelling it uses. */
async function serversIn(rootDir: string, relPath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(abs(rootDir, relPath), "utf8");
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const map = doc["mcpServers"] ?? doc["servers"];
  if (typeof map !== "object" || map === null) {
    throw new Error(`${relPath} carries no servers map: ${raw}`);
  }
  return map as Record<string, unknown>;
}

/** Server ids present in an on-disk document, sorted; `null` when the file is gone. */
async function idsIn(rootDir: string, relPath: string): Promise<string[] | null> {
  if ((await readIfPresent(abs(rootDir, relPath))) === null) return null;
  return Object.keys(await serversIn(rootDir, relPath)).toSorted();
}

/** `[document, sorted ids | null]` for all three merged documents, read together.
 *  One labelled assertion rather than three bare ones, so a failure names WHICH
 *  client document diverged instead of only that something did. */
async function idsByDoc(rootDir: string): Promise<[string, string[] | null][]> {
  return Promise.all(
    MERGED_DOCS.map(async (doc): Promise<[string, string[] | null]> => [
      doc,
      await idsIn(rootDir, doc),
    ]),
  );
}

/** The `inputs` row ids of the VS Code document, in order; `[]` when it has none. */
async function inputIdsIn(rootDir: string): Promise<string[]> {
  const raw = await readFile(abs(rootDir, VSCODE_DOC), "utf8");
  const doc = JSON.parse(raw) as { inputs?: unknown };
  if (!Array.isArray(doc.inputs)) return [];
  return doc.inputs.map((row) => (row as { id?: unknown }).id).filter((id): id is string => typeof id === "string");
}

/**
 * The operator's own server, spelled the way the dialect spells one. The VS Code
 * definition references THEIR OWN `${input:…}` id on purpose: `inputs` is the one
 * top-level field the merge rebuilds from the servers map, so a row survives only
 * while something still references it. A row nobody references would be preserved
 * by a weaker rule too, which would make the assertion prove nothing.
 */
function userServerFor(relPath: string): Record<string, unknown> {
  return relPath === VSCODE_DOC
    ? {
        type: "stdio",
        command: "node",
        args: ["./scripts/internal-mcp.mjs"],
        env: { OPS_KEY: `\${input:${USER_INPUT_ID}}` },
      }
    : { command: "node", args: ["./scripts/internal-mcp.mjs"] };
}

/** The operator's own credential prompt row, hand-added to the VS Code document. */
const USER_INPUT_ROW = {
  type: "promptString",
  id: USER_INPUT_ID,
  description: "operator secret",
  password: true,
};

/**
 * Hand-adds the operator's own entries to a document the engine already wrote —
 * the edit an operator makes in their editor, applied to the engine's real bytes
 * rather than to a document this test composed.
 */
async function addUserContent(rootDir: string, relPath: string): Promise<void> {
  const path = abs(rootDir, relPath);
  const doc = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  const key = "mcpServers" in doc ? "mcpServers" : "servers";
  doc[key] = { ...(doc[key] as Record<string, unknown>), [USER_SERVER_ID]: userServerFor(relPath) };
  if (relPath === VSCODE_DOC) {
    doc["inputs"] = [...(Array.isArray(doc["inputs"]) ? doc["inputs"] : []), USER_INPUT_ROW];
  }
  await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

/**
 * A repo the engine has synced, carrying the curated server in all three client
 * documents. Nothing is hand-written into those documents here: they hold the
 * engine's real rendering, which is what the ownership proof re-derives.
 */
async function syncedRepo(): Promise<string> {
  const handle = getTemp();
  __setContentRootForTests(handle.path("corpus"));
  await handle.seedFiles({
    "corpus/charter/stamity-charter.md": CHARTER_FIXTURE,
    "repo/.keep": "",
  });

  const rootDir = handle.path("repo");
  await writeManifest(
    rootDir,
    {
      ...createManifest({
        tools: [...TOOLS],
        selection: emptySelection(),
        generatorVersion: ENGINE_VERSION,
        now: T0,
      }),
      mcp: { servers: [CURATED_ID] },
    },
    { now: T0 },
  );

  await applyFor(rootDir, await planFor(rootDir));
  expect(await idsByDoc(rootDir)).toEqual(MERGED_DOCS.map((doc) => [doc, [CURATED_ID]]));
  return rootDir;
}

/**
 * The state every preservation case starts from: the engine's documents with the
 * operator's own entries hand-added into ALL THREE, then synced again so the
 * ledger records the hash of the MERGED bytes.
 *
 * That second sync is the regression's precondition, not fixture ceremony. It is
 * what makes the files match their recorded hash while holding content that was
 * never the engine's — the exact equivalence the delete branch used to read as
 * sole authorship.
 */
async function repoWithOperatorContent(): Promise<string> {
  const rootDir = await syncedRepo();
  await Promise.all(MERGED_DOCS.map((doc) => addUserContent(rootDir, doc)));
  await applyFor(rootDir, await planFor(rootDir));

  // Precondition, asserted rather than assumed: the operator's entries are in
  // every document beside the engine's, and their prompt row survived the merge.
  expect(await idsByDoc(rootDir)).toEqual(
    MERGED_DOCS.map((doc) => [doc, [CURATED_ID, USER_SERVER_ID].toSorted()]),
  );
  expect(await inputIdsIn(rootDir)).toEqual([ENGINE_INPUT_ID, USER_INPUT_ID]);
  return rootDir;
}

/** Every reclaim disposition the run reported, keyed by path. */
function actionsByPath(
  entries: readonly { path: string; action: string }[] | undefined,
): Record<string, string> {
  return Object.fromEntries((entries ?? []).map((entry) => [entry.path, entry.action]));
}

/**
 * The preservation contract, asserted the same way for every lane: the documents
 * are still on disk, the operator's entries are still in them, and the engine's
 * are gone. Shared so a lane that is added later cannot assert a weaker version
 * of it than the lanes already here.
 */
async function expectOperatorContentSurvived(rootDir: string): Promise<void> {
  expect(await idsByDoc(rootDir)).toEqual(MERGED_DOCS.map((doc) => [doc, [USER_SERVER_ID]]));

  // The definition itself, not merely the id: a lane that kept the key and
  // rewrote the value would pass an id-only assertion.
  const definitions = await Promise.all(
    MERGED_DOCS.map(async (doc) => [doc, (await serversIn(rootDir, doc))[USER_SERVER_ID]] as const),
  );
  expect(definitions).toEqual(MERGED_DOCS.map((doc) => [doc, userServerFor(doc)]));

  // The operator's prompt row outlives the engine's, which leaves with the
  // server that referenced it.
  expect(await inputIdsIn(rootDir)).toEqual([USER_INPUT_ID]);
}

// ── Sync lane ──────────────────────────────────────────────────

describe("sync lane — a full deselect over documents holding operator content", () => {
  it("reduces every merged document instead of deleting it, and keeps the operator's entries", async () => {
    const rootDir = await repoWithOperatorContent();

    // `config mcp remove github` — the last selected server leaves, so all three
    // documents drop out of emission and become reclaim candidates.
    await selectServers(rootDir, []);
    const report = await applyFor(rootDir, await planFor(rootDir));

    await expectOperatorContentSurvived(rootDir);
    expect(actionsByPath(report.reclaimed?.entries)).toMatchObject(
      Object.fromEntries(MERGED_DOCS.map((doc) => [doc, "co-owned-reduced"])),
    );
    // The tally the operator reads. `deleted` over these paths is the defect.
    expect(report.reclaimed?.strippedCount).toBeGreaterThanOrEqual(MERGED_DOCS.length);
  });

  it("settles: a second sync over the reduced documents changes nothing further", async () => {
    // The reduction must be a fixed point. A lane that re-reduced on every run
    // would keep rewriting files it no longer owns, and `check` would report a
    // permanently dirty tree over a repo nothing is wrong with.
    const rootDir = await repoWithOperatorContent();
    await selectServers(rootDir, []);
    await applyFor(rootDir, await planFor(rootDir));

    const after = await Promise.all(
      MERGED_DOCS.map((doc) => readFile(abs(rootDir, doc), "utf8")),
    );
    await applyFor(rootDir, await planFor(rootDir));

    expect(await Promise.all(MERGED_DOCS.map((doc) => readFile(abs(rootDir, doc), "utf8")))).toEqual(
      after,
    );
  });
});

describe("sync lane — a single tool removed", () => {
  it("keeps the operator's entries in the dropped tool's document", async () => {
    // Deselecting a server is not the only way a merged document leaves
    // emission: dropping the tool that owned it does the same thing by the
    // `adapter-removed` route, through the same gates. The engine's server is
    // still SELECTED here, which is what separates this case from the deselect
    // above — the document leaves while its content is still wanted elsewhere.
    const rootDir = await repoWithOperatorContent();

    await selectTools(rootDir, ["claude", "copilot"]);
    const report = await applyFor(rootDir, await planFor(rootDir));

    // Cursor's document is out of emission; the operator's entry stays in it.
    expect(await idsIn(rootDir, CURSOR_DOC)).toEqual([USER_SERVER_ID]);
    expect((await serversIn(rootDir, CURSOR_DOC))[USER_SERVER_ID]).toEqual(
      userServerFor(CURSOR_DOC),
    );
    expect(actionsByPath(report.reclaimed?.entries)[CURSOR_DOC]).toBe("co-owned-reduced");

    // The tools that stayed are untouched: their documents still carry both
    // entries, so the removal was scoped to the adapter that left.
    expect(await idsIn(rootDir, CLAUDE_DOC)).toEqual([CURATED_ID, USER_SERVER_ID].toSorted());
    expect(await idsIn(rootDir, VSCODE_DOC)).toEqual([CURATED_ID, USER_SERVER_ID].toSorted());
  });
});

// ── Clean lane ─────────────────────────────────────────────────

/** `stamity clean -y` through the in-process CLI funnel, from `rootDir`. */
function runClean(rootDir: string, argv: readonly string[] = []): ReturnType<typeof runInProcess> {
  return runInProcess([cleanCommand], ["clean", "-y", ...argv], { cwd: rootDir });
}

describe("clean lane — the uninstall verb over documents holding operator content", () => {
  it("keeps the operator's entries while removing the engine's", async () => {
    // `clean` runs the same sweep with the same gates as `sync`, from a second
    // call site. The reducer map is per-caller, so a caller that omits it is a
    // hole the sync-lane cases above cannot see — which is why this lane is
    // driven through the shipped command rather than asserted by inspection.
    const rootDir = await repoWithOperatorContent();

    const result = await runClean(rootDir);

    expect(result.code).toBe(0);
    await expectOperatorContentSurvived(rootDir);
  });

  it("reports the reduction rather than a deletion for each merged document", async () => {
    const rootDir = await repoWithOperatorContent();

    const result = await runClean(rootDir);

    // The operator-facing record. Silence about a preserved file is survivable;
    // a `deleted` line over a file that held their server is the report the
    // regression printed while destroying it.
    const reduced = MERGED_DOCS.filter((doc) =>
      result.stdout.includes(`co-owned-reduced  ${doc}`),
    );
    expect(reduced).toEqual([...MERGED_DOCS]);
    expect(result.stdout).not.toMatch(/deleted {2}\.mcp\.json/);
    expect(result.stdout).not.toMatch(/deleted {2}\.vscode\/mcp\.json/);
    expect(result.stdout).not.toMatch(/deleted {2}\.cursor\/mcp\.json/);
  });

  it("writes nothing under --dry-run and previews the reduction", async () => {
    const rootDir = await repoWithOperatorContent();
    const before = await Promise.all(MERGED_DOCS.map((doc) => readFile(abs(rootDir, doc), "utf8")));

    const result = await runClean(rootDir, ["--dry-run"]);

    expect(result.code).toBe(0);
    expect(await Promise.all(MERGED_DOCS.map((doc) => readFile(abs(rootDir, doc), "utf8")))).toEqual(
      before,
    );
    expect(result.stdout).toContain("remove the engine's own content from this path and keep the rest");
  });
});

// ── The other direction ────────────────────────────────────────

describe("documents holding only the engine's own entries are still reclaimed", () => {
  it("deletes them outright on the sync lane", async () => {
    // The cost the fix must NOT have: preserving co-owned documents cannot
    // become refusing to reclaim any of them. Nothing is planted here, so every
    // byte in all three documents is the engine's.
    const rootDir = await syncedRepo();

    await selectServers(rootDir, []);
    const report = await applyFor(rootDir, await planFor(rootDir));

    expect(await idsByDoc(rootDir)).toEqual(MERGED_DOCS.map((doc) => [doc, null]));
    expect(actionsByPath(report.reclaimed?.entries)).toMatchObject(
      Object.fromEntries(MERGED_DOCS.map((doc) => [doc, "deleted"])),
    );
  });

  it("deletes them outright on the clean lane", async () => {
    const rootDir = await syncedRepo();

    const result = await runClean(rootDir);

    expect(result.code).toBe(0);
    expect(await idsByDoc(rootDir)).toEqual(MERGED_DOCS.map((doc) => [doc, null]));
  });

  it("still deletes a document whose only survivor is the emptied inputs array", async () => {
    // The VS Code document is the one that does not empty to `{}`: its `inputs`
    // rows are derived from the servers, so removing the engine's server leaves
    // an empty array behind. That residue is the engine's own, and reading it as
    // operator content would strand the file forever.
    const rootDir = await syncedRepo();
    expect(await inputIdsIn(rootDir)).toEqual([ENGINE_INPUT_ID]);

    await selectServers(rootDir, []);
    await applyFor(rootDir, await planFor(rootDir));

    expect(await readIfPresent(abs(rootDir, VSCODE_DOC))).toBeNull();
  });

  it("keeps a document alive for an operator's top-level field alone", async () => {
    // The mirror of the case above. An operator who set nothing but a sibling
    // field authored bytes an unlink would take with them, so the servers map
    // emptying is not on its own a licence to delete.
    const rootDir = await syncedRepo();
    const path = abs(rootDir, CLAUDE_DOC);
    const doc = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    await writeFile(path, `${JSON.stringify({ ...doc, $schema: "./mcp.schema.json" }, null, 2)}\n`, "utf8");
    await applyFor(rootDir, await planFor(rootDir));

    await selectServers(rootDir, []);
    await applyFor(rootDir, await planFor(rootDir));

    const survivor = await readIfPresent(path);
    expect(survivor).not.toBeNull();
    expect(JSON.parse(survivor ?? "{}")).toMatchObject({ $schema: "./mcp.schema.json" });
    expect(await idsIn(rootDir, CLAUDE_DOC)).toEqual([]);
  });
});

// ── The property the whole lane exists for ─────────────────────

describe("no lane destroys a merged document carrying unmanaged content", () => {
  /** The lanes that can take a merged document out of emission, by name. */
  const LANES: readonly { name: string; run: (rootDir: string) => Promise<unknown> }[] = [
    { name: "full deselect (sync)", run: async (r) => { await selectServers(r, []); return applyFor(r, await planFor(r)); } },
    { name: "tool removal (sync)", run: async (r) => { await selectTools(r, ["claude"]); return applyFor(r, await planFor(r)); } },
    { name: "clean", run: (r) => runClean(r) },
  ];

  it.each(LANES)(
    "$name leaves every document holding an operator entry on disk, with no backup needed",
    async ({ run }) => {
      const rootDir = await repoWithOperatorContent();

      await run(rootDir);

      // The destruction assertion, stated as the property rather than per file:
      // a document that carried an unmanaged id before the run still carries it
      // after. This lane takes no `.bak`, so a delete here is unrecoverable —
      // preservation has to be achieved in place, not backed out of afterwards.
      const survivors = await Promise.all(
        MERGED_DOCS.map(async (doc) => [doc, (await idsIn(rootDir, doc))?.includes(USER_SERVER_ID) ?? false] as const),
      );
      expect(survivors).toEqual(MERGED_DOCS.map((doc) => [doc, true]));

      // …and no lane compensated by leaving a copy of the operator's bytes
      // somewhere else in the tree, which would be a credential leak dressed as
      // a safety net.
      const backups = await Promise.all(
        MERGED_DOCS.map((doc) => readIfPresent(abs(rootDir, `${doc}.bak`))),
      );
      expect(backups).toEqual(MERGED_DOCS.map(() => null));
    },
  );
});
