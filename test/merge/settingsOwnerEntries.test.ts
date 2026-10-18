import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLAUDE_SETTINGS_PATH } from "../../src/adapters/claude.ts";
import { runDriftGate } from "../../src/cli/commands/check.ts";
import { checkCommand } from "../../src/cli/commands/check.ts";
import { cleanCommand } from "../../src/cli/commands/clean.ts";
import { applyInit } from "../../src/cli/commands/init/apply.ts";
import { buildInitDecisions } from "../../src/cli/commands/init/plan.ts";
import { applySync, planSync } from "../../src/cli/commands/sync/engine.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../src/content/contentRoot.ts";
import { CLAUDE_ASK_ROWS, CLAUDE_DENY_ROWS } from "../../src/hooks/personOnly.ts";
import { createApp } from "../../src/index.ts";
import { memberHash } from "../../src/manifest/jsonMembers.ts";
import { readManifest, writeManifest } from "../../src/manifest/manifest.ts";
import type { MergeResult } from "../../src/types/content.ts";
import type { CoOwnership, LedgerEntry } from "../../src/types/manifest.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * REQ-FLOW-036 at the shipped verbs: `.claude/settings.json` is merged entry by
 * entry, so an owner's deny rules, allow rows and hook entries survive `init`,
 * `sync` (forced or not) and `clean`, and the engine owns only the hook entries
 * it wrote (and the allow rows a release before this one wrote, until they
 * leave), recorded by hash on the ledger row (`coOwned`).
 *
 * Real temp repositories through the real verbs, the posture
 * `./settingsKeyOwnership.test.ts` takes: a co-owned document's defects live in
 * the wiring between the planner, the write lanes, the ledger and the sweep,
 * which no unit test of the core sees.
 */

const ENGINE_VERSION = createApp().version;
const T0 = new Date("2026-10-07T09:00:00.000Z");
const T1 = new Date("2026-10-07T10:00:00.000Z");

const getTemp = useTempDir("settings-owner-entries");

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

const DENY_RULE = "Bash(rm -rf:*)";
/** The engine's person-only deny rows, which follow an owner's own rows in `permissions.deny` (u20). */
const ENGINE_DENY = [...CLAUDE_DENY_ROWS];
/** The engine's person-only ask rows, co-owned as the deny rows are (v0a2, REQ-FLOW-036). */
const ENGINE_ASK = [...CLAUDE_ASK_ROWS];
const OWNER_ROW = "Bash(npm test:*)";
const OWNER_GROUP = { matcher: "Bash", hooks: [{ type: "command", command: "./scripts/guard.sh" }] };
/** The criteria's first fixture, in two-space style. */
const FIRST = `${JSON.stringify(
  {
    permissions: { allow: [OWNER_ROW], deny: [DENY_RULE] },
    hooks: { PreToolUse: [OWNER_GROUP] },
    model: "opus",
  },
  null,
  2,
)}\n`;

/**
 * FIRST as `clean` leaves it after a setup (review/124, signed off 00:14Z): clean removes no `permissions.deny`
 * row, so the engine's rows the setup added stay after the owner's rule, and everything else is back as it was.
 * TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): nor any `permissions.ask` row, so the engine's ask rows the setup added stay too.
 */
const FIRST_AFTER_CLEAN = `${JSON.stringify(
  {
    permissions: { allow: [OWNER_ROW], deny: [DENY_RULE, ...ENGINE_DENY], ask: ENGINE_ASK },
    hooks: { PreToolUse: [OWNER_GROUP] },
    model: "opus",
  },
  null,
  2,
)}\n`;
/** The sentence `clean` prints beside the deny and ask rows it leaves. */
const DENY_KEPT = "clean removes no deny row";

let counter = 0;
async function freshRepo(): Promise<string> {
  counter += 1;
  const root = getTemp().path(`repo-${counter}`);
  await mkdir(root, { recursive: true });
  return root;
}

const SETTINGS_ABS = (root: string): string => join(root, ".claude", "settings.json");

async function seedSettings(root: string, raw: string): Promise<void> {
  await mkdir(join(root, ".claude"), { recursive: true });
  await writeFile(SETTINGS_ABS(root), raw, "utf8");
}

async function readSettings(root: string): Promise<string> {
  return readFile(SETTINGS_ABS(root), "utf8");
}

async function settingsDoc(root: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readSettings(root)) as Record<string, unknown>;
}

async function init(root: string, force = false): ReturnType<typeof applyInit> {
  const decisions = await buildInitDecisions(root, { tools: ["claude"] });
  return applyInit({ rootDir: root, decisions, engineVersion: ENGINE_VERSION, dryRun: false, force, now: T0 });
}

async function sync(root: string, force = false): ReturnType<typeof applySync> {
  const plan = await planSync(root, ENGINE_VERSION, { runner: () => "" });
  return applySync(root, plan, { engineVersion: ENGINE_VERSION, force, dryRun: false, now: T1 });
}

function clean(root: string): ReturnType<typeof runInProcess> {
  return runInProcess([cleanCommand], ["clean", "-y"], { cwd: root });
}

function settingsRow(wrote: readonly MergeResult[]): MergeResult {
  const row = wrote.find((entry) => entry.path.replaceAll("\\", "/").endsWith(CLAUDE_SETTINGS_PATH));
  if (row === undefined) throw new Error(`no settings row in ${JSON.stringify(wrote.map((r) => r.path))}`);
  return row;
}

async function settingsLedgerRows(root: string): Promise<LedgerEntry[]> {
  return ((await readManifest(root))?.ledger ?? []).filter((row) => row.path === CLAUDE_SETTINGS_PATH);
}

/** Every file under `root` whose name carries a backup suffix. */
async function backups(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && /\.bak/.test(entry.name)).map((entry) => join(entry.parentPath, entry.name));
}

/** Rewrite the settings row's `coOwned` through `edit` (the hand-edited, committed manifest a forged record arrives in). */
async function editSettingsRecord(root: string, edit: (record: CoOwnership | undefined) => CoOwnership | undefined): Promise<void> {
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("fixture lost its manifest");
  const ledger = manifest.ledger.map((row) => {
    if (row.path !== CLAUDE_SETTINGS_PATH) return row;
    const { coOwned, ...rest } = row;
    const next = edit(coOwned === undefined ? undefined : structuredClone(coOwned));
    return next === undefined ? rest : { ...rest, coOwned: next };
  });
  await writeManifest(root, { ...manifest, ledger }, { now: T1 });
}

const isEngineGroup = (group: unknown): boolean =>
  JSON.stringify(group).includes(".stamity/generated/hooks/");

// ── The first fixture: merge, never a collision ─────────────────

describe("an owner's permissions and hooks before setup", () => {
  // TEST CHANGE, justified (2026-10-08, inbox row 324): the engine's three allow rows were pinned beside the
  // owner's row and on the record. The engine renders no allow row now, so the
  // owner's `allow` is untouched and the record holds the hook groups alone.
  it("init merges beside them: the row is updated, every owner member stays byte for byte, and the record holds exactly the engine's groups", async () => {
    const root = await freshRepo();
    await seedSettings(root, FIRST);

    const report = await init(root);

    const row = settingsRow(report.wrote);
    expect(row.action).toBe("updated");
    const doc = await settingsDoc(root);
    const permissions = doc["permissions"] as { allow: string[]; deny: string[] };
    // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): the engine's deny rows join after the owner's rule, and
    // `PreToolUse` holds three engine groups now (the core guard, the shell guard, the ask gate).
    expect(permissions.deny).toEqual([DENY_RULE, ...ENGINE_DENY]);
    expect(permissions.allow).toEqual([OWNER_ROW]);
    expect(doc["model"]).toBe("opus");
    const hooks = doc["hooks"] as Record<string, unknown[]>;
    expect(hooks["PreToolUse"]?.[0]).toEqual(OWNER_GROUP);
    // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): a fifth group, the shell guard again on the GitHub MCP tools.
    expect(hooks["PreToolUse"]).toHaveLength(5);
    expect(hooks["PreToolUse"]?.slice(1).every(isEngineGroup)).toBe(true);
    // The owner's bytes, as the file spells them: the merge keeps the two-space style.
    // review/34: compared as bytes, not as parsed values — each owner member's
    // own spelling, at its own depth, is in the file.
    const raw = await readSettings(root);
    // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): the owner's rule keeps its spelling and its place, first.
    expect(raw).toContain(`"deny": [\n      "${DENY_RULE}",\n      "${ENGINE_DENY[0]}"`);
    expect(raw).toContain(`"allow": [\n      "${OWNER_ROW}"\n    ]`);
    expect(raw).toContain(`"model": "opus"`);
    const ownerGroupBytes = JSON.stringify(OWNER_GROUP, null, 2).split("\n").join("\n      ");
    expect(raw).toContain(`"PreToolUse": [\n      ${ownerGroupBytes},`);

    const rows = await settingsLedgerRows(root);
    expect(rows).toHaveLength(1);
    const elements = rows[0]?.coOwned?.elements ?? {};
    expect(elements).not.toHaveProperty("/permissions/allow");
    // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): the record holds the engine's deny rows too, and not the owner's rule.
    // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): and the engine's ask rows, under their own pointer.
    const expected: Record<string, string[]> = { "/permissions/deny": ENGINE_DENY.map(memberHash), "/permissions/ask": ENGINE_ASK.map(memberHash) };
    for (const [event, groups] of Object.entries(hooks)) {
      expected[`/hooks/${event}`] = groups.filter(isEngineGroup).map(memberHash);
    }
    expect(elements).toEqual(expected);
    expect(Object.values(elements).flat()).not.toContain(memberHash(OWNER_GROUP));
    expect(Object.values(elements).flat()).not.toContain(memberHash(OWNER_ROW));
    expect(Object.values(elements).flat()).not.toContain(memberHash(DENY_RULE));
  });

  it("sync -y, sync -y --force and init -y --force each leave the deny rule and the owner's group byte-identical, with no .bak", async () => {
    const root = await freshRepo();
    await seedSettings(root, FIRST);
    await init(root);

    // In turn, on purpose: each verb runs over the tree the previous one left.
    // review/34: the claim is bytes, so the whole file is compared as bytes.
    const afterInit = await readSettings(root);
    const expectOwnerContentKept = async (): Promise<void> => {
      expect(await readSettings(root)).toBe(afterInit);
      const doc = await settingsDoc(root);
      // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): the owner's rule first, then the engine's rows.
      expect((doc["permissions"] as { deny: unknown })["deny"]).toEqual([DENY_RULE, ...ENGINE_DENY]);
      expect((doc["hooks"] as Record<string, unknown[]>)["PreToolUse"]?.[0]).toEqual(OWNER_GROUP);
      expect(await backups(root)).toEqual([]);
    };
    await sync(root);
    await expectOwnerContentKept();
    await sync(root, true);
    await expectOwnerContentKept();
    await init(root, true);
    await expectOwnerContentKept();
  });

  // TEST CHANGE, justified (2026-10-08, inbox row 324): the engine's recorded allow rows were the
  // carried-forward record this case read; no allow row is rendered now, so it
  // reads the engine's recorded hook groups instead.
  it("init --force judges the file against the previous ledger, never as an adoption: the engine's groups stay recorded, the notice claims none of them, and clean restores the bytes (review/39)", async () => {
    const root = await freshRepo();
    await seedSettings(root, FIRST);
    await init(root);
    const engineGroups = (await settingsLedgerRows(root))[0]?.coOwned?.elements;
    expect(Object.keys(engineGroups ?? {}).length).toBeGreaterThan(0);

    const report = await init(root, true);

    const row = settingsRow(report.wrote);
    expect(row.notice ?? "").not.toContain("permissions.allow");
    expect(row.notice ?? "").not.toContain("Merged into");
    const rows = await settingsLedgerRows(root);
    expect(rows[0]?.coOwned?.elements).toEqual(engineGroups);
    expect(rows[0]?.coOwned?.createdFile).toBeUndefined();
    const cleaned = await clean(root);
    expect(cleaned.code).toBe(0);
    // TEST CHANGE, justified (review/124, signed off 00:14Z): clean removes no deny row, so the engine's stay.
    expect(await readSettings(root)).toBe(FIRST_AFTER_CLEAN);
    expect(await backups(root)).toEqual([]);
  });

  // TEST CHANGE, justified (review/124, signed off 00:14Z): clean removes no deny row, so a file the engine created
  // keeps its deny rows and stays, where it was deleted; createdFile still holds through init --force.
  it("init --force keeps createdFile for a file the engine created, so clean takes out everything but its deny rows (review/39)", async () => {
    const root = await freshRepo();
    await init(root);
    expect((await settingsLedgerRows(root))[0]?.coOwned?.createdFile).toBe(true);

    await init(root, true);

    expect((await settingsLedgerRows(root))[0]?.coOwned?.createdFile).toBe(true);
    // TEST CHANGE, justified (2026-10-08, inbox row 324): read the recorded allow rows; the record
    // carries the engine's hook groups alone now.
    // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): and the engine's deny rows, under their own pointer.
    expect(
      Object.keys((await settingsLedgerRows(root))[0]?.coOwned?.elements ?? {}).every(
        // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): and the ask rows', which clean keeps as it keeps the deny rows.
        (pointer) => pointer.startsWith("/hooks/") || pointer === "/permissions/deny" || pointer === "/permissions/ask",
      ),
    ).toBe(true);
    const cleaned = await clean(root);
    expect(cleaned.code).toBe(0);
    expect(await readSettings(root)).toBe(`${JSON.stringify({ permissions: { deny: ENGINE_DENY, ask: ENGINE_ASK } }, null, 2)}\n`);
    expect(cleaned.stdout).toContain(DENY_KEPT);
  });

  // TEST CHANGE, justified (review/124, signed off 00:14Z): clean removes no deny row, so the file is the one before
  // setup plus the engine's deny rows after the owner's rule, and clean names those rows for the person.
  it("init then clean leaves the file byte-identical to before setup but for the engine's deny rows, with no .bak", async () => {
    const root = await freshRepo();
    await seedSettings(root, FIRST);
    await init(root);

    const result = await clean(root);

    expect(result.code).toBe(0);
    expect(await readSettings(root)).toBe(FIRST_AFTER_CLEAN);
    expect(result.stdout).toContain(DENY_KEPT);
    expect(result.stdout).toContain(JSON.stringify(ENGINE_DENY[0]));
    expect(await backups(root)).toEqual([]);
  });
});

// ── An owner's entry added after setup ─────────────────────────

describe("an owner's deny rule added after setup", () => {
  it("check reports no drift for the file and sync -y leaves it byte-identical", async () => {
    const root = await freshRepo();
    await init(root);
    const doc = await settingsDoc(root);
    // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): the owner ADDS the rule beside the engine's deny rows;
    // replacing the list would delete the engine's rows, which sync renders back.
    const deny = ((doc["permissions"] as { deny: string[] }).deny);
    doc["permissions"] = { ...(doc["permissions"] as Record<string, unknown>), deny: [...deny, DENY_RULE] };
    await writeFile(SETTINGS_ABS(root), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    const before = await readSettings(root);

    const drift = await runDriftGate(root, ENGINE_VERSION);
    expect(drift.changes.filter((entry) => entry.path === CLAUDE_SETTINGS_PATH)).toEqual([]);
    const check = await runInProcess([checkCommand], ["check", "--json"], { cwd: root });
    expect(check.code).toBe(0);

    const report = await sync(root);

    expect(settingsRow(report.wrote).action).toBe("unchanged");
    expect(await readSettings(root)).toBe(before);
    expect(await backups(root)).toEqual([]);
  });
});

// ── An owner's deny row equal to an engine row (u20-hook-emission) ──

describe("an owner's deny row equal to one of the engine's person-only rows", () => {
  // TEST CHANGE, justified (review/124, signed off 00:14Z): clean removes no deny row, so the owner's rows come back
  // byte for byte, first and in their order, with the engine's rows still after them.
  it("stays the owner's through init, sync and clean: placed once, never recorded, and kept byte for byte in its place", async () => {
    const root = await freshRepo();
    const shared = ENGINE_DENY.find((row) => row.includes("npm publish")) ?? ENGINE_DENY[0]!;
    const raw = `${JSON.stringify({ permissions: { deny: [shared, DENY_RULE] }, model: "opus" }, null, 2)}\n`;
    await seedSettings(root, raw);

    await init(root);

    const deny = ((await settingsDoc(root))["permissions"] as { deny: string[] }).deny;
    expect(deny.filter((row) => row === shared)).toHaveLength(1);
    expect(deny.slice(0, 2)).toEqual([shared, DENY_RULE]);
    expect(deny.toSorted()).toEqual([DENY_RULE, ...ENGINE_DENY].toSorted());
    const recorded = (await settingsLedgerRows(root))[0]?.coOwned?.elements?.["/permissions/deny"] ?? [];
    expect(recorded).toHaveLength(ENGINE_DENY.length - 1);
    expect(recorded).not.toContain(memberHash(shared));

    const afterInit = await readSettings(root);
    expect(settingsRow((await sync(root)).wrote).action).toBe("unchanged");
    expect(await readSettings(root)).toBe(afterInit);

    const cleaned = await clean(root);
    expect(cleaned.code).toBe(0);
    // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): the engine's ask rows stay after the deny list.
    expect(await readSettings(root)).toBe(`${JSON.stringify({ permissions: { deny, ask: ENGINE_ASK }, model: "opus" }, null, 2)}\n`);
    expect(cleaned.stdout).toContain(DENY_KEPT);
    expect(await backups(root)).toEqual([]);
  });

  // v0a2 (REQ-FLOW-036): a checkout synced from an unreleased build keeps a deny row that is an ask row now. The engine
  // moves no row between lists: the deny row stays (the client reads it first, so it still refuses), the ask list
  // gains the engine's rows, and clean names the leftover deny row because it equals an engine ask row.
  it("keeps an owner's deny row equal to an engine ask row in place, adds the ask rows beside it, and clean names it", async () => {
    const root = await freshRepo();
    const moved = "Bash(gh pr merge:*)";
    expect(ENGINE_ASK).toContain(moved);
    expect(ENGINE_DENY).not.toContain(moved);
    await seedSettings(root, `${JSON.stringify({ permissions: { deny: [moved] }, model: "opus" }, null, 2)}\n`);

    await init(root);

    const permissions = (await settingsDoc(root))["permissions"] as { deny: string[]; ask: string[] };
    expect(permissions.deny).toEqual([moved, ...ENGINE_DENY]);
    expect(permissions.ask).toEqual(ENGINE_ASK);
    const afterInit = await readSettings(root);
    expect(settingsRow((await sync(root)).wrote).action).toBe("unchanged");
    expect(await readSettings(root)).toBe(afterInit);

    const cleaned = await clean(root);
    expect(cleaned.code).toBe(0);
    expect(await settingsDoc(root)).toEqual({ permissions, model: "opus" });
    expect(cleaned.stdout).toContain(`permissions.deny (${JSON.stringify(moved)}`);
    expect(cleaned.stdout).toContain("It removes no ask row either.");
  });
});

// ── The deny rows' owner, whatever the ledger's age (review/124, review/125, build/70) ──

describe("deny rows clean never removes, whatever the ledger's age (review/124, signed off 00:14Z)", () => {
  const shared = ENGINE_DENY.find((row) => row.includes("npm publish")) ?? ENGINE_DENY[0]!;

  it("an owner's in-table row under a 1.11.0 ledger row: sync keeps it in place and records it not, and clean keeps it", async () => {
    // A 1.11.0 setup over the owner's own `npm publish` rule: that release wrote hooks and no deny row.
    const root = await freshRepo();
    await seedSettings(root, `${JSON.stringify({ permissions: { deny: [shared] }, model: "opus" }, null, 2)}\n`);
    await init(root);
    const doc = await settingsDoc(root);
    await writeFile(SETTINGS_ABS(root), `${JSON.stringify({ ...doc, permissions: { deny: [shared] } }, null, 2)}\n`, "utf8");
    await editSettingsRecord(root, () => undefined);

    await sync(root);

    const deny = ((await settingsDoc(root))["permissions"] as { deny: string[] }).deny;
    expect(deny).toEqual([shared, ...ENGINE_DENY.filter((row) => row !== shared)]);
    const recorded = (await settingsLedgerRows(root))[0]?.coOwned?.elements?.["/permissions/deny"] ?? [];
    expect(recorded).not.toContain(memberHash(shared));
    expect(recorded).toHaveLength(ENGINE_DENY.length - 1);

    expect((await clean(root)).code).toBe(0);
    // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): sync put back the ask rows the rewrite dropped, and clean keeps them.
    expect(await settingsDoc(root)).toEqual({ permissions: { deny, ask: ENGINE_ASK }, model: "opus" });
  });

  it("an equal row the owner adds after setup: sync moves no byte, and clean keeps both copies", async () => {
    const root = await freshRepo();
    await init(root);
    const doc = await settingsDoc(root);
    const deny = [...((doc["permissions"] as { deny: string[] }).deny), shared];
    // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): the owner's edit keeps the engine's ask rows, as it keeps the deny rows.
    await writeFile(SETTINGS_ABS(root), `${JSON.stringify({ ...doc, permissions: { ...(doc["permissions"] as object), deny } }, null, 2)}\n`, "utf8");
    const before = await readSettings(root);

    expect(settingsRow((await sync(root)).wrote).action).toBe("unchanged");
    expect(await readSettings(root)).toBe(before);

    expect((await clean(root)).code).toBe(0);
    expect(await settingsDoc(root)).toEqual({ permissions: { deny, ask: ENGINE_ASK } });
  });

  it("a lost ledger record: the next sync moves no byte and records no deny row, and clean keeps and names the rows", async () => {
    const root = await freshRepo();
    await init(root);
    const before = await readSettings(root);
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("fixture lost its manifest");
    await writeManifest(root, { ...manifest, ledger: manifest.ledger.filter((row) => row.path !== CLAUDE_SETTINGS_PATH) }, { now: T1 });

    await sync(root);

    expect(await readSettings(root)).toBe(before);
    const rows = await settingsLedgerRows(root);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.coOwned?.elements?.["/permissions/deny"]).toBeUndefined();
    const cleaned = await clean(root);
    expect(cleaned.code).toBe(0);
    // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): the ask rows stay beside the deny rows.
    expect(await settingsDoc(root)).toEqual({ permissions: { deny: ENGINE_DENY, ask: ENGINE_ASK } });
    expect(cleaned.stdout).toContain(DENY_KEPT);
  });
});

// ── A record that claims what is not the engine's ──────────────

describe("a ledger record that claims an owner's members", () => {
  it("a record claiming the deny rule, the whole permissions member and the owner's allow row proves nothing: they survive sync and clean, and no warning names them", async () => {
    const root = await freshRepo();
    await seedSettings(root, FIRST);
    await init(root);
    const permissions = (await settingsDoc(root))["permissions"];
    await editSettingsRecord(root, (record) => ({
      ...record,
      members: { "/permissions": memberHash(permissions) },
      elements: {
        ...record?.elements,
        // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): the forged claim is ADDED to the engine's recorded deny
        // rows, as the allow claim is; before the engine wrote deny rows, replacing and adding were one.
        "/permissions/deny": [...(record?.elements?.["/permissions/deny"] ?? []), memberHash(DENY_RULE)],
        "/permissions/allow": [...(record?.elements?.["/permissions/allow"] ?? []), memberHash(OWNER_ROW)],
      },
    }));

    const report = await sync(root);

    const row = settingsRow(report.wrote);
    expect(row.warning).toBeUndefined();
    expect(await backups(root)).toEqual([]);
    let doc = await settingsDoc(root);
    // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): the engine's deny rows follow the owner's rule, which the forged claim did not move.
    expect((doc["permissions"] as { deny: unknown })["deny"]).toEqual([DENY_RULE, ...ENGINE_DENY]);
    expect((doc["permissions"] as { allow: string[] })["allow"]).toContain(OWNER_ROW);

    // Forge it again (the sync wrote the record the engine can prove), then clean.
    await editSettingsRecord(root, (record) => ({
      ...record,
      members: { "/permissions": memberHash((doc["permissions"])) },
      elements: {
        ...record?.elements,
        // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): the forged claim is ADDED to the engine's recorded deny
        // rows, as the allow claim is; before the engine wrote deny rows, replacing and adding were one.
        "/permissions/deny": [...(record?.elements?.["/permissions/deny"] ?? []), memberHash(DENY_RULE)],
        "/permissions/allow": [...(record?.elements?.["/permissions/allow"] ?? []), memberHash(OWNER_ROW)],
      },
    }));
    const cleaned = await clean(root);
    expect(cleaned.code).toBe(0);
    // The sweep names no allow row and not the deny rule: the forged claim on
    // the owner's row proves nothing. TEST CHANGE, justified (2026-10-08, inbox row 324): the sweep
    // named the engine's three rows at indexes 1 to 3; the engine writes none now.
    expect(cleaned.stdout).toContain("co-owned-reduced  .claude/settings.json");
    expect(cleaned.stdout).not.toContain("permissions.allow");
    // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): the sweep may name the engine's own deny rows it takes
    // out; it never names the owner's rule, which sits first.
    expect(cleaned.stdout).not.toContain("permissions.deny[0]");
    expect(await backups(root)).toEqual([]);
    doc = await settingsDoc(root);
    // TEST CHANGE, justified (review/124, signed off 00:14Z): clean removes no deny row, so the engine's stay after the
    // owner's rule; the rows it names are the table's, never the owner's rule the forged record claims.
    // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): the engine's ask rows stay too.
    expect(doc["permissions"]).toEqual({ allow: [OWNER_ROW], deny: [DENY_RULE, ...ENGINE_DENY], ask: ENGINE_ASK });
    expect(cleaned.stdout).not.toContain(DENY_RULE);
  });

  it("a record claiming the owner's hook group, whose script lies outside .stamity/, removes it only behind a verified .bak and names it", async () => {
    const root = await freshRepo();
    await seedSettings(root, FIRST);
    await init(root);
    await editSettingsRecord(root, (record) => ({
      ...record,
      elements: {
        ...record?.elements,
        "/hooks/PreToolUse": [memberHash(OWNER_GROUP), ...(record?.elements?.["/hooks/PreToolUse"] ?? [])],
      },
    }));
    const before = await readSettings(root);

    const report = await sync(root);

    const row = settingsRow(report.wrote);
    expect(row.action).toBe("updated");
    expect(row.warning).toContain("hooks.PreToolUse[0]");
    expect(row.warning).toContain(`${SETTINGS_ABS(root)}.bak`);
    expect(await readFile(`${SETTINGS_ABS(root)}.bak`, "utf8")).toBe(before);
    const groups = ((await settingsDoc(root))["hooks"] as Record<string, unknown[]>)["PreToolUse"] ?? [];
    expect(groups).not.toContainEqual(OWNER_GROUP);
  });
});

describe("a co-owned-shape refusal of a ledgered settings file (review/40)", () => {
  it("keeps the row and its record through the refusal, so once the owner fixes the file the engine's rows are still its own and clean restores the bytes", async () => {
    const root = await freshRepo();
    await seedSettings(root, FIRST);
    await init(root);
    const [recordBefore] = await settingsLedgerRows(root);
    const doc = await settingsDoc(root);
    (doc["hooks"] as Record<string, unknown>)["PreToolUse"] = {};
    await writeFile(SETTINGS_ABS(root), `${JSON.stringify(doc, null, 2)}\n`, "utf8");

    const refused = await sync(root);

    expect(settingsRow(refused.wrote).action).toBe("skipped");
    const kept = await settingsLedgerRows(root);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.coOwned).toEqual(recordBefore?.coOwned);
    expect(kept[0]?.contentHash).toBe(recordBefore?.contentHash);

    // The owner fixes the member; the engine's other hook groups are still
    // recorded as its own. TEST CHANGE, justified (2026-10-08, inbox row 324): read the recorded
    // allow rows, which the engine no longer renders.
    (doc["hooks"] as Record<string, unknown>)["PreToolUse"] = [OWNER_GROUP];
    await writeFile(SETTINGS_ABS(root), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    await sync(root);
    expect((await settingsLedgerRows(root))[0]?.coOwned?.elements?.["/hooks/SessionStart"]).toEqual(recordBefore?.coOwned?.elements?.["/hooks/SessionStart"]);

    const cleaned = await clean(root);
    expect(cleaned.code).toBe(0);
    // TEST CHANGE, justified (review/124, signed off 00:14Z): clean removes no deny row, so the engine's stay.
    expect(await readSettings(root)).toBe(FIRST_AFTER_CLEAN);
  });

  it("clean keeps every engine hook script the settings file it leaves in place still names, reports each kept naming the file, and keeps .stamity/ (S17's settings case)", async () => {
    const root = await freshRepo();
    await init(root);
    const raw = await readSettings(root);
    const scripts = [...new Set([...raw.matchAll(/\.stamity\/generated\/hooks\/claude\/[A-Za-z0-9._-]+/g)].map((match) => match[0]))];
    expect(scripts.length).toBeGreaterThan(0);
    // The owner breaks the file: the sweep cannot read which entries are the engine's, so it leaves it whole.
    await writeFile(SETTINGS_ABS(root), `${raw}}`, "utf8");

    const cleaned = await clean(root);

    expect(cleaned.code).toBe(0);
    for (const script of scripts) {
      expect(existsSync(join(root, ...script.split("/"))), script).toBe(true);
      expect(cleaned.stdout).toMatch(new RegExp(`skipped-user-content  ${script.replaceAll(".", "\\.")} — Kept: \\.claude/settings\\.json`));
    }
    expect(existsSync(join(root, ".stamity"))).toBe(true);
    expect(cleaned.stdout).toContain("Kept .stamity/: .claude/settings.json still runs a hook script under it");
  });

  it("clean names the real remedy when the settings file it keeps is a link it may not read (review/49)", async () => {
    const root = await freshRepo();
    await init(root);
    const raw = await readSettings(root);
    await writeFile(join(root, "elsewhere.json"), raw, "utf8");
    await rm(SETTINGS_ABS(root));
    await symlink(join(root, "elsewhere.json"), SETTINGS_ABS(root));

    const cleaned = await clean(root);

    expect(cleaned.code).toBe(0);
    expect(existsSync(join(root, ".stamity"))).toBe(true);
    expect(cleaned.stdout).toContain(
      "Kept .stamity/: .claude/settings.json could not be read (a link, a hard link, or a file it cannot open), so " +
        "nothing proves it no longer runs a hook script under it. Replace it with a regular file (or delete it), then " +
        "re-run stamity clean.",
    );
    expect(cleaned.stdout).not.toContain("Remove that wiring");
  });

  it("init --force carries the previous row through a co-owned-shape refusal too", async () => {
    const root = await freshRepo();
    await seedSettings(root, FIRST);
    await init(root);
    const [recordBefore] = await settingsLedgerRows(root);
    await writeFile(SETTINGS_ABS(root), `${JSON.stringify({ permissions: "allow-all" }, null, 2)}\n`, "utf8");

    const report = await init(root, true);

    expect(settingsRow(report.wrote).action).toBe("skipped");
    expect((await settingsLedgerRows(root))[0]?.coOwned).toEqual(recordBefore?.coOwned);
  });
});

describe("an engine hook entry the operator edited, at clean -y (REQ-PLUGIN-016, review/43)", () => {
  it("leaves behind a verified .bak holding the edit, and the output names that entry", async () => {
    const root = await freshRepo();
    await seedSettings(root, FIRST);
    await init(root);
    const doc = await settingsDoc(root);
    const groups = (doc["hooks"] as Record<string, Record<string, unknown>[]>)["PreToolUse"] ?? [];
    const engineIndex = groups.findIndex((group) => isEngineGroup(group));
    expect(engineIndex).toBeGreaterThan(-1);
    groups[engineIndex] = { ...groups[engineIndex], timeout: 99 };
    await writeFile(SETTINGS_ABS(root), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    const edited = await readSettings(root);

    const cleaned = await clean(root);

    expect(cleaned.code).toBe(0);
    expect(cleaned.stdout).toContain(`hooks.PreToolUse[${engineIndex}]`);
    expect(await readFile(`${SETTINGS_ABS(root)}.bak`, "utf8")).toBe(edited);
    // The owner's content stays; the edited engine entry is gone from the file.
    const after = await settingsDoc(root);
    // TEST CHANGE, justified (review/124, signed off 00:14Z): clean removes no deny row, so the engine's stay.
    expect((after["permissions"] as { deny: unknown })["deny"]).toEqual([DENY_RULE, ...ENGINE_DENY]);
    expect((after["hooks"] as Record<string, unknown[]>)["PreToolUse"]).toEqual([OWNER_GROUP]);
  });
});

describe("user hooks defined in .stamity/hooks/, proven by re-rendering (review/44, reading 1)", () => {
  const SCRIPT = ".stamity/hooks/audit.mjs";
  const DEFINITION = ".stamity/hooks/audit.json";
  const define = async (root: string, matcher: string): Promise<void> => {
    await mkdir(join(root, ".stamity", "hooks"), { recursive: true });
    await writeFile(join(root, ...SCRIPT.split("/")), "process.exit(0)\n", "utf8");
    await writeFile(
      join(root, ...DEFINITION.split("/")),
      JSON.stringify({ hooks: [{ event: "pre_tool_use", matcher, command: ["node", SCRIPT] }] }),
      "utf8",
    );
  };
  const userEntryIndex = async (root: string): Promise<number> => {
    const groups = ((await settingsDoc(root))["hooks"] as Record<string, unknown[]>)["PreToolUse"] ?? [];
    return groups.findIndex((group) => JSON.stringify(group).includes(SCRIPT));
  };
  /** The first fixture set up, then a user hook defined and synced in. */
  const withUserHook = async (): Promise<string> => {
    const root = await freshRepo();
    await seedSettings(root, FIRST);
    await init(root);
    await define(root, "Bash");
    await sync(root);
    return root;
  };

  it("adding a definition wires its entry with no .bak, and records it", async () => {
    const root = await withUserHook();
    expect(await userEntryIndex(root)).toBeGreaterThan(-1);
    expect(await backups(root)).toEqual([]);
  });

  it("clean in a repo with user hooks takes no .bak: the entry equals the current rendering of a definition still present", async () => {
    const root = await withUserHook();

    const cleaned = await clean(root);

    expect(cleaned.code).toBe(0);
    expect(await backups(root)).toEqual([]);
    // TEST CHANGE, justified (review/124, signed off 00:14Z): clean removes no deny row, so the engine's stay.
    expect(await readSettings(root)).toBe(FIRST_AFTER_CLEAN);
  });

  it.each([
    ["editing", async (root: string) => define(root, "Edit")],
    ["removing", async (root: string) => rm(join(root, ...DEFINITION.split("/")))],
  ] as const)("%s a definition leaves one verified .bak, and the warning names the old entry", async (_name, change) => {
    const root = await withUserHook();
    const index = await userEntryIndex(root);
    const before = await readSettings(root);
    await change(root);

    const report = await sync(root);

    const row = settingsRow(report.wrote);
    expect(row.warning).toContain(`hooks.PreToolUse[${index}]`);
    expect(await backups(root)).toEqual([`${SETTINGS_ABS(root)}.bak`]);
    expect(await readFile(`${SETTINGS_ABS(root)}.bak`, "utf8")).toBe(before);
  });
});

describe("an owner's hook entry that runs their own .stamity/hooks/ script (review/44)", () => {
  it("under a record claiming it, leaves only behind a verified .bak, and the warning names it", async () => {
    const root = await freshRepo();
    const userGroup = { matcher: "Bash", hooks: [{ type: "command", command: "node .stamity/hooks/my-guard.mjs" }] };
    await seedSettings(root, `${JSON.stringify({ hooks: { PreToolUse: [userGroup] } }, null, 2)}\n`);
    await init(root);
    await editSettingsRecord(root, (record) => ({
      ...record,
      elements: {
        ...record?.elements,
        "/hooks/PreToolUse": [memberHash(userGroup), ...(record?.elements?.["/hooks/PreToolUse"] ?? [])],
      },
    }));
    const before = await readSettings(root);

    const cleaned = await clean(root);

    expect(cleaned.code).toBe(0);
    expect(cleaned.stdout).toContain("hooks.PreToolUse[0]");
    expect(await readFile(`${SETTINGS_ABS(root)}.bak`, "utf8")).toBe(before);
  });
});

// ── A shape the engine cannot merge beside ─────────────────────

describe("a member the engine writes into, of another type", () => {
  it("init skips a file whose permissions is a string, naming the member and the type, and records no row", async () => {
    const root = await freshRepo();
    const raw = `{"permissions":"allow-all"}\n`;
    await seedSettings(root, raw);

    const report = await init(root);

    const row = settingsRow(report.wrote);
    expect(row.action).toBe("skipped");
    expect(row.warning).toContain("permissions");
    expect(row.warning).toContain("an object");
    expect(row.warning).not.toContain("force");
    expect(await readSettings(root)).toBe(raw);
    expect(await settingsLedgerRows(root)).toEqual([]);
  });
});

// ── Style ──────────────────────────────────────────────────────

describe("the file's own style", () => {
  // TEST CHANGE, justified (review/124, signed off 00:14Z): clean removes no deny row, so it leaves the owner's
  // member and the engine's deny rows, in the file's own style; each style carries its own spelling of that.
  // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): the ask rows are left beside the deny rows.
  const KEPT = { model: "opus", permissions: { deny: ENGINE_DENY, ask: ENGINE_ASK } };
  const STYLES: [string, string, string][] = [
    ["four spaces, no final newline", '{\n    "model": "opus"\n}', JSON.stringify(KEPT, null, 4)],
    ["a tab", '{\n\t"model": "opus"\n}\n', `${JSON.stringify(KEPT, null, "\t")}\n`],
    ["one line", '{"model":"opus"}\n', `${JSON.stringify(KEPT)}\n`],
    ["CRLF", '{\r\n  "model": "opus"\r\n}\r\n', `${JSON.stringify(KEPT, null, 2).replaceAll("\n", "\r\n")}\r\n`],
  ];

  for (const [name, raw, kept] of STYLES) {
    it(`${name}: init keeps the style and clean keeps it too, the engine's deny rows left`, async () => {
      const root = await freshRepo();
      await seedSettings(root, raw);

      await init(root);

      const merged = await readSettings(root);
      // TEST CHANGE, justified (2026-10-08, inbox row 324): matched the three allow rows; the
      // engine writes hook entries alone now.
      // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): three engine PreToolUse groups now (the core guard, the shell guard, the ask gate).
      // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): a fourth group, the shell guard on the GitHub MCP tools, and the ask rows beside the deny rows.
      expect(JSON.parse(merged)).toMatchObject({ model: "opus", hooks: { PreToolUse: [{}, {}, {}, {}] } });
      // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): the engine writes its deny rows, and still no allow row.
      expect((JSON.parse(merged) as { permissions: unknown }).permissions).toEqual({ deny: ENGINE_DENY, ask: ENGINE_ASK });
      if (name === "one line") expect(merged).toBe(`${JSON.stringify(JSON.parse(merged))}\n`);
      if (name === "a tab") expect(merged).toContain('\n\t"model": "opus",\n');
      if (name === "CRLF") expect(merged).not.toMatch(/[^\r]\n/);
      if (name.startsWith("four")) {
        expect(merged).toContain('\n    "model": "opus",\n');
        expect(merged.endsWith("}")).toBe(true);
      }

      expect((await clean(root)).code).toBe(0);
      expect(await readSettings(root)).toBe(kept);
      expect(await backups(root)).toEqual([]);
    });
  }
});

// ── Containers that existed before setup ───────────────────────

describe("containers that existed before setup", () => {
  // TEST CHANGE, justified (review/124, signed off 00:14Z): clean removes no deny row, so the empty `deny` keeps the
  // engine's rows; the empty `allow` still comes back byte for byte.
  it("an empty permissions.allow survives init then clean byte for byte, the empty deny keeps the engine's rows, and the record lists both as preexisting", async () => {
    const root = await freshRepo();
    const raw = `${JSON.stringify({ permissions: { allow: [], deny: [] } }, null, 2)}\n`;
    await seedSettings(root, raw);

    await init(root);
    // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): the engine writes into `deny` now, so the empty one is
    // listed as preexisting too, and clean leaves it as it found it.
    expect((await settingsLedgerRows(root))[0]?.coOwned?.preexisting).toEqual(["/permissions", "/permissions/allow", "/permissions/deny"]);

    expect((await clean(root)).code).toBe(0);
    // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): the ask rows the engine added stay, after the deny list.
    expect(await readSettings(root)).toBe(`${JSON.stringify({ permissions: { allow: [], deny: ENGINE_DENY, ask: ENGINE_ASK } }, null, 2)}\n`);
  });

  // TEST CHANGE, justified (review/124, signed off 00:14Z): clean removes no deny row, so the file keeps the engine's,
  // in its own one-line style.
  it("an empty object file comes back holding only the engine's deny rows", async () => {
    const root = await freshRepo();
    await seedSettings(root, "{}\n");

    await init(root);
    expect((await clean(root)).code).toBe(0);

    // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): and the ask rows.
    expect(await readSettings(root)).toBe(`${JSON.stringify({ permissions: { deny: ENGINE_DENY, ask: ENGINE_ASK } })}\n`);
    expect(await backups(root)).toEqual([]);
  });
});

// ── A ledger written by 1.11.0 ─────────────────────────────────

describe("a settings row with no coOwned record (a 1.11.0 ledger)", () => {
  async function legacyRepo(): Promise<string> {
    const root = await freshRepo();
    await init(root);
    await editSettingsRecord(root, () => undefined);
    expect((await settingsLedgerRows(root))[0]?.coOwned).toBeUndefined();
    return root;
  }

  it("an unedited file: sync takes no .bak, leaves the bytes and records the engine's entries", async () => {
    const root = await legacyRepo();
    const before = await readSettings(root);

    const report = await sync(root);

    expect(settingsRow(report.wrote).action).toBe("unchanged");
    expect(await readSettings(root)).toBe(before);
    expect(await backups(root)).toEqual([]);
    const elements = (await settingsLedgerRows(root))[0]?.coOwned?.elements ?? {};
    const hooks = (await settingsDoc(root))["hooks"] as Record<string, unknown>;
    // TEST CHANGE, justified (2026-10-08, inbox row 324): listed `/permissions/allow` beside the
    // hook events; the engine renders no allow row now.
    // TEST CHANGE, justified (review/124, signed off 00:14Z): a deny row already in the file under a 1.11.0 row is never
    // recorded as the engine's (no release up to 1.11.0 wrote one), so the record holds the hook events alone.
    expect(Object.keys(elements).toSorted()).toEqual(Object.keys(hooks).map((event) => `/hooks/${event}`).toSorted());
  });

  // TEST CHANGE, justified (review/124, signed off 00:14Z): clean removes no deny row, so it takes the engine's groups
  // out and keeps the deny rows beside the key.
  it("with a foreign key added, clean before any sync removes the engine's groups behind a verified .bak and keeps the key and the deny rows", async () => {
    const root = await legacyRepo();
    const doc = await settingsDoc(root);
    await writeFile(SETTINGS_ABS(root), `${JSON.stringify({ ...doc, model: "opus" }, null, 2)}\n`, "utf8");
    const before = await readSettings(root);

    const result = await clean(root);

    expect(result.code).toBe(0);
    // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): and the ask rows.
    expect(await settingsDoc(root)).toEqual({ permissions: { deny: ENGINE_DENY, ask: ENGINE_ASK }, model: "opus" });
    expect(await readFile(`${SETTINGS_ABS(root)}.bak`, "utf8")).toBe(before);
  });
});

// ── An engine entry edited by hand ─────────────────────────────

describe("an engine hook entry the owner edited", () => {
  it("sync restores the engine's entry behind a verified .bak holding the edit, and the warning names the entry and the per-user file", async () => {
    const root = await freshRepo();
    await init(root);
    const rendered = await readSettings(root);
    const doc = await settingsDoc(root);
    const hooks = doc["hooks"] as Record<string, Record<string, unknown>[]>;
    const guard = hooks["PreToolUse"]?.[0];
    if (guard === undefined) throw new Error("no engine PreToolUse group");
    guard["timeout"] = 5;
    await writeFile(SETTINGS_ABS(root), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    const edited = await readSettings(root);

    const report = await sync(root);

    const row = settingsRow(report.wrote);
    expect(row.action).toBe("updated");
    expect(row.warning).toContain("hooks.PreToolUse[0]");
    expect(row.warning).toContain(".claude/settings.local.json");
    expect(await readSettings(root)).toBe(rendered);
    expect(await readFile(`${SETTINGS_ABS(root)}.bak`, "utf8")).toBe(edited);
    expect(existsSync(`${SETTINGS_ABS(root)}.bak`)).toBe(true);
  });
});

// ── The allow rows an earlier release rendered (inbox row 324) ──

describe("the Read, Grep and Glob allow rows an earlier release rendered (inbox row 324)", () => {
  /** The three rows every release from v1.1.0 to 1.12.0 rendered and recorded. */
  const RELEASED_ROWS = ["Read", "Grep", "Glob"];

  /**
   * A 1.12.0 setup over an owner's deny rule: the file carries the three rows
   * beside the deny rule and the ledger records them under `/permissions/allow`,
   * as 1.12.0's init left them. Built from this engine's init plus the two
   * members 1.12.0 added, because this engine no longer renders them.
   */
  async function releasedSetup(root: string): Promise<string> {
    await seedSettings(root, `${JSON.stringify({ permissions: { deny: [DENY_RULE] } }, null, 2)}\n`);
    await init(root);
    const afterInit = await readSettings(root);
    const doc = await settingsDoc(root);
    const permissions = doc["permissions"] as Record<string, unknown>;
    await writeFile(
      SETTINGS_ABS(root),
      `${JSON.stringify({ ...doc, permissions: { ...permissions, allow: RELEASED_ROWS } }, null, 2)}\n`,
      "utf8",
    );
    await editSettingsRecord(root, (record) => ({
      ...record,
      elements: { ...record?.elements, "/permissions/allow": RELEASED_ROWS.map(memberHash) },
    }));
    return afterInit;
  }

  // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): the title said no permissions member; the member now carries
  // the deny rows alone, so the pin moves to "no allow row".
  it("init -y --tools claude writes the deny rows and no allow row", async () => {
    const root = await freshRepo();

    await init(root);

    const doc = await settingsDoc(root);
    // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): the ask rows beside the deny rows, still no allow row.
    expect(doc["permissions"]).toEqual({ deny: ENGINE_DENY, ask: ENGINE_ASK });
    // The hooks member is unchanged by the removal: the engine still wires them.
    expect(Object.keys(doc["hooks"] as Record<string, unknown>).length).toBeGreaterThan(0);
    expect((await settingsLedgerRows(root))[0]?.coOwned?.elements).not.toHaveProperty("/permissions/allow");
  });

  it("sync -y removes the three recorded rows with no .bak, and the owner's deny rule stays byte for byte", async () => {
    const root = await freshRepo();
    const afterInit = await releasedSetup(root);
    // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): the engine's deny rows follow the owner's rule throughout.
    // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): the ask rows beside them.
    expect((await settingsDoc(root))["permissions"]).toEqual({ deny: [DENY_RULE, ...ENGINE_DENY], ask: ENGINE_ASK, allow: RELEASED_ROWS });

    const report = await sync(root);

    expect(settingsRow(report.wrote).action).toBe("updated");
    expect(settingsRow(report.wrote).warning).toBeUndefined();
    expect((await settingsDoc(root))["permissions"]).toEqual({ deny: [DENY_RULE, ...ENGINE_DENY], ask: ENGINE_ASK });
    // Bytes, not values: the file is what this engine's init wrote over the deny rule.
    expect(await readSettings(root)).toBe(afterInit);
    expect(await backups(root)).toEqual([]);
    expect((await settingsLedgerRows(root))[0]?.coOwned?.elements).not.toHaveProperty("/permissions/allow");
  });

  it("an owner's own Read row the ledger does not record stays through init and sync", async () => {
    const root = await freshRepo();
    const raw = `${JSON.stringify({ permissions: { allow: ["Read"] } }, null, 2)}\n`;
    await seedSettings(root, raw);

    await init(root);
    await sync(root);

    // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): the engine's deny rows beside the owner's own row.
    // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): and the ask rows.
    expect((await settingsDoc(root))["permissions"]).toEqual({ allow: ["Read"], deny: ENGINE_DENY, ask: ENGINE_ASK });
    expect(await backups(root)).toEqual([]);
    expect((await settingsLedgerRows(root))[0]?.coOwned?.elements).not.toHaveProperty("/permissions/allow");
  });

  // ── A 1.11.0 setup: the whole-file hash on the row, no per-entry record (review/53) ──

  /** An owner's path-scoped read row: never one a release rendered, so never in the bound. */
  const OWNER_READ_ROW = "Read(./src/**)";

  /**
   * A 1.11.0 setup: the file holds the three rows ahead of the engine's hooks,
   * as every release up to 1.12.0 rendered them, and the ledger row carries
   * that file's whole-file hash and no `coOwned` record, as 1.11.0 wrote it.
   */
  async function legacyReleasedSetup(root: string): Promise<{ afterInit: string; released: string }> {
    await init(root);
    const afterInit = await readSettings(root);
    // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): the rendering carries a `permissions` member of its own
    // now (the deny rows), so the three rows go into it, ahead, rather than being spread over by it.
    const current = await settingsDoc(root);
    const released = `${JSON.stringify({ ...current, permissions: { allow: RELEASED_ROWS, ...(current["permissions"] as object) } }, null, 2)}\n`;
    await writeFile(SETTINGS_ABS(root), released, "utf8");
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("fixture lost its manifest");
    const ledger = manifest.ledger.map((row) => {
      if (row.path !== CLAUDE_SETTINGS_PATH) return row;
      const { coOwned: _record, ...rest } = row;
      return { ...rest, contentHash: createHash("sha256").update(released).digest("hex") };
    });
    await writeManifest(root, { ...manifest, ledger }, { now: T1 });
    expect((await settingsLedgerRows(root))[0]?.coOwned).toBeUndefined();
    return { afterInit, released };
  }

  it("a 1.11.0 setup left unedited: sync -y removes the three rows with no .bak and no warning", async () => {
    const root = await freshRepo();
    const { afterInit } = await legacyReleasedSetup(root);

    const report = await sync(root);

    expect(settingsRow(report.wrote).action).toBe("updated");
    expect(settingsRow(report.wrote).warning).toBeUndefined();
    expect(await readSettings(root)).toBe(afterInit);
    expect(await backups(root)).toEqual([]);
    expect((await settingsLedgerRows(root))[0]?.coOwned?.elements).not.toHaveProperty("/permissions/allow");
  });

  it("a 1.11.0 setup the owner edited: sync -y removes the three rows behind a verified .bak, warns, and keeps the owner's Read(...) row", async () => {
    const root = await freshRepo();
    await legacyReleasedSetup(root);
    const doc = await settingsDoc(root);
    // TEST CHANGE, justified (u20-hook-emission, REQ-FLOW-102): the owner's edit keeps the engine's deny rows.
    const edited = `${JSON.stringify({ ...doc, permissions: { ...(doc["permissions"] as object), allow: [...RELEASED_ROWS, OWNER_READ_ROW] } }, null, 2)}\n`;
    await writeFile(SETTINGS_ABS(root), edited, "utf8");

    const report = await sync(root);

    const row = settingsRow(report.wrote);
    expect(row.action).toBe("updated");
    expect(row.warning).toContain("permissions.allow");
    // TEST CHANGE, justified (v0a2, REQ-FLOW-036, REQ-FLOW-123): and the ask rows.
    expect((await settingsDoc(root))["permissions"]).toEqual({ allow: [OWNER_READ_ROW], deny: ENGINE_DENY, ask: ENGINE_ASK });
    expect(await readFile(`${SETTINGS_ABS(root)}.bak`, "utf8")).toBe(edited);
    expect((await settingsLedgerRows(root))[0]?.coOwned?.elements).not.toHaveProperty("/permissions/allow");
  });
});
