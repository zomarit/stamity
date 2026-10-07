import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CODEX_CONFIG_FILE, codexConfigTableRendering } from "../../src/adapters/codex.ts";
import { checkCommand, runDriftGate } from "../../src/cli/commands/check.ts";
import { cleanCommand } from "../../src/cli/commands/clean.ts";
import { applyInit } from "../../src/cli/commands/init/apply.ts";
import { buildInitDecisions } from "../../src/cli/commands/init/plan.ts";
import { applySync, planSync } from "../../src/cli/commands/sync/engine.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../src/content/contentRoot.ts";
import { createApp } from "../../src/index.ts";
import { describeCodexHooksOff, planCodexConfigToml, reduceCodexConfigToml } from "../../src/manifest/codexConfigToml.ts";
import type { CoOwnedOwnership, CoOwnedPlan } from "../../src/manifest/coOwnedJson.ts";
import { collectManifestErrors, createManifest, readManifest, writeManifest } from "../../src/manifest/manifest.ts";
import { normaliseSegment, tomlTableName } from "../../src/manifest/tomlTables.ts";
import { CURATED_MCP_SERVERS, type McpServerMeta, type PackSuppliedServer } from "../../src/mcp/catalog.ts";
import { ledgerHashIndex } from "../../src/merge/safeWrite.ts";
import type { CoOwnedReduction, MergeResult } from "../../src/types/content.ts";
import type { CoOwnership, LedgerEntry } from "../../src/types/manifest.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * REQ-FLOW-037, the TOML half: `.codex/config.toml` is owned TABLE BY TABLE.
 * The engine owns `[features]`, the bare `[mcp_servers]` while it selects no
 * server, and each `[mcp_servers.<id>]` it renders; every other table and every
 * top-level key is the owner's and survives `init`, `sync` and `clean` byte for
 * byte. Real temp repositories through the shipped verbs first (the wiring
 * between the lane, the ledger and the sweep is where 1.11.0 lost a team's own
 * server), then the planner and the reducer over bytes.
 */

const ENGINE_VERSION = createApp().version;
const T0 = new Date("2026-10-07T09:00:00.000Z");
const T1 = new Date("2026-10-07T10:00:00.000Z");

const getTemp = useTempDir("codex-config-toml");

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

// ── Verb harness ───────────────────────────────────────────────

let counter = 0;
async function freshRepo(): Promise<string> {
  counter += 1;
  const root = getTemp().path(`repo-${counter}`);
  await mkdir(root, { recursive: true });
  return root;
}

const CONFIG_ABS = (root: string): string => join(root, ".codex", "config.toml");

async function seedConfig(root: string, raw: string): Promise<void> {
  await mkdir(join(root, ".codex"), { recursive: true });
  await writeFile(CONFIG_ABS(root), raw, "utf8");
}

async function readConfig(root: string): Promise<string> {
  return readFile(CONFIG_ABS(root), "utf8");
}

async function init(root: string, mcpServers: string[] = []): ReturnType<typeof applyInit> {
  const decisions = await buildInitDecisions(root, { tools: ["codex"] });
  return applyInit({
    rootDir: root,
    decisions,
    engineVersion: ENGINE_VERSION,
    dryRun: false,
    force: false,
    now: T0,
    ...(mcpServers.length > 0 ? { defaults: { mcpServers } } : {}),
  });
}

async function initForce(root: string): ReturnType<typeof applyInit> {
  const decisions = await buildInitDecisions(root, { tools: ["codex"] });
  return applyInit({ rootDir: root, decisions, engineVersion: ENGINE_VERSION, dryRun: false, force: true, now: T1 });
}

async function sync(root: string): ReturnType<typeof applySync> {
  const syncPlan = await planSync(root, ENGINE_VERSION, { runner: () => "" });
  return applySync(root, syncPlan, { engineVersion: ENGINE_VERSION, force: false, dryRun: false, now: T1 });
}

function clean(root: string): ReturnType<typeof runInProcess> {
  return runInProcess([cleanCommand], ["clean", "-y"], { cwd: root });
}

function configRow(wrote: readonly MergeResult[]): MergeResult {
  const row = wrote.find((entry) => entry.path.replaceAll("\\", "/").endsWith(CODEX_CONFIG_FILE));
  if (row === undefined) throw new Error(`no config row in ${JSON.stringify(wrote.map((r) => r.path))}`);
  return row;
}

async function configRows(root: string): Promise<LedgerEntry[]> {
  return ((await readManifest(root))?.ledger ?? []).filter((row) => row.path === CODEX_CONFIG_FILE);
}

/** Every file under `root` whose name carries a backup suffix. */
async function backups(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && /\.bak/.test(entry.name)).map((entry) => join(entry.parentPath, entry.name));
}

/** Select `servers` in the committed manifest, as `config mcp add` does. */
async function selectServers(root: string, servers: string[]): Promise<void> {
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("fixture lost its manifest");
  await writeManifest(root, { ...manifest, mcp: { servers } }, { now: T1 });
}

/** Rewrite the config row's `coOwned` through `edit` (a hand-edited, committed manifest). */
async function editConfigRecord(root: string, edit: (record: CoOwnership | undefined) => CoOwnership | undefined): Promise<void> {
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("fixture lost its manifest");
  const ledger = manifest.ledger.map((row) => {
    if (row.path !== CODEX_CONFIG_FILE) return row;
    const { coOwned, ...rest } = row;
    const next = edit(coOwned === undefined ? undefined : structuredClone(coOwned));
    return next === undefined ? rest : { ...rest, coOwned: next };
  });
  await writeManifest(root, { ...manifest, ledger }, { now: T1 });
}

/** Turn the config row into a ≤1.11.0 one (no record) whose whole-file hash claims the file's current bytes. */
async function forgeLegacyRow(root: string): Promise<void> {
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("fixture lost its manifest");
  const contentHash = createHash("sha256").update(await readConfig(root)).digest("hex");
  const ledger = manifest.ledger.map((row) => {
    if (row.path !== CODEX_CONFIG_FILE) return row;
    const legacy: LedgerEntry = { ...row, contentHash };
    delete legacy.coOwned;
    return legacy;
  });
  await writeManifest(root, { ...manifest, ledger }, { now: T1 });
}

const TEAM_TABLE = '[mcp_servers.team]\ncommand = "team-mcp"\nargs = []\n';
const PREEXISTING = `model = "o3"\n\n${TEAM_TABLE}`;

const headerCount = (raw: string, header: string): number =>
  raw.split(/\r?\n/u).filter((line) => line === header).length;

// ── An owner table added after setup ───────────────────────────

describe("an owner [mcp_servers.team] table appended after init", () => {
  it("check reports no drift for the file, and sync -y leaves it byte-identical with no .bak", async () => {
    const root = await freshRepo();
    await init(root);
    await writeFile(CONFIG_ABS(root), `${await readConfig(root)}\n${TEAM_TABLE}`, "utf8");
    const before = await readConfig(root);

    const drift = await runDriftGate(root, ENGINE_VERSION);
    expect(drift.changes.filter((entry) => entry.path === CODEX_CONFIG_FILE)).toEqual([]);
    const check = await runInProcess([checkCommand], ["check", "--json"], { cwd: root });
    expect(check.code).toBe(0);

    const report = await sync(root);

    expect(configRow(report.wrote).action).toBe("unchanged");
    expect(await readConfig(root)).toBe(before);
    expect(await backups(root)).toEqual([]);
  });

  it("a server selected later joins the engine's block, and the team table stays byte for byte", async () => {
    const root = await freshRepo();
    await init(root);
    await writeFile(CONFIG_ABS(root), `${await readConfig(root)}\n${TEAM_TABLE}`, "utf8");
    await selectServers(root, ["github"]);

    const report = await sync(root);

    expect(configRow(report.wrote).action).toBe("updated");
    const after = await readConfig(root);
    expect(after).toContain(TEAM_TABLE);
    expect(headerCount(after, "[mcp_servers.github]")).toBe(1);
    // The bare empty-map table the engine wrote while nothing was selected leaves.
    expect(headerCount(after, "[mcp_servers]")).toBe(0);
    // The engine's block stays where it was, ahead of the owner's table.
    expect(after.indexOf("[mcp_servers.github]")).toBeLessThan(after.indexOf("[mcp_servers.team]"));
    expect(after.indexOf("[features]")).toBeLessThan(after.indexOf("[mcp_servers.github]"));
    expect(await backups(root)).toEqual([]);
  });

  it("clean -y leaves the team table alone in the file", async () => {
    const root = await freshRepo();
    await init(root);
    await writeFile(CONFIG_ABS(root), `${await readConfig(root)}\n${TEAM_TABLE}`, "utf8");

    const result = await clean(root);

    expect(result.code).toBe(0);
    expect(await readConfig(root)).toBe(TEAM_TABLE);
  });
});

// ── An owner file before setup ─────────────────────────────────

describe("a .codex/config.toml with a top-level key and an owner table before setup", () => {
  const variants: [string, string][] = [
    ["LF", PREEXISTING],
    ["no final newline", PREEXISTING.slice(0, -1)],
    ["CRLF", PREEXISTING.replaceAll("\n", "\r\n")],
  ];

  for (const [name, raw] of variants) {
    it(`${name}: init keeps model first and appends the engine's tables after the team table; clean restores it byte for byte`, async () => {
      const root = await freshRepo();
      await seedConfig(root, raw);

      await init(root);

      const after = await readConfig(root);
      expect(after.startsWith('model = "o3"')).toBe(true);
      expect(after.indexOf("[mcp_servers.team]")).toBeLessThan(after.indexOf("[features]"));
      expect(headerCount(after, "[features]")).toBe(1);
      if (name === "CRLF") expect(after.replaceAll("\r\n", "")).not.toContain("\n");

      const result = await clean(root);

      expect(result.code).toBe(0);
      expect(await readConfig(root)).toBe(raw);
      expect(await backups(root)).toEqual([]);
    });
  }
});

// ── An owner [features] table ──────────────────────────────────

describe("an owner [features] table before setup", () => {
  it("one that sets hooks = false is kept unchanged under one header, and init warns naming hooks = false", async () => {
    const root = await freshRepo();
    const owner = "[features]\nhooks = false\nweb_search = true\n";
    await seedConfig(root, owner);

    const report = await init(root);

    const after = await readConfig(root);
    expect(headerCount(after, "[features]")).toBe(1);
    expect(after.startsWith(owner)).toBe(true);
    const row = configRow(report.wrote);
    expect(row.warning).toContain("hooks = false");
    expect(row.warning).toContain("[features]");
  });

  for (const owner of ["[features]\nweb_search = true\n", "[features]\nhooks = true\nweb_search = true\n"]) {
    it(`one that does not set hooks = false (${JSON.stringify(owner)}) is kept with no warning`, async () => {
      const root = await freshRepo();
      await seedConfig(root, owner);

      const report = await init(root);

      const after = await readConfig(root);
      expect(headerCount(after, "[features]")).toBe(1);
      expect(after.startsWith(owner)).toBe(true);
      expect(configRow(report.wrote).warning).toBeUndefined();
    });
  }
});

describe("a kept key that turns Codex's hooks off fails check, as a Cursor entry Cursor rejects does (S16, review/81)", () => {
  // Codex then runs no hook from .codex/hooks.json, the engine's guards
  // included, while the drift gate read the file as in sync.
  const spellings: [string, string, string][] = [
    ["bare", "[features]\nhooks = false\nweb_search = true\n", "hooks = false"],
    ["double-quoted", '[features]\n"hooks" = false\n', "hooks = false"],
    ["single-quoted", "[features]\n'hooks' = false # off\n", "hooks = false"],
    ["the deprecated alias", "[features]\ncodex_hooks=false\n", "codex_hooks = false"],
  ];
  for (const [name, owner, key] of spellings) {
    it(`${name}: init keeps the table and warns; check exits 1 naming the file, the key and the remedy; sync keeps it, warns and exits 0`, async () => {
      const root = await freshRepo();
      await seedConfig(root, owner);

      const report = await init(root);
      expect(configRow(report.wrote).warning).toContain(key);
      expect((await readConfig(root)).startsWith(owner)).toBe(true);

      const drift = await runDriftGate(root, ENGINE_VERSION);
      const entries = drift.changes.filter((entry) => entry.path === CODEX_CONFIG_FILE);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.action).toBe("unchanged");
      expect(entries[0]?.rejected).toContain(".codex/config.toml");
      expect(entries[0]?.rejected).toContain(`\`${key}\` in [features] (line 2)`);
      expect(entries[0]?.rejected).toContain(`set \`${key.replace("false", "true")}\`, or remove the key`);
      expect(drift.clean).toBe(false);
      const check = await runInProcess([checkCommand], ["check"], { cwd: root });
      expect(check.code).toBe(1);
      expect(check.stdout + check.stderr).toContain(entries[0]?.rejected as string);

      const before = await readConfig(root);
      const synced = await sync(root);
      expect(configRow(synced.wrote).warning).toBe(entries[0]?.rejected);
      expect(await readConfig(root)).toBe(before);
    });
  }

  for (const owner of ["[features]\nhooks = true\n", '[features]\nhooks = "false"\n', "[profiles.x]\nhooks = false\n"]) {
    it(`${JSON.stringify(owner)}: hooks = true, a string "false" or hooks = false under another table leaves check green`, async () => {
      const root = await freshRepo();
      await seedConfig(root, owner);
      await init(root);
      const drift = await runDriftGate(root, ENGINE_VERSION);
      expect(drift.changes.filter((entry) => entry.path === CODEX_CONFIG_FILE)).toEqual([]);
    });
  }

  it("dotted at the root: init refuses the file and the refusal names the hooks key and its remedy; check exits 1", async () => {
    const root = await freshRepo();
    const owner = 'model = "o3"\nfeatures.hooks = false\n';
    await seedConfig(root, owner);

    const report = await init(root);
    const row = configRow(report.wrote);
    expect(row.action).toBe("skipped");
    expect(row.warning).toContain("`features.hooks = false` (line 2): set `features.hooks = true`, or remove the key");
    expect(await readConfig(root)).toBe(owner);

    const drift = await runDriftGate(root, ENGINE_VERSION);
    const entry = drift.changes.find((change) => change.path === CODEX_CONFIG_FILE);
    expect(entry?.collisionKind).toBe("co-owned-shape");
    expect(entry?.detail).toContain("`features.hooks = false`");
    expect((await runInProcess([checkCommand], ["check"], { cwd: root })).code).toBe(1);
  });
});

// ── An engine table the owner made theirs ──────────────────────

describe("an engine table that is the owner's", () => {
  it("a recorded [mcp_servers.github] with an owner key added is kept byte for byte, warned about, dropped from the record, with no .bak", async () => {
    const root = await freshRepo();
    await init(root, ["github"]);
    const before = await readConfig(root);
    const edited = before.replace('env_vars = ["GITHUB_PAT"]\n', 'env_vars = ["GITHUB_PAT"]\nstartup_timeout_sec = 30\n');
    expect(edited).not.toBe(before);
    await writeFile(CONFIG_ABS(root), edited, "utf8");

    const report = await sync(root);

    expect(await readConfig(root)).toBe(edited);
    expect(headerCount(edited, "[mcp_servers.github]")).toBe(1);
    expect(configRow(report.wrote).warning ?? configRow(report.wrote).notice).toContain("[mcp_servers.github]");
    const members = (await configRows(root))[0]?.coOwned?.members ?? {};
    expect(Object.keys(members)).not.toContain("/mcp_servers/github");
    expect(Object.keys(members)).toContain("/features");
    expect(await backups(root)).toEqual([]);
  });

  it("an owner's own [mcp_servers.github] before an init that selects github is kept and warned about, with no collision and no second header", async () => {
    const root = await freshRepo();
    const owner = '[mcp_servers.github]\ncommand = "gh-mcp"\nargs = ["--stdio"]\n';
    await seedConfig(root, owner);

    const report = await init(root, ["github"]);

    const row = configRow(report.wrote);
    expect(row.action).not.toBe("skipped");
    const after = await readConfig(root);
    expect(after.startsWith(owner)).toBe(true);
    expect(headerCount(after, "[mcp_servers.github]")).toBe(1);
    expect(row.warning ?? row.notice).toContain("[mcp_servers.github]");
    const members = (await configRows(root))[0]?.coOwned?.members ?? {};
    expect(Object.keys(members)).toEqual(["/features"]);
  });
});

// ── A record that claims what is not the engine's ──────────────

describe("a ledger record that claims an owner's table", () => {
  it("claiming [mcp_servers.team] by its hash: clean removes it only behind a verified .bak, and the report names it", async () => {
    const root = await freshRepo();
    await seedConfig(root, PREEXISTING);
    await init(root);
    const teamHash = createHash("sha256").update(TEAM_TABLE).digest("hex");
    await editConfigRecord(root, (record) => ({ ...record, members: { ...record?.members, "/mcp_servers/team": teamHash } }));

    const result = await clean(root);

    expect(result.code).toBe(0);
    expect(await readConfig(root)).not.toContain("[mcp_servers.team]");
    const baks = await backups(root);
    expect(baks).toHaveLength(1);
    expect(await readFile(baks[0] as string, "utf8")).toContain(TEAM_TABLE);
    expect(result.stdout + result.stderr).toContain("[mcp_servers.team]");
  });

  it("claiming [profiles.x], which is no engine name: it stays", async () => {
    const root = await freshRepo();
    const profiles = '[profiles.x]\nmodel = "o3"\n';
    await seedConfig(root, profiles);
    await init(root);
    await editConfigRecord(root, (record) => ({
      ...record,
      members: { ...record?.members, "/profiles/x": createHash("sha256").update(profiles).digest("hex") },
    }));

    const result = await clean(root);

    expect(result.code).toBe(0);
    expect(await readConfig(root)).toBe(profiles);
    expect(await backups(root)).toEqual([]);
  });
});

// ── A forged claim over an owner's [features] (S16) ────────────

describe("a forged claim over an owner's [features]: only a [features] some release rendered is the engine's", () => {
  const OWNER_FEATURES = "[features]\nhooks = false\nweb_search = true\n";
  const forgeries: [string, (root: string) => Promise<void>][] = [
    [
      "a forged record",
      (root) =>
        editConfigRecord(root, (record) => ({
          ...record,
          members: { ...record?.members, "/features": createHash("sha256").update(normaliseSegment(OWNER_FEATURES)).digest("hex") },
        })),
    ],
    ["a forged legacy whole-file hash", forgeLegacyRow],
  ];
  const verbs: [string, (root: string) => Promise<unknown>][] = [
    ["sync", sync],
    ["init --force", initForce],
    ["clean", clean],
  ];

  for (const [forgery, forge] of forgeries) {
    for (const [verb, run] of verbs) {
      it(`${forgery}: ${verb} leaves the owner's [features] untouched, with no .bak`, async () => {
        const root = await freshRepo();
        await seedConfig(root, OWNER_FEATURES);
        await init(root);
        expect((await readConfig(root)).startsWith(OWNER_FEATURES)).toBe(true);
        await forge(root);

        await run(root);

        const after = await readConfig(root);
        expect(after.startsWith(OWNER_FEATURES)).toBe(true);
        expect(headerCount(after, "[features]")).toBe(1);
        expect(await backups(root)).toEqual([]);
      });
    }
  }
});

// ── Owner keys that define an engine table without a header (S12) ──

describe("an owner file defining features by a dotted key at its root", () => {
  it("init skips it as a co-owned-shape collision naming the key, and leaves it untouched", async () => {
    const root = await freshRepo();
    const owner = 'model = "o3"\nfeatures.web_search = true\n';
    await seedConfig(root, owner);

    const report = await init(root);

    expect(await readConfig(root)).toBe(owner);
    const row = configRow(report.wrote);
    expect(row.action).toBe("skipped");
    expect(row.warning).toContain("features.web_search");
    expect(row.warning).toContain("line 2");
    expect(row.warning).not.toMatch(/force/iu);
  });
});

// ── The planner and the reducer over bytes ─────────────────────

const ROOT = "/repo";
const FILE = join(ROOT, ".codex", "config.toml");
const render = codexConfigTableRendering([]);
const table = (name: string): string => {
  const text = render(name);
  if (text === null) throw new Error(`no rendering for ${name}`);
  return text;
};
/** The document the adapter writes for `servers`, assembled from its tables. */
const emittedFor = (servers: string[]): string =>
  [table("features"), ...(servers.length === 0 ? [table("mcp_servers")] : servers.map((id) => table(`mcp_servers.${id}`)))].join("\n");
const EMPTY = emittedFor([]);
const GITHUB = emittedFor(["github"]);
const hash = (text: string): string => createHash("sha256").update(normaliseSegment(text)).digest("hex");

const ADOPTION: CoOwnedOwnership = { owned: false, legacy: false, record: null, boundaryDir: ROOT };
const LEGACY: CoOwnedOwnership = { owned: true, legacy: true, record: null, boundaryDir: ROOT };
const recorded = (record: CoOwnership): CoOwnedOwnership => ({ owned: true, legacy: false, record, boundaryDir: ROOT });
const recordFor = (...names: string[]): CoOwnership => ({
  members: Object.fromEntries(names.map((name) => [name === "features" || name === "mcp_servers" ? `/${name}` : `/mcp_servers/${name.slice("mcp_servers.".length)}`, hash(table(name))])),
});

function plan(existing: string | null, ownership: CoOwnedOwnership, emitted = EMPTY, selected: string[] = []): CoOwnedPlan {
  return planCodexConfigToml(FILE, emitted, existing, ownership, render, selected);
}

function reduce(raw: string, opts: Partial<Parameters<typeof reduceCodexConfigToml>[1]> = {}): CoOwnedReduction {
  return reduceCodexConfigToml(raw, { record: null, legacy: false, selected: [], render, deleteWhenEngineOnly: false, ...opts });
}

/**
 * Every `[features]` a release wrote before this one, normalised, byte for
 * byte: the 1.8.0 text (the first release to write the table, unchanged through
 * 1.9.1) and the 1.10.0 text (unchanged through 1.11.0). Each was read from that
 * release's `.codex/config.toml` golden (`test/emit/__snapshots__/
 * crossClientGoldens.test.ts.snap` at the tag), which its `src/adapters/codex.ts`
 * `composeConfigToml` rendered: the file preamble, a blank line, the hooks
 * notice, then the table.
 */
const RELEASED_FEATURES: Readonly<Record<string, string>> = {
  "1.8.0": readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "codex-features-1.8.0.toml"), "utf8"),
  "1.10.0": readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "codex-features-1.10.0.toml"), "utf8"),
};

// TEST CHANGE, justified: REQ-FLOW-037, S16 (review/50) — a legacy `[features]`
// is the engine's only when its text is one a release wrote, so the 1.11.0
// document is now that release's own `[features]` text, not a shortened stand-in.
/** The 1.11.0 document: its `[features]` as that release wrote it (a blank line inside the preamble), then the bare table. */
const V1_11 = `${RELEASED_FEATURES["1.10.0"]}\n${table("mcp_servers")}`;

describe("codexConfigTableRendering, as the planner reads it", () => {
  it("renders features, the bare mcp_servers and a curated server, and nothing for an unknown name", () => {
    expect(table("features").endsWith("[features]\nhooks = true\n")).toBe(true);
    expect(table("mcp_servers")).toBe("# No MCP servers selected.\n[mcp_servers]\n");
    expect(table("mcp_servers.github")).toContain("[mcp_servers.github]\ncommand = ");
    expect(render("mcp_servers.team")).toBeNull();
    expect(render("profiles.x")).toBeNull();
  });
});

describe("planCodexConfigToml", () => {
  it("creates the file as rendered and records every table, createdFile included", () => {
    const planned = plan(null, ADOPTION);
    expect(planned.result.action).toBe("created");
    expect(planned.content).toBe(EMPTY);
    expect(planned.record).toEqual({ ...recordFor("features", "mcp_servers"), createdFile: true });
  });

  it("re-plans its own file unchanged, with the same record", () => {
    const planned = plan(EMPTY, recorded({ ...recordFor("features", "mcp_servers"), createdFile: true }));
    expect(planned.result).toEqual({ path: FILE, action: "unchanged" });
    expect(planned.record).toEqual({ ...recordFor("features", "mcp_servers"), createdFile: true });
  });

  it("refuses a text it cannot cut as co-owned-shape, naming the line and never offering --force", () => {
    const planned = plan('[features]\nhooks = true\nx = "open\n', recorded(recordFor("features")));
    expect(planned.result.action).toBe("skipped");
    expect(planned.collision).toContain("line 3");
    expect(planned.collision).toContain(".codex/config.toml");
    expect(planned.collision).not.toMatch(/force/iu);
    expect(planned.record).toBeNull();
  });

  it("throws an adapter error for a rendering it cannot own table by table", () => {
    expect(() => plan(null, ADOPTION, 'x = "open\n')).toThrow(/does not read as TOML at line 1/u);
    expect(() => plan(null, ADOPTION, `model = "o3"\n${EMPTY}`)).toThrow(/text above its first table/u);
    expect(() => plan(null, ADOPTION, `${EMPTY}\n[profiles.x]\n`)).toThrow(/a table the engine does not own \(\[profiles\.x\]\)/u);
    expect(() => plan(null, ADOPTION, `${EMPTY}\n[[features]]\n`)).toThrow(/a table the engine does not own/u);
    expect(() => plan(null, ADOPTION, "# a\n\n# b\n[features]\nhooks = true\n")).toThrow(/blank line inside the comments above \[features\]/u);
  });

  it("legacy: the 1.11.0 tables are the engine's by their data lines and are refreshed silently, old preamble and all", () => {
    const planned = plan(V1_11, LEGACY);
    expect(planned.result).toEqual({ path: FILE, action: "updated" });
    expect(planned.content).toBe(EMPTY);
    expect(planned.backup).toBeNull();
    expect(planned.record).toEqual({ ...recordFor("features", "mcp_servers"), createdFile: true });
  });

  it("legacy: a server table whose data differs is the owner's and warned about, unless the ledger proves the file unedited", () => {
    const stale = GITHUB.replace("mcp-remote@0.1.16", "mcp-remote@0.1.15");
    expect(stale).not.toBe(GITHUB);
    const kept = plan(stale, LEGACY, GITHUB, ["github"]);
    expect(kept.result.action).toBe("unchanged");
    expect(kept.backup).toBeNull();
    expect(kept.result.warning).toContain("Kept your [mcp_servers.github] in .codex/config.toml");
    expect(Object.keys(kept.record?.members ?? {})).toEqual(["/features"]);

    const unedited: CoOwnedOwnership = {
      ...LEGACY,
      ledgerHashes: ledgerHashIndex(ROOT, [{ path: ".codex/config.toml", contentHash: createHash("sha256").update(stale).digest("hex") }]),
    };
    const refreshed = plan(stale, unedited, GITHUB, ["github"]);
    expect(refreshed.content).toBe(GITHUB);
    expect(refreshed.result).toEqual({ path: FILE, action: "updated" });
    expect(refreshed.backup).toBeNull();
    expect(refreshed.record?.members).toEqual(recordFor("features", "mcp_servers.github").members);
  });

  it("legacy: a server table the manifest does not select is the owner's even when its data matches", () => {
    const planned = plan(GITHUB, LEGACY, EMPTY, []);
    expect(planned.content).toContain("[mcp_servers.github]");
    expect(planned.content).toContain("[mcp_servers]\n");
    expect(planned.result.warning).toBeUndefined();
  });

  it("recorded: a table the rendering no longer carries leaves silently when it equals the engine's rendering", () => {
    const planned = plan(GITHUB, recorded(recordFor("features", "mcp_servers.github")), EMPTY);
    expect(planned.content).toBe(EMPTY);
    expect(planned.backup).toBeNull();
    expect(planned.result.warning).toBeUndefined();
  });

  it("recorded: a table the engine cannot re-render leaves only behind a backup, the warning naming it", () => {
    const team = '# team\n[mcp_servers.team]\ncommand = "team-mcp"\n';
    const existing = `${EMPTY}\n${team}`;
    const planned = plan(existing, recorded({ members: { ...recordFor("features", "mcp_servers").members, "/mcp_servers/team": hash(team) } }));
    expect(planned.content).toBe(EMPTY);
    expect(planned.backup).toBe(existing);
    expect(planned.result.warning).toContain("Removed [mcp_servers.team] from .codex/config.toml");
  });

  it("recorded: an owner's comment that met the engine's block above a blank line stays the owner's, and the table stays the engine's", () => {
    const existing = `model = "o3"\n# my note\n\n${EMPTY}`;
    const planned = plan(existing, recorded(recordFor("features", "mcp_servers")));
    expect(planned.result.action).toBe("unchanged");
    expect(planned.record?.members).toEqual(recordFor("features", "mcp_servers").members);
  });

  it("recorded: a comment touching an engine header makes that table the owner's, warned about when the engine renders it", () => {
    const existing = GITHUB.replace("[mcp_servers.github]", "# mine now\n[mcp_servers.github]");
    const planned = plan(existing, recorded(recordFor("features", "mcp_servers.github")), GITHUB, ["github"]);
    expect(planned.result.action).toBe("unchanged");
    expect(planned.result.warning).toContain("Kept your [mcp_servers.github]");
    expect(Object.keys(planned.record?.members ?? {})).toEqual(["/features"]);
  });

  it("recorded: rebuilds the block in place when a table joins, keeping the blank line before the owner's next table", () => {
    const owner = "\n[profiles.x]\nmodel = \"o3\"\n";
    const planned = plan(`${EMPTY}${owner}`, recorded(recordFor("features", "mcp_servers")), GITHUB, ["github"]);
    expect(planned.content).toBe(`${GITHUB}${owner}`);
  });

  it("recorded: tables of the engine's split by an owner table are gathered into one block where the first stood", () => {
    const owner = '[profiles.x]\nmodel = "o3"\n';
    const existing = `${table("features")}\n${owner}\n${table("mcp_servers")}`;
    const planned = plan(existing, recorded(recordFor("features", "mcp_servers")));
    expect(planned.content).toBe(`${EMPTY}\n${owner}\n`);
  });

  // TEST CHANGE, justified: review/93 (signed off) — the owner's [mcp_servers] beside the engine's
  // recorded one defined that table twice, which TOML refuses and which is now a co-owned-shape
  // refusal (the last describe below). Every name the engine renders is still the owner's here:
  // the rendering is now [features] and [mcp_servers.github], both the owner's, and the engine's
  // recorded bare [mcp_servers], no longer rendered, is the block that leaves.
  it("recorded: when every engine name is the owner's, the engine writes nothing and its block leaves with its separator and its line break", () => {
    const owner = "[features]\nweb_search = true\n[mcp_servers.github]\nx = 1";
    const existing = `${owner}\n\n${table("mcp_servers")}`;
    const planned = plan(existing, recorded({ ...recordFor("mcp_servers"), terminatorAdded: true }), GITHUB, ["github"]);
    expect(planned.content).toBe(owner);
    expect(planned.backup).toBeNull();
    expect(planned.record).toEqual({});
  });

  it("recorded: when every engine name is the owner's and an owner table follows the block, only the block leaves", () => {
    const owner = "[features]\nweb_search = true\n[mcp_servers.github]\nx = 1\n";
    const after = '[profiles.x]\nmodel = "o3"\n';
    const planned = plan(`${owner}\n${table("mcp_servers")}\n${after}`, recorded({ ...recordFor("mcp_servers"), terminatorAdded: true }), GITHUB, ["github"]);
    expect(planned.content).toBe(`${owner}\n${after}`);
    expect(planned.record).toEqual({});
  });

  it("recorded: the owner's array of tables at an engine name keeps the engine's table of that name out", () => {
    const existing = `[[features]]\nx = 1\n`;
    const planned = plan(existing, recorded({}), EMPTY);
    expect(planned.content).toBe(`[[features]]\nx = 1\n\n${table("mcp_servers")}`);
    expect(Object.keys(planned.record?.members ?? {})).toEqual(["/mcp_servers"]);
  });

  it("recorded: an owner's [features] that sets hooks = false warns on every run, unchanged ones included", () => {
    const existing = `[features]\nhooks = false # off\n\n${table("mcp_servers")}`;
    const planned = plan(existing, recorded(recordFor("mcp_servers")));
    expect(planned.result.action).toBe("unchanged");
    // TEST CHANGE, justified: REQ-FLOW-037, S16 (review/81) — the sentence is now the one `check`
    // fails with too, naming the line, the key as Codex reads it and both remedies.
    expect(planned.result.warning).toBe(
      "Codex runs no hook from .codex/hooks.json, the engine's guards included, while .codex/config.toml sets " +
        "`hooks = false` in [features] (line 2): set `hooks = true`, or remove the key.",
    );
    expect(describeCodexHooksOff(".codex/config.toml", existing)).toBe(planned.result.warning);
  });

  it("describeCodexHooksOff reads nothing into a missing or unreadable file, or a hooks key outside [features]", () => {
    expect(describeCodexHooksOff(".codex/config.toml", null)).toBeNull();
    expect(describeCodexHooksOff(".codex/config.toml", '[features]\nhooks = false\nx = "open\n')).toBeNull();
    expect(describeCodexHooksOff(".codex/config.toml", "[features.sub]\nhooks = false\nfeatures = false\n")).toBeNull();
    expect(describeCodexHooksOff(".codex/config.toml", "\uFEFF[features]\r\nhooks = false\r\n")).toContain("(line 2)");
  });

  it("adoption: an owner table with the rendering's data lines is the owner's and kept without a warning", () => {
    const owner = '[mcp_servers]\n';
    const planned = plan(owner, ADOPTION);
    expect(planned.content).toBe(`${owner}\n${table("features")}`);
    expect(planned.result.warning).toBeUndefined();
    expect(planned.record).toEqual(recordFor("features"));
  });

  it("adoption: an owner file holding every name the engine renders is left as it is, and the engine records nothing", () => {
    const owner = "[features]\nweb_search = true\n\n[mcp_servers]\nx = 1\n";
    const planned = plan(owner, ADOPTION);
    expect(planned.result.action).toBe("unchanged");
    expect(planned.content).toBeNull();
    expect(planned.record).toEqual({});
  });

  it("adoption into an empty file writes the rendering with no separator", () => {
    const planned = plan("", ADOPTION);
    expect(planned.content).toBe(EMPTY);
    expect(planned.record).toEqual(recordFor("features", "mcp_servers"));
  });

  it("keeps a CRLF file's line ending when it rebuilds the block", () => {
    const crlf = (text: string): string => text.replaceAll("\n", "\r\n");
    const planned = plan(crlf(`model = "o3"\n\n${EMPTY}`), recorded(recordFor("features", "mcp_servers")), GITHUB, ["github"]);
    expect(planned.content).toBe(crlf(`model = "o3"\n\n${GITHUB}`));
  });

  // TEST CHANGE, justified: review/93 (signed off) — an engine table pasted twice is a table
  // defined twice, which Codex refuses whole; the planner no longer drops the copy silently but
  // refuses the file, naming the table, and leaves the owner to merge it.
  it("refuses an engine table the owner pasted twice, naming it, and writes nothing", () => {
    const existing = `${EMPTY}\n${table("mcp_servers")}`;
    const planned = plan(existing, recorded(recordFor("features", "mcp_servers")));
    expect(planned.content).toBeNull();
    expect(planned.collision).toContain("defines [mcp_servers] a second time");
  });
});

describe("[features] is the engine's only as a rendering some release wrote (S16, review/50)", () => {
  const OWN = "[features]\nhooks = true\n";

  for (const [release, text] of Object.entries(RELEASED_FEATURES)) {
    it(`legacy: the unedited ${release} [features] is re-rendered silently`, () => {
      const planned = plan(`${text}\n${table("mcp_servers")}`, LEGACY);
      expect(planned.result).toEqual({ path: FILE, action: "updated" });
      expect(planned.content).toBe(EMPTY);
      expect(planned.backup).toBeNull();
      expect(planned.record?.members).toEqual(recordFor("features", "mcp_servers").members);
    });
  }

  it("the engine's current [features] is one of them: its own file re-plans unchanged with /features recorded", () => {
    expect(plan(EMPTY, recorded(recordFor("features", "mcp_servers"))).record?.members).toHaveProperty("/features");
  });

  it("recorded: a record over a [features] no release wrote is a claim, not a proof — the table is the owner's and kept", () => {
    const existing = `${OWN}\n${table("mcp_servers")}`;
    const planned = plan(existing, recorded({ members: { "/features": hash(OWN), ...recordFor("mcp_servers").members } }));
    expect(planned.result.action).toBe("unchanged");
    expect(planned.backup).toBeNull();
    expect(Object.keys(planned.record?.members ?? {})).toEqual(["/mcp_servers"]);
  });

  it("legacy: a whole-file hash over a [features] no release wrote leaves it the owner's, warned about hooks = false", () => {
    const owner = "[features]\nhooks = false\n";
    const existing = `${owner}\n${table("mcp_servers")}`;
    const unedited: CoOwnedOwnership = {
      ...LEGACY,
      ledgerHashes: ledgerHashIndex(ROOT, [{ path: ".codex/config.toml", contentHash: createHash("sha256").update(existing).digest("hex") }]),
    };
    const planned = plan(existing, unedited);
    expect(planned.result.action).toBe("unchanged");
    expect(planned.result.warning).toContain("hooks = false");
    expect(Object.keys(planned.record?.members ?? {})).toEqual(["/mcp_servers"]);
  });

  it("reduce: a record over a [features] no release wrote takes nothing to remove or back up there", () => {
    const owner = "[features]\nhooks = false\n";
    const reduction = reduce(`${owner}\n${table("mcp_servers")}`, { record: { members: { "/features": hash(owner), ...recordFor("mcp_servers").members } } });
    expect(reduction).toMatchObject({ kind: "reduced", content: owner, proven: true });
    expect("mustBackUp" in reduction).toBe(false);
  });
});

describe("owner keys that define an engine table without a header are a co-owned-shape collision (S12, review/51)", () => {
  const cases: [string, string, string[], string, number][] = [
    ["a dotted key at the root", "features.web_search = true\n", [], "features.web_search", 1],
    ["an inline table at the root", 'model = "o3"\nfeatures = { web_search = true }\n', [], "features", 2],
    ["a dotted key at the root under the bare [mcp_servers] the engine writes", 'mcp_servers.team.command = "team-mcp"\n', [], "mcp_servers.team.command", 1],
    ["an inline [mcp_servers] at the root beside a selected server", 'mcp_servers = { team = { command = "x" } }\n', ["github"], "mcp_servers", 1],
    ["an inline server inside an owner's [mcp_servers]", '[mcp_servers]\ngithub = { command = "x" }\n', ["github"], "mcp_servers.github", 2],
    ["a dotted server key inside an owner's [mcp_servers]", '[mcp_servers]\n"github" . command = "x"\n', ["github"], "mcp_servers.github.command", 2],
    ["a server in an owner's [[mcp_servers]] element", '[[mcp_servers]]\ngithub = { command = "x" }\n', ["github"], "mcp_servers.github", 2],
  ];
  for (const [name, raw, servers, key, line] of cases) {
    it(`${name}: skipped, naming \`${key}\` and line ${line}, never offering --force`, () => {
      const emitted = emittedFor(servers);
      for (const ownership of [ADOPTION, recorded(recordFor("features"))]) {
        const planned = plan(raw, ownership, emitted, servers);
        expect(planned.result.action).toBe("skipped");
        expect(planned.content).toBeNull();
        expect(planned.record).toBeNull();
        expect(planned.collision).toContain(`\`${key}\``);
        expect(planned.collision).toContain(`line ${line}`);
        expect(planned.collision).toContain(".codex/config.toml");
        expect(planned.collision).not.toMatch(/force/iu);
      }
    });
  }

  it("a dotted key at the root under a server table the engine does not write is no collision: TOML lets a header add a sub-table", () => {
    const raw = 'mcp_servers.team.command = "team-mcp"\n';
    const planned = plan(raw, ADOPTION, GITHUB, ["github"]);
    expect(planned.collision).toBeNull();
    expect(planned.content).toBe(`${raw}\n${GITHUB}`);
  });

  it("an engine name under another table, and a line that is no key, are no collision", () => {
    const raw = '[profiles.x]\nfeatures.web_search = true\nmcp_servers = { a = 1 }\nstray words\n';
    expect(plan(raw, ADOPTION).collision).toBeNull();
  });
});

describe("an owner [[mcp_servers]] array of tables beside a server the engine writes is a co-owned-shape collision (S12, build/48)", () => {
  const arrayRefusal = (line: number): string =>
    `Skipped .codex/config.toml: line ${line} declares [[mcp_servers]], an array of tables, where the engine writes a ` +
    `[mcp_servers.github] table under that name, and TOML gives \`mcp_servers\` one definition: Codex would read the ` +
    `engine's table inside your array, or refuse the file. It was left untouched. Rename your array, or define each of ` +
    `your servers as an [mcp_servers.<id>] table, and re-run sync.`;
  const shapes: [string, string, number][] = [
    ["alone", "[[mcp_servers]]\n", 1],
    ["with an unrelated key", 'model = "o3"\n\n[[mcp_servers]]\nname = "team"\n', 3],
    ["with an unrelated key, after a comment above its header", '# the team servers\n[[mcp_servers]]\nname = "team"\n', 2],
  ];
  for (const [name, raw, line] of shapes) {
    it(`${name}: skipped, naming [[mcp_servers]] and line ${line}, never offering --force`, () => {
      for (const ownership of [ADOPTION, recorded(recordFor("features"))]) {
        const planned = plan(raw, ownership, GITHUB, ["github"]);
        expect(planned.result).toEqual({ path: FILE, action: "skipped", warning: arrayRefusal(line) });
        expect(planned.collision).toBe(arrayRefusal(line));
        expect(planned.content).toBeNull();
        expect(planned.backup).toBeNull();
        expect(planned.record).toBeNull();
        expect(planned.collision).not.toMatch(/force/iu);
      }
    });
  }

  it("after the engine's recorded block, under CRLF: skipped, naming its line", () => {
    const raw = `${GITHUB}\n[[mcp_servers]]\nname = "team"\n`.replaceAll("\n", "\r\n");
    const line = GITHUB.split("\n").length + 1;
    const planned = plan(raw, recorded(recordFor("features", "mcp_servers.github")), GITHUB, ["github"]);
    expect(planned.collision).toBe(arrayRefusal(line));
    expect(planned.content).toBeNull();
  });

  it("with a key for a selected server: skipped, naming that key and its line (review/51's rule, which reads first)", () => {
    const planned = plan('[[mcp_servers]]\ngithub = { command = "x" }\n', ADOPTION, GITHUB, ["github"]);
    expect(planned.result.action).toBe("skipped");
    expect(planned.collision).toContain("`mcp_servers.github`");
    expect(planned.collision).toContain("line 2");
    expect(planned.collision).not.toMatch(/force/iu);
  });

  it("with no server selected it is no collision: the engine writes no table under that name and keeps yours", () => {
    const planned = plan('[[mcp_servers]]\nname = "team"\n', ADOPTION);
    expect(planned.collision).toBeNull();
    expect(planned.content).toBe(`[[mcp_servers]]\nname = "team"\n\n${table("features")}`);
  });

  it("init over [[mcp_servers]] with github selected skips the file and leaves it byte for byte", async () => {
    const root = await freshRepo();
    const owner = 'model = "o3"\n\n[[mcp_servers]]\nname = "team"\n';
    await seedConfig(root, owner);

    const report = await init(root, ["github"]);

    expect(await readConfig(root)).toBe(owner);
    const row = configRow(report.wrote);
    expect(row.action).toBe("skipped");
    expect(row.warning).toContain("line 3 declares [[mcp_servers]]");
    expect(row.warning).not.toMatch(/force/iu);
  });
});

describe("an owner comment between two engine tables keeps its place (review/52)", () => {
  const NOTE = "# owner note\n\n";
  const between = `${table("features")}${NOTE}${table("mcp_servers.github")}`;
  const record = recordFor("features", "mcp_servers.github");

  it("an unchanged block keeps its bytes, comment and all, run after run", () => {
    const first = plan(between, recorded(record), GITHUB, ["github"]);
    expect(first.result.action).toBe("unchanged");
    expect(first.record?.members).toEqual(record.members);
    const second = plan(between, recorded(first.record as CoOwnership), GITHUB, ["github"]);
    expect(second.result.action).toBe("unchanged");
  });

  it("a rebuilt block keeps the comment above the table it sat above, and the next run leaves it there", () => {
    const emitted = emittedFor(["github", "linear"]);
    const first = plan(between, recorded(record), emitted, ["github", "linear"]);
    expect(first.content).toBe(`${table("features")}\n${NOTE}${table("mcp_servers.github")}\n${table("mcp_servers.linear")}`);
    const second = plan(first.content as string, recorded(first.record as CoOwnership), emitted, ["github", "linear"]);
    expect(second.result.action).toBe("unchanged");
    expect(second.record).toEqual(first.record);
  });

  it("a comment above a table that leaves goes ahead of the block, and the next run leaves it there", () => {
    const first = plan(`model = "o3"\n\n${between}`, recorded(record), EMPTY, []);
    expect(first.content).toBe(`model = "o3"\n\n${NOTE}${EMPTY}`);
    expect(first.backup).toBeNull();
    const second = plan(first.content as string, recorded(first.record as CoOwnership), EMPTY, []);
    expect(second.result.action).toBe("unchanged");
    expect(second.record).toEqual(first.record);
  });

  it("an owner table inside the run moves after the block once (S14), and the next run leaves it there", () => {
    const owner = '[profiles.x]\nmodel = "o3"\n';
    const first = plan(`${table("features")}\n${owner}\n${table("mcp_servers")}`, recorded(recordFor("features", "mcp_servers")));
    const second = plan(first.content as string, recorded(first.record as CoOwnership));
    expect(second.result.action).toBe("unchanged");
    expect(second.record).toEqual(first.record);
  });
});

describe("a legacy table whose comments differ from the rendering is replaced only behind a .bak (review/53)", () => {
  const github = table("mcp_servers.github");
  const legacyFile = (body: string): string => `${RELEASED_FEATURES["1.10.0"]}\n${body}`;

  for (const [where, body] of [
    ["inside its body", github.replace('command = "npx"\n', 'command = "npx"\n# my note\n')],
    ["after the last table", `${github}# my note\n`],
  ] as const) {
    it(`an owner comment ${where}: the previous file is backed up, the warning names the table`, () => {
      const existing = legacyFile(body);
      const planned = plan(existing, LEGACY, GITHUB, ["github"]);
      expect(planned.content).toBe(GITHUB);
      expect(planned.backup).toBe(existing);
      expect(planned.result.warning).toContain("[mcp_servers.github]");
    });
  }

  it("a file the ledger proves unedited is refreshed silently", () => {
    const existing = legacyFile(`${github}# my note\n`);
    const unedited: CoOwnedOwnership = {
      ...LEGACY,
      ledgerHashes: ledgerHashIndex(ROOT, [{ path: ".codex/config.toml", contentHash: createHash("sha256").update(existing).digest("hex") }]),
    };
    const planned = plan(existing, unedited, GITHUB, ["github"]);
    expect(planned.content).toBe(GITHUB);
    expect(planned.backup).toBeNull();
  });
});

describe("a byte-order mark an editor adds stays the owner's and leaves the engine's tables the engine's (review/54)", () => {
  const BOM = String.fromCharCode(0xfeff);

  it("an unchanged file keeps its mark and its record", () => {
    const planned = plan(`${BOM}${EMPTY}`, recorded(recordFor("features", "mcp_servers")));
    expect(planned.result.action).toBe("unchanged");
    expect(planned.record?.members).toEqual(recordFor("features", "mcp_servers").members);
  });

  it("a rebuilt block keeps the mark ahead of it", () => {
    const planned = plan(`${BOM}${EMPTY}`, recorded(recordFor("features", "mcp_servers")), GITHUB, ["github"]);
    expect(planned.content).toBe(`${BOM}${GITHUB}`);
  });

  it("reduce: the file is still engine-only", () => {
    const reduction = reduce(`${BOM}${EMPTY}`, { record: { ...recordFor("features", "mcp_servers"), createdFile: true }, deleteWhenEngineOnly: true });
    expect(reduction).toMatchObject({ kind: "engine-only", proven: true });
  });
});

describe("the planner holds the manifest reader's record bound: too many selected servers is a named collision, never a refused manifest (review/57)", () => {
  /** `count` pack-supplied servers, each rendered as the adapter renders a selected one. */
  const selection = (count: number) => {
    const servers: PackSuppliedServer[] = Array.from({ length: count }, (_, i) => ({
      ...(CURATED_MCP_SERVERS["context7"] as McpServerMeta),
      id: `opspack.s${i}`,
      firstParty: false,
      sourcePackId: "opspack",
    }));
    const renderMany = codexConfigTableRendering(servers);
    const ids = servers.map((server) => server.id);
    const emitted = ["features", ...ids.map((id) => tomlTableName(["mcp_servers", id]))]
      .map((name) => renderMany(name) ?? "")
      .join("\n");
    return { ids, emitted, planWith: (existing: string | null, ownership: CoOwnedOwnership) => planCodexConfigToml(FILE, emitted, existing, ownership, renderMany, ids) };
  };
  const refusal = (tables: number): string =>
    `Skipped .codex/config.toml: it would hold ${tables} of the engine's tables, more than the 64 the ledger can record ` +
    `for one file, so the engine could not tell its own tables from yours on the next run. Nothing was written to it. ` +
    `Remove MCP servers you do not use (\`stamity config mcp remove <id>\`) and re-run sync.`;

  it("63 selected servers: [features] plus 63 server tables is the bound itself, recorded, and the reader takes the record", () => {
    const { planWith } = selection(63);
    const planned = planWith(null, ADOPTION);
    expect(planned.collision).toBeNull();
    expect(planned.result.action).toBe("created");
    expect(Object.keys(planned.record?.members ?? {})).toHaveLength(64);
    const manifest = createManifest({ tools: ["codex"], selection: { items: { agent: [], skill: [], rule: [], command: [] } }, generatorVersion: "1.0.0", now: T0 });
    const row: LedgerEntry = { path: CODEX_CONFIG_FILE, adapter: "codex", artifactId: "codex-config", artifactType: "infra", contentHash: "0".repeat(64), coOwned: planned.record as CoOwnership };
    expect(collectManifestErrors({ ...manifest, ledger: [row] })).toEqual([]);
  });

  it("64 selected servers: refused as a co-owned-shape collision naming the bound, over a new file and over an existing one, never offering --force", () => {
    const { planWith } = selection(64);
    const owner = `model = "o3"\n\n${TEAM_TABLE}`;
    for (const [existing, ownership] of [
      [null, ADOPTION],
      [owner, ADOPTION],
      [EMPTY, recorded({ ...recordFor("features", "mcp_servers"), createdFile: true })],
    ] as const) {
      const planned = planWith(existing, ownership);
      expect(planned.result).toEqual({ path: FILE, action: "skipped", warning: refusal(65) });
      expect(planned.collision).toBe(refusal(65));
      expect(planned.content).toBeNull();
      expect(planned.backup).toBeNull();
      expect(planned.record).toBeNull();
      expect(planned.collision).not.toMatch(/force/iu);
    }
  });
});

describe("reduceCodexConfigToml", () => {
  it("leaves an unreadable file untouched, naming the line", () => {
    const reduction = reduce("[a]\nx = [\n");
    expect(reduction.kind).toBe("untouched");
    expect(reduction.detail).toContain("line 2");
  });

  it("leaves a file holding none of the engine's tables untouched", () => {
    expect(reduce('[profiles.x]\nmodel = "o3"\n', { record: recordFor("features") }).kind).toBe("untouched");
  });

  it("an engine-created file with nothing else is engine-only and proven", () => {
    expect(reduce(EMPTY, { record: { ...recordFor("features", "mcp_servers"), createdFile: true }, deleteWhenEngineOnly: true })).toEqual({
      kind: "engine-only",
      proven: true,
      detail: expect.stringContaining("2 tables ([features], [mcp_servers])") as unknown as string,
    });
  });

  it("without the delete licence the same file reduces to nothing", () => {
    const reduction = reduce(EMPTY, { record: recordFor("features", "mcp_servers") });
    expect(reduction).toMatchObject({ kind: "reduced", content: "", proven: true });
  });

  it("removes the engine's block from the end with its separator and the line break it added", () => {
    const owner = 'model = "o3"';
    const reduction = reduce(`${owner}\n\n${EMPTY}`, { record: { ...recordFor("features", "mcp_servers"), terminatorAdded: true } });
    expect(reduction).toMatchObject({ kind: "reduced", content: owner, proven: true });
  });

  it("keeps an owner table that follows the engine's block, and reads a recorded table it cannot re-render as must-back-up", () => {
    const team = '[mcp_servers.team]\ncommand = "team-mcp"\n';
    const reduction = reduce(`${EMPTY}\n${team}`, { record: { members: { ...recordFor("features").members, "/mcp_servers/team": hash(team) } } });
    expect(reduction).toMatchObject({ kind: "reduced", proven: false, mustBackUp: true });
    expect(reduction.kind === "reduced" ? reduction.content : null).toBe(`${table("mcp_servers")}\n`);
    expect(reduction.detail).toContain("[mcp_servers.team]");
  });

  it("removes one table and names it, the owner's [features] kept", () => {
    const owner = "[features]\nweb_search = true\n";
    const reduction = reduce(`${owner}\n${table("mcp_servers")}`, { record: recordFor("mcp_servers") });
    expect(reduction).toMatchObject({ kind: "reduced", content: owner, proven: true });
    expect(reduction.detail).toContain("1 table ([mcp_servers])");
  });

  it("legacy: removes the 1.11.0 tables unproven, leaving the whole-file proof to the sweep", () => {
    const reduction = reduce(V1_11, { legacy: true, deleteWhenEngineOnly: true });
    expect(reduction).toMatchObject({ kind: "engine-only", proven: false });
    expect("mustBackUp" in reduction).toBe(false);
  });
});

// ── A table defined twice (review/93) ──────────────────────────

describe("a standard table defined twice in the kept file is a co-owned-shape collision (review/93)", () => {
  const twice = (name: string, line: number, first: number): string =>
    `Skipped .codex/config.toml: line ${line} defines [${name}] a second time (line ${first} defines it first), and ` +
    `TOML refuses a table defined twice, so Codex would load none of this file. It was left untouched. Merge the two ` +
    `[${name}] tables into one and re-run sync.`;
  const shapes: [string, string, string, number, number][] = [
    ["two owner [features] tables", "[features]\nweb_search = true\n\n[features]\nhooks = true\n", "features", 4, 1],
    ["a bare and a quoted header", '[features]\nx = 1\n# a note\n["features"]\ny = 2\n', "features", 4, 1],
    ["two spellings of one server table", '[mcp_servers.team]\ncommand = "a"\n\n[ mcp_servers . \'team\' ]\ncommand = "b"\n', "mcp_servers.team", 4, 1],
    ["an owner table of no engine name", 'model = "o3"\n\n[profiles.x]\na = 1\n\n[profiles.x]\nb = 2\n', "profiles.x", 6, 3],
    ["a quoted name that needs its quotes", '["a b"]\nx = 1\n["a b"]\n', '"a b"', 3, 1],
  ];
  for (const [name, raw, shown, line, first] of shapes) {
    it(`${name}: skipped, naming [${shown}] and line ${line}, the file untouched and no --force`, () => {
      for (const ownership of [ADOPTION, recorded(recordFor("features")), LEGACY]) {
        for (const text of [raw, raw.replaceAll("\n", "\r\n")]) {
          const planned = plan(text, ownership);
          expect(planned.result).toEqual({ path: FILE, action: "skipped", warning: twice(shown, line, first) });
          expect(planned.collision).toBe(twice(shown, line, first));
          expect(planned.content).toBeNull();
          expect(planned.backup).toBeNull();
          expect(planned.record).toBeNull();
          expect(planned.collision).not.toMatch(/force/iu);
        }
      }
    });
  }

  it("carries a kept hooks-off key's sentence beside the refusal", () => {
    const planned = plan("[features]\nhooks = false\n[features]\n", ADOPTION);
    expect(planned.collision).toContain(twice("features", 3, 1));
    expect(planned.collision).toContain("`hooks = false` in [features] (line 2)");
  });

  it("repeated [[x]] arrays of tables, and a sub-table beside its parent, are no collision", () => {
    const raw = '[[profiles]]\nname = "a"\n\n[[profiles]]\nname = "b"\n\n[tools]\n[tools.x]\n';
    const planned = plan(raw, ADOPTION);
    expect(planned.collision).toBeNull();
    expect(planned.content).toBe(`${raw}\n${EMPTY}`);
  });

  it("reduce: leaves the file untouched, naming the table", () => {
    const raw = `${EMPTY}\n[profiles.x]\na = 1\n[profiles.x]\n`;
    const reduction = reduce(raw, { record: recordFor("features", "mcp_servers") });
    expect(reduction.kind).toBe("untouched");
    expect(reduction.detail).toContain("[profiles.x]");
    expect(reduction.detail).toContain("defined twice");
  });

  it("init skips the file byte for byte, check exits 1 on it, and sync after an owner's edit skips it too", async () => {
    const root = await freshRepo();
    const owner = 'model = "o3"\n\n[features]\nweb_search = true\n\n[features]\nhooks = true\n';
    await seedConfig(root, owner);

    const report = await init(root);
    expect(configRow(report.wrote)).toMatchObject({ action: "skipped", warning: twice("features", 6, 3) });
    expect(await readConfig(root)).toBe(owner);

    const drift = await runDriftGate(root, ENGINE_VERSION);
    const entry = drift.changes.find((change) => change.path === CODEX_CONFIG_FILE);
    expect(entry?.collisionKind).toBe("co-owned-shape");
    expect(entry?.detail).toContain("[features] a second time");
    expect((await runInProcess([checkCommand], ["check"], { cwd: root })).code).toBe(1);

    const later = await freshRepo();
    await init(later);
    const edited = `${await readConfig(later)}\n[profiles.x]\na = 1\n\n[profiles.x]\nb = 2\n`;
    await writeFile(CONFIG_ABS(later), edited, "utf8");
    const synced = await sync(later);
    expect(configRow(synced.wrote).action).toBe("skipped");
    expect(configRow(synced.wrote).warning).toContain("[profiles.x] a second time");
    expect(await readConfig(later)).toBe(edited);
    expect(await backups(later)).toEqual([]);
  });
});
