import { open, realpath, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import type { Command } from "commander";
import { CliFailure } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import {
  closePrompts,
  promptGate,
  sanitizeLabel,
  selectMany,
  type PromptGate,
} from "../kit/prompts.ts";
import { applySync, planSync } from "./sync/engine.ts";
import { TOOLS, VALID_TOOLS, type Tool } from "../../types/core.ts";
import { EngineError } from "../../types/errors.ts";
import { MANIFEST_FILE, type McpConfig, type SetupManifest } from "../../types/manifest.ts";
import { STATE_DIR } from "../../types/markers.ts";
import type { DetectedRepo } from "../../workspace/detect.ts";
import type {
  WorkspaceManifest,
  WorkspaceRepoEntry,
  WorkspaceSyncCounts,
  WorkspaceSyncOutcome,
} from "../../workspace/model.ts";
import type { ResolvedRepoConfig } from "../../workspace/resolve.ts";
import type { RepoSyncCallback, WorkspaceRepoSyncRow } from "../../workspace/sync.ts";

/**
 * `stamity workspace` — the door onto the multi-repo engine.
 *
 *   workspace          status, on every stream
 *   workspace status   every declared member, its state, and what it resolves to
 *   workspace init     guided creation of workspace.json at this directory
 *   workspace sync     run the cascade over every member
 *
 * Three properties hold across the surface.
 *
 * **One subject, one refusal.** All three subcommands read the same validated
 * `workspace.json`, so the "there is no workspace here" refusal is written once
 * ({@link requireWorkspaceRoot}) rather than three times with three wordings.
 * The root is found through `detectWorkspaceContext`, which walks up from the
 * cwd and takes the NEAREST manifest — the same resolution rule the engine uses
 * to decide that a nested workspace shadows an outer one, so `status` run
 * inside `apps/web` reports the workspace that actually governs it instead of
 * refusing at a directory that is plainly inside one.
 *
 * **Bare `workspace` is the read, on every stream.** No picker: `config`'s
 * exists so an operator can find a key they cannot spell, and a workspace has
 * no key registry to navigate. A TTY and a pipe produce the same bytes.
 *
 * **A report is not a gate.** `status` exits 0 whenever it could read the
 * manifest, whatever the rows say. The workspace already has two gates —
 * `validate` on the manifest's field defects, and `workspace sync` on a member
 * that would not propagate — and a third one disagreeing with either about
 * severity is how a CI step starts getting ignored.
 *
 * Engine access rule: the body reaches the workspace engine through
 * `ctx.engine`, the typed composition root; only the vocabulary leaves
 * (`../../types/`) and the engine's own type modules are imported directly.
 *
 * ONE FILE, not a `./workspace/` submodule in the `./config/mcp.ts` shape. The
 * split was built and reverted, and the reason is worth writing down rather
 * than rediscovering: `test/architecture/boundaries.test.ts` keeps a
 * hand-maintained plan map keyed by source path, and every file under `src/`
 * has to carry a row there naming the unit and wave that authored it. A new
 * module is therefore an architectural claim in a file this verb does not own,
 * not a free refactor — and `config` earns its child by being four times this
 * size with a genuinely separable subject (MCP servers, their catalog, their
 * credential file).
 *
 * The cascade's own unit re-took that decision with the plan-map rows in scope,
 * and the answer stayed ONE FILE for a reason the earlier note could not see.
 * The layering gate allows an import only within one unit or strictly DOWN a
 * wave (`checkWaveLayering`: `toEntry.wave < fromEntry.wave`). A `workspace/`
 * child holding the cascade has to sit at wave 15 to reach the wave-14 emission
 * engine, and this file — also wave 15 — would then import a sibling at its own
 * wave under a different unit, which is exactly the violation the gate names.
 * Moving this file to wave 16 only relocates the violation onto `src/cli.ts`.
 * The three ways out are all worse than the size: a plan-map row naming a wave
 * the module does not sit at, a row filing the child under `w-u1` (a unit that
 * did not author it), or a `LAYERING_WAIVERS` entry, which that list's own
 * ratchet forbids adding. So the file grows to `config.ts`'s order of magnitude
 * and the split waits for a change that re-plans the wave map deliberately.
 */

/**
 * The closed subcommand set, in the order the refusal names them. `status` is
 * also the bare-invocation default, which is why it leads.
 */
const SUBCOMMANDS = ["status", "init", "sync"] as const;

/**
 * How many bytes of the crash journal `status` reads.
 *
 * A bounded TAIL rather than the file: the journal is append-only across runs
 * and nothing prunes it, so reading it whole would make a status run cost
 * proportional to how long the workspace has existed. 64 KiB holds hundreds of
 * lines, which is more than one interrupted cascade can have written, and a
 * window that starts mid-line drops its leading fragment rather than parsing a
 * half record.
 */
const JOURNAL_TAIL_BYTES = 64 * 1024;

/** The five states a declared member can be in. See {@link classifyMemberDir}. */
type MemberState = "ok" | "unconfigured" | "absent" | "escaped" | "unresolved";

/** Column width for the painted state token: the longest member is `unconfigured`. */
const STATE_WIDTH = Math.max(
  ...(["ok", "unconfigured", "absent", "escaped", "unresolved"] satisfies MemberState[]).map(
    (s) => s.length,
  ),
);

/** One member row: what the manifest declared, what disk says, what it resolves to. */
interface MemberRow {
  /** The path exactly as `repos[]` declares it. */
  path: string;
  state: MemberState;
  /** Absent exactly when the state is `unresolved` — there is no resolution to report. */
  tools?: string[];
  groups?: string[];
  lockedApplied?: string[];
  /** Present exactly when the state is `unresolved`, carrying the resolver's own message. */
  error?: { code: string; message: string };
}

/** The unterminated `started` line, when the journal holds one. */
interface JournalFlight {
  repo: string;
  run: string;
  ts: string;
}

/** The whole status report — the shape of the `--json` document, and of the render. */
interface StatusReport {
  root: { path: string; hasSetupManifest: boolean };
  members: MemberRow[];
  /** Every member still live at the tail's last line. Empty when none is. */
  journal: JournalFlight[];
}

// ── The shared read ────────────────────────────────────────────────────────

/**
 * The workspace governing `cwd`, or the refusal.
 *
 * `CONFIG_ERROR` rather than `VALIDATION_ERROR`: nothing is wrong with what the
 * operator typed, the configuration this verb acts on simply is not there — the
 * same classification `config` uses for a repository with no setup manifest.
 */
async function requireWorkspaceRoot(ctx: CliContext, cwd: string): Promise<string> {
  const context = await ctx.engine.workspace.detect.detectWorkspaceContext(cwd);
  if (context.workspaceRoot !== null) return context.workspaceRoot;
  throw new CliFailure({
    code: "CONFIG_ERROR",
    message: `no workspace found at or above ${cwd}`,
    why: `no ${ctx.engine.workspace.model.WORKSPACE_MANIFEST_FILE} in that directory or any parent`,
    next: "run stamity workspace init in the directory holding your repositories",
  });
}

/**
 * The validated manifest at a root {@link requireWorkspaceRoot} already found.
 *
 * Shared by `status` and `sync` so the "it was there a moment ago" window is
 * reported one way rather than two. A defect the READ refuses — two spellings
 * of one directory, an escaping path, an unknown tool — leaves through the
 * read's own throw instead, which is where that message belongs.
 */
async function requireWorkspaceManifest(
  ctx: CliContext,
  rootDir: string,
): Promise<WorkspaceManifest> {
  const manifest = await ctx.engine.workspace.manifest.readWorkspaceManifest(rootDir);
  if (manifest !== null) return manifest;
  // The context probe found a manifest and the reader did not: it was removed
  // between the two reads. Reported as the same refusal rather than a crash.
  throw new CliFailure({
    code: "CONFIG_ERROR",
    message: `no workspace manifest at ${rootDir}`,
    why: "it was present when the workspace root was resolved and gone when it was read",
    next: "re-run stamity workspace status",
  });
}

// ── Member classification ──────────────────────────────────────────────────

/** A path that exists and is a regular file. Any filesystem answer means "no". */
async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * The workspace root's own realpath, resolved ONCE per command run rather than
 * once per member: {@link classifyMemberDir} needs it for every row, and
 * sharing one resolution keeps a root-side failure a single, clearly-caused
 * fact instead of N members each independently hitting the same failed call.
 * `null` on any failure — the same "unanswerable containment question" the
 * per-member check reads as `escaped`.
 */
async function resolveRootReal(rootDir: string): Promise<string | null> {
  try {
    return await realpath(rootDir);
  } catch {
    return null;
  }
}

/**
 * The disk half of a member's state, decided by the same two conditions
 * `requireRepoDirectory` fails a cascade row on: the directory is missing or is
 * not a directory (`absent`), or it resolves outside the root through a link
 * (`escaped`). A containment question that cannot be answered — the root's own
 * realpath unresolvable, or `member`'s realpath failing after `stat` already
 * succeeded — reads as `escaped` for the cascade's own stated reason: an
 * unanswerable containment question is not a positive answer, and reporting
 * `ok` for a row `sync` will refuse would be worse than reporting the refusal a
 * run early.
 *
 * The root and member realpath resolutions are two SEPARATE steps rather than
 * one shared `try`: a root-side failure is `rootReal === null`, resolved once
 * by the caller ({@link resolveRootReal}) and reused for every row, so it
 * cannot be conflated with THIS member's own link failing to resolve.
 */
async function classifyMemberDir(
  rootDir: string,
  rootReal: string | null,
  repoPath: string,
): Promise<Exclude<MemberState, "unresolved">> {
  const dir = join(rootDir, repoPath);
  let entry;
  try {
    entry = await stat(dir);
  } catch {
    return "absent";
  }
  if (!entry.isDirectory()) return "absent";

  if (rootReal === null) return "escaped";

  let member: string;
  try {
    member = await realpath(dir);
  } catch {
    return "escaped";
  }
  if (member !== rootReal && !member.startsWith(join(rootReal, sep))) return "escaped";

  return (await isFile(join(dir, STATE_DIR, MANIFEST_FILE))) ? "ok" : "unconfigured";
}

/**
 * One row for one declared entry.
 *
 * Resolution runs FIRST and its refusal wins the row: a member whose entry the
 * resolver rejected has no tools, no matched groups and no locks to report, so
 * reporting its directory state instead would print a row whose every other
 * column is blank for a reason the row does not name.
 */
async function buildMemberRow(
  ctx: CliContext,
  rootDir: string,
  rootReal: string | null,
  manifest: WorkspaceManifest,
  entry: WorkspaceRepoEntry,
): Promise<MemberRow> {
  let resolved;
  try {
    resolved = ctx.engine.workspace.resolve.resolveRepoConfig(manifest, entry.path);
  } catch (err) {
    return {
      path: entry.path,
      state: "unresolved",
      error: {
        code: err instanceof EngineError ? err.code : "VALIDATION_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const groups = entry.groups ?? [];
  return {
    path: entry.path,
    state: await classifyMemberDir(rootDir, rootReal, entry.path),
    tools: [...resolved.tools],
    ...(groups.length === 0 ? {} : { groups: [...groups] }),
    ...(resolved.lockedApplied.length === 0 ? {} : { lockedApplied: [...resolved.lockedApplied] }),
  };
}

// ── The crash journal ──────────────────────────────────────────────────────

/**
 * The last {@link JOURNAL_TAIL_BYTES} of the journal, or `null` when there is
 * nothing readable to look at. Every filesystem answer is "no signal": the
 * journal is diagnostic in both directions, so an absent, unreadable or empty
 * one never fails a command. Nothing is written, rotated or truncated.
 */
async function readJournalTail(rootDir: string, fileName: string): Promise<string | null> {
  const path = join(rootDir, STATE_DIR, fileName);
  // A FIFO (or any non-regular file) planted at the journal's name would
  // block `open(path, "r")` forever — the write side already treats that path
  // as hostile (`../../workspace/sync.ts`'s contained append), and this read
  // refuses it the same way `classifyMemberDir` refuses a non-directory
  // member: every filesystem answer here is "no signal", so a bad file type
  // reads as "nothing to show" rather than hanging the command.
  if (!(await isFile(path))) return null;
  let handle;
  try {
    handle = await open(path, "r");
  } catch {
    return null;
  }
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - JOURNAL_TAIL_BYTES);
    const length = size - start;
    if (length <= 0) return null;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    const text = buffer.toString("utf8");
    if (start === 0) return text;
    // The window is ASSUMED to begin mid-line, so the first fragment before
    // the first newline is dropped as a partial record. That assumption can be
    // wrong by exactly one record: when `start` lands precisely on a line
    // boundary in the underlying file, the "first fragment" is actually a
    // whole record, and dropping it under-reports by one line. There is no
    // way to tell the two cases apart from the window alone — the byte just
    // before `start` decides it, and that byte was never read — so this
    // accepts the rare one-record under-report rather than reading one extra
    // byte on every tail just to resolve a boundary that is otherwise inert.
    const firstBreak = text.indexOf("\n");
    return firstBreak === -1 ? "" : text.slice(firstBreak + 1);
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

/** The three fields every journal line carries, on a line that parsed. */
function journalFields(line: string): { ts: string; run: string; repo: string; event: string } | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { ts, run, repo, event } = value as Record<string, unknown>;
  if (typeof ts !== "string" || typeof run !== "string" || typeof repo !== "string") return null;
  if (typeof event !== "string") return null;
  return { ts, run, repo, event };
}

/**
 * Every repo whose LAST line in the tail is a `started` with no terminal line
 * after it — the members still in flight when the process died, or when the
 * tail was read.
 *
 * Liveness is decided per REPO by the last line concerning that repo, not per
 * (run, repo) pair: the journal is append-only in write order, so a `finished`
 * or `skipped` line for a repo — from THIS run or a later, unrelated one —
 * supersedes an earlier `started` for the same repo. Without that, a killed
 * run's flight would read as in-flight forever, surviving arbitrarily many
 * clean re-syncs until the journal was hand-deleted. Concurrency runs several
 * members at once (default: the machine's core count, capped at eight), so
 * more than one repo can be genuinely live at once — every one of them is
 * returned, not just the newest. A malformed line is skipped rather than
 * fatal.
 *
 * What this gives up: two OVERLAPPING cascades on the same root are
 * unsupported (there is no run-level lock), and under that unsupported
 * configuration a terminal line from cascade A can suppress cascade B's
 * genuinely-live flight for the same repo — the last line wins regardless of
 * which run wrote it. The trade is accepted anyway, because the alternative it
 * replaces (per-`(run, repo)` keying) failed CERTAINLY, on ordinary single-run
 * use: a killed run's flight stayed "in flight" forever, clearable only by
 * deleting the journal by hand. This failure mode instead needs an
 * already-unsupported concurrent configuration to reach, on a signal that is
 * diagnostic-only and never gates anything (invariant 6).
 */
function unterminatedFlights(text: string): JournalFlight[] {
  const lastByRepo = new Map<string, JournalFlight | null>();
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const fields = journalFields(line);
    if (fields === null) continue;
    if (fields.event === "started") {
      lastByRepo.set(fields.repo, { repo: fields.repo, run: fields.run, ts: fields.ts });
    } else if (fields.event === "finished" || fields.event === "skipped") {
      lastByRepo.set(fields.repo, null);
    }
  }
  return [...lastByRepo.values()].filter((flight): flight is JournalFlight => flight !== null);
}

// ── Rendering ──────────────────────────────────────────────────────────────

/** Pad before painting: escape codes would otherwise count toward the width. */
function paintState(state: MemberState, palette: CliContext["palette"]): string {
  const token = state.padEnd(STATE_WIDTH);
  if (state === "ok") return palette.green(token);
  if (state === "unconfigured") return palette.yellow(token);
  return palette.red(token);
}

/**
 * The right-hand column: what the member resolves to, or why it resolves to
 * nothing. Every value on this line originates in `workspace.json` — content
 * this process did not author — so it goes through `sanitizeLabel`, the same
 * sink `config list` uses for the same hazard.
 */
function renderDetail(row: MemberRow): string {
  if (row.error !== undefined) return sanitizeLabel(`[${row.error.code}] ${row.error.message}`);
  const parts = [`tools: ${(row.tools ?? []).join(", ")}`];
  if (row.groups !== undefined) parts.push(`groups: ${row.groups.join(", ")}`);
  if (row.lockedApplied !== undefined) parts.push(`locked: ${row.lockedApplied.join(", ")}`);
  return sanitizeLabel(parts.join("  "));
}

function renderStatus(ctx: CliContext, report: StatusReport): void {
  const { palette } = ctx;
  ctx.io.out(`${palette.bold("workspace")} ${sanitizeLabel(report.root.path)}\n`);
  ctx.io.out(
    `  ${palette.dim(
      `root: ${
        report.root.hasSetupManifest
          ? `carries its own ${STATE_DIR}/${MANIFEST_FILE}`
          : `no ${STATE_DIR}/${MANIFEST_FILE} of its own`
      } — informative; the root is never a cascade target`,
    )}\n`,
  );

  if (report.members.length === 0) {
    ctx.io.out(`  ${palette.dim("no members registered — add repos[] entries to workspace.json")}\n`);
  } else {
    const width = Math.max(...report.members.map((row) => sanitizeLabel(row.path).length));
    for (const row of report.members) {
      ctx.io.out(
        `  ${paintState(row.state, palette)}  ${sanitizeLabel(row.path).padEnd(width)}  ${renderDetail(row)}\n`,
      );
    }
  }

  for (const flight of report.journal) {
    ctx.io.out(
      `\n${palette.yellow("in flight:")} ${sanitizeLabel(flight.repo)} started at ${sanitizeLabel(flight.ts)} in ` +
        `run ${sanitizeLabel(flight.run)} and never finished — its tree may be half-written\n`,
    );
  }

  ctx.io.out(`${palette.dim("run stamity workspace sync to apply this policy to every member")}\n`);
}

// ── Subcommands ────────────────────────────────────────────────────────────

/**
 * `workspace status` — one row per declared member, in declaration order, plus
 * the root's informative line and one journal line per member still in flight.
 *
 * Exit 0 whenever the manifest was read. A defect the manifest READ refuses —
 * two spellings of one directory, an escaping path, an unknown tool — leaves
 * through the read's own throw instead, which is where that message belongs.
 */
async function runStatus(ctx: CliContext, cwd: string): Promise<CommandResult> {
  const rootDir = await requireWorkspaceRoot(ctx, cwd);
  const manifest = await requireWorkspaceManifest(ctx, rootDir);
  const rootReal = await resolveRootReal(rootDir);

  const [members, journalText] = await Promise.all([
    Promise.all(manifest.repos.map((entry) => buildMemberRow(ctx, rootDir, rootReal, manifest, entry))),
    readJournalTail(rootDir, ctx.engine.workspace.sync.WORKSPACE_SYNC_JOURNAL_FILE),
  ]);

  const report: StatusReport = {
    root: {
      path: rootDir,
      hasSetupManifest: await isFile(join(rootDir, STATE_DIR, MANIFEST_FILE)),
    },
    members,
    journal: journalText === null ? [] : unterminatedFlights(journalText),
  };

  renderStatus(ctx, report);
  return { exitCode: 0, json: { ...report } };
}

// ── workspace init ─────────────────────────────────────────────────────────

/**
 * Guided creation of `workspace.json` at the cwd, and three properties govern
 * the whole subcommand.
 *
 * **Exactly one question, and it is not about policy.** The candidates come
 * from a scan, every one of them is preselected, and `defaults.tools` is
 * DERIVED from what the selected members already target rather than asked. The
 * second question is answerable from evidence, and detection over asking is
 * this repository's stated posture. Groups, locks, per-member overrides and a
 * baseline selection are not asked and not written: they are policy an operator
 * authors once they have members and a reason, into a file this command just
 * created.
 *
 * **Union, not intersection, for the tool list.** `defaults` is the baseline
 * every member inherits before its own overrides, so a union preserves what
 * each member already had and lets a member narrow itself. An intersection
 * would silently drop a client one member was already targeting, and the first
 * cascade would then reclaim that client's files.
 *
 * **Unattended CREATES, and that is a deliberate asymmetry** with `stamity
 * init`, which refuses to create a workspace on an unattended run. The
 * distinction is sharp: an unattended `stamity init` never named a workspace,
 * so creating one would be a side effect; an unattended `stamity workspace
 * init` named the verb, and its declared default — every detected candidate —
 * is disclosed in full in the same run. Nothing is overwritten without
 * `--force`, so no destructive-confirmation gate applies.
 */

/**
 * How deep the candidate scan descends, and the number the zero-candidate
 * refusal names.
 *
 * This is `detectSubRepos`' own default (`../../workspace/detect.ts`,
 * `DEFAULT_MAX_DEPTH`) passed EXPLICITLY, because the refusal has to STATE the
 * depth and that module does not export it — so the choice was between naming a
 * number this file cannot see and passing the one it names. Passing it is
 * behaviourally identical to omitting it, and the pin is behavioural rather
 * than referential: the suite plants a repository four levels down and another
 * five levels down, so a drift in either value fails a test rather than quietly
 * making the message wrong.
 */
const SCAN_DEPTH = 4;

/**
 * The tool a workspace falls back to when no selected member declares one — the
 * same default `stamity init` falls back to for the same reason: a setup
 * targeting no tool emits nothing at all.
 */
const FALLBACK_TOOL: Tool = "claude";

/** The init subcommand's `--json` document, and the shape its render walks. */
interface InitReport {
  /** Absolute path of the manifest — written, or the one a preview would write. */
  path: string;
  /** True exactly when bytes landed: false under `--dry-run` and on an empty selection. */
  created: boolean;
  dryRun: boolean;
  /** Declared `repos[]` paths, in detection order. Empty on the keep-none answer. */
  members: string[];
  /** The resolved defaults, or `null` when nothing was composed. */
  defaults: { tools: Tool[] } | null;
  /** The manifest in full — what `--dry-run` prints, and what a real run wrote. */
  manifest: WorkspaceManifest | null;
}

/**
 * The two recoverable ways an operator reaches this verb by accident, both
 * lifted by `--force`.
 *
 * Neither is an error about the world — a manifest here, or an outer workspace
 * above — so they refuse and NAME the flag rather than refusing absolutely.
 * Nesting in particular is something the engine models by design: the nearest
 * manifest wins for the directories below it, which is exactly what makes a
 * nested workspace shadow an outer one. A command that forbade what the engine
 * models would be the surface disagreeing with the machine.
 */
async function assertCreatable(ctx: CliContext, rootDir: string, force: boolean): Promise<void> {
  const context = await ctx.engine.workspace.detect.detectWorkspaceContext(rootDir);
  if (context.role === "standalone" || force) return;

  const file = ctx.engine.workspace.model.WORKSPACE_MANIFEST_FILE;
  if (context.role === "workspace-root") {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `a workspace manifest already exists at ${context.manifestPath ?? join(rootDir, file)}`,
      why: "workspace init composes a fresh manifest; it does not merge into one that is already there",
      next: `run stamity workspace status to see what it declares, edit ${file} by hand, or re-run with --force to overwrite it`,
    });
  }
  throw new CliFailure({
    code: "VALIDATION_ERROR",
    message: `${rootDir} is already inside the workspace rooted at ${context.workspaceRoot ?? "an outer directory"}`,
    why: `that workspace declares its members in ${context.manifestPath ?? file}`,
    next: `run stamity workspace status to see it, or re-run with --force to nest a second workspace here — the nearest ${file} wins for the directories below it`,
  });
}

/**
 * Guided creation over an empty list guides nothing, so zero candidates refuses
 * even though the schema accepts an empty `repos[]` — and `--force` does NOT
 * lift it, because there is no recoverable fact here to override. The message
 * names the depth and both markers so an author can either move to the right
 * directory or write the file by hand.
 */
function noCandidates(ctx: CliContext, rootDir: string): CliFailure {
  const file = ctx.engine.workspace.model.WORKSPACE_MANIFEST_FILE;
  return new CliFailure({
    code: "VALIDATION_ERROR",
    message: `no repositories found under ${rootDir}`,
    why:
      `the scan descends ${String(SCAN_DEPTH)} levels and counts a directory as a candidate when ` +
      `it carries a .git entry or a ${STATE_DIR}/${MANIFEST_FILE} of its own`,
    next: `run this in the directory that holds your repositories, or write ${file} by hand`,
  });
}

/**
 * The markers that qualified a directory, for the row's label: `.git`,
 * `.stamity`, or both. `detectSubRepos` never returns a row carrying neither,
 * so the list is never empty.
 */
function markersOf(repo: DetectedRepo): string {
  return [...(repo.hasGit ? [".git"] : []), ...(repo.hasManifest ? [STATE_DIR] : [])].join(", ");
}

/**
 * One `selectMany` over the candidates in scan order, every one preselected.
 *
 * The empty set is a REAL answer, not a mistake to be read back as the
 * defaults: an operator who clears every box has said "not these", and
 * substituting the full list would write a manifest they just declined. The
 * caller turns it into a keep-none ending rather than a refusal, because
 * declining is not an error.
 *
 * A non-interactive gate returns the defaults verbatim — every candidate —
 * which is this verb's declared unattended default, disclosed in full by the
 * render.
 *
 * Paths come off the filesystem rather than out of this process, so labels go
 * through `sanitizeLabel`, the same sink the status rows use for the same
 * hazard: a directory name may carry control bytes.
 */
async function askMembers(
  ctx: CliContext,
  gate: PromptGate,
  candidates: readonly DetectedRepo[],
): Promise<DetectedRepo[]> {
  const picked = await selectMany<string>(gate, ctx.promptIo, {
    question: `Which repositories join this workspace? (${String(candidates.length)} found)`,
    choices: candidates.map((repo) => ({
      value: repo.path,
      label: `${sanitizeLabel(repo.path)} — ${markersOf(repo)}`,
    })),
    defaultValues: candidates.map((repo) => repo.path),
  });
  // Every question is settled. On a real terminal the prompt session holds
  // stdin in raw mode, where Ctrl-C is a byte the kit consumes rather than a
  // signal — leaving it open across the write below would make the write
  // uninterruptible. `init` and `config` close it here for the same reason;
  // the funnel's `finally` closes it again, idempotently.
  closePrompts(ctx.promptIo);

  const chosen = new Set(picked);
  return candidates.filter((repo) => chosen.has(repo.path));
}

/**
 * `--tools <csv>`, parsed and validated the way init parses its own: split
 * tolerantly on commas so `"claude, codex"` works, then check membership
 * against `VALID_TOOLS` — a runtime fact, so it is checked rather than trusted
 * from the flag's type — and normalise to `TOOLS` order so any flag spelling
 * yields one canonical list.
 *
 * The refusal fires before the scan and before the question, matching init's
 * ordering: a bad flag value should cost nothing and interrupt nobody.
 */
function readToolsFlag(raw: string): Tool[] {
  const names = raw
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== "");
  const unknown = names.filter((name) => !VALID_TOOLS.has(name));
  if (unknown.length > 0) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `unknown tool${unknown.length > 1 ? "s" : ""} ${unknown.map((name) => JSON.stringify(name)).join(", ")}`,
      why: "--tools names the clients every member inherits, and this build ships no adapter for that id",
      next: `valid tools: ${TOOLS.join(", ")}`,
    });
  }
  const tools = TOOLS.filter((tool) => names.includes(tool));
  if (tools.length === 0) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: "--tools named no tool",
      why: "a workspace whose defaults target nothing generates nothing in any member",
      next: `pass a comma-separated list of: ${TOOLS.join(", ")}`,
    });
  }
  return tools;
}

/**
 * One member's declared tools, or nothing.
 *
 * A member whose setup manifest exists and does not validate contributes
 * NOTHING to the union rather than failing the creation. Two reasons, and
 * neither is a shrug: `defaults.tools` is a starting baseline in a file the
 * operator can edit the moment it is written, and `--tools` overrides it
 * outright — so the cost of reading one member as toolless is a line in a fresh
 * file, while the cost of refusing is that a workspace cannot be created until
 * a repository it does not yet manage is repaired. `stamity validate` is the
 * surface that reports a defective member manifest.
 */
async function memberTools(ctx: CliContext, memberDir: string): Promise<readonly Tool[]> {
  try {
    const manifest = await ctx.engine.manifest.manifest.readManifest(memberDir);
    return manifest?.tools ?? [];
  } catch {
    return [];
  }
}

/**
 * The union of the selected members' own tool lists, in `TOOLS` order, falling
 * back to {@link FALLBACK_TOOL} when no selected member declares one.
 *
 * Only a member the scan already saw a manifest on is read: `hasManifest` is
 * the same probe that qualified it, so a member with no manifest costs no read.
 */
async function deriveDefaultTools(
  ctx: CliContext,
  rootDir: string,
  selected: readonly DetectedRepo[],
): Promise<Tool[]> {
  const lists = await Promise.all(
    selected.map(async (repo) =>
      repo.hasManifest ? memberTools(ctx, join(rootDir, repo.path)) : [],
    ),
  );
  const declared = new Set<string>(lists.flat());
  const tools = TOOLS.filter((tool) => declared.has(tool));
  return tools.length === 0 ? [FALLBACK_TOOL] : tools;
}

/** The keep-none ending: an answer, not a refusal, so it exits 0 and says so. */
function renderKeepNone(ctx: CliContext, rootDir: string): void {
  const { palette } = ctx;
  ctx.io.out(`${palette.bold("workspace")} ${sanitizeLabel(rootDir)}\n`);
  ctx.io.out(`  ${palette.yellow("no members selected")} — nothing was created\n`);
  ctx.io.out(
    `${palette.dim("run stamity workspace init again to pick the repositories that join")}\n`,
  );
}

/**
 * What was written (or would be), the member list in full, the resolved tool
 * list, and the next verb.
 *
 * The member list is printed on every path rather than only unattended, because
 * the unattended row is precisely the one where nobody watched the question:
 * the disclosure is what makes "every candidate" a stated default instead of a
 * silent one, and printing it always keeps one rendering rather than two.
 */
function renderCreated(ctx: CliContext, report: InitReport, manifest: WorkspaceManifest): void {
  const { palette } = ctx;
  const count = manifest.repos.length;
  ctx.io.out(`${palette.bold("workspace")} ${sanitizeLabel(report.path)}\n`);
  ctx.io.out(
    `  ${report.dryRun ? "would register" : "registered"} ${String(count)} member${count === 1 ? "" : "s"}\n`,
  );
  for (const entry of manifest.repos) {
    ctx.io.out(`  ${palette.green("+")} ${sanitizeLabel(entry.path)}\n`);
  }
  ctx.io.out(`  ${palette.dim(`tools: ${manifest.defaults.tools.join(", ")}`)}\n`);

  if (report.dryRun) {
    // The manifest IN FULL: a preview that omitted it would show a summary of a
    // file the operator is about to have written on their behalf.
    ctx.io.out(`\n${JSON.stringify(manifest, null, 2)}\n`);
    ctx.io.out(`${palette.dim("nothing was written — re-run without --dry-run to create it")}\n`);
    return;
  }
  ctx.io.out(`${palette.dim("run stamity workspace sync to apply this policy to every member")}\n`);
}

/**
 * `workspace init` end to end: refuse, scan, ask once, derive, write, report.
 *
 * The manifest is composed by `createWorkspaceManifest` and persisted by
 * `writeWorkspaceManifest` — never hand-serialized — so the guided path cannot
 * mint a shape the writer refuses, and the writer's own validation is what
 * keeps a bad composition off disk.
 */
async function runInit(
  ctx: CliContext,
  rootDir: string,
  opts: Record<string, unknown>,
): Promise<CommandResult> {
  const force = opts["force"] === true;
  const rawTools = opts["tools"];
  // Parsed FIRST, ahead of every probe and the question: a bad flag value
  // should interrupt nobody and cost no filesystem walk.
  const flagTools = typeof rawTools === "string" ? readToolsFlag(rawTools) : null;

  await assertCreatable(ctx, rootDir, force);

  const candidates = await ctx.engine.workspace.detect.detectSubRepos(rootDir, {
    maxDepth: SCAN_DEPTH,
  });
  if (candidates.length === 0) throw noCandidates(ctx, rootDir);

  const gate = promptGate({
    stdinIsTTY: ctx.terminal.stdinIsTTY,
    yes: ctx.yes,
    json: ctx.json,
    env: ctx.app.runtime.env,
  });
  const selected = await askMembers(ctx, gate, candidates);

  const path = join(rootDir, ctx.engine.workspace.model.WORKSPACE_MANIFEST_FILE);
  if (selected.length === 0) {
    renderKeepNone(ctx, rootDir);
    const empty: InitReport = {
      path,
      created: false,
      dryRun: ctx.dryRun,
      members: [],
      defaults: null,
      manifest: null,
    };
    return { exitCode: 0, json: { ...empty } };
  }

  const tools = flagTools ?? (await deriveDefaultTools(ctx, rootDir, selected));
  const manifest = ctx.engine.workspace.manifest.createWorkspaceManifest(
    { tools },
    selected.map((repo) => ({ path: repo.path })),
  );

  if (!ctx.dryRun) {
    await ctx.engine.workspace.manifest.writeWorkspaceManifest(rootDir, manifest);
  }

  const report: InitReport = {
    path,
    created: !ctx.dryRun,
    dryRun: ctx.dryRun,
    members: manifest.repos.map((entry) => entry.path),
    defaults: { tools: [...manifest.defaults.tools] },
    manifest,
  };
  renderCreated(ctx, report, manifest);
  return { exitCode: 0, json: { ...report } };
}

// ── workspace sync: the cascade ────────────────────────────────────────────

/**
 * `workspace sync` — the engine's cascade, driven by the bridge this file
 * supplies. Four properties carry the subcommand.
 *
 * **Persistent, not ambient.** The bridge writes what the workspace resolved
 * into the member's OWN `.stamity/manifest.json` before its emission is
 * planned, so the member is correct when somebody runs plain `stamity sync`
 * inside it — the single most likely thing to happen next. "Propagating policy"
 * means the workspace's values BECOME the member's values; anything else means
 * the member's real configuration and the workspace's intent disagree the
 * moment either is inspected.
 *
 * **THREE fields, and no more.** `tools`, `maturityTier` and `mcp` — the fields
 * emission actually reads off a member manifest. `selection` and
 * `lockedContent` resolve and are REPORTED, and are written nowhere:
 * `planSync` overwrites a member manifest's selection with the full corpus on
 * every run, so a written selection would be overwritten before it was read,
 * and `lockedContent`'s whole job is to refuse removals against that same
 * selection. Reporting rather than silently dropping is what keeps the manifest
 * honest — an author who writes a lock sees where it resolved and reads in the
 * same report that it does not yet change an emitted file.
 *
 * **One member's failure is one row.** The cascade catches every callback
 * rejection into a typed row and never stops the others. This layer adds two
 * refusals in that posture: a member with no readable setup manifest
 * ({@link missingMemberManifest}) and a member whose apply refused a path
 * ({@link refusedPaths}). Neither implicitly initialises anything — `stamity
 * init` makes decisions about a repository that a cascade over somebody else's
 * repository has no standing to make unattended.
 *
 * **Every run is a full re-run.** No member is skipped because a previous run
 * succeeded or because the journal says so. The idempotence a resume would buy
 * is already bought one layer down, where `applySync` reports every path
 * `unchanged` on a semver-equal re-run and bumps no mtime — and buying it again
 * up here would be a cache over a correct computation, keyed on a best-effort
 * audit file.
 */

/**
 * The member-manifest fields the bridge propagates, in the order the report
 * names them. A field the workspace does not declare is left exactly as the
 * member has it.
 */
const PROPAGATED_FIELDS = ["tools", "maturityTier", "mcp"] as const;
type PropagatedField = (typeof PROPAGATED_FIELDS)[number];

/** What the bridge did for one member, keyed back onto that member's row. */
interface MemberOutcome {
  /** Fields the patch changed, in {@link PROPAGATED_FIELDS} order. Empty = no write. */
  patched: PropagatedField[];
  /** Locked ids whose removal this member attempted and the lock refused. */
  lockedApplied: string[];
}

/** One member's row: the cascade's own verdict, plus what the bridge saw. */
interface SyncRepoRow extends WorkspaceRepoSyncRow {
  patched?: PropagatedField[];
  lockedApplied?: string[];
}

/**
 * The cascade report — the `--json` document, and the shape the render walks.
 *
 * `outcome`, `counts` and `journalWarnings` are the engine's result published
 * verbatim rather than reshaped, so the documented JSON shape and the engine
 * type cannot drift. The rows are the engine's too; the two bridge fields are
 * ADDED to them and overwrite nothing.
 */
interface SyncReport {
  root: string;
  dryRun: boolean;
  outcome: WorkspaceSyncOutcome;
  counts: WorkspaceSyncCounts;
  repos: SyncRepoRow[];
  journalWarnings: string[];
}

/**
 * Element-wise equality, order included.
 *
 * Emission itself does not care about order — both `tools` and an `mcp` block's
 * `servers` are folded into a `Set` before emission reads them
 * (`sync/engine.ts:526-527`) — so a pure reorder is not actually a different
 * list to emission. This function still treats it as one: the conservative
 * direction is to over-report a patch on a reorder, not to under-report a real
 * change, and a false patch here costs one extra manifest write rather than a
 * missed one.
 */
function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Equal MCP blocks. An absent block on the member is never equal to a declared one. */
function sameMcp(mine: McpConfig | undefined, theirs: McpConfig): boolean {
  return (
    mine !== undefined &&
    mine.protocolVersion === theirs.protocolVersion &&
    sameList(mine.servers, theirs.servers)
  );
}

/**
 * The patch the workspace owes this member, computed against the manifest READ
 * FROM DISK.
 *
 * A field the workspace does not declare produces no entry, so a member
 * carrying `maturityTier: "scaleup"` under a workspace that declares no tier
 * keeps it. An empty `fields` list is the whole of the no-op contract: the
 * caller writes nothing at all rather than writing an identical document, which
 * is what keeps `updatedAt` still on a member the workspace had nothing new to
 * say to.
 */
export function propagationPatch(
  manifest: SetupManifest,
  resolved: ResolvedRepoConfig,
): { patch: Partial<SetupManifest>; fields: PropagatedField[] } {
  const patch: Partial<SetupManifest> = {};
  const fields: PropagatedField[] = [];

  if (!sameList(manifest.tools, resolved.tools)) {
    patch.tools = [...resolved.tools];
    fields.push("tools");
  }
  if (resolved.maturityTier !== undefined && resolved.maturityTier !== manifest.maturityTier) {
    patch.maturityTier = resolved.maturityTier;
    fields.push("maturityTier");
  }
  if (resolved.mcp !== undefined && !sameMcp(manifest.mcp, resolved.mcp)) {
    // Copied, not aliased: the resolved config is already detached from the
    // workspace manifest, and copying again keeps the member's document from
    // sharing an array with the next member's resolution.
    patch.mcp = {
      servers: [...resolved.mcp.servers],
      ...(resolved.mcp.protocolVersion === undefined
        ? {}
        : { protocolVersion: resolved.mcp.protocolVersion }),
    };
    fields.push("mcp");
  }
  return { patch, fields };
}

/**
 * The row a registered member with no setup manifest earns.
 *
 * `VALIDATION_ERROR` rather than `FS_ERROR`: the manifest is wrong about the
 * world, not the filesystem failing. Both remedies are named in the same
 * sentence, the way `requireRepoDirectory` names clone-it-or-drop-it — and a
 * skip is not on offer, because skips are excluded from the verdict entirely,
 * so a workspace whose members were never initialised would report `passed`
 * having propagated nothing.
 */
function missingMemberManifest(ctx: CliContext, repoPath: string, memberDir: string): EngineError {
  return new EngineError(
    `Workspace member "${repoPath}" has no setup manifest at ` +
      `${join(memberDir, STATE_DIR, MANIFEST_FILE)}. Run \`stamity init\` in it, or drop the ` +
      `entry from repos[] in ${ctx.engine.workspace.model.WORKSPACE_MANIFEST_FILE}.`,
    { code: "VALIDATION_ERROR" },
  );
}

/** A member whose apply refused at least one path — the verdict `stamity sync` reaches. */
function refusedPaths(repoPath: string, refused: readonly string[]): EngineError {
  return new EngineError(
    `Workspace member "${repoPath}" refused ${String(refused.length)} path(s): ` +
      `${refused.join(", ")}. They collide with files the engine cannot prove it wrote; ` +
      `everything else in that member's plan is on disk. Move each aside and re-run, or ` +
      `re-run with --force to overwrite them after a verified .bak.`,
    { code: "ADAPTER_ERROR" },
  );
}

/**
 * The `RepoSyncCallback` this lane supplies: read, patch, write, plan, apply.
 *
 * Step order is the contract. The manifest patch lands BEFORE `planSync`, so
 * the plan is built from the values the workspace just wrote — and the manifest
 * `applySync` persists at its commit point carries them forward rather than
 * reverting them. The patch is applied to the manifest read in step 1 and never
 * to a freshly composed one: `SetupManifest` carries `ledger`, `importChoice`,
 * `createdAt` and `hooks`, and a composed manifest missing the ledger would
 * make every emitted path unowned, after which the reclaim sweep and the
 * collision gate would both act on that emptiness.
 *
 * Under `--dry-run` nothing is written on either side, and the plan is
 * therefore computed from the UNPATCHED manifest on disk. That is the honest
 * preview: it shows the patch it would apply and the plan the member has today,
 * rather than inventing a plan for a manifest that does not exist yet.
 */
function createBridge(
  ctx: CliContext,
  rootDir: string,
  opts: { force: boolean; now: Date },
  outcomes: Map<string, MemberOutcome>,
): RepoSyncCallback {
  const engineVersion = ctx.app.version;
  return async (repo: WorkspaceRepoEntry, resolved: ResolvedRepoConfig): Promise<void> => {
    const memberDir = join(rootDir, repo.path);

    const manifest = await ctx.engine.manifest.manifest.readManifest(memberDir);
    // A manifest that exists and does not parse propagates the reader's own
    // CONFIG_ERROR unchanged; `null` is the un-initialised case and earns this
    // row's own message.
    if (manifest === null) throw missingMemberManifest(ctx, repo.path, memberDir);

    const { patch, fields } = propagationPatch(manifest, resolved);
    // Recorded whatever happens next, so a member whose apply then fails still
    // reports the patch that reached its manifest.
    outcomes.set(repo.path, { patched: fields, lockedApplied: [...resolved.lockedApplied] });

    if (fields.length > 0 && !ctx.dryRun) {
      // `writeManifest` validates before persisting and writes atomically, so a
      // bad patch never reaches disk at all.
      await ctx.engine.manifest.manifest.writeManifest(
        memberDir,
        { ...manifest, ...patch },
        { now: opts.now },
      );
    }

    const plan = await planSync(memberDir, engineVersion);
    const applied = await applySync(memberDir, plan, {
      engineVersion,
      force: opts.force,
      dryRun: ctx.dryRun,
      now: opts.now,
    });
    if (applied.refused.length > 0) throw refusedPaths(repo.path, applied.refused);
  };
}

// ── Rendering the cascade ──────────────────────────────────────────────────

/** Column width for the painted cascade state: the longest member is `skipped`. */
const SYNC_STATE_WIDTH = Math.max(...["synced", "failed", "skipped"].map((state) => state.length));

/** Pad before painting, for the reason {@link paintState} pads before painting. */
function paintSyncState(state: SyncRepoRow["state"], palette: CliContext["palette"]): string {
  const token = state.padEnd(SYNC_STATE_WIDTH);
  if (state === "synced") return palette.green(token);
  if (state === "skipped") return palette.yellow(token);
  return palette.red(token);
}

/**
 * The right-hand column: the row's own reason when it did not sync, and what
 * the bridge did when it did. Every value here either originates in
 * `workspace.json` or names a path off the filesystem — content this process
 * did not author — so it goes through `sanitizeLabel`, the same sink the status
 * rows use for the same hazard.
 */
function renderSyncDetail(row: SyncRepoRow, dryRun: boolean): string {
  if (row.error !== undefined) return sanitizeLabel(`[${row.error.code}] ${row.error.message}`);
  if (row.skipReason !== undefined) return sanitizeLabel(row.skipReason);

  const patched = row.patched ?? [];
  const parts = [
    patched.length === 0
      ? "manifest already matched"
      : `${dryRun ? "would patch" : "patched"} ${patched.join(", ")}`,
  ];
  if ((row.lockedApplied ?? []).length > 0) {
    parts.push(`locked: ${(row.lockedApplied ?? []).join(", ")}`);
  }
  return sanitizeLabel(parts.join("  "));
}

/**
 * The one sentence REQ-WS-013 owes an author who wrote a selection or a lock
 * into `workspace.json`: both halves resolved, and neither changes a file yet.
 *
 * Conditional rather than unconditional, in the init panel's disclosure shape:
 * a workspace that declares neither has nothing to be told about, and a line
 * that prints on every cascade forever to say a feature did not apply is the
 * line operators learn to skip.
 */
function inertPolicyNotice(manifest: WorkspaceManifest, report: SyncReport): string | null {
  const declared =
    manifest.lockedContent !== undefined ||
    manifest.defaults.selection !== undefined ||
    (manifest.groups ?? []).some(
      (group) => group.addItems !== undefined || group.removeItems !== undefined,
    ) ||
    report.repos.some((row) => (row.lockedApplied ?? []).length > 0);
  if (!declared) return null;
  return (
    "selection deltas and locked content are resolved and reported above; they do not yet " +
    "change an emitted file"
  );
}

/**
 * The pre-flight line: the resolved root and how many members it declares,
 * printed BEFORE the cascade writes a single byte.
 *
 * `sync` is the one subcommand that writes, and it resolves its root the same
 * way `status` does — an ancestor walk from the cwd through
 * {@link requireWorkspaceRoot}, undocumented for this subcommand until this
 * line existed. Naming the root here, ahead of the writes it governs, is what
 * lets an operator running `sync` from a nested directory catch a
 * wrongly-resolved root before it rewrites every member's manifest, rather
 * than only after — the root line used to print at the TOP of the render, but
 * the render itself only ran once the cascade had already finished.
 */
function printSyncPreflight(ctx: CliContext, rootDir: string, memberCount: number): void {
  const { palette } = ctx;
  ctx.io.out(`${palette.bold("workspace")} ${sanitizeLabel(rootDir)}\n`);
  ctx.io.out(
    `  ${palette.dim(`resolved root, ${String(memberCount)} member${memberCount === 1 ? "" : "s"} declared`)}\n`,
  );
}

function renderSync(ctx: CliContext, manifest: WorkspaceManifest, report: SyncReport): void {
  const { palette } = ctx;
  if (report.repos.length === 0) {
    ctx.io.out(`  ${palette.dim("no members registered — add repos[] entries to workspace.json")}\n`);
  } else {
    const width = Math.max(...report.repos.map((row) => sanitizeLabel(row.repoPath).length));
    for (const row of report.repos) {
      ctx.io.out(
        `  ${paintSyncState(row.state, palette)}  ${sanitizeLabel(row.repoPath).padEnd(width)}  ` +
          `${renderSyncDetail(row, report.dryRun)}\n`,
      );
    }
  }

  const { total, succeeded, failed, skipped } = report.counts;
  const tally = [
    `${String(succeeded)} synced`,
    `${String(failed)} failed`,
    ...(skipped === 0 ? [] : [`${String(skipped)} skipped`]),
  ].join(", ");
  ctx.io.out(
    `  ${String(total)} member${total === 1 ? "" : "s"}: ${tally} — ` +
      `${report.outcome === "passed" ? palette.green(report.outcome) : palette.red(report.outcome)}\n`,
  );

  const notice = inertPolicyNotice(manifest, report);
  if (notice !== null) ctx.io.out(`${palette.dim(notice)}\n`);

  // Journal problems are an audit-trail loss, not a propagation failure, so
  // they print beside the verdict rather than turning a row red.
  for (const warning of report.journalWarnings) ctx.io.err(`warning: ${warning}\n`);

  ctx.io.out(
    report.dryRun
      ? `${palette.dim("nothing was written — re-run without --dry-run to apply this policy")}\n`
      : `${palette.dim("run stamity workspace status to see what each member now declares")}\n`,
  );
}

/**
 * Refuses two `repos[]` entries that resolve to the same directory through a
 * link before the cascade touches either of them.
 *
 * Duplicate detection at manifest-read time (`normalizeRepoPathKey`,
 * `../../workspace/manifest.ts`) is textual — it compares declared SPELLINGS —
 * while containment is realpath-resolved (`classifyMemberDir`, above). A
 * `repos[]` entry that is a symlink to a SIBLING member's directory passes the
 * textual check (the spellings differ) and passes containment (both stay
 * inside the root), so both rows would cascade concurrently into one real
 * directory: the read-modify-write on that directory's `.stamity/manifest.json`
 * races, a write can be lost, and a later sync misclassifies what it finds.
 * This check closes that gap the way the textual one closes its own — by
 * refusing before either row is attempted, naming both declared paths.
 *
 * Absent or unreadable entries are skipped: `classifyMemberDir` and the
 * cascade's own `requireRepoDirectory` already report those states on their
 * own, and an alias check has nothing to say about a member that is not there.
 */
async function refuseRealpathAliases(
  rootDir: string,
  repos: readonly WorkspaceRepoEntry[],
): Promise<void> {
  const resolved = await Promise.all(
    repos.map(async (entry) => {
      try {
        return { path: entry.path, real: await realpath(join(rootDir, entry.path)) };
      } catch {
        return null;
      }
    }),
  );
  const byReal = new Map<string, string[]>();
  for (const row of resolved) {
    if (row === null) continue;
    const existing = byReal.get(row.real);
    if (existing === undefined) byReal.set(row.real, [row.path]);
    else existing.push(row.path);
  }
  for (const paths of byReal.values()) {
    if (paths.length < 2) continue;
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `repos[] entries ${paths.map((p) => JSON.stringify(p)).join(" and ")} resolve to the same directory`,
      why:
        "a symlink alias passes the manifest's textual duplicate check, and two entries cascading " +
        "into one real directory would race that directory's manifest write concurrently",
      next:
        "keep one entry and drop the other from repos[] in workspace.json, or replace the symlink " +
        "with the real path it points at",
    });
  }
}

/**
 * `workspace sync` end to end: resolve the root, read the manifest, drive the
 * cascade, map its verdict onto the exit contract.
 *
 * The concurrency and the journal are the engine's own — no flag in v1 — except
 * that a preview passes `journal: false`. That is the sharp case rather than
 * tidiness: the journal's whole value is that a `started` line with no terminal
 * line means a crash, and a dry run appending one would manufacture that
 * signal.
 *
 * `partial` exits 1 with `failed`. A workspace lead running this in CI would
 * otherwise get a green run for a cascade that reached half its members.
 */
async function runSync(
  ctx: CliContext,
  cwd: string,
  opts: Record<string, unknown>,
): Promise<CommandResult> {
  const rootDir = await requireWorkspaceRoot(ctx, cwd);
  const manifest = await requireWorkspaceManifest(ctx, rootDir);
  await refuseRealpathAliases(rootDir, manifest.repos);
  const now = ctx.app.runtime.clock.now();
  const outcomes = new Map<string, MemberOutcome>();

  // Named BEFORE the cascade writes a single byte — see {@link printSyncPreflight}.
  printSyncPreflight(ctx, rootDir, manifest.repos.length);

  ctx.spinner.start(ctx.dryRun ? "previewing the cascade…" : "syncing every member…");
  const result = await ctx.engine.workspace.sync.syncWorkspaceRepos({
    rootDir,
    manifest,
    journal: !ctx.dryRun,
    syncRepo: createBridge(ctx, rootDir, { force: opts["force"] === true, now }, outcomes),
  });
  ctx.spinner.stop();

  const report: SyncReport = {
    root: rootDir,
    dryRun: ctx.dryRun,
    outcome: result.outcome,
    counts: result.counts,
    repos: result.repos.map((row): SyncRepoRow => {
      // A row the bridge never reached — an absent directory, a duplicate entry
      // — has no patch and no resolution to report, so it carries neither key
      // rather than an empty one.
      const seen = outcomes.get(row.repoPath);
      if (seen === undefined) return row;
      return {
        ...row,
        patched: seen.patched,
        ...(seen.lockedApplied.length === 0 ? {} : { lockedApplied: seen.lockedApplied }),
      };
    }),
    journalWarnings: result.journalWarnings,
  };

  renderSync(ctx, manifest, report);
  return { exitCode: report.outcome === "passed" ? 0 : 1, json: { ...report } };
}

export const workspaceCommand: CommandModule = {
  name: "workspace",
  summary: "one policy across several repositories: status, guided creation, and the cascade",
  // `init` writes workspace.json and `sync` rewrites member manifests, so the
  // shared --dry-run flag registers. It is inert on `status`, which is a read.
  mutating: true,
  args: [
    // The description is copied verbatim into the generated `docs/cli-reference.md`
    // (`../docs/cliReference.ts`, byte-gated by its suite), so editing this
    // string is a docs change: regenerate the page in the same change.
    {
      name: "subcommand",
      description: "status | init | sync — omit for status",
      required: false,
    },
  ],

  /**
   * Commander registers flags per COMMAND, not per subcommand, so both of these
   * are visible everywhere and are inert wherever the subcommand does not read
   * them — `--tools` on everything but `init`, `--force` on `status` alone,
   * since `sync` gives it the second meaning its description names. The
   * descriptions say which subcommand reads them rather than leaving a reader
   * of `--help` (and of the generated reference page, which copies these
   * strings verbatim) to find out by trying. Editing either string is a docs
   * change: regenerate `docs/cli-reference.md` in the same commit.
   */
  configure(cmd: Command): void {
    cmd.option(
      "--tools <csv>",
      `defaults.tools for the created workspace, comma-separated (${TOOLS.join(", ")}) — workspace init only`,
    );
    cmd.option(
      "--force",
      "workspace init: overwrite a workspace.json already at this directory, or create one nested inside an outer workspace. workspace sync: in every member, overwrite colliding unmanaged files after a verified .bak",
    );
  },

  run: async (ctx, opts, args): Promise<CommandResult> => {
    const cwd = ctx.app.runtime.cwd;
    const [subcommand] = args;

    // Bare `workspace` is status on EVERY stream, terminal included: there is no
    // key registry here for a picker to navigate.
    if (subcommand === undefined) return runStatus(ctx, cwd);

    switch (subcommand) {
      case "status":
        return runStatus(ctx, cwd);
      case "init":
        return runInit(ctx, cwd, opts);
      case "sync":
        return runSync(ctx, cwd, opts);
      default:
        throw new CliFailure({
          code: "USAGE",
          message: `unknown workspace subcommand ${JSON.stringify(subcommand)}`,
          why: "workspace takes one of three subcommands",
          next: `use one of: ${SUBCOMMANDS.join(", ")}`,
        });
    }
  },
};
