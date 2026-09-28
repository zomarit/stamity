#!/usr/bin/env node
// stamity — sub-agent spawn guard.
//
// Denies a spawn whose agent id carries the generated-content prefix but is
// not on the shipped roster. Ids outside that prefix are not this setup's to
// police and pass through. Wired to the spawn event with failClosed: true, so
// a crash or a timeout denies rather than waving the spawn through.
//
// A payload that cannot be read names no agent, so it is not a crash and not
// a refusal: the spawn proceeds and the reason is written to stderr, because
// an allowlist that quietly stops matching is worse than one that says so.
//
// Generated file — regenerate it rather than editing; local edits are overwritten.
// Trust posture: exec form, repo-committed, no dynamic evaluation, no network
// reach, and output determined by repo state alone.

import { readFileSync } from "node:fs";

const NAMESPACE = "stamity-";
const ROSTER = new Set([
  "stamity-creator",
  "stamity-design-quality",
  "stamity-fixer",
  "stamity-implementer",
  "stamity-performance",
  "stamity-researcher",
  "stamity-reviewer",
  "stamity-security",
  "stamity-spec-author",
  "stamity-test-runner"
]);

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

const { payload, problem } = readPayload();
const agentId = typeof payload.subagent_type === "string" ? payload.subagent_type : "";

// Nothing to judge: say so on stderr rather than passing the spawn through in
// silence. The spawn still proceeds, and it takes an explicit allow to say so —
// no output is a failClosed failure on this client.
if (agentId === "") {
  notice("stamity-cursor-subagent-guard", {
    reasonCode: "SPAWN_PAYLOAD_UNUSABLE",
    detail: problem === null ? "payload carried no subagent_type" : problem,
    at: new Date().toISOString(),
  });
  allow();
} else if (agentId.startsWith(NAMESPACE) && !ROSTER.has(agentId)) {
  deny(
    "stamity-cursor-subagent-guard",
    { reasonCode: "AGENT_NOT_ON_ROSTER", agentId, at: new Date().toISOString() },
    'Blocked the spawn of "' +
      agentId +
      '": no agent with that id ships in this setup, so it holds no tool policy. ' +
      "Re-run `stamity sync` if the roster changed, or spawn one of: " +
      [...ROSTER].join(", ") +
      ".",
  );
} else {
  // Out of scope, or rostered. The spawn proceeds and the verdict says so.
  allow();
}
