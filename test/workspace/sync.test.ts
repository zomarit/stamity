import { mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { EngineError } from "../../src/types/errors.ts";
import { STATE_DIR } from "../../src/types/markers.ts";
import {
  WORKSPACE_MANIFEST_VERSION,
  type WorkspaceManifest,
  type WorkspaceRepoEntry,
  type WorkspaceSyncCounts,
} from "../../src/workspace/model.ts";
import type { ResolvedRepoConfig } from "../../src/workspace/resolve.ts";
import {
  computeWorkspaceSyncOutcome,
  defaultSyncConcurrency,
  syncWorkspaceRepos,
  toRepoSyncError,
  WORKSPACE_SYNC_JOURNAL_FILE,
  type RepoSyncCallback,
  type WorkspaceRepoSyncRow,
  type WorkspaceSyncJournalEntry,
} from "../../src/workspace/sync.ts";
import { useTempDir, type TempDirHandle } from "../support/tempDir.ts";

/**
 * The classifiers and the verdict run on data alone. The cascade itself uses
 * real temp directories rather than the virtual-fs lane: it stats member
 * directories and appends to a journal file through `node:fs/promises` with no
 * injected seam, and the journal-failure case is forced with an on-disk shape
 * (a directory where the file belongs) that only a real filesystem produces.
 */
const getRoot = useTempDir("workspace-sync");

function manifestOf(
  repos: WorkspaceRepoEntry[],
  overrides: Partial<WorkspaceManifest> = {},
): WorkspaceManifest {
  return {
    version: WORKSPACE_MANIFEST_VERSION,
    defaults: {
      tools: ["claude"],
      selection: { items: { agent: ["reviewer"], skill: [], rule: [], command: [] } },
    },
    repos,
    ...overrides,
  };
}

function countsOf(partial: Partial<WorkspaceSyncCounts>): WorkspaceSyncCounts {
  return { total: 0, succeeded: 0, failed: 0, skipped: 0, ...partial };
}

async function seedRepos(root: TempDirHandle, ...paths: string[]): Promise<void> {
  await Promise.all(paths.map((path) => mkdir(root.path(path), { recursive: true })));
}

function journalPath(rootDir: string): string {
  return join(rootDir, STATE_DIR, WORKSPACE_SYNC_JOURNAL_FILE);
}

/** Reads the journal as parsed lines, failing the test if any line is not JSON. */
async function readJournal(rootDir: string): Promise<WorkspaceSyncJournalEntry[]> {
  const raw = await readFile(journalPath(rootDir), "utf8");
  expect(raw.endsWith("\n")).toBe(true);
  return raw
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as WorkspaceSyncJournalEntry);
}

/** Rejects with a value the type system does not know is an `Error`. */
async function rejectWith(value: unknown): Promise<never> {
  throw value;
}

const noSyncWork: RepoSyncCallback = async () => {};

const FIXED_NOW = new Date("2026-08-13T09:30:00.000Z");

/** Stand-in for the out-of-tree file a planted link aims a write at. */
const VICTIM_BYTES = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5-operator-key\n";

describe("defaultSyncConcurrency", () => {
  it("caps at eight so a large runner does not fan writes wider than the disk serves", () => {
    expect(defaultSyncConcurrency(32)).toBe(8);
    expect(defaultSyncConcurrency(8)).toBe(8);
  });

  it("tracks the core count below the cap", () => {
    expect(defaultSyncConcurrency(1)).toBe(1);
    expect(defaultSyncConcurrency(3)).toBe(3);
  });

  it("floors at one for a host that reports no usable core count", () => {
    expect(defaultSyncConcurrency(0)).toBe(1);
    expect(defaultSyncConcurrency(-4)).toBe(1);
    expect(defaultSyncConcurrency(Number.NaN)).toBe(1);
  });

  it("reads the host core count when none is given", () => {
    const value = defaultSyncConcurrency();
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(8);
  });
});

describe("toRepoSyncError", () => {
  it("keeps an engine error's class and message", () => {
    const error = new EngineError("workspace.json names an undefined group", {
      code: "VALIDATION_ERROR",
    });
    expect(toRepoSyncError("apps/web", error)).toEqual({
      repoPath: "apps/web",
      code: "VALIDATION_ERROR",
      message: "workspace.json names an undefined group",
    });
  });

  it("classifies a filesystem errno as FS_ERROR", () => {
    const errno = Object.assign(new Error("EACCES: permission denied, open '.stamity/manifest.json'"), {
      code: "EACCES",
    });
    expect(toRepoSyncError("services/api", errno)).toEqual({
      repoPath: "services/api",
      code: "FS_ERROR",
      message: "EACCES: permission denied, open '.stamity/manifest.json'",
    });
  });

  it("falls back to UNKNOWN_ERROR for an unclassified error", () => {
    const result = toRepoSyncError("apps/web", new TypeError("adapter is not a function"));
    expect(result).toEqual({
      repoPath: "apps/web",
      code: "UNKNOWN_ERROR",
      message: "adapter is not a function",
    });
  });

  it("stringifies a non-Error rejection under UNKNOWN_ERROR", () => {
    expect(toRepoSyncError("apps/web", "callback exploded")).toEqual({
      repoPath: "apps/web",
      code: "UNKNOWN_ERROR",
      message: "callback exploded",
    });
    expect(toRepoSyncError("apps/web", 42).message).toBe("42");
    expect(toRepoSyncError("apps/web", undefined).message).toBe("undefined");
  });
});

describe("computeWorkspaceSyncOutcome", () => {
  it("passes when every attempted member synced", () => {
    expect(computeWorkspaceSyncOutcome(countsOf({ total: 3, succeeded: 3 }))).toBe("passed");
  });

  it("reports partial for any mix of success and failure", () => {
    expect(computeWorkspaceSyncOutcome(countsOf({ total: 3, succeeded: 2, failed: 1 }))).toBe(
      "partial",
    );
  });

  it("fails when every attempted member errored", () => {
    expect(computeWorkspaceSyncOutcome(countsOf({ total: 2, failed: 2 }))).toBe("failed");
  });

  it("passes an empty cascade — nothing to propagate is not a failure", () => {
    expect(computeWorkspaceSyncOutcome(countsOf({}))).toBe("passed");
  });

  it("leaves skipped members out of the verdict", () => {
    expect(computeWorkspaceSyncOutcome(countsOf({ total: 2, skipped: 2 }))).toBe("passed");
    // The one member the cascade attempted failed, so a duplicate passed over
    // beside it must not soften the verdict to `partial`.
    expect(computeWorkspaceSyncOutcome(countsOf({ total: 2, failed: 1, skipped: 1 }))).toBe(
      "failed",
    );
  });
});

describe("syncWorkspaceRepos", () => {
  it("passes a workspace with no members without touching the disk", async () => {
    const root = getRoot();
    let calls = 0;

    const result = await syncWorkspaceRepos({
      rootDir: root.dir,
      manifest: manifestOf([]),
      syncRepo: async () => {
        calls += 1;
      },
    });

    expect(result.outcome).toBe("passed");
    expect(result.counts).toEqual(countsOf({}));
    expect(result.repos).toEqual([]);
    expect(result.journalWarnings).toEqual([]);
    expect(calls).toBe(0);
    // Journalling is on by default, but a cascade with nothing to record must not
    // leave a state directory behind on a root it never wrote to.
    expect(await readdir(root.dir)).toEqual([]);
  });

  it("hands each member the config resolution decided it is owed", async () => {
    const root = getRoot();
    await seedRepos(root, "apps/web", "services/api");
    const resolvedByRepo = new Map<string, ResolvedRepoConfig>();

    const result = await syncWorkspaceRepos({
      rootDir: root.dir,
      manifest: manifestOf(
        [
          { path: "apps/web", groups: ["frontend"] },
          { path: "services/api", overrides: { tools: ["codex"] } },
        ],
        { groups: [{ name: "frontend", addItems: { rule: ["a11y"] }, toolOverrides: ["cursor"] }] },
      ),
      syncRepo: async (repo, resolved) => {
        resolvedByRepo.set(repo.path, resolved);
      },
      journal: false,
    });

    expect(result.outcome).toBe("passed");
    expect(result.counts).toEqual(countsOf({ total: 2, succeeded: 2 }));
    expect(result.repos.map((row) => row.repoPath)).toEqual(["apps/web", "services/api"]);
    expect(resolvedByRepo.get("apps/web")?.tools).toEqual(["cursor"]);
    expect(resolvedByRepo.get("apps/web")?.selection.items.rule).toEqual(["a11y"]);
    expect(resolvedByRepo.get("services/api")?.tools).toEqual(["codex"]);
    expect(resolvedByRepo.get("services/api")?.selection.items.rule).toEqual([]);
  });

  it("isolates a failing member and still finishes the rest", async () => {
    const root = getRoot();
    await seedRepos(root, "a", "b", "c");
    const synced: string[] = [];

    const result = await syncWorkspaceRepos({
      rootDir: root.dir,
      manifest: manifestOf([{ path: "a" }, { path: "b" }, { path: "c" }]),
      syncRepo: async (repo) => {
        if (repo.path === "b") throw new EngineError("adapter blew up", { code: "ADAPTER_ERROR" });
        synced.push(repo.path);
      },
      journal: false,
    });

    // Typed expectations: a row shape that drifts from the contract fails to
    // compile here rather than silently passing a structural comparison.
    const failedRow: WorkspaceRepoSyncRow = {
      repoPath: "b",
      ok: false,
      state: "failed",
      error: { repoPath: "b", code: "ADAPTER_ERROR", message: "adapter blew up" },
    };
    const syncedRow: WorkspaceRepoSyncRow = { repoPath: "a", ok: true, state: "synced" };

    expect(result.outcome).toBe("partial");
    expect(result.counts).toEqual(countsOf({ total: 3, succeeded: 2, failed: 1 }));
    expect(synced.toSorted()).toEqual(["a", "c"]);
    expect(result.repos[1]).toEqual(failedRow);
    expect(result.repos[0]).toEqual(syncedRow);
  });

  it("wraps a callback that rejects with a non-Error as UNKNOWN_ERROR", async () => {
    const root = getRoot();
    await seedRepos(root, "a");

    const result = await syncWorkspaceRepos({
      rootDir: root.dir,
      manifest: manifestOf([{ path: "a" }]),
      syncRepo: () => rejectWith("callback exploded"),
      journal: false,
    });

    expect(result.outcome).toBe("failed");
    expect(result.repos[0]?.error).toEqual({
      repoPath: "a",
      code: "UNKNOWN_ERROR",
      message: "callback exploded",
    });
  });

  it("never runs more members at once than the concurrency limit allows", async () => {
    const root = getRoot();
    const paths = ["r1", "r2", "r3", "r4", "r5"];
    await seedRepos(root, ...paths);
    let active = 0;
    let peak = 0;

    const result = await syncWorkspaceRepos({
      rootDir: root.dir,
      manifest: manifestOf(paths.map((path) => ({ path }))),
      concurrency: 2,
      journal: false,
      syncRepo: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await delay(5);
        active -= 1;
      },
    });

    expect(result.counts).toEqual(countsOf({ total: 5, succeeded: 5 }));
    // Exactly two: below proves the bound, at proves the limiter really overlaps
    // members rather than draining them one at a time.
    expect(peak).toBe(2);
    expect(active).toBe(0);
  });

  // The limiter rejects a non-positive width outright, so an operator typo has to
  // be floored before it reaches p-limit rather than after.
  it.each([0, -1, Number.NaN])(
    "floors an unusable concurrency request (%s) at one",
    async (concurrency) => {
      const root = getRoot();
      await seedRepos(root, "r1", "r2", "r3");
      let active = 0;
      let peak = 0;

      const result = await syncWorkspaceRepos({
        rootDir: root.dir,
        manifest: manifestOf([{ path: "r1" }, { path: "r2" }, { path: "r3" }]),
        concurrency,
        journal: false,
        syncRepo: async () => {
          active += 1;
          peak = Math.max(peak, active);
          await delay(1);
          active -= 1;
        },
      });

      expect(result.counts.succeeded).toBe(3);
      expect(peak).toBe(1);
    },
  );

  it("writes the journal to the state dir under its published filename", async () => {
    const root = getRoot();
    await seedRepos(root, "a");

    await syncWorkspaceRepos({
      rootDir: root.dir,
      manifest: manifestOf([{ path: "a" }]),
      syncRepo: noSyncWork,
      now: FIXED_NOW,
    });

    // Pinned rather than derived: the location is a published contract an
    // operator points a crash-recovery tool at, so a rename has to break a test
    // instead of silently relocating the trail.
    expect(WORKSPACE_SYNC_JOURNAL_FILE).toBe("workspace-sync-journal.jsonl");
    expect(await readdir(join(root.dir, STATE_DIR))).toEqual([WORKSPACE_SYNC_JOURNAL_FILE]);
  });

  it("journals a started and a finished line for every member", async () => {
    const root = getRoot();
    await seedRepos(root, "a", "b");

    const result = await syncWorkspaceRepos({
      rootDir: root.dir,
      manifest: manifestOf([{ path: "a" }, { path: "b" }]),
      syncRepo: noSyncWork,
      now: FIXED_NOW,
    });

    expect(result.journalWarnings).toEqual([]);
    const entries = await readJournal(root.dir);
    expect(entries).toHaveLength(4);
    for (const repo of ["a", "b"]) {
      const lines = entries.filter((entry) => entry.repo === repo);
      expect(lines.map((entry) => entry.event)).toEqual(["started", "finished"]);
      expect(lines.map((entry) => entry.ts)).toEqual([
        FIXED_NOW.toISOString(),
        FIXED_NOW.toISOString(),
      ]);
    }
    // One correlation id groups the run, so a reader of the append-only file can
    // tell this cascade's unterminated lines from an older run's.
    expect(new Set(entries.map((entry) => entry.run)).size).toBe(1);
  });

  it("records the failure class and a bounded message on the terminal line", async () => {
    const root = getRoot();
    await seedRepos(root, "a");
    const long = "x".repeat(500);

    await syncWorkspaceRepos({
      rootDir: root.dir,
      manifest: manifestOf([{ path: "a" }]),
      syncRepo: () => rejectWith(new EngineError(long, { code: "CONFIG_ERROR" })),
      now: FIXED_NOW,
    });

    const terminal = (await readJournal(root.dir)).at(-1);
    expect(terminal).toEqual({
      ts: FIXED_NOW.toISOString(),
      run: expect.any(String),
      repo: "a",
      event: "finished",
      status: "failed",
      code: "CONFIG_ERROR",
      message: "x".repeat(200),
    });
  });

  it("writes nothing when journalling is off", async () => {
    const root = getRoot();
    await seedRepos(root, "a");

    const result = await syncWorkspaceRepos({
      rootDir: root.dir,
      manifest: manifestOf([{ path: "a" }]),
      syncRepo: noSyncWork,
      journal: false,
    });

    expect(result.counts.succeeded).toBe(1);
    expect(await readdir(root.dir)).toEqual(["a"]);
  });

  it("keeps syncing when the journal cannot be written and reports it as a warning", async () => {
    const root = getRoot();
    await seedRepos(root, "a", "b");
    // A directory where the journal file belongs: every append then fails on any
    // host and for any user, where a chmod fixture would not bite when the suite
    // runs as root.
    await mkdir(journalPath(root.dir), { recursive: true });

    const result = await syncWorkspaceRepos({
      rootDir: root.dir,
      manifest: manifestOf([{ path: "a" }, { path: "b" }]),
      syncRepo: noSyncWork,
    });

    expect(result.outcome).toBe("passed");
    expect(result.counts).toEqual(countsOf({ total: 2, succeeded: 2 }));
    expect(result.repos.every((row) => row.error === undefined)).toBe(true);
    // Latched off after the first failure: one actionable warning, not one per line.
    expect(result.journalWarnings).toHaveLength(1);
    expect(result.journalWarnings[0]).toContain(WORKSPACE_SYNC_JOURNAL_FILE);
  });

  it("fails a member whose directory is missing and keeps going", async () => {
    const root = getRoot();
    await seedRepos(root, "present");
    const attempted: string[] = [];

    const result = await syncWorkspaceRepos({
      rootDir: root.dir,
      manifest: manifestOf([{ path: "missing" }, { path: "present" }]),
      syncRepo: async (repo) => {
        attempted.push(repo.path);
      },
      journal: false,
    });

    expect(result.outcome).toBe("partial");
    expect(result.counts).toEqual(countsOf({ total: 2, succeeded: 1, failed: 1 }));
    expect(attempted).toEqual(["present"]);
    expect(result.repos[0]?.state).toBe("failed");
    expect(result.repos[0]?.error?.code).toBe("FS_ERROR");
    expect(result.repos[0]?.error?.message).toContain("does not exist");
    expect(result.repos[1]?.state).toBe("synced");
  });

  it("fails a member whose path is a file rather than a directory", async () => {
    const root = getRoot();
    await root.seedFiles({ "notes.md": "# not a repository\n" });

    const result = await syncWorkspaceRepos({
      rootDir: root.dir,
      manifest: manifestOf([{ path: "notes.md" }]),
      syncRepo: noSyncWork,
      journal: false,
    });

    expect(result.outcome).toBe("failed");
    expect(result.repos[0]?.error?.code).toBe("FS_ERROR");
    expect(result.repos[0]?.error?.message).toContain("not a directory");
  });

  /**
   * A member's declared path is validated for SHAPE — relative, no `..`, not
   * absolute — which says where the entry points textually and nothing about
   * where it lands. A symlinked member passed every shape rule and then took the
   * member's whole generated tree outside the workspace root this module's
   * header says it cannot leave. Real filesystem: a symlink is the fixture.
   */
  it("fails a member that resolves outside the workspace root and syncs nothing there", async () => {
    const root = getRoot();
    const outside = root.path("outside");
    await mkdir(outside, { recursive: true });
    await mkdir(root.path("repo"), { recursive: true });
    await symlink(outside, root.path("repo/escaped"), "dir");
    const attempted: string[] = [];

    const result = await syncWorkspaceRepos({
      rootDir: root.path("repo"),
      manifest: manifestOf([{ path: "escaped" }]),
      syncRepo: async (repo) => {
        attempted.push(repo.path);
      },
      journal: false,
    });

    expect(result.outcome).toBe("failed");
    expect(result.repos[0]?.error?.code).toBe("FS_ERROR");
    expect(result.repos[0]?.error?.message).toContain("outside the workspace root");
    // The callback never ran, so nothing was generated into the escaped tree.
    expect(attempted).toEqual([]);
    expect(await readdir(outside)).toEqual([]);
  });

  it("syncs a member that is a symlink staying inside the workspace root", async () => {
    // Containment, not link-phobia: a member reached through a link that never
    // leaves the root is a legitimate layout and must keep working.
    const root = getRoot();
    await seedRepos(root, "real/web");
    await symlink(root.path("real/web"), root.path("linked-web"), "dir");
    const attempted: string[] = [];

    const result = await syncWorkspaceRepos({
      rootDir: root.dir,
      manifest: manifestOf([{ path: "linked-web" }]),
      syncRepo: async (repo) => {
        attempted.push(repo.path);
      },
      journal: false,
    });

    expect(result.outcome).toBe("passed");
    expect(attempted).toEqual(["linked-web"]);
  });

  it("refuses a journal that is a symlink out of the tree, and keeps the cascade green", async () => {
    // The journal appended through whatever stood at its name. Best-effort by
    // construction, so the refusal degrades to one warning rather than failing a
    // cascade whose member files were all written correctly.
    const root = getRoot();
    const outside = root.path("outside");
    await mkdir(outside, { recursive: true });
    const victim = join(outside, "authorized_keys");
    await writeFile(victim, VICTIM_BYTES, "utf8");
    await mkdir(join(root.dir, STATE_DIR), { recursive: true });
    await symlink(victim, journalPath(root.dir));
    await seedRepos(root, "a");

    const result = await syncWorkspaceRepos({
      rootDir: root.dir,
      manifest: manifestOf([{ path: "a" }]),
      syncRepo: noSyncWork,
    });

    expect(result.outcome).toBe("passed");
    expect(result.counts).toEqual(countsOf({ total: 1, succeeded: 1 }));
    expect(result.journalWarnings).toHaveLength(1);
    expect(result.journalWarnings[0]).toContain("symbolic link");
    // Not one journal line landed outside the tree.
    expect(await readFile(victim, "utf8")).toBe(VICTIM_BYTES);
  });

  it("skips a duplicate member entry instead of syncing one directory twice", async () => {
    const root = getRoot();
    await seedRepos(root, "apps/web");
    const attempted: string[] = [];

    const result = await syncWorkspaceRepos({
      rootDir: root.dir,
      // Both entries name one directory; the manifest reader rejects this, so
      // reaching it means the manifest was built in memory.
      manifest: manifestOf([{ path: "apps/web" }, { path: "./apps/web/" }]),
      syncRepo: async (repo) => {
        attempted.push(repo.path);
      },
      now: FIXED_NOW,
    });

    expect(attempted).toEqual(["apps/web"]);
    expect(result.outcome).toBe("passed");
    expect(result.counts).toEqual(countsOf({ total: 2, succeeded: 1, skipped: 1 }));
    expect(result.repos[1]?.state).toBe("skipped");
    expect(result.repos[1]?.ok).toBe(true);
    expect(result.repos[1]?.skipReason).toContain('duplicate of the earlier entry "apps/web"');

    const entries = await readJournal(root.dir);
    expect(entries.filter((entry) => entry.event === "skipped")).toHaveLength(1);
    expect(entries.filter((entry) => entry.repo === "./apps/web/")).toHaveLength(1);
  });
});
