import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildPortableHookRunner,
  COPILOT_RUNTIME_TOOL_NAMES,
  portableHookCommand,
  PORTABLE_RUNNER_FILE,
} from "../../src/hooks/portableRunner.ts";
import { planCoreHookScripts, unionToolCategoryMap } from "../../src/hooks/scripts.ts";
import type { HookInterchange } from "../../src/hooks/model.ts";
import { AGENT_POLICY_ROSTER } from "../../src/roster/agentPolicies.ts";
import { AGENT_TOOL_POLICIES_FILE, buildAgentToolPoliciesJson } from "../../src/tools/allowlist.ts";
import type { Tool } from "../../src/types/core.ts";

/**
 * The pinned sync call the Codex starter names when the hook script is missing
 * (sw26-engine-cli-call-form, REQ-FLOW-002): Codex's rendering requires one.
 */
const SYNC = { syncCall: "npx -y @zomarit/stamity@1.0.0-golden sync" };

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(tool: Tool, body: string, row: Partial<HookInterchange> = {}) {
  const root = await mkdtemp(join(tmpdir(), "stamity-hook-"));
  roots.push(root);
  const dir = join(root, ".stamity/generated/hooks", tool);
  await mkdir(dir, { recursive: true });
  const script = join(dir, PORTABLE_RUNNER_FILE);
  await writeFile(script, buildPortableHookRunner(tool));
  // TEST CHANGE (audit HOOK-5): the Codex starter now identifies the project by
  // the file Codex actually trusts — `.codex/hooks.json` — instead of by the
  // nearest generated script above the session cwd, so a Codex fixture has to
  // carry the trusted file for the starter to have a project to resolve.
  // learn.chatgpt.com/docs/hooks (accessed 2026-09-17): trust is recorded
  // against the hook definition's hash, and the scripts are outside it.
  if (tool === "codex") {
    await mkdir(join(root, ".codex"), { recursive: true });
    await writeFile(join(root, ".codex", "hooks.json"), "{}\n");
  }
  await writeFile(join(root, "check.mjs"), body);
  const hook: HookInterchange = { event: "pre_tool_use", command: [process.execPath, "check.mjs"], ...row };
  return { root, script, hook };
}
function execute(f: Awaited<ReturnType<typeof fixture>>, payload: unknown = { toolName: "bash", toolArgs: { command: "pwd" } }) {
  return spawnSync(process.execPath, [f.script, Buffer.from(JSON.stringify(f.hook)).toString("base64url")], { cwd: tmpdir(), input: JSON.stringify(payload), encoding: "utf8" });
}
const output = (value: unknown) => `process.stdout.write(${JSON.stringify(JSON.stringify(value))});`;

describe("portable native hook boundary", () => {
  it.each(["cursor", "copilot"] as const)("%s translates canonical deny without exposing unsupported output values", async (tool) => {
    const f = await fixture(tool, output({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "Policy refuses this call", updatedInput: { privateValue: "do-not-echo" } } }));
    const result = execute(f);
    expect(result.status).toBe(0);
    const value = JSON.parse(result.stdout);
    expect(tool === "cursor" ? value.permission : value.permissionDecision).toBe("deny");
    expect(result.stderr).toContain("unsupported output field: hookSpecificOutput.updatedInput");
    expect(result.stderr).not.toContain("do-not-echo");
  });

  it.each(["cursor", "copilot"] as const)("%s preserves explicit allow and rejects mismatched event output", async (tool) => {
    const allow = await fixture(tool, output({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } }));
    expect(JSON.parse(execute(allow).stdout)).toHaveProperty(tool === "cursor" ? "permission" : "permissionDecision", "allow");
    const mismatch = await fixture(tool, output({ hookSpecificOutput: { hookEventName: "Stop", permissionDecision: "allow" } }));
    expect(execute(mismatch).status).toBe(1);
  });

  it.each(["cursor", "copilot", "codex"] as const)("%s gives a global stop precedence over a tool allow and its reason", async (tool) => {
    const f = await fixture(tool, output({
      continue: false,
      stopReason: "Policy requires stop",
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: "The individual tool is permitted",
      },
    }));
    const result = execute(f);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    const native = tool === "codex" ? parsed.hookSpecificOutput : parsed;
    expect(tool === "cursor" ? native.permission : native.permissionDecision).toBe("deny");
    expect(tool === "cursor" ? native.user_message : native.permissionDecisionReason).toBe("Policy requires stop");
  });

  it("preserves Codex's native hookSpecificOutput unchanged", async () => {
    const value = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "Policy" } };
    expect(JSON.parse(execute(await fixture("codex", output(value))).stdout)).toEqual(value);
  });

  it("converts Codex's unsupported ask and stop controls to a supported denial", async () => {
    await Promise.all([
      { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: "Review first" } },
      { continue: false, stopReason: "Review first" },
    ].map(async (value) => {
      const result = execute(await fixture("codex", output(value)));
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "Review first" } });
      expect(result.stderr).toContain("manual permission review");
    }));
  });

  it("rejects invalid Codex rewrite objects and removes unsupported flags without losing a denial", async () => {
    const bad = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: [] } };
    expect(execute(await fixture("codex", output(bad))).status).toBe(2);
    const deny = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" }, suppressOutput: true };
    const result = execute(await fixture("codex", output(deny)));
    expect(JSON.parse(result.stdout)).toEqual({ hookSpecificOutput: deny.hookSpecificOutput });
    expect(result.stderr).toContain("unsupported output field: suppressOutput");
  });

  it("preserves Codex prompt context on its documented plaintext channel", async () => {
    const result = execute(await fixture("codex", 'process.stdout.write("Prompt context");', { event: "user_prompt_submit" }));
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("Prompt context\n");
  });

  it("normalizes tool input without fabricating calling-agent identity and executes from the repository root", async () => {
    const f = await fixture("codex", 'import {readFileSync} from "node:fs"; process.stdout.write(JSON.stringify({cwd:process.cwd(),payload:JSON.parse(readFileSync(0,"utf8"))}));');
    const child = execute(f);
    expect(child.status, child.stderr).toBe(0);
    const result = JSON.parse(child.stdout);
    // Windows may report an 8.3 cwd while fs.realpath returns its long spelling.
    // Compare physical directory identity on both sides, retaining the root boundary.
    expect(await realpath(result.cwd)).toBe(await realpath(f.root));
    expect(result.payload).toMatchObject({ tool_name: "bash", tool_input: { command: "pwd" }, hook_event_name: "PreToolUse" });
    expect(result.payload).not.toHaveProperty("agent_type");
  });

  // TEST CHANGE, justified (e6-copilot-adapter, REQ-FLOW-086): Copilot's runtime
  // name `edit` now reaches the authored hook as the Claude name `Edit`, so the
  // child's allow condition reads the restored name. The argument and path
  // normalization this case pins is unchanged.
  it.each([true, false])("normalizes Copilot tool arguments (serialized: %s) and file paths for portable hooks", async (serialized) => {
    const f = await fixture("copilot", 'import {readFileSync} from "node:fs"; const input = JSON.parse(readFileSync(0,"utf8")); process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision: input.tool_input.file_path === "src/app.ts" && input.tool_name === "Edit" ? "allow" : "deny"}}));');
    const args = { filePath: "src/app.ts" };
    const result = execute(f, { toolName: "edit", toolArgs: serialized ? JSON.stringify(args) : args });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).permissionDecision).toBe("allow");
  });

  /** A child that denies with the `tool_name` it received as the reason, so the test reads what the hook saw. */
  const ECHO_TOOL = 'import {readFileSync} from "node:fs"; const input = JSON.parse(readFileSync(0,"utf8")); process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:String(input.tool_name)}}));';

  it.each(Object.entries(COPILOT_RUNTIME_TOOL_NAMES))("hands an authored hook Copilot's %s as the Claude name %s (REQ-FLOW-086)", async (runtime, claude) => {
    const result = execute(await fixture("copilot", ECHO_TOOL), { toolName: runtime, toolArgs: {} });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ permissionDecision: "deny", permissionDecisionReason: claude });
  });

  it("hands a hook matched on Claude's legacy `Task` the name `Agent` for Copilot's `task` (build/58)", async () => {
    const result = execute(await fixture("copilot", ECHO_TOOL, { matcher: "Task" }), { toolName: "task", toolArgs: {} });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).permissionDecisionReason).toBe("Agent");
  });

  // TEST CHANGE, justified (e6-copilot-adapter fix round 1, review/95): `powershell`
  // now maps to Claude's `PowerShell` (the it.each above covers it), so the
  // pass-through list names `apply_patch` in its place (review/94).
  it("passes a Copilot tool name with no Claude twin through unchanged, an inherited property name included", async () => {
    const f = await fixture("copilot", ECHO_TOOL);
    for (const name of ["apply_patch", "Bash", "constructor", "toString", "github-mcp-server/get_issue"]) {
      const result = execute(f, { toolName: name, toolArgs: {} });
      expect(result.status, `${name}: ${result.stderr}`).toBe(0);
      expect(JSON.parse(result.stdout).permissionDecisionReason, name).toBe(name);
    }
  });

  it("hands apply_patch to an authored hook under its own name with its patch input unchanged (review/94)", async () => {
    const ECHO_INPUT = 'import {readFileSync} from "node:fs"; const input = JSON.parse(readFileSync(0,"utf8")); process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:JSON.stringify({name:input.tool_name,input:input.tool_input})}}));';
    const patch = "*** Begin Patch\n*** Update File: src/secret.ts\n@@\n-a\n+b\n*** End Patch\n";
    const result = execute(await fixture("copilot", ECHO_INPUT), { toolName: "apply_patch", toolArgs: JSON.stringify({ input: patch }) });
    expect(result.status, result.stderr).toBe(0);
    const seen = JSON.parse(JSON.parse(result.stdout).permissionDecisionReason);
    expect(seen).toEqual({ name: "apply_patch", input: { input: patch } });
    expect(seen.input).not.toHaveProperty("file_path");
  });

  it("restores tool names on Copilot alone: Cursor and Codex hand the hook the name they were sent", async () => {
    const cursor = execute(await fixture("cursor", ECHO_TOOL), { tool_name: "bash" });
    expect(JSON.parse(cursor.stdout).user_message).toBe("bash");
    const codex = execute(await fixture("codex", ECHO_TOOL), { tool_name: "bash" });
    expect(JSON.parse(codex.stdout).hookSpecificOutput.permissionDecisionReason).toBe("bash");
    // Only Copilot's runner carries the table at all.
    expect(buildPortableHookRunner("cursor")).not.toContain("RUNTIME_TOOL_NAMES");
    expect(buildPortableHookRunner("codex")).not.toContain("RUNTIME_TOOL_NAMES");
    expect(buildPortableHookRunner("copilot")).toContain("RUNTIME_TOOL_NAMES");
  });

  it("lets the core guard place every mapped shell, edit, read and spawn call, and narrows no category it placed before", () => {
    const categories = unionToolCategoryMap();
    const categoryOf = (name: string): string | undefined => (Object.hasOwn(categories, name) ? categories[name] : undefined);
    // TEST CHANGE, justified (e6-copilot-adapter fix round 1, review/94, review/95):
    // `apply_patch` left the table and `powershell` joined it.
    // TEST CHANGE, justified (bot round 1, review/132): `web_fetch`, `web_search`
    // and `update_todo` joined the table, so the guard places them too.
    const expected: Record<string, string> = {
      bash: "execute",
      powershell: "execute",
      edit: "edit",
      str_replace_editor: "edit",
      create: "edit",
      view: "read",
      grep: "read",
      rg: "read",
      glob: "read",
      task: "spawn",
      web_fetch: "network",
      web_search: "network",
      update_todo: "planning",
    };
    for (const [runtime, category] of Object.entries(expected)) {
      expect(categoryOf(COPILOT_RUNTIME_TOOL_NAMES[runtime] ?? ""), runtime).toBe(category);
    }
    // Copilot's shell name was unknown to the guard before the mapping.
    expect(categoryOf("bash")).toBeUndefined();
    for (const [runtime, claude] of Object.entries(COPILOT_RUNTIME_TOOL_NAMES)) {
      // A runtime name the guard already placed keeps its category through the mapping.
      if (categoryOf(runtime) !== undefined) expect(categoryOf(claude), runtime).toBe(categoryOf(runtime));
    }
    // apply_patch keeps its name, which the guard places nowhere, exactly as before the table.
    expect(Object.hasOwn(COPILOT_RUNTIME_TOOL_NAMES, "apply_patch")).toBe(false);
    expect(categoryOf("apply_patch")).toBeUndefined();
    // The question tool is in no category under either name, so the guard treats it as it did.
    expect(categoryOf("ask_user")).toBeUndefined();
    expect(categoryOf("AskUserQuestion")).toBeUndefined();
  });

  /**
   * Copilot's web and to-do calls with an input of Copilot's own shape. The
   * hooks reference types camelCase `toolArgs` as unknown, so these inputs are
   * illustrative; what is pinned is that the runner hands them on unchanged.
   */
  const COPILOT_WEB_AND_TODO_CALLS = [
    ["web_fetch", "WebFetch", { url: "https://example.com/page", prompt: "Summarize the page" }],
    ["web_search", "WebSearch", { query: "copilot hooks reference" }],
    ["update_todo", "TodoWrite", { todos: [{ content: "Write the test", status: "in_progress" }] }],
  ] as const;

  it("hands Copilot's web_fetch, web_search and update_todo to an authored hook as WebFetch, WebSearch and TodoWrite, its input unchanged (review/132)", async () => {
    const ECHO_INPUT = 'import {readFileSync} from "node:fs"; const input = JSON.parse(readFileSync(0,"utf8")); process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:JSON.stringify({name:input.tool_name,input:input.tool_input})}}));';
    const f = await fixture("copilot", ECHO_INPUT);
    for (const [runtime, claude, args] of COPILOT_WEB_AND_TODO_CALLS) {
      for (const toolArgs of [args, JSON.stringify(args)]) {
        const result = execute(f, { sessionId: "s-1", timestamp: 1760500000000, cwd: f.root, toolName: runtime, toolArgs });
        expect(result.status, `${runtime}: ${result.stderr}`).toBe(0);
        expect(JSON.parse(JSON.parse(result.stdout).permissionDecisionReason), runtime).toEqual({ name: claude, input: args });
      }
    }
  });

  it("lets every pre-tool-use hook shipped for Copilot take its web_fetch, web_search and update_todo calls without a block or a crash (review/132)", async () => {
    const f = await fixture("copilot", "");
    const dir = join(f.root, ".stamity/generated/hooks/copilot");
    const plan = planCoreHookScripts(`../../${AGENT_TOOL_POLICIES_FILE}`, "copilot", { packageName: "@zomarit/stamity", version: "1.0.0-golden" });
    await writeFile(join(f.root, ".stamity/generated", AGENT_TOOL_POLICIES_FILE), buildAgentToolPoliciesJson(AGENT_POLICY_ROSTER));
    await Promise.all(plan.map((script) => writeFile(join(dir, script.fileName), script.content)));
    // Every row a tool call reaches: the core guard is the one the core plan has.
    const toolRows = plan.filter((script) => script.event === "pre_tool_use" || script.event === "post_tool_use");
    expect(toolRows.map((script) => script.fileName)).toEqual(["stamity-pre-tool-use-guard.mjs"]);
    for (const script of toolRows) {
      const shipped = { ...f, hook: { event: script.event, command: ["node", `.stamity/generated/hooks/copilot/${script.fileName}`] } satisfies HookInterchange };
      for (const [runtime, , args] of COPILOT_WEB_AND_TODO_CALLS) {
        for (const toolArgs of [args, JSON.stringify(args)]) {
          const result = execute(shipped, { sessionId: "s-1", timestamp: 1760500000000, cwd: f.root, toolName: runtime, toolArgs });
          // Exit 0, nothing on stdout (no decision written) and nothing on stderr (no refusal record, no fault).
          expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }, `${script.fileName} ${runtime}`).toEqual({ status: 0, stdout: "", stderr: "" });
        }
      }
    }
  });

  /** A child that echoes the payload it received on stderr, which the runner passes through on every event. */
  const ECHO_PAYLOAD = 'import {readFileSync} from "node:fs"; process.stderr.write(readFileSync(0,"utf8"));';

  it("also gives Copilot's camelCase transcriptPath, stopReason, initialPrompt and toolResult under their snake_case keys, keeping the camelCase ones (review/133)", async () => {
    const stop = await fixture("copilot", ECHO_PAYLOAD, { event: "stop" });
    const stopPayload = { sessionId: "s-1", timestamp: 1760500000000, cwd: "/repo", transcriptPath: "/tmp/transcript.jsonl", stopReason: "end_turn", stop_hook_active: false };
    const stopResult = execute(stop, stopPayload);
    expect(stopResult.status, stopResult.stderr).toBe(0);
    expect(JSON.parse(stopResult.stderr)).toEqual({
      ...stopPayload,
      hook_event_name: "Stop",
      session_id: "s-1",
      transcript_path: "/tmp/transcript.jsonl",
      stop_reason: "end_turn",
    });

    const start = await fixture("copilot", ECHO_PAYLOAD, { event: "session_start" });
    const startResult = execute(start, { sessionId: "s-1", timestamp: 1760500000000, initialPrompt: "Fix the failing test" });
    expect(startResult.status, startResult.stderr).toBe(0);
    expect(JSON.parse(startResult.stderr)).toMatchObject({ initialPrompt: "Fix the failing test", initial_prompt: "Fix the failing test", timestamp: 1760500000000 });

    const post = await fixture("copilot", ECHO_PAYLOAD, { event: "post_tool_use" });
    const toolResult = { resultType: "success", textResultForLlm: "a.txt\n" };
    const postResult = execute(post, { sessionId: "s-1", toolName: "bash", toolArgs: { command: "ls" }, toolResult });
    expect(postResult.status, postResult.stderr).toBe(0);
    expect(JSON.parse(postResult.stderr)).toMatchObject({ tool_name: "Bash", toolResult, tool_result: toolResult });

    // A snake_case key the payload already carries is the one the hook reads.
    const both = execute(stop, { transcriptPath: "/camel.jsonl", transcript_path: "/snake.jsonl", stopReason: "end_turn", stop_reason: "user_stop" });
    expect(JSON.parse(both.stderr)).toMatchObject({ transcriptPath: "/camel.jsonl", transcript_path: "/snake.jsonl", stopReason: "end_turn", stop_reason: "user_stop" });
  });

  it.each(["cursor", "copilot", "codex"] as const)("%s rejects malformed output and input without echoing payload fragments", async (tool) => {
    const f = await fixture(tool, output({ hookSpecificOutput: { hookEventName: "Stop", permissionDecision: "allow" } }));
    expect(execute(f).status).toBe(tool === "codex" ? 2 : 1);
    const bad = spawnSync(process.execPath, [f.script, Buffer.from(JSON.stringify(f.hook)).toString("base64url")], { input: '{"private":"must-not-appear"', encoding: "utf8" });
    expect(bad.status).toBe(tool === "codex" ? 2 : 1);
    expect(bad.stderr).toContain("Invalid hook input JSON");
    expect(bad.stderr).not.toContain("must-not-appear");
  });

  it("executes the native Codex command from a nested initialized project without a git-root assumption", async () => {
    const f = await fixture("codex", output({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" } }));
    const nested = join(f.root, "packages", "deep directory");
    await mkdir(nested, { recursive: true });
    const result = spawnSync(portableHookCommand("codex", f.hook, SYNC), { cwd: nested, shell: true, input: "{}", encoding: "utf8" });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("runs the script beside .codex/hooks.json, not a nearer one belonging to another project", async () => {
    // HOOK-5. `a/b` is the project Codex trusted: its `.codex/hooks.json` is the
    // file whose hash the client recorded. `a` is an unrelated checkout that
    // happens to sit above it with a generated hooks directory of its own. The
    // old starter took the nearest `.stamity/generated/hooks/codex/` above the
    // session cwd, which is `a`'s — an executable this project never reviewed.
    const f = await fixture("codex", output({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "from the trusted project" } }));
    const project = join(f.root, "a", "b");
    const decoyRoot = join(f.root, "a");
    const projectRunner = join(project, ".stamity", "generated", "hooks", "codex");
    const decoyRunner = join(decoyRoot, ".stamity", "generated", "hooks", "codex");
    await mkdir(join(project, ".codex"), { recursive: true });
    await mkdir(projectRunner, { recursive: true });
    await mkdir(decoyRunner, { recursive: true });
    await writeFile(join(project, ".codex", "hooks.json"), "{}\n");
    await writeFile(join(project, "check.mjs"), output({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "from the trusted project" } }));
    await writeFile(join(projectRunner, PORTABLE_RUNNER_FILE), buildPortableHookRunner("codex"));
    // The decoy would answer if it were reached: a different, recognisable verdict.
    await writeFile(join(decoyRoot, "check.mjs"), output({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } }));
    await writeFile(join(decoyRunner, PORTABLE_RUNNER_FILE), buildPortableHookRunner("codex"));

    // shell: false and node:path composition, so the Windows leg runs this too.
    const starter = portableHookCommand("codex", f.hook, SYNC);
    // TEST CHANGE, justified (REQ-FLOW-142): the starter now ends with the row's script as a plain word after the row.
    const program = /^node -e "(.*)" ([A-Za-z0-9_-]+) ([A-Za-z0-9._/-]+)$/s.exec(starter);
    expect(program, starter).not.toBeNull();
    const nested = join(project, "packages", "deep directory");
    await mkdir(nested, { recursive: true });
    const result = spawnSync(process.execPath, ["-e", program![1]!, program![2]!, program![3]!], {
      cwd: nested, shell: false, input: "{}", encoding: "utf8",
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason).toBe("from the trusted project");
  });

  it("refuses rather than guessing when no .codex/hooks.json is above the session directory", async () => {
    const f = await fixture("codex", output({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" } }));
    const orphan = await mkdtemp(join(tmpdir(), "stamity-hook-orphan-"));
    roots.push(orphan);
    const starter = portableHookCommand("codex", f.hook, SYNC);
    // TEST CHANGE, justified (REQ-FLOW-142): the starter now ends with the row's script as a plain word after the row.
    const program = /^node -e "(.*)" ([A-Za-z0-9_-]+) ([A-Za-z0-9._/-]+)$/s.exec(starter);
    const result = spawnSync(process.execPath, ["-e", program![1]!, program![2]!, program![3]!], {
      cwd: orphan, shell: false, input: "{}", encoding: "utf8",
    });
    // TEST CHANGE, justified: this row is an authored Codex pre-tool-use row, where a fault inside
    // the runner exits 2; the starter's own failure now takes the same exit, since Codex lets a
    // call through on any other non-zero one. The refusal and its message are unchanged.
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Stamity hook project root not found");
    expect(result.stdout).toBe("");
  });

  it("names the pinned sync call when the script beside .codex/hooks.json is missing", async () => {
    // G3: the starter lives in `.codex/hooks.json`, so its remedy is the pinned
    // call — a bare `stamity sync` there fails on the documented npx setup.
    const project = await mkdtemp(join(tmpdir(), "stamity-hook-missing-"));
    roots.push(project);
    await mkdir(join(project, ".codex"), { recursive: true });
    await writeFile(join(project, ".codex", "hooks.json"), "{}\n");
    const hook: HookInterchange = { event: "pre_tool_use", command: ["node", "check.mjs"] };
    const starter = portableHookCommand("codex", hook, SYNC);
    // TEST CHANGE, justified (REQ-FLOW-142): the starter now ends with the row's script as a plain word after the row.
    const program = /^node -e "(.*)" ([A-Za-z0-9_-]+) ([A-Za-z0-9._/-]+)$/s.exec(starter);
    expect(program, starter).not.toBeNull();
    const result = spawnSync(process.execPath, ["-e", program![1]!, program![2]!, program![3]!], {
      cwd: project, shell: false, input: "{}", encoding: "utf8",
    });
    // TEST CHANGE, justified: an authored Codex pre-tool-use row; a missing runner now exits 2, the
    // runner's own fault exit on that row, rather than the 1 Codex lets the call through on. The
    // message naming the pinned call is unchanged.
    expect(result.status).toBe(2);
    expect(result.stderr).toBe(
      "Stamity hook script missing beside .codex/hooks.json; run npx -y @zomarit/stamity@1.0.0-golden sync",
    );
  });

  it("renders a registry fork's sync call, whose `:` and `=` are plain text in the starter (REQ-PLUGIN-048)", async () => {
    const project = await mkdtemp(join(tmpdir(), "stamity-hook-registry-"));
    roots.push(project);
    await mkdir(join(project, ".codex"), { recursive: true });
    await writeFile(join(project, ".codex", "hooks.json"), "{}\n");
    const hook: HookInterchange = { event: "pre_tool_use", command: ["node", "check.mjs"] };
    const syncCall = "npx -y --@acme:registry=https://npm.pkg.github.com @acme/stamity@1.12.0 sync";
    const starter = portableHookCommand("codex", hook, { syncCall });
    // TEST CHANGE, justified (REQ-FLOW-142): the starter now ends with the row's script as a plain word after the row.
    const program = /^node -e "(.*)" ([A-Za-z0-9_-]+) ([A-Za-z0-9._/-]+)$/s.exec(starter);
    expect(program, starter).not.toBeNull();
    const result = spawnSync(process.execPath, ["-e", program![1]!, program![2]!, program![3]!], {
      cwd: project, shell: false, input: "{}", encoding: "utf8",
    });
    // TEST CHANGE, justified: the same authored Codex pre-tool-use row as above, so the same exit 2.
    expect(result.status).toBe(2);
    // The call reaches the reader whole: the registry argument and the spec it precedes.
    expect(result.stderr).toBe(`Stamity hook script missing beside .codex/hooks.json; run ${syncCall}`);
  });

  it("fails closed on Codex only where the runner does: an authored pre-tool-use row exits 2, every other row 1", async () => {
    const project = await mkdtemp(join(tmpdir(), "stamity-hook-closed-"));
    roots.push(project);
    await mkdir(join(project, ".codex"), { recursive: true });
    await writeFile(join(project, ".codex", "hooks.json"), "{}\n");
    const orphan = await mkdtemp(join(tmpdir(), "stamity-hook-closed-orphan-"));
    roots.push(orphan);
    const rows: [HookInterchange, number][] = [
      [{ event: "pre_tool_use", command: ["node", ".codex/hooks/check.mjs"] }, 2],
      [{ event: "pre_tool_use", command: ["node", ".stamity/generated/hooks/codex/stamity-pre-tool-use-guard.mjs"] }, 1],
      [{ event: "post_tool_use", command: ["node", "check.mjs"] }, 1],
      [{ event: "session_start", command: ["node", "check.mjs"] }, 1],
    ];
    for (const [hook, exit] of rows) {
      // TEST CHANGE, justified (REQ-FLOW-142): the starter now ends with the row's script as a plain word after the row.
      const program = /^node -e "(.*)" ([A-Za-z0-9_-]+) ([A-Za-z0-9._/-]+)$/s.exec(portableHookCommand("codex", hook, SYNC));
      expect(program).not.toBeNull();
      for (const cwd of [project, orphan]) {
        const result = spawnSync(process.execPath, ["-e", program![1]!, program![2]!, program![3]!], {
          cwd, shell: false, input: "{}", encoding: "utf8",
        });
        expect(result.status, `${hook.event} ${hook.command[1]} in ${cwd === project ? "the project" : "no project"}`).toBe(exit);
      }
    }
    // Every row but the authored pre-tool-use one keeps its starter's bytes, and so the trust Codex recorded.
    const guardRow = rows[1]![0];
    expect(portableHookCommand("codex", guardRow, SYNC)).toContain("process.exitCode=1;break;");
    expect(portableHookCommand("codex", guardRow, SYNC)).toContain("process.exitCode=r.status??1;");
  });

  it("refuses to render the Codex starter without a pinned sync call, or with one carrying shell syntax", () => {
    const hook: HookInterchange = { event: "pre_tool_use", command: ["node", "check.mjs"] };
    expect(() => portableHookCommand("codex", hook)).toThrow(/pinned sync call/);
    for (const syncCall of ['npx -y "x" sync', "npx -y $(touch pwned) sync", "npx -y `id` sync", "npx -y %PATH% sync"]) {
      expect(() => portableHookCommand("codex", hook, { syncCall }), syncCall).toThrow(/pinned sync call/);
    }
    // TEST CHANGE, justified (plan 020 file 2, unit e5-hook-starter, REQ-FLOW-084):
    // the comment said the other clients never render the starter. Cursor and
    // Copilot now do, and without a pinned call their starter names the sync
    // verb rather than refusing; the assertion itself is unchanged.
    expect(portableHookCommand("cursor", hook)).toContain(".stamity/generated/hooks/cursor/");
  });

  it.each(["cursor", "copilot", "codex"] as const)("%s preserves denial exits and reports child errors", async (tool) => {
    expect(execute(await fixture(tool, "process.exitCode = 2;")).status).toBe(2);
    const f = await fixture(tool, "", { command: ["stamity-missing-hook-executable"] });
    const result = execute(f);
    expect(result.status).toBe(tool === "codex" ? 2 : 1);
    expect(result.stderr).toContain("Hook process failed");
  });

  it("blocks with 2 on Codex when an authored pre-tool-use hook fails with any status, and passes the status on every other row", async () => {
    await Promise.all(["process.exit(1);", "process.exit(3);", "throw new Error('authored hook crashed');"].map(async (body) => {
      const result = execute(await fixture("codex", body));
      expect(result.status, `codex authored pre-tool-use: ${body}`).toBe(2);
    }));
    // The core guard is telemetry on Codex, and the other events decide nothing: their status passes as it was.
    const guard = ".stamity/generated/hooks/codex/stamity-pre-tool-use-guard.mjs";
    const core = await fixture("codex", "", { command: [process.execPath, guard] });
    await writeFile(join(core.root, ...guard.split("/")), "process.exit(1);");
    expect(execute(core).status).toBe(1);
    expect(execute(await fixture("codex", "process.exit(3);", { event: "post_tool_use" })).status).toBe(3);
    // Cursor and Copilot keep the child's own status on the same row.
    await Promise.all((["cursor", "copilot"] as const).map(async (tool) => {
      expect(execute(await fixture(tool, "process.exit(3);")).status, tool).toBe(3);
    }));
  });

  it("keeps Copilot timeouts fail-open and Cursor timeouts visible to failClosed", async () => {
    await Promise.all((["cursor", "copilot"] as const).map(async (tool) => {
      const result = execute(await fixture(tool, "setTimeout(() => {}, 10000);", { timeoutMs: 20 }));
      expect(result.status).toBe(tool === "copilot" ? 0 : 1);
      expect(result.stderr).toMatch(/timeout|ETIMEDOUT/);
    }));
  });

  // TEST CHANGE (audit HOOK-2): this test pinned the discard as correct. The
  // Copilot hooks reference read 2026-09-17 says a sessionStart hook injects
  // through `additionalContext`, so plain-text session-start output is wrapped
  // and delivered instead of dropped with a "read it yourself" warning.
  // docs.github.com/en/copilot/reference/hooks-reference (accessed 2026-09-17)
  it("wraps Copilot's plain-text session-start output as additionalContext", async () => {
    const result = execute(await fixture("copilot", 'process.stdout.write("learning index");', { event: "session_start" }));
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ additionalContext: "learning index" });
    expect(result.stderr).not.toContain("manually");
  });

  it("maps a Copilot session-start JSON additionalContext onto the native field", async () => {
    const result = execute(
      await fixture(
        "copilot",
        output({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "two learnings, one handoff" } }),
        { event: "session_start" },
      ),
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ additionalContext: "two learnings, one handoff" });
  });

  it("leaves a Copilot session-start JSON object with no additionalContext alone, naming the field it did carry", async () => {
    const result = execute(
      await fixture("copilot", output({ additionalNotes: "not a field this client reads" }), { event: "session_start" }),
    );
    expect(result.status).toBe(0);
    // Nothing is fabricated from an unrecognized shape: no additionalContext is
    // invented, and the field is named — never its value — on stderr.
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("unsupported output field: <unrecognized>");
    expect(result.stderr).not.toContain("not a field this client reads");
  });

  // HOOK-1: cursor.com/docs/hooks (accessed 2026-09-17) counts "no output" as a
  // failClosed failure, so a child that decides nothing cannot be reported as
  // silence — the runner writes the allow for it.
  it("writes an explicit Cursor allow when a pre-tool-use child decides nothing", async () => {
    const silent = execute(await fixture("cursor", "process.exitCode = 0;"));
    expect(silent.status).toBe(0);
    expect(JSON.parse(silent.stdout)).toEqual({ permission: "allow" });

    // A JSON object that carries no decision reaches the same verdict.
    const undecided = execute(await fixture("cursor", output({ systemMessage: "seen" })));
    expect(JSON.parse(undecided.stdout)).toEqual({ permission: "allow" });
  });

  // SEC-W1-1: the explicit allow above must not swallow a verdict the runner
  // could not read. A child writing Cursor's own native document, or a
  // misspelled canonical key, carries a decision this runner does not
  // understand — writing `allow` for it would convert a deny into an approval.
  it("refuses to allow a Cursor pre-tool-use call whose decision it could not read", async () => {
    const native = execute(await fixture("cursor", output({ permission: "deny", user_message: "no-such-value-on-stderr" })));
    expect(native.status).toBe(1);
    expect(native.stdout).toBe("");
    expect(native.stderr).toContain("unsupported output field: <unrecognized>");
    expect(native.stderr).not.toContain("no-such-value-on-stderr");

    const misspelled = execute(await fixture("cursor", output({ permissionDecison: "deny" })));
    expect(misspelled.status).toBe(1);
    expect(misspelled.stdout).toBe("");
  });

  // SEC-W2-1: the residual of the one above, at VALUE level. `decision` is a
  // key this runner KNOWS, so an unreadable value on it is never
  // `<unrecognized>` and never sets `undecidable` — `{"decision":"deny"}` used
  // to fall straight through to the explicit Cursor allow, turning a child that
  // plainly meant to refuse into an approval. The value is now validated at the
  // same shared seam `permissionDecision` is validated at, so the fault is the
  // same on every client rather than a Cursor-only patch.
  it("faults on a decision value outside approve and block rather than allowing the call", async () => {
    const cursor = execute(await fixture("cursor", output({ decision: "deny", reason: "no-such-value-on-stderr" })));
    expect(cursor.status).toBe(1);
    expect(cursor.stdout).toBe("");
    expect(cursor.stderr).toContain("Unsupported decision");
    expect(cursor.stderr).not.toContain("no-such-value-on-stderr");

    // The same input on the other two clients: neither writes an allow either.
    // Codex blocks a non-core pre-tool-use call on exit 2 and nothing else, so
    // that is the fail-closed exit there; Copilot rejects every nonzero exit,
    // so 1 is. Both write nothing at all.
    const codex = execute(await fixture("codex", output({ decision: "deny" })));
    expect(codex.status).toBe(2);
    expect(codex.stdout).toBe("");
    const copilot = execute(await fixture("copilot", output({ decision: "deny" })));
    expect(copilot.status).toBe(1);
    expect(copilot.stdout).toBe("");
  });

  it("keeps the two legacy decision values readable on every client", async () => {
    // The guard validates the VALUE, so the legacy vocabulary itself is
    // untouched: `block` still denies, and `approve` is still ignored with a
    // warning rather than faulting.
    const blocked = execute(await fixture("cursor", output({ decision: "block", reason: "Policy refuses this call" })));
    expect(blocked.status).toBe(0);
    expect(JSON.parse(blocked.stdout)).toEqual({ permission: "deny", user_message: "Policy refuses this call" });

    const approved = execute(await fixture("cursor", output({ decision: "approve" })));
    expect(approved.status).toBe(0);
    expect(JSON.parse(approved.stdout)).toEqual({ permission: "allow" });
  });

  it("leaves a silent child silent on the events and clients that document no allow", async () => {
    // Only Cursor's failClosed clause makes silence a failure, and only the
    // permission event has an allow to write.
    expect(execute(await fixture("cursor", "process.exitCode = 0;", { event: "post_tool_use" })).stdout).toBe("");
    expect(execute(await fixture("copilot", "process.exitCode = 0;")).stdout).toBe("");
    expect(execute(await fixture("codex", "process.exitCode = 0;")).stdout).toBe("");
  });

  it("keeps a runner fault on the Copilot core role guard out of the pending call's way", async () => {
    // The core pre-tool-use guard is telemetry on Copilot: its payload names no
    // calling agent. A fault inside the runner therefore must not decide the
    // call, and on this client every nonzero exit does.
    const guard = ".stamity/generated/hooks/copilot/stamity-pre-tool-use-guard.mjs";
    const core = await fixture("copilot", "", { command: ["stamity-missing-hook-executable", guard] });
    const coreResult = execute(core);
    expect(coreResult.status).toBe(0);
    expect(coreResult.stderr).toContain("Hook process failed");

    // An authored row is not telemetry and keeps the blocking exit.
    const authored = await fixture("copilot", "", { command: ["stamity-missing-hook-executable"] });
    expect(execute(authored).status).toBe(1);
  });

  it("ignores a legacy approve on Codex with a warning instead of failing the hook", async () => {
    // Every other client's branch drops `decision: "approve"` unread; this one
    // turned it into a runner fault, which on Codex is an exit-2 denial of the
    // very call the hook meant to allow.
    const result = execute(await fixture("codex", output({ decision: "approve", reason: "allowed by policy" })));
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("legacy approve is unsupported and ignored");
    expect(JSON.parse(result.stdout)).toEqual({ reason: "allowed by policy" });
  });

  it.each(["session_start", "post_tool_use"] as const)("carries Cursor %s context on the native field", async (event) => {
    const hookEventName = event === "session_start" ? "SessionStart" : "PostToolUse";
    const result = execute(await fixture("cursor", output({ hookSpecificOutput: { hookEventName, additionalContext: "learning index" } }), { event }));
    expect(JSON.parse(result.stdout)).toEqual({ additional_context: "learning index" });
  });

  it("keeps shell metacharacters inside encoded argv and locates Codex's initialized project", () => {
    const hook: HookInterchange = { event: "pre_tool_use", command: ["node", "path with space.mjs", "$(touch should-not-exist)"] };
    const command = portableHookCommand("codex", hook, SYNC);
    expect(command).toContain("process.cwd()");
    expect(command).not.toContain("touch should-not-exist");
  });

  // A hook may exit without reading its input; above the pipe buffer the payload write then fails with EPIPE, and the
  // child's own status is still the decision (CI's flake of "still starts any other launcher…" was its small-payload form).
  it.each(["cursor", "copilot", "codex"] as const)("%s yields the child's own status when the child exits without reading its whole input", async (tool) => {
    const f = await fixture(tool, 'process.stderr.write("child-ran-without-reading\\n"); process.exit(0);');
    const result = execute(f, { toolName: "bash", toolArgs: { command: "x".repeat(1024 * 1024) } });
    expect(result.stderr).toContain("child-ran-without-reading");
    expect(result.stderr).not.toContain("Hook process failed");
    expect(result.status, result.stderr).toBe(0);
  });

  // The same unread input, with a hook that fails: the runner passes on the child's own status, 3, not its own 1.
  // TEST CHANGE, justified: on Codex this authored pre-tool-use row now blocks with 2 on any failing status, as the
  // case "blocks with 2 on Codex when an authored pre-tool-use hook fails…" holds; the unread input is still not a fault.
  it.each(["cursor", "copilot", "codex"] as const)("%s passes on the child's own failing status when the child exits without reading its whole input", async (tool) => {
    const f = await fixture(tool, 'process.stderr.write("child-ran-without-reading\\n"); process.exit(3);');
    const result = execute(f, { toolName: "bash", toolArgs: { command: "x".repeat(1024 * 1024) } });
    expect(result.stderr).toContain("child-ran-without-reading");
    expect(result.stderr).not.toContain("Hook process failed");
    expect(result.status, result.stderr).toBe(tool === "codex" ? 2 : 3);
  });

  // The same unread input, with a hook that decides: its stdout still reaches the client as that client's own deny.
  it.each(["cursor", "copilot", "codex"] as const)("%s still takes the decision a child writes when the child exits without reading its whole input", async (tool) => {
    const deny = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "Policy refuses this call" } };
    const f = await fixture(tool, output(deny));
    const result = execute(f, { toolName: "bash", toolArgs: { command: "x".repeat(1024 * 1024) } });
    expect(result.stderr).not.toContain("Hook process failed");
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      cursor: { permission: "deny", user_message: "Policy refuses this call" },
      copilot: { permissionDecision: "deny", permissionDecisionReason: "Policy refuses this call" },
      codex: deny,
    }[tool]);
  });

  // A Copilot timeout while the hook leaves its input unread carries both a timeout and a pipe error; the timeout is the
  // one reported, so the runner still yields as for any other Copilot timeout.
  it("keeps a Copilot timeout fail-open when the timed-out child never read its whole input", async () => {
    const f = await fixture("copilot", "setTimeout(() => {}, 3000);", { timeoutMs: 300 });
    const result = execute(f, { toolName: "bash", toolArgs: { command: "x".repeat(1024 * 1024) } });
    expect(result.stderr).toContain("timeout: Copilot proceeds through its normal permission flow");
    expect(result.stderr).not.toContain("Hook process failed");
    expect(result.status, result.stderr).toBe(0);
  });

  // A hook killed by a signal leaves the same pipe error but exits with no status, so it decided nothing: the runner
  // keeps its own failed-hook exit, 1, or 2 on the Codex pre-tool-use row this fixture builds.
  // POSIX only: Windows has no signals, so a child there cannot be killed by one.
  it.skipIf(process.platform === "win32").each(["cursor", "copilot", "codex"] as const)("%s still fails a hook killed by a signal before it read its whole input", async (tool) => {
    const f = await fixture(tool, 'process.kill(process.pid, "SIGKILL");');
    const result = execute(f, { toolName: "bash", toolArgs: { command: "x".repeat(1024 * 1024) } });
    expect(result.stderr).toContain("Hook process failed");
    expect(result.status, result.stderr).toBe({ cursor: 1, copilot: 1, codex: 2 }[tool]);
  });
});

/**
 * REQ-FLOW-084: Cursor's and Copilot's hook commands find the project root by
 * their own hook file, as Codex's do, so a session started in a subfolder runs
 * each hook as one started at the root. Up to 1.14 they were the relative
 * `node .stamity/generated/hooks/<client>/stamity-portable-hook.mjs <row>`,
 * which from a subfolder names a file that is not there. Each command runs
 * through the platform's shell (`sh`, or `cmd` on Windows), as the clients run it.
 */
describe("the walk-up starter on Cursor and Copilot", () => {
  const ANCHORS = { cursor: [".cursor", "hooks.json"], copilot: [".github", "hooks", "stamity.json"] } as const;
  const DENY = (reason: string) => output({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });

  /** The fixture above plus the client's anchor file, which is what the starter looks for. */
  async function anchored(tool: "cursor" | "copilot", body: string) {
    const f = await fixture(tool, body);
    await mkdir(join(f.root, ...ANCHORS[tool].slice(0, -1)), { recursive: true });
    await writeFile(join(f.root, ...ANCHORS[tool]), "{}\n");
    return f;
  }

  /** The host's environment without Cursor's root variable, plus `extra`. */
  function envWith(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env["CURSOR_PROJECT_DIR"];
    return Object.assign(env, extra);
  }

  function runShell(command: string, cwd: string, env: NodeJS.ProcessEnv = envWith()) {
    return spawnSync(command, { cwd, env, shell: true, input: JSON.stringify({ toolName: "bash", toolArgs: { command: "pwd" } }), encoding: "utf8" });
  }

  it.each(["cursor", "copilot"] as const)("%s runs the hook from repo/sub/deeper exactly as from the root", async (tool) => {
    const f = await anchored(tool, DENY("from the root"));
    const deeper = join(f.root, "sub", "deeper");
    await mkdir(deeper, { recursive: true });
    const command = portableHookCommand(tool, f.hook, SYNC);

    const atRoot = runShell(command, f.root);
    const below = runShell(command, deeper);

    expect(atRoot.status, atRoot.stderr).toBe(0);
    const verdict = JSON.parse(atRoot.stdout);
    expect(tool === "cursor" ? verdict.user_message : verdict.permissionDecisionReason).toBe("from the root");
    expect({ status: below.status, stdout: below.stdout, stderr: below.stderr }).toEqual({ status: atRoot.status, stdout: atRoot.stdout, stderr: atRoot.stderr });
  });

  it("takes Cursor's reported root over a nearer .cursor/hooks.json, and walks up from the working directory without it", async () => {
    // The threat case: `sub/` holds its own anchor and a decoy runner whose
    // child answers differently. A session started in `sub/` with
    // CURSOR_PROJECT_DIR naming the root runs the root's runner.
    const f = await anchored("cursor", DENY("from the root"));
    const sub = join(f.root, "sub");
    const decoy = join(sub, ".stamity", "generated", "hooks", "cursor");
    await mkdir(decoy, { recursive: true });
    await mkdir(join(sub, ".cursor"), { recursive: true });
    await writeFile(join(sub, ".cursor", "hooks.json"), "{}\n");
    await writeFile(join(decoy, PORTABLE_RUNNER_FILE), buildPortableHookRunner("cursor"));
    await writeFile(join(sub, "check.mjs"), DENY("from the decoy"));
    const command = portableHookCommand("cursor", f.hook, SYNC);

    const reported = runShell(command, sub, envWith({ CURSOR_PROJECT_DIR: f.root }));
    expect(reported.status, reported.stderr).toBe(0);
    expect(JSON.parse(reported.stdout).user_message).toBe("from the root");

    // Without the variable the nearest anchor is the root the walk finds.
    const walked = runShell(command, sub);
    expect(JSON.parse(walked.stdout).user_message).toBe("from the decoy");

    // A variable naming a folder without the anchor is passed over for the walk.
    const elsewhere = await mkdtemp(join(tmpdir(), "stamity-hook-elsewhere-"));
    roots.push(elsewhere);
    await mkdir(join(f.root, "x"), { recursive: true });
    const fromX = runShell(command, join(f.root, "x"), envWith({ CURSOR_PROJECT_DIR: elsewhere }));
    expect(fromX.status, fromX.stderr).toBe(0);
    expect(JSON.parse(fromX.stdout).user_message).toBe("from the root");
  });

  it.each([
    ["cursor", ".cursor/hooks.json"],
    ["copilot", ".github/hooks/stamity.json"],
  ] as const)("%s exits 1 naming the pinned sync call when the runner beside %s is missing", async (tool, anchor) => {
    const f = await anchored(tool, DENY("unused"));
    await rm(f.script);
    const deeper = join(f.root, "sub");
    await mkdir(deeper, { recursive: true });

    const result = runShell(portableHookCommand(tool, f.hook, SYNC), deeper);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`Stamity hook script missing beside ${anchor}; run ${SYNC.syncCall}`);
  });

  it.each(["cursor", "copilot"] as const)("%s refuses rather than guessing when no anchor is above the session directory", async (tool) => {
    const f = await fixture(tool, DENY("unused"));
    const result = runShell(portableHookCommand(tool, f.hook, SYNC), f.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("Stamity hook project root not found");
  });

  it("runs a given script through the same walk, as Cursor's guards do", async () => {
    const f = await anchored("cursor", "");
    const guard = ".cursor/hooks/stamity-test-guard.mjs";
    await mkdir(join(f.root, ".cursor", "hooks"), { recursive: true });
    await writeFile(join(f.root, ...guard.split("/")), 'process.stdout.write(JSON.stringify({ permission: "deny", user_message: "guard ran at " + process.argv.length }));');
    const deeper = join(f.root, "sub", "deeper");
    await mkdir(deeper, { recursive: true });
    const command = portableHookCommand("cursor", { event: "pre_tool_use", command: ["node", guard] }, { ...SYNC, script: guard });

    const result = runShell(command, deeper);

    expect(result.status, result.stderr).toBe(0);
    // The guard ran, not the runner: argv is node, the guard and the encoded row.
    expect(JSON.parse(result.stdout)).toEqual({ permission: "deny", user_message: "guard ran at 3" });
  });

  it("refuses to render a script or a sync call carrying shell or program syntax", () => {
    const hook: HookInterchange = { event: "pre_tool_use", command: ["node", "check.mjs"] };
    for (const script of ["../x.mjs", "a/./b.mjs", "/abs/x.mjs", "a'b.mjs", "a b.mjs", "$x.mjs", "a\\b.mjs", ""]) {
      expect(() => portableHookCommand("cursor", hook, { ...SYNC, script }), script).toThrow(/root-relative path/);
    }
    for (const syncCall of ['npx -y "x" sync', "npx -y $(touch pwned) sync", "npx -y %PATH% sync"]) {
      expect(() => portableHookCommand("copilot", hook, { syncCall }), syncCall).toThrow(/pinned sync call/);
    }
    // No `$`, backtick, `%`, backslash or inner double quote: the program reads the same under sh and cmd.
    for (const tool of ["cursor", "copilot"] as const) {
      // TEST CHANGE, justified (REQ-FLOW-142): the starter now ends with the row's script as a plain word after the row.
      const body = /^node -e "(.*)" [A-Za-z0-9_-]+ [A-Za-z0-9._/-]+$/s.exec(portableHookCommand(tool, hook, SYNC))?.[1];
      expect(body, tool).toBeDefined();
      expect(body).not.toMatch(/[$`%\\"]/);
    }
  });

  // REQ-FLOW-142: the row's script as a plain word after the encoded row, and the runner holding the two equal.
  const CORE_GUARD_FILE = "stamity-pre-tool-use-guard.mjs";
  const wordCases = [
    ["codex", "check.mjs", 2],
    ["cursor", "check.mjs", 1],
    ["copilot", "check.mjs", 1],
    // The Copilot core guard is telemetry there, so a runner fault on its row exits 0 (see the runner's posture).
    ["copilot", CORE_GUARD_FILE, 0],
  ] as const;

  it.each(wordCases)("%s runs a %s row whose plain word is its own script, and refuses one whose word names another script at exit %i", async (tool, script, refusedExit) => {
    const f = await fixture(tool, DENY("the row ran"), { command: [process.execPath, script] });
    if (tool !== "codex") {
      await mkdir(join(f.root, ...ANCHORS[tool].slice(0, -1)), { recursive: true });
      await writeFile(join(f.root, ...ANCHORS[tool]), "{}\n");
    }
    await writeFile(join(f.root, script), DENY("the row ran"));
    // The other script exists and would allow, so a run of it would show.
    await writeFile(join(f.root, "other.mjs"), output({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } }));
    const command = portableHookCommand(tool, f.hook, SYNC);
    expect(command.endsWith(` ${Buffer.from(JSON.stringify(f.hook)).toString("base64url")} ${script}`)).toBe(true);

    const matching = runShell(command, f.root);
    expect(matching.status, matching.stderr).toBe(0);
    const verdict = JSON.parse(matching.stdout);
    const reason = tool === "cursor" ? verdict.user_message : tool === "codex" ? verdict.hookSpecificOutput.permissionDecisionReason : verdict.permissionDecisionReason;
    expect(reason).toBe("the row ran");

    const disagreeing = runShell(`${command.slice(0, -script.length)}other.mjs`, f.root);
    expect(disagreeing.status).toBe(refusedExit);
    expect(disagreeing.stdout).toBe("");
    expect(disagreeing.stderr).toContain("Invalid hook registration");
  });

  it.each(wordCases)("%s refuses a %s row whose own plain word is followed by another word, which a reader would take as the script, at exit %i", async (tool, script, refusedExit) => {
    const f = await fixture(tool, DENY("the row ran"), { command: [process.execPath, script] });
    if (tool !== "codex") {
      await mkdir(join(f.root, ...ANCHORS[tool].slice(0, -1)), { recursive: true });
      await writeFile(join(f.root, ...ANCHORS[tool]), "{}\n");
    }
    await writeFile(join(f.root, script), DENY("the row ran"));
    const command = portableHookCommand(tool, f.hook, SYNC);
    expect(command.endsWith(` ${script}`)).toBe(true);

    // The starter forwards the row and one word; anything after that word is not the engine's rendering.
    const extra = runShell(`${command} other.mjs`, f.root);

    expect(extra.status).toBe(refusedExit);
    expect(extra.stdout).toBe("");
    expect(extra.stderr).toContain("Invalid hook registration");
  });

  it.each(["cursor", "copilot", "codex"] as const)("%s gives a row whose script is outside the plain alphabet no word, its command ending with the row as before", (tool) => {
    for (const command of [["node", "path with space.mjs"], ["node", "a'b.mjs"], ["node", "../x.mjs"], ["node", "$(touch pwned).mjs"], ["node"]]) {
      const row: HookInterchange = { event: "session_start", command };
      const rendered = portableHookCommand(tool, row, SYNC);
      expect(rendered, command.join(" ")).toMatch(/^node -e "[^"]*" [A-Za-z0-9_-]+$/s);
      expect(rendered.endsWith(`" ${Buffer.from(JSON.stringify(row)).toString("base64url")}`)).toBe(true);
    }
  });

  it.each(["cursor", "copilot", "codex", "claude"] as const)("%s gives a plugin-rooted row no word: the command is the runner and the row alone", (tool) => {
    const row: HookInterchange = { event: "session_start", command: ["node", `\${STAMITY_TEST_PLUGIN_ROOT}/hooks/stamity-session-start.mjs`] };
    expect(portableHookCommand(tool, row, SYNC)).toBe(
      `node "\${STAMITY_TEST_PLUGIN_ROOT}/hooks/${PORTABLE_RUNNER_FILE}" ${Buffer.from(JSON.stringify(row)).toString("base64url")}`,
    );
  });

  it("gives a script the starter runs itself, as Cursor's guards are, no word", () => {
    const guard = ".cursor/hooks/stamity-test-guard.mjs";
    const row: HookInterchange = { event: "pre_tool_use", command: ["node", guard] };
    expect(portableHookCommand("cursor", row, { ...SYNC, script: guard })).toMatch(
      new RegExp(`" ${Buffer.from(JSON.stringify(row)).toString("base64url")}$`),
    );
  });
});

describe("plugin-rooted rows", () => {
  const ROOT_VAR = "STAMITY_TEST_PLUGIN_ROOT";
  const REF = `\${${ROOT_VAR}}/hooks`;
  const CORE_GUARD = "stamity-pre-tool-use-guard.mjs";

  it.each(["claude", "cursor", "copilot", "codex"] as const)(
    "renders %s's native command against the plugin root with no cwd-walking starter",
    (tool) => {
      const row: HookInterchange = { event: "session_start", command: ["node", `${REF}/stamity-session-start.mjs`] };

      // SYNC is required for Codex only; a plugin row never reaches the starter.
      const command = portableHookCommand(tool, row, SYNC);

      // The root variable already locates the script, so Codex's project walk —
      // the one thing that differs between the clients in repository mode — has
      // nothing left to find and is not emitted.
      // Double-quoted on every client, Windows included: the root variable
      // expands to an absolute install path that may hold a space.
      expect(command.startsWith(`node "${REF}/${PORTABLE_RUNNER_FILE}" `)).toBe(true);
      expect(command).not.toContain("node -e");
      expect(command).toContain(`${REF}/`);
      expect(command).not.toContain(".stamity/generated");
    },
  );

  it("leaves a repository-rooted row on the repository runner for every client", () => {
    const row: HookInterchange = { event: "session_start", command: ["node", ".stamity/hooks/run.mjs"] };
    expect(portableHookCommand("cursor", row)).toContain(".stamity/generated/hooks/cursor/");
    expect(portableHookCommand("codex", row, SYNC)).toContain("node -e ");
  });

  it.each([
    // The claude adapter's negative table, ported. A user hook row reaches this
    // renderer unmodified from `.stamity/hooks/*.json`, and a committed
    // repository path may legitimately begin with `${`, so the branch has to
    // test the WHOLE token rather than a two-character prefix plus a slash.
    //
    // A space inside the braces: not one word to the shell.
    "${CLAUDE PLUGIN}/hooks/run.mjs",
    // A metacharacter after the brace: `;` would end the command.
    "${CLAUDE_PLUGIN_ROOT}/hooks;rm -rf /tmp/x/run.mjs",
    // Command substitution wearing the prefix.
    "${CLAUDE_PLUGIN_ROOT}/$(touch pwned)/run.mjs",
    // Lower-case is not the vendor variable convention.
    "${plugin_root}/hooks/run.mjs",
    // A parameter-expansion default. The `"` closes the double quote the
    // plugin branch opens, and `-e` past it is node's inline-code flag.
    '${NAME:-"} -e "require(`child_process`).execSync(`touch pwned`)"; #}/hooks/run.mjs',
  ])("renders %s through the repository runner, never the plugin branch", (script) => {
    const row: HookInterchange = { event: "session_start", command: ["node", script] };

    const command = portableHookCommand("claude", row);

    expect(command).toBe(
      `node .stamity/generated/hooks/claude/${PORTABLE_RUNNER_FILE} ${Buffer.from(JSON.stringify(row)).toString("base64url")}`,
    );
    // Nothing of the authored token survives into the shell string: the whole
    // row travels base64url-encoded and the runner resolves it.
    expect(command).not.toContain("pwned");
    expect(command).not.toContain('"');
  });

  it("identifies the core guard by the SCRIPT argument alone, not by any argv position", async () => {
    // Floor 1 on the identity: the launcher is argv[0] and the script is
    // argv[1]. A row whose LAUNCHER happens to be named like the guard runs an
    // authored script, so Codex's blocking posture must still apply to it.
    const f = await pluginFixture("codex", "", {
      command: [`/opt/${CORE_GUARD}`, `${REF}/authored.mjs`],
    });

    const result = executeIn(f, { cwd: f.session, env: { [ROOT_VAR]: f.root } });

    expect(result.stderr).toContain("Hook process failed");
    expect(result.status).toBe(2);
  });

  /** A vendor container: one `hooks/` directory holding the runner and the scripts. */
  async function pluginFixture(tool: Tool, body: string, row: Partial<HookInterchange> = {}) {
    const root = await realpath(await mkdtemp(join(tmpdir(), "stamity-plugin-")));
    roots.push(root);
    const session = join(root, "session");
    await mkdir(join(root, "hooks"), { recursive: true });
    await mkdir(session, { recursive: true });
    const script = join(root, "hooks", PORTABLE_RUNNER_FILE);
    await writeFile(script, buildPortableHookRunner(tool));
    await writeFile(join(root, "hooks", "check.mjs"), body);
    const hook: HookInterchange = {
      event: "pre_tool_use",
      command: [process.execPath, `${REF}/check.mjs`],
      ...row,
    };
    return { root, session, script, hook };
  }

  function executeIn(
    f: Awaited<ReturnType<typeof pluginFixture>>,
    opts: { cwd: string; env?: Record<string, string> },
  ) {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env[ROOT_VAR];
    Object.assign(env, opts.env);
    return spawnSync(
      process.execPath,
      [f.script, Buffer.from(JSON.stringify(f.hook)).toString("base64url")],
      { cwd: opts.cwd, env, input: JSON.stringify({ toolName: "bash" }), encoding: "utf8" },
    );
  }

  it("expands the root variable itself and runs the child in the session's repository", async () => {
    // The client expands its root variable only in the config command string —
    // never inside the base64url payload — so the runner receives the literal
    // and has to resolve it. And the child's cwd is the SESSION's repository,
    // not the four-levels-up climb that locates a repository install.
    const f = await pluginFixture("claude", 'process.stderr.write("cwd=" + process.cwd());');

    const result = executeIn(f, { cwd: f.session, env: { [ROOT_VAR]: f.root } });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain(`cwd=${f.session}`);
  });

  it("resolves the script beside the runner when the variable never got expanded", async () => {
    // Every plugin hook script ships in the one `hooks/` directory the runner
    // sits in, so an unset variable has an answer that is right by layout
    // rather than a guess.
    const f = await pluginFixture("claude", 'process.stderr.write("ran=yes");');

    const result = executeIn(f, { cwd: f.session });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("ran=yes");
  });

  it.each([
    ["codex", `${REF}/${CORE_GUARD}`, 1],
    ["codex", `${REF}/authored.mjs`, 2],
    ["codex", `.stamity/generated/hooks/codex/${CORE_GUARD}`, 1],
    ["codex", ".stamity/hooks/authored.mjs", 2],
    ["copilot", `${REF}/${CORE_GUARD}`, 0],
    ["copilot", `${REF}/authored.mjs`, 1],
    ["copilot", `.stamity/generated/hooks/copilot/${CORE_GUARD}`, 0],
    ["copilot", ".stamity/hooks/authored.mjs", 1],
  ] as const)(
    "keeps %s's fail-mode posture for %s at exit %i",
    async (tool, scriptPath, expected) => {
      // The core guard is identified by WHICH SCRIPT the row runs, not by where
      // that script sits: under a plugin root the old repository-prefix match
      // failed and each client's posture silently flipped.
      const f = await pluginFixture(tool, "", {
        command: ["stamity-missing-hook-executable", scriptPath],
      });

      const result = executeIn(f, { cwd: f.session, env: { [ROOT_VAR]: f.root } });

      expect(result.stderr).toContain("Hook process failed");
      expect(result.status).toBe(expected);
    },
  );
});

/**
 * Which program the runner starts for a row. A row whose launcher is the word
 * `node` is started as the interpreter the runner itself runs under, by its
 * absolute path, so the runtime looks that launcher up nowhere: not on `PATH`,
 * and not in the folder the child runs in, which is a repository folder. Any
 * other launcher is started by the absolute path the engine's own `PATH` walk
 * finds, which never takes that folder (REQ-PLUGIN-005).
 *
 * TEST CHANGE, justified (plan 020 file 2, unit e5-hook-starter): the last
 * sentence said any other launcher was started by its name, as before. The
 * runner now resolves it first; the cases below that pinned the old boundary
 * keep their assertions, and their wording follows the behaviour.
 *
 * The child in these cases reports the interpreter that ran it, and each case
 * compares that with the interpreter running this suite, by real path on both
 * sides. The stand-in programs are files this suite writes into its own temp
 * folders. Windows starts no shebang script, so the cases that plant one run
 * on POSIX hosts; there a bare name is looked up in a folder only when `PATH`
 * names it. On Windows the runtime takes the child's folder before any `PATH`
 * entry, which no POSIX host does, so the cases that plant a program file
 * there run on Windows only.
 */
describe("which program a row's launcher starts", () => {
  const WINDOWS = process.platform === "win32";
  const ROOT_VAR = "STAMITY_TEST_PLUGIN_ROOT";
  const REPORT = 'process.stderr.write("interpreter=" + JSON.stringify(process.execPath) + "\\n");';
  const STAND_IN = "#!/bin/sh\necho stand-in-started >&2\nexit 0\n";

  /** The host's environment with `PATH` replaced, whatever letter case the host spells it in. */
  function envWithPath(path: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) if (key.toLowerCase() !== "path") env[key] = value;
    delete env[ROOT_VAR];
    env["PATH"] = path;
    return env;
  }

  /** A real, empty folder: a `PATH` that holds no program at all. */
  async function emptyFolder(): Promise<string> {
    const folder = await realpath(await mkdtemp(join(tmpdir(), "stamity-hook-path-")));
    roots.push(folder);
    return folder;
  }

  function run(script: string, hook: HookInterchange, opts: { cwd: string; env: NodeJS.ProcessEnv }) {
    return spawnSync(process.execPath, [script, Buffer.from(JSON.stringify(hook)).toString("base64url")], {
      cwd: opts.cwd, env: opts.env, input: JSON.stringify({ toolName: "bash" }), encoding: "utf8",
    });
  }

  /** The interpreter the child reported, by real path, or `null` when no child of ours ran. */
  async function interpreterOf(stderr: string): Promise<string | null> {
    const found = /^interpreter=(".*")$/m.exec(stderr);
    return found === null ? null : realpath(JSON.parse(found[1]!) as string);
  }

  /** A vendor container, as the plugin-rooted cases above build it. */
  async function container(tool: Tool) {
    const root = await realpath(await mkdtemp(join(tmpdir(), "stamity-plugin-")));
    roots.push(root);
    const session = join(root, "session");
    await mkdir(join(root, "hooks"), { recursive: true });
    await mkdir(session, { recursive: true });
    const script = join(root, "hooks", PORTABLE_RUNNER_FILE);
    await writeFile(script, buildPortableHookRunner(tool));
    await writeFile(join(root, "hooks", "check.mjs"), REPORT);
    const hook: HookInterchange = { event: "pre_tool_use", command: ["node", `\${${ROOT_VAR}}/hooks/check.mjs`] };
    return { root, session, script, hook };
  }

  it.each(["cursor", "copilot", "codex"] as const)(
    "%s starts a `node` launcher as the interpreter the runner runs under, with no node on PATH",
    async (tool) => {
      const f = await fixture(tool, REPORT, { command: ["node", "check.mjs"] });

      const result = run(f.script, f.hook, { cwd: tmpdir(), env: envWithPath(await emptyFolder()) });

      expect(result.stderr).not.toContain("Hook process failed");
      expect(result.status, result.stderr).toBe(0);
      expect(await interpreterOf(result.stderr)).toBe(await realpath(process.execPath));
    },
  );

  it("does the same for a plugin-rooted row, whose child runs in the session's folder", async () => {
    const f = await container("copilot");

    const result = run(f.script, f.hook, {
      cwd: f.session, env: { ...envWithPath(await emptyFolder()), [ROOT_VAR]: f.root },
    });

    expect(result.stderr).not.toContain("Hook process failed");
    expect(result.status, result.stderr).toBe(0);
    expect(await interpreterOf(result.stderr)).toBe(await realpath(process.execPath));
  });

  // REQ-PLUGIN-005: `node.exe` is node spelled another way, on every host; on
  // Windows any letter case of either is too. Up to 1.14 only the exact word
  // `node` started the interpreter by its absolute path.
  it.each(["cursor", "copilot", "codex"] as const)("%s starts a `node.exe` launcher as the interpreter the runner runs under", async (tool) => {
    const f = await fixture(tool, REPORT, { command: ["node.exe", "check.mjs"] });

    const result = run(f.script, f.hook, { cwd: tmpdir(), env: envWithPath(await emptyFolder()) });

    expect(result.stderr).not.toContain("Hook process failed");
    expect(result.status, result.stderr).toBe(0);
    expect(await interpreterOf(result.stderr)).toBe(await realpath(process.execPath));
  });

  it.runIf(WINDOWS).each(["Node", "NODE.EXE", "Node.Exe"])("starts a `%s` launcher on Windows as the interpreter the runner runs under", async (launcher) => {
    const f = await fixture("copilot", REPORT, { command: [launcher, "check.mjs"] });

    const result = run(f.script, f.hook, { cwd: tmpdir(), env: envWithPath(await emptyFolder()) });

    expect(result.status, result.stderr).toBe(0);
    expect(await interpreterOf(result.stderr)).toBe(await realpath(process.execPath));
  });

  it("fails a hook whose launcher no accepted PATH entry holds, naming the launcher", async () => {
    const f = await fixture("copilot", REPORT, { command: ["stamity-absent-launcher", "check.mjs"] });

    const result = run(f.script, f.hook, { cwd: tmpdir(), env: envWithPath(await emptyFolder()) });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('Hook process failed (launcher "stamity-absent-launcher" not found on PATH');
  });

  describe.skipIf(WINDOWS)("on a POSIX host whose PATH names the folder the child runs in", () => {
    const HOST_NODE = dirname(process.execPath);

    // REQ-PLUGIN-005: a launcher other than node is found by the engine's own
    // walk, which never takes the folder the child runs in, however PATH names it.
    it.each([
      ["an empty entry", (_root: string, bin: string) => `${delimiter}${bin}`],
      ["a relative entry", (_root: string, bin: string) => `.${delimiter}${bin}`],
      ["the folder's full path", (root: string, bin: string) => `${root}${delimiter}${bin}`],
    ] as const)("starts no file of another launcher's name at the repository root, by %s", async (_name, pathFor) => {
      const f = await fixture("copilot", "", { command: ["stamity-test-launcher", "check.mjs"] });
      const root = await realpath(f.root);
      await writeFile(join(root, "stamity-test-launcher"), STAND_IN);
      await chmod(join(root, "stamity-test-launcher"), 0o755);
      const bin = await emptyFolder();
      await writeFile(join(bin, "stamity-test-launcher"), "#!/bin/sh\necho path-launcher-started >&2\nexit 0\n");
      await chmod(join(bin, "stamity-test-launcher"), 0o755);

      const result = run(f.script, f.hook, { cwd: tmpdir(), env: envWithPath(pathFor(root, bin)) });

      expect(result.stderr).not.toContain("stand-in-started");
      expect(result.stderr).toContain("path-launcher-started");
      expect(result.status, result.stderr).toBe(0);
    });

    it.each([
      ["an empty entry", () => `${delimiter}${HOST_NODE}`],
      ["a relative entry", () => `.${delimiter}${HOST_NODE}`],
      ["the folder's full path", (folder: string) => `${folder}${delimiter}${HOST_NODE}`],
    ] as const)("starts no file of node's name at the repository root, by %s", async (_name, pathFor) => {
      const f = await fixture("copilot", REPORT, { command: ["node", "check.mjs"] });
      const root = await realpath(f.root);
      await writeFile(join(root, "node"), STAND_IN);
      await chmod(join(root, "node"), 0o755);

      const result = run(f.script, f.hook, { cwd: tmpdir(), env: envWithPath(pathFor(root)) });

      expect(result.stderr).not.toContain("stand-in-started");
      expect(result.status, result.stderr).toBe(0);
      expect(await interpreterOf(result.stderr)).toBe(await realpath(process.execPath));
    });

    it("starts no file of node's name in the session's folder, for a plugin-rooted row", async () => {
      const f = await container("copilot");
      await writeFile(join(f.session, "node"), STAND_IN);
      await chmod(join(f.session, "node"), 0o755);

      const result = run(f.script, f.hook, {
        cwd: f.session, env: { ...envWithPath(`${f.session}${delimiter}${HOST_NODE}`), [ROOT_VAR]: f.root },
      });

      expect(result.stderr).not.toContain("stand-in-started");
      expect(result.status, result.stderr).toBe(0);
      expect(await interpreterOf(result.stderr)).toBe(await realpath(process.execPath));
    });

    // The boundary of the change, held so it cannot widen or narrow unseen: a
    // launcher that is not the word `node` is still found on PATH.
    // TEST CHANGE, justified (unit e5-hook-starter, REQ-PLUGIN-005): it is found
    // by the runner's walk and started by that absolute path, no longer by the
    // runtime under the bare name; title and comment follow, assertions unchanged.
    it("still starts any other launcher found on PATH", async () => {
      const f = await fixture("copilot", "", { command: ["stamity-test-launcher", "check.mjs"] });
      const bin = await emptyFolder();
      await writeFile(join(bin, "stamity-test-launcher"), STAND_IN);
      await chmod(join(bin, "stamity-test-launcher"), 0o755);

      const result = run(f.script, f.hook, { cwd: tmpdir(), env: envWithPath(`${bin}${delimiter}${HOST_NODE}`) });

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("stand-in-started");
    });
  });

  // Windows only, and only a real Windows host can run these: there the runtime
  // looks for a bare program name in the folder the child runs in before it
  // looks on `PATH`, trying the name with `.com` added and then with `.exe`.
  // The file planted is a copy of the Node binary running this suite, so a
  // child started from it runs the script all the same and reports the copy's
  // own path as its interpreter. `PATH` is the host's, untouched.
  describe.runIf(WINDOWS)("on a Windows host, where the runtime takes the child's folder first", () => {
    it.each(["node.exe", "node.com"])("starts no %s at the repository root", async (name) => {
      const f = await fixture("copilot", REPORT, { command: ["node", "check.mjs"] });
      const planted = join(f.root, name);
      await copyFile(process.execPath, planted);

      const result = run(f.script, f.hook, { cwd: tmpdir(), env: { ...process.env } });

      expect(result.status, result.stderr).toBe(0);
      const interpreter = await interpreterOf(result.stderr);
      expect(interpreter).not.toBe(await realpath(planted));
      expect(interpreter).toBe(await realpath(process.execPath));
    });

    // REQ-PLUGIN-005: the residual 1.14.0 named, closed. Another launcher's
    // `.exe` at the repository root is not started in place of the PATH walk's
    // answer; with no entry holding one, the hook fails naming the launcher.
    it("starts no other launcher's .exe at the repository root", async () => {
      const f = await fixture("copilot", REPORT, { command: ["stamity-test-launcher", "check.mjs"] });
      const planted = join(f.root, "stamity-test-launcher.exe");
      await copyFile(process.execPath, planted);

      const result = run(f.script, f.hook, { cwd: tmpdir(), env: { ...process.env } });

      expect(await interpreterOf(result.stderr)).toBeNull();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('launcher "stamity-test-launcher" not found on PATH');
    });

    it("starts no node.exe in the session's folder, for a plugin-rooted row", async () => {
      const f = await container("copilot");
      const planted = join(f.session, "node.exe");
      await copyFile(process.execPath, planted);

      const result = run(f.script, f.hook, { cwd: f.session, env: { ...process.env, [ROOT_VAR]: f.root } });

      expect(result.status, result.stderr).toBe(0);
      const interpreter = await interpreterOf(result.stderr);
      expect(interpreter).not.toBe(await realpath(planted));
      expect(interpreter).toBe(await realpath(process.execPath));
    });
  });
});
