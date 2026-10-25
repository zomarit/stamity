import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applySync, planSync } from "../../../src/cli/commands/sync/engine.ts";
import { renderSyncReport } from "../../../src/cli/commands/sync/report.ts";
import { retiredEngineRenderings } from "../../../src/cli/engine/emissionWrite.ts";
import { makePalette } from "../../../src/cli/kit/terminal.ts";
import { buildContentIndex, emittedIdFor } from "../../../src/content/catalog.ts";
import { SKILLS_PROJECTION_DIR, TOUCHPOINT_POLICY, TOUCHPOINT_POLICY_FILE } from "../../../src/emit/skillsProjection.ts";
import { createManifest, readManifest, writeManifest } from "../../../src/manifest/manifest.ts";
import { RETIRED_ENGINE_PATHS, needsRenderingProof } from "../../../src/manifest/ownedPaths.ts";
import type { LedgerEntry, LedgerOwner } from "../../../src/types/manifest.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * b12-repo-file-waste (REQ-FLOW-033): the retired-path proof. A file an earlier
 * release wrote that the running engine no longer renders for the setup — the
 * nine touchpoint companions `agents/openai.yaml` on a setup without Codex — is
 * proved by a closed list of literal paths (`RETIRED_ENGINE_PATHS`), each with
 * the frozen digest of the bytes 1.16.0 wrote there. A ledger row only selects
 * that digest; the sweep still needs the bytes on disk to hash to it, and a
 * row's own recorded hash proves nothing.
 *
 * Real filesystem, real planner, real sweep for the sync cases: the subject is
 * what lands on disk. The frozen bytes are read from the 1.14.0 release tree
 * the upgrade suite keeps (`test/fixtures/release-1-14-0-tree/`), whose
 * companions are the text 1.16.0 still wrote.
 */

const ENGINE_VERSION = "1.17.0";
const T0 = new Date("2026-10-24T00:00:00.000Z");
const T1 = new Date("2026-10-25T00:00:00.000Z");
const plainPalette = makePalette(false);
const tempDir = useTempDir("stamity-retired-renderings");

const RELEASE_TREE = fileURLToPath(new URL("../../fixtures/release-1-14-0-tree", import.meta.url));
const TOUCHPOINT_IDS = ["ask", "board", "debug", "plan", "pr-resolve", "quick", "rework", "spec", "work"] as const;

const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const companionPath = (id: string): string => `${SKILLS_PROJECTION_DIR}/st-${id}/${TOUCHPOINT_POLICY_FILE}`;
const skillPath = (id: string): string => `${SKILLS_PROJECTION_DIR}/st-${id}/SKILL.md`;

/** The companion row a 1.16.0 sync recorded for `id`, owned by `adapter`. */
function companionRow(id: string, adapter: LedgerOwner = "cursor", contentHash = sha256(TOUCHPOINT_POLICY)): LedgerEntry {
  return { path: companionPath(id), adapter, artifactId: `cmd-${id}`, artifactType: "command", contentHash };
}

describe("RETIRED_ENGINE_PATHS, the closed list", () => {
  it("holds exactly the listed literal keys: the nine touchpoint companions", () => {
    expect([...RETIRED_ENGINE_PATHS.keys()].toSorted()).toEqual(TOUCHPOINT_IDS.map(companionPath).toSorted());
  });

  it("names each companion's owners and touchpoint, and the digest of the bytes 1.16.0 wrote there", async () => {
    const released = await readFile(`${RELEASE_TREE}/.agents.fixture/skills/st-work/agents/openai.yaml`, "utf8");
    // The frozen literal is the release's own bytes, and still the engine's companion text.
    expect(sha256(released)).toBe(sha256(TOUCHPOINT_POLICY));
    for (const id of TOUCHPOINT_IDS) {
      const entry = RETIRED_ENGINE_PATHS.get(companionPath(id));
      expect(entry, id).toEqual({ owners: ["codex", "cursor"], touchpoint: `cmd-${id}`, digest: sha256(released) });
      // The touchpoint maps to the folder the path names, as the adapters name it.
      expect(emittedIdFor({ id: entry?.touchpoint ?? "", type: "command" }), id).toBe(`st-${id}`);
      // Every listed path is one the rendering proof governs, so the list widens no other lane.
      expect(needsRenderingProof(companionPath(id)), id).toBe(true);
    }
  });

  it("freezes each entry, so a caller cannot widen an entry's owners or swap its digest", () => {
    for (const entry of RETIRED_ENGINE_PATHS.values()) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.owners)).toBe(true);
    }
  });
});

describe("retiredEngineRenderings selects a digest only where every check holds", () => {
  const listed = companionPath("ask");

  it("returns the frozen digest for a listed owner's row at a listed path no adapter plans", () => {
    const found = retiredEngineRenderings([companionRow("ask")], new Set([listed]), new Set());
    expect(found).toEqual([[listed, sha256(TOUCHPOINT_POLICY)]]);
    // Codex's row selects it too: both clients wrote the one file in 1.16.0.
    expect(retiredEngineRenderings([companionRow("ask", "codex")], new Set([listed]), new Set())).toEqual(found);
  });

  it("returns nothing for a path an adapter still plans, which takes the ordinary proof", () => {
    expect(retiredEngineRenderings([companionRow("ask")], new Set([listed]), new Set([listed]))).toEqual([]);
  });

  it("returns nothing for a path the sweep did not ask about", () => {
    expect(retiredEngineRenderings([companionRow("ask")], new Set([companionPath("work")]), new Set())).toEqual([]);
  });

  it.each([
    ["a bundled skill's own companion, outside the list", { path: `${SKILLS_PROJECTION_DIR}/st-onboard/${TOUCHPOINT_POLICY_FILE}`, artifactId: "onboard", artifactType: "skill" }],
    ["a pack command's companion, outside the list", { path: `${SKILLS_PROJECTION_DIR}/st-release/${TOUCHPOINT_POLICY_FILE}`, artifactId: "cmd-release" }],
    ["a listed path owned by a client the entry does not name", { adapter: "copilot" }],
    ["a listed path owned by a pack", { adapter: "pack:ops" }],
    ["a listed path whose row is not a command", { artifactType: "skill" }],
    ["a listed path whose row names another touchpoint", { artifactId: "cmd-work" }],
    ["a listed path whose row records another text's hash", { contentHash: sha256("policy:\n  allow_implicit_invocation: true\n") }],
    ["a listed path whose row's hash is not 64 lowercase hex", { contentHash: sha256(TOUCHPOINT_POLICY).toUpperCase() }],
  ] as const)("keeps %s", (_title, change) => {
    const row: LedgerEntry = { ...companionRow("ask"), ...change };
    expect(retiredEngineRenderings([row], new Set([row.path]), new Set())).toEqual([]);
  });
});

/** All nine catalog command ids, from the shipped corpus. */
async function commandIds(): Promise<string[]> {
  const index = await buildContentIndex();
  return index.items.filter((item) => item.type === "command").map((item) => item.id);
}

/** One live `sync`, as the command runs it, with its report text. */
async function syncOnce(root: string, now: Date) {
  const plan = await planSync(root, ENGINE_VERSION, { runner: () => "" });
  const report = await applySync(root, plan, { engineVersion: ENGINE_VERSION, force: false, dryRun: false, now });
  return { report, text: renderSyncReport(plan, report, plainPalette) };
}

/**
 * A Cursor-only repository as a 1.16.0 sync left it: the touchpoint skills this
 * engine renders, plus the nine companions 1.16.0 also wrote, each on disk and
 * in the ledger under Cursor. `edit` rewrites one companion's bytes by hand.
 */
async function seedCursorRepo(edit?: { id: string; bytes: string }): Promise<string> {
  const handle = tempDir();
  const root = handle.path("repo");
  const commands = await commandIds();
  expect(commands).toHaveLength(9);
  await writeManifest(
    root,
    createManifest({
      tools: ["cursor"],
      selection: { items: { agent: [], skill: [], rule: [], command: commands } },
      generatorVersion: "1.16.0",
      now: T0,
    }),
    { now: T0 },
  );
  await syncOnce(root, T0);
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("no manifest");
  await writeManifest(root, { ...manifest, ledger: [...manifest.ledger, ...TOUCHPOINT_IDS.map((id) => companionRow(id))] }, { now: T0 });
  await handle.seedFiles(Object.fromEntries(TOUCHPOINT_IDS.map((id) => [`repo/${companionPath(id)}`, TOUCHPOINT_POLICY])));
  if (edit !== undefined) await writeFile(`${root}/${companionPath(edit.id)}`, edit.bytes);
  return root;
}

describe("sync over a 1.16.0 ledger with tools [cursor]", () => {
  it("deletes the nine companions, drops their rows, and leaves each SKILL.md byte-identical", async () => {
    const root = await seedCursorRepo();
    const before = await Promise.all(TOUCHPOINT_IDS.map((id) => readFile(`${root}/${skillPath(id)}`, "utf8")));
    // Non-degenerate: the companions are on disk and in the ledger before the sync.
    for (const id of TOUCHPOINT_IDS) expect(existsSync(`${root}/${companionPath(id)}`), id).toBe(true);

    const { report } = await syncOnce(root, T1);

    const deleted = (report.reclaimed?.entries ?? []).filter((entry) => entry.action === "deleted").map((entry) => entry.path);
    expect(deleted.toSorted()).toEqual(TOUCHPOINT_IDS.map(companionPath).toSorted());
    for (const id of TOUCHPOINT_IDS) expect(existsSync(`${root}/${companionPath(id)}`), id).toBe(false);
    const after = await Promise.all(TOUCHPOINT_IDS.map((id) => readFile(`${root}/${skillPath(id)}`, "utf8")));
    expect(after).toEqual(before);
    const ledger = (await readManifest(root))?.ledger ?? [];
    const companions = ledger.filter((row) => row.path.endsWith(`/${TOUCHPOINT_POLICY_FILE}`));
    expect(companions.filter((row) => row.artifactType === "command")).toEqual([]);
    // Decision E4: the bundled skills' own companions are not touchpoints' and stay planned and ledgered.
    expect(companions.length).toBeGreaterThan(0);
    expect(companions.every((row) => row.artifactType === "skill" && existsSync(`${root}/${row.path}`))).toBe(true);
    const touchpointSkills = ledger.filter((row) => row.artifactType === "command" && row.path.endsWith("/SKILL.md"));
    expect(touchpointSkills.map((row) => row.path).toSorted()).toEqual(TOUCHPOINT_IDS.map(skillPath).toSorted());
  });

  it("keeps an edited companion and names it, and still deletes the other eight", async () => {
    const edited = `${TOUCHPOINT_POLICY}interface:\n  display_name: "Ask"\n`;
    const root = await seedCursorRepo({ id: "ask", bytes: edited });

    const { report, text } = await syncOnce(root, T1);

    expect(await readFile(`${root}/${companionPath("ask")}`, "utf8")).toBe(edited);
    const entries = report.reclaimed?.entries ?? [];
    expect(entries.find((entry) => entry.path === companionPath("ask"))?.action).toBe("skipped-user-content");
    expect(text).toContain(companionPath("ask"));
    const deleted = entries.filter((entry) => entry.action === "deleted").map((entry) => entry.path);
    expect(deleted.toSorted()).toEqual(TOUCHPOINT_IDS.filter((id) => id !== "ask").map(companionPath).toSorted());
  });

  it("keeps a companion whose bytes match its row but are not the frozen text", async () => {
    // A forged row hashing an owner's own file at a listed path: the row's hash
    // matches the bytes, so only the frozen digest stands between it and a delete.
    const owned = "policy:\n  allow_implicit_invocation: true\n";
    const root = await seedCursorRepo({ id: "work", bytes: owned });
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("no manifest");
    const ledger = manifest.ledger.map((row) =>
      row.path === companionPath("work") ? { ...row, contentHash: sha256(owned) } : row,
    );
    await writeManifest(root, { ...manifest, ledger }, { now: T0 });

    const { report, text } = await syncOnce(root, T1);

    expect(await readFile(`${root}/${companionPath("work")}`, "utf8")).toBe(owned);
    expect((report.reclaimed?.entries ?? []).find((entry) => entry.path === companionPath("work"))?.action).toBe(
      "skipped-user-content",
    );
    expect(text).toContain(companionPath("work"));
  });
});
