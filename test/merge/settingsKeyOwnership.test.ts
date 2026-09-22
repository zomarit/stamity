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
 * exactly the top-level keys it renders — `permissions`, and `hooks` when the
 * repository owns hooks — and nothing else.
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

async function dropSettingsLedgerRow(root: string): Promise<void> {
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("fixture lost its manifest");
  await writeManifest(
    root,
    { ...manifest, ledger: manifest.ledger.filter((row) => row.path !== CLAUDE_SETTINGS_PATH) },
    { now: T1 },
  );
}

const PERMISSIONS = { allow: ["Read", "Grep", "Glob"] };
/** An operator's own hooks: no command under the engine's generated directory. */
const OPERATOR_HOOKS = { Stop: [{ hooks: [{ type: "command", command: "node scripts/notify.mjs" }] }] };

// ── Plugin-backed setup: the client's install write ────────────

describe("plugin-backed setup and the client's project-scope install write", () => {
  it("client key first: setup keeps enabledPlugins beside its permissions, counts the file as written, ledgers the merged bytes, and check is clean", async () => {
    const root = await freshRepo();
    await seedSettings(root, CLIENT_SETTINGS);

    const report = await pluginSetup(root);

    // Written, not skipped: the engine owns the `permissions` key, not the file.
    expect(settingsRow(report.wrote).action).toBe("updated");
    const doc = await settingsDoc(root);
    expect(doc).toEqual({ enabledPlugins: { "stamity@stamity": true }, permissions: PERMISSIONS });
    // The client's key keeps its position; the engine's is appended after it.
    expect(Object.keys(doc)).toEqual(["enabledPlugins", "permissions"]);
    // Plugin-owned hooks: no `hooks` key, as before.
    expect(doc).not.toHaveProperty("hooks");
    // The ledger records what was WRITTEN — the merged document — so the sweep
    // and the drift gate hash the right bytes.
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

  it("a later engine-side change is written around the client's key, and the key survives byte for byte", async () => {
    const root = await freshRepo();
    await pluginSetup(root);
    await addKeys(root, { enabledPlugins: { "stamity@stamity": true } });
    // An engine-side change: the on-disk permissions key is an older rendering
    // — recorded as what the engine last wrote, so the difference is the
    // rendering having moved, not an edit. Only that key may move, silently.
    await addKeys(root, { permissions: { allow: ["Read"] } });
    await recordSettingsAsWritten(root);

    const live = await sync(root);

    expect(settingsRow(live.report.wrote).action).toBe("updated");
    expect(await settingsDoc(root)).toEqual({
      permissions: PERMISSIONS,
      enabledPlugins: { "stamity@stamity": true },
    });
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });
});

// ── Repository mode: an operator's own keys ─────────────────────

describe("repository mode and an operator's own keys", () => {
  it("keys first, then init: model and enabledPlugins survive beside permissions and hooks, and check is clean", async () => {
    const root = await freshRepo();
    await seedSettings(root, `${JSON.stringify({ model: "opus", enabledPlugins: { "x@y": true } }, null, 2)}\n`);

    const report = await repositoryInit(root);

    expect(settingsRow(report.wrote).action).toBe("updated");
    const doc = await settingsDoc(root);
    expect(Object.keys(doc)).toEqual(["model", "enabledPlugins", "permissions", "hooks"]);
    expect(doc["model"]).toBe("opus");
    expect(doc["permissions"]).toEqual(PERMISSIONS);
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

  it("a hand-edit inside an engine-owned key of a ledgered file is replaced on sync behind a verified .bak, with a warning naming the key and the per-user file", async () => {
    const root = await freshRepo();
    await repositoryInit(root);
    await addKeys(root, { permissions: { allow: ["Bash"] }, model: "opus" });
    const edited = await readSettings(root);

    const drift = await runDriftGate(root, ENGINE_VERSION);
    expect(drift.changes.map((entry) => [entry.path, entry.action])).toEqual([[CLAUDE_SETTINGS_PATH, "update"]]);

    const live = await sync(root);

    const row = settingsRow(live.report.wrote);
    expect(row.action).toBe("updated");
    expect(row.warning).toContain("permissions");
    expect(row.warning).toContain(".claude/settings.local.json");
    expect(row.warning).toContain(".bak");
    const doc = await settingsDoc(root);
    expect(doc["permissions"]).toEqual(PERMISSIONS);
    expect(doc["model"]).toBe("opus");
    expect(await readFile(BAK_ABS(root), "utf8")).toBe(edited);
  });

  it("an engine key that moved while the bytes still match a ledgered hash is regenerated silently — the rendering moved, nobody edited", async () => {
    const root = await freshRepo();
    await repositoryInit(root);
    // An older rendering of the engine's own key, recorded as what the engine
    // last wrote: the ledger row's hash is re-pointed at these bytes.
    await addKeys(root, { permissions: { allow: ["Read"] } });
    await recordSettingsAsWritten(root);

    const live = await sync(root);

    const row = settingsRow(live.report.wrote);
    expect(row.action).toBe("updated");
    expect(row.warning).toBeUndefined();
    expect((await settingsDoc(root))["permissions"]).toEqual(PERMISSIONS);
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
    expect(await settingsDoc(root)).toEqual({ permissions: PERMISSIONS });
    // Behind a backup: no predicate can tell the engine's rows from rows of
    // the operator's inside one object, so recognition never skips the .bak.
    expect(JSON.parse(await readFile(BAK_ABS(root), "utf8"))).toHaveProperty("hooks");
    expect(await runDriftGate(root, ENGINE_VERSION)).toMatchObject({ clean: true });
  });

  it("a stale repository-mode hooks rendering under a plugin-backed manifest: sync removes it behind a .bak with the warning, clean leaves it in place", async () => {
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
    expect(await settingsDoc(synced)).toEqual({ permissions: PERMISSIONS });

    // The clean lane strips only the mode's keys — the stale rendering is
    // sync's to remove (behind the backup above) and the duplicates row's to name.
    const cleaned = await freshRepo("cleaned");
    await pluginSetup(cleaned);
    await addKeys(cleaned, { hooks: stale });
    expect((await clean(cleaned)).code).toBe(0);
    expect(await settingsDoc(cleaned)).toEqual({ hooks: stale });
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
  it("clean on a plugin-backed file keeps the client's install record and strips permissions", async () => {
    const root = await freshRepo();
    await seedSettings(root, CLIENT_SETTINGS);
    await pluginSetup(root);

    const result = await clean(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`co-owned-reduced  ${CLAUDE_SETTINGS_PATH}`);
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

  it("clean over a repository-mode file with an operator row inside the engine's hooks backs the file up first and names the .bak", async () => {
    // The reducer strips by key name and cannot see a row inside the key; the
    // bytes no longer hashing to what the ledger recorded is what says the
    // file may carry rows of the operator's, and that earns the backup.
    const root = await freshRepo();
    await repositoryInit(root);
    const hooks = (await settingsDoc(root))["hooks"] as Record<string, unknown>;
    await addKeys(root, { hooks: { ...hooks, ...OPERATOR_HOOKS } });
    const before = await readSettings(root);

    const result = await clean(root);

    expect(result.code).toBe(0);
    // The entry names the backup the way the engine spells a file it wrote: the
    // resolved NATIVE path (backslashes on Windows), never a POSIX substring.
    expect(result.stdout).toContain(BAK_ABS(root));
    expect(existsSync(SETTINGS_ABS(root))).toBe(false);
    expect(await readFile(BAK_ABS(root), "utf8")).toBe(before);
  });

  it("clean over a plugin-backed file with the client's key and a hand-extended permissions reduces it behind a .bak", async () => {
    const root = await freshRepo();
    await seedSettings(root, CLIENT_SETTINGS);
    await pluginSetup(root);
    await addKeys(root, { permissions: { allow: [...PERMISSIONS.allow, "Bash"] } });
    const before = await readSettings(root);

    const result = await clean(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`co-owned-reduced  ${CLAUDE_SETTINGS_PATH}`);
    // The entry names the backup the way the engine spells a file it wrote: the
    // resolved NATIVE path (backslashes on Windows), never a POSIX substring.
    expect(result.stdout).toContain(BAK_ABS(root));
    expect(await readSettings(root)).toBe(CLIENT_SETTINGS);
    expect(await readFile(BAK_ABS(root), "utf8")).toBe(before);
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

  it("an unparseable file under sync --force: backed up, then the rendering is written", async () => {
    const root = await freshRepo();
    await seedSettings(root, UNPARSEABLE);
    await pluginSetup(root);

    const { report } = await sync(root, { force: true });

    expect(settingsRow(report.wrote).action).toBe("updated");
    expect(await readFile(BAK_ABS(root), "utf8")).toBe(UNPARSEABLE);
    expect(await settingsDoc(root)).toEqual({ permissions: PERMISSIONS });
  });

  it("a hand-written permissions key with no ledger row: setup skips it naming the key, check reports a collision", async () => {
    const root = await freshRepo();
    await seedSettings(root, `${JSON.stringify({ permissions: { allow: ["Bash"] }, model: "opus" }, null, 2)}\n`);

    const report = await pluginSetup(root);

    const row = settingsRow(report.wrote);
    expect(row.action).toBe("skipped");
    expect(row.warning).toContain("permissions");
    expect(await settingsDoc(root)).toEqual({ permissions: { allow: ["Bash"] }, model: "opus" });

    const drift = await runDriftGate(root, ENGINE_VERSION);
    expect(drift.changes).toMatchObject([{ path: CLAUDE_SETTINGS_PATH, action: "collision", collisionKind: "unmanaged-name" }]);
    expect(drift.changes[0]?.detail).toContain("permissions");
  });

  it("sync --force over that collision replaces the engine's keys behind a .bak and keeps the operator's", async () => {
    const root = await freshRepo();
    const handWritten = `${JSON.stringify({ permissions: { allow: ["Bash"] }, model: "opus" }, null, 2)}\n`;
    await seedSettings(root, handWritten);
    await pluginSetup(root);

    const { report } = await sync(root, { force: true });

    const row = settingsRow(report.wrote);
    expect(row.action).toBe("updated");
    expect(row.warning).toContain(".bak");
    expect(await readFile(BAK_ABS(root), "utf8")).toBe(handWritten);
    expect(await settingsDoc(root)).toEqual({ permissions: PERMISSIONS, model: "opus" });
    expect(await settingsLedgerRows(root)).toHaveLength(1);
  });

  it("a hand-written engine key that already equals the rendering is adopted without a collision", async () => {
    const root = await freshRepo();
    await seedSettings(root, `${JSON.stringify({ permissions: PERMISSIONS, model: "opus" }, null, 2)}\n`);

    const report = await pluginSetup(root);

    expect(settingsRow(report.wrote).action).toBe("unchanged");
    expect(await settingsLedgerRows(root)).toHaveLength(1);
    expect(await runDriftGate(root, ENGINE_VERSION)).toMatchObject({ clean: true });
  });

  it("the ledger row is what licenses replacing an engine key: without it, check reports the collision rather than drift", async () => {
    const root = await freshRepo();
    await repositoryInit(root);
    await addKeys(root, { permissions: { allow: ["Bash"] } });
    await dropSettingsLedgerRow(root);

    const drift = await runDriftGate(root, ENGINE_VERSION);

    expect(drift.changes.map((entry) => [entry.path, entry.action])).toEqual([[CLAUDE_SETTINGS_PATH, "collision"]]);
  });
});
