import { chmod, lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  INJECTION_PATTERNS,
  NO_HONEST_SHAPE_INJECTION_ROWS,
  scanForDeniedPatterns,
  scanNormalized,
  type DenyHit,
} from "../denyscan/denyScan.ts";
import { atomicWriteFile, isSharedRegularFile } from "../merge/atomicWrite.ts";
import { TOOLS, type Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
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

const GITIGNORE_FILE = ".gitignore";

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
 * Paths this engine writes that must never reach a commit. One member today:
 * the credential file. Machine-local state written by other modules registers
 * here too, so a single scan covers every ignore rule the engine depends on.
 */
export const REQUIRED_GITIGNORE_ENTRIES: readonly string[] = [ENV_MCP_FILE];

/**
 * Existing patterns that already ignore an entry. Appending our literal beside
 * one of these would add a redundant rule to a file the operator maintains.
 */
const DOMINATING_PATTERNS: Record<string, readonly string[]> = {
  [ENV_MCP_FILE]: [".env.*", ".env*", "*.mcp"],
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
      `Replace the link with a regular file, or delete it and re-run to regenerate the file.`,
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
 * Register every entry in {@link REQUIRED_GITIGNORE_ENTRIES} that is not
 * already covered, creating `.gitignore` when the repo has none. Idempotent:
 * coverage is checked per entry against the file's own lines, so repeated runs
 * append nothing. An entry a rule already dominates (`.env.*`) is left to that
 * rule, and an explicit negation (`!.env.mcp`) is read as a decision the
 * operator made and is not overridden.
 *
 * The file's line endings are preserved: a CRLF `.gitignore` gets CRLF back.
 *
 * A run with nothing to add reads and returns — no gate, because nothing is
 * republished. A run that DOES have a line to add passes {@link refuseRepublish}
 * first, then writes with the repo root as `boundaryDir`, so the bytes cannot
 * land outside the tree they were aimed at. No backup: this lane only ever
 * APPENDS — every existing byte survives verbatim, so a `.bak` beside it would
 * protect nothing and would itself be a new untracked file in the repo.
 */
export async function ensureGitignoreEntry(rootDir: string): Promise<void> {
  const path = join(rootDir, GITIGNORE_FILE);
  const content = (await readTextOrNull(path)) ?? "";
  const lines = content.split(/\r?\n/).map((line) => line.trim());

  const missing = REQUIRED_GITIGNORE_ENTRIES.filter((entry) => !isCovered(entry, lines));
  if (missing.length === 0) return;

  await refuseRepublish(path, content, { refuseInjectionPatterns: true });
  const eol = detectEol(content);
  const separator = content === "" || content.endsWith("\n") ? "" : eol;
  await atomicWriteFile(path, `${content}${separator}${missing.join(eol)}${eol}`, {
    boundaryDir: rootDir,
  });
}

function isCovered(entry: string, lines: readonly string[]): boolean {
  const dominating = DOMINATING_PATTERNS[entry] ?? [];
  return lines.some(
    (line) => line === entry || line === `!${entry}` || dominating.includes(line),
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
