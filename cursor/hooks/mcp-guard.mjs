#!/usr/bin/env node
// stamity — MCP server allowlist guard.
//
// Denies a pending MCP call whose server is absent from the resolved
// .cursor/mcp.json set (this project's file plus the operator's user-level
// one). Deny-by-default: no configured server means nothing to match, so
// every mcp__ call is refused and the message says why.
//
// A manifest that exists but does not parse is reported as its own refusal,
// naming the path and the parser message — not folded into the absent case.
// To stop the guard, change the selection (stamity config mcp add <id>, then
// stamity sync) or deselect this client; editing .cursor/hooks.json does not
// stick.
//
// Generated file — regenerate it rather than editing; local edits are overwritten.
// Trust posture: exec form, repo-committed, no dynamic evaluation, no network
// reach, and output determined by repo state alone.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// This script sits at .cursor/hooks/mcp-guard.mjs; the project manifest is its sibling
// one level up, and the operator's own file lives under the home directory.
const MANIFESTS = [join(HERE, "..", "mcp.json"), join(homedir(), ".cursor", "mcp.json")];
const TOOL_PREFIX = "mcp__";

function reasonOf(err) {
  if (err === null || err === undefined) return "unknown error";
  const message = typeof err === "object" && typeof err.message === "string" ? err.message : String(err);
  const code = typeof err === "object" && typeof err.code === "string" ? err.code + ": " : "";
  return code + message;
}

function readPayload() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch (err) {
    return { payload: {}, problem: "stdin was unreadable (" + reasonOf(err) + ")" };
  }
  if (raw.trim() === "") return { payload: {}, problem: "stdin carried no payload" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { payload: {}, problem: "payload was not a JSON object" };
    }
    return { payload: parsed, problem: null };
  } catch (err) {
    return { payload: {}, problem: "payload was not valid JSON (" + reasonOf(err) + ")" };
  }
}

function notice(hook, event) {
  process.stderr.write(JSON.stringify({ hook, ...event }) + "\n");
}

function deny(hook, event, userMessage) {
  notice(hook, event);
  process.stdout.write(JSON.stringify({ permission: "deny", user_message: userMessage }));
}

function allow() {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
}

function normalize(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

// Every spelling of a configured server: its name, a remote URL, and the full
// stdio command line — the payload supplies whichever the call was made with.
// `faults` collects manifests that exist and could not be used; a manifest that
// is simply absent is not a fault, it is a repo that selected no servers.
function allowedIdentities() {
  const allowed = new Set();
  const faults = [];
  for (const file of MANIFESTS) {
    let raw;
    try {
      raw = readFileSync(file, "utf8");
    } catch (err) {
      if (err === null || typeof err !== "object" || err.code !== "ENOENT") {
        faults.push({ path: file, detail: reasonOf(err) });
      }
      continue;
    }
    let doc;
    try {
      doc = JSON.parse(raw);
    } catch (err) {
      faults.push({ path: file, detail: reasonOf(err) });
      continue;
    }
    const servers = doc !== null && typeof doc === "object" ? doc.mcpServers : null;
    if (servers === null || typeof servers !== "object") {
      faults.push({ path: file, detail: "no mcpServers object" });
      continue;
    }
    for (const [name, server] of Object.entries(servers)) {
      allowed.add(name);
      if (server === null || typeof server !== "object") continue;
      if (typeof server.url === "string" && server.url !== "") {
        allowed.add(normalize(server.url));
      }
      if (typeof server.command === "string" && server.command !== "") {
        const args = Array.isArray(server.args) ? server.args : [];
        allowed.add(normalize([server.command, ...args].join(" ")));
      }
    }
  }
  return { allowed, faults };
}

function faultLine(faults) {
  return faults.map((fault) => fault.path + " (" + fault.detail + ")").join("; ");
}

function identityOf(payload) {
  const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "";
  if (toolName.startsWith(TOOL_PREFIX)) {
    const server = toolName.slice(TOOL_PREFIX.length).split("__")[0];
    if (server) return server;
  }
  if (typeof payload.url === "string" && payload.url !== "") return normalize(payload.url);
  if (typeof payload.command === "string" && payload.command !== "") {
    return normalize(payload.command);
  }
  return "";
}

const HOOK = "stamity-cursor-mcp-guard";
const { payload, problem } = readPayload();
const { allowed, faults } = allowedIdentities();
const identity = identityOf(payload);
const event = { server: identity, at: new Date().toISOString() };

if (allowed.size === 0 && faults.length > 0) {
  // The manifests exist and could not be used. Refusing is still right — an
  // unreadable allowlist allows nothing — but the cause and the fix are the
  // file, not the selection, so they are named instead of the absent-case text.
  deny(
    HOOK,
    { reasonCode: "MCP_MANIFEST_UNREADABLE", faults, ...event },
    "Blocked every MCP call: no MCP manifest could be read, so there is no " +
      "allowlist to match against. Fix " +
      faultLine(faults) +
      ", then re-run `stamity sync`.",
  );
} else if (allowed.size === 0) {
  deny(
    HOOK,
    { reasonCode: "NO_MCP_SERVERS_CONFIGURED", ...event },
    "Blocked every MCP call: this setup configured no MCP servers, so there is " +
      "no allowlist to match against. Add one with `stamity config mcp add <id>` " +
      "and re-run `stamity sync`.",
  );
} else if (identity === "") {
  deny(
    HOOK,
    {
      reasonCode: "MCP_SERVER_UNIDENTIFIED",
      detail: problem === null ? "payload named no server" : problem,
      ...event,
    },
    "Blocked an MCP call that names no server this guard can recognise, so it " +
      "cannot be matched against .cursor/mcp.json. Report the client payload shape.",
  );
} else if (!allowed.has(identity)) {
  deny(
    HOOK,
    { reasonCode: "MCP_SERVER_NOT_CONFIGURED", ...event },
    'Blocked an MCP call to "' +
      identity +
      '": it is absent from the resolved .cursor/mcp.json set. Add it with ' +
      "`stamity config mcp add <id>` and re-run `stamity sync`.",
  );
} else if (faults.length > 0) {
  // Allowed on the manifests that DID load. The broken one still cost the
  // operator whatever it configured, so it is announced rather than left to be
  // discovered as a server that silently stopped being reachable.
  notice(HOOK, { reasonCode: "MCP_MANIFEST_UNREADABLE", faults, ...event });
  allow();
} else {
  // On the allowlist. The verdict is written rather than implied: no output is
  // a failClosed failure here, and this guard is wired failClosed: true.
  allow();
}
