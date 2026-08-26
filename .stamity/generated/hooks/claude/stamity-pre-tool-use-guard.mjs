#!/usr/bin/env node
// stamity — pre-tool-use allowlist guard.
//
// Rules on the pending tool call against the emitted policy document.
// Deny-by-default within scope: only agents carrying the generated-content
// prefix are governed, and inside that scope an unrostered agent, a denied
// tool name, an unknown tool and an ungranted category all refuse.
//
// Blocking client: a refusal exits 2 and the action stops.
//
// Generated file — regenerate it rather than editing; local edits are overwritten.
// Trust posture: exec form, repo-committed, no dynamic evaluation, no network reach.
// Reads outside repo state: the pending call's payload on stdin. Output is a
// function of that payload and the emitted policy document, not of the repo.

import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const POLICY_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "agent-tool-policies.json");
const POLICY_SCHEMA = "stamity/agent-tool-policies/v1";
const MAX_POLICY_BYTES = 262144;
const GOVERNED_PREFIX = "stamity-";
const BLOCKING = true;
const BLOCK_EXIT = 2;
const MCP_PREFIX = "mcp__";

// Client-native tool name → category, unioned across the client dialects the
// engine emits. A name listed under two categories resolves to the narrower
// one, so a dialect collision can only under-grant.
const TOOL_CATEGORY = {
  "Read": "read",
  "Grep": "read",
  "Glob": "read",
  "Skill": "read",
  "read": "read",
  "search": "read",
  "Edit": "edit",
  "Write": "edit",
  "NotebookEdit": "edit",
  "edit": "edit",
  "Bash": "execute",
  "PowerShell": "execute",
  "execute": "execute",
  "WebFetch": "network",
  "WebSearch": "network",
  "web": "network",
  "Agent": "spawn",
  "Task": "spawn",
  "agent": "spawn",
  "TodoWrite": "planning",
  "todo": "planning",
};

function readPayload() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    return {};
  }
  if (raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" ? parsed : {};
  } catch {
    // An unparseable payload names no agent and no tool, so it attributes to
    // nothing this script governs — treated as out of scope, never as a
    // finding, so a client's payload change cannot brick a session.
    return {};
  }
}

function field(payload, names) {
  for (const name of names) {
    const value = Object.hasOwn(payload, name) ? payload[name] : undefined;
    if (typeof value === "string" && value !== "") return value;
  }
  return "";
}

/** The refusal this call earns, or null when nothing here governs it. */
function evaluate() {
  const payload = readPayload();
  const agentId = field(payload, ["agent_type", "subagent_type", "agentType", "subagentType"]);
  // Out of scope: the main thread and the client's own agents are not this
  // setup's to govern, and denying them would brick the session.
  if (!agentId.startsWith(GOVERNED_PREFIX)) return null;

  const agentInstance = field(payload, ["agent_id", "subagent_id"]);
  const tool = field(payload, ["tool_name", "toolName", "tool"]);
  const subject = { agentId, agentInstance, tool };

  try {
    if (tool === "") {
      return {
        ...subject,
        reasonCode: "UNKNOWN_TOOL",
        message: "The payload named no tool, so the call cannot be authorized.",
      };
    }

    let size = -1;
    try {
      const stats = statSync(POLICY_FILE);
      if (stats.isFile()) size = stats.size;
    } catch {
      size = -1;
    }
    if (size < 0) {
      return {
        ...subject,
        reasonCode: "POLICY_UNREADABLE",
        message: `No readable policy document at ${POLICY_FILE}; nothing authorizes this call.`,
      };
    }
    // Sized before it is read: an unbounded document is refused on its size
    // alone rather than parsed to discover it was unreasonable.
    if (size > MAX_POLICY_BYTES) {
      return {
        ...subject,
        reasonCode: "POLICY_TOO_LARGE",
        message: `Policy document ${POLICY_FILE} is ${size} bytes, past the ${MAX_POLICY_BYTES} byte cap.`,
      };
    }

    const document = JSON.parse(readFileSync(POLICY_FILE, "utf8"));
    if (
      document === null ||
      typeof document !== "object" ||
      document.schema !== POLICY_SCHEMA ||
      !Array.isArray(document.policies)
    ) {
      return {
        ...subject,
        reasonCode: "POLICY_INVALID",
        message: `Policy document ${POLICY_FILE} does not declare schema "${POLICY_SCHEMA}".`,
      };
    }

    const policy = document.policies.find(
      (entry) => entry !== null && typeof entry === "object" && entry.agentId === agentId,
    );
    if (policy === undefined) {
      return {
        ...subject,
        reasonCode: "NO_POLICY",
        message: `No policy is registered for agent "${agentId}", so it may use nothing. Add a grant for it to the roster and regenerate the setup.`,
      };
    }
    // A name on the deny list outranks whatever its category resolves to.
    if (Array.isArray(policy.denyTools) && policy.denyTools.includes(tool)) {
      return {
        ...subject,
        reasonCode: "TOOL_DENIED",
        message: `Agent "${agentId}" is denied tool "${tool}" by name.`,
      };
    }

    // Own-property read: a plain object inherits `constructor` and `toString`,
    // and a tool named after one of those would otherwise resolve to a function.
    let category = Object.hasOwn(TOOL_CATEGORY, tool) ? TOOL_CATEGORY[tool] : "";
    if (category === "" && tool.startsWith(MCP_PREFIX)) category = "network";
    if (category === "") {
      return {
        ...subject,
        reasonCode: "UNKNOWN_TOOL",
        message: `Tool "${tool}" maps to no category on this client, so it cannot be authorized.`,
      };
    }
    if (!Array.isArray(policy.allow) || !policy.allow.includes(category)) {
      return {
        ...subject,
        category,
        reasonCode: "CATEGORY_DENIED",
        message: `Agent "${agentId}" may not use tool "${tool}": it grants no "${category}" access.`,
      };
    }

    return null;
  } catch (error) {
    // Any unexpected throw is a refusal too: the guard's whole job is the
    // decision, and one it could not make is not one that authorizes.
    return {
      ...subject,
      reasonCode: "POLICY_EVALUATION_FAILED",
      message: `Policy evaluation failed for agent "${agentId}": ${error && error.message ? error.message : String(error)}.`,
    };
  }
}

const refusal = evaluate();
if (refusal !== null) {
  // Reported, then the process ends on its own. `process.exit` would race the
  // write: stderr is asynchronous when it is a pipe on macOS and the BSDs,
  // which is exactly how a client runs a hook — and a denial nobody can read
  // is a denial nobody can act on.
  process.stderr.write(
    JSON.stringify({ hook: "stamity-pre-tool-use-guard", blocked: BLOCKING, ...refusal }) + "\n",
  );
  process.exitCode = BLOCKING ? BLOCK_EXIT : 0;
}
