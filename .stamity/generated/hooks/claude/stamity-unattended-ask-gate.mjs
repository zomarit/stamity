#!/usr/bin/env node
/* eslint-disable */
// stamity — unattended ask gate (Claude Code).
//
// Refuses AskUserQuestion while a run is unattended, so the run takes its
// declared default and records it instead of waiting on nobody. A question
// is the safe failure: anything this script cannot read lets the question through.
// Blocking client: a refusal exits 2 with the rule on stderr.
//
// Generated file — regenerate it rather than editing; local edits are overwritten.
// Trust posture: exec form, repo-committed, no dynamic evaluation, no network reach.
// Reads outside repo state: the pending call's payload on stdin and the
// STAMITY_UNATTENDED and STAMITY_REPO_ROOT variables. Reads the run records'
// heads and the run-ended marker; writes nothing.

import { closeSync, lstatSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const STATE_SEGMENTS = [".stamity"];
const RUNS_SEGMENTS = [".stamity","runs"];
const RECORD_FILE = "record.md";
const RUN_ID = new RegExp("^[0-9]{4}-[0-9]{2}-[0-9]{2}_[a-z0-9-]+$", "");
const STATUS = new RegExp("^status:\\s*(.*)$", "i");
const MODE = new RegExp("^mode:\\s*(attended|unattended)\\b", "i");
const BRANCH = new RegExp("^branch:\\s*(\\S+)", "i");
const IN_PROGRESS = new RegExp("\\bin progress\\b", "i");
const HEAD_LINES = 15;
const HEAD_READ_BYTES = 65536;
const RUNS_READ_MAX = 50;
const GIT_MAX_BYTES = 4096;
const MARKER_SEGMENTS = [".stamity","run-ended.json"];
const MARKER_MAX_AGE_MS = 120000;
const ASK_TOOL = "AskUserQuestion";
const REASON = "This run is unattended: take the declared default and record `Default applied: <question> → option <N> (unattended)`; with no declared default, stop at BLOCKED_AMBIGUITY.";
const RECORD_SOURCE = " (<record> is in progress and reads `Mode: unattended`.)";
const VARIABLE_SOURCE = " (STAMITY_UNATTENDED is set, and no in-progress record reads `Mode: attended`.)";
const FAULT_NOTE = "stamity unattended ask gate: <read> could not be read (<cause>), so the question goes through.";
const BLOCK_EXIT = 2;

const HERE = dirname(fileURLToPath(import.meta.url));
const ANCHOR_SEGMENTS = ["hooks","generated",".stamity"];

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

/** A record's status, mode and branch from its first HEAD_LINES lines; null when absent or not a regular file. */
function recordHead(path) {
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
  if (!stats.isFile()) return null;
  const fd = openSync(path, "r");
  let text = "";
  try {
    const buffer = Buffer.alloc(Math.min(HEAD_READ_BYTES, stats.size));
    text = buffer.toString("utf8", 0, readSync(fd, buffer, 0, buffer.length, 0));
  } finally {
    closeSync(fd);
  }
  let status = null;
  let mode = null;
  let branch = null;
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/).slice(0, HEAD_LINES)) {
    status ??= STATUS.exec(line)?.[1] ?? null;
    mode ??= MODE.exec(line)?.[1].toLowerCase() ?? null;
    branch ??= BRANCH.exec(line)?.[1] ?? null;
  }
  return { inProgress: status !== null && IN_PROGRESS.test(status), mode, branch };
}

/** The heads of the RUNS_READ_MAX newest run folders' records, each with its repo-relative path; no records folder holds none. */
function recordHeads(root) {
  const runsDir = join(root, ...RUNS_SEGMENTS);
  let entries = [];
  try {
    if (lstatSync(runsDir).isDirectory()) entries = readdirSync(runsDir, { withFileTypes: true });
  } catch (error) {
    if (!error || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) throw error;
  }
  const names = entries
    .filter((entry) => entry.isDirectory() && RUN_ID.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .slice(0, RUNS_READ_MAX);
  const heads = [];
  for (const name of names) {
    const head = recordHead(join(runsDir, name, RECORD_FILE));
    if (head !== null) heads.push({ ...head, run: name, path: [...RUNS_SEGMENTS, name, RECORD_FILE].join("/") });
  }
  return heads;
}

/** A git metadata file's text, trimmed; null when absent, a link, not a file or past GIT_MAX_BYTES. */
function gitText(path) {
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return null;
    throw error;
  }
  return stats.isFile() && stats.size <= GIT_MAX_BYTES ? readFileSync(path, "utf8").trim() : null;
}

/** The current branch off .git/HEAD, a linked worktree's gitdir: pointer followed; null when detached or there is no .git. */
function currentBranch(root) {
  const dotGit = join(root, ".git");
  let gitDir = dotGit;
  let stats;
  try {
    stats = lstatSync(dotGit);
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return null;
    throw error;
  }
  if (!stats.isDirectory()) {
    const pointer = /^gitdir:[ \t]*(.+)$/.exec((gitText(dotGit) ?? "").split(/\r?\n/)[0]);
    if (pointer === null) return null;
    const target = pointer[1].trim();
    gitDir = isAbsolute(target) ? target : resolve(root, target);
  }
  const head = gitText(join(gitDir, "HEAD"));
  return head !== null && head.startsWith("ref: refs/heads/") ? head.slice(16) : null;
}

/** The run id a fresh run-ended marker names; null when absent, a link, not a file, past GIT_MAX_BYTES, naming no run id, or its at unreadable, after now or past MARKER_MAX_AGE_MS. */
function endedRun(root) {
  const text = gitText(join(root, ...MARKER_SEGMENTS));
  if (text === null) return null;
  let marker = null;
  try {
    marker = JSON.parse(text);
  } catch {
    return null;
  }
  const run = marker?.run;
  const age = Date.now() - (typeof marker?.at === "string" ? Date.parse(marker.at) : Number.NaN);
  if (!(age >= 0 && age <= MARKER_MAX_AGE_MS)) return null;
  return typeof run === "string" && RUN_ID.test(run) ? run : null;
}

/** What says nobody is there to answer, as the refusal names it; null when a question may be put. */
function unattendedSource(root) {
  const heads = recordHeads(root);
  const running = heads.filter((head) => head.inProgress);
  // No order among records: a run id carries only the date, so two runs of one day would rank by slug.
  const unattendedRun = running.find((head) => head.mode === "unattended");
  if (unattendedRun !== undefined) return RECORD_SOURCE.replace("<record>", () => unattendedRun.path);
  if (running.some((head) => head.mode === "attended")) return null;
  const flag = (process.env.STAMITY_UNATTENDED ?? "").trim().toLowerCase();
  if (["", "false", "0"].includes(flag)) return null;
  // Claude Code's final round: no run in progress, and this branch's unattended run closed its record before asking,
  // its last run end's marker fresh: a later session on the branch, before its own record opens, has none in date.
  const closed = running.length === 0 ? heads.filter((head) => head.mode === "unattended" && head.branch !== null) : [];
  if (closed.length > 0) {
    const ended = endedRun(root);
    const branch = ended === null ? null : currentBranch(root);
    if (branch !== null && closed.some((head) => head.branch === branch && head.run === ended)) return null;
  }
  return VARIABLE_SOURCE;
}

/** The source of the refusal this call earns, or null when the call goes through. */
function decide() {
  const raw = readFileSync(0, "utf8");
  const payload = raw.trim() === "" ? null : JSON.parse(raw);
  if (payload === null || typeof payload !== "object" || payload.tool_name !== ASK_TOOL) return null;
  return unattendedSource(repoRoot());
}

let refusal = null;
try {
  refusal = decide();
} catch (error) {
  // Fail open: a question this gate could not decide is one it lets through, and one line says which read failed.
  const syntax = error instanceof SyntaxError;
  const read = syntax ? "the hook payload" : error && typeof error.path === "string" ? error.path : "an input";
  const cause = syntax ? "not JSON" : error && error.code ? String(error.code) : (error && error.name) || "a fault";
  const note = FAULT_NOTE.replace("<read>", () => read).replace("<cause>", () => cause);
  process.stderr.write(note.replace(/[\u0000-\u001f\u007f]/g, "?") + "\n");
  refusal = null;
}
if (refusal !== null) {
  process.stderr.write(REASON + refusal + "\n");
  process.exitCode = BLOCK_EXIT;
}
