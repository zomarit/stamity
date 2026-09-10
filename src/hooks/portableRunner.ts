import type { HookInterchange } from "./model.ts";
import type { Tool } from "../types/core.ts";

/** Repository-owned launcher; the interchange remains exec-form argv. */
export const PORTABLE_RUNNER_FILE = "stamity-portable-hook.mjs";

/** Shell syntax appears only at the native boundary, never in the child argv. */
export function portableHookCommand(
  tool: Tool,
  row: HookInterchange,
): string {
  const path = `.stamity/generated/hooks/${tool}/${PORTABLE_RUNNER_FILE}`;
  const data = Buffer.from(JSON.stringify(row)).toString("base64url");
  if (tool !== "codex") return `node ${path} ${data}`;
  // Resolve the nearest initialized project, which can live below the git root.
  // This static Node program contains no shell expansions or authored values.
  const starter = `const fs=require('node:fs'),p=require('node:path'),cp=require('node:child_process');let d=process.cwd();for(;;){const f=p.join(d,'${path}');if(fs.existsSync(f)){const r=cp.spawnSync(process.execPath,[f,...process.argv.slice(1)],{stdio:'inherit'});process.exitCode=r.status??1;break;}const up=p.dirname(d);if(up===d){process.stderr.write('Stamity hook project root not found');process.exitCode=1;break;}d=up;}`;
  return `node -e "${starter}" ${data}`;
}

/**
 * Translate the documented portable output at the vendor boundary. No tool or
 * agent identity is fabricated. Unknown output fields are diagnosed by name;
 * their values never enter diagnostics. Executed with shell:false on all OSes.
 */
export function buildPortableHookRunner(tool: Tool): string {
  return `#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const TOOL = ${JSON.stringify(tool)};
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const NAMES = { session_start: "SessionStart", pre_tool_use: "PreToolUse", post_tool_use: "PostToolUse", user_prompt_submit: "UserPromptSubmit", stop: "Stop", session_end: "SessionEnd" };
const warn = (message) => process.stderr.write("stamity hook [" + TOOL + "]: " + message + "\\n");
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const write = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
const safeError = (message) => Object.assign(new Error(message), { safe: true });
const parse = (raw, label) => { try { return JSON.parse(raw); } catch { throw safeError(label); } };
let failureExit = 1;

function main() {
  const row = parse(Buffer.from(process.argv[2] ?? "", "base64url").toString(), "Invalid hook registration");
  if (!object(row) || !Object.hasOwn(NAMES, row.event)) throw safeError("Invalid hook registration");
  if (!Array.isArray(row.command) || row.command.length === 0 || !row.command.every((arg) => typeof arg === "string")) throw safeError("Invalid hook argv");
  if (TOOL === "codex" && row.event === "pre_tool_use" && !row.command.includes(".stamity/generated/hooks/codex/stamity-pre-tool-use-guard.mjs")) failureExit = 2;
  if (row.timeoutMs !== undefined && (!Number.isSafeInteger(row.timeoutMs) || row.timeoutMs <= 0)) throw safeError("Invalid hook timeout");
  const raw = readFileSync(0, "utf8");
  const payload = raw.trim() === "" ? {} : parse(raw, "Invalid hook input JSON");
  if (!object(payload)) throw safeError("Invalid hook input object");
  const input = { ...payload, hook_event_name: NAMES[row.event] };
  if (input.session_id === undefined && typeof payload.sessionId === "string") input.session_id = payload.sessionId;
  if (input.tool_name === undefined && typeof payload.toolName === "string") input.tool_name = payload.toolName;
  if (input.tool_input === undefined && payload.toolArgs !== undefined) input.tool_input = typeof payload.toolArgs === "string" ? parse(payload.toolArgs, "Invalid serialized tool input") : payload.toolArgs;
  if (object(input.tool_input) && input.tool_input.file_path === undefined && typeof input.tool_input.filePath === "string") input.tool_input = { ...input.tool_input, file_path: input.tool_input.filePath };
  const child = spawnSync(row.command[0], row.command.slice(1), {
    cwd: ROOT, input: JSON.stringify(input), encoding: "utf8", shell: false,
    maxBuffer: 1024 * 1024,
    ...(row.timeoutMs === undefined ? {} : { timeout: row.timeoutMs }),
  });
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.error) {
    if (child.error.code === "ETIMEDOUT" && TOOL === "copilot") {
      warn("timeout: Copilot proceeds through its normal permission flow");
      return;
    }
    throw safeError("Hook process failed (" + (child.error.code ?? "unknown") + ")");
  }
  if (child.status !== 0) { process.exitCode = child.status ?? 1; return; }
  const output = (child.stdout ?? "").trim();
  if (output === "") return;
  let parsed;
  try { parsed = JSON.parse(output); } catch {
    if (TOOL === "codex" && row.event === "user_prompt_submit") { process.stdout.write(output + "\\n"); return; }
    if (row.event === "session_start") {
      if (TOOL === "cursor") write({ additional_context: output });
      else if (TOOL === "codex") process.stdout.write(output + "\\n");
      else warn("sessionStart output is not injected by Copilot; read .stamity/learnings and handoffs manually");
      return;
    }
    throw safeError("Hook stdout is not a JSON object");
  }
  if (!object(parsed)) throw safeError("Hook stdout is not a JSON object");
  const specific = parsed.hookSpecificOutput;
  if (specific !== undefined && (!object(specific) || specific.hookEventName !== NAMES[row.event])) throw safeError("Mismatched hookSpecificOutput event");
  if (specific && specific.permissionDecision !== undefined && (row.event !== "pre_tool_use" || !["allow", "deny", "ask"].includes(specific.permissionDecision))) throw safeError("Unsupported permission decision");
  if (specific && specific.permissionDecisionReason !== undefined && typeof specific.permissionDecisionReason !== "string") throw safeError("Invalid permission reason");
  if (specific && specific.additionalContext !== undefined && typeof specific.additionalContext !== "string") throw safeError("Invalid additional context");
  if (parsed.continue !== undefined && typeof parsed.continue !== "boolean") throw safeError("Invalid continuation decision");
  // Codex accepts the canonical schema, except unsupported PreToolUse controls
  // fail open natively. Convert requests to stop/ask into a supported denial.
  if (TOOL === "codex") {
    if (row.event === "pre_tool_use") {
      if (specific?.permissionDecision === "ask" || parsed.continue === false) {
        warn("unsupported PreToolUse stop/ask control; denied pending manual permission review");
        parsed.hookSpecificOutput = { ...specific, hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: (parsed.continue === false ? parsed.stopReason : specific?.permissionDecisionReason) ?? "Hook requires manual permission review" };
        delete parsed.hookSpecificOutput.updatedInput;
        delete parsed.continue;
        delete parsed.stopReason;
      }
      if (parsed.decision === "approve") {
        warn("legacy approve is unsupported; use hookSpecificOutput.permissionDecision");
        throw safeError("Unsupported legacy approval decision");
      }
      const nativeSpecific = parsed.hookSpecificOutput;
      if (nativeSpecific?.updatedInput !== undefined && (nativeSpecific.permissionDecision !== "allow" || !object(nativeSpecific.updatedInput))) throw safeError("Invalid updatedInput permission or shape");
      if (nativeSpecific?.updatedInput !== undefined && ["Bash", "apply_patch"].includes(input.tool_name) && typeof nativeSpecific.updatedInput.command !== "string") throw safeError("Invalid command rewrite");
      if (parsed.stopReason !== undefined) { warn("unsupported output field: stopReason"); delete parsed.stopReason; }
    }
    for (const key of ["suppressOutput", "updatedMCPToolOutput"]) {
      if (parsed[key] !== undefined) { warn("unsupported output field: " + key); delete parsed[key]; }
      if (parsed.hookSpecificOutput?.[key] !== undefined) { warn("unsupported output field: hookSpecificOutput." + key); delete parsed.hookSpecificOutput[key]; }
    }
    write(parsed);
    return;
  }
  const value = specific ?? parsed;
  const publicFields = new Set(["updatedInput", "updatedToolOutput", "modifiedArgs", "modifiedResponse", "suppressOutput"]);
  const fieldName = (key) => publicFields.has(key) ? key : "<unrecognized>";
  const supported = new Set(["hookSpecificOutput", "hookEventName", "permissionDecision", "permissionDecisionReason", "additionalContext", "decision", "reason", "continue", "stopReason", "systemMessage"]);
  for (const key of Object.keys(parsed)) if (!supported.has(key)) warn("unsupported output field: " + fieldName(key));
  if (specific) for (const key of Object.keys(specific)) if (!supported.has(key)) warn("unsupported output field: hookSpecificOutput." + fieldName(key));
  const out = {};
  if (row.event === "pre_tool_use") {
    // The canonical global stop overrides every event-specific decision.
    const stopped = parsed.continue === false;
    const decision = stopped ? "deny" : value.permissionDecision ?? (parsed.decision === "block" ? "deny" : undefined);
    if (decision !== undefined) {
      if (!["allow", "deny", "ask"].includes(decision)) throw safeError("Unsupported permission decision");
      const reason = stopped ? parsed.stopReason ?? "Hook requested a stop" : value.permissionDecisionReason ?? parsed.reason ?? "Hook permission decision";
      if (TOOL === "cursor") {
        out.permission = decision === "allow" ? "allow" : "deny";
        if (decision === "ask") warn("Cursor has no ask decision; denied pending manual permission review");
        out.user_message = reason;
      } else {
        out.permissionDecision = decision;
        out.permissionDecisionReason = reason;
      }
    }
  } else if (row.event === "stop" && TOOL === "copilot" && parsed.decision === "block") {
    out.decision = "block";
    out.reason = parsed.reason ?? "Hook requested another turn";
  } else if (row.event === "user_prompt_submit" && TOOL === "cursor" && parsed.continue === false) {
    out.continue = false;
    out.user_message = parsed.stopReason ?? "Hook prevented prompt submission";
  } else if (parsed.decision === "block" || parsed.continue === false) {
    warn("blocking output is unsupported for this event; use the client's permission controls");
  }
  if (typeof value.additionalContext === "string") {
    if (TOOL === "cursor" && ["session_start", "post_tool_use"].includes(row.event)) out.additional_context = value.additionalContext;
    else if (TOOL === "copilot" && row.event === "post_tool_use") out.additionalContext = value.additionalContext;
    else warn("additionalContext is unsupported for this event");
  }
  if (parsed.systemMessage !== undefined) warn("systemMessage is unsupported by this client's portable output");
  if (Object.keys(out).length > 0) write(out);
}
try { main(); } catch (error) {
  warn(error instanceof Error && error.safe === true ? error.message : "Hook invocation failed");
  process.exitCode = failureExit;
}
`;
}
