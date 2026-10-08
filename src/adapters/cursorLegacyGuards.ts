/**
 * A frozen copy of the Cursor guard builder as release 1.11.0 shipped it
 * (`v1.11.0:src/adapters/cursor.ts`, `buildSubagentGuardScript` and
 * `buildMcpGuardScript`, with the helpers and literals they read, and
 * `cliCallHint` from `v1.11.0:src/shared/cliCall.ts`), kept so the first
 * `sync` after an upgrade from 1.11.0 can prove the two guards 1.11.0 wrote at
 * their old names (REQ-FLOW-038): it re-renders them for the setup, and only
 * those exact bytes prove a delete there
 * (`../cli/engine/emissionWrite.ts::engineRenderingsFor`).
 *
 * The bytes depend on the setup: the spawn guard embeds every agent id the
 * setup could spawn, and both guards embed the pinned sync call built from the
 * package name, the version and the npm channel. So the copy takes the roster
 * and the package identity as input and fixes the version at 1.11.0.
 *
 * Every helper and literal is copied, never imported, so a later change to the
 * live builders cannot move these bytes. The copy never grows with a later
 * release. `test/adapters/cursorLegacyGuards.test.ts` holds it to the bytes the
 * published 1.11.0 package wrote. Edit nothing below the exports: a changed
 * byte stops the proof from recognising a real 1.11.0 guard.
 */

/** The release whose guards this module renders. */
export const CURSOR_1_11_0_VERSION = "1.11.0";

/** The ten agent ids 1.11.0 shipped (`v1.11.0:src/roster/agentPolicies.ts`, `RUNTIME_AGENT_IDS`). */
export const CURSOR_1_11_0_RUNTIME_AGENT_IDS: readonly string[] = Object.freeze([
  "stamity-researcher",
  "stamity-implementer",
  "stamity-reviewer",
  "stamity-fixer",
  "stamity-test-runner",
  "stamity-spec-author",
  "stamity-creator",
  "stamity-security",
  "stamity-design-quality",
  "stamity-performance",
]);

/** 1.11.0's guard paths (`v1.11.0:src/adapters/cursor.ts`, `CURSOR_GUARD_DIR` is `.cursor/hooks`). */
const SUBAGENT_GUARD_PATH = ".cursor/hooks/subagent-guard.mjs";
const MCP_GUARD_PATH = ".cursor/hooks/mcp-guard.mjs";

/**
 * The `.cursor/hooks.json` entry 1.11.0 rendered for each guard, by path, and
 * the event it sits under (`v1.11.0:src/adapters/cursor.ts`'s `buildHooksJson`;
 * `v1.11.0:test/emit/__snapshots__/crossClientGoldens.test.ts.snap`). It does not
 * depend on the setup in repository mode.
 */
export const CURSOR_1_11_0_GUARD_ENTRIES: ReadonlyMap<string, { readonly event: string; readonly entry: unknown }> = new Map<
  string,
  { readonly event: string; readonly entry: unknown }
>([
  [SUBAGENT_GUARD_PATH, Object.freeze({ event: "subagentStart", entry: Object.freeze({ command: `node ${SUBAGENT_GUARD_PATH}`, failClosed: true }) })],
  [MCP_GUARD_PATH, Object.freeze({ event: "beforeMCPExecution", entry: Object.freeze({ command: `node ${MCP_GUARD_PATH}`, failClosed: true }) })],
]);

/** What the copy renders for: the setup's roster and the running installation's package identity. */
export interface CursorGuardSetup {
  /** Every agent id the setup could spawn: the ten 1.11.0 shipped plus each Cursor agent the ledger records. */
  readonly agentIds: readonly string[];
  /** The package name the pinned sync call names. */
  readonly packageName: string;
  /** `false` for a package with no npm channel (`npx --no`); `-y` otherwise. */
  readonly npmChannel?: boolean;
}

/**
 * The two guards 1.11.0 rendered for `setup`, by path. Throws as 1.11.0's
 * `cliCallHint` did on a package name that is not a runnable npm name.
 */
export function render1110CursorGuards(setup: CursorGuardSetup): ReadonlyMap<string, string> {
  const cli: CliCallContext = {
    packageName: setup.packageName,
    version: CURSOR_1_11_0_VERSION,
    ...(setup.npmChannel === undefined ? {} : { npmChannel: setup.npmChannel }),
  };
  return new Map([
    [SUBAGENT_GUARD_PATH, buildSubagentGuardScript(setup.agentIds, cli)],
    [MCP_GUARD_PATH, buildMcpGuardScript(cli)],
  ]);
}

// ── 1.11.0's literals, copied ────────────────────────────────────

/** `v1.11.0:src/types/markers.ts`. */
const GENERATED_SCRIPT_LINT_DIRECTIVE = "/* eslint-disable */";
const CONTENT_PREFIX = "stamity-";

/** `v1.11.0:src/adapters/cursor.ts`. */
const MCP_TOOL_PREFIX = "mcp__";

// ── 1.11.0's pinned CLI call (`v1.11.0:src/shared/cliCall.ts`) ──

interface CliCallContext {
  readonly packageName: string;
  readonly version: string;
  readonly npmChannel?: boolean;
}

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;

function pinnedCliCall(cli: CliCallContext, verb: string): string {
  if (!PACKAGE_NAME.test(cli.packageName)) {
    throw new Error(`Cannot render the pinned CLI call: ${JSON.stringify(cli.packageName)} is not a runnable npm package name.`);
  }
  return `npx ${cli.npmChannel === false ? "--no" : "-y"} ${cli.packageName}@${cli.version} ${verb}`;
}

function cliCallHint(packageName: string, version: string, verb: string, opts: CliCallContext): string {
  return `\`stamity ${verb}\` where the CLI is installed, else \`${pinnedCliCall({ ...opts, packageName, version }, verb)}\``;
}

// ── 1.11.0's guard builders, copied ──────────────────────────────

function guardHeader(summary: readonly string[]): string {
  return [
    "#!/usr/bin/env node",
    GENERATED_SCRIPT_LINT_DIRECTIVE,
    ...summary.map((line) => (line === "" ? "//" : `// ${line}`)),
    "//",
    "// Generated file — regenerate it rather than editing; local edits are overwritten.",
    "// Trust posture: exec form, repo-committed, no dynamic evaluation, no network",
    "// reach, and output determined by repo state alone.",
  ].join("\n");
}

const REASON_HELPER = `function reasonOf(err) {
  if (err === null || err === undefined) return "unknown error";
  const message = typeof err === "object" && typeof err.message === "string" ? err.message : String(err);
  const code = typeof err === "object" && typeof err.code === "string" ? err.code + ": " : "";
  return code + message;
}`;

const READ_PAYLOAD = `function readPayload() {
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
}`;

const NOTICE_HELPER = `function notice(hook, event) {
  process.stderr.write(JSON.stringify({ hook, ...event }) + "\\n");
}`;

const DENY_HELPER = `function deny(hook, event, userMessage) {
  notice(hook, event);
  process.stdout.write(JSON.stringify({ permission: "deny", user_message: userMessage }));
}`;

const ALLOW_HELPER = `function allow() {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
}`;

function buildSubagentGuardScript(roster: readonly string[], cli: CliCallContext): string {
  const ids = [...new Set(roster)].toSorted();
  return `${guardHeader([
    "stamity — sub-agent spawn guard.",
    "",
    "Denies a spawn whose agent id carries the generated-content prefix but is",
    "not on the shipped roster. Ids outside that prefix are not this setup's to",
    "police and pass through. Wired to the spawn event with failClosed: true, so",
    "a crash or a timeout denies rather than waving the spawn through.",
    "",
    "A payload that cannot be read names no agent, so it is not a crash and not",
    "a refusal: the spawn proceeds and the reason is written to stderr, because",
    "an allowlist that quietly stops matching is worse than one that says so.",
  ])}

import { readFileSync } from "node:fs";

const NAMESPACE = ${JSON.stringify(CONTENT_PREFIX)};
const ROSTER = new Set(${JSON.stringify(ids, null, 2)});
const SYNC_CALL = ${JSON.stringify(cliCallHint(cli.packageName, cli.version, "sync", cli))};

${REASON_HELPER}

${READ_PAYLOAD}

${NOTICE_HELPER}

${DENY_HELPER}

${ALLOW_HELPER}

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
      "Re-run " + SYNC_CALL + " if the roster changed, or spawn one of: " +
      [...ROSTER].join(", ") +
      ".",
  );
} else {
  // Out of scope, or rostered. The spawn proceeds and the verdict says so.
  allow();
}
`;
}

function buildMcpGuardScript(cli: CliCallContext): string {
  return `${guardHeader([
    "stamity — MCP server allowlist guard.",
    "",
    "Denies a pending MCP call whose server is absent from the resolved",
    ".cursor/mcp.json set (this project's file plus the operator's user-level",
    "one). Deny-by-default: no configured server means nothing to match, so",
    "every mcp__ call is refused and the message says why.",
    "",
    "A manifest that exists but does not parse is reported as its own refusal,",
    "naming the path and the parser message — not folded into the absent case.",
    "To stop the guard, change the selection — the refusals below name the two",
    "calls, adding a server and then re-syncing — or deselect this client;",
    "editing .cursor/hooks.json does not stick.",
  ])}

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// This script sits at ${MCP_GUARD_PATH}; the project manifest is its sibling
// one level up, and the operator's own file lives under the home directory.
const MANIFESTS = [join(HERE, "..", "mcp.json"), join(homedir(), ".cursor", "mcp.json")];
const TOOL_PREFIX = ${JSON.stringify(MCP_TOOL_PREFIX)};
const SYNC_CALL = ${JSON.stringify(cliCallHint(cli.packageName, cli.version, "sync", cli))};
const MCP_ADD_CALL = ${JSON.stringify(cliCallHint(cli.packageName, cli.version, "config mcp add <id>", cli))};

${REASON_HELPER}

${READ_PAYLOAD}

${NOTICE_HELPER}

${DENY_HELPER}

${ALLOW_HELPER}

function normalize(value) {
  return String(value).replace(/\\s+/g, " ").trim();
}

// Every spelling of a configured server: its name, a remote URL, and the full
// stdio command line — the payload supplies whichever the call was made with.
// \`faults\` collects manifests that exist and could not be used; a manifest that
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
      ", then re-run " +
      SYNC_CALL +
      ".",
  );
} else if (allowed.size === 0) {
  deny(
    HOOK,
    { reasonCode: "NO_MCP_SERVERS_CONFIGURED", ...event },
    "Blocked every MCP call: this setup configured no MCP servers, so there is " +
      "no allowlist to match against. Add one with " +
      MCP_ADD_CALL +
      " and re-run " +
      SYNC_CALL +
      ".",
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
      MCP_ADD_CALL +
      " and re-run " +
      SYNC_CALL +
      ".",
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
`;
}
