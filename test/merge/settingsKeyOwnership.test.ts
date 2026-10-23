import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLAUDE_SETTINGS_PATH } from "../../src/adapters/claude.ts";
import { checkCommand, runDriftGate } from "../../src/cli/commands/check.ts";
import { cleanCommand } from "../../src/cli/commands/clean.ts";
import { resolveAutonomy } from "../../src/config/autonomy.ts";
import { CLAUDE_DENY_ROWS, claudeAskRows } from "../../src/hooks/personOnly.ts";
import { applyInit } from "../../src/cli/commands/init/apply.ts";
import { buildInitDecisions } from "../../src/cli/commands/init/plan.ts";
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
 * the hook entries it renders, and the allow rows a release before this one
 * rendered until they leave — nothing else.
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
 *
 * TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d6-verb): 1.15.0
 * deleted the plugin route, its `plugin setup` verb and the plugin-backed mode.
 * A user who installed the plugin before then still has the client's
 * `enabledPlugins` key in this file, so the co-owned cases that set up through
 * `plugin setup` now set up through `init` (repository mode), each marked
 * below, and keep their subject: the client's key, the owner's rows, the
 * unparseable file. The cases whose subject was the plugin-backed mode itself
 * (a mode move under the file, the empty file a plugin setup created, the
 * plugin-mode `plugin-duplicates` reading) left with the mode.
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

/**
 * An owner's rows added inside the engine's `permissions` member, so the deny rows the engine
 * wrote stay where they are; `keys` are added beside, as {@link addKeys} adds them.
 */
async function addPermissionRows(root: string, members: Record<string, unknown>, keys: Record<string, unknown> = {}): Promise<void> {
  const permissions = (await settingsDoc(root))["permissions"] as Record<string, unknown>;
  await addKeys(root, { permissions: { ...permissions, ...members }, ...keys });
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
/**
 * The `permissions` member `clean` and the sync sweep leave: every deny row stays, as one equal to
 * the engine's may be the owner's (review/124, signed off 00:14Z).
 *
 * TEST CHANGE (v0a2, REQ-FLOW-123, REQ-FLOW-124): the person-only rows are split, the refused acts in
 * `deny` and the acts that can be undone in `ask`; clean removes no row of either list, so both stay, `ask`
 * after `deny` as the engine writes them. Every expectation below reads this constant.
 * TEST CHANGE, justified (a4b-claude-rows, REQ-FLOW-123): the ask rows are the ones the default autonomy setting
 * renders (no ready-mark or local-tag row, the land rows added), since no repository here carries a setting.
 */
const DENY_LEFT = { deny: [...CLAUDE_DENY_ROWS], ask: [...claudeAskRows(resolveAutonomy({}).runs)] };
/** An operator's own hooks: no command under the engine's generated directory. */
const OPERATOR_HOOKS = { Stop: [{ hooks: [{ type: "command", command: "node scripts/notify.mjs" }] }] };

// ── The client's install write ─────────────────────────────────

// TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d6-verb): this group set up through
// `plugin setup`, which 1.15.0 deleted; it sets up through `init` now, so the engine's `hooks`
// member sits beside the client's key where the plugin-mode rendering had none, and the CRLF
// case moved in from the deleted mode-move group. The subject is unchanged: the client's
// `enabledPlugins` key survives every verb, byte for byte.
describe("the client's project-scope install write beside the engine's rendering", () => {
  // TEST CHANGE, justified (review/124, signed off 00:14Z): retitled and its key list grew `permissions`,
  // the engine's deny rows (u20); it read "the key survives beside hooks".
  it("client key first, then init: the key survives beside the deny rows and hooks, the ledger holds the file's bytes, and check is clean", async () => {
    const root = await freshRepo();
    await seedSettings(root, CLIENT_SETTINGS);

    const report = await repositoryInit(root);

    // Not skipped: the engine owns entries, not the file, so the client's file is no collision.
    expect(settingsRow(report.wrote).action).toBe("updated");
    const doc = await settingsDoc(root);
    expect(Object.keys(doc)).toEqual(["enabledPlugins", "permissions", "hooks"]);
    expect(doc["enabledPlugins"]).toEqual({ "stamity@stamity": true });
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

  it("init first, client key appended: check is clean, a dry-run sync plans nothing, a real sync leaves the bytes and takes no backup", async () => {
    const root = await freshRepo();
    await repositoryInit(root);
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

  it("the allow rows an earlier release recorded leave around the client's key, which survives byte for byte", async () => {
    const root = await freshRepo();
    await seedSettings(root, CLIENT_SETTINGS);
    await repositoryInit(root);
    const rendered = await readSettings(root);
    await addKeys(root, { permissions: PERMISSIONS });
    await recordAllowRows(root, PERMISSIONS.allow);

    const live = await sync(root);

    expect(settingsRow(live.report.wrote).action).toBe("updated");
    expect(settingsRow(live.report.wrote).warning).toBeUndefined();
    expect(await readSettings(root)).toBe(rendered);
    expect((await settingsDoc(root))["enabledPlugins"]).toEqual({ "stamity@stamity": true });
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });

  it("a CRLF file with the client's key reads as clean and keeps its line ending through a sync", async () => {
    const root = await freshRepo();
    await repositoryInit(root);
    await addKeys(root, { enabledPlugins: { "stamity@stamity": true } });
    const crlf = (await readSettings(root)).replaceAll("\n", "\r\n");
    await writeFile(SETTINGS_ABS(root), crlf, "utf8");

    expect(await runDriftGate(root, ENGINE_VERSION)).toMatchObject({ clean: true, changes: [] });
    await sync(root);
    expect(await readSettings(root)).toBe(crlf);
  });
});

// ── Repository mode: an operator's own keys ─────────────────────

describe("repository mode and an operator's own keys", () => {
  // TEST CHANGE, justified (2026-10-08, inbox row 324): the title read "beside
  // permissions and hooks"; the engine renders `hooks` alone in repository mode.
  // TEST CHANGE, justified (review/124, signed off 00:14Z): retitled; it read "beside hooks", and init
  // now renders the engine's deny rows in `permissions` beside them (u20).
  it("keys first, then init: model and enabledPlugins survive beside the deny rows and hooks, and check is clean", async () => {
    const root = await freshRepo();
    await seedSettings(root, `${JSON.stringify({ model: "opus", enabledPlugins: { "x@y": true } }, null, 2)}\n`);

    const report = await repositoryInit(root);

    expect(settingsRow(report.wrote).action).toBe("updated");
    const doc = await settingsDoc(root);
    // TEST CHANGE, justified (2026-10-08, inbox row 324): `permissions` sat between the owner's keys
    // and `hooks`; the engine renders no allow row now.
    // TEST CHANGE, justified (review/124, signed off 00:14Z): `permissions` holds the engine's deny rows now (u20).
    expect(Object.keys(doc)).toEqual(["model", "enabledPlugins", "permissions", "hooks"]);
    expect(doc["permissions"]).toEqual(DENY_LEFT);
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
    // TEST CHANGE, justified (review/124, signed off 00:14Z): the owner's row goes in beside the engine's
    // deny rows (u20); replacing the member whole would delete them, which sync rightly puts back.
    await addPermissionRows(root, { allow: ["Bash"] }, { model: "opus" });
    const before = await readSettings(root);

    const drift = await runDriftGate(root, ENGINE_VERSION);
    expect(drift.changes).toEqual([]);

    const live = await sync(root);

    expect(settingsRow(live.report.wrote).action).toBe("unchanged");
    expect(await readSettings(root)).toBe(before);
    // TEST CHANGE, justified (review/124, signed off 00:14Z): the deny rows stay beside the owner's row.
    expect((await settingsDoc(root))["permissions"]).toEqual({ ...DENY_LEFT, allow: ["Bash"] });
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });

  // TEST CHANGE, justified (2026-10-08, inbox row 324): an older `Read` rendering recorded only by
  // the file hash was regenerated to the three rows. No row is rendered now, and
  // a file hash proves no entry: a `Read` row the entry record does not list is
  // the owner's, equal name or not, and stays.
  it("a Read row the entry record does not list stays, even when the file's bytes match the ledgered hash", async () => {
    const root = await freshRepo();
    await repositoryInit(root);
    // TEST CHANGE, justified (review/124, signed off 00:14Z): the row goes in beside the engine's deny rows (u20).
    await addPermissionRows(root, { allow: ["Read"] });
    await recordSettingsAsWritten(root);

    const live = await sync(root);

    const row = settingsRow(live.report.wrote);
    expect(row.action).toBe("unchanged");
    expect(row.warning).toBeUndefined();
    // TEST CHANGE, justified (review/124, signed off 00:14Z): the deny rows stay beside it.
    expect((await settingsDoc(root))["permissions"]).toEqual({ ...DENY_LEFT, allow: ["Read"] });
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });
});

// ── Reclaim: clean and the sync sweep ──────────────────────────

describe("clean and the sync reclaim sweep remove only the engine's keys", () => {
  // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d6-verb): set up through `plugin
  // setup`, which rendered no member, so clean found nothing to strip (`skipped-user-content`).
  // The plugin verb left in 1.15.0; set up through `init`, clean strips the engine's hooks and
  // leaves the client's install record exactly as the client wrote it.
  it("clean on a file the client wrote first keeps the client's install record byte for byte, with no .bak", async () => {
    const root = await freshRepo();
    await seedSettings(root, CLIENT_SETTINGS);
    await repositoryInit(root);

    const result = await clean(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`co-owned-reduced  ${CLAUDE_SETTINGS_PATH}`);
    // TEST CHANGE, justified (review/124, signed off 00:14Z): the engine's deny rows stay
    // beside the client's record, which keeps its bytes; the file was the client's bytes alone.
    expect(await readSettings(root)).toBe(
      `${JSON.stringify({ enabledPlugins: { "stamity@stamity": true }, permissions: DENY_LEFT }, null, 2)}\n`,
    );
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });

  // TEST CHANGE, justified (review/124, signed off 00:14Z): retitled; it read "strips permissions and hooks".
  it("clean on a repository-mode file strips the hooks and keeps the deny rows and the operator's key", async () => {
    const root = await freshRepo();
    await repositoryInit(root);
    await addKeys(root, { model: "opus" });
    await sync(root);

    const result = await clean(root);

    expect(result.code).toBe(0);
    // TEST CHANGE, justified (review/124, signed off 00:14Z): the hooks leave and the
    // deny rows stay; it left `{ model }` alone.
    expect(await settingsDoc(root)).toEqual({ model: "opus", permissions: DENY_LEFT });
  });

  // TEST CHANGE, justified (review/124, signed off 00:14Z): clean removes no deny row,
  // so a file holding only the engine's keys keeps its deny rows (`co-owned-reduced`); it was deleted.
  it("clean over a file holding only the engine's keys keeps its deny rows, reads co-owned-reduced, and takes no backup", async () => {
    const root = await freshRepo();
    await repositoryInit(root);

    const result = await clean(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`co-owned-reduced  ${CLAUDE_SETTINGS_PATH}`);
    expect(await settingsDoc(root)).toEqual({ permissions: DENY_LEFT });
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
    // TEST CHANGE, justified (review/124, signed off 00:14Z): the deny rows stay beside
    // the operator's entry; it left `{ hooks }` alone.
    expect(await settingsDoc(root)).toEqual({ permissions: DENY_LEFT, hooks: OPERATOR_HOOKS });
    expect(existsSync(BAK_ABS(root))).toBe(false);
  });

  // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d6-verb): set up through `plugin
  // setup`, which 1.15.0 deleted; `init` now, whose hooks clean strips beside the three rows.
  it("clean over a file with the client's key and a hand-extended permissions keeps the owner's row, with no .bak", async () => {
    const root = await freshRepo();
    await seedSettings(root, CLIENT_SETTINGS);
    await repositoryInit(root);
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
    // TEST CHANGE, justified (review/124, signed off 00:14Z): the deny rows stay in their
    // place before the other writer's key; it left that key alone.
    expect(await readSettings(root)).toBe(
      `${JSON.stringify({ permissions: DENY_LEFT, enabledPlugins: { "other@othermkt": true } }, null, 2)}\n`,
    );
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
    // TEST CHANGE, justified (review/124, signed off 00:14Z): the sweep runs clean's
    // reducer, so the deny rows stay; it left `{ model }` alone.
    expect(await settingsDoc(root)).toEqual({ model: "opus", permissions: DENY_LEFT });
  });

  // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d6-verb): set up through `plugin
  // setup`, which 1.15.0 deleted; `init` now. The preview and the untouched bytes are the subject.
  it("a dry-run clean previews the reduction and writes nothing", async () => {
    const root = await freshRepo();
    await seedSettings(root, CLIENT_SETTINGS);
    await repositoryInit(root);
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

// TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d6-verb): the cases below set up
// through `plugin setup`, which 1.15.0 deleted; they set up through `init` now, each marked.
// Where the engine's `hooks` member is added beside the owner's keys, the setup reads
// `updated` where the plugin-mode rendering, which had no member, read `unchanged`.
describe("collisions the lane keeps", () => {
  const UNPARSEABLE = "{ not json\n";

  it("an unparseable file: setup skips it naming the parse failure, check reports a collision, and the bytes are untouched", async () => {
    const root = await freshRepo();
    await seedSettings(root, UNPARSEABLE);

    const report = await repositoryInit(root); // TEST CHANGE: was `plugin setup` (d6-verb)

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
    await repositoryInit(root); // TEST CHANGE: was `plugin setup` (d6-verb)

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

  // TEST CHANGE, justified (review/124, signed off 00:14Z): retitled; it read "adds none". init appends the
  // engine's deny rows the owner's member lacks (u20), and still adds no allow row.
  it("a hand-written permissions key with no ledger row: setup keeps the owner's rows, adds no allow row, and check is clean", async () => {
    const root = await freshRepo();
    const handWritten = `${JSON.stringify({ permissions: { allow: ["Bash"] }, model: "opus" }, null, 2)}\n`;
    await seedSettings(root, handWritten);

    const report = await repositoryInit(root); // TEST CHANGE: was `plugin setup` (d6-verb)

    // TEST CHANGE, justified: REQ-FLOW-036 — an owner's `permissions` is merged, never a collision;
    // it skipped the file and `check` reported an `unmanaged-name` collision.
    // TEST CHANGE, justified (2026-10-08, inbox row 324): the merge added the engine's three rows
    // beside the owner's (`updated`); it renders none now, so the bytes stay.
    // TEST CHANGE, justified (2026-10-14, d6-verb): `init` adds its `hooks` member (`updated`);
    // the owner's keys stay as written, and no allow row is added.
    const row = settingsRow(report.wrote);
    expect(row.action).toBe("updated");
    const doc = await settingsDoc(root);
    expect(Object.keys(doc)).toEqual(["permissions", "model", "hooks"]);
    // TEST CHANGE, justified (review/124, signed off 00:14Z): the engine's deny rows follow the owner's row.
    expect(doc["permissions"]).toEqual({ allow: ["Bash"], ...DENY_LEFT });
    expect(doc["model"]).toBe("opus");
    expect(await settingsLedgerRows(root)).toHaveLength(1);
    expect(await runDriftGate(root, ENGINE_VERSION)).toMatchObject({ clean: true, changes: [] });
  });

  it("sync --force after that setup changes nothing: no force replacement exists, and the owner's row stays with no .bak", async () => {
    const root = await freshRepo();
    const handWritten = `${JSON.stringify({ permissions: { allow: ["Bash"] }, model: "opus" }, null, 2)}\n`;
    await seedSettings(root, handWritten);
    await repositoryInit(root); // TEST CHANGE: was `plugin setup` (d6-verb)
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

    const report = await repositoryInit(root); // TEST CHANGE: was `plugin setup` (d6-verb)

    // TEST CHANGE, justified (2026-10-14, d6-verb): `init` adds its `hooks` member (`updated`);
    // the three rows stay the owner's, untouched.
    expect(settingsRow(report.wrote).action).toBe("updated");
    // TEST CHANGE, justified (review/124, signed off 00:14Z): the engine's deny rows follow the owner's three (u20).
    expect((await settingsDoc(root))["permissions"]).toEqual({ ...PERMISSIONS, ...DENY_LEFT });
    expect(await settingsLedgerRows(root)).toHaveLength(1);
    expect(await runDriftGate(root, ENGINE_VERSION)).toMatchObject({ clean: true });
  });

  it("without a ledger row an owner's allow row reads as a merge the engine keeps, not a collision", async () => {
    const root = await freshRepo();
    await repositoryInit(root);
    // TEST CHANGE, justified (review/124, signed off 00:14Z): the owner's row goes in beside the engine's
    // deny rows (u20); replacing the member whole would delete them, a change the merge puts back.
    await addPermissionRows(root, { allow: ["Bash"] });
    await dropSettingsLedgerRow(root);

    const drift = await runDriftGate(root, ENGINE_VERSION);

    // TEST CHANGE, justified: REQ-FLOW-036 — the merge adopts the file and adds the engine's rows beside
    // the owner's, so the plan reads `update`; it read `collision`.
    // TEST CHANGE, justified (2026-10-08, inbox row 324): the merge has no row to add now and the
    // engine's hook entries are already in place, so the plan reads no change.
    expect(drift.changes.map((entry) => [entry.path, entry.action])).toEqual([]);
  });
});
