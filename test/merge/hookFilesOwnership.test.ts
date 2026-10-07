import { existsSync, readFileSync } from "node:fs";
import { link, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MCP_GUARD_PATH, SUBAGENT_GUARD_PATH } from "../../src/adapters/cursor.ts";
import { checkCommand, runDriftGate } from "../../src/cli/commands/check.ts";
import { cleanCommand } from "../../src/cli/commands/clean.ts";
import { applyInit } from "../../src/cli/commands/init/apply.ts";
import { buildInitDecisions } from "../../src/cli/commands/init/plan.ts";
import { syncCommand } from "../../src/cli/commands/sync.ts";
import { applySync, planSync, type SyncPlanEntry } from "../../src/cli/commands/sync/engine.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../src/content/contentRoot.ts";
import { sha256 } from "../../src/cli/engine/emissionWrite.ts";
import { createApp } from "../../src/index.ts";
import { readManifest, writeManifest } from "../../src/manifest/manifest.ts";
import { applyPackInstall, planPackInstall } from "../../src/pack/install.ts";
import type { MergeResult } from "../../src/types/content.ts";
import type { Tool } from "../../src/types/core.ts";
import { HOOKS_GENERATED_DIR, STATE_DIR } from "../../src/types/markers.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Cursor's and Codex's hook files owned ENTRY BY ENTRY (REQ-FLOW-037, S10–S14,
 * S17, S19), asserted at the shipped verbs over a real temp repository — the
 * posture `./settingsKeyOwnership.test.ts` takes for `.claude/settings.json`.
 *
 * Measured on 1.11.0 (the plan's r1): an owner entry in `.cursor/hooks.json`
 * and an owner group in `.codex/hooks.json` were each dropped by `sync -y`
 * behind a `.bak`, and `check` reported the file as drift; with an owner entry
 * and no sync between, `clean -y` kept the hooks file whole and deleted every
 * script it runs — on Cursor both `failClosed` guards, after which Cursor
 * denies every sub-agent spawn and MCP call.
 */

const ENGINE_VERSION = createApp().version;
const T0 = new Date("2026-10-07T09:00:00.000Z");
const T1 = new Date("2026-10-07T10:00:00.000Z");

const CURSOR_HOOKS = ".cursor/hooks.json";
const CODEX_HOOKS = ".codex/hooks.json";
const CURSOR_RUNNER = `${HOOKS_GENERATED_DIR}/cursor/stamity-portable-hook.mjs`;
const CODEX_RUNNER = `${HOOKS_GENERATED_DIR}/codex/stamity-portable-hook.mjs`;

/** An owner's own Cursor hook, as the plan's criterion writes it. */
const OWNER_CURSOR_ENTRY = { command: "node scripts/fmt.mjs" };
/** An owner's own Codex group, as the plan's criterion writes it. */
const OWNER_CODEX_GROUP = { matcher: "Bash", hooks: [{ type: "command", command: "node scripts/team-audit.mjs" }] };

const getTemp = useTempDir("hook-files-ownership");

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

async function init(root: string, tools: readonly Tool[]): ReturnType<typeof applyInit> {
  const decisions = await buildInitDecisions(root, { tools: [...tools] });
  return applyInit({ rootDir: root, decisions, engineVersion: ENGINE_VERSION, dryRun: false, force: false, now: T0 });
}

async function sync(root: string): Promise<{ entries: SyncPlanEntry[]; report: Awaited<ReturnType<typeof applySync>> }> {
  const plan = await planSync(root, ENGINE_VERSION, { runner: () => "" });
  const report = await applySync(root, plan, { engineVersion: ENGINE_VERSION, force: false, dryRun: false, now: T1 });
  return { entries: plan.entries, report };
}

function clean(root: string, args: readonly string[] = []): ReturnType<typeof runInProcess> {
  return runInProcess([cleanCommand], ["clean", "-y", ...args], { cwd: root });
}

const abs = (root: string, path: string): string => join(root, ...path.split("/"));

async function readText(root: string, path: string): Promise<string> {
  return readFile(abs(root, path), "utf8");
}

async function readDoc(root: string, path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readText(root, path)) as Record<string, unknown>;
}

async function writeDoc(root: string, path: string, doc: unknown): Promise<void> {
  await writeFile(abs(root, path), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

/** Append `entry` to `hooks.<event>` of the document at `path`, as an owner edits it. */
async function addHookEntry(root: string, path: string, event: string, entry: unknown): Promise<void> {
  const doc = await readDoc(root, path);
  const hooks = doc["hooks"] as Record<string, unknown[]>;
  hooks[event] = [...(hooks[event] ?? []), entry];
  await writeDoc(root, path, doc);
}

/** Every `.bak` the repository holds, repo-relative, so an assertion names any it did not expect. */
async function backups(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".bak"))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .toSorted();
}

/** The report row of `path`, whichever spelling the verb reports it under. */
function rowOf(wrote: readonly MergeResult[], path: string): MergeResult {
  const row = wrote.find((entry) => entry.path.replaceAll("\\", "/").endsWith(path));
  if (row === undefined) throw new Error(`no ${path} row in ${JSON.stringify(wrote.map((r) => r.path))}`);
  return row;
}

/** Rewrites the manifest to 1.11.0's shape: rows without a co-owned record. */
async function asReleaseOneEleven(root: string): Promise<void> {
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("fixture lost its manifest");
  const ledger = manifest.ledger.map((row) => {
    const { coOwned: _dropped, ...rest } = row;
    return rest;
  });
  await writeManifest(root, { ...manifest, ledger }, { now: T1 });
}

/** Re-points the ledger's whole-file hash at the bytes now on disk: what the engine last wrote there. */
async function recordAsWritten(root: string, path: string): Promise<void> {
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("fixture lost its manifest");
  const contentHash = sha256(await readText(root, path));
  const ledger = manifest.ledger.map((row) => (row.path === path ? { ...row, contentHash } : row));
  await writeManifest(root, { ...manifest, ledger }, { now: T1 });
}

async function selectTools(root: string, tools: readonly Tool[]): Promise<void> {
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("fixture lost its manifest");
  await writeManifest(root, { ...manifest, tools: [...tools] }, { now: T1 });
}

// ── Cursor ─────────────────────────────────────────────────────

describe(".cursor/hooks.json owned entry by entry", () => {
  it("an owner entry is no drift, and sync -y leaves the file byte-identical with no .bak", async () => {
    const root = await freshRepo();
    await init(root, ["cursor"]);
    await addHookEntry(root, CURSOR_HOOKS, "afterFileEdit", OWNER_CURSOR_ENTRY);
    const before = await readText(root, CURSOR_HOOKS);

    const drift = await runDriftGate(root, ENGINE_VERSION);
    expect(drift.changes.filter((entry) => entry.path === CURSOR_HOOKS)).toEqual([]);
    const check = await runInProcess([checkCommand], ["check", "--json"], { cwd: root });
    expect((JSON.parse(check.stdout.trim()) as { drift: { clean: boolean } }).drift.clean).toBe(true);

    const { report } = await sync(root);
    expect(rowOf(report.wrote, CURSOR_HOOKS).action).toBe("unchanged");
    expect(await readText(root, CURSOR_HOOKS)).toBe(before);
    expect(await backups(root)).toEqual([]);
  });

  it("clean -y with no sync between leaves version and the owner entry alone, removes both guards and the runner, and takes no .bak", async () => {
    const root = await freshRepo();
    await init(root, ["cursor"]);
    await addHookEntry(root, CURSOR_HOOKS, "afterFileEdit", OWNER_CURSOR_ENTRY);

    const cleaned = await clean(root);

    expect(cleaned.code).toBe(0);
    expect(await readText(root, CURSOR_HOOKS)).toBe(
      '{\n  "version": 1,\n  "hooks": {\n    "afterFileEdit": [\n      {\n        "command": "node scripts/fmt.mjs"\n      }\n    ]\n  }\n}\n',
    );
    expect(existsSync(abs(root, SUBAGENT_GUARD_PATH))).toBe(false);
    expect(existsSync(abs(root, MCP_GUARD_PATH))).toBe(false);
    expect(existsSync(abs(root, CURSOR_RUNNER))).toBe(false);
    expect(await backups(root)).toEqual([]);
  });

  it("a 1.11.0 setup with an owner entry: clean -y before any sync keeps the owner entry alone, the engine's entries leave behind a verified .bak", async () => {
    const root = await freshRepo();
    await init(root, ["cursor"]);
    await asReleaseOneEleven(root);
    const engineBytes = await readText(root, CURSOR_HOOKS);
    await addHookEntry(root, CURSOR_HOOKS, "afterFileEdit", OWNER_CURSOR_ENTRY);
    const edited = await readText(root, CURSOR_HOOKS);
    expect(edited).not.toBe(engineBytes);

    const cleaned = await clean(root);

    expect(cleaned.code).toBe(0);
    expect(await readDoc(root, CURSOR_HOOKS)).toEqual({ version: 1, hooks: { afterFileEdit: [OWNER_CURSOR_ENTRY] } });
    expect(await backups(root)).toEqual([`${CURSOR_HOOKS}.bak`]);
    expect(await readText(root, `${CURSOR_HOOKS}.bak`)).toBe(edited);
  });

  it("a 1.11.0 setup with an owner entry: the first sync keeps it, writes nothing, and records the engine's entries", async () => {
    const root = await freshRepo();
    await init(root, ["cursor"]);
    await asReleaseOneEleven(root);
    await addHookEntry(root, CURSOR_HOOKS, "afterFileEdit", OWNER_CURSOR_ENTRY);
    const before = await readText(root, CURSOR_HOOKS);

    const { report } = await sync(root);

    expect(rowOf(report.wrote, CURSOR_HOOKS).action).toBe("unchanged");
    expect(await readText(root, CURSOR_HOOKS)).toBe(before);
    expect(await backups(root)).toEqual([]);
    const rows = (await readManifest(root))?.ledger.filter((row) => row.path === CURSOR_HOOKS) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.coOwned?.members?.["/version"] !== undefined)).toBe(true);
    expect(Object.keys(rows[0]?.coOwned?.elements ?? {})).toContain("/hooks/subagentStart");
  });

  it("a version the owner changed is a co-owned-shape collision naming it, and sync writes nothing", async () => {
    const root = await freshRepo();
    await init(root, ["cursor"]);
    const doc = await readDoc(root, CURSOR_HOOKS);
    await writeDoc(root, CURSOR_HOOKS, { ...doc, version: 2 });
    const before = await readText(root, CURSOR_HOOKS);

    const plan = await planSync(root, ENGINE_VERSION, { runner: () => "" });
    const entry = plan.entries.find((candidate) => candidate.path === CURSOR_HOOKS);
    expect(entry).toMatchObject({ action: "collision", collisionKind: "co-owned-shape" });
    expect(entry?.detail).toContain("version");
    expect(entry?.detail).not.toContain("--force");
    expect(await readText(root, CURSOR_HOOKS)).toBe(before);
  });

  it("Cursor deselected with an owner entry: the engine's entries leave, the file keeps version and the owner entry, and the guards go", async () => {
    const root = await freshRepo();
    await init(root, ["claude", "cursor"]);
    await addHookEntry(root, CURSOR_HOOKS, "afterFileEdit", OWNER_CURSOR_ENTRY);
    await selectTools(root, ["claude"]);

    await sync(root);

    expect(await readDoc(root, CURSOR_HOOKS)).toEqual({ version: 1, hooks: { afterFileEdit: [OWNER_CURSOR_ENTRY] } });
    expect(existsSync(abs(root, SUBAGENT_GUARD_PATH))).toBe(false);
    expect(existsSync(abs(root, MCP_GUARD_PATH))).toBe(false);
    expect(await backups(root)).toEqual([]);
  });
});

// ── S19: an entry Cursor rejects ───────────────────────────────

describe(".cursor/hooks.json holding an entry Cursor rejects (S19)", () => {
  /** What apm-cli 0.33.0 writes for the cursor target: Claude Code's nested shape under a PascalCase key. */
  const APM_PRE_TOOL_USE = [{ matcher: "Bash", hooks: [{ type: "command", command: "node .cursor/hooks/pkg/gate.mjs", timeout: 10 }] }];

  it("check exits 1 naming the key and the remedy; sync -y keeps it, warns naming it once, and exits 0", async () => {
    const root = await freshRepo();
    await init(root, ["cursor"]);
    const doc = await readDoc(root, CURSOR_HOOKS);
    (doc["hooks"] as Record<string, unknown>)["PreToolUse"] = APM_PRE_TOOL_USE;
    await writeDoc(root, CURSOR_HOOKS, doc);
    const before = await readText(root, CURSOR_HOOKS);

    const drift = await runDriftGate(root, ENGINE_VERSION);
    expect(drift.clean).toBe(false);
    const flagged = drift.changes.find((entry) => entry.path === CURSOR_HOOKS);
    expect(flagged?.rejected).toContain("/hooks/PreToolUse");

    const human = await runInProcess([checkCommand], ["check"], { cwd: root });
    expect(human.code).toBe(1);
    expect(human.stdout).toContain("/hooks/PreToolUse");
    expect(human.stdout).toContain("without the cursor target");
    const json = await runInProcess([checkCommand], ["check", "--json"], { cwd: root });
    expect(json.code).toBe(1);

    const { report } = await sync(root);
    const row = rowOf(report.wrote, CURSOR_HOOKS);
    expect(row.action).toBe("unchanged");
    expect(row.warning?.split("/hooks/PreToolUse").length).toBe(2);
    expect(await readText(root, CURSOR_HOOKS)).toBe(before);
  });

  it("init keeps a rejected key it finds in an owner's file, merges its entries beside it and warns naming it", async () => {
    const root = await freshRepo();
    await mkdir(abs(root, ".cursor"), { recursive: true });
    await writeDoc(root, CURSOR_HOOKS, { version: 1, hooks: { PreToolUse: APM_PRE_TOOL_USE } });

    const report = await init(root, ["cursor"]);

    const row = rowOf(report.wrote, CURSOR_HOOKS);
    expect(row.action).toBe("updated");
    expect(row.warning).toContain("/hooks/PreToolUse");
    const doc = await readDoc(root, CURSOR_HOOKS);
    expect((doc["hooks"] as Record<string, unknown>)["PreToolUse"]).toEqual(APM_PRE_TOOL_USE);
    expect((doc["hooks"] as Record<string, unknown>)["subagentStart"]).toBeDefined();
  });

  it("Cursor's own prompt-hook example passes check: a prompt entry runs no command (S19, amended 2026-10-07)", async () => {
    const root = await freshRepo();
    await init(root, ["cursor"]);
    // Cursor's documented prompt-based hook (cursor.com/docs/hooks, re-read
    // 2026-10-07); the record quotes its prompt elided, so this one is ours.
    const doc = await readDoc(root, CURSOR_HOOKS);
    (doc["hooks"] as Record<string, unknown>)["beforeShellExecution"] = [
      { type: "prompt", prompt: "Is this shell command safe to run in this repository?", timeout: 10 },
    ];
    await writeDoc(root, CURSOR_HOOKS, doc);

    const drift = await runDriftGate(root, ENGINE_VERSION);
    expect(drift.changes.filter((entry) => entry.path === CURSOR_HOOKS)).toEqual([]);
    const check = await runInProcess([checkCommand], ["check", "--json"], { cwd: root });
    expect((JSON.parse(check.stdout.trim()) as { drift: { clean: boolean } }).drift.clean).toBe(true);
  });

  it("an entry with no command fails check naming its pointer", async () => {
    const root = await freshRepo();
    await init(root, ["cursor"]);
    await addHookEntry(root, CURSOR_HOOKS, "afterFileEdit", { matcher: "x" });

    const drift = await runDriftGate(root, ENGINE_VERSION);
    expect(drift.changes.find((entry) => entry.path === CURSOR_HOOKS)?.rejected).toContain("/hooks/afterFileEdit/0");
  });
});

// ── Codex ──────────────────────────────────────────────────────

describe(".codex/hooks.json owned entry by entry", () => {
  it("an owner group is no drift, and sync -y leaves the file byte-identical with no .bak", async () => {
    const root = await freshRepo();
    await init(root, ["codex"]);
    await addHookEntry(root, CODEX_HOOKS, "PostToolUse", OWNER_CODEX_GROUP);
    const before = await readText(root, CODEX_HOOKS);

    const drift = await runDriftGate(root, ENGINE_VERSION);
    expect(drift.changes.filter((entry) => entry.path === CODEX_HOOKS)).toEqual([]);

    const { report } = await sync(root);
    expect(rowOf(report.wrote, CODEX_HOOKS).action).toBe("unchanged");
    expect(await readText(root, CODEX_HOOKS)).toBe(before);
    expect(await backups(root)).toEqual([]);
  });

  it("clean -y leaves exactly the owner group, with no description, removes the runner, and takes no .bak", async () => {
    const root = await freshRepo();
    await init(root, ["codex"]);
    await addHookEntry(root, CODEX_HOOKS, "PostToolUse", OWNER_CODEX_GROUP);

    const cleaned = await clean(root);

    expect(cleaned.code).toBe(0);
    expect(await readText(root, CODEX_HOOKS)).toBe(`${JSON.stringify({ hooks: { PostToolUse: [OWNER_CODEX_GROUP] } }, null, 2)}\n`);
    expect(existsSync(abs(root, CODEX_RUNNER))).toBe(false);
    expect(await backups(root)).toEqual([]);
  });

  it("a command the owner adds inside an engine group: the group is replaced behind a .bak, the warning naming it", async () => {
    const root = await freshRepo();
    await init(root, ["codex"]);
    const doc = await readDoc(root, CODEX_HOOKS);
    const hooks = doc["hooks"] as Record<string, { hooks: unknown[] }[]>;
    const [event, groups] = Object.entries(hooks)[0] as [string, { hooks: unknown[] }[]];
    (groups[0] as { hooks: unknown[] }).hooks.push({ type: "command", command: "node scripts/extra.mjs" });
    await writeDoc(root, CODEX_HOOKS, doc);

    const { report } = await sync(root);

    const row = rowOf(report.wrote, CODEX_HOOKS);
    expect(row.action).toBe("updated");
    expect(row.warning).toContain(`hooks.${event}[0]`);
    expect(await backups(root)).toEqual([`${CODEX_HOOKS}.bak`]);
    expect(JSON.stringify(await readDoc(root, CODEX_HOOKS))).not.toContain("scripts/extra.mjs");
  });

  it("a description an earlier release rendered is updated silently, with no .bak", async () => {
    const root = await freshRepo();
    await init(root, ["codex"]);
    await asReleaseOneEleven(root);
    const doc = await readDoc(root, CODEX_HOOKS);
    const current = doc["description"];
    await writeDoc(root, CODEX_HOOKS, { ...doc, description: RELEASE_ONE_SEVEN_DESCRIPTION });

    const { report } = await sync(root);

    expect(rowOf(report.wrote, CODEX_HOOKS).action).toBe("updated");
    expect((await readDoc(root, CODEX_HOOKS))["description"]).toBe(current);
    expect(await backups(root)).toEqual([]);
  });

  it("an owner's own description, there before setup, is kept", async () => {
    const root = await freshRepo();
    await mkdir(abs(root, ".codex"), { recursive: true });
    await writeDoc(root, CODEX_HOOKS, { description: "Team hooks.", hooks: {} });

    await init(root, ["codex"]);

    expect((await readDoc(root, CODEX_HOOKS))["description"]).toBe("Team hooks.");
  });

  it("a 1.11.0 file the ledger proves unedited takes the new rendering with no .bak", async () => {
    const root = await freshRepo();
    await init(root, ["codex"]);
    await asReleaseOneEleven(root);
    const doc = await readDoc(root, CODEX_HOOKS);
    await writeDoc(root, CODEX_HOOKS, { ...doc, description: RELEASE_ONE_SEVEN_DESCRIPTION });
    await recordAsWritten(root, CODEX_HOOKS);

    await sync(root);

    expect(await backups(root)).toEqual([]);
  });
});

// ── S17: a kept hooks document keeps the scripts it runs ───────

describe("clean keeps every script a hooks document it keeps still runs (S17)", () => {
  it("a .cursor/hooks.json that does not parse keeps both guards and .stamity/, and each kept script names the document", async () => {
    const root = await freshRepo();
    await init(root, ["cursor"]);
    // The engine's own bytes with a stray tail: still every script named, no longer JSON.
    const broken = `${await readText(root, CURSOR_HOOKS)},`;
    await writeFile(abs(root, CURSOR_HOOKS), broken, "utf8");

    const cleaned = await clean(root, ["--json"]);

    expect(cleaned.code).toBe(0);
    expect(await readText(root, CURSOR_HOOKS)).toBe(broken);
    expect(existsSync(abs(root, SUBAGENT_GUARD_PATH))).toBe(true);
    expect(existsSync(abs(root, MCP_GUARD_PATH))).toBe(true);
    expect(existsSync(abs(root, CURSOR_RUNNER))).toBe(true);
    expect(existsSync(abs(root, STATE_DIR))).toBe(true);
    const doc = JSON.parse(cleaned.stdout.trim()) as {
      stateDirRemoved: boolean;
      stateDirKept?: string[];
      entries: { path: string; action: string; detail: string }[];
    };
    expect(doc.stateDirRemoved).toBe(false);
    expect(doc.stateDirKept).toContain(CURSOR_RUNNER);
    for (const path of [SUBAGENT_GUARD_PATH, MCP_GUARD_PATH, CURSOR_RUNNER]) {
      const entry = doc.entries.find((candidate) => candidate.path === path);
      expect(entry?.action).toBe("skipped-user-content");
      expect(entry?.detail).toContain(CURSOR_HOOKS);
    }
  });

  it("a .cursor/hooks.json no ledger row names is no candidate, and clean still keeps both guards it runs (review/58)", async () => {
    const root = await freshRepo();
    await init(root, ["cursor"]);
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("fixture lost its manifest");
    await writeManifest(root, { ...manifest, ledger: manifest.ledger.filter((row) => row.path !== CURSOR_HOOKS) }, { now: T1 });
    const before = await readText(root, CURSOR_HOOKS);

    const cleaned = await clean(root, ["--json"]);

    expect(cleaned.code).toBe(0);
    expect(await readText(root, CURSOR_HOOKS)).toBe(before);
    expect(existsSync(abs(root, SUBAGENT_GUARD_PATH))).toBe(true);
    expect(existsSync(abs(root, MCP_GUARD_PATH))).toBe(true);
    const doc = JSON.parse(cleaned.stdout.trim()) as { entries: { path: string; action: string; detail: string }[] };
    for (const path of [SUBAGENT_GUARD_PATH, MCP_GUARD_PATH, CURSOR_RUNNER]) {
      const entry = doc.entries.find((candidate) => candidate.path === path);
      expect(entry?.action).toBe("skipped-user-content");
      expect(entry?.detail).toContain(CURSOR_HOOKS);
    }
  });

  it("Copilot's whole-file hooks document, edited by its owner, is kept whole and keeps its runner and .stamity/", async () => {
    const root = await freshRepo();
    await init(root, ["copilot"]);
    const COPILOT_HOOKS = ".github/hooks/stamity.json";
    const edited = `${(await readText(root, COPILOT_HOOKS)).trimEnd()}\n`.replace(/\n$/, " \n");
    await writeFile(abs(root, COPILOT_HOOKS), edited, "utf8");
    const runner = `${HOOKS_GENERATED_DIR}/copilot/stamity-portable-hook.mjs`;
    expect(edited).toContain(runner);

    const cleaned = await clean(root, ["--json"]);

    expect(cleaned.code).toBe(0);
    expect(await readText(root, COPILOT_HOOKS)).toBe(edited);
    expect(existsSync(abs(root, runner))).toBe(true);
    const doc = JSON.parse(cleaned.stdout.trim()) as { stateDirRemoved: boolean; stateDirKept?: string[] };
    expect(doc.stateDirRemoved).toBe(false);
    expect(doc.stateDirKept).toContain(runner);
  });

  it("an unreadable .codex/hooks.json keeps the scripts its portable rows name only inside their encoded argv", async () => {
    const root = await freshRepo();
    await init(root, ["codex"]);
    const encoded = await readText(root, CODEX_HOOKS);
    const named = [...encoded.matchAll(/ ([A-Za-z0-9_-]{16,})"/g)].map((match) =>
      (JSON.parse(Buffer.from(match[1] as string, "base64url").toString("utf8")) as { command: string[] }).command[1] as string,
    );
    const generated = named.filter((path) => path.startsWith(`${HOOKS_GENERATED_DIR}/codex/`));
    expect(generated.length).toBeGreaterThan(0);
    for (const path of generated) expect(encoded).not.toContain(path);
    await writeFile(abs(root, CODEX_HOOKS), `${encoded}trailing`, "utf8");

    const cleaned = await clean(root);

    expect(cleaned.code).toBe(0);
    for (const path of [CODEX_RUNNER, ...generated]) expect(existsSync(abs(root, path))).toBe(true);
    expect(cleaned.stdout).toContain(`Kept ${STATE_DIR}/`);
  });
});

// ── A direct upgrade from a release up to 1.6.0 ───────────────

/** `.cursor/hooks.json` and `.codex/hooks.json` as 1.6.0's golden snapshot holds them (written by script from the tag). */
const RELEASE_ONE_SIX = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "manifest", "fixtures", "release-1-6-0-hook-files.json"), "utf8"),
) as Record<string, string>;

/** The user hook those 1.6.0 files wire directly: its script, and its definition in `.stamity/hooks/`. */
const USER_SCRIPT = ".stamity/hooks/guard.mjs";
const USER_DEFINITION = { hooks: [{ event: "pre_tool_use", matcher: "Bash", command: ["node", USER_SCRIPT], timeoutMs: 5000 }] };

/** How many hooks in the document at `path` run `script`, whether wired directly or through a runner's encoded row. */
async function runsOf(root: string, path: string, script: string): Promise<number> {
  const runs = (command: unknown): boolean => {
    if (Array.isArray(command)) return command.includes(script);
    if (typeof command !== "string") return false;
    if (command.includes(script)) return true;
    try {
      const row = JSON.parse(Buffer.from(command.slice(command.lastIndexOf(" ") + 1), "base64url").toString("utf8")) as { command?: unknown };
      return Array.isArray(row.command) && row.command.includes(script);
    } catch {
      return false;
    }
  };
  let count = 0;
  for (const elements of Object.values((await readDoc(root, path))["hooks"] as Record<string, unknown[]>)) {
    for (const element of elements as { command?: unknown; hooks?: { command?: unknown }[] }[]) {
      if (runs(element.command)) count += 1;
      for (const hook of element.hooks ?? []) if (runs(hook.command)) count += 1;
    }
  }
  return count;
}

/**
 * A repository a release up to 1.6.0 set up for `tool`, upgraded straight to
 * this one: the user hook defined, the hooks file holding 1.6.0's bytes (or
 * `edit` of them), and a ledger of that release's shape (no co-owned record,
 * Cursor's guards at their old names) whose whole-file hash is the bytes on disk.
 */
async function setUpByReleaseOneSix(
  tool: "cursor" | "codex",
  edit: (doc: Record<string, unknown>) => void = () => {},
  sub = "repo",
): Promise<string> {
  const root = await freshRepo(sub);
  await init(root, [tool]);
  // Every release up to 1.11.0 wrote and recorded the guards at their old names.
  if (tool === "cursor") await moveGuardsToOldNames(root);
  await mkdir(abs(root, ".stamity/hooks"), { recursive: true });
  await writeFile(abs(root, USER_SCRIPT), "process.exit(0)\n", "utf8");
  await writeFile(abs(root, ".stamity/hooks/guard.json"), JSON.stringify(USER_DEFINITION), "utf8");
  const path = tool === "cursor" ? CURSOR_HOOKS : CODEX_HOOKS;
  const doc = JSON.parse(RELEASE_ONE_SIX[path] as string) as Record<string, unknown>;
  edit(doc);
  await writeDoc(root, path, doc);
  await asReleaseOneEleven(root);
  await recordAsWritten(root, path);
  return root;
}

describe("a direct upgrade from a release up to 1.6.0, which wired user hooks directly (build/54, review/59, review/60)", () => {
  it.each([
    ["cursor", CURSOR_HOOKS],
    ["codex", CODEX_HOOKS],
  ] as const)("%s: the first sync runs the user hook once, through the runner, and takes no .bak", async (tool, path) => {
    const root = await setUpByReleaseOneSix(tool);
    expect(await runsOf(root, path, USER_SCRIPT)).toBe(1);

    const { report } = await sync(root);

    expect(rowOf(report.wrote, path).action).toBe("updated");
    expect(await runsOf(root, path, USER_SCRIPT)).toBe(1);
    expect(await readText(root, path)).not.toContain(USER_SCRIPT);
    expect(await backups(root)).toEqual([]);
  });

  it("codex: the first sync removes the stamity member 1.0.0–1.6.0 wrote, with no .bak (review/59)", async () => {
    const root = await setUpByReleaseOneSix("codex", (doc) => {
      const hooks = doc["hooks"] as Record<string, unknown[]>;
      hooks["PreToolUse"] = (hooks["PreToolUse"] ?? []).filter((group) => !JSON.stringify(group).includes(USER_SCRIPT));
    });
    await rm(abs(root, ".stamity/hooks/guard.json"));
    expect(await readDoc(root, CODEX_HOOKS)).toHaveProperty("stamity");

    await sync(root);

    expect(await readDoc(root, CODEX_HOOKS)).not.toHaveProperty("stamity");
    expect(await backups(root)).toEqual([]);
  });

  it.each([
    ["cursor", CURSOR_HOOKS],
    ["codex", CODEX_HOOKS],
  ] as const)("%s: clean deletes the 1.6.0 file, its direct user entry proved by the definition still present", async (tool, path) => {
    const root = await setUpByReleaseOneSix(tool);

    const cleaned = await clean(root);

    expect(cleaned.code).toBe(0);
    expect(existsSync(abs(root, path))).toBe(false);
    expect(await backups(root)).toEqual([]);
  });

  // review/60: the narrowed sign-off. A ledger edit can drop the record and
  // point the whole-file hash at the owner-edited bytes; that proves no owner
  // entry the engine's. Only an entry equal to 1.6.0's direct rendering of a
  // definition still present is.
  const OWNER_CURSOR_LOOKALIKE = { command: `node ${USER_SCRIPT}`, matcher: "Edit", failClosed: true };
  const OWNER_CODEX_LOOKALIKE = { matcher: "Edit", hooks: [{ type: "command", command: ["node", USER_SCRIPT], timeout: 5 }] };

  it.each([
    ["cursor", CURSOR_HOOKS, "preToolUse", OWNER_CURSOR_LOOKALIKE, "afterFileEdit", OWNER_CURSOR_ENTRY],
    ["codex", CODEX_HOOKS, "PreToolUse", OWNER_CODEX_LOOKALIKE, "PostToolUse", OWNER_CODEX_GROUP],
  ] as const)(
    "%s: a forged legacy row over owner-edited bytes removes no owner entry, by sync or by clean",
    async (tool, path, event, lookalike, ownEvent, own) => {
      const added = (doc: Record<string, unknown>): void => {
        const hooks = doc["hooks"] as Record<string, unknown[]>;
        hooks[event] = [...(hooks[event] ?? []), lookalike];
        hooks[ownEvent] = [...(hooks[ownEvent] ?? []), own];
      };
      const owned = (doc: Record<string, unknown>): unknown[] => {
        const hooks = doc["hooks"] as Record<string, unknown[]>;
        return [...(hooks[event] ?? []), ...(hooks[ownEvent] ?? [])];
      };
      const synced = await setUpByReleaseOneSix(tool, added);

      await sync(synced);

      expect(owned(await readDoc(synced, path))).toEqual(expect.arrayContaining([lookalike, own]));
      expect(await runsOf(synced, path, USER_SCRIPT)).toBe(2);

      const cleaned = await setUpByReleaseOneSix(tool, added, "cleaned");
      expect((await clean(cleaned)).code).toBe(0);
      expect(owned(await readDoc(cleaned, path))).toEqual([lookalike, own]);
    },
  );
});

// ── A direct upgrade with an installed pack's hook (review/69) ─

/**
 * An installed pack whose one hook shares the user hook's event and matcher,
 * so 1.6.0 put both in one Codex group ("core scripts, then user hooks, then
 * installed-pack hooks", `v1.6.0:src/emit/hooksInfra.ts`). No pack class can
 * ship a script, so a pack's hook runs a script the repository committed: one
 * elsewhere in the repository, or one an operator placed in the pack's own
 * folder, which the bound proves by path as the settings lane's does.
 */
const HOOK_PACK_ID = "acme-gate";
const PACK_SCRIPTS = {
  elsewhere: "scripts/acme-gate.mjs",
  "in the pack's folder": `${STATE_DIR}/packs/${HOOK_PACK_ID}/tools/gate.mjs`,
} as const;

/**
 * The pack's hook as 1.6.0 wired it directly into `tool`'s hooks file, after
 * the user hook: on Codex in the user hook's group when it shares its matcher,
 * else in a group of its own after it.
 */
function packEntryOfReleaseOneSix(tool: "cursor" | "codex", script: string, matcher: string): (doc: Record<string, unknown>) => void {
  return (doc) => {
    const hooks = doc["hooks"] as Record<string, Record<string, unknown>[]>;
    if (tool === "cursor") {
      hooks["preToolUse"] = [...(hooks["preToolUse"] ?? []), { command: `node ${script}`, matcher, failClosed: true }];
      return;
    }
    const groups = (hooks["PreToolUse"] ??= []);
    const group = groups.find((entry) => entry["matcher"] === matcher) as { hooks: unknown[] } | undefined;
    if (group === undefined) groups.push({ matcher, hooks: [{ type: "command", command: ["node", script] }] });
    else group.hooks.push({ type: "command", command: ["node", script] });
  };
}

/** {@link setUpByReleaseOneSix} with {@link HOOK_PACK_ID} installed through the real install path, its hook running `script` on `matcher`. */
async function setUpByReleaseOneSixWithPack(tool: "cursor" | "codex", script: string, matcher = "Bash"): Promise<string> {
  const sub = "repo";
  const root = await setUpByReleaseOneSix(tool, packEntryOfReleaseOneSix(tool, script, matcher), sub);
  await mkdir(join(abs(root, script), ".."), { recursive: true });
  await writeFile(abs(root, script), "process.exit(0)\n", "utf8");
  const definition = `${JSON.stringify({ hooks: [{ event: "pre_tool_use", matcher, command: ["node", script] }] }, null, 2)}\n`;
  const source = `pack-src-${sub}/${HOOK_PACK_ID}`;
  await getTemp().seedFiles({
    [`${source}/hooks/hooks.json`]: definition,
    [`${source}/pack.json`]: `${JSON.stringify(
      { name: HOOK_PACK_ID, version: "1.0.0", integrity: { "hooks/hooks.json": sha256(definition) }, permissions: { toolFootprint: ["read"] } },
      null,
      2,
    )}\n`,
  });
  const plan = await planPackInstall(root, getTemp().path(source), { allowUntrusted: true });
  expect(plan.collisions).toEqual([]);
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("fixture lost its manifest");
  const applied = await applyPackInstall(root, plan, manifest, { engineVersion: ENGINE_VERSION, now: T0 });
  expect(applied.result.errors).toEqual([]);
  await writeManifest(root, applied.manifest, { now: T1 });
  return root;
}

describe("a direct upgrade from a release up to 1.6.0 with an installed pack's hook (review/69)", () => {
  const cases = (["cursor", "codex"] as const).flatMap((tool) =>
    Object.entries(PACK_SCRIPTS).map(([where, script]) => [tool, where, script, tool === "cursor" ? CURSOR_HOOKS : CODEX_HOOKS] as const),
  );

  it.each(cases)("%s, the script %s: the first sync runs the pack's hook and the user hook once each, and takes no .bak", async (tool, _where, script, path) => {
    const root = await setUpByReleaseOneSixWithPack(tool, script);
    expect(await runsOf(root, path, script)).toBe(1);

    await sync(root);

    expect(await runsOf(root, path, script)).toBe(1);
    expect(await runsOf(root, path, USER_SCRIPT)).toBe(1);
    expect(await readText(root, path)).not.toContain(script);
    expect(await backups(root)).toEqual([]);
  });

  it.each(cases)("%s, the script %s: the pack removed after that sync (clean --pack, then sync), its hook runs no more", async (tool, _where, script, path) => {
    const root = await setUpByReleaseOneSixWithPack(tool, script);
    await sync(root);

    expect((await clean(root, ["--pack", HOOK_PACK_ID])).code).toBe(0);
    await sync(root);

    expect(await runsOf(root, path, script)).toBe(0);
    expect(await runsOf(root, path, USER_SCRIPT)).toBe(1);
  });

  // Removed before any sync, the pack's definition is gone, so only the path
  // can prove its 1.6.0 entry: the pack's folder can, a script elsewhere
  // cannot, and neither can a Codex group the pack's row shared with a user
  // row — the class of a user definition deleted before the first sync, which
  // stays the owner's (the build/54 sign-off). So the pack's hook has a
  // matcher of its own here.
  it.each([
    ["cursor", CURSOR_HOOKS],
    ["codex", CODEX_HOOKS],
  ] as const)("%s: the pack removed before any sync, its 1.6.0 entry running a script in the pack's folder leaves with no .bak", async (tool, path) => {
    const script = PACK_SCRIPTS["in the pack's folder"];
    const root = await setUpByReleaseOneSixWithPack(tool, script, "Edit");

    expect((await clean(root, ["--pack", HOOK_PACK_ID])).code).toBe(0);
    await sync(root);

    expect(await runsOf(root, path, script)).toBe(0);
    expect(await runsOf(root, path, USER_SCRIPT)).toBe(1);
    expect(await backups(root)).toEqual([]);
  });
});

/** The `description` 1.7.0 rendered into `.codex/hooks.json` (its golden snapshot, read 2026-10-07). */
const RELEASE_ONE_SEVEN_DESCRIPTION =
  "Stamity hooks. Review and trust with /hooks; stamity check detects emitted-file drift. The role guard is telemetry because PreToolUse carries no agent identity.";

// ── REQ-FLOW-038: the Cursor guards carry the stamity- prefix ─

/** The guards' names up to 1.11.0, and the names that replace them. */
const RENAMED_GUARDS = [
  [".cursor/hooks/subagent-guard.mjs", ".cursor/hooks/stamity-subagent-guard.mjs"],
  [".cursor/hooks/mcp-guard.mjs", ".cursor/hooks/stamity-mcp-guard.mjs"],
] as const;
const OLD_SUBAGENT_GUARD = RENAMED_GUARDS[0][0];
const OLD_MCP_GUARD = RENAMED_GUARDS[1][0];

/**
 * A Cursor setup rewritten to the shape 1.11.0 left: the two guards at their
 * old names (their own bytes naming the old path, as 1.11.0 rendered them),
 * `.cursor/hooks.json` running them, ledger rows at the old paths, no co-owned
 * record, and every hash recomputed over the bytes now on disk. `ownerEntry`
 * adds an owner's entry after the hashes are taken, as an owner edits the file.
 */
async function setUpByReleaseOneEleven(sub = "repo", ownerEntry = false): Promise<string> {
  const root = await freshRepo(sub);
  await init(root, ["cursor"]);
  await moveGuardsToOldNames(root);
  await writeFile(abs(root, CURSOR_HOOKS), respellGuards(await readText(root, CURSOR_HOOKS)), "utf8");
  await asReleaseOneEleven(root);
  await recordAsWritten(root, CURSOR_HOOKS);
  if (ownerEntry) await addHookEntry(root, CURSOR_HOOKS, "afterFileEdit", OWNER_CURSOR_ENTRY);
  return root;
}

/** `text` with each guard's current name respelled as its name up to 1.11.0. */
function respellGuards(text: string): string {
  return RENAMED_GUARDS.reduce((acc, [old, current]) => acc.replaceAll(current, old), text);
}

/**
 * Cursor's guards moved back to the names every release up to 1.11.0 wrote:
 * each file at its old path (its own bytes naming that path), and its ledger
 * row at that path with the hash of those bytes.
 */
async function moveGuardsToOldNames(root: string): Promise<void> {
  const moved = await Promise.all(
    RENAMED_GUARDS.map(async ([old, current]) => {
      const text = respellGuards(await readText(root, current));
      await writeFile(abs(root, old), text, "utf8");
      await rm(abs(root, current));
      return [current, { path: old, contentHash: sha256(text) }] as const;
    }),
  );
  const renamed = new Map<string, { path: string; contentHash: string }>(moved);
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("fixture lost its manifest");
  const ledger = manifest.ledger.map((row) => ({ ...row, ...renamed.get(row.path) }));
  await writeManifest(root, { ...manifest, ledger }, { now: T1 });
}

/** The script each guard entry of `.cursor/hooks.json` runs, by event. */
async function guardCommands(root: string): Promise<Record<string, unknown>> {
  const hooks = (await readDoc(root, CURSOR_HOOKS))["hooks"] as Record<string, { command?: string }[]>;
  return {
    subagentStart: hooks["subagentStart"]?.map((entry) => entry.command),
    beforeMCPExecution: hooks["beforeMCPExecution"]?.map((entry) => entry.command),
  };
}

/** Whether a reclaim keeps or deletes each of `paths`, as `check --json` and `sync --dry-run` preview it before any write (review/73). */
async function reclaimPreview(root: string, paths: readonly string[]): Promise<Record<string, { check: string; dryRun: string }>> {
  const check = await runInProcess([checkCommand], ["check", "--json"], { cwd: root });
  const drift = (JSON.parse(check.stdout.trim()) as { drift: { reclaim: { path: string; action: string }[] } }).drift.reclaim;
  const plan = await planSync(root, ENGINE_VERSION, { runner: () => "" });
  const dry = await applySync(root, plan, { engineVersion: ENGINE_VERSION, force: false, dryRun: true, now: T1 });
  return Object.fromEntries(
    paths.map((path) => {
      const previewed = dry.reclaimed?.entries.find((entry) => entry.path === path);
      return [path, { check: drift.find((entry) => entry.path === path)?.action ?? "none", dryRun: previewed?.wouldBe === "deleted" ? "delete" : "keep" }];
    }),
  );
}

/** What the write did to each of `paths`, in {@link reclaimPreview}'s terms, read off the disk. */
function reclaimDone(root: string, paths: readonly string[]): Record<string, { check: string; dryRun: string }> {
  return Object.fromEntries(
    paths.map((path) => {
      const done = existsSync(abs(root, path)) ? "keep" : "delete";
      return [path, { check: done, dryRun: done }];
    }),
  );
}

const OLD_GUARDS = RENAMED_GUARDS.map(([old]) => old);

describe("the Cursor guards carry the stamity- prefix, and the first sync after an upgrade moves them (REQ-FLOW-038)", () => {
  it("a setup that never ran a release before the rename: an owner's entry running an old guard name is the owner's, kept by sync and clean with no .bak (review/70)", async () => {
    const own = { command: `node ${OLD_MCP_GUARD}` };
    const ownersSetup = async (sub: string): Promise<string> => {
      const root = await freshRepo(sub);
      await init(root, ["cursor"]);
      await writeFile(abs(root, OLD_MCP_GUARD), "process.exit(0)\n", "utf8");
      await addHookEntry(root, CURSOR_HOOKS, "beforeMCPExecution", own);
      return root;
    };
    const synced = await ownersSetup("synced");
    const check = await runInProcess([checkCommand], ["check"], { cwd: synced });
    expect(check.code, check.stdout + check.stderr).toBe(0);

    await sync(synced);

    expect(((await readDoc(synced, CURSOR_HOOKS))["hooks"] as Record<string, unknown[]>)["beforeMCPExecution"]).toEqual([
      { command: `node ${MCP_GUARD_PATH}`, failClosed: true },
      own,
    ]);
    expect(existsSync(abs(synced, OLD_MCP_GUARD))).toBe(true);
    expect(await backups(synced)).toEqual([]);

    const cleaned = await ownersSetup("cleaned");
    expect((await clean(cleaned)).code).toBe(0);
    expect(await readDoc(cleaned, CURSOR_HOOKS)).toEqual({ version: 1, hooks: { beforeMCPExecution: [own] } });
    expect(existsSync(abs(cleaned, OLD_MCP_GUARD))).toBe(true);
    expect(await backups(cleaned)).toEqual([]);

    // init over the owner's own file, no setup before it: the entry is merged beside the engine's, not replaced.
    const adopted = await freshRepo("adopted");
    await mkdir(abs(adopted, ".cursor/hooks"), { recursive: true });
    await writeFile(abs(adopted, OLD_MCP_GUARD), "process.exit(0)\n", "utf8");
    await writeDoc(adopted, CURSOR_HOOKS, { version: 1, hooks: { beforeMCPExecution: [own] } });
    await init(adopted, ["cursor"]);
    expect(((await readDoc(adopted, CURSOR_HOOKS))["hooks"] as Record<string, unknown[]>)["beforeMCPExecution"]).toContainEqual(own);
    expect(await backups(adopted)).toEqual([]);
  });

  it("init -y --tools cursor writes exactly the two stamity- guards and runs them fail-closed", async () => {
    const root = await freshRepo();
    await init(root, ["cursor"]);

    expect((await readdir(abs(root, ".cursor/hooks"))).toSorted()).toEqual(["stamity-mcp-guard.mjs", "stamity-subagent-guard.mjs"]);
    const hooks = (await readDoc(root, CURSOR_HOOKS))["hooks"] as Record<string, unknown[]>;
    expect(hooks["subagentStart"]).toEqual([{ command: "node .cursor/hooks/stamity-subagent-guard.mjs", failClosed: true }]);
    expect(hooks["beforeMCPExecution"]).toEqual([{ command: "node .cursor/hooks/stamity-mcp-guard.mjs", failClosed: true }]);
  });

  it("a 1.11.0 setup: sync -y writes the new guards, rewires .cursor/hooks.json, deletes both old names by hash proof with no .bak, and check then exits 0", async () => {
    const root = await setUpByReleaseOneEleven();
    expect(await guardCommands(root)).toEqual({
      subagentStart: [`node ${OLD_SUBAGENT_GUARD}`],
      beforeMCPExecution: [`node ${OLD_MCP_GUARD}`],
    });

    const { report } = await sync(root);

    for (const [old, current] of RENAMED_GUARDS) {
      expect(existsSync(abs(root, old)), old).toBe(false);
      expect(existsSync(abs(root, current)), current).toBe(true);
      expect(report.reclaimed?.entries.find((entry) => entry.path === old)).toMatchObject({
        action: "deleted",
        candidateReason: "path-renamed",
        proof: "hash",
      });
    }
    expect(await guardCommands(root)).toEqual({
      subagentStart: [`node ${SUBAGENT_GUARD_PATH}`],
      beforeMCPExecution: [`node ${MCP_GUARD_PATH}`],
    });
    const rewired = await readText(root, CURSOR_HOOKS);
    for (const [old] of RENAMED_GUARDS) expect(rewired).not.toContain(old);
    expect(await backups(root)).toEqual([]);
    const rows = (await readManifest(root))?.ledger.map((row) => row.path) ?? [];
    for (const [old, current] of RENAMED_GUARDS) {
      expect(rows).not.toContain(old);
      expect(rows).toContain(current);
    }

    const check = await runInProcess([checkCommand], ["check"], { cwd: root });
    expect(check.code, check.stdout + check.stderr).toBe(0);
  });

  it("a 1.11.0 setup: check and sync --dry-run name both old guards as deleted by hash proof, and sync -y does exactly that (review/68)", async () => {
    const root = await setUpByReleaseOneEleven();

    // The preview reads `.cursor/hooks.json` as the write will leave it, not
    // as 1.11.0 left it: the write rewires it to the new names, so nothing it
    // keeps still runs an old guard.
    const check = await runInProcess([checkCommand], ["check", "--json"], { cwd: root });
    const drift = (JSON.parse(check.stdout.trim()) as { drift: { reclaim: unknown[] } }).drift;
    for (const [old] of RENAMED_GUARDS) {
      expect(drift.reclaim, old).toContainEqual({ path: old, reason: "path-renamed", action: "delete", proof: "hash" });
    }
    const plan = await planSync(root, ENGINE_VERSION, { runner: () => "" });
    const dry = await applySync(root, plan, { engineVersion: ENGINE_VERSION, force: false, dryRun: true, now: T1 });
    for (const [old] of RENAMED_GUARDS) {
      expect(dry.reclaimed?.entries.find((entry) => entry.path === old), old).toMatchObject({ action: "dry-run", wouldBe: "deleted", proof: "hash" });
      expect(existsSync(abs(root, old)), old).toBe(true);
    }

    const { report } = await sync(root);

    for (const [old] of RENAMED_GUARDS) {
      expect(report.reclaimed?.entries.find((entry) => entry.path === old), old).toMatchObject({ action: "deleted", proof: "hash" });
    }
  });

  it("a 1.11.0 setup with an owner entry: sync -y keeps the entry, rewires the guards behind a verified .bak, deletes both old names, and check then exits 0", async () => {
    const root = await setUpByReleaseOneEleven("repo", true);
    const edited = await readText(root, CURSOR_HOOKS);
    const preview = await reclaimPreview(root, OLD_GUARDS);
    expect(preview).toEqual(Object.fromEntries(OLD_GUARDS.map((old) => [old, { check: "delete", dryRun: "delete" }])));

    const { entries, report } = await sync(root);

    // The preview is the write (review/73): each old guard, and the hooks document's own row.
    expect(reclaimDone(root, OLD_GUARDS)).toEqual(preview);
    expect(entries.find((entry) => entry.path === CURSOR_HOOKS)?.action).toBe("update");
    expect(rowOf(report.wrote, CURSOR_HOOKS).action).toBe("updated");
    for (const [old, current] of RENAMED_GUARDS) {
      expect(existsSync(abs(root, old)), old).toBe(false);
      expect(existsSync(abs(root, current)), current).toBe(true);
    }
    const doc = await readDoc(root, CURSOR_HOOKS);
    expect((doc["hooks"] as Record<string, unknown[]>)["afterFileEdit"]).toEqual([OWNER_CURSOR_ENTRY]);
    expect(await guardCommands(root)).toEqual({
      subagentStart: [`node ${SUBAGENT_GUARD_PATH}`],
      beforeMCPExecution: [`node ${MCP_GUARD_PATH}`],
    });
    // The legacy row's hash no longer proves the file unedited, so the old
    // guard entries leave behind a verified .bak, as the plan's expand/contract
    // rule says.
    expect(await backups(root)).toEqual([`${CURSOR_HOOKS}.bak`]);
    expect(await readText(root, `${CURSOR_HOOKS}.bak`)).toBe(edited);

    const check = await runInProcess([checkCommand], ["check"], { cwd: root });
    expect(check.code, check.stdout + check.stderr).toBe(0);
  });

  it("a 1.11.0 setup whose old MCP guard was edited by hand: sync -y keeps it byte for byte and the sync report names it", async () => {
    const root = await setUpByReleaseOneEleven();
    const edited = `${await readText(root, OLD_MCP_GUARD)}// the team's own tweak\n`;
    await writeFile(abs(root, OLD_MCP_GUARD), edited, "utf8");
    const preview = await reclaimPreview(root, OLD_GUARDS);
    expect(preview).toEqual({ [OLD_SUBAGENT_GUARD]: { check: "delete", dryRun: "delete" }, [OLD_MCP_GUARD]: { check: "keep", dryRun: "keep" } });

    const synced = await runInProcess([syncCommand], ["sync", "-y"], { cwd: root });

    expect(synced.code, synced.stderr).toBe(0);
    // The preview is the write (review/73).
    expect(reclaimDone(root, OLD_GUARDS)).toEqual(preview);
    expect(await readText(root, OLD_MCP_GUARD)).toBe(edited);
    expect(existsSync(abs(root, OLD_SUBAGENT_GUARD))).toBe(false);
    expect(existsSync(abs(root, MCP_GUARD_PATH))).toBe(true);
    expect(synced.stdout).toContain(OLD_MCP_GUARD);
    expect(await readText(root, CURSOR_HOOKS)).not.toContain(OLD_MCP_GUARD);
    // Kept for its edit, not because a hooks document runs it: the owner's now, so its row is not carried (review/75, review/76).
    expect((await readManifest(root))?.ledger.map((row) => row.path)).not.toContain(OLD_MCP_GUARD);
  });

  it("a 1.11.0 setup with an owner entry: clean -y before any sync keeps the entry alone, behind a verified .bak, and deletes both old guards it no longer runs", async () => {
    const root = await setUpByReleaseOneEleven("repo", true);
    const edited = await readText(root, CURSOR_HOOKS);

    const cleaned = await clean(root);

    expect(cleaned.code).toBe(0);
    expect(await readDoc(root, CURSOR_HOOKS)).toEqual({ version: 1, hooks: { afterFileEdit: [OWNER_CURSOR_ENTRY] } });
    expect(await readText(root, `${CURSOR_HOOKS}.bak`)).toBe(edited);
    for (const [old, current] of RENAMED_GUARDS) {
      expect(existsSync(abs(root, old)), old).toBe(false);
      expect(existsSync(abs(root, current)), current).toBe(false);
    }
  });
});

describe("a first sync that refuses .cursor/hooks.json leaves the rename to the next one (REQ-FLOW-038, review/75)", () => {
  // Each refusal, and how the owner clears it.
  const refusals = [
    [
      "an owner's version",
      async (root: string): Promise<() => Promise<void>> => {
        const before = await readText(root, CURSOR_HOOKS);
        await writeDoc(root, CURSOR_HOOKS, { ...(await readDoc(root, CURSOR_HOOKS)), version: 2 });
        return () => writeFile(abs(root, CURSOR_HOOKS), before, "utf8");
      },
    ],
    [
      "a hard link",
      async (root: string): Promise<() => Promise<void>> => {
        const other = getTemp().path("outside-hooks.json");
        await link(abs(root, CURSOR_HOOKS), other);
        return () => rm(other);
      },
    ],
  ] as const;

  // A hard link: Windows reports no link count this check can rely on, the
  // posture `./reclaim.test.ts` takes for its hard-link cases.
  it.each(refusals.filter(([name]) => name !== "a hard link" || process.platform !== "win32"))(
    "refused for %s, then fixed: the next sync rewires the old guards to the new names and deletes their scripts by hash, with no .bak; the preview is the write at each step",
    async (_name, refuse) => {
      const root = await setUpByReleaseOneEleven();
      const fix = await refuse(root);

      const kept = await reclaimPreview(root, OLD_GUARDS);
      expect(kept).toEqual(Object.fromEntries(OLD_GUARDS.map((old) => [old, { check: "keep", dryRun: "keep" }])));
      const refused = await sync(root);
      expect(refused.entries.find((entry) => entry.path === CURSOR_HOOKS)?.action).toBe("collision");
      expect(reclaimDone(root, OLD_GUARDS)).toEqual(kept);
      // The kept document still runs the old guards, so their rows stay with it.
      const rows = (await readManifest(root))?.ledger.map((row) => row.path) ?? [];
      for (const old of OLD_GUARDS) expect(rows, old).toContain(old);

      await fix();

      const deleted = await reclaimPreview(root, OLD_GUARDS);
      expect(deleted).toEqual(Object.fromEntries(OLD_GUARDS.map((old) => [old, { check: "delete", dryRun: "delete" }])));
      const { report } = await sync(root);
      expect(reclaimDone(root, OLD_GUARDS)).toEqual(deleted);
      for (const old of OLD_GUARDS) {
        expect(report.reclaimed?.entries.find((entry) => entry.path === old), old).toMatchObject({ action: "deleted", proof: "hash" });
      }
      expect(await guardCommands(root)).toEqual({
        subagentStart: [`node ${SUBAGENT_GUARD_PATH}`],
        beforeMCPExecution: [`node ${MCP_GUARD_PATH}`],
      });
      expect(await backups(root)).toEqual([]);
      const after = (await readManifest(root))?.ledger.map((row) => row.path) ?? [];
      for (const old of OLD_GUARDS) expect(after, old).not.toContain(old);
    },
  );
});

describe("no verb deletes a renamed guard a kept .cursor/hooks.json still runs (REQ-FLOW-038 with S17, review/58)", () => {
  it("a .cursor/hooks.json sync refuses (an owner's version) keeps both old guards it still names", async () => {
    const root = await setUpByReleaseOneEleven();
    const doc = await readDoc(root, CURSOR_HOOKS);
    await writeDoc(root, CURSOR_HOOKS, { ...doc, version: 2 });
    const before = await readText(root, CURSOR_HOOKS);

    // The preview agrees with the write (review/68): the refused file is read
    // from disk, where it still runs both old guards.
    const check = await runInProcess([checkCommand], ["check", "--json"], { cwd: root });
    const preview = (JSON.parse(check.stdout.trim()) as { drift: { reclaim: { path: string; action: string }[] } }).drift.reclaim;
    for (const [old] of RENAMED_GUARDS) expect(preview.find((entry) => entry.path === old)?.action, old).toBe("keep");

    const { entries, report } = await sync(root);

    expect(entries.find((entry) => entry.path === CURSOR_HOOKS)).toMatchObject({ action: "collision", collisionKind: "co-owned-shape" });
    expect(await readText(root, CURSOR_HOOKS)).toBe(before);
    for (const [old, current] of RENAMED_GUARDS) {
      expect(existsSync(abs(root, old)), old).toBe(true);
      expect(existsSync(abs(root, current)), current).toBe(true);
      const entry = report.reclaimed?.entries.find((candidate) => candidate.path === old);
      expect(entry?.action, old).toBe("skipped-user-content");
      expect(entry?.detail, old).toContain(CURSOR_HOOKS);
    }
  });

  // A hard link: Windows reports no link count this check can rely on, the
  // posture `./reclaim.test.ts` takes for its hard-link cases.
  it.skipIf(process.platform === "win32")("a linked .cursor/hooks.json, which sync refuses before any read, keeps both old guards", async () => {
    const root = await setUpByReleaseOneEleven();
    await link(abs(root, CURSOR_HOOKS), getTemp().path("outside-hooks.json"));
    const before = await readText(root, CURSOR_HOOKS);

    const { entries, report } = await sync(root);

    expect(entries.find((entry) => entry.path === CURSOR_HOOKS)?.action).toBe("collision");
    expect(await readText(root, CURSOR_HOOKS)).toBe(before);
    for (const [old] of RENAMED_GUARDS) {
      expect(existsSync(abs(root, old)), old).toBe(true);
      expect(report.reclaimed?.entries.find((candidate) => candidate.path === old)?.action, old).toBe("skipped-user-content");
    }
  });

  it("a .cursor/hooks.json clean keeps (it does not parse) keeps both old guards it names, and each kept guard names the file", async () => {
    const root = await setUpByReleaseOneEleven();
    const broken = `${await readText(root, CURSOR_HOOKS)},`;
    await writeFile(abs(root, CURSOR_HOOKS), broken, "utf8");

    const cleaned = await clean(root, ["--json"]);

    expect(cleaned.code).toBe(0);
    expect(await readText(root, CURSOR_HOOKS)).toBe(broken);
    const doc = JSON.parse(cleaned.stdout.trim()) as { entries: { path: string; action: string; detail: string }[] };
    for (const [old] of RENAMED_GUARDS) {
      expect(existsSync(abs(root, old)), old).toBe(true);
      const entry = doc.entries.find((candidate) => candidate.path === old);
      expect(entry?.action, old).toBe("skipped-user-content");
      expect(entry?.detail, old).toContain(CURSOR_HOOKS);
    }
  });
});
