import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
import { planCodexConfigToml, reduceCodexConfigToml } from "../../src/manifest/codexConfigToml.ts";
import type { CoOwnedOwnership, CoOwnedPlan } from "../../src/manifest/coOwnedJson.ts";
import { readManifest, writeManifest } from "../../src/manifest/manifest.ts";
import { normaliseSegment } from "../../src/manifest/tomlTables.ts";
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

/** The 1.11.0 document: the same tables under the old comment text, a blank line inside the preamble. */
const V1_11 = [
  "# stamity — Codex CLI configuration. Generated file: regenerate rather than editing",
  "# it; local edits are overwritten.",
  "",
  "# Lifecycle hooks: an emitted hooks.json is read only while this key is on.",
  "",
  "[features]",
  "hooks = true",
  "",
  "# No MCP servers selected.",
  "[mcp_servers]",
  "",
].join("\n");

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

  it("recorded: when every engine name is the owner's, the engine writes nothing and its block leaves with its separator and its line break", () => {
    const owner = "[features]\nweb_search = true\n[mcp_servers]\nx = 1";
    const existing = `${owner}\n\n${table("mcp_servers")}`;
    const planned = plan(existing, recorded({ ...recordFor("mcp_servers"), terminatorAdded: true }));
    expect(planned.content).toBe(owner);
    expect(planned.backup).toBeNull();
    expect(planned.record).toEqual({});
  });

  it("recorded: when every engine name is the owner's and an owner table follows the block, only the block leaves", () => {
    const owner = "[features]\nweb_search = true\n[mcp_servers]\nx = 1\n";
    const after = '[profiles.x]\nmodel = "o3"\n';
    const planned = plan(`${owner}\n${table("mcp_servers")}\n${after}`, recorded({ ...recordFor("mcp_servers"), terminatorAdded: true }));
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
    expect(planned.result.warning).toBe(
      "Codex reads no .codex/hooks.json while features.hooks is off: remove `hooks = false` from the [features] table in .codex/config.toml.",
    );
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

  it("writes one copy of an engine table the owner pasted twice", () => {
    const existing = `${EMPTY}\n${table("mcp_servers")}`;
    const planned = plan(existing, recorded(recordFor("features", "mcp_servers")));
    expect(planned.content).toBe(EMPTY);
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
