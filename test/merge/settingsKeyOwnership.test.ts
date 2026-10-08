import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLAUDE_SETTINGS_PATH } from "../../src/adapters/claude.ts";
import { checkCommand, runDriftGate } from "../../src/cli/commands/check.ts";
import { cleanCommand } from "../../src/cli/commands/clean.ts";
import { applyInit } from "../../src/cli/commands/init/apply.ts";
import { buildInitDecisions } from "../../src/cli/commands/init/plan.ts";
import { applyPluginSetup, type PluginSetupRoot } from "../../src/cli/commands/plugin/setup.ts";
import { applySync, planSync, type SyncPlanEntry } from "../../src/cli/commands/sync/engine.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../src/content/contentRoot.ts";
import { sha256 } from "../../src/cli/engine/emissionWrite.ts";
import { createApp } from "../../src/index.ts";
import { memberHash } from "../../src/manifest/jsonMembers.ts";
import { readManifest, writeManifest } from "../../src/manifest/manifest.ts";
import type { MergeResult } from "../../src/types/content.ts";
import type { Tool } from "../../src/types/core.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Key-level ownership of `.claude/settings.json`, asserted at the SHIPPED VERBS
 * over a real temp repository — the same posture `./reclaimMcpPreserve.test.ts`
 * takes for the three merged MCP documents, and for the same reason: the
 * document is co-owned, and a lane that omits the co-owned handling type-checks
 * and passes every unit test of the merge module while destroying the other
 * owner's keys.
 *
 * The other owners. The client's own `plugin install … --scope project` writes
 * `enabledPlugins` into this file (measured on Claude Code 2.1.278, 2026-09-22:
 * that key alone, in the engine's own two-space style; the marketplace record
 * lands in the user-scope settings of the configuration directory). An operator
 * sets `model`, `env` or anything else the client documents. The engine owns
 * the hook entries it renders when the repository owns hooks, and the allow
 * rows a release before this one rendered until they leave — nothing else.
 * Under a plugin that carries hooks it renders no member at all.
 *
 * The defect this suite exists for (the 1.9.0 candidate, on the documented
 * consumer route): the client wrote the file first, `plugin setup` then treated
 * the whole file as its own and SKIPPED it because no ledger row and no marker
 * proved authorship, and `check` reported a `collision` whose printed remedy —
 * move the file aside, or `sync --force` behind a `.bak` — destroys the install
 * record. The reverse order was broken too: the client's key appended to the
 * engine's file read as hand-edit drift, and the next `sync` regenerated the
 * file whole, dropping the key behind a `.bak`. Repository mode had the same
 * shape for an operator's `model`.
 */

const ENGINE_VERSION = createApp().version;
const T0 = new Date("2026-09-22T09:00:00.000Z");
const T1 = new Date("2026-09-22T10:00:00.000Z");

/** The client's project-scope install write, byte for byte as measured (58 bytes). */
const CLIENT_SETTINGS = `${JSON.stringify({ enabledPlugins: { "stamity@stamity": true } }, null, 2)}\n`;

const getTemp = useTempDir("settings-key-ownership");

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

beforeEach(async () => {
  __setContentRootForTests(getTemp().path("corpus"));
  await getTemp().seedFiles({ "corpus/charter/stamity-charter.md": CHARTER_FIXTURE });
});

afterEach(() => {
  __resetContentRootCacheForTests();
});

// ── Fixture ────────────────────────────────────────────────────

async function freshRepo(sub = "repo"): Promise<string> {
  const root = getTemp().path(sub);
  await mkdir(root, { recursive: true });
  return root;
}

/** A claude root that carries every class the container has a surface for, hooks included. */
function claudeRoot(): PluginSetupRoot {
  const carried = { status: "carried" as const, count: 4 };
  return {
    tool: "claude",
    root: getTemp().path("claude-plugin-root"),
    file: {
      schemaVersion: 1,
      client: "claude",
      version: "1.9.0",
      sourceCommit: "b".repeat(40),
      invocation: { commands: "/stamity:<id>" },
      clientFloor: { version: "2.1.224" },
      prerequisites: { node: ">=22.22.2", git: "optional" },
      classes: {
        agent: carried,
        skill: carried,
        command: carried,
        rule: { status: "repository-owned", reason: "the plugin manifest has no rules field" },
        hooks: carried,
        mcp: { status: "repository-owned", reason: "server selection stays the repository's" },
      },
      runtime: {
        path: "runtime",
        locator: "runtime/locate.mjs",
        companion: { package: "@zomarit/stamity", compatible: "^1.9.0" },
      },
    },
  };
}

function pluginSetup(root: string): ReturnType<typeof applyPluginSetup> {
  return applyPluginSetup({
    rootDir: root,
    roots: [claudeRoot()],
    engineVersion: ENGINE_VERSION,
    dryRun: false,
    now: T0,
  });
}

async function repositoryInit(root: string): ReturnType<typeof applyInit> {
  const decisions = await buildInitDecisions(root, { tools: ["claude"] });
  return applyInit({
    rootDir: root,
    decisions,
    engineVersion: ENGINE_VERSION,
    dryRun: false,
    force: false,
    now: T0,
  });
}

async function sync(
  root: string,
  opts: { dryRun?: boolean; force?: boolean } = {},
): Promise<{ entries: SyncPlanEntry[]; report: Awaited<ReturnType<typeof applySync>> }> {
  const plan = await planSync(root, ENGINE_VERSION, { runner: () => "" });
  const report = await applySync(root, plan, {
    engineVersion: ENGINE_VERSION,
    force: opts.force ?? false,
    dryRun: opts.dryRun ?? false,
    now: T1,
  });
  return { entries: plan.entries, report };
}

function clean(root: string, args: readonly string[] = []): ReturnType<typeof runInProcess> {
  return runInProcess([cleanCommand], ["clean", "-y", ...args], { cwd: root });
}

async function checkJson(root: string): Promise<{ code: number; drift: { clean: boolean } | null }> {
  const result = await runInProcess([checkCommand], ["check", "--json"], { cwd: root });
  const doc = JSON.parse(result.stdout.trim()) as { drift: { clean: boolean } | null };
  return { code: result.code, drift: doc.drift };
}

const SETTINGS_ABS = (root: string): string => join(root, ".claude", "settings.json");
const BAK_ABS = (root: string): string => join(root, ".claude", "settings.json.bak");

async function readSettings(root: string): Promise<string> {
  return readFile(SETTINGS_ABS(root), "utf8");
}

async function settingsDoc(root: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readSettings(root)) as Record<string, unknown>;
}

/** The edit a client or an operator makes: keys added to the engine's real bytes. */
async function addKeys(root: string, keys: Record<string, unknown>): Promise<void> {
  const doc = { ...(await settingsDoc(root)), ...keys };
  await writeFile(SETTINGS_ABS(root), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

async function seedSettings(root: string, raw: string): Promise<void> {
  await mkdir(join(root, ".claude"), { recursive: true });
  await writeFile(SETTINGS_ABS(root), raw, "utf8");
}

/** The settings row of an apply report, whichever path spelling the verb reports. */
function settingsRow(wrote: readonly MergeResult[]): MergeResult {
  const row = wrote.find((entry) => entry.path.replaceAll("\\", "/").endsWith(CLAUDE_SETTINGS_PATH));
  if (row === undefined) throw new Error(`no settings row in ${JSON.stringify(wrote.map((r) => r.path))}`);
  return row;
}

async function settingsLedgerRows(root: string): Promise<{ contentHash?: string }[]> {
  const manifest = await readManifest(root);
  return (manifest?.ledger ?? []).filter((row) => row.path === CLAUDE_SETTINGS_PATH);
}

async function selectTools(root: string, tools: readonly Tool[]): Promise<void> {
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("fixture lost its manifest");
  await writeManifest(root, { ...manifest, tools: [...tools] }, { now: T1 });
}

/**
 * Records the settings file's current bytes as what the engine last wrote
 * there: the ledger row's hash is re-pointed at them. This is the state in
 * which a difference from the rendering is the rendering having moved, not an
 * edit — the silent path of the backup rule.
 */
async function recordSettingsAsWritten(root: string): Promise<void> {
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("fixture lost its manifest");
  const contentHash = sha256(await readSettings(root));
  const ledger = [];
  for (const entry of manifest.ledger) {
    ledger.push(entry.path === CLAUDE_SETTINGS_PATH ? Object.assign({}, entry, { contentHash }) : entry);
  }
  await writeManifest(root, { ...manifest, ledger }, { now: T1 });
}

/**
 * Records `rows` under `/permissions/allow` on the settings row's entry record,
 * as a release up to 1.12.0 left them after rendering the three allow rows.
 */
async function recordAllowRows(root: string, rows: readonly string[]): Promise<void> {
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("fixture lost its manifest");
  const ledger = manifest.ledger.map((entry) =>
    entry.path === CLAUDE_SETTINGS_PATH
      ? { ...entry, coOwned: { ...entry.coOwned, elements: { ...entry.coOwned?.elements, "/permissions/allow": rows.map(memberHash) } } }
      : entry,
  );
  await writeManifest(root, { ...manifest, ledger }, { now: T1 });
}

async function dropSettingsLedgerRow(root: string): Promise<void> {
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("fixture lost its manifest");
  await writeManifest(
    root,
    { ...manifest, ledger: manifest.ledger.filter((row) => row.path !== CLAUDE_SETTINGS_PATH) },
    { now: T1 },
  );
}

/** The allow rows releases v1.1.0 to 1.12.0 rendered; this engine renders none (inbox row 324). */
const PERMISSIONS = { allow: ["Read", "Grep", "Glob"] };
/** An operator's own hooks: no command under the engine's generated directory. */
const OPERATOR_HOOKS = { Stop: [{ hooks: [{ type: "command", command: "node scripts/notify.mjs" }] }] };

// ── Plugin-backed setup: the client's install write ────────────

describe("plugin-backed setup and the client's project-scope install write", () => {
  // TEST CHANGE, justified (2026-10-08, inbox row 324): the setup appended its `permissions` key
  // after the client's. Under a plugin that carries hooks it renders no member
  // now, so the client's write is the whole file and the bytes do not move.
  it("client key first: setup leaves the client's file byte for byte, ledgers its bytes, and check is clean", async () => {
    const root = await freshRepo();
    await seedSettings(root, CLIENT_SETTINGS);

    const report = await pluginSetup(root);

    // Not skipped: the engine owns entries, not the file, so the client's file is no collision.
    expect(settingsRow(report.wrote).action).toBe("unchanged");
    expect(await readSettings(root)).toBe(CLIENT_SETTINGS);
    // Plugin-owned hooks: no `hooks` key, as before.
    expect(await settingsDoc(root)).not.toHaveProperty("hooks");
    // The ledger records the file's bytes, so the sweep and the drift gate hash the right ones.
    const rows = await settingsLedgerRows(root);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.contentHash).toBe(sha256(await readSettings(root)));

    const drift = await runDriftGate(root, ENGINE_VERSION);
    expect(drift.changes).toEqual([]);
    expect(drift.clean).toBe(true);
    const check = await checkJson(root);
    expect(check.drift?.clean).toBe(true);
    expect(check.code).toBe(0);
  });

  it("setup first, client key appended: check is clean, a dry-run sync plans nothing, a real sync leaves the bytes and takes no backup", async () => {
    const root = await freshRepo();
    await pluginSetup(root);
    await addKeys(root, { enabledPlugins: { "stamity@stamity": true } });
    const before = await readSettings(root);

    const drift = await runDriftGate(root, ENGINE_VERSION);
    expect(drift.changes).toEqual([]);
    expect((await checkJson(root)).code).toBe(0);

    const preview = await sync(root, { dryRun: true });
    expect(preview.entries.filter((entry) => entry.action !== "unchanged")).toEqual([]);
    expect(await readSettings(root)).toBe(before);

    const live = await sync(root);
    expect(settingsRow(live.report.wrote).action).toBe("unchanged");
    expect(await readSettings(root)).toBe(before);
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });

  // TEST CHANGE, justified (2026-10-08, inbox row 324): the case re-pointed the file hash at an
  // older `permissions` rendering and expected the engine's three rows back. No
  // row is rendered now; the engine-side change is the removal of the rows a
  // release before this one recorded, around the client's key.
  it("the allow rows an earlier release recorded leave around the client's key, which survives byte for byte", async () => {
    const root = await freshRepo();
    await seedSettings(root, CLIENT_SETTINGS);
    await pluginSetup(root);
    await addKeys(root, { permissions: PERMISSIONS });
    await recordAllowRows(root, PERMISSIONS.allow);

    const live = await sync(root);

    expect(settingsRow(live.report.wrote).action).toBe("updated");
    expect(settingsRow(live.report.wrote).warning).toBeUndefined();
    expect(await readSettings(root)).toBe(CLIENT_SETTINGS);
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });
});

// ── Repository mode: an operator's own keys ─────────────────────

describe("repository mode and an operator's own keys", () => {
  // TEST CHANGE, justified (2026-10-08, inbox row 324): the title read "beside
  // permissions and hooks"; the engine renders `hooks` alone in repository mode.
  it("keys first, then init: model and enabledPlugins survive beside hooks, and check is clean", async () => {
    const root = await freshRepo();
    await seedSettings(root, `${JSON.stringify({ model: "opus", enabledPlugins: { "x@y": true } }, null, 2)}\n`);

    const report = await repositoryInit(root);

    expect(settingsRow(report.wrote).action).toBe("updated");
    const doc = await settingsDoc(root);
    // TEST CHANGE, justified (2026-10-08, inbox row 324): `permissions` sat between the owner's keys
    // and `hooks`; the engine renders no allow row now.
    expect(Object.keys(doc)).toEqual(["model", "enabledPlugins", "hooks"]);
    expect(doc["model"]).toBe("opus");
    expect(await runDriftGate(root, ENGINE_VERSION)).toMatchObject({ clean: true });
  });

  it("init first, then a key appended: check is clean and sync leaves the file byte for byte", async () => {
    const root = await freshRepo();
    await repositoryInit(root);
    await addKeys(root, { model: "opus" });
    const before = await readSettings(root);

    expect(await runDriftGate(root, ENGINE_VERSION)).toMatchObject({ clean: true, changes: [] });
    const preview = await sync(root, { dryRun: true });
    expect(preview.entries.filter((entry) => entry.action !== "unchanged")).toEqual([]);
    const live = await sync(root);
    expect(settingsRow(live.report.wrote).action).toBe("unchanged");
    expect(await readSettings(root)).toBe(before);
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });

  // TEST CHANGE, justified (2026-10-08, inbox row 324): the owner's row replaced the engine's three
  // and sync put them back beside it. No row is rendered now, so an owner's row
  // is drift to nothing and the file stays as the owner left it.
  it("an owner's allow row added after setup: check reads no drift and sync keeps it, with no .bak", async () => {
    const root = await freshRepo();
    await repositoryInit(root);
    await addKeys(root, { permissions: { allow: ["Bash"] }, model: "opus" });
    const before = await readSettings(root);

    const drift = await runDriftGate(root, ENGINE_VERSION);
    expect(drift.changes).toEqual([]);

    const live = await sync(root);

    expect(settingsRow(live.report.wrote).action).toBe("unchanged");
    expect(await readSettings(root)).toBe(before);
    expect((await settingsDoc(root))["permissions"]).toEqual({ allow: ["Bash"] });
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });

  // TEST CHANGE, justified (2026-10-08, inbox row 324): an older `Read` rendering recorded only by
  // the file hash was regenerated to the three rows. No row is rendered now, and
  // a file hash proves no entry: a `Read` row the entry record does not list is
  // the owner's, equal name or not, and stays.
  it("a Read row the entry record does not list stays, even when the file's bytes match the ledgered hash", async () => {
    const root = await freshRepo();
    await repositoryInit(root);
    await addKeys(root, { permissions: { allow: ["Read"] } });
    await recordSettingsAsWritten(root);

    const live = await sync(root);

    const row = settingsRow(live.report.wrote);
    expect(row.action).toBe("unchanged");
    expect(row.warning).toBeUndefined();
    expect((await settingsDoc(root))["permissions"]).toEqual({ allow: ["Read"] });
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });
});

// ── The hooks key across a mode move ───────────────────────────

describe("the hooks key when the install mode moves under the file", () => {
  it("a repository-mode hooks rendering left behind (manifest lost) is removed by plugin setup and reported, and check is clean", async () => {
    const root = await freshRepo();
    await repositoryInit(root);
    expect(await settingsDoc(root)).toHaveProperty("hooks");
    // The route that leaves the file behind: the state directory is gone, the
    // client file is not. The next setup is plugin-backed, and a hooks object
    // whose scripts nothing writes any more would fail closed on every tool call.
    await rm(join(root, ".stamity"), { recursive: true, force: true });

    const report = await pluginSetup(root);

    const row = settingsRow(report.wrote);
    expect(row.action).toBe("updated");
    expect(row.warning).toContain("Removed the repository-mode hooks");
    expect(row.warning).toContain(".bak");
    // TEST CHANGE, justified (2026-10-08, inbox row 324): expected `{ permissions }` left; the
    // plugin-mode rendering has no member now.
    expect(await settingsDoc(root)).toEqual({});
    // Behind a backup: no predicate can tell the engine's rows from rows of
    // the operator's inside one object, so recognition never skips the .bak.
    expect(JSON.parse(await readFile(BAK_ABS(root), "utf8"))).toHaveProperty("hooks");
    expect(await runDriftGate(root, ENGINE_VERSION)).toMatchObject({ clean: true });
  });

  it("a stale repository-mode hooks rendering under a plugin-backed manifest: sync removes it behind a .bak with the warning, and so does clean", async () => {
    const stale = {
      SessionStart: [{ hooks: [{ type: "command", command: 'node "${CLAUDE_PROJECT_DIR}/.stamity/generated/hooks/claude/stamity-session-start.mjs"' }] }],
    };
    const synced = await freshRepo();
    await pluginSetup(synced);
    await addKeys(synced, { hooks: stale });
    const before = await readSettings(synced);

    const drift = await runDriftGate(synced, ENGINE_VERSION);
    expect(drift.changes.map((entry) => [entry.path, entry.action])).toEqual([[CLAUDE_SETTINGS_PATH, "update"]]);
    const live = await sync(synced);
    const row = settingsRow(live.report.wrote);
    expect(row.action).toBe("updated");
    expect(row.warning).toContain("Removed the repository-mode hooks");
    expect(await readFile(BAK_ABS(synced), "utf8")).toBe(before);
    // TEST CHANGE, justified (2026-10-08, inbox row 324): expected `{ permissions }` left; the
    // plugin-mode rendering has no member now.
    expect(await settingsDoc(synced)).toEqual({});

    // TEST CHANGE, justified: REQ-FLOW-036 — the sweep recognises a stale repository-mode entry
    // and removes it like sync does, behind a verified `.bak` because the
    // ledger never recorded it; it left the entry in place. Nothing else is in
    // the file and the engine created it, so the file goes.
    const cleaned = await freshRepo("cleaned");
    await pluginSetup(cleaned);
    await addKeys(cleaned, { hooks: stale });
    const staleBytes = await readSettings(cleaned);
    expect((await clean(cleaned)).code).toBe(0);
    expect(existsSync(SETTINGS_ABS(cleaned))).toBe(false);
    expect(await readFile(BAK_ABS(cleaned), "utf8")).toBe(staleBytes);
  });

  it("an operator's own hooks in a plugin-mode file is kept by setup, sync and clean, and the plugin-duplicates row reports the second loader", async () => {
    const root = await freshRepo();
    await pluginSetup(root);
    await addKeys(root, { hooks: OPERATOR_HOOKS });
    const before = await readSettings(root);

    expect(await runDriftGate(root, ENGINE_VERSION)).toMatchObject({ clean: true, changes: [] });
    const live = await sync(root);
    expect(settingsRow(live.report.wrote).action).toBe("unchanged");
    expect(await readSettings(root)).toBe(before);

    const check = await runInProcess([checkCommand], ["check", "--json"], { cwd: root });
    const envelope = JSON.parse(check.stdout.trim()) as { doctor: { id: string; status: string; detail: string }[] };
    const duplicates = envelope.doctor.find((entry) => entry.id === "plugin-duplicates");
    expect(duplicates?.status).toBe("fail");
    expect(duplicates?.detail).toContain(`claude: hooks (1 file(s), unmanaged) at ${CLAUDE_SETTINGS_PATH}`);

    const cleaned = await clean(root);
    expect(cleaned.code).toBe(0);
    expect(await settingsDoc(root)).toEqual({ hooks: OPERATOR_HOOKS });
  });

  it("a CRLF file with the client's key reads as clean and keeps its line ending through a sync", async () => {
    const root = await freshRepo();
    await pluginSetup(root);
    await addKeys(root, { enabledPlugins: { "stamity@stamity": true } });
    const crlf = (await readSettings(root)).replaceAll("\n", "\r\n");
    await writeFile(SETTINGS_ABS(root), crlf, "utf8");

    expect(await runDriftGate(root, ENGINE_VERSION)).toMatchObject({ clean: true, changes: [] });
    await sync(root);
    expect(await readSettings(root)).toBe(crlf);
  });
});

// ── Reclaim: clean and the sync sweep ──────────────────────────

describe("clean and the sync reclaim sweep remove only the engine's keys", () => {
  // TEST CHANGE, justified (2026-10-08, inbox row 324): clean stripped the setup's `permissions`
  // (`co-owned-reduced`). The setup wrote no member now, so the file holds
  // none of the engine's entries and is left exactly as it is.
  it("clean on a plugin-backed file keeps the client's install record, with nothing of the engine's to strip", async () => {
    const root = await freshRepo();
    await seedSettings(root, CLIENT_SETTINGS);
    await pluginSetup(root);

    const result = await clean(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`skipped-user-content  ${CLAUDE_SETTINGS_PATH}`);
    expect(await readSettings(root)).toBe(CLIENT_SETTINGS);
  });

  it("clean on a repository-mode file strips permissions and hooks and keeps the operator's key", async () => {
    const root = await freshRepo();
    await repositoryInit(root);
    await addKeys(root, { model: "opus" });
    await sync(root);

    const result = await clean(root);

    expect(result.code).toBe(0);
    expect(await settingsDoc(root)).toEqual({ model: "opus" });
  });

  it("clean removes a file holding only the engine's keys, as before, with no backup while the bytes are the engine's", async () => {
    const root = await freshRepo();
    await repositoryInit(root);

    const result = await clean(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`deleted  ${CLAUDE_SETTINGS_PATH}`);
    expect(existsSync(SETTINGS_ABS(root))).toBe(false);
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });

  it("clean over a repository-mode file with an operator entry beside the engine's hooks keeps the operator's entry, with no .bak", async () => {
    // TEST CHANGE, justified: REQ-FLOW-036 — the reducer removes the engine's recorded entries one by
    // one, so the operator's `Stop` entry stays and the removal is proven: no
    // backup. It deleted the file behind a `.bak` (the reducer stripped keys by
    // name and could not see the operator's row inside one).
    const root = await freshRepo();
    await repositoryInit(root);
    const hooks = (await settingsDoc(root))["hooks"] as Record<string, unknown>;
    await addKeys(root, { hooks: { ...hooks, ...OPERATOR_HOOKS } });

    const result = await clean(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`co-owned-reduced  ${CLAUDE_SETTINGS_PATH}`);
    expect(await settingsDoc(root)).toEqual({ hooks: OPERATOR_HOOKS });
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });

  it("clean over a plugin-backed file with the client's key and a hand-extended permissions keeps the owner's row, with no .bak", async () => {
    const root = await freshRepo();
    await seedSettings(root, CLIENT_SETTINGS);
    await pluginSetup(root);
    await addKeys(root, { permissions: { allow: [...PERMISSIONS.allow, "Bash"] } });
    // TEST CHANGE, justified (2026-10-08, inbox row 324): the setup recorded the three rows itself;
    // it renders none now, so the record an earlier release left is written here.
    await recordAllowRows(root, PERMISSIONS.allow);

    const result = await clean(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`co-owned-reduced  ${CLAUDE_SETTINGS_PATH}`);
    // TEST CHANGE, justified: REQ-FLOW-036 — the owner's `Bash` row is theirs and stays; the engine's
    // three recorded rows leave proven, so no `.bak`. It stripped the whole
    // `permissions` key behind a backup.
    expect(await settingsDoc(root)).toEqual({ enabledPlugins: { "stamity@stamity": true }, permissions: { allow: ["Bash"] } });
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });

  it("a key another writer merged in after a repository-mode setup: clean leaves exactly that key, reads co-owned-reduced, and takes no .bak", async () => {
    const root = await freshRepo();
    await repositoryInit(root);
    await addKeys(root, { enabledPlugins: { "other@othermkt": true } });

    const result = await clean(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`co-owned-reduced  ${CLAUDE_SETTINGS_PATH}`);
    expect(await readSettings(root)).toBe('{\n  "enabledPlugins": {\n    "other@othermkt": true\n  }\n}\n');
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });

  it("the same after a plugin-backed setup", async () => {
    const root = await freshRepo();
    await pluginSetup(root);
    await addKeys(root, { enabledPlugins: { "other@othermkt": true } });

    const result = await clean(root);

    expect(result.code).toBe(0);
    // TEST CHANGE, justified (2026-10-08, inbox row 324): read `co-owned-reduced`; the plugin-mode
    // setup wrote no member, so nothing of the engine's is left to reduce.
    expect(result.stdout).toContain(`skipped-user-content  ${CLAUDE_SETTINGS_PATH}`);
    expect(await readSettings(root)).toBe('{\n  "enabledPlugins": {\n    "other@othermkt": true\n  }\n}\n');
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });

  // review/57: a plugin-backed setup with no file before it creates `{}`, and
  // REQ-FLOW-036's round trip removes a file the engine created.
  it("clean removes the empty file a plugin-backed setup created, with no backup while the bytes are the engine's", async () => {
    const root = await freshRepo();
    await pluginSetup(root);
    expect(await settingsDoc(root)).toEqual({});

    const result = await clean(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`deleted  ${CLAUDE_SETTINGS_PATH}`);
    expect(existsSync(SETTINGS_ABS(root))).toBe(false);
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });

  it("the sync sweep (claude deselected) reduces the file the same way", async () => {
    const root = await freshRepo();
    await repositoryInit(root);
    await addKeys(root, { model: "opus" });
    await sync(root);

    await selectTools(root, ["cursor"]);
    const { report } = await sync(root);

    const entry = report.reclaimed?.entries.find((row) => row.path === CLAUDE_SETTINGS_PATH);
    expect(entry?.action).toBe("co-owned-reduced");
    expect(await settingsDoc(root)).toEqual({ model: "opus" });
  });

  it("a dry-run clean previews the reduction and writes nothing", async () => {
    const root = await freshRepo();
    await seedSettings(root, CLIENT_SETTINGS);
    await pluginSetup(root);
    // TEST CHANGE, justified (2026-10-08, inbox row 324): the setup's own rows were the content to
    // reduce; it writes none now, so the rows an earlier release recorded are.
    await addKeys(root, { permissions: PERMISSIONS });
    await recordAllowRows(root, PERMISSIONS.allow);
    const before = await readSettings(root);

    const result = await clean(root, ["--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("remove the engine's own content from this path and keep the rest");
    expect(await readSettings(root)).toBe(before);
  });
});

// ── The collisions the lane keeps ──────────────────────────────

describe("collisions the lane keeps", () => {
  const UNPARSEABLE = "{ not json\n";

  it("an unparseable file: setup skips it naming the parse failure, check reports a collision, and the bytes are untouched", async () => {
    const root = await freshRepo();
    await seedSettings(root, UNPARSEABLE);

    const report = await pluginSetup(root);

    const row = settingsRow(report.wrote);
    expect(row.action).toBe("skipped");
    expect(row.warning).toMatch(/not valid JSON/);
    expect(await settingsLedgerRows(root)).toEqual([]);
    expect(await readSettings(root)).toBe(UNPARSEABLE);

    const drift = await runDriftGate(root, ENGINE_VERSION);
    expect(drift.changes.map((entry) => [entry.path, entry.action])).toEqual([[CLAUDE_SETTINGS_PATH, "collision"]]);
    expect((await checkJson(root)).code).toBe(1);
  });

  it("an unparseable file under sync --force: refused, never attempted, and the bytes are untouched", async () => {
    const root = await freshRepo();
    await seedSettings(root, UNPARSEABLE);
    await pluginSetup(root);

    const { entries, report } = await sync(root, { force: true });

    // TEST CHANGE, justified: REQ-FLOW-036 — `--force` no longer replaces an unparseable settings
    // file: it is a `co-owned-shape` collision, refused forced or not. It was
    // backed up and replaced whole.
    expect(entries.find((entry) => entry.path === CLAUDE_SETTINGS_PATH)?.collisionKind).toBe("co-owned-shape");
    expect(settingsRow(report.wrote).action).toBe("skipped");
    expect(report.refused).toContain(CLAUDE_SETTINGS_PATH);
    expect(await readSettings(root)).toBe(UNPARSEABLE);
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });

  it("a hand-written permissions key with no ledger row: setup keeps the owner's rows and adds none, and check is clean", async () => {
    const root = await freshRepo();
    const handWritten = `${JSON.stringify({ permissions: { allow: ["Bash"] }, model: "opus" }, null, 2)}\n`;
    await seedSettings(root, handWritten);

    const report = await pluginSetup(root);

    // TEST CHANGE, justified: REQ-FLOW-036 — an owner's `permissions` is merged, never a collision;
    // it skipped the file and `check` reported an `unmanaged-name` collision.
    // TEST CHANGE, justified (2026-10-08, inbox row 324): the merge added the engine's three rows
    // beside the owner's (`updated`); it renders none now, so the bytes stay.
    const row = settingsRow(report.wrote);
    expect(row.action).toBe("unchanged");
    expect(await readSettings(root)).toBe(handWritten);
    expect(await settingsLedgerRows(root)).toHaveLength(1);
    expect(await runDriftGate(root, ENGINE_VERSION)).toMatchObject({ clean: true, changes: [] });
  });

  it("sync --force after that setup changes nothing: no force replacement exists, and the owner's row stays with no .bak", async () => {
    const root = await freshRepo();
    const handWritten = `${JSON.stringify({ permissions: { allow: ["Bash"] }, model: "opus" }, null, 2)}\n`;
    await seedSettings(root, handWritten);
    await pluginSetup(root);
    const merged = await readSettings(root);

    const { report } = await sync(root, { force: true });

    // TEST CHANGE, justified: REQ-FLOW-036 — `--force` does not reach the settings lane; it replaced
    // the engine's keys behind a `.bak`.
    expect(settingsRow(report.wrote).action).toBe("unchanged");
    expect(await readSettings(root)).toBe(merged);
    expect(existsSync(BAK_ABS(root))).toBe(false);
    expect(await settingsLedgerRows(root)).toHaveLength(1);
  });

  // Since 2026-10-08 (inbox row 324) the three rows are no longer the rendering:
  // with no ledger row they read as the owner's, and the file is still no collision.
  // Retitled 2026-10-08 (build/32): it called the three rows the rendering, which no longer carries them.
  it("a hand-written permissions key holding the rows earlier releases rendered is kept as the owner's, with no collision", async () => {
    const root = await freshRepo();
    await seedSettings(root, `${JSON.stringify({ permissions: PERMISSIONS, model: "opus" }, null, 2)}\n`);

    const report = await pluginSetup(root);

    expect(settingsRow(report.wrote).action).toBe("unchanged");
    expect(await settingsLedgerRows(root)).toHaveLength(1);
    expect(await runDriftGate(root, ENGINE_VERSION)).toMatchObject({ clean: true });
  });

  it("without a ledger row an owner's allow row reads as a merge the engine keeps, not a collision", async () => {
    const root = await freshRepo();
    await repositoryInit(root);
    await addKeys(root, { permissions: { allow: ["Bash"] } });
    await dropSettingsLedgerRow(root);

    const drift = await runDriftGate(root, ENGINE_VERSION);

    // TEST CHANGE, justified: REQ-FLOW-036 — the merge adopts the file and adds the engine's rows beside
    // the owner's, so the plan reads `update`; it read `collision`.
    // TEST CHANGE, justified (2026-10-08, inbox row 324): the merge has no row to add now and the
    // engine's hook entries are already in place, so the plan reads no change.
    expect(drift.changes.map((entry) => [entry.path, entry.action])).toEqual([]);
  });
});
