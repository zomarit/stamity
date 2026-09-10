import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPortableHookRunner, portableHookCommand, PORTABLE_RUNNER_FILE } from "../../src/hooks/portableRunner.ts";
import type { HookInterchange } from "../../src/hooks/model.ts";
import type { Tool } from "../../src/types/core.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(tool: Tool, body: string, row: Partial<HookInterchange> = {}) {
  const root = await mkdtemp(join(tmpdir(), "stamity-hook-"));
  roots.push(root);
  const dir = join(root, ".stamity/generated/hooks", tool);
  await mkdir(dir, { recursive: true });
  const script = join(dir, PORTABLE_RUNNER_FILE);
  await writeFile(script, buildPortableHookRunner(tool));
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

  it.each([true, false])("normalizes Copilot tool arguments (serialized: %s) and file paths for portable hooks", async (serialized) => {
    const f = await fixture("copilot", 'import {readFileSync} from "node:fs"; const input = JSON.parse(readFileSync(0,"utf8")); process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision: input.tool_input.file_path === "src/app.ts" && input.tool_name === "edit" ? "allow" : "deny"}}));');
    const args = { filePath: "src/app.ts" };
    const result = execute(f, { toolName: "edit", toolArgs: serialized ? JSON.stringify(args) : args });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).permissionDecision).toBe("allow");
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
    const result = spawnSync(portableHookCommand("codex", f.hook), { cwd: nested, shell: true, input: "{}", encoding: "utf8" });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it.each(["cursor", "copilot", "codex"] as const)("%s preserves denial exits and reports child errors", async (tool) => {
    expect(execute(await fixture(tool, "process.exitCode = 2;")).status).toBe(2);
    const f = await fixture(tool, "", { command: ["stamity-missing-hook-executable"] });
    const result = execute(f);
    expect(result.status).toBe(tool === "codex" ? 2 : 1);
    expect(result.stderr).toContain("Hook process failed");
  });

  it("keeps Copilot timeouts fail-open and Cursor timeouts visible to failClosed", async () => {
    await Promise.all((["cursor", "copilot"] as const).map(async (tool) => {
      const result = execute(await fixture(tool, "setTimeout(() => {}, 10000);", { timeoutMs: 20 }));
      expect(result.status).toBe(tool === "copilot" ? 0 : 1);
      expect(result.stderr).toMatch(/timeout|ETIMEDOUT/);
    }));
  });

  it("names Copilot's manual learning fallback without injecting discarded session output", async () => {
    const result = execute(await fixture("copilot", 'process.stdout.write("learning index");', { event: "session_start" }));
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("read .stamity/learnings and handoffs manually");
  });

  it.each(["session_start", "post_tool_use"] as const)("carries Cursor %s context on the native field", async (event) => {
    const hookEventName = event === "session_start" ? "SessionStart" : "PostToolUse";
    const result = execute(await fixture("cursor", output({ hookSpecificOutput: { hookEventName, additionalContext: "learning index" } }), { event }));
    expect(JSON.parse(result.stdout)).toEqual({ additional_context: "learning index" });
  });

  it("keeps shell metacharacters inside encoded argv and locates Codex's initialized project", () => {
    const hook: HookInterchange = { event: "pre_tool_use", command: ["node", "path with space.mjs", "$(touch should-not-exist)"] };
    const command = portableHookCommand("codex", hook);
    expect(command).toContain("process.cwd()");
    expect(command).not.toContain("touch should-not-exist");
  });
});
