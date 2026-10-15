import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  CURSOR_HOOKS_CONFIG_PATH,
  MODEL_PINS_HOOK_PATH,
  cursorResiduePlanner,
} from "../../src/adapters/cursor.ts";
import { buildCoreEmissionPlan, type EmissionContext } from "../../src/emit/planner.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import { modelMapPath } from "../../src/roster/modelDefaults.ts";
import type { AdapterOutput } from "../../src/types/content.ts";
import type { ModelConfig } from "../../src/types/manifest.ts";
import { CORPUS_ROOT } from "../corpus/harness.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Cursor's model-fill hook (REQ-LADDER-007, plan 020 file 2, unit e7-cursor-pins).
 *
 * The script is the one this setup emits, read off the residue planner over the
 * shipped corpus, and it runs under the real `node` through the command
 * `.cursor/hooks.json` wires for it: the walk-up starter, from the root and from
 * a folder below it. Nothing is doubled — a hook that rewrites a sub-agent call's
 * input is only worth its bytes if the answer Cursor reads is the one asserted.
 */

const getTemp = useTempDir("cursor-model-hook");

const ENGINE_VERSION = "0.0.0-test";
const FIXED_NOW = new Date("2026-10-14T00:00:00.000Z");

/** An account's list as `agent models` printed it: effort variants, one id each. */
const LISTED = [
  "claude-opus-5-5-high",
  "claude-opus-5-5-medium",
  "claude-sonnet-5-5-medium",
  "claude-haiku-5-5-low",
  "gpt-5.6-sol-high",
];

/** The residue for the shipped reviewer, implementer and test-runner, under `models`. */
async function residue(models: ModelConfig | undefined): Promise<AdapterOutput[]> {
  const manifest = createManifest({
    tools: ["cursor"],
    selection: { items: { agent: ["reviewer", "implementer", "test-runner"], skill: [], rule: [], command: [] } },
    generatorVersion: ENGINE_VERSION,
    now: FIXED_NOW,
  });
  const ctx: EmissionContext = {
    rootDir: getTemp().path("repo"),
    manifest: { ...manifest, ...(models === undefined ? {} : { models }) },
    engineVersion: ENGINE_VERSION,
    facts: { monorepoPackages: [] },
    contentRoot: CORPUS_ROOT,
  };
  return (await cursorResiduePlanner.planResidue(await buildCoreEmissionPlan(ctx), ctx)).outputs;
}

const LISTED_MODELS: ModelConfig = { listed: { cursor: { ids: LISTED, source: "cursor-agent-models" } } };

/**
 * The list saved and two classes pinned by the operator, each to an id the list holds. Only a
 * pin is filled (ledger row 2026-10-14_cli-native/qa/1): Cursor refused the hook's fill of a class
 * model picked from the list, so an unpinned class is left to inherit the parent's model.
 */
const PINNED_MODELS: ModelConfig = {
  ...LISTED_MODELS,
  pins: { advanced: { cursor: "claude-opus-5-5-high" }, economy: { all: "claude-haiku-5-5-low" } },
};

function contentAt(rows: readonly AdapterOutput[], path: string): string {
  const row = rows.find((candidate) => candidate.path === path);
  expect(row, path).toBeDefined();
  return row!.content;
}

/** The one `preToolUse` entry that runs the model-fill hook, as `.cursor/hooks.json` wires it. */
function modelPinsEntry(rows: readonly AdapterOutput[]): { command: string; matcher?: string; failClosed?: boolean } {
  const doc = JSON.parse(contentAt(rows, CURSOR_HOOKS_CONFIG_PATH)) as {
    hooks: Record<string, { command: string; matcher?: string; failClosed?: boolean }[]>;
  };
  const entries = (doc.hooks["preToolUse"] ?? []).filter((entry) => entry.command.includes(MODEL_PINS_HOOK_PATH));
  expect(entries).toHaveLength(1);
  return entries[0]!;
}

/** Writes the hooks document and the script into a temp repository, with a folder below its root. */
async function seedRepo(rows: readonly AdapterOutput[]): Promise<string> {
  const temp = getTemp();
  await temp.seedFiles({
    [`repo/${CURSOR_HOOKS_CONFIG_PATH}`]: contentAt(rows, CURSOR_HOOKS_CONFIG_PATH),
    [`repo/${MODEL_PINS_HOOK_PATH}`]: contentAt(rows, MODEL_PINS_HOOK_PATH),
    "repo/sub/deeper/.keep": "",
  });
  return temp.path("repo");
}

/** Runs the wired command with `input` on stdin from `cwd`, the way Cursor starts a hook: through a shell. */
function run(command: string, cwd: string, input: string): SpawnSyncReturns<string> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  // The walk from the working folder is under test; a root the host session reports would bypass it.
  delete env["CURSOR_PROJECT_DIR"];
  return spawnSync(command, { cwd, env, shell: true, input, encoding: "utf8" });
}

const taskPayload = (toolInput: unknown, toolName: unknown = "Task"): string =>
  JSON.stringify({
    tool_name: toolName,
    tool_input: toolInput,
    // The session's own model, a base field every Cursor hook gets; the hook must not read it as the call's.
    model: "claude-opus-5-5-high",
    hook_event_name: "preToolUse",
  });

describe("the model-fill hook on Cursor's Task calls", () => {
  // TEST CHANGE, justified (qa/1): this case and the folder case below read the class model off
  // the saved list alone; a list no longer gives a model, so both now seed the operator's pins.
  it("fills the map's class model on a Stamity call that carries none, changing no other field", async () => {
    const rows = await residue(PINNED_MODELS);
    const map = JSON.parse(contentAt(rows, modelMapPath("cursor"))) as {
      classes: Record<string, { model?: string }>;
      roles: Record<string, string>;
    };
    // Non-degenerate: two pinned classes, each with its own model.
    expect(map.roles["stamity-reviewer"]).toBe("advanced");
    expect(map.classes["advanced"]?.model).toBe("claude-opus-5-5-high");
    expect(map.classes["economy"]?.model).toBe("claude-haiku-5-5-low");

    const root = await seedRepo(rows);
    const entry = modelPinsEntry(rows);
    const input = { subagent_type: "stamity-reviewer", prompt: "Review the range.", description: "review", run_in_background: false };
    const reviewer = run(entry.command, root, taskPayload(input));
    expect(reviewer.status, reviewer.stderr).toBe(0);
    expect(JSON.parse(reviewer.stdout)).toEqual({
      permission: "allow",
      updated_input: { ...input, model: "claude-opus-5-5-high" },
    });

    const runner = run(entry.command, root, taskPayload({ subagent_type: "stamity-test-runner", prompt: "Run the gates." }));
    expect(JSON.parse(runner.stdout)).toEqual({
      permission: "allow",
      updated_input: { subagent_type: "stamity-test-runner", prompt: "Run the gates.", model: "claude-haiku-5-5-low" },
    });
  });

  it("answers a bare allow, the call untouched, when the call already names a model", async () => {
    const rows = await residue(LISTED_MODELS);
    const root = await seedRepo(rows);
    const { command } = modelPinsEntry(rows);

    const answer = run(command, root, taskPayload({ subagent_type: "stamity-reviewer", prompt: "x", model: "gpt-5.6-sol-high" }));
    expect(answer.status).toBe(0);
    expect(answer.stdout).toBe('{"permission":"allow"}');
  });

  it("never fills a call it was not built for: an unmapped id, another tool, or a prototype key", async () => {
    const rows = await residue(LISTED_MODELS);
    const root = await seedRepo(rows);
    const { command } = modelPinsEntry(rows);

    const cases = [
      // A Stamity id this setup did not emit, and a vendor sub-agent: the map names neither.
      taskPayload({ subagent_type: "stamity-unknown", prompt: "x" }),
      taskPayload({ subagent_type: "generalPurpose", prompt: "x" }),
      // Keys every object inherits, outside the namespace and inside it: a lookup must read own keys only.
      taskPayload({ subagent_type: "constructor", prompt: "x" }),
      taskPayload({ subagent_type: "__proto__", prompt: "x" }),
      taskPayload({ subagent_type: "stamity-constructor", prompt: "x" }),
      // A mapped id on a tool whose name only contains the matcher's word.
      taskPayload({ subagent_type: "stamity-reviewer", prompt: "x" }, "MCP:createTask"),
    ];
    for (const input of cases) {
      const answer = run(command, root, input);
      expect({ status: answer.status, stdout: answer.stdout }, input).toEqual({ status: 0, stdout: '{"permission":"allow"}' });
    }
  });

  it("answers valid JSON allowing the call, and exits 0, on a payload it cannot read", async () => {
    const rows = await residue(LISTED_MODELS);
    const root = await seedRepo(rows);
    const { command } = modelPinsEntry(rows);

    for (const input of ["", "not json", "[]", "null", "42", JSON.stringify({ tool_name: "Task" }), taskPayload("a string"), taskPayload([1]), taskPayload({ subagent_type: 7 })]) {
      const answer = run(command, root, input);
      expect(answer.status, input).toBe(0);
      expect(JSON.parse(answer.stdout), input).toEqual({ permission: "allow" });
    }
  });

  it("gives the same answer from a folder below the root as from the root", async () => {
    const rows = await residue(PINNED_MODELS);
    const root = await seedRepo(rows);
    const { command } = modelPinsEntry(rows);
    const input = taskPayload({ subagent_type: "stamity-implementer", prompt: "Build the unit." });

    const atRoot = run(command, root, input);
    const below = run(command, getTemp().path("repo", "sub", "deeper"), input);

    expect(JSON.parse(atRoot.stdout)).toMatchObject({ updated_input: { model: "claude-opus-5-5-high" } });
    expect({ status: below.status, stdout: below.stdout }).toEqual({ status: atRoot.status, stdout: atRoot.stdout });
  });

  // review/100: the hook carries the pin as typed, never the agent file's effort group.
  it("fills a Cursor pin without the agent file's effort group when no list was read", async () => {
    const rows = await residue({ pins: { advanced: { cursor: "composer-2" } } });
    expect(contentAt(rows, ".cursor/agents/stamity-reviewer.md")).toMatch(/^model: composer-2\[effort=high\]$/m);
    const root = await seedRepo(rows);
    const input = { subagent_type: "stamity-reviewer", prompt: "Review the range." };

    const answer = run(modelPinsEntry(rows).command, root, taskPayload(input));
    expect(answer.status, answer.stderr).toBe(0);
    expect(JSON.parse(answer.stdout)).toEqual({ permission: "allow", updated_input: { ...input, model: "composer-2" } });
  });

  it("is wired on preToolUse for Task only, never fail-closed", async () => {
    const entry = modelPinsEntry(await residue(LISTED_MODELS));
    expect(entry.matcher).toBe("Task");
    expect(entry.failClosed).toBeUndefined();
  });

  // The defect of ledger row qa/1: with the account's list saved and no pin, the hook filled the
  // class's listed variant into the Task call, and Cursor refused it against its sub-agent list.
  it("fills no model, and the files name none, when the list is saved and nothing is pinned", async () => {
    const rows = await residue(LISTED_MODELS);
    const map = JSON.parse(contentAt(rows, modelMapPath("cursor"))) as { classes: Record<string, unknown> };
    expect(map.classes).toEqual({
      frontier: { fallbacks: [] },
      advanced: { fallbacks: [] },
      standard: { fallbacks: [] },
      economy: { fallbacks: [] },
    });
    const agents = rows.filter((row) => row.path.startsWith(".cursor/agents/"));
    expect(agents.length).toBeGreaterThan(1);
    for (const row of agents) expect(row.content, row.path).not.toMatch(/^model:/m);

    const root = await seedRepo(rows);
    const { command } = modelPinsEntry(rows);
    for (const agentId of ["stamity-reviewer", "stamity-implementer", "stamity-test-runner"]) {
      const answer = run(command, root, taskPayload({ subagent_type: agentId, prompt: "x" }));
      expect({ status: answer.status, stdout: answer.stdout }, agentId).toEqual({ status: 0, stdout: '{"permission":"allow"}' });
    }
  });

  it("passes every call through when no list was read and no pin names a model", async () => {
    const rows = await residue(undefined);
    const map = JSON.parse(contentAt(rows, modelMapPath("cursor"))) as { classes: Record<string, unknown>; roles: Record<string, string> };
    // Every class present and empty of a model, every emitted role still mapped to its class.
    expect(map.classes).toEqual({
      frontier: { fallbacks: [] },
      advanced: { fallbacks: [] },
      standard: { fallbacks: [] },
      economy: { fallbacks: [] },
    });
    // Every emitted agent file, the floor agents the selection cannot drop included, and only those.
    const emitted = rows
      .filter((row) => row.path.startsWith(".cursor/agents/"))
      .map((row) => row.path.slice(".cursor/agents/".length, -".md".length));
    expect(Object.keys(map.roles)).toEqual(emitted.toSorted());
    expect(map.roles).toMatchObject({ "stamity-implementer": "advanced", "stamity-reviewer": "advanced", "stamity-test-runner": "economy" });
    for (const id of emitted) expect(contentAt(rows, `.cursor/agents/${id}.md`), id).not.toMatch(/^model:/m);

    const root = await seedRepo(rows);
    const answer = run(modelPinsEntry(rows).command, root, taskPayload({ subagent_type: "stamity-reviewer", prompt: "x" }));
    expect({ status: answer.status, stdout: answer.stdout }).toEqual({ status: 0, stdout: '{"permission":"allow"}' });
  });
});
