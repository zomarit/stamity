import { realpath, stat } from "node:fs/promises";
import { cpus } from "node:os";
import { join, sep } from "node:path";
import pLimit from "p-limit";
import { appendAuditLine } from "../resilience/failureLog.ts";
import { getRunId } from "../shared/runId.ts";
import { EngineError, type ErrorCode } from "../types/errors.ts";
import { STATE_DIR } from "../types/markers.ts";
import { normalizeRepoPathKey } from "./manifest.ts";
import {
  WORKSPACE_MANIFEST_FILE,
  type WorkspaceManifest,
  type WorkspaceRepoEntry,
  type WorkspaceRepoSyncError,
  type WorkspaceRepoSyncResult,
  type WorkspaceSyncCounts,
  type WorkspaceSyncOutcome,
  type WorkspaceSyncResult,
} from "./model.ts";
import { resolveRepoConfig, type ResolvedRepoConfig } from "./resolve.ts";

/**
 * The cascade: walk a workspace's members, resolve what each one is owed, and
 * hand it to the sync callback — bounded, journalled, and aggregated into one
 * verdict.
 *
 * The per-member work is INJECTED rather than implemented here. Regenerating a
 * member's files needs the adapters; propagating policy to it does not. Keeping
 * the callback at the boundary leaves this module testable without a single
 * generated file, and keeps the cascade's actual subject — ordering, bounding,
 * failure isolation, and the crash trail — in one readable place.
 *
 * Three invariants carry the design:
 *
 * - **One bad member never stops the cascade.** Every callback rejection is
 *   caught and classified into a typed {@link WorkspaceRepoSyncError} on that
 *   member's row. A lead syncing twelve repos wants the eleven that worked plus
 *   the name of the one that did not, not an abort on the third.
 * - **Bounded fan-out.** Members are independent, so they run in parallel — but
 *   each writes a small tree of files, so the bottleneck is small-file write
 *   throughput, not CPU. {@link defaultSyncConcurrency} caps the default at
 *   {@link MAX_SYNC_CONCURRENCY} so a 32-core runner does not put 32 write fans
 *   on one volume's I/O queue.
 * - **A crash leaves a trail.** Each attempted member appends a `started` line
 *   before its callback runs and a terminal line after. A `started` with no
 *   terminal line names the member that was in flight when the process died —
 *   the one whose tree may be half-written — so an interrupted cascade is
 *   diagnosable and resumable instead of merely lost.
 *
 * The journal is best-effort by construction: a cascade that wrote every
 * member's files correctly must not report failure because an audit line could
 * not be appended, so the first journal error disables journalling for the rest
 * of the run and surfaces one warning on the result.
 *
 * Two paths out of this module used to leave the workspace root the design above
 * assumes they stay inside. The journal appended through whatever stood at its
 * name, so a planted link redirected the crash trail outside the tree; it now
 * goes through the contained append in `../resilience/failureLog.ts` with the
 * workspace root as its boundary. And a member entry was checked for SHAPE and
 * never resolved, so a symlinked member directory took the whole cascade — every
 * generated file for that member — somewhere the root does not reach;
 * {@link requireRepoDirectory} now resolves both ends and refuses the escape.
 */

// ── Constants ──────────────────────────────────────────────────────────────

/** Journal filename, written under `<workspaceRoot>/{@link STATE_DIR}/`. */
export const WORKSPACE_SYNC_JOURNAL_FILE = "workspace-sync-journal.jsonl";

/**
 * Default parallel-member ceiling. Eight rather than the core count because a
 * member sync is write-heavy and disk-bound: past single-digit concurrent
 * writers on shared CI storage, throughput plateaus while tail latency climbs.
 * An operator who measured their own storage raises it through
 * {@link WorkspaceSyncOptions.concurrency}, which is deliberately not clamped
 * to this ceiling — the cap picks a safe default on unknown hardware, it does
 * not overrule a deliberate choice.
 */
const MAX_SYNC_CONCURRENCY = 8;

/** Failure text kept on a journal line; the full message rides on the result row. */
const JOURNAL_MESSAGE_LIMIT = 200;

/**
 * Errnos that place a callback failure in the `FS_ERROR` class. The write-side
 * table in `../merge/fsErrors.ts` covers a narrower set on purpose — it exists
 * to phrase one write failure, while this set only has to classify one, so it
 * also carries the shape errors (`ENOTDIR`, `EISDIR`, `ELOOP`) and the
 * contention codes concurrent member syncs can raise.
 */
const FILESYSTEM_ERRNOS: ReadonlySet<string> = new Set([
  "EACCES",
  "EBUSY",
  "EDQUOT",
  "EEXIST",
  "EFBIG",
  "EIO",
  "EISDIR",
  "ELOOP",
  "EMFILE",
  "ENAMETOOLONG",
  "ENFILE",
  "ENOENT",
  "ENOSPC",
  "ENOTDIR",
  "ENOTEMPTY",
  "EPERM",
  "EROFS",
  "EXDEV",
]);

// ── Types ──────────────────────────────────────────────────────────────────

/** Fields every journal line carries. */
interface JournalLineBase {
  /** ISO-8601 append time. */
  ts: string;
  /**
   * Correlation id for this process's cascade. The journal is append-only
   * across runs, so without it a reader cannot tell an unterminated `started`
   * line from this run apart from one left by a crash three runs ago.
   */
  run: string;
  /** The member path exactly as the manifest declares it. */
  repo: string;
}

/**
 * One journal line. A union rather than one optional-heavy record so a reader
 * that narrows on `event`/`status` gets the fields that line actually carries.
 */
export type WorkspaceSyncJournalEntry =
  | (JournalLineBase & { event: "started" })
  | (JournalLineBase & { event: "skipped"; reason: string })
  | (JournalLineBase & { event: "finished"; status: "ok" })
  | (JournalLineBase & {
      event: "finished";
      status: "failed";
      code: ErrorCode;
      message: string;
    });

/**
 * The per-member work the cascade drives. Receives the manifest entry and the
 * config resolution decided it is owed; a rejection is isolated to that
 * member's row and never reaches the other members.
 */
export type RepoSyncCallback = (
  repo: WorkspaceRepoEntry,
  resolved: ResolvedRepoConfig,
) => Promise<void>;

export interface WorkspaceSyncOptions {
  /** The workspace root — the directory holding `workspace.json`. */
  rootDir: string;
  /** The manifest driving the cascade, already read and validated. */
  manifest: WorkspaceManifest;
  /** Per-member work. See {@link RepoSyncCallback}. */
  syncRepo: RepoSyncCallback;
  /** Parallel-member limit; floored at 1. Defaults to {@link defaultSyncConcurrency}. */
  concurrency?: number;
  /** Write the crash journal. Default `true`; `false` leaves the disk untouched. */
  journal?: boolean;
  /** Fixed clock for journal timestamps. Defaults to the wall clock at append time. */
  now?: Date;
}

/**
 * One member's row. `ok` is the model's failure bit and a skip is not a
 * failure, so `state` is what separates a member that synced from one the
 * cascade never attempted.
 */
export interface WorkspaceRepoSyncRow extends WorkspaceRepoSyncResult {
  state: "synced" | "failed" | "skipped";
  /** Why the entry was passed over. Present exactly when `state` is `"skipped"`. */
  skipReason?: string;
}

/** The cascade's result: the model's verdict plus this run's journal warnings. */
export interface WorkspaceCascadeResult extends WorkspaceSyncResult {
  repos: WorkspaceRepoSyncRow[];
  /**
   * Journal problems, at most one per run. A journal failure is an audit-trail
   * loss, not a propagation failure, so it lands here instead of turning a
   * member's row red or the verdict to `partial`.
   */
  journalWarnings: string[];
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Classify a thrown value into a typed per-member error.
 *
 * An {@link EngineError} already carries its class, so its code is kept as
 * thrown. A Node errno error is placed by {@link FILESYSTEM_ERRNOS}. Everything
 * else — including a non-`Error` rejection — is `UNKNOWN_ERROR` with the value
 * stringified: a callback that rejects with a string still has to produce a row
 * an operator can read.
 *
 * The message is never rewritten, only classified. Substituting a generic
 * sentence would cost the one detail that identifies the failure.
 */
export function toRepoSyncError(repoPath: string, err: unknown): WorkspaceRepoSyncError {
  if (err instanceof EngineError) {
    return { repoPath, code: err.code, message: err.message };
  }
  const errno = (err as { code?: unknown } | null | undefined)?.code;
  const code: ErrorCode =
    typeof errno === "string" && FILESYSTEM_ERRNOS.has(errno) ? "FS_ERROR" : "UNKNOWN_ERROR";
  return { repoPath, code, message: err instanceof Error ? err.message : String(err) };
}

/**
 * The verdict for a finished cascade.
 *
 * Skipped members are excluded from the judgement entirely: they were never
 * attempted, so they can neither prove the run healthy nor condemn it. That
 * makes an empty cascade `passed` — nothing to propagate is not a failure — and
 * makes a run whose only attempted member failed `failed` rather than `partial`
 * just because a duplicate entry was passed over beside it.
 */
export function computeWorkspaceSyncOutcome(counts: WorkspaceSyncCounts): WorkspaceSyncOutcome {
  if (counts.failed === 0) return "passed";
  return counts.succeeded === 0 ? "failed" : "partial";
}

/**
 * Default parallel-member limit: the core count, floored at 1 and capped at
 * {@link MAX_SYNC_CONCURRENCY}. `cpuCount` is a parameter so the bound is
 * testable without stubbing `os`; containers that report zero cores get 1
 * rather than a limiter that never starts anything.
 */
export function defaultSyncConcurrency(cpuCount: number = cpus().length): number {
  if (!Number.isFinite(cpuCount)) return 1;
  return Math.min(Math.max(Math.floor(cpuCount), 1), MAX_SYNC_CONCURRENCY);
}

/** One member entry, and the earlier entry naming the same directory if any. */
interface CascadeTarget {
  entry: WorkspaceRepoEntry;
  duplicateOf: string | null;
}

/**
 * Pair each entry with the earlier entry that already claimed its directory.
 *
 * `readWorkspaceManifest` rejects duplicates, so reaching one here means the
 * manifest bypassed that gate (hand-built in a test, or constructed in memory).
 * Running it twice would put two writers on one directory, and resolution would
 * hand both the FIRST entry's config anyway — so the later occurrence is passed
 * over rather than synced under a config it does not own.
 */
function planTargets(repos: readonly WorkspaceRepoEntry[]): CascadeTarget[] {
  const firstByKey = new Map<string, string>();
  return repos.map((entry) => {
    const key = normalizeRepoPathKey(entry.path);
    const first = firstByKey.get(key);
    if (first === undefined) {
      firstByKey.set(key, entry.path);
      return { entry, duplicateOf: null };
    }
    return { entry, duplicateOf: first };
  });
}

/** An explicit request wins over the default ceiling; a nonsense value floors at 1. */
function resolveConcurrency(requested: number | undefined): number {
  if (requested === undefined) return defaultSyncConcurrency();
  return Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : 1;
}

// ── Journal ────────────────────────────────────────────────────────────────

interface SyncJournal {
  /** Appends one line. Never rejects — a journal problem lands in `warnings`. */
  record(entry: WorkspaceSyncJournalEntry): Promise<void>;
  readonly warnings: string[];
}

/**
 * The append-only crash journal.
 *
 * Appends are chained through one queue so concurrent members cannot interleave
 * a half-written line, and the first failure latches journalling off for the
 * rest of the run: one warning naming the file is what an operator can act on,
 * where one per member per line would bury the member results underneath it.
 */
function createJournal(rootDir: string, enabled: boolean): SyncJournal {
  const warnings: string[] = [];
  if (!enabled) return { warnings, record: () => Promise.resolve() };

  const path = join(rootDir, STATE_DIR, WORKSPACE_SYNC_JOURNAL_FILE);
  let live = true;

  const disable = (err: unknown): void => {
    live = false;
    warnings.push(
      `Sync journal disabled after a failed write to ${path}: ` +
        `${err instanceof Error ? err.message : String(err)}. ` +
        `The cascade continued and member results are unaffected.`,
    );
  };

  // The state directory may not exist yet on a workspace root that has never
  // been synced. `appendAuditLine` creates it as part of the append — after the
  // containment check, which has to run before any `mkdir -p` builds a path
  // through a planted directory link — so a cascade with nothing to journal (an
  // empty workspace, which never calls `record`) still leaves no directory
  // behind.
  let queue: Promise<void> = Promise.resolve();

  const record = (entry: WorkspaceSyncJournalEntry): Promise<void> => {
    // The queue itself must never reject: a member row would then inherit a
    // journalling problem as its own failure. A refused target — a link at the
    // journal name, a directory component pointing out of the workspace — lands
    // here as one warning naming the file, which is the same degradation an
    // unwritable directory already took.
    const next = queue.then(async () => {
      if (!live) return;
      try {
        await appendAuditLine(path, `${JSON.stringify(entry)}\n`, { boundaryDir: rootDir });
      } catch (err) {
        disable(err);
      }
    });
    queue = next;
    return next;
  };

  return { warnings, record };
}

// ── Cascade ────────────────────────────────────────────────────────────────

/**
 * Fail the member when its directory is missing, is not a directory, or does not
 * physically sit under the workspace root.
 *
 * Checked here rather than left to the callback so every implementation reports
 * the same typed `FS_ERROR` with the same fix, instead of each surfacing
 * whatever errno its first write happened to raise.
 *
 * The containment half is the one a shape check cannot answer. `readWorkspaceManifest`
 * validates the DECLARED path — relative, no `..`, no absolute spelling — which
 * says where the entry points textually and nothing about where it lands: a
 * `packages/web` that is a symbolic link to `/etc` passes every shape rule and
 * then takes the member's whole generated tree there. Both ends are resolved
 * through `realpath` and compared, so a root reached through an ancestor link
 * (macOS `/var` → `/private/var`, a projects directory moved to another volume)
 * is compared on equal terms with its member instead of failing a spelling
 * mismatch. A link that stays inside the root is legitimate and passes.
 *
 * A resolution that fails after `stat` already succeeded is refused rather than
 * waved through: an unanswerable containment question is not a positive answer.
 */
async function requireRepoDirectory(rootDir: string, repoPath: string): Promise<void> {
  const dir = join(rootDir, repoPath);
  let entry;
  try {
    entry = await stat(dir);
  } catch (err) {
    const errno = (err as NodeJS.ErrnoException).code;
    throw new EngineError(
      errno === "ENOENT"
        ? `Workspace member "${repoPath}" is registered but ${dir} does not exist. ` +
          `Clone or create it, or drop the entry from repos[] in ${WORKSPACE_MANIFEST_FILE}.`
        : `Workspace member "${repoPath}" at ${dir} could not be read (${errno ?? "unknown error"}). ` +
          `Check its permissions, or drop the entry from repos[] in ${WORKSPACE_MANIFEST_FILE}.`,
      { code: "FS_ERROR", cause: err },
    );
  }
  if (!entry.isDirectory()) {
    throw new EngineError(
      `Workspace member "${repoPath}" resolves to ${dir}, which is not a directory. ` +
        `Point the entry at the repository directory in ${WORKSPACE_MANIFEST_FILE}.`,
      { code: "FS_ERROR" },
    );
  }

  let root: string;
  let member: string;
  try {
    [root, member] = await Promise.all([realpath(rootDir), realpath(dir)]);
  } catch (err) {
    throw new EngineError(
      `Workspace member "${repoPath}" at ${dir} could not be resolved to a real path ` +
        `(${(err as NodeJS.ErrnoException).code ?? "unknown error"}), so the cascade cannot ` +
        `confirm it stays inside the workspace. Nothing was written for it. Replace it with a ` +
        `real directory, or drop the entry from repos[] in ${WORKSPACE_MANIFEST_FILE}.`,
      { code: "FS_ERROR", cause: err },
    );
  }
  if (member !== root && !member.startsWith(join(root, sep))) {
    throw new EngineError(
      `Workspace member "${repoPath}" resolves to ${member}, outside the workspace root ${root}. ` +
        `A symbolic link on its path points out of the tree this cascade is confined to, and ` +
        `syncing it would write a member's whole generated tree there. Nothing was written for ` +
        `it. Replace the link with the real directory, or drop the entry from repos[] in ` +
        `${WORKSPACE_MANIFEST_FILE}.`,
      { code: "FS_ERROR" },
    );
  }
}

/**
 * Run one cascade over `manifest.repos`, in declaration order, at most
 * {@link WorkspaceSyncOptions.concurrency} members at a time.
 *
 * Never rejects for a member's sake: every member failure becomes a row, and
 * the returned rows stay in manifest order regardless of completion order, so
 * two runs over one manifest produce the same report.
 */
export async function syncWorkspaceRepos(
  opts: WorkspaceSyncOptions,
): Promise<WorkspaceCascadeResult> {
  const journal = createJournal(opts.rootDir, opts.journal ?? true);
  const run = getRunId();
  // A caller-supplied clock stamps every line of the run identically, which is
  // what makes journal assertions exact instead of approximate.
  const ts = (): string => (opts.now ?? new Date()).toISOString();
  const limit = pLimit(resolveConcurrency(opts.concurrency));

  const repos = await limit.map(
    planTargets(opts.manifest.repos),
    async (target): Promise<WorkspaceRepoSyncRow> => {
      const repo = target.entry.path;

      if (target.duplicateOf !== null) {
        const reason =
          `duplicate of the earlier entry "${target.duplicateOf}" — ` +
          `one directory is one cascade target`;
        await journal.record({ ts: ts(), run, repo, event: "skipped", reason });
        return { repoPath: repo, ok: true, state: "skipped", skipReason: reason };
      }

      await journal.record({ ts: ts(), run, repo, event: "started" });
      try {
        await requireRepoDirectory(opts.rootDir, repo);
        await opts.syncRepo(target.entry, resolveRepoConfig(opts.manifest, repo));
      } catch (err) {
        const error = toRepoSyncError(repo, err);
        await journal.record({
          ts: ts(),
          run,
          repo,
          event: "finished",
          status: "failed",
          code: error.code,
          message: error.message.slice(0, JOURNAL_MESSAGE_LIMIT),
        });
        return { repoPath: repo, ok: false, error, state: "failed" };
      }
      await journal.record({ ts: ts(), run, repo, event: "finished", status: "ok" });
      return { repoPath: repo, ok: true, state: "synced" };
    },
  );

  const counts: WorkspaceSyncCounts = {
    total: repos.length,
    succeeded: repos.filter((row) => row.state === "synced").length,
    failed: repos.filter((row) => row.state === "failed").length,
    skipped: repos.filter((row) => row.state === "skipped").length,
  };

  return {
    outcome: computeWorkspaceSyncOutcome(counts),
    counts,
    repos,
    journalWarnings: journal.warnings,
  };
}
