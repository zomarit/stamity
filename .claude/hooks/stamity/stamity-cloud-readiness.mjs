#!/usr/bin/env node
/* eslint-disable */
// stamity — cloud readiness (Claude Code).
//
// Does nothing unless CLAUDE_CODE_REMOTE is exactly true. In Claude Code's
// cloud machine it appends STAMITY_HOOKS_ACTIVE=1 to $CLAUDE_ENV_FILE first,
// so the unattended pre-flight reads the hooks as loaded, then checks node
// against package.json's engines.node, runs npm ci where node_modules is
// missing and a lockfile is there, and resolves the pinned CLI once. One line
// per step goes to stdout; it always exits 0.
//
// Generated file — regenerate it rather than editing; local edits are overwritten.
// Trust posture: exec form, repo-committed, no dynamic evaluation, nothing run through a shell.
// Network: in Claude Code's cloud alone it starts npm ci, which runs the lockfile's install scripts,
// and npx; both reach the npm registry.
// Reads outside repo state: CLAUDE_CODE_REMOTE, CLAUDE_ENV_FILE, STAMITY_REPO_ROOT and node's version.
// Writes the environment file and, through npm ci, node_modules.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const STATE_SEGMENTS = [".stamity"];
const MARKER = "export STAMITY_HOOKS_ACTIVE=1";
const LOCKFILES = ["npm-shrinkwrap.json", "package-lock.json"];
const MAX_FILE_BYTES = 1048576;
const INSTALL_TIMEOUT_MS = 240000;
const CLI_TIMEOUT_MS = 45000;
const CLI_CALL = ["npx","-y","@zomarit/stamity@1.15.0","help"];
const PREFIX = "stamity cloud readiness: ";

const HERE = dirname(fileURLToPath(import.meta.url));
const ANCHOR_SEGMENTS = ["hooks",".claude"];

/**
 * The repository root this script was emitted into, or "" when the script is not
 * sitting where emission puts one. Shape-checked rather than assumed: four levels
 * up from any directory is some directory, and only the emitted layout's own
 * parent segments make it a repository root.
 */
function derivedRoot() {
  let dir = dirname(HERE);
  for (const segment of ANCHOR_SEGMENTS) {
    if (basename(dir) !== segment) return "";
    dir = dirname(dir);
  }
  return dir;
}

function repoRoot() {
  const cwd = resolve(process.cwd());
  const derived = derivedRoot();
  if (derived !== "") return derived;
  const declared = process.env.STAMITY_REPO_ROOT;
  if (typeof declared !== "string" || declared === "") return cwd;
  const candidate = resolve(cwd, declared);
  const prefix = candidate.endsWith(sep) ? candidate : candidate + sep;
  if (candidate !== cwd && !cwd.startsWith(prefix)) return cwd;
  try {
    if (!statSync(join(candidate, STATE_SEGMENTS[0])).isDirectory()) return cwd;
  } catch {
    return cwd;
  }
  return candidate;
}

const lines = [];

/** One line for the session's context; control characters cannot reach it. */
function say(text) {
  lines.push(PREFIX + text.replace(/[\u0000-\u001f\u007f]/g, "?"));
}

/** An error's code, or its name: never its message, which can carry a path or a value. */
function cause(error) {
  const named = error && typeof error.code === "string" ? error.code : (error && error.name) || "a fault";
  return /^[A-Za-z0-9_]{1,40}$/.test(named) ? named : "a fault";
}

/** First: the variable the pre-flight reads, written once, so the hooks count as loaded whatever comes next. */
function markHooksActive() {
  const file = process.env.CLAUDE_ENV_FILE;
  if (typeof file !== "string" || file === "") {
    say("CLAUDE_ENV_FILE is not set, so STAMITY_HOOKS_ACTIVE was not written and an unattended pre-flight refuses here.");
    return;
  }
  let lead = "";
  try {
    const stats = statSync(file);
    if (stats.isFile() && stats.size > 0 && stats.size <= MAX_FILE_BYTES) {
      const text = readFileSync(file, "utf8");
      if (text.split(/\r?\n/).includes(MARKER)) {
        say("STAMITY_HOOKS_ACTIVE=1 is already in the environment file.");
        return;
      }
      lead = text.endsWith("\n") ? "" : "\n";
    } else if (stats.size > 0) {
      lead = "\n";
    }
  } catch {
    // A file not there yet is created below; a read fault is met again by the write, which names it.
  }
  try {
    appendFileSync(file, lead + MARKER + "\n");
  } catch (error) {
    say("the environment file could not be written (" + cause(error) + "), so an unattended pre-flight refuses here.");
    return;
  }
  say("wrote STAMITY_HOOKS_ACTIVE=1 to the environment file, for this session's shell commands.");
}

/** package.json's object, or null when there is none; a file it cannot read, or that holds no object, throws. */
function readManifest(root) {
  const path = join(root, "package.json");
  let stats;
  try {
    stats = statSync(path);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
  if (!stats.isFile() || stats.size > MAX_FILE_BYTES) throw Object.assign(new Error("package.json"), { code: "NOT_A_SMALL_FILE" });
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw Object.assign(new Error("package.json"), { code: "NOT_AN_OBJECT" });
  return parsed;
}

/** A version's three numbers, or null. */
function triple(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(text);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compare(a, b) {
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  return 0;
}

/** One comparator as the bounds it allows (a null bound is open), or null for a shape this hook does not read. */
function bounds(word) {
  const match = /^(>=|<=|>|<|=|\^|~)?v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?$/.exec(word);
  if (match === null) return null;
  const op = match[1] ?? "";
  const parts = [match[2], match[3], match[4]];
  let given = 0;
  while (given < 3 && parts[given] !== undefined && /^\d+$/.test(parts[given])) given += 1;
  if (parts.slice(given).some((part) => part !== undefined && /^\d+$/.test(part))) return null;
  const n = parts.map((part, index) => (index < given ? Number(part) : 0));
  const bump = (at) => n.map((value, index) => (index < at ? value : index === at ? value + 1 : 0));
  if (given === 0) return op === "<" || op === ">" ? null : { low: null, high: null };
  if (op === "" || op === "=") return given === 3 ? { low: n, lowIn: true, high: n, highIn: true } : { low: n, lowIn: true, high: bump(given - 1) };
  if (op === ">=") return { low: n, lowIn: true, high: null };
  if (op === ">") return given === 3 ? { low: n, lowIn: false, high: null } : { low: bump(given - 1), lowIn: true, high: null };
  if (op === "<") return { low: null, high: n };
  if (op === "<=") return given === 3 ? { low: null, high: n, highIn: true } : { low: null, high: bump(given - 1) };
  if (op === "~") return { low: n, lowIn: true, high: bump(given >= 2 ? 1 : 0) };
  // A caret holds the left-most number given that is not 0.
  const held = n.findIndex((value, index) => index < given && value !== 0);
  return { low: n, lowIn: true, high: bump(held === -1 ? given - 1 : held) };
}

/** Whether a version meets an npm range of the common shapes; null when any part is not one of them. */
function meets(version, range) {
  const have = triple(version);
  if (have === null) return null;
  let met = false;
  for (const set of range.split("||")) {
    const words = set.trim().replace(/(>=|<=|>|<|=|\^|~)\s+/g, "$1").split(/\s+/).filter((word) => word !== "");
    let all = true;
    for (const word of words) {
      const allowed = bounds(word);
      if (allowed === null) return null;
      if (allowed.low !== null && compare(have, allowed.low) < (allowed.lowIn ? 0 : 1)) all = false;
      if (allowed.high !== null && compare(have, allowed.high) > (allowed.highIn ? 0 : -1)) all = false;
    }
    if (all) met = true;
  }
  return met;
}

function checkNode(manifest) {
  const node = process.versions.node;
  const range = manifest.engines && typeof manifest.engines === "object" ? manifest.engines.node : undefined;
  if (typeof range !== "string" || range.trim() === "") {
    say("package.json declares no engines.node, so node " + node + " is not checked.");
    return;
  }
  const met = meets(node, range);
  if (met === null) say("engines.node is not a range this hook reads, so node " + node + " is not checked.");
  else if (met) say("node " + node + " meets engines.node.");
  else say("node " + node + " is outside engines.node; the run needs a node it names.");
}

/** How a child ended, in fixed words and its code. */
function ended(result) {
  if (result.error && result.error.code === "ETIMEDOUT") return "timeout";
  if (result.error) return "could not start (" + cause(result.error) + ")";
  if (result.status === 0) return "ok";
  return result.status === null ? "signal " + cause({ code: result.signal }) : "exit " + result.status;
}

function installDependencies(root) {
  if (existsSync(join(root, "node_modules"))) {
    say("node_modules is there, so npm ci does not run.");
    return;
  }
  const lock = LOCKFILES.find((name) => existsSync(join(root, name)));
  if (lock === undefined) {
    say("node_modules is missing and no package-lock.json or npm-shrinkwrap.json is there, so npm ci does not run.");
    return;
  }
  // No shell, and no output kept: npm's text never reaches the session.
  const how = ended(spawnSync("npm", ["ci"], { cwd: root, stdio: "ignore", timeout: INSTALL_TIMEOUT_MS, windowsHide: true }));
  if (how === "ok") say("npm ci finished from " + lock + ".");
  else if (how === "timeout") say("npm ci stopped at its limit of " + INSTALL_TIMEOUT_MS / 1000 + " s; node_modules may be partial, so run npm ci again.");
  else say("npm ci failed (" + how + "); it needs the npm registry, so run npm ci again once it is reachable.");
}

function resolveCli(root) {
  const how = ended(spawnSync(CLI_CALL[0], CLI_CALL.slice(1), { cwd: root, stdio: "ignore", timeout: CLI_TIMEOUT_MS, windowsHide: true }));
  const named = CLI_CALL.slice(0, -1).join(" ");
  if (how === "ok") say("the pinned CLI resolved (" + named + ").");
  else say("the pinned CLI did not resolve (" + (how === "timeout" ? "past " + CLI_TIMEOUT_MS / 1000 + " s" : how) + "); " + named + " needs the npm registry or an installed copy.");
}

/** One step; a fault names the step and its code, and the next step still runs. */
function step(name, run) {
  try {
    run();
  } catch (error) {
    say(name + " stopped (" + cause(error) + ").");
  }
}

if (process.env.CLAUDE_CODE_REMOTE === "true") {
  step("writing the environment file", markHooksActive);
  step("the readiness steps", () => {
    const root = repoRoot();
    let manifest = null;
    try {
      manifest = readManifest(root);
    } catch (error) {
      say("package.json could not be read (" + cause(error) + "), so node is not checked and nothing is installed.");
      manifest = undefined;
    }
    if (manifest === null) say("no package.json, so nothing is installed and node is not checked.");
    if (manifest) {
      step("the node check", () => checkNode(manifest));
      step("the install", () => installDependencies(root));
    }
    step("resolving the pinned CLI", () => resolveCli(root));
  });
  process.stdout.write(lines.join("\n") + "\n");
}
