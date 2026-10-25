import { createHash } from "node:crypto";
import { chmod, lstat, readFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  INJECTION_PATTERNS,
  NO_HONEST_SHAPE_INJECTION_ROWS,
  scanForDeniedPatterns,
  scanNormalized,
  type DenyHit,
} from "../denyscan/denyScan.ts";
import { atomicWriteFile, isSharedRegularFile } from "../merge/atomicWrite.ts";
import type { CoOwnedReduction } from "../types/content.ts";
import { TOOLS, type Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import type { CoOwnership, LedgerEntry } from "../types/manifest.ts";
import {
  REVIEW_GATE_LOCK_SUFFIX,
  REVIEW_GATE_STATE_FILE,
  REVIEW_GATE_TEMP_INFIX,
  STATE_DIR,
} from "../types/markers.ts";
import { resolveServerMeta, type PackSuppliedServer } from "./catalog.ts";
import { maskValue, scanValueForSecrets } from "./secretScan.ts";

/**
 * `.env.mcp`: the one place an MCP credential is allowed to exist as a literal.
 *
 * Client configs carry `${env:VAR}` references and are committed; the values
 * those references resolve to live here, in a gitignored file the operator's
 * shell loads before the client starts. This module owns that file end to end —
 * which variables the current server selection needs, rendering them without
 * destroying what is already filled in, reading the result back, and keeping the
 * ignore rule in place so the file cannot be committed by a stray `git add .`.
 *
 * Two guards run at the render boundary. Interpolated help text is stripped of
 * `\r`, `\n`, and `=` so a row — curated or pack-supplied, and pack supply is
 * third-party text — cannot smuggle an extra assignment into a file the
 * operator then sources into their shell. Values are stripped of newlines for
 * the same reason. The file itself is created at mode 0600, so a shared host
 * does not hand every other user the tokens.
 *
 * Updating never rewrites: an existing file is preserved byte for byte and
 * missing variables are appended. A value filled in for a server that was later
 * deselected is the operator's, not ours, and stays.
 *
 * ## Both file lanes preserve and republish, so both are gated
 *
 * `.env.mcp` and `.gitignore` are read, extended, and written back — the
 * preserve-and-republish shape `../merge/safeWrite.ts::refusePreservedContent`
 * exists for, on files that module never sees. Reading them followed a planted
 * link and the republish landed the target's bytes at a TRACKED repo path as a
 * regular file: one flagless `init` over a clone shipping
 * `.gitignore -> ~/.ssh/id_ed25519` (git stores symlinks natively, mode 120000)
 * materialised the key where the next `git add -A` picks it up. Neither lane
 * deny-scanned what it kept, either, and neither declared the tree its bytes
 * belong to. {@link refuseRepublish} is the single gate both now pass through,
 * and both writes now carry `boundaryDir`.
 *
 * The credential file's mode is a property of the FILE, not of whether this run
 * wrote to it: {@link hardenEnvMcpMode} runs on every {@link ensureEnvMcp} call,
 * including the ones that write nothing.
 */

// ── Types ────────────────────────────────────────────────────────

/** One variable the current selection requires, with the help rendered beside it. */
export interface EnvVar {
  /** Variable name as it appears in the file. */
  name: string;
  /**
   * Every selected server that requires this variable, comma-joined in
   * selection order. The `comment` and `url` come from the first of them.
   */
  server: string;
  /** One line telling the operator what to create and at what scope. */
  comment: string;
  /** Where the credential is issued. Empty when the catalog row has none. */
  url: string;
}

/**
 * Shells the sourcing guidance knows how to lead with. `posix` covers bash/zsh
 * on macOS and Linux, `git-bash` is the same command on Windows, `powershell`
 * is Windows PowerShell / pwsh. `auto` resolves from the runtime; `all` asks
 * for every block unconditionally, so a note written on one machine stays
 * useful when read on another. `cmd.exe` is absent on purpose — it has no
 * one-line equivalent, and the guidance says so rather than pretending.
 */
export type EnvMcpShell = "posix" | "powershell" | "git-bash" | "auto" | "all";

type ConcreteShell = Exclude<EnvMcpShell, "auto" | "all">;

/** {@link ensureEnvMcp} outcome. Values never appear here — only names. */
export interface EnsureResult {
  /** Path written or inspected, mirroring the `rootDir` given. */
  path: string;
  /** Whether this call created the file. False when it already existed, or when nothing was required. */
  created: boolean;
  /** Variables this call added, in render order. */
  addedVars: string[];
  /** Variables already in the file, whose values this call left untouched. */
  preservedVars: string[];
}

/** {@link reportEnvValues} row. Carries a masked rendering, never the value. */
export interface EnvValueReport {
  name: string;
  /** True when the file holds a non-blank value for this name. */
  set: boolean;
  /** Masked rendering for display. Empty string when unset. */
  masked: string;
  /** Secret-shape patterns the value matched, most specific first. */
  secretPatternIds: string[];
}

// ── Constants ────────────────────────────────────────────────────

/** Credential file name, relative to the repo root. */
export const ENV_MCP_FILE = ".env.mcp";

/** The repository's own ignore file, at the root: the one line-oriented document the engine co-owns. */
export const GITIGNORE_FILE = ".gitignore";

/**
 * Owner read/write only: the file holds live tokens. Applied to the temp file
 * at creation and carried through the rename, so there is no window in which
 * the credentials exist world-readable — and an already-loose `.env.mcp` is
 * tightened by being replaced.
 */
const SECRET_FILE_MODE = 0o600;

/**
 * Group and other permission bits — everything past owner-only. A destination
 * carrying any of them is one {@link hardenEnvMcpMode} tightens.
 */
const LOOSE_MODE_BITS = 0o077;

const FILE_HEADER = [
  "# MCP server credentials — one value per name below.",
  "# Gitignored by design: never commit this file, and never inline a value into a client config.",
];

const APPEND_HEADER = "# --- appended: variables the current server selection requires ---";

const SOURCE_POSIX = "set -a && source .env.mcp && set +a";

const SOURCE_POWERSHELL =
  "Get-Content .env.mcp | ForEach-Object { if ($_ -match '^\\s*([^#][^=]*)=(.*)$') " +
  "{ [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim().Trim('\"'), 'Process') } }";

const SHELL_BLOCKS: Record<ConcreteShell, readonly string[]> = {
  posix: ["macOS/Linux (bash/zsh):", `  ${SOURCE_POSIX}`],
  "git-bash": ["Windows (Git Bash) — same command as macOS/Linux:", `  ${SOURCE_POSIX}`],
  powershell: ["Windows (PowerShell):", `  ${SOURCE_POWERSHELL}`],
};

const SHELL_ORDER: readonly ConcreteShell[] = ["posix", "git-bash", "powershell"];

const CMD_EXE_NOTE = "cmd.exe has no one-line equivalent — use PowerShell or Git Bash.";

const DISCLAIMER_LEAD =
  "Load .env.mcp into your environment before starting the tool that runs the MCP servers.";

const GUI_LAUNCH_NOTE = [
  "An app started from Finder, the Dock, Spotlight, or the Start menu inherits the desktop",
  "session environment, not the shell you sourced in. Either start the tool from that same",
  "terminal, or persist the values for the session: `launchctl setenv NAME \"$NAME\"` on macOS,",
  "`setx NAME value` on Windows.",
].join("\n");

const CLI_TOOL_NOTE =
  "spawns MCP servers as child processes, so they inherit the environment of the shell you start it in — source this file there.";

const EDITOR_TOOL_NOTE =
  "passes its own environment to each MCP server, so start the editor from the shell you sourced in (see the launch note above).";

/** Per-tool secret-loading note, keyed by tool so the guidance stays a table rather than a branch. */
const TOOL_ENV_NOTES: Record<Tool, string> = {
  claude: CLI_TOOL_NOTE,
  codex: CLI_TOOL_NOTE,
  cursor: EDITOR_TOOL_NOTE,
  copilot: EDITOR_TOOL_NOTE,
};

/**
 * The hooks canary (REQ-FLOW-101): the person-only shell guard writes
 * `{ "at": <ISO time> }` here when the command it guards is the pre-flight, and
 * the pre-flight refuses unless the file is fresh. Machine-local: a committed or
 * copied canary would vouch for hooks that never ran in that checkout.
 */
export const PREFLIGHT_CANARY_FILE = `${STATE_DIR}/preflight-canary.json`;

/** The canary's oldest accepted age: the guard writes it as the pre-flight command starts, so one process spans it. */
export const CANARY_MAX_AGE_MS = 120_000;

/** The run-ended marker's window (pr/41): 15 minutes, since the final round is person-paced, several question calls. */
export const RUN_ENDED_MAX_AGE_MS = 900_000;

/**
 * The run-ended marker (REQ-FLOW-090, pr/17, pr/36, pr/37): `stamity run end
 * --final-round` writes `{ "run": "<run-id>", "at": "<ISO time>" }` here at the
 * run's final exit, a plain `run end` and `stamity run start` delete it; the
 * unattended ask gate lets Claude Code's final question round through only on
 * the branch of the closed run this names, and only within
 * {@link RUN_ENDED_MAX_AGE_MS} after `at`. Machine-local: a fresh clone or another checkout
 * never holds it, so a closed record carried there exempts nothing.
 */
export const RUN_ENDED_MARKER_FILE = `${STATE_DIR}/run-ended.json`;

/**
 * Cursor's context-once markers (REQ-FLOW-115): the hook writes one empty file
 * here per conversation, named by the SHA-256 of its id, so the session index is
 * printed once. Machine-local: a marker committed or copied into another checkout
 * would silence the index for a conversation that never saw it there.
 */
export const CONTEXT_ONCE_DIR = `${STATE_DIR}/context-once`;

/** The `.gitignore` line for {@link CONTEXT_ONCE_DIR}: the folder, with git's trailing slash. */
export const CONTEXT_ONCE_GITIGNORE_ENTRY = `${CONTEXT_ONCE_DIR}/`;

/**
 * The account's client model lists (REQ-LADDER-009): `init` and `sync` keep
 * what each client's CLI listed here, never in the committed manifest.
 * Machine-local: the list is one account's, and a copy committed or carried
 * into another checkout would steer every teammate's model pick by it.
 */
export const CLIENT_MODELS_CACHE_FILE = `${STATE_DIR}/client-models.json`;

/**
 * Paths this engine writes that must never reach a commit: the credential
 * file, and the review gate's runtime state — its counter, the lock directory
 * beside it, and the temp files its publish renames over the counter. The gate
 * writes those three on every review round; a counter that was committed would
 * carry one worktree's rounds into every checkout of the branch.
 *
 * Machine-local state written by other modules registers here too, so a single
 * scan covers every ignore rule the engine depends on. Which of them a setup
 * needs is {@link GITIGNORE_ENTRY_WHEN}'s answer ({@link requiredGitignoreEntries}),
 * and `init`, `sync` and `config mcp` put exactly those in place through
 * {@link reconcileGitignore}, recording each line they append on the
 * `.gitignore` ledger row (`coOwned.lines`, REQ-FLOW-016) so `clean` can take
 * back exactly those. This list is also the bound on that record: the manifest
 * validator refuses a recorded line outside it, and the reducer re-checks it
 * ({@link reduceGitignoreToForeignContent}).
 */
export const REQUIRED_GITIGNORE_ENTRIES: readonly string[] = [
  ENV_MCP_FILE,
  REVIEW_GATE_STATE_FILE,
  REVIEW_GATE_STATE_FILE + REVIEW_GATE_LOCK_SUFFIX,
  `${REVIEW_GATE_STATE_FILE}${REVIEW_GATE_TEMP_INFIX}*`,
  PREFLIGHT_CANARY_FILE,
  RUN_ENDED_MARKER_FILE,
  CONTEXT_ONCE_GITIGNORE_ENTRY,
  CLIENT_MODELS_CACHE_FILE,
];

/** What {@link GITIGNORE_ENTRY_WHEN} reads of a setup. */
export interface GitignoreSetup {
  /** The clients set up. */
  tools: readonly Tool[];
  /** Whether a selected MCP server, curated or pack-supplied, needs a credential in `.env.mcp`. */
  envVarsRequired: boolean;
}

/** Any client set up: the writer of the entry's target serves every client. */
const anyClient = (setup: GitignoreSetup): boolean => setup.tools.length > 0;

/**
 * When a setup needs each of {@link REQUIRED_GITIGNORE_ENTRIES} (decision E1,
 * REQ-FLOW-016). Fixed, not derived: the credential file's line only when a
 * selected server needs a credential, and each of the other seven whenever any
 * client is set up, because each of their writers serves every client — the
 * review gate's state is written by the hidden `gate` verb for any client, the
 * canary and the run-ended marker by the guard and `run`, the context-once
 * markers by the shared hook scripts, the model cache by `init` and `sync`.
 * `test/mcp/env.test.ts` holds the census of those writers and these keys equal
 * to the list, so a new entry or writer meets this table first.
 */
export const GITIGNORE_ENTRY_WHEN: Readonly<Record<string, (setup: GitignoreSetup) => boolean>> = Object.freeze({
  [ENV_MCP_FILE]: (setup: GitignoreSetup) => setup.envVarsRequired,
  [REVIEW_GATE_STATE_FILE]: anyClient,
  [REVIEW_GATE_STATE_FILE + REVIEW_GATE_LOCK_SUFFIX]: anyClient,
  [`${REVIEW_GATE_STATE_FILE}${REVIEW_GATE_TEMP_INFIX}*`]: anyClient,
  [PREFLIGHT_CANARY_FILE]: anyClient,
  [RUN_ENDED_MARKER_FILE]: anyClient,
  [CONTEXT_ONCE_GITIGNORE_ENTRY]: anyClient,
  [CLIENT_MODELS_CACHE_FILE]: anyClient,
});

/**
 * Rules that ignore every file in the state directory at once: the directory
 * in each spelling git reads as covering its contents. Rooted and unrooted
 * forms both count, because the `.gitignore` this lane edits is the one at the
 * repository root.
 */
const STATE_DIR_DOMINATORS: readonly string[] = [
  STATE_DIR,
  `**/${STATE_DIR}/`,
  `${STATE_DIR}/`,
  `/${STATE_DIR}/`,
  `${STATE_DIR}/*`,
  `/${STATE_DIR}/*`,
  `${STATE_DIR}/**`,
  `/${STATE_DIR}/**`,
];

/**
 * Rules that ignore every review-gate entry at once: the state directory's
 * spellings, and the state file's own name as a prefix pattern.
 */
const REVIEW_GATE_DOMINATORS: readonly string[] = [
  ...STATE_DIR_DOMINATORS,
  `${REVIEW_GATE_STATE_FILE}*`,
  `/${REVIEW_GATE_STATE_FILE}*`,
];

/**
 * Existing patterns that already ignore an entry. Appending our literal beside
 * one of these would add a redundant rule to a file the operator maintains.
 * Each review-gate entry, the canary, the marker, the context-once folder and
 * the model list cache is also dominated by its own root-anchored twin
 * (`/.stamity/review-gate.json` — the spelling a hand-written rule usually
 * takes). The canary, the run-ended marker, the context-once folder and the
 * model list cache take the state directory's spellings only: a
 * `review-gate.json*` prefix covers none of them, and a file git does not
 * ignore could be committed.
 */
const DOMINATING_PATTERNS: Record<string, readonly string[]> = {
  [ENV_MCP_FILE]: [".env.*", ".env*", "*.mcp"],
  ...Object.fromEntries(
    REQUIRED_GITIGNORE_ENTRIES.filter((entry) => entry !== ENV_MCP_FILE).map((entry) => [
      entry,
      [
        `/${entry}`,
        ...(entry === PREFLIGHT_CANARY_FILE ||
        entry === RUN_ENDED_MARKER_FILE ||
        entry === CONTEXT_ONCE_GITIGNORE_ENTRY ||
        entry === CLIENT_MODELS_CACHE_FILE
          ? STATE_DIR_DOMINATORS
          : REVIEW_GATE_DOMINATORS),
      ],
    ]),
  ),
};

// ── Collection ───────────────────────────────────────────────────

/**
 * Variables the given servers require, one entry per name in first-seen order.
 * Two servers needing the same variable produce a single entry: the first one's
 * help text, with both ids recorded on `server`.
 *
 * Unknown ids contribute nothing and never throw — partitioning a stale
 * selection into known and unknown is `validateServerIds`'s job, and this
 * function runs after it.
 *
 * `packServers` resolves through the same seam emission uses (`./catalog.ts` →
 * `resolveServerMeta`), so a pack-supplied server's credentials reach this
 * file, `.env.mcp`, and the sourcing disclosure exactly as a curated one's do.
 * Provisioning is not optional polish for pack supply: a server whose
 * credentials are never collected starts and fails to authenticate, which is
 * inert in a different way than a refused one and just as broken. Omitted, the
 * answer is curated-only.
 */
export function collectRequiredEnvVars(
  serverIds: readonly string[],
  packServers: readonly PackSuppliedServer[] = [],
): EnvVar[] {
  const byName = new Map<string, { comment: string; url: string; servers: string[] }>();

  for (const id of serverIds) {
    const requirements = resolveServerMeta(id, packServers)?.requiresEnv;
    if (requirements === undefined) continue;

    for (const requirement of requirements) {
      const known = byName.get(requirement.name);
      if (known === undefined) {
        byName.set(requirement.name, {
          comment: requirement.comment,
          url: requirement.url,
          servers: [id],
        });
      } else if (!known.servers.includes(id)) {
        known.servers.push(id);
      }
    }
  }

  return [...byName].map(([name, { comment, url, servers }]) => ({
    name,
    server: servers.join(", "),
    comment,
    url,
  }));
}

// ── Sourcing guidance ────────────────────────────────────────────

/**
 * The one command to run in `shell`. `auto` and `all` both resolve from the
 * runtime: there is no single line that works in every shell, so a request for
 * one command answers for the shell we are in. The multi-shell listing is
 * {@link getSourceEnvMcpDisclaimer}'s job.
 */
export function getSourceEnvMcpCommand(shell: EnvMcpShell = "auto"): string {
  return resolveShell(shell) === "powershell" ? SOURCE_POWERSHELL : SOURCE_POSIX;
}

/**
 * Plain-text guidance for loading the file: the command for `shell` first, the
 * other shells after it, the GUI-launch caveat, and one note per requested tool
 * describing how that tool hands the environment to an MCP server.
 *
 * Tool notes emit in a fixed order regardless of the caller's, so the same
 * selection always produces the same text. No colour, no control characters —
 * the caller decides how to present it.
 */
export function getSourceEnvMcpDisclaimer(shell: EnvMcpShell, tools: readonly Tool[]): string {
  const requested = tools.length === 0 ? [] : TOOLS.filter((tool) => tools.includes(tool));
  const blocks = [DISCLAIMER_LEAD, [...shellLines(shell), CMD_EXE_NOTE].join("\n"), GUI_LAUNCH_NOTE];
  if (requested.length > 0) {
    blocks.push(requested.map((tool) => `${tool}: ${TOOL_ENV_NOTES[tool]}`).join("\n"));
  }
  return blocks.join("\n\n");
}

/** Every shell block, leading with the requested one. `all` keeps the declaration order. */
function shellLines(shell: EnvMcpShell): string[] {
  const lead = shell === "all" ? undefined : resolveShell(shell);
  const order =
    lead === undefined ? SHELL_ORDER : [lead, ...SHELL_ORDER.filter((name) => name !== lead)];
  return order.flatMap((name) => SHELL_BLOCKS[name]);
}

/**
 * Concrete shell for a request. PowerShell advertises itself through
 * `PSModulePath`; a Windows process without it is assumed to be under Git Bash,
 * which takes the POSIX command. `cmd.exe` is never detected because it is
 * never a supported answer.
 */
function resolveShell(shell: EnvMcpShell): ConcreteShell {
  if (shell !== "auto" && shell !== "all") return shell;
  if (process.platform !== "win32") return "posix";
  return (process.env["PSModulePath"] ?? "") === "" ? "git-bash" : "powershell";
}

// ── Rendering ────────────────────────────────────────────────────

/**
 * Full file contents for `vars`, carrying over any `existing` value. Empty
 * string when nothing is required, which is the signal not to write a file at
 * all rather than to leave an empty one behind.
 */
export function generateEnvMcpContent(
  vars: readonly EnvVar[],
  existing: Record<string, string> = {},
): string {
  if (vars.length === 0) return "";
  const entries = vars.map((envVar) => renderEntry(envVar, existing[envVar.name] ?? "", "\n"));
  return `${FILE_HEADER.join("\n")}\n\n${entries.join("\n\n")}\n`;
}

function renderEntry(envVar: EnvVar, value: string, eol: string): string {
  return `${commentLine(envVar)}${eol}${envVar.name}=${renderValue(value)}`;
}

/** Help, requiring servers, and issue URL on one line — whatever those fields contain. */
function commentLine(envVar: EnvVar): string {
  const parts = [sanitize(envVar.comment)];
  const servers = sanitize(envVar.server);
  if (servers !== "") parts.push(`(required by ${servers})`);
  const url = sanitize(envVar.url);
  if (url !== "") parts.push(`— ${url}`);
  return `# ${parts.filter((part) => part !== "").join(" ")}`;
}

/**
 * Comment-injection guard. `\r` and `\n` would break the text out of its
 * comment line; `=` would turn what follows into an assignment the operator's
 * shell then executes on source. Each becomes a space, which collapses an
 * injected line back into the comment it belongs to. Lossy on purpose: the
 * mangled text is visible in the rendered file, so the damage is legible.
 */
function sanitize(value: string): string {
  return value.replace(/[\r\n=]/g, " ").trim();
}

/**
 * A value as it appears to the right of `=`. Newlines are collapsed for the
 * same reason help text is: a value spanning lines would inject an assignment.
 * Anything outside the unquoted-safe set is double-quoted with shell escaping,
 * which {@link parseEnvFile} reverses exactly.
 */
function renderValue(value: string): string {
  const flat = value.replace(/[\r\n]+/g, " ");
  if (/^[A-Za-z0-9_@%+,.:/=-]*$/.test(flat)) return flat;
  return `"${flat.replace(/[\\"$`]/g, (char) => `\\${char}`)}"`;
}

// ── Parsing ──────────────────────────────────────────────────────

/**
 * Read a `KEY=VALUE` file into a map. Comments, blank lines, and an `export`
 * prefix are ignored; the split is on the first `=` only, so a value may carry
 * its own. Quoted values are unwrapped — double quotes also reverse the shell
 * escaping {@link generateEnvMcpContent} applies, single quotes are literal.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const assignment = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separator = assignment.indexOf("=");
    if (separator < 1) continue;

    result[assignment.slice(0, separator).trim()] = unquote(assignment.slice(separator + 1).trim());
  }

  return result;
}

function unquote(raw: string): string {
  if (raw.length < 2) return raw;
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\([\\"$`])/g, "$1");
  }
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1);
  return raw;
}

// ── Reporting ────────────────────────────────────────────────────

/**
 * Display-safe view of the values in an env file: whether each name is filled
 * in, a masked rendering, and any secret shape the value matches. The raw value
 * never leaves this function — a surface that prints what the file holds prints
 * `masked`, so a token cannot reach a terminal transcript or a CI log.
 */
export function reportEnvValues(values: Record<string, string>): EnvValueReport[] {
  return Object.entries(values).map(([name, value]) => {
    const set = value.trim() !== "";
    return {
      name,
      set,
      masked: set ? maskValue(value) : "",
      secretPatternIds: scanValueForSecrets(name, value).map((finding) => finding.patternId),
    };
  });
}

// ── Write gate ───────────────────────────────────────────────────

/**
 * Refuse a write that would republish `path`'s CURRENT bytes beside our own.
 *
 * Both file lanes below read a file, keep every byte of it, and write the
 * result back — which is exactly the shape
 * `../merge/safeWrite.ts::refusePreservedContent` gates for the managed-merge
 * lane, on the same three conditions and in the same order:
 *
 * 1. **A symbolic link.** The bytes belong to whatever the link points at, and
 *    republishing them writes that file's contents into this tree as a regular
 *    file at a name git already tracks. Refused first, before anything scans —
 *    a deny refusal quotes what it read, so scanning link-read bytes would print
 *    a file outside the tree into the console one step short of disk.
 * 2. **A hard link.** The same plant with no symlink bit to test for; the tell
 *    is `nlink`, read through the one substrate predicate
 *    (`../merge/atomicWrite.ts::isSharedRegularFile`) rather than a second
 *    spelling of `nlink > 1`. Posture: refuse, do not warn.
 * 3. **A block-severity injection pattern** in what would be kept — for the
 *    lanes where that question means something. See `refuseInjectionPatterns`.
 *
 * The predicate is shared and the wording is local, which is the same split
 * `../manifest/mcpFilter.ts::refuseLinkedMcpTarget` makes at the other site
 * outside the merge module with this shape. `merge/safeWrite.ts` owns the merge
 * lane's refusal text and sits a layer above this one, so importing it would
 * invert the import graph the architecture gate ratchets.
 *
 * `refuseInjectionPatterns: false` keeps conditions 1 and 2 and drops 3, which
 * `.env.mcp` needs and only `.env.mcp` gets. The write-path deny set carries
 * `inline-secret-assignment`, whose whole job is to catch a literal credential
 * sitting in generated content — and `.env.mcp` is the one file in the repo
 * where a literal credential is the point (module header). A scan that refuses
 * it refuses the file's own purpose: `GITHUB_PAT=ghp_…` is not an injection
 * there, it is the payload the operator was asked for. The scan is what changes,
 * not the containment: conditions 1 and 2 are what stop that file's bytes from
 * being someone else's, and they still apply.
 *
 * An absent file has nothing to preserve and passes. So does a directory or a
 * device at the name: those are not a republish, and the write itself fails on
 * its own terms with the errno that describes them.
 */
async function refuseRepublish(
  path: string,
  content: string,
  opts: { refuseInjectionPatterns: boolean },
): Promise<void> {
  let entry;
  try {
    entry = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  // Order is load-bearing in both directions: a refusal message quotes what it
  // scanned, so deny-scanning link-read bytes would print a file outside the
  // tree to the console — the same leak one step short of disk. And a link whose
  // target happens to be clean must still refuse.
  if (entry.isSymbolicLink()) throw refuseRepublishOfLink(path);
  if (!entry.isFile()) return;
  if (isSharedRegularFile(entry)) throw refuseRepublishOfSharedFile(path);
  if (!opts.refuseInjectionPatterns) return;

  const hits = blockingDenyHits(content);
  if (hits.length === 0) return;
  const findings = hits
    .map((hit) => `${hit.patternId} at offset ${hit.index} (${JSON.stringify(hit.snippet)})`)
    .join("; ");
  throw new EngineError(
    `Refusing to write ${path}: ${hits.length} prompt-injection pattern(s) found in the content ` +
      `this write would preserve: ${findings}. Remove or rewrite the flagged text, then re-run.`,
    { code: "INTEGRITY_ERROR" },
  );
}

/**
 * Block-severity findings in text this module is about to write back.
 *
 * `scanNormalized` is the documented seam for a gate reading untrusted text: it
 * unions the raw scan with the invisible-stripped, confusable-folded,
 * mask-joined copy, so neither a lookalike spelling nor a zero-width splitter
 * evades a keyword row, and neither does a trailing combining mark that NFKC
 * would compose away. The second pass adds the rows that must be scored on
 * UNTOUCHED text: the strip class deliberately keeps the Unicode tag block so
 * `unicode-tag-smuggling` can refuse it, and normalizing first would launder
 * exactly that. The rest of `INJECTION_PATTERNS` stays out — those rows have
 * honest authoring shapes and refusing a write over one would cost this gate its
 * credibility.
 *
 * Warn-severity hits are diagnostics for other gates and never refuse a write.
 */
function blockingDenyHits(content: string): DenyHit[] {
  return [
    ...scanNormalized(content),
    ...scanForDeniedPatterns(content, INJECTION_PATTERNS).filter((hit) =>
      NO_HONEST_SHAPE_INJECTION_ROWS.has(hit.patternId),
    ),
  ].filter((hit) => hit.severity === "block");
}

/** Symlink half of {@link refuseRepublish} — the register the substrate's own
 *  link refusals are written in, stated for the lane that is republishing. */
function refuseRepublishOfLink(path: string): EngineError {
  return new EngineError(
    `Refusing to write ${path}: it is a symbolic link, so the bytes this write would keep are ` +
      `not this file's — they are whatever the link points at, including a file outside this ` +
      `tree that was never yours to publish. Writing them back would land those contents at a ` +
      `tracked path as a regular file, where the next commit picks them up. Nothing was written. ` +
      `Replace the link with a regular file (for a file this setup does not generate, such as ` +
      `.gitignore, restore your own copy).`,
    { code: "FS_ERROR" },
  );
}

/** Hard-link twin of {@link refuseRepublishOfLink} — same lane, same register,
 *  the shape `isSymbolicLink()` cannot see. Posture: refuse, not warn. */
function refuseRepublishOfSharedFile(path: string): EngineError {
  return new EngineError(
    `Refusing to write ${path}: it is a hard link — this file shares its contents with another ` +
      `name, which this tree cannot see and which may sit outside it, so the bytes this write ` +
      `would keep are not this file's alone. Writing them back publishes them as a fresh ` +
      `independent file, so this name stops being the same file as the other one and starts ` +
      `being a copy of it. Nothing was written. Replace it with a regular file — copy the ` +
      `contents to a new file and move that over this name — and re-run.`,
    { code: "FS_ERROR" },
  );
}

/**
 * Tighten `path` to owner-only when it is a regular file carrying any group or
 * other bit, and report whether that changed anything.
 *
 * Unconditional at both call sites, which is the whole point: each of them used
 * to reach its `chmod` only from inside a branch a live run does not take — the
 * writer's missing-variable branch here, the migration carry's copy branch in
 * `../migration/carry.ts` — so a `.env.mcp` an operator created by hand (0644
 * under the usual umask) stayed readable by every other account on the host
 * through every run that had nothing to add to it. The bits are a fact about the
 * file, not about whether this run wrote to it.
 *
 * `lstat`, not `stat`: a symbolic link standing at this name is NOT hardened,
 * because a `chmod` through it re-permissions a file this repo does not own —
 * the second half of the credential-link breach the migration carry's own tests
 * pin. A directory or device at the name is left alone for the same reason it is
 * left alone by {@link refuseRepublish}.
 *
 * Windows has no POSIX mode — `stat` synthesises one and `chmod` there only
 * toggles the read-only bit — so the pass is skipped rather than made to report
 * a tightening it did not perform.
 */
export async function hardenEnvMcpMode(path: string): Promise<boolean> {
  if (process.platform === "win32") return false;

  let entry;
  try {
    entry = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (!entry.isFile() || (entry.mode & LOOSE_MODE_BITS) === 0) return false;

  await chmod(path, SECRET_FILE_MODE);
  return true;
}

// ── Files ────────────────────────────────────────────────────────

/**
 * The entries a setup needs in `.gitignore`, in {@link REQUIRED_GITIGNORE_ENTRIES}
 * order: each one {@link GITIGNORE_ENTRY_WHEN} answers for, and each one whose
 * target is on disk (`present`, {@link presentGitignoreTargets}), so an existing
 * file always keeps its line — a server deselected while `.env.mcp` still holds
 * its token leaves that file ignored until the file goes. An entry the table
 * does not name is required: a missing answer keeps a line rather than drops one.
 */
export function requiredGitignoreEntries(setup: GitignoreSetup & { present: ReadonlySet<string> }): string[] {
  return REQUIRED_GITIGNORE_ENTRIES.filter(
    (entry) => setup.present.has(entry) || (GITIGNORE_ENTRY_WHEN[entry]?.(setup) ?? true),
  );
}

/**
 * The entries of {@link REQUIRED_GITIGNORE_ENTRIES} whose target exists under
 * `rootDir`, by `lstat`, so a link counts as there: the file itself, the lock
 * folder, the context-once folder, and for the review gate's temp pattern any
 * entry of its folder that starts with the pattern's stem. A target that cannot
 * be probed for a reason other than absence counts as there too: the answer
 * keeps an ignore line, never drops one.
 */
export async function presentGitignoreTargets(rootDir: string): Promise<Set<string>> {
  const found = await Promise.all(
    REQUIRED_GITIGNORE_ENTRIES.map(async (entry) => ((await gitignoreTargetPresent(rootDir, entry)) ? [entry] : [])),
  );
  return new Set(found.flat());
}

/** Whether `entry`'s target is on disk; see {@link presentGitignoreTargets}. */
async function gitignoreTargetPresent(rootDir: string, entry: string): Promise<boolean> {
  const absent = (error: unknown): boolean => {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR";
  };
  if (entry.endsWith("*")) {
    const prefix = entry.slice(0, -1);
    const slash = prefix.lastIndexOf("/");
    try {
      const names = await readdir(join(rootDir, ...prefix.slice(0, Math.max(slash, 0)).split("/")));
      return names.some((name) => name.startsWith(prefix.slice(slash + 1)));
    } catch (error) {
      return !absent(error);
    }
  }
  try {
    await lstat(join(rootDir, ...entry.replace(/\/$/, "").split("/")));
    return true;
  } catch (error) {
    return !absent(error);
  }
}

/** `text` as its lines, each with the break that ends it (`\n` or `\r\n`); the last one may have none. */
function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** A line without the break that ends it. */
const lineBody = (segment: string): string => segment.replace(/\r?\n$/, "");

/**
 * The lines `record` owns, re-checked against {@link REQUIRED_GITIGNORE_ENTRIES}
 * (the threat this bound stops: a forged row listing the owner's `.env` would
 * otherwise have `clean` strip it, and the next `git add -A` commit secrets).
 * The manifest validator refuses such a row first; this is the second check,
 * at the one place lines are removed. In the list's order, each line once.
 */
function ownedGitignoreLines(record: CoOwnership | null): string[] {
  const recorded = new Set(record?.lines ?? []);
  return REQUIRED_GITIGNORE_ENTRIES.filter((entry) => recorded.has(entry));
}

/** What {@link removeGitignoreLines} left. */
interface GitignoreRemoval {
  content: string;
  /** The entries whose line it removed, in {@link REQUIRED_GITIGNORE_ENTRIES} order. */
  removed: string[];
  /** Whether it dropped the line break the engine once added after the owner's last line. */
  terminatorDropped: boolean;
}

/**
 * `raw` with the last line equal to each of `entries` removed, break and all,
 * so a CRLF file stays CRLF. When `terminatorAdded` (the engine added the
 * break that ended the owner's unterminated last line) and every removed line
 * sat after every kept one, that one break goes too, so `node_modules/` with no
 * final newline comes back without one.
 */
function removeGitignoreLines(raw: string, entries: readonly string[], terminatorAdded: boolean): GitignoreRemoval {
  const segments = splitLines(raw);
  const drop = new Set<number>();
  const removed: string[] = [];
  for (const entry of entries) {
    const index = segments.findLastIndex((segment, at) => !drop.has(at) && lineBody(segment) === entry);
    if (index < 0) continue;
    drop.add(index);
    removed.push(entry);
  }
  const kept = segments.filter((_segment, at) => !drop.has(at));
  const firstDropped = Math.min(...drop);
  const atTail = drop.size > 0 && drop.size === segments.length - firstDropped;
  const joined = kept.join("");
  const unterminated = terminatorAdded && atTail && kept.length > 0 ? joined.replace(/\r?\n$/, "") : joined;
  return { content: unterminated, removed, terminatorDropped: unterminated !== joined };
}

/**
 * Reduce `.gitignore` to what is not the engine's: remove the last line equal to
 * each line `record` owns ({@link ownedGitignoreLines}, which re-checks the
 * bound), and the line break the engine added when those lines were last.
 * Pure. `engine-only` when nothing is left of a file the engine created (an
 * owner emptying it included), so the caller deletes it; `untouched` when no
 * owned line is in it; else `reduced`, proven line by line: each removed line
 * is byte-equal to an entry this engine writes.
 *
 * `record` is the caller's to narrow: `clean` hands it only the lines whose
 * target is gone, so a filled `.env.mcp`, which `clean` never deletes, keeps its
 * line ({@link reconcileGitignore}).
 */
export function reduceGitignoreToForeignContent(raw: string, record: CoOwnership | null): CoOwnedReduction {
  const { content, removed } = removeGitignoreLines(raw, ownedGitignoreLines(record), record?.terminatorAdded === true);
  if (content === "" && record?.createdFile === true) {
    return {
      kind: "engine-only",
      detail: "The setup created .gitignore, and nothing in it is yours once its own lines are taken back.",
      proven: true,
    };
  }
  if (content === raw) return { kind: "untouched", refused: false, detail: "No line this setup added to .gitignore is in it." };
  return { kind: "reduced", content, detail: `Took back the .gitignore line(s) this setup added: ${removed.join(", ")}.`, proven: true };
}

/** What {@link reconcileGitignore} did. */
export interface GitignoreReconcile {
  /** The entries it appended, in {@link REQUIRED_GITIGNORE_ENTRIES} order. */
  added: string[];
  /** The owned lines it removed, in the same order. */
  removed: string[];
  /** Whether it deleted the file: the engine created it, and nothing was left. */
  deleted: boolean;
  /** What the engine owns in the file now: the record its ledger rows carry ({@link gitignoreLedgerRows}). */
  record: CoOwnership;
  /** The sha256 of the file as this call leaves it, for those rows; `null` when no file is left. */
  contentHash: string | null;
}

/**
 * Put exactly `required` in place in the repository's `.gitignore` and take back
 * every line `previous` owns that is no longer required.
 *
 * Removal first: each owned line not in `required` goes
 * ({@link reduceGitignoreToForeignContent}'s rule, so only lines the bound
 * names). Then each required entry the file's lines do not already cover is
 * appended, on the file's own line ending: an entry a rule already dominates
 * (`.env*` covers `.env.mcp`) is left to that rule and never owned, and an
 * explicit negation (`!.env.mcp`) is the operator's decision and is not
 * overridden. The record is the owned lines still in the file plus the ones
 * appended now; `createdFile` when this call created the file or an earlier one
 * did, `terminatorAdded` when an append had to end the owner's last line first.
 * A file the engine created and that now holds nothing is deleted.
 *
 * A run with nothing to change reads and returns. A write passes
 * {@link refuseRepublish} first (a link, a shared hard link, a block-severity
 * injection pattern in the bytes it keeps), then lands with the repo root as
 * `boundaryDir`. No backup: every byte the owner wrote survives, and a `.bak`
 * beside it would itself be a new untracked file.
 *
 * `previous: null` owns nothing, so nothing is removed: the append-only form
 * {@link ensureGitignoreEntry} is.
 */
export async function reconcileGitignore(
  rootDir: string,
  opts: { required: readonly string[]; previous: CoOwnership | null },
): Promise<GitignoreReconcile> {
  const path = join(rootDir, GITIGNORE_FILE);
  const existing = await readTextOrNull(path);
  const raw = existing ?? "";
  const required = new Set(opts.required);
  const owned = ownedGitignoreLines(opts.previous);
  const removal = removeGitignoreLines(raw, owned.filter((entry) => !required.has(entry)), opts.previous?.terminatorAdded === true);

  let next = removal.content;
  const bodies = splitLines(next).map(lineBody);
  const kept = owned.filter((entry) => required.has(entry) && bodies.includes(entry));
  const trimmed = bodies.map((line) => line.trim());
  const added = REQUIRED_GITIGNORE_ENTRIES.filter((entry) => required.has(entry) && !isCovered(entry, trimmed));
  let terminatorAdded = opts.previous?.terminatorAdded === true && !removal.terminatorDropped && kept.length > 0;
  if (added.length > 0) {
    const eol = detectEol(next === "" ? raw : next);
    const separator = next === "" || next.endsWith("\n") ? "" : eol;
    if (separator !== "") terminatorAdded = true;
    next = `${next}${separator}${added.join(eol)}${eol}`;
  }
  const lines = REQUIRED_GITIGNORE_ENTRIES.filter((entry) => kept.includes(entry) || added.includes(entry));
  const createdFile = lines.length > 0 && (existing === null || opts.previous?.createdFile === true);
  const record: CoOwnership = {
    lines,
    ...(createdFile ? { createdFile: true as const } : {}),
    ...(terminatorAdded && lines.length > 0 ? { terminatorAdded: true as const } : {}),
  };

  const deleted = existing !== null && next === "" && opts.previous?.createdFile === true;
  if (deleted) {
    await refuseRepublish(path, raw, { refuseInjectionPatterns: false });
    await unlink(path);
  } else if (next !== raw) {
    await refuseRepublish(path, raw, { refuseInjectionPatterns: true });
    await atomicWriteFile(path, next, { boundaryDir: rootDir });
  }
  const contentHash = deleted || (existing === null && next === "") ? null : createHash("sha256").update(next, "utf8").digest("hex");
  return { added, removed: removal.removed, deleted, record, contentHash };
}

/**
 * Append each of `entries` that `.gitignore` does not already cover, owning
 * nothing: {@link reconcileGitignore} with no previous record. For a caller that
 * holds no ledger to record the lines on — the migration carry, which runs
 * after `init` recorded its own lines and adds at most the carried
 * `.env.mcp`'s, and the model-list move (`client-models.json`) — so a line it
 * appends is never taken back by `clean`. Returns the entries appended.
 */
export async function ensureGitignoreEntry(
  rootDir: string,
  entries: readonly string[] = REQUIRED_GITIGNORE_ENTRIES,
): Promise<string[]> {
  return (await reconcileGitignore(rootDir, { required: entries, previous: null })).added;
}

/**
 * What the engine owns in `.gitignore` by `ledger`: the union of the `.gitignore`
 * rows' records (one row per client set up), lines re-checked against the
 * bound, or `null` when no row records any. A ledger from 1.16.0 or earlier
 * has no such row, so nothing is owned and every line stays.
 */
export function gitignoreRecordOf(ledger: readonly LedgerEntry[]): CoOwnership | null {
  const records = ledger.flatMap((row) => (row.path === GITIGNORE_FILE && row.coOwned !== undefined ? [row.coOwned] : []));
  if (records.length === 0) return null;
  return {
    lines: ownedGitignoreLines({ lines: records.flatMap((record) => record.lines ?? []) }),
    ...(records.some((record) => record.createdFile === true) ? { createdFile: true as const } : {}),
    ...(records.some((record) => record.terminatorAdded === true) ? { terminatorAdded: true as const } : {}),
  };
}

/** The `artifactId` of the `.gitignore` rows. */
const GITIGNORE_ARTIFACT_ID = "gitignore";

/**
 * The ledger rows that record `record`: one `infra` row per client in `tools`
 * at `.gitignore`, each carrying the record as `coOwned` (REQ-FLOW-016) and
 * `contentHash`, the hash of the file as the write left it, as every row
 * records one; none when the engine owns no line there. The hash says only
 * that the file is unchanged since: the lines are proven one by one, and no
 * sweep reads the row (`sync` and `clean` take the lines back through
 * {@link reconcileGitignore}).
 */
export function gitignoreLedgerRows(
  tools: readonly Tool[],
  record: CoOwnership,
  contentHash: string | null = null,
): (LedgerEntry & { adapter: Tool })[] {
  if ((record.lines ?? []).length === 0) return [];
  return tools.map((adapter) => ({
    path: GITIGNORE_FILE,
    adapter,
    artifactId: GITIGNORE_ARTIFACT_ID,
    artifactType: "infra" as const,
    ...(contentHash === null ? {} : { contentHash }),
    coOwned: structuredClone(record),
  }));
}

/**
 * `ledger` with its `.gitignore` rows replaced by {@link gitignoreLedgerRows}'s,
 * in the ledger's path order: for a verb that records the lines without
 * rebuilding the ledger (`config mcp add`).
 */
export function withGitignoreRows(
  ledger: readonly LedgerEntry[],
  tools: readonly Tool[],
  outcome: Pick<GitignoreReconcile, "record" | "contentHash">,
): LedgerEntry[] {
  return [...ledger.filter((row) => row.path !== GITIGNORE_FILE), ...gitignoreLedgerRows(tools, outcome.record, outcome.contentHash)].toSorted((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
}

/**
 * True when a line of the file already answers for `entry`: the entry itself,
 * a rule {@link DOMINATING_PATTERNS} lists for it, or a negation of the entry in
 * either its bare or its root-anchored spelling. A negation is the operator's
 * decision, and appending the bare entry after it would reverse that decision,
 * because git lets the last matching line win.
 */
function isCovered(entry: string, lines: readonly string[]): boolean {
  const dominating = DOMINATING_PATTERNS[entry] ?? [];
  return lines.some(
    (line) =>
      line === entry ||
      line === `!${entry}` ||
      line === `!/${entry}` ||
      dominating.includes(line),
  );
}

/**
 * Create or extend `.env.mcp` for the given selection.
 *
 * Create renders the full file. Extend appends: existing bytes survive
 * verbatim — filled values, hand-added variables, the operator's own comments —
 * and only names the selection requires but the file lacks are added. Nothing
 * is ever removed, so deselecting a server does not throw away the credential
 * that was filled in for it.
 *
 * A selection requiring nothing writes no file, and a file already holding
 * every required name is left untouched (no rewrite, no mtime bump).
 *
 * A file that exists but holds nothing (`touch .env.mcp`) is rendered in full
 * rather than appended to: appending would produce a credential file with no
 * header, dropping the line that tells the operator never to commit it. It
 * still reports `created: false` — this call did not bring the file into being.
 *
 * The mode pass runs on every call, write or no write — see
 * {@link hardenEnvMcpMode} for why it cannot live inside the branch that writes.
 */
export async function ensureEnvMcp(
  rootDir: string,
  serverIds: readonly string[],
  packServers: readonly PackSuppliedServer[] = [],
): Promise<EnsureResult> {
  const result = await writeEnvMcp(rootDir, serverIds, packServers);
  await hardenEnvMcpMode(result.path);
  return result;
}

/** The render/append half of {@link ensureEnvMcp}, with the mode pass lifted out. */
async function writeEnvMcp(
  rootDir: string,
  serverIds: readonly string[],
  packServers: readonly PackSuppliedServer[],
): Promise<EnsureResult> {
  const path = join(rootDir, ENV_MCP_FILE);
  const vars = collectRequiredEnvVars(serverIds, packServers);
  // The repo root is the tree this file belongs to, so the containment question
  // is answered exactly rather than by the substrate's structural fallback.
  const writeOpts = { mode: SECRET_FILE_MODE, boundaryDir: rootDir };

  const existingRaw = await readTextOrNull(path);
  const existing = existingRaw === null ? {} : parseEnvFile(existingRaw);
  const preservedVars = Object.keys(existing);

  const missing = vars.filter((envVar) => !Object.hasOwn(existing, envVar.name));
  const addedVars = missing.map((envVar) => envVar.name);

  if (existingRaw === null || existingRaw.trim() === "") {
    if (vars.length === 0) return { path, created: false, addedVars: [], preservedVars };
    // No gate on this branch: a full render keeps none of what was there, and
    // the substrate's temp+rename replaces a terminal link with a fresh inode
    // rather than writing through it. Nothing of the target's is republished.
    await atomicWriteFile(path, generateEnvMcpContent(vars), writeOpts);
    return { path, created: existingRaw === null, addedVars, preservedVars };
  }

  if (missing.length === 0) return { path, created: false, addedVars: [], preservedVars };
  // The append keeps every existing byte, so it is a republish and is gated —
  // on the link and shared-name conditions, not on the injection scan, which
  // would refuse this file for holding the credential it exists to hold.
  await refuseRepublish(path, existingRaw, { refuseInjectionPatterns: false });
  await atomicWriteFile(path, appendVars(existingRaw, missing), writeOpts);
  return { path, created: false, addedVars, preservedVars };
}

/** Existing content, then a labelled block of the missing names with empty values. */
function appendVars(existingRaw: string, missing: readonly EnvVar[]): string {
  const eol = detectEol(existingRaw);
  const body = existingRaw.replace(/[\r\n]+$/, "");
  const entries = missing.map((envVar) => renderEntry(envVar, "", eol));
  return `${body}${eol}${eol}${APPEND_HEADER}${eol}${entries.join(`${eol}${eol}`)}${eol}`;
}

function detectEol(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

async function readTextOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
