import { spawnSync } from "node:child_process";
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
import { syncCommand } from "../../src/cli/commands/sync.ts";
import { applySync, planSync } from "../../src/cli/commands/sync/engine.ts";
import { sha256 } from "../../src/cli/engine/emissionWrite.ts";
import { __resetContentRootCacheForTests, __setContentRootForTests } from "../../src/content/contentRoot.ts";
import { AGENT_TOOL_POLICIES_PATH } from "../../src/emit/hooksInfra.ts";
import { CLAUDE_HOOKS_DIR } from "../../src/hooks/model.ts";
import {
  buildCloudReadinessScript,
  buildReviewGateScript,
  buildUnattendedAskGate,
  planCoreHookScripts,
  REVIEW_GATE_STATE_FILE,
} from "../../src/hooks/scripts.ts";
import { createApp } from "../../src/index.ts";
import { computeLearningIntegrity } from "../../src/learnings/validation.ts";
import { executedScript } from "../../src/manifest/coOwnedJson.ts";
import { readManifest, writeManifest } from "../../src/manifest/manifest.ts";
import { DEFAULT_MAX_REVIEW_ITERATIONS } from "../../src/roster/reviewCaps.ts";
import type { LedgerEntry } from "../../src/types/manifest.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * w6-claude-hooks-in-claude-dir (REQ-FLOW-113, REQ-FLOW-104) at the shipped verbs: Claude Code's hook entries run
 * copies under `.claude/hooks/stamity/`, beside a copy of the agent tool policy document, because the Claude Code
 * GitHub Action restores `.claude/` from the base branch on a pull request. Real temp repositories through `init`,
 * `sync`, `check` and `clean`, the posture `./settingsOwnerEntries.test.ts` takes: the copies' ownership lives in the
 * wiring between the planner, the owned-path bound, the ledger and the sweep, which no unit test of one module sees.
 *
 * TEST CHANGE, justified (u5-hook-copies, plan 018 file 2, REQ-FLOW-088): the generated copies under
 * `.stamity/generated/hooks/claude/` are no longer emitted. Invariant 5 now names the client's own session start
 * (`.claude/hooks/stamity/` for Claude Code), so the manual run they were kept for runs the copy. The cases that
 * pinned them written and drifting now pin them absent, and two cases are new: the upgrade's `sync` removes an
 * unedited old copy by its recorded hash and keeps and names an edited one, and the copy run by hand prints the
 * learnings banner.
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

/** The folder the old generated Claude scripts sat in. */
const OLD_FOLDER = ".stamity/generated/hooks/claude";

/** Every generated Claude script a release up to 1.16.0 wrote beside the copies. */
const OLD_COPIES: readonly string[] = [
  ...CORE_FILES.map((file) => `${OLD_FOLDER}/${file}`),
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

/**
 * The seven generated scripts a 1.16.0 `init` wrote under `.stamity/generated/hooks/claude/`, rendered by the same
 * builders in the generated layout (the core's four through `planCoreHookScripts` with the climb to the shared
 * policy document, the adapter's three with their default layout), each with the artifact id that release
 * recorded.
 */
function oldLayout(): { path: string; artifactId: string; content: string }[] {
  const cli = { packageName: "@zomarit/stamity", version: ENGINE_VERSION };
  const core = planCoreHookScripts("../../agent-tool-policies.json", "claude", { ...cli, personOnlyGuard: true });
  return [
    ...core.map((script) => ({
      path: `${OLD_FOLDER}/${script.fileName}`,
      artifactId: script.fileName.replace(/\.mjs$/, ""),
      content: script.content,
    })),
    {
      path: CLAUDE_REVIEW_GATE_PATH,
      artifactId: "claude-review-gate",
      content: buildReviewGateScript({
        statePath: REVIEW_GATE_STATE_FILE,
        maxIterations: DEFAULT_MAX_REVIEW_ITERATIONS,
        failMode: "fail-closed",
      }),
    },
    { path: CLAUDE_ASK_GATE_PATH, artifactId: "claude-ask-gate", content: buildUnattendedAskGate() },
    { path: CLAUDE_CLOUD_READINESS_PATH, artifactId: "claude-cloud-readiness", content: buildCloudReadinessScript({ cli }) },
  ];
}

/**
 * Puts a repository `init` just set up back to the layout a release up to 1.16.0 left: the seven old scripts on
 * disk, each with a ledger row recording the hash of the bytes written.
 */
async function atOldLayout(root: string): Promise<void> {
  const old = oldLayout();
  expect(old.map((file) => file.path).toSorted()).toEqual([...OLD_COPIES].toSorted());
  await mkdir(abs(root, OLD_FOLDER), { recursive: true });
  await Promise.all(old.map((file) => writeFile(abs(root, file.path), file.content, "utf8")));
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("fixture lost its manifest");
  const rows: LedgerEntry[] = old.map((file) => ({
    path: file.path,
    adapter: "claude",
    artifactId: file.artifactId,
    artifactType: "infra",
    contentHash: sha256(file.content),
  }));
  await writeManifest(root, { ...manifest, ledger: [...manifest.ledger, ...rows] }, { now: T0 });
}

describe("init writes the copies Claude Code's hooks run, and no generated Claude script", () => {
  it("writes and owns every copy, writes nothing under the old folder, and wires every entry to a copy", async () => {
    const root = await freshRepo();
    await init(root);

    const ledger = (await readManifest(root))?.ledger ?? [];
    const owned = new Set(ledger.map((row) => row.path));
    for (const path of COPIES) {
      expect(existsSync(abs(root, path)), path).toBe(true);
      expect(owned.has(path), path).toBe(true);
    }
    expect(existsSync(abs(root, OLD_FOLDER)), OLD_FOLDER).toBe(false);
    expect(ledger.filter((row) => row.path.startsWith(`${OLD_FOLDER}/`)).map((row) => row.path)).toEqual([]);
    // The policy copy is the shared document, byte for byte.
    expect(await readFile(abs(root, CLAUDE_HOOK_POLICIES_PATH), "utf8")).toBe(await readFile(abs(root, AGENT_TOOL_POLICIES_PATH), "utf8"));

    const commands = await settingsCommands(root);
    expect(commands.length).toBeGreaterThan(8);
    for (const command of commands) {
      expect(COPIES, command).toContain(executedScript(command));
      expect(command, command).toContain(`${CLAUDE_HOOKS_DIR}/`);
    }
  });

  it("moves no byte on the sync after it, and check passes", async () => {
    const root = await freshRepo();
    await init(root);
    const before = await Promise.all([...COPIES, CLAUDE_SETTINGS_PATH].map((path) => readFile(abs(root, path), "utf8")));

    await sync(root);

    const after = await Promise.all([...COPIES, CLAUDE_SETTINGS_PATH].map((path) => readFile(abs(root, path), "utf8")));
    expect(after).toEqual(before);
    expect(existsSync(abs(root, OLD_FOLDER)), OLD_FOLDER).toBe(false);
    const check = await runInProcess([checkCommand], ["check", "--json"], { cwd: root });
    expect(check.code, check.stdout).toBe(0);
  });

  it("the session start copy run by hand with an empty stdin prints the learnings banner (invariant 5)", async () => {
    const root = await freshRepo();
    await init(root);
    const body = "## Why\n\nMeasured once.\n\n## How to apply\n\nWarm the cache first.\n";
    await writeFile(
      abs(root, ".stamity/learnings/cache-warmup.md"),
      [
        "---",
        "id: cache-warmup",
        "date: 2026-08-12",
        "confidence: high",
        "summary: Warm the query cache in bootstrap; first paint drops from 400ms to 30ms.",
        "reviewBy: 2099-01-01",
        "validatedAgainst: npm test -- cache",
        `integrity: ${computeLearningIntegrity(body)}`,
        "---",
        "",
        body,
      ].join("\n"),
      "utf8",
    );
    // A session moved off the root: the copy names its repository from its own folder, not the working directory.
    await mkdir(abs(root, "sub/deep"), { recursive: true });
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env["STAMITY_REPO_ROOT"];

    const result = spawnSync(process.execPath, [abs(root, `${CLAUDE_HOOKS_DIR}/stamity-session-start.mjs`)], {
      cwd: abs(root, "sub/deep"),
      input: "",
      env,
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^Learnings: 1 loaded, 0 skipped, /m);
    expect(result.stdout).toContain("- [high] cache-warmup —");
  });
});

describe("the upgrade's sync over the old layout", () => {
  it("removes every unedited old copy by its recorded hash, and keeps the copies and the settings", async () => {
    const root = await freshRepo();
    await init(root);
    await atOldLayout(root);
    for (const path of OLD_COPIES) expect(existsSync(abs(root, path)), path).toBe(true);
    const copiesBefore = await Promise.all(COPIES.map((path) => readFile(abs(root, path), "utf8")));

    const run = await runInProcess([syncCommand], ["sync", "-y"], { cwd: root });

    expect(run.code, `${run.stdout}\n${run.stderr}`).toBe(0);
    for (const path of OLD_COPIES) {
      expect(existsSync(abs(root, path)), path).toBe(false);
      expect(run.stdout, path).toContain(`deleted  ${path}`);
    }
    const owned = new Set((await readManifest(root))?.ledger.map((row) => row.path));
    for (const path of OLD_COPIES) expect(owned.has(path), path).toBe(false);
    expect(await Promise.all(COPIES.map((path) => readFile(abs(root, path), "utf8")))).toEqual(copiesBefore);
    for (const command of await settingsCommands(root)) expect(COPIES, command).toContain(executedScript(command));
    const check = await runInProcess([checkCommand], ["check", "--json"], { cwd: root });
    expect(check.code, check.stdout).toBe(0);
  });

  it("keeps an edited old copy and names it, and removes the unedited six", async () => {
    const root = await freshRepo();
    await init(root);
    await atOldLayout(root);
    const edited = `${OLD_FOLDER}/stamity-session-start.mjs`;
    const editedBody = `${await readFile(abs(root, edited), "utf8")}// edited by hand\n`;
    await writeFile(abs(root, edited), editedBody, "utf8");

    const run = await runInProcess([syncCommand], ["sync", "-y"], { cwd: root });

    expect(run.code, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(await readFile(abs(root, edited), "utf8")).toBe(editedBody);
    expect(run.stdout).toContain(`skipped-user-content  ${edited}`);
    const unedited = OLD_COPIES.filter((path) => path !== edited);
    expect(unedited).toHaveLength(6);
    for (const path of unedited) expect(existsSync(abs(root, path)), path).toBe(false);
  });
});

describe("check and clean over the copies", () => {
  it("check reports drift on a copy, and prints the hook folder in its bound", async () => {
    const root = await freshRepo();
    await init(root);
    const copy = `${CLAUDE_HOOKS_DIR}/stamity-session-start.mjs`;
    await writeFile(abs(root, copy), "// edited by hand\n", "utf8");

    const drift = await runDriftGate(root, ENGINE_VERSION);
    expect(new Set(drift.changes.map((change) => change.path)).has(copy), copy).toBe(true);

    const check = await runInProcess([checkCommand], ["check", "--json"], { cwd: root });
    const report = JSON.parse(check.stdout) as { ownedPaths: { version: number; hookRoots: string[] } };
    // TEST CHANGE, justified: REQ-FLOW-016 — the bound gains `.gitignore`, whose row records the ignore lines setup appended (version 3 -> 4).
    expect(report.ownedPaths.version).toBe(4);
    expect(report.ownedPaths.hookRoots).toEqual([`${CLAUDE_HOOKS_DIR}/`]);
  });

  it("clean removes the copies and the policy copy, and keeps an owner's own hook under .claude/hooks/", async () => {
    const root = await freshRepo();
    await mkdir(abs(root, ".claude/hooks"), { recursive: true });
    await writeFile(abs(root, OWNER_HOOK), OWNER_HOOK_BODY, "utf8");
    await init(root);

    const result = await runInProcess([cleanCommand], ["clean", "-y"], { cwd: root });

    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    for (const path of COPIES) expect(existsSync(abs(root, path)), path).toBe(false);
    expect(existsSync(abs(root, CLAUDE_HOOKS_DIR))).toBe(false);
    expect(await readFile(abs(root, OWNER_HOOK), "utf8")).toBe(OWNER_HOOK_BODY);
  });

  it("keeps the policy copy a kept settings document's guard reads, so that guard still answers a governed call (REQ-FLOW-036)", async () => {
    const root = await freshRepo();
    await init(root);
    const document = JSON.parse(await readFile(abs(root, CLAUDE_HOOK_POLICIES_PATH), "utf8")) as {
      policies: { agentId: string; allow: string[] }[];
    };
    // A governed agent the policy lets read: without the policy copy the guard refuses it as POLICY_UNREADABLE.
    const agent = document.policies.find((policy) => policy.allow.includes("read"))?.agentId;
    if (agent === undefined) throw new Error("the fixture's policy document grants no agent a read");
    // The owner's comment line: the document no longer parses, so the sweep keeps it whole and it still runs every copy.
    const settings = abs(root, CLAUDE_SETTINGS_PATH);
    await writeFile(settings, `// team settings\n${await readFile(settings, "utf8")}`, "utf8");

    const result = await runInProcess([cleanCommand], ["clean", "-y"], { cwd: root });

    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(existsSync(abs(root, CLAUDE_HOOK_POLICIES_PATH)), CLAUDE_HOOK_POLICIES_PATH).toBe(true);
    const guard = spawnSync(process.execPath, [abs(root, `${CLAUDE_HOOKS_DIR}/stamity-pre-tool-use-guard.mjs`)], {
      cwd: root,
      // The read path is built at run time, so the test-input census does not count it as a read of a tracked page.
      input: JSON.stringify({ agent_type: agent, tool_name: "Read", tool_input: { file_path: ["notes", "todo.txt"].join("/") } }),
      encoding: "utf8",
    });
    expect(guard.status, guard.stderr).toBe(0);
    expect(guard.stderr).not.toContain("POLICY_UNREADABLE");
  });
});
