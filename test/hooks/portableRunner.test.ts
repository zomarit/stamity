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
    const starter = portableHookCommand("codex", f.hook);
    const program = /^node -e "(.*)" ([A-Za-z0-9_-]+)$/s.exec(starter);
    expect(program, starter).not.toBeNull();
    const nested = join(project, "packages", "deep directory");
    await mkdir(nested, { recursive: true });
    const result = spawnSync(process.execPath, ["-e", program![1]!, program![2]!], {
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
    const starter = portableHookCommand("codex", f.hook);
    const program = /^node -e "(.*)" ([A-Za-z0-9_-]+)$/s.exec(starter);
    const result = spawnSync(process.execPath, ["-e", program![1]!, program![2]!], {
      cwd: orphan, shell: false, input: "{}", encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Stamity hook project root not found");
    expect(result.stdout).toBe("");
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
    const command = portableHookCommand("codex", hook);
    expect(command).toContain("process.cwd()");
    expect(command).not.toContain("touch should-not-exist");
  });
});
