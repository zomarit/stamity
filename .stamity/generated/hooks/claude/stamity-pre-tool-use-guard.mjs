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
// function of that payload and ONE policy document — the one emitted beside
// this script in a container, or the repository's own at the climb, chosen
// when this script was rendered — and of nothing else. No environment
// variable and no second candidate.
// For a path-scoped Write it also reads file-system metadata (realpath, lstat)
// of the requested path's ancestors under the repository root this script's own
// location names — never file content, never an environment variable.

import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const POLICY_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "agent-tool-policies.json");
const POLICY_SCHEMA = "stamity/agent-tool-policies/v1";
const MAX_POLICY_BYTES = 262144;
const GOVERNED_PREFIX = "stamity-";
const BLOCKING = true;
const BLOCK_EXIT = 2;
const MCP_PREFIX = "mcp__";
const WRITE_TOOL = "Write";
const HERE = dirname(fileURLToPath(import.meta.url));
const ANCHOR_SEGMENTS = ["hooks","generated",".stamity"];
const MAX_PATH_CHARS = 1024;
const MAX_PATTERN_CHARS = 200;
const MAX_PATTERN_SEGMENTS = 16;
const PATTERN_SEGMENT = /^[A-Za-z0-9._*-]+$/;

/** One own property of an object, or undefined: an inherited name never answers. */
function own(value, key) {
  return value !== null && typeof value === "object" && Object.hasOwn(value, key) ? value[key] : undefined;
}

/**
 * The repository root this guard was emitted into, or "" when it is not sitting
 * where emission puts one. From the script's own location only: no environment
 * variable and no working directory decides where a report may land.
 */
function guardRoot() {
  let dir = dirname(HERE);
  for (const segment of ANCHOR_SEGMENTS) {
    if (basename(dir) !== segment) return "";
    dir = dirname(dir);
  }
  return dir;
}

/** A literal twin of the roster's write-path grammar: a pattern it rejects scopes nothing. */
function isWritePathPattern(value) {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_PATTERN_CHARS) return false;
  if (value.includes("**")) return false;
  const segments = value.split("/");
  if (segments.length > MAX_PATTERN_SEGMENTS) return false;
  return segments.every((segment) => segment !== "." && segment !== ".." && PATTERN_SEGMENT.test(segment));
}

/** One segment against its `*`-split pieces: prefix, ordered indexOf, suffix. */
function piecesMatch(text, pieces) {
  if (pieces.length === 1) return text === pieces[0];
  const head = pieces[0];
  const tail = pieces[pieces.length - 1];
  if (text.length < head.length + tail.length) return false;
  if (!text.startsWith(head) || !text.endsWith(tail)) return false;
  const end = text.length - tail.length;
  let cursor = head.length;
  for (let index = 1; index < pieces.length - 1; index += 1) {
    const at = text.indexOf(pieces[index], cursor);
    if (at < 0 || at + pieces[index].length > end) return false;
    cursor = at + pieces[index].length;
  }
  return true;
}

/**
 * The final segment: its last `*` — the round number just before the suffix —
 * takes one or more ASCII digits and nothing else; its other `*`s keep the
 * plain rule. A segment with no `*` matches exactly.
 */
function finalSegmentMatches(text, segment) {
  const star = segment.lastIndexOf("*");
  if (star < 0) return text === segment;
  const suffix = segment.slice(star + 1);
  if (text.length < suffix.length || !text.endsWith(suffix)) return false;
  const rest = text.slice(0, text.length - suffix.length);
  let cut = rest.length;
  while (cut > 0 && rest.charCodeAt(cut - 1) >= 48 && rest.charCodeAt(cut - 1) <= 57) cut -= 1;
  if (cut === rest.length) return false;
  return piecesMatch(rest.slice(0, cut), segment.slice(0, star).split("*"));
}

/** A repository-relative POSIX path against one pattern, segment for segment. */
function patternMatches(path, pattern) {
  const pathSegments = path.split("/");
  const patternSegments = pattern.split("/");
  if (pathSegments.length !== patternSegments.length) return false;
  const last = patternSegments.length - 1;
  for (let index = 0; index < last; index += 1) {
    if (!piecesMatch(pathSegments[index], patternSegments[index].split("*"))) return false;
  }
  return finalSegmentMatches(pathSegments[last], patternSegments[last]);
}

/** The win32 reserved device names, upper case: each opens a device wherever it sits in a path. */
const RESERVED_DEVICE_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$",
  ...["COM", "LPT"].flatMap((port) => Array.from("0123456789\u00b9\u00b2\u00b3", (digit) => port + digit)),
]);

/**
 * True when one path segment names a win32 reserved device: the text before its
 * first `.`, trailing spaces dropped, compared case-insensitively — so
 * `con`, `CON.md`, `CON.-reviewer-r1.md` and `CON . .` all name the console.
 */
function isReservedDeviceSegment(segment) {
  const dot = segment.indexOf(".");
  const stem = (dot < 0 ? segment : segment.slice(0, dot)).trimEnd();
  return RESERVED_DEVICE_NAMES.has(stem.toUpperCase());
}

/**
 * "" when this Write may land, or the one reason it may not. Reads file-system
 * metadata of the requested path's ancestors (realpath, lstat), never content.
 */
function writePathCheck(payload, patterns) {
  const root = guardRoot();
  if (root === "") return "no-root";
  const input = own(payload, "tool_input");
  if (input === null || typeof input !== "object") return "no-file-path";
  const raw = own(input, "file_path");
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PATH_CHARS || raw.includes("\0")) {
    return "no-file-path";
  }
  if (!isAbsolute(raw)) return "not-absolute";
  const segments = raw.split(/[\\/]+/);
  if (segments.some((segment) => segment === "." || segment === "..")) return "dot-segment";
  if (process.platform === "win32") {
    if (/^[\\/]{2}/.test(raw)) return "device-path";
    if (segments.slice(1).some((segment) => segment.includes(":"))) return "device-path";
    if (segments.some(isReservedDeviceSegment)) return "device-name";
  }

  const target = resolve(raw);
  const rootReal = realpathSync.native(root);
  const chain = [];
  for (let current = target; ; ) {
    chain.unshift(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  let anchor = -1;
  for (let index = 0; index < chain.length && anchor < 0; index += 1) {
    let real;
    try {
      real = realpathSync.native(chain[index]);
    } catch (error) {
      // An ancestor that does not resolve anchors nothing; the walk goes on to
      // the next deeper one, and if none anchors the path is outside-root.
      // Anything that is not a file-system answer is a real fault.
      if (error && typeof error.code === "string") continue;
      throw error;
    }
    if (relative(rootReal, real) === "") anchor = index;
  }
  if (anchor < 0) return "outside-root";

  const tail = chain.slice(anchor + 1).map((entry) => basename(entry));
  let current = rootReal;
  for (let index = 0; index < tail.length; index += 1) {
    current = join(current, tail[index]);
    let entry;
    try {
      entry = lstatSync(current);
    } catch (error) {
      // Missing: nothing from here down exists yet, so nothing below is a link.
      if (error && error.code === "ENOENT") break;
      throw error;
    }
    if (entry.isSymbolicLink()) return "symlink";
    const leaf = index === tail.length - 1;
    if (!leaf && !entry.isDirectory()) return "not-a-directory";
    if (leaf && !entry.isFile()) return "not-a-regular-file";
    if (leaf && entry.nlink > 1) return "hard-linked";
  }

  const path = tail.join("/");
  return patterns.some((pattern) => patternMatches(path, pattern)) ? "" : "no-pattern-match";
}

/** Drops C0, DEL, C1 and bidirectional controls, so a refusal prints as one inert line. */
function printable(text) {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) continue;
    if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) continue;
    out += char;
  }
  return out;
}

/**
 * The policy document THIS run reads — fixed when this script was RENDERED.
 *
 * There is exactly ONE candidate, `POLICY_FILE`: the copy emitted beside this
 * script in a vendor plugin container, or the repository's own at the climb
 * above this script. Emission chose which, so run time chooses nothing. No
 * environment variable and no second path enter the resolution, which is what
 * stops an `agent-tool-policies.json` that some workspace writer drops near
 * an installed guard from re-judging the next call from a policy set nobody
 * emitted.
 *
 * An ORDERED PAIR of candidates is what this replaced, and the order itself was
 * the defect. Inside a container the guard sits at `<root>/hooks/<name>` and the
 * repository climb resolved to the PARENT of the plugin root — a marketplace
 * clone, a client's plugin cache, a `--plugin-dir` project directory — so a file
 * in a user-writable directory outranked the container's own emitted copy. One
 * candidate per mode has no such rank to lose.
 *
 * The single path is probed with `lstatSync`, not `existsSync`: a SYMBOLIC LINK
 * named `agent-tool-policies.json` is content that some other path owns, and
 * following it would let a link swap the governing document while the directory
 * entry a reviewer reads never moves. A linked document is REFUSED as
 * `POLICY_INVALID` in BOTH modes — the repository's own document is a ledgered
 * regular file, so a link standing where it should be is as much a swap as one
 * in a container — which is the posture `src/hooks/userHooks.ts` already takes
 * for a linked hook script. A real-file document that is missing, oversized or
 * unparseable is refused by the checks below for the same reason: answering a
 * call from a policy set nobody selected is the one outcome worse than a
 * refusal.
 *
 * NO environment variable enters this. Reading one
 * (`CLAUDE_PLUGIN_ROOT`/`CURSOR_PLUGIN_ROOT`/`PLUGIN_ROOT`) let a value
 * belonging to some unrelated tool redirect a repository-mode guard at a
 * document nobody in this repository wrote, and it contradicted the header
 * above: the output is a function of the payload and the emitted document, and
 * an ambient variable is neither. The runner takes the same posture — see
 * `src/hooks/portableRunner.ts`, where an unexpanded root variable resolves the
 * script to its own sibling.
 */
function policyDocumentPath() {
  let entry;
  try {
    entry = lstatSync(POLICY_FILE);
  } catch {
    // Absent is not decided here: the size probe below reports
    // POLICY_UNREADABLE and names the one path this script was rendered for.
    return { path: POLICY_FILE, linked: false };
  }
  return { path: POLICY_FILE, linked: entry.isSymbolicLink() };
}

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
  const { path: policyFile, linked: policyLinked } = policyDocumentPath();

  try {
    if (tool === "") {
      return {
        ...subject,
        reasonCode: "UNKNOWN_TOOL",
        message: "The payload named no tool, so the call cannot be authorized.",
      };
    }
    // A linked document is not the emitted one: refused before it is read, so
    // no link decides what this call may do.
    if (policyLinked) {
      return {
        ...subject,
        reasonCode: "POLICY_INVALID",
        message: `Policy document ${policyFile} is a symbolic link, not the emitted file; nothing here authorizes this call.`,
      };
    }

    let size = -1;
    try {
      const stats = statSync(policyFile);
      if (stats.isFile()) size = stats.size;
    } catch {
      size = -1;
    }
    if (size < 0) {
      return {
        ...subject,
        reasonCode: "POLICY_UNREADABLE",
        message: `No readable policy document at ${policyFile}; nothing authorizes this call.`,
      };
    }
    // Sized before it is read: an unbounded document is refused on its size
    // alone rather than parsed to discover it was unreasonable.
    if (size > MAX_POLICY_BYTES) {
      return {
        ...subject,
        reasonCode: "POLICY_TOO_LARGE",
        message: `Policy document ${policyFile} is ${size} bytes, past the ${MAX_POLICY_BYTES} byte cap.`,
      };
    }

    const document = JSON.parse(readFileSync(policyFile, "utf8"));
    if (
      document === null ||
      typeof document !== "object" ||
      document.schema !== POLICY_SCHEMA ||
      !Array.isArray(document.policies)
    ) {
      return {
        ...subject,
        reasonCode: "POLICY_INVALID",
        message: `Policy document ${policyFile} does not declare schema "${POLICY_SCHEMA}".`,
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
    // A verdict role's one write: its own report, through the single-file Write
    // only, on a regular file under this repository matching its write paths.
    if (
      tool === WRITE_TOOL &&
      category === "edit" &&
      Array.isArray(policy.allow) &&
      !policy.allow.includes("edit") &&
      Array.isArray(policy.writePaths)
    ) {
      const patterns = policy.writePaths.filter(isWritePathPattern);
      if (patterns.length > 0) {
        const check = writePathCheck(payload, patterns);
        if (check === "") return null;
        const root = guardRoot();
        return {
          ...subject,
          category,
          reasonCode: "WRITE_PATH_DENIED",
          writeCheck: check,
          message: printable(
            `Agent "${agentId}" may write only its report — a regular file matching ${patterns.join(" or ")} under ${root === "" ? "the repository root" : root} — and this Write was refused (${check}). Return the full report inline instead.`,
          ),
        };
      }
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
