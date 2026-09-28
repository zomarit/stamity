#!/usr/bin/env node
// stamity — configuration-change notice.
//
// Prints a review reminder when agent configuration changes, and never
// blocks: every path exits 0. On a client with a native configuration-change
// event this fires per change; elsewhere it rides session start and reads as
// drift guidance.
//
// Generated file — regenerate it rather than editing; local edits are overwritten.
// Trust posture: exec form, repo-committed, no dynamic evaluation, no network reach.
// Reads outside repo state: the changing file's path off the payload on stdin.
// Nothing on disk is read, so the same repo prints two different lines for two
// different payloads.

import { readFileSync } from "node:fs";

const MAX_PATH_CHARS = 200;

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

/** One bounded, control-character-free line: the path came from a payload. */
function clean(value) {
  const flat = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > MAX_PATH_CHARS ? flat.slice(0, MAX_PATH_CHARS - 1) + "…" : flat;
}

const payload = readPayload();
const changed = clean(
  field(payload, ["file_path", "filePath", "path", "config_path", "settings_path"]),
);

const lines =
  changed === ""
    ? [
        "stamity: agent configuration is generated and managed. Run `stamity check` to diff the on-disk files against the engine's own output.",
      ]
    : [
        "stamity: agent configuration changed — " + changed + ".",
        "That file is generated and managed. Run `stamity check` to diff it against the engine's own output before trusting the change.",
      ];

process.stdout.write(lines.join("\n") + "\n");
