import type { HookInterchange } from "./model.ts";
import type { Tool } from "../types/core.ts";

/** Repository-owned launcher; the interchange remains exec-form argv. */
export const PORTABLE_RUNNER_FILE = "stamity-portable-hook.mjs";

/**
 * A script addressed through a client's plugin root variable — the ONE token
 * shape that is admitted past single-quoting, and the one that selects the
 * plugin branch below.
 *
 * Anchored end to end on purpose. The whole token is `${NAME}` with `NAME` in
 * the vendor's upper-case convention, followed by one or more `/segment` whose
 * characters carry no whitespace, no quote and no shell metacharacter. A
 * prefix test would admit every other `$`-carrying string that happens to open
 * with `${` — a parameter-expansion default (`${NAME:-"}`) whose `"` closes the
 * double quote the renderer opens, a command substitution wearing the prefix,
 * or a committed repository path that simply begins that way — and the branch
 * this predicate guards interpolates the token RAW inside double quotes.
 *
 * One home. `src/adapters/claude.ts` and `src/adapters/cursor.ts` import it
 * from here rather than keeping byte-twin copies, so the shape cannot be
 * narrowed in one renderer and left wide in another.
 */
export const ROOT_VARIABLE_PATH = /^\$\{[A-Z_][A-Z0-9_]*\}(?:\/[A-Za-z0-9_@%+=:,.-]+)+$/;

/** Shell syntax appears only at the native boundary, never in the child argv. */
export function portableHookCommand(
  tool: Tool,
  row: HookInterchange,
): string {
  const path = `.stamity/generated/hooks/${tool}/${PORTABLE_RUNNER_FILE}`;
  const data = Buffer.from(JSON.stringify(row)).toString("base64url");
  // A row whose script is addressed through a client's plugin root variable is
  // a PLUGIN row: the variable names the vendor container's own `hooks/`
  // directory, which is where the runner ships too. So the runner is the
  // script's sibling and EVERY client launches it directly — Codex included.
  // Its cwd-walking starter exists to find a project root the trusted
  // `.codex/hooks.json` identifies, and a root variable the client expands has
  // already answered that question; re-deriving it would let an unrelated
  // nearer checkout supply the executable.
  // A FULL match of {@link ROOT_VARIABLE_PATH}, never a `${` prefix: a row that
  // merely opens that way falls through to the repository rendering below,
  // where the whole argv is single-quoted and nothing of it reaches a shell
  // unquoted.
  const script = row.command[1] ?? "";
  const lastSlash = script.lastIndexOf("/");
  if (ROOT_VARIABLE_PATH.test(script)) {
    // Double-quoted, on every client and on Windows too: the variable expands to
    // the plugin's ABSOLUTE install path, which can contain a space, and double
    // quotes are the one rendering that keeps the expansion and survives one
    // (code.claude.com/docs/en/hooks, accessed 2026-09-20; cmd and PowerShell
    // read them the same way). The base64url row is untouched — it carries the
    // unquoted literal the runner resolves itself.
    return `node "${script.slice(0, lastSlash)}/${PORTABLE_RUNNER_FILE}" ${data}`;
  }
  if (tool !== "codex") return `node ${path} ${data}`;
  // Codex records trust against the hash of `.codex/hooks.json` alone, and the
  // scripts it points at live in the agent-writable workspace:
  // https://learn.chatgpt.com/docs/hooks (accessed 2026-09-17). The project is
  // therefore identified by the trusted file itself — walk up to the directory
  // that HOLDS `.codex/hooks.json` and run the script beside it. Resolving the
  // nearest `.stamity/generated/hooks/codex/` above the session cwd instead
  // would let an unrelated nearer checkout supply the executable for this
  // project's trusted definition.
  // This static Node program contains no shell expansions or authored values.
  const starter = `const fs=require('node:fs'),p=require('node:path'),cp=require('node:child_process');let d=process.cwd();for(;;){if(fs.existsSync(p.join(d,'.codex','hooks.json'))){const f=p.join(d,'${path}');if(!fs.existsSync(f)){process.stderr.write('Stamity hook script missing beside .codex/hooks.json; run stamity sync');process.exitCode=1;break;}const r=cp.spawnSync(process.execPath,[f,...process.argv.slice(1)],{stdio:'inherit'});process.exitCode=r.status??1;break;}const up=p.dirname(d);if(up===d){process.stderr.write('Stamity hook project root not found');process.exitCode=1;break;}d=up;}`;
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
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const TOOL = ${JSON.stringify(tool)};
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
// A script addressed through a client's plugin root variable, e.g.
// \${CLAUDE_PLUGIN_ROOT}/hooks/stamity-session-start.mjs. The client expands
// that variable in its config's command string ALONE — never inside the
// base64url row below — so the literal reaches this runner and this is where
// it is resolved.
const PLUGIN_ROOT_REF = /^\\$\\{([A-Za-z_][A-Za-z0-9_]*)\\}\\/(.+)$/;
const CORE_GUARD_FILE = "stamity-pre-tool-use-guard.mjs";
// PascalCase wire names. Codex reads this set natively and Copilot accepts it
// as its matcher aliases; Cursor's adapter renames them at its own boundary.
// https://learn.chatgpt.com/docs/hooks (accessed 2026-09-17)
// https://docs.github.com/en/copilot/reference/hooks-reference (accessed 2026-09-17)
// https://cursor.com/docs/hooks (accessed 2026-09-17)
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
  // The core pre-tool-use guard is telemetry on every identity-free client, so
  // a fault INSIDE this runner must not decide the pending call for it. Codex
  // blocks on exit 2 only, so exit 1 already lets it through; Copilot rejects
  // every nonzero exit, so the same posture there is exit 0 with the warning.
  // https://learn.chatgpt.com/docs/hooks (accessed 2026-09-17)
  // https://docs.github.com/en/copilot/reference/hooks-reference (accessed 2026-09-17)
  // Identified by WHICH SCRIPT the row runs, not by where that script sits: the
  // path used to be matched whole against the repository layout, so a row under
  // a plugin root matched nothing and each client's posture above silently
  // flipped — Codex to a blocking exit 2, Copilot to a call-rejecting exit 1.
  // The SCRIPT is argv[1] and nothing else: matching any argv position would
  // let a launcher or an option value named after the guard claim the guard's
  // telemetry posture for a row that runs an authored script.
  const coreGuard = row.event === "pre_tool_use" && basename(row.command[1] ?? "") === CORE_GUARD_FILE;
  if (TOOL === "codex" && row.event === "pre_tool_use" && !coreGuard) failureExit = 2;
  if (TOOL === "copilot" && coreGuard) failureExit = 0;
  if (row.timeoutMs !== undefined && (!Number.isSafeInteger(row.timeoutMs) || row.timeoutMs <= 0)) throw safeError("Invalid hook timeout");
  const raw = readFileSync(0, "utf8");
  const payload = raw.trim() === "" ? {} : parse(raw, "Invalid hook input JSON");
  if (!object(payload)) throw safeError("Invalid hook input object");
  const input = { ...payload, hook_event_name: NAMES[row.event] };
  // Copilot sends camelCase payload keys and may serialize the tool arguments;
  // Cursor spells the edited path filePath. Both normalize to the interchange
  // snake_case names the authored hook reads.
  // https://docs.github.com/en/copilot/reference/hooks-reference (accessed 2026-09-17)
  // https://cursor.com/docs/hooks (accessed 2026-09-17)
  if (input.session_id === undefined && typeof payload.sessionId === "string") input.session_id = payload.sessionId;
  if (input.tool_name === undefined && typeof payload.toolName === "string") input.tool_name = payload.toolName;
  if (input.tool_input === undefined && payload.toolArgs !== undefined) input.tool_input = typeof payload.toolArgs === "string" ? parse(payload.toolArgs, "Invalid serialized tool input") : payload.toolArgs;
  if (object(input.tool_input) && input.tool_input.file_path === undefined && typeof input.tool_input.filePath === "string") input.tool_input = { ...input.tool_input, file_path: input.tool_input.filePath };
  // Resolved here, once: the row's script, and the directory the child runs in.
  // A plugin-rooted row's repository is the SESSION's working directory — the
  // four-level climb below locates the repository a runner was synced into, and
  // under a vendor container it would name the container instead. With the
  // variable unset there is still one right answer rather than a guess: a
  // container places every hook script in the single \`hooks/\` directory this
  // runner ships in, so the script is its sibling.
  const pluginRef = PLUGIN_ROOT_REF.exec(row.command[1] ?? "");
  const command = [...row.command];
  if (pluginRef !== null) {
    const supplied = process.env[pluginRef[1]];
    command[1] = typeof supplied === "string" && supplied !== ""
      ? join(supplied, ...pluginRef[2].split("/"))
      : join(HERE, basename(command[1]));
  }
  const child = spawnSync(command[0], command.slice(1), {
    cwd: pluginRef === null ? ROOT : process.cwd(), input: JSON.stringify(input), encoding: "utf8", shell: false,
    maxBuffer: 1024 * 1024,
    ...(row.timeoutMs === undefined ? {} : { timeout: row.timeoutMs }),
  });
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.error) {
    // Copilot hook timeouts always fail open, so the runner reports and yields
    // rather than manufacturing a denial the client would not have made.
    // https://docs.github.com/en/copilot/reference/hooks-reference (accessed 2026-09-17)
    if (child.error.code === "ETIMEDOUT" && TOOL === "copilot") {
      warn("timeout: Copilot proceeds through its normal permission flow");
      return;
    }
    throw safeError("Hook process failed (" + (child.error.code ?? "unknown") + ")");
  }
  if (child.status !== 0) { process.exitCode = child.status ?? 1; return; }
  const output = (child.stdout ?? "").trim();
  // A child that wrote nothing decided nothing. On Cursor that is not a
  // pass-through: its failClosed clause counts "no output" as a hook failure,
  // so a pre-tool-use row has to say allow out loud.
  // https://cursor.com/docs/hooks (accessed 2026-09-17)
  if (output === "") { if (TOOL === "cursor" && row.event === "pre_tool_use") write({ permission: "allow" }); return; }
  let parsed;
  try { parsed = JSON.parse(output); } catch {
    // Codex injects a UserPromptSubmit hook's plain stdout into the prompt.
    // https://learn.chatgpt.com/docs/hooks (accessed 2026-09-17)
    if (TOOL === "codex" && row.event === "user_prompt_submit") { process.stdout.write(output + "\\n"); return; }
    if (row.event === "session_start") {
      // Each client's own session-start context channel, so a script that just
      // prints the learning index reaches the session on all three.
      // https://cursor.com/docs/hooks (accessed 2026-09-17)
      // https://docs.github.com/en/copilot/reference/hooks-reference (accessed 2026-09-17)
      if (TOOL === "cursor") write({ additional_context: output });
      else if (TOOL === "codex") process.stdout.write(output + "\\n");
      else write({ additionalContext: output });
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
  // The legacy vocabulary is exactly \`approve\` and \`block\`, and the value is
  // validated HERE, beside \`permissionDecision\`, rather than at any client's
  // branch. A key this runner knows never reads as \`<unrecognized>\`, so an
  // unreadable value on it would otherwise set no decision and reach Cursor's
  // explicit allow below — turning a child that meant to refuse into an
  // approval. Faulting hands each client its own fail-closed exit instead.
  if (parsed.decision !== undefined && !["approve", "block"].includes(parsed.decision)) throw safeError("Unsupported decision");
  // Codex accepts the canonical schema, except unsupported PreToolUse controls
  // fail open natively. Convert requests to stop/ask into a supported denial.
  // https://learn.chatgpt.com/docs/hooks (accessed 2026-09-17)
  if (TOOL === "codex") {
    if (row.event === "pre_tool_use") {
      if (specific?.permissionDecision === "ask" || parsed.continue === false) {
        warn("unsupported PreToolUse stop/ask control; denied pending manual permission review");
        parsed.hookSpecificOutput = { ...specific, hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: (parsed.continue === false ? parsed.stopReason : specific?.permissionDecisionReason) ?? "Hook requires manual permission review" };
        delete parsed.hookSpecificOutput.updatedInput;
        delete parsed.continue;
        delete parsed.stopReason;
      }
      // Legacy \`decision: "approve"\` is ignored with a warning, exactly as the
      // other clients' branch below ignores it: it carries no denial, and
      // turning a hook that meant to allow into a runner fault was this
      // client's alone.
      if (parsed.decision === "approve") {
        warn("legacy approve is unsupported and ignored; use hookSpecificOutput.permissionDecision");
        delete parsed.decision;
      }
      const nativeSpecific = parsed.hookSpecificOutput;
      if (nativeSpecific?.updatedInput !== undefined && (nativeSpecific.permissionDecision !== "allow" || !object(nativeSpecific.updatedInput))) throw safeError("Invalid updatedInput permission or shape");
      // Codex's shell and patch tools take their rewrite on \`command\`.
      // https://learn.chatgpt.com/docs/hooks (accessed 2026-09-17)
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
  // A key the runner KNOWS (supported, or a named public field) is diagnosed and
  // dropped. A key it cannot name at all may be carrying the child's verdict in
  // a spelling this boundary does not read, which is a different class.
  let undecidable = false;
  const note = (prefix, key) => { const name = fieldName(key); if (name === "<unrecognized>") undecidable = true; warn("unsupported output field: " + prefix + name); };
  for (const key of Object.keys(parsed)) if (!supported.has(key)) note("", key);
  if (specific) for (const key of Object.keys(specific)) if (!supported.has(key)) note("hookSpecificOutput.", key);
  const out = {};
  if (row.event === "pre_tool_use") {
    // The canonical global stop overrides every event-specific decision.
    const stopped = parsed.continue === false;
    const decision = stopped ? "deny" : value.permissionDecision ?? (parsed.decision === "block" ? "deny" : undefined);
    if (decision !== undefined) {
      if (!["allow", "deny", "ask"].includes(decision)) throw safeError("Unsupported permission decision");
      const reason = stopped ? parsed.stopReason ?? "Hook requested a stop" : value.permissionDecisionReason ?? parsed.reason ?? "Hook permission decision";
      if (TOOL === "cursor") {
        // Cursor's verdict document: permission is allow | deny | ask and
        // user_message is the message shown when denied. It documents no ask,
        // so an ask becomes a denial pending manual review.
        // https://cursor.com/docs/hooks (accessed 2026-09-17)
        out.permission = decision === "allow" ? "allow" : "deny";
        if (decision === "ask") warn("Cursor has no ask decision; denied pending manual permission review");
        out.user_message = reason;
      } else {
        out.permissionDecision = decision;
        out.permissionDecisionReason = reason;
      }
    } else if (TOOL === "cursor") {
      // A child that wrote an unreadable key alongside no decision may have
      // MEANT to deny — Cursor's own native document spells the verdict
      // \`permission\`, and a misspelled canonical key lands here too. Writing
      // the allow for it would convert that denial into an approval, so the
      // runner faults instead and failClosed denies.
      if (undecidable) throw safeError("Undecidable hook output");
      // Otherwise the child made no decision. On this client "no output" is a
      // failClosed FAILURE, so silence would block every call the guard meant
      // to allow — the allow is written explicitly instead, which is also
      // correct under the reading where silence merely passes through.
      // https://cursor.com/docs/hooks (accessed 2026-09-17)
      out.permission = "allow";
    }
  } else if (row.event === "stop" && TOOL === "copilot" && parsed.decision === "block") {
    // Copilot's Stop hook takes decision: "block" with a reason.
    // https://docs.github.com/en/copilot/reference/hooks-reference (accessed 2026-09-17)
    out.decision = "block";
    out.reason = parsed.reason ?? "Hook requested another turn";
  } else if (row.event === "user_prompt_submit" && TOOL === "cursor" && parsed.continue === false) {
    // Cursor stops a submission with continue: false plus user_message.
    // https://cursor.com/docs/hooks (accessed 2026-09-17)
    out.continue = false;
    out.user_message = parsed.stopReason ?? "Hook prevented prompt submission";
  } else if (parsed.decision === "block" || parsed.continue === false) {
    warn("blocking output is unsupported for this event; use the client's permission controls");
  }
  // Each client's context-injection field, and the events that carry it.
  // Copilot injects on sessionStart as well as postToolUse.
  // https://cursor.com/docs/hooks (accessed 2026-09-17)
  // https://docs.github.com/en/copilot/reference/hooks-reference (accessed 2026-09-17)
  if (typeof value.additionalContext === "string") {
    if (TOOL === "cursor" && ["session_start", "post_tool_use"].includes(row.event)) out.additional_context = value.additionalContext;
    else if (TOOL === "copilot" && ["session_start", "post_tool_use"].includes(row.event)) out.additionalContext = value.additionalContext;
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
