import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLAUDE_ASK_GATE_PATH,
  CLAUDE_CLOUD_READINESS_PATH,
  CLAUDE_HOOK_ASK_GATE_PATH,
  CLAUDE_HOOK_CLOUD_READINESS_PATH,
  CLAUDE_HOOK_POLICIES_PATH,
  CLAUDE_HOOK_REVIEW_GATE_PATH,
  CLAUDE_REVIEW_GATE_PATH,
  CLAUDE_SETTINGS_PATH,
} from "../../src/adapters/claude.ts";
import { checkCommand, runDriftGate } from "../../src/cli/commands/check.ts";
import { cleanCommand } from "../../src/cli/commands/clean.ts";
import { applyInit } from "../../src/cli/commands/init/apply.ts";
import { buildInitDecisions } from "../../src/cli/commands/init/plan.ts";
import { applySync, planSync } from "../../src/cli/commands/sync/engine.ts";
import { __resetContentRootCacheForTests, __setContentRootForTests } from "../../src/content/contentRoot.ts";
import { AGENT_TOOL_POLICIES_PATH } from "../../src/emit/hooksInfra.ts";
import { CLAUDE_HOOKS_DIR } from "../../src/hooks/model.ts";
import { createApp } from "../../src/index.ts";
import { executedScript } from "../../src/manifest/coOwnedJson.ts";
import { readManifest } from "../../src/manifest/manifest.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * w6-claude-hooks-in-claude-dir (REQ-FLOW-113, REQ-FLOW-104) at the shipped verbs: Claude Code's hook entries run
 * copies under `.claude/hooks/stamity/`, beside a copy of the agent tool policy document, because the Claude Code
 * GitHub Action restores `.claude/` from the base branch on a pull request; the copies under
 * `.stamity/generated/hooks/claude/` stay written. Real temp repositories through `init`, `sync`, `check` and
 * `clean`, the posture `./settingsOwnerEntries.test.ts` takes: the copies' ownership lives in the wiring between
 * the planner, the owned-path bound, the ledger and the sweep, which no unit test of one module sees.
 */

const ENGINE_VERSION = createApp().version;
const T0 = new Date("2026-10-19T09:00:00.000Z");
const T1 = new Date("2026-10-19T10:00:00.000Z");

const getTemp = useTempDir("claude-hook-copies");

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

/** The core's four scripts, by file name. */
const CORE_FILES = [
  "stamity-session-start.mjs",
  "stamity-pre-tool-use-guard.mjs",
  "stamity-config-tamper-notice.mjs",
  "stamity-person-only-guard.mjs",
] as const;

/** Every path the copies occupy: the core's four, the adapter's three, and the policy copy. */
const COPIES: readonly string[] = [
  ...CORE_FILES.map((file) => `${CLAUDE_HOOKS_DIR}/${file}`),
  CLAUDE_HOOK_REVIEW_GATE_PATH,
  CLAUDE_HOOK_ASK_GATE_PATH,
  CLAUDE_HOOK_CLOUD_READINESS_PATH,
  CLAUDE_HOOK_POLICIES_PATH,
];

/** Every generated Claude script, still written beside the copies. */
const GENERATED: readonly string[] = [
  ...CORE_FILES.map((file) => `.stamity/generated/hooks/claude/${file}`),
  CLAUDE_REVIEW_GATE_PATH,
  CLAUDE_ASK_GATE_PATH,
  CLAUDE_CLOUD_READINESS_PATH,
];

/** An owner's own Claude Code hook beside the engine's folder. */
const OWNER_HOOK = ".claude/hooks/format.sh";
const OWNER_HOOK_BODY = "#!/bin/sh\nnpm run format\n";

let counter = 0;
async function freshRepo(): Promise<string> {
  counter += 1;
  const root = getTemp().path(`repo-${counter}`);
  await mkdir(root, { recursive: true });
  return root;
}

const abs = (root: string, path: string): string => join(root, ...path.split("/"));

async function init(root: string): ReturnType<typeof applyInit> {
  const decisions = await buildInitDecisions(root, { tools: ["claude"] });
  return applyInit({ rootDir: root, decisions, engineVersion: ENGINE_VERSION, dryRun: false, force: false, now: T0 });
}

async function sync(root: string): ReturnType<typeof applySync> {
  const plan = await planSync(root, ENGINE_VERSION, { runner: () => "" });
  return applySync(root, plan, { engineVersion: ENGINE_VERSION, force: false, dryRun: false, now: T1 });
}

/** Every command the settings document's hook entries run. */
async function settingsCommands(root: string): Promise<string[]> {
  const doc = JSON.parse(await readFile(abs(root, CLAUDE_SETTINGS_PATH), "utf8")) as {
    hooks: Record<string, { hooks: { command: string }[] }[]>;
  };
  return Object.values(doc.hooks).flatMap((entries) => entries.flatMap((entry) => entry.hooks.map((hook) => hook.command)));
}

describe("init writes the copies Claude Code's hooks run, and keeps the generated ones", () => {
  it("writes and owns every copy and every generated script, and wires every entry to a copy", async () => {
    const root = await freshRepo();
    await init(root);

    const owned = new Set((await readManifest(root))?.ledger.map((row) => row.path));
    for (const path of [...COPIES, ...GENERATED]) {
      expect(existsSync(abs(root, path)), path).toBe(true);
      expect(owned.has(path), path).toBe(true);
    }
    // The policy copy is the shared document, byte for byte.
    expect(await readFile(abs(root, CLAUDE_HOOK_POLICIES_PATH), "utf8")).toBe(await readFile(abs(root, AGENT_TOOL_POLICIES_PATH), "utf8"));

    const commands = await settingsCommands(root);
    expect(commands.length).toBeGreaterThan(8);
    for (const command of commands) expect(COPIES, command).toContain(executedScript(command));
  });

  it("moves no byte on the sync after it, and check passes", async () => {
    const root = await freshRepo();
    await init(root);
    const before = await Promise.all([...COPIES, ...GENERATED, CLAUDE_SETTINGS_PATH].map((path) => readFile(abs(root, path), "utf8")));

    await sync(root);

    const after = await Promise.all([...COPIES, ...GENERATED, CLAUDE_SETTINGS_PATH].map((path) => readFile(abs(root, path), "utf8")));
    expect(after).toEqual(before);
    const check = await runInProcess([checkCommand], ["check", "--json"], { cwd: root });
    expect(check.code, check.stdout).toBe(0);
  });
});

describe("check and clean over both sets", () => {
  it("check reports drift on a copy and on a generated script, and prints the hook folder in its bound", async () => {
    const root = await freshRepo();
    await init(root);
    const copy = `${CLAUDE_HOOKS_DIR}/stamity-session-start.mjs`;
    const generated = ".stamity/generated/hooks/claude/stamity-session-start.mjs";
    await Promise.all([copy, generated].map((path) => writeFile(abs(root, path), "// edited by hand\n", "utf8")));

    const drift = await runDriftGate(root, ENGINE_VERSION);
    const drifted = new Set(drift.changes.map((change) => change.path));
    expect(drifted.has(copy), copy).toBe(true);
    expect(drifted.has(generated), generated).toBe(true);

    const check = await runInProcess([checkCommand], ["check", "--json"], { cwd: root });
    const report = JSON.parse(check.stdout) as { ownedPaths: { version: number; hookRoots: string[] } };
    expect(report.ownedPaths.version).toBe(3);
    expect(report.ownedPaths.hookRoots).toEqual([`${CLAUDE_HOOKS_DIR}/`]);
  });

  it("clean removes both sets and the policy copy, and keeps an owner's own hook under .claude/hooks/", async () => {
    const root = await freshRepo();
    await mkdir(abs(root, ".claude/hooks"), { recursive: true });
    await writeFile(abs(root, OWNER_HOOK), OWNER_HOOK_BODY, "utf8");
    await init(root);

    const result = await runInProcess([cleanCommand], ["clean", "-y"], { cwd: root });

    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    for (const path of [...COPIES, ...GENERATED]) expect(existsSync(abs(root, path)), path).toBe(false);
    expect(existsSync(abs(root, CLAUDE_HOOKS_DIR))).toBe(false);
    expect(await readFile(abs(root, OWNER_HOOK), "utf8")).toBe(OWNER_HOOK_BODY);
  });
});
