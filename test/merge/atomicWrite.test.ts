import {
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  stat,
  symlink,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import * as realFsPromises from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireWriteLock,
  atomicWriteFile,
  atomicWriteFileUnlocked,
  detectConcurrentWriteRisk,
  disableCrossProcessLocking,
  enableDefaultCrossProcessLocking,
  formatOrphanTmpSweepDiagnostic,
  isCrossProcessLockingEnabled,
  LOCK_RETRY_TOTAL_BACKOFF_MS,
  resetCrossProcessLocking,
  resolveNonClobberingBakPath,
  sweepOrphanTmpFiles,
  syncParentDirectory,
  verifyBackup,
} from "../../src/merge/atomicWrite.ts";
import type * as AtomicWriteApi from "../../src/merge/atomicWrite.ts";
import { EngineError } from "../../src/types/errors.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Real-filesystem lane: every guarantee under test — rename atomicity, advisory
 * locking, directory fsync, mtime-based sweeping — is a property of the kernel,
 * not of an fs façade, so the in-memory volume cannot express any of it.
 *
 * The reader poll loop and the sequential fixture writes below are ordered on
 * purpose (each read must observe the file AFTER the previous one returned), so
 * `no-await-in-loop` is off for the module exactly as it is in the subject.
 */
/* oxlint-disable no-await-in-loop */

/** chmod-based failure fixtures are meaningless as root, which bypasses the bits. */
const CAN_TEST_PERMISSIONS = typeof process.getuid === "function" && process.getuid() !== 0;

const LOCK_ENV_KEYS = ["STAMITY_LOCK", "STAMITY_LOCK_STALE_MS"] as const;

// Locking reads process env and a module-level opt-out on every call; both are
// global, so each test starts from the shipped default and restores on exit.
let savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  savedEnv = Object.fromEntries(LOCK_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of LOCK_ENV_KEYS) delete process.env[key];
  resetCrossProcessLocking();
});
afterEach(() => {
  for (const key of LOCK_ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetCrossProcessLocking();
});

function errnoError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`synthetic ${code}`), { code });
}

/** Silences console.error for the current test and returns the spy. */
function captureConsoleError(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

/** Backdates mtime so an age-threshold check sees the file as abandoned. */
async function backdate(path: string, ageMs: number): Promise<void> {
  const when = new Date(Date.now() - ageMs);
  await utimes(path, when, when);
}

/**
 * Re-imports the subject against a patched `node:fs/promises` (and, where the
 * branch lives behind the locking library, a patched `proper-lockfile`).
 * Module replacement rather than `vi.spyOn`, because an ESM namespace object is
 * non-configurable and cannot be spied on. Reaches the branches no portable
 * real-filesystem fixture can trigger: Windows rename contention, filesystems
 * that reject fsync, and mid-scan races.
 */
async function importWithFs(
  overrides: Record<string, unknown>,
  lockfileOverrides?: Record<string, unknown>,
): Promise<typeof AtomicWriteApi> {
  vi.resetModules();
  const patched = { ...realFsPromises, ...overrides };
  vi.doMock("node:fs/promises", () => ({ ...patched, default: patched }));
  if (lockfileOverrides !== undefined) {
    vi.doMock("proper-lockfile", () => ({ ...lockfileOverrides, default: lockfileOverrides }));
  }
  return import("../../src/merge/atomicWrite.ts");
}

describe("LOCK_RETRY_TOTAL_BACKOFF_MS", () => {
  it("equals the sum of the documented 100/200/400/800/1500ms schedule", () => {
    expect(LOCK_RETRY_TOTAL_BACKOFF_MS).toBe(100 + 200 + 400 + 800 + 1500);
    expect(LOCK_RETRY_TOTAL_BACKOFF_MS).toBe(3000);
  });
});

describe("locking toggles", () => {
  it("is on by default and follows the process-level opt-out", () => {
    expect(isCrossProcessLockingEnabled()).toBe(true);
    disableCrossProcessLocking();
    expect(isCrossProcessLockingEnabled()).toBe(false);
    disableCrossProcessLocking(); // idempotent
    expect(isCrossProcessLockingEnabled()).toBe(false);
    enableDefaultCrossProcessLocking();
    expect(isCrossProcessLockingEnabled()).toBe(true);
    disableCrossProcessLocking();
    resetCrossProcessLocking();
    expect(isCrossProcessLockingEnabled()).toBe(true);
  });

  it("lets STAMITY_LOCK override the process opt-out in both directions", () => {
    disableCrossProcessLocking();
    process.env.STAMITY_LOCK = "1";
    expect(isCrossProcessLockingEnabled()).toBe(true);

    resetCrossProcessLocking();
    process.env.STAMITY_LOCK = "0";
    expect(isCrossProcessLockingEnabled()).toBe(false);

    // An uninterpretable value is no signal, so the process default wins.
    process.env.STAMITY_LOCK = "maybe";
    expect(isCrossProcessLockingEnabled()).toBe(true);
  });
});

describe("atomicWriteFile", () => {
  const getDir = useTempDir("atomic-write");

  it("never exposes a partial file to a concurrent reader", async () => {
    const target = getDir().path("payload.md");
    // Different lengths so a torn write cannot coincidentally equal either side.
    const before = "o".repeat(400_000);
    const after = "n".repeat(300_000);
    await writeFile(target, before, "utf8");

    // Held on an object so the loop condition is a property read: the writer
    // that flips it lives outside the loop body.
    const progress = { writing: true };
    const observations = new Set<string>();
    const reader = (async () => {
      while (progress.writing) {
        const text = await readFile(target, "utf8");
        observations.add(
          text === before ? "before" : text === after ? "after" : `torn:${text.length}`,
        );
      }
    })();

    await atomicWriteFile(target, after);
    progress.writing = false;
    await reader;

    expect([...observations].filter((seen) => seen.startsWith("torn:"))).toEqual([]);
    expect(observations.size).toBeGreaterThan(0);
    expect(await readFile(target, "utf8")).toBe(after);
  });

  it("serializes concurrent same-path writes, landing the last caller's content", async () => {
    const target = getDir().path("contended.md");

    await Promise.all([
      atomicWriteFile(target, "first"),
      atomicWriteFile(target, "second"),
      atomicWriteFile(target, "third"),
    ]);

    // The in-process reservation is taken synchronously at call time, so
    // invocation order — not completion order — decides the winner.
    expect(await readFile(target, "utf8")).toBe("third");
  });

  it("creates missing parent directories and leaves no temp file behind", async () => {
    const dir = getDir();
    const target = dir.path("nested", "deep", "out.md");

    await atomicWriteFile(target, "body");

    expect(await readFile(target, "utf8")).toBe("body");
    expect(await readdir(dir.path("nested", "deep"))).toEqual(["out.md"]);
  });

  it("carries an explicit mode through the rename", async () => {
    const dir = getDir();
    const executable = dir.path("hook.sh");
    const plain = dir.path("plain.md");

    await atomicWriteFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    await atomicWriteFile(plain, "text");

    // Asserted as "some execute bit is set" rather than an exact mode, because
    // the process umask masks the requested bits.
    expect((await stat(executable)).mode & 0o111).not.toBe(0);
    expect((await stat(plain)).mode & 0o111).toBe(0);
  });

  /**
   * Temp+rename publishes a NEW inode, so every rewrite used to land the
   * writer's default and drop whatever the operator had set: a file deliberately
   * `chmod 0600` came back `0644` — world-readable, silently, on the next sync.
   * That is harm #1 of the shared-name rationale
   * (`safeWrite.ts::isSharedRegularFile`) reached with no link involved.
   *
   * The floor lives here rather than at each writer because every lane that
   * republishes a file's own bytes passes through this function; the lane-level
   * parity cases in `writeEscape.test.ts` assert the same property through the
   * merge, whole-file, reclaim-strip and MCP writers.
   */
  describe.skipIf(process.platform === "win32")("existing-file mode preservation", () => {
    it("carries an existing file's mode onto its replacement", async () => {
      const dir = getDir();
      const target = dir.path("secret.md");
      await writeFile(target, "v1", "utf8");
      await chmod(target, 0o600);
      const before = await lstat(target);

      await atomicWriteFile(target, "v2");

      const after = await lstat(target);
      expect(after.mode & 0o777).toBe(0o600);
      expect(await readFile(target, "utf8")).toBe("v2");
      // A fresh inode is the substrate's contract, not a regression: the point
      // is that the NEW inode carries the old one's bits.
      expect(after.ino).not.toBe(before.ino);
    });

    it("sets the preserved bits exactly, past a umask that would narrow them", async () => {
      const dir = getDir();
      const target = dir.path("group-writable.md");
      await writeFile(target, "v1", "utf8");
      await chmod(target, 0o664);

      await atomicWriteFile(target, "v2");

      // `open`'s mode argument is masked by the umask (0o022 in most CI shells),
      // so passing 0o664 through it alone lands 0o644 and the group-write bit
      // the operator set disappears. The `fchmod` on the open handle is what
      // makes "preserved" mean preserved; this is the case that fails without
      // it while the 0o600 case above still passes.
      expect((await lstat(target)).mode & 0o777).toBe(0o664);
    });

    it("lets an explicit mode win over the existing file's", async () => {
      const dir = getDir();
      const target = dir.path("hook.mjs");
      await writeFile(target, "v1", "utf8");
      await chmod(target, 0o600);

      await atomicWriteFile(target, "v2", { mode: 0o755 });

      // A caller that STATES a mode is not keeping one — the hook script has to
      // come back executable even when the file it replaces was not.
      expect((await lstat(target)).mode & 0o111).not.toBe(0);
    });

    it("takes no mode from a symlinked target, which the rename replaces", async () => {
      const dir = getDir();
      const outsideTarget = dir.path("outside.md");
      const link = dir.path("link.md");
      await writeFile(outsideTarget, "secret", "utf8");
      await chmod(outsideTarget, 0o600);
      await symlink(outsideTarget, link);

      await atomicWriteFile(link, "generated");

      // The link is replaced by a regular file (the substrate's terminal-symlink
      // contract) and its TARGET is untouched. Neither the link's own bits —
      // 0o777 on most kernels, which would publish the replacement to every
      // account on the host — nor the target's, which belong to a file this
      // write never touches, may be inherited.
      const after = await lstat(link);
      expect(after.isSymbolicLink()).toBe(false);
      expect(after.mode & 0o777).not.toBe(0o777);
      expect(await readFile(outsideTarget, "utf8")).toBe("secret");
      expect((await lstat(outsideTarget)).mode & 0o777).toBe(0o600);
    });

    it("leaves a file that did not exist at the writer's default", async () => {
      const dir = getDir();
      const target = dir.path("fresh", "new.md");

      await atomicWriteFile(target, "body");

      // Nothing to preserve, and the missing-parent retry runs the temp write a
      // second time — the resolved mode is reused rather than re-read, and an
      // absent target still reads as "no bits to carry" rather than as an error.
      expect((await lstat(target)).mode & 0o111).toBe(0);
      expect(await readFile(target, "utf8")).toBe("body");
    });
  });

  it("creates no lockfile on disk when locking is opted out", async () => {
    process.env.STAMITY_LOCK = "0";
    const dir = getDir();
    const target = dir.path("unlocked", "out.md");

    await atomicWriteFile(target, "still atomic");

    expect(await readFile(target, "utf8")).toBe("still atomic");
    expect(await readdir(dir.path("unlocked"))).toEqual(["out.md"]);
  });
});

describe("atomicWriteFileUnlocked", () => {
  const getDir = useTempDir("atomic-unlocked");

  it("writes inside a caller-held lock without re-acquiring it", async () => {
    const dir = getDir();
    const target = dir.path("held.md");

    const release = await acquireWriteLock(target);
    try {
      await atomicWriteFileUnlocked(target, "body");
      expect(await readFile(target, "utf8")).toBe("body");
    } finally {
      await release();
    }
    // Only the file survives: the lockfile is gone and no temp file leaked.
    expect(await readdir(dir.dir)).toEqual(["held.md"]);
  });

  it("creates a missing parent directory on the ENOENT retry", async () => {
    const target = getDir().path("absent", "out.md");

    await atomicWriteFileUnlocked(target, "created");

    expect(await readFile(target, "utf8")).toBe("created");
  });
});

describe("acquireWriteLock", () => {
  const getDir = useTempDir("write-lock");

  it("returns an idempotent release that a second call no-ops", async () => {
    const dir = getDir();
    const target = dir.path("once.md");

    const release = await acquireWriteLock(target);
    expect(await readdir(dir.dir)).toContain("once.md.lock");

    await release();
    await expect(release()).resolves.toBeUndefined();
    expect(await readdir(dir.dir)).not.toContain("once.md.lock");
  });

  it("returns a no-op release and touches no disk when locking is opted out", async () => {
    process.env.STAMITY_LOCK = "0";
    const dir = getDir();

    const release = await acquireWriteLock(dir.path("free.md"));
    expect(await readdir(dir.dir)).toEqual([]);
    await expect(release()).resolves.toBeUndefined();
  });

  it("lets a nested write re-enter a held lock instead of deadlocking", async () => {
    const target = getDir().path("reentrant.md");

    const release = await acquireWriteLock(target);
    try {
      // Would hang forever if the internal write queued behind its own holder.
      await atomicWriteFile(target, "nested");
      expect(await readFile(target, "utf8")).toBe("nested");
    } finally {
      await release();
    }
  });

  it("queues a sibling acquire behind the holder and hands it over on release", async () => {
    const target = getDir().path("queued.md");
    const order: string[] = [];

    const first = await acquireWriteLock(target);
    const second = acquireWriteLock(target).then(async (release) => {
      order.push("second");
      await release();
    });

    order.push("first");
    await first();
    await second;

    expect(order).toEqual(["first", "second"]);
  });

  it("times out a same-process acquire that never gets the path", async () => {
    const target = getDir().path("starved.md");
    const release = await acquireWriteLock(target);

    vi.useFakeTimers();
    try {
      const queued = acquireWriteLock(target);
      // The rejection handler is attached before the clock advances so the
      // rejection is never momentarily unhandled.
      const rejects = expect(queued).rejects.toMatchObject({
        code: "LOCK_TIMEOUT",
        exitCode: 1,
      });
      await vi.advanceTimersByTimeAsync(5_001);
      await rejects;
    } finally {
      vi.useRealTimers();
      await release();
    }
  });

  it("maps exhausted cross-process retries to LOCK_TIMEOUT naming the lockfile", async () => {
    const target = getDir().path("taken.md");
    // A fresh lockfile directory stands in for another live process.
    await mkdir(`${target}.lock`);

    const caught = await acquireWriteLock(target).catch((err: unknown) => err);

    expect(caught).toBeInstanceOf(EngineError);
    const err = caught as EngineError;
    expect(err.code).toBe("LOCK_TIMEOUT");
    expect(err.message).toContain(target);
    expect(err.message).toContain(`${target}.lock`);
    expect(err.message).toContain("~3s");
  });

  it("steals a lock left behind past the staleness threshold", async () => {
    const target = getDir().path("abandoned.md");
    await mkdir(`${target}.lock`);
    await backdate(`${target}.lock`, 3_000);

    // The 15s default would still consider a 3s-old lock live; the override
    // lowers the threshold, so the abandoned lock is stolen instead.
    process.env.STAMITY_LOCK_STALE_MS = "2000";
    const release = await acquireWriteLock(target);

    await expect(release()).resolves.toBeUndefined();
  });

  it("floors an unusably low staleness override instead of rejecting it", async () => {
    const target = getDir().path("floored.md");
    await mkdir(`${target}.lock`);
    await backdate(`${target}.lock`, 3_000);

    process.env.STAMITY_LOCK_STALE_MS = "1";
    const release = await acquireWriteLock(target);

    await expect(release()).resolves.toBeUndefined();
  });

  it("ignores a non-positive staleness override and keeps the default", async () => {
    const target = getDir().path("defaulted.md");
    process.env.STAMITY_LOCK_STALE_MS = "0";

    const release = await acquireWriteLock(target);

    await expect(release()).resolves.toBeUndefined();
  });

  it("refuses a lockfile name held by a symlink instead of waiting out the retry budget", async () => {
    const dir = getDir();
    const target = dir.path("bricked.md");
    // proper-lockfile takes the lock by creating the lockfile as a DIRECTORY,
    // and mkdir refuses to follow a final-component symlink — so a planted link
    // reads as "someone else holds it" and every write to this target burns the
    // full ~3s budget before failing as a stale lock nobody can find.
    await symlink(dir.path("nowhere"), `${target}.lock`);

    const startedAt = Date.now();
    const caught = await acquireWriteLock(target).catch((err: unknown) => err);
    const elapsedMs = Date.now() - startedAt;

    expect(caught).toBeInstanceOf(EngineError);
    const err = caught as EngineError;
    expect(err.code).toBe("FS_ERROR");
    expect(err.message).toContain(`${target}.lock`);
    expect(elapsedMs).toBeLessThan(LOCK_RETRY_TOTAL_BACKOFF_MS);

    // The in-process reservation goes with it: clearing the plant lets the very
    // next acquire through rather than queueing it behind a leaked holder.
    await unlink(`${target}.lock`);
    await (await acquireWriteLock(target))();
  });

  it.skipIf(!CAN_TEST_PERMISSIONS)(
    "maps a read-only parent directory to an actionable FS_ERROR",
    async () => {
      const dir = getDir();
      const readOnly = dir.path("locked-down");
      await mkdir(readOnly);
      await chmod(readOnly, 0o555);
      const target = `${readOnly}/out.md`;

      try {
        // Lock acquisition mkdirs the lockfile beside the target, so this fails
        // before the writer runs — it must still surface the mapped error.
        const caught = await atomicWriteFile(target, "denied").catch((err: unknown) => err);

        expect(caught).toBeInstanceOf(EngineError);
        const err = caught as EngineError;
        expect(err.code).toBe("FS_ERROR");
        expect(err.exitCode).toBe(1);
        expect(err.message).toContain(target);
        expect(err.message).toMatch(/permission denied/i);
        expect(await readdir(readOnly)).toEqual([]);
      } finally {
        await chmod(readOnly, 0o755);
      }
    },
  );

  it.skipIf(!CAN_TEST_PERMISSIONS)(
    "maps the writer's own permission failure when locking is opted out",
    async () => {
      process.env.STAMITY_LOCK = "0";
      const dir = getDir();
      const readOnly = dir.path("no-write");
      await mkdir(readOnly);
      await chmod(readOnly, 0o555);
      const target = `${readOnly}/out.md`;

      try {
        const caught = await atomicWriteFile(target, "denied").catch((err: unknown) => err);

        expect(caught).toBeInstanceOf(EngineError);
        expect((caught as EngineError).code).toBe("FS_ERROR");
        expect((caught as EngineError).message).toContain(target);
        // The temp file never survives a failed write.
        expect(await readdir(readOnly)).toEqual([]);
      } finally {
        await chmod(readOnly, 0o755);
      }
    },
  );
});

describe("syncParentDirectory", () => {
  const getDir = useTempDir("dir-sync");

  it("syncs the parent of an existing file", async () => {
    const target = getDir().path("synced.md");
    await writeFile(target, "content", "utf8");

    await expect(syncParentDirectory(target)).resolves.toBeUndefined();
  });

  it("rethrows an errno outside the tolerated platform set", async () => {
    // ENOENT is a real defect (the parent vanished), not a platform quirk.
    await expect(syncParentDirectory(getDir().path("gone", "out.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("sweepOrphanTmpFiles", () => {
  const getDir = useTempDir("tmp-sweep");

  it("removes only aged files matching the writer's exact temp shape", async () => {
    const dir = getDir();
    await dir.seedFiles({
      "out.md.tmp.stamity-deadbeef": "aged orphan",
      "other.md.tmp.stamity-0123abcd": "aged orphan",
      "short.md.tmp.stamity-deadbee": "7 hex — another tool's suffix",
      "long.md.tmp.stamity-deadbeef1": "9 hex — another tool's suffix",
      "upper.md.tmp.stamity-DEADBEEF": "uppercase — not our writer",
      ".tmp.stamity-deadbeef": "no basename before the suffix",
      // The engine token is what separates our orphans from a third party's.
      // `<basename>.tmp.<8hex>` is a convention several tools share, and the
      // sweep walks the whole repository, so matching it on shape alone
      // unlinked files this engine never wrote.
      "foreign.md.tmp.cafed00d": "another tool's own temp file",
      "plain.md": "a real managed file",
      "nested/inner.md.tmp.stamity-aaaaaaaa": "aged orphan in a subdirectory",
      "node_modules/dep.md.tmp.stamity-bbbbbbbb": "off-limits tree",
    });
    for (const relative of [
      "out.md.tmp.stamity-deadbeef",
      "other.md.tmp.stamity-0123abcd",
      "short.md.tmp.stamity-deadbee",
      "long.md.tmp.stamity-deadbeef1",
      "upper.md.tmp.stamity-DEADBEEF",
      ".tmp.stamity-deadbeef",
      "foreign.md.tmp.cafed00d",
      "nested/inner.md.tmp.stamity-aaaaaaaa",
      "node_modules/dep.md.tmp.stamity-bbbbbbbb",
    ]) {
      await backdate(dir.path(relative), 120_000);
    }

    const entries = await sweepOrphanTmpFiles(dir.dir);

    expect(entries.every((entry) => entry.removed)).toBe(true);
    expect(new Set(entries.map((entry) => entry.path))).toEqual(
      new Set([
        dir.path("out.md.tmp.stamity-deadbeef"),
        dir.path("other.md.tmp.stamity-0123abcd"),
        dir.path("nested", "inner.md.tmp.stamity-aaaaaaaa"),
      ]),
    );
    expect(entries.every((entry) => entry.ageMs >= 120_000)).toBe(true);
    // Everything the shape check rejected is still on disk, pruned trees included.
    expect((await readdir(dir.dir)).toSorted()).toEqual(
      [
        ".tmp.stamity-deadbeef",
        "foreign.md.tmp.cafed00d",
        "long.md.tmp.stamity-deadbeef1",
        "nested",
        "node_modules",
        "plain.md",
        "short.md.tmp.stamity-deadbee",
        "upper.md.tmp.stamity-DEADBEEF",
      ].toSorted(),
    );
    expect(await readdir(dir.path("node_modules"))).toEqual(["dep.md.tmp.stamity-bbbbbbbb"]);
  });

  it("leaves a third party's aged temp file alone rather than reporting it as ours", async () => {
    const dir = getDir();
    await dir.seedFiles({ "vendor.md.tmp.0badf00d": "another tool's interrupted write" });
    await backdate(dir.path("vendor.md.tmp.0badf00d"), 120_000);

    const entries = await sweepOrphanTmpFiles(dir.dir);

    // Not "matched and kept" — not matched at all. The sweep unlinks whatever it
    // matches once the file is a minute old, so the only safe match set is one
    // the engine can prove is its own, and a shape several tools share is not
    // that. The bare `.tmp.<8hex>` convention used to be the whole test.
    expect(entries).toEqual([]);
    expect(await readdir(dir.dir)).toEqual(["vendor.md.tmp.0badf00d"]);
  });

  it("reports a temp file younger than the threshold without removing it", async () => {
    const dir = getDir();
    await dir.seedFiles({ "live.md.tmp.stamity-cafebabe": "a write in flight right now" });

    const entries = await sweepOrphanTmpFiles(dir.dir);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ path: dir.path("live.md.tmp.stamity-cafebabe"), removed: false });
    expect(entries[0]?.ageMs).toBeLessThan(60_000);
    expect(await readdir(dir.dir)).toEqual(["live.md.tmp.stamity-cafebabe"]);
  });

  it("honours an explicit age threshold", async () => {
    const dir = getDir();
    await dir.seedFiles({ "recent.md.tmp.stamity-feedface": "seconds old" });
    await backdate(dir.path("recent.md.tmp.stamity-feedface"), 5_000);

    expect(await sweepOrphanTmpFiles(dir.dir, { olderThanMs: 10_000 })).toMatchObject([
      { removed: false },
    ]);
    expect(await sweepOrphanTmpFiles(dir.dir, { olderThanMs: 1_000 })).toMatchObject([
      { removed: true },
    ]);
    expect(await readdir(dir.dir)).toEqual([]);
  });

  it("returns an empty report for a directory that does not exist", async () => {
    const errorSpy = captureConsoleError();

    expect(await sweepOrphanTmpFiles(getDir().path("never-created"))).toEqual([]);
    // A missing root is the fresh-checkout case, not something to warn about.
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it.skipIf(!CAN_TEST_PERMISSIONS)("reports an unreadable root and returns nothing", async () => {
    const dir = getDir();
    const sealed = dir.path("sealed");
    await mkdir(sealed);
    await chmod(sealed, 0o000);
    const errorSpy = captureConsoleError();

    try {
      expect(await sweepOrphanTmpFiles(sealed)).toEqual([]);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("could not read"));
    } finally {
      errorSpy.mockRestore();
      await chmod(sealed, 0o755);
    }
  });

  it.skipIf(!CAN_TEST_PERMISSIONS)(
    "skips an unreadable subdirectory and still sweeps the rest",
    async () => {
      const dir = getDir();
      await dir.seedFiles({ "good/orphan.md.tmp.stamity-abcdef01": "aged orphan" });
      await backdate(dir.path("good", "orphan.md.tmp.stamity-abcdef01"), 120_000);
      const sealed = dir.path("sealed");
      await mkdir(sealed);
      await chmod(sealed, 0o000);
      const errorSpy = captureConsoleError();

      try {
        const entries = await sweepOrphanTmpFiles(dir.dir);

        expect(entries).toMatchObject([
          { path: dir.path("good", "orphan.md.tmp.stamity-abcdef01"), removed: true },
        ]);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("could not read"));
      } finally {
        errorSpy.mockRestore();
        await chmod(sealed, 0o755);
      }
    },
  );

});

describe("formatOrphanTmpSweepDiagnostic", () => {
  it("is empty for an empty report so callers can stay silent", () => {
    expect(formatOrphanTmpSweepDiagnostic([])).toBe("");
  });

  it("names removed files, kept files, or both", () => {
    const removed = { path: "/repo/a.md.tmp.stamity-aaaaaaaa", ageMs: 90_000, removed: true };
    const kept = { path: "/repo/b.md.tmp.stamity-bbbbbbbb", ageMs: 500, removed: false };

    expect(formatOrphanTmpSweepDiagnostic([removed])).toBe(
      "Removed 1 orphan temp file(s) left behind by interrupted writes: /repo/a.md.tmp.stamity-aaaaaaaa",
    );
    expect(formatOrphanTmpSweepDiagnostic([kept])).toContain("Left 1 temp file(s) in place");

    const both = formatOrphanTmpSweepDiagnostic([removed, kept]);
    expect(both).toContain("Removed 1 orphan temp file(s)");
    expect(both).toContain("Left 1 temp file(s) in place");
    expect(both).toContain(". ");
  });
});

describe("detectConcurrentWriteRisk", () => {
  const getDir = useTempDir("write-risk");

  it("stays silent while locking is on, because locking already serializes writers", async () => {
    const dir = getDir();
    await dir.seedFiles({ "live.md.tmp.stamity-aabbccdd": "fresh temp file" });

    expect(await detectConcurrentWriteRisk(dir.dir)).toBeNull();
  });

  it("flags a fresh temp file once locking is opted out", async () => {
    const dir = getDir();
    await dir.seedFiles({ "live.md.tmp.stamity-aabbccdd": "fresh temp file" });
    process.env.STAMITY_LOCK = "0";

    const risk = await detectConcurrentWriteRisk(dir.dir);

    expect(risk).toContain(dir.path("live.md.tmp.stamity-aabbccdd"));
    expect(risk).toContain("in flight");
  });

  it("ignores an aged temp file, which the sweep owns", async () => {
    const dir = getDir();
    await dir.seedFiles({ "orphan.md.tmp.stamity-aabbccdd": "crash leftover" });
    await backdate(dir.path("orphan.md.tmp.stamity-aabbccdd"), 120_000);
    disableCrossProcessLocking();

    expect(await detectConcurrentWriteRisk(dir.dir)).toBeNull();
  });

  it("stays silent for a directory that does not exist", async () => {
    process.env.STAMITY_LOCK = "0";
    const errorSpy = captureConsoleError();

    expect(await detectConcurrentWriteRisk(getDir().path("absent"))).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it.skipIf(!CAN_TEST_PERMISSIONS)("treats an unreadable root as no signal", async () => {
    const dir = getDir();
    const sealed = dir.path("sealed");
    await mkdir(sealed);
    await chmod(sealed, 0o000);
    process.env.STAMITY_LOCK = "0";
    const errorSpy = captureConsoleError();

    try {
      expect(await detectConcurrentWriteRisk(sealed)).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("could not read"));
    } finally {
      errorSpy.mockRestore();
      await chmod(sealed, 0o755);
    }
  });

});

describe("verifyBackup", () => {
  const getDir = useTempDir("verify-backup");

  it("accepts a backup matching the in-memory source", async () => {
    const dir = getDir();
    const source = "# Managed file\n\nbody\n";
    await writeFile(dir.path("out.md.bak"), source, "utf8");

    await expect(
      verifyBackup(dir.path("out.md"), dir.path("out.md.bak"), source, "update"),
    ).resolves.toBeUndefined();
  });

  it("compares UTF-8 byte length, not character count", async () => {
    const dir = getDir();
    // 6 characters, 14 bytes — a char-length compare would false-fail here.
    const source = "日本語 → ✓";
    expect(source.length).not.toBe(Buffer.byteLength(source, "utf-8"));
    await writeFile(dir.path("i18n.md.bak"), source, "utf8");

    await expect(
      verifyBackup(dir.path("i18n.md"), dir.path("i18n.md.bak"), source, "update"),
    ).resolves.toBeUndefined();
  });

  it("rejects a truncated backup, naming both byte counts and the operation", async () => {
    const dir = getDir();
    await writeFile(dir.path("out.md.bak"), "short", "utf8");

    const caught = await verifyBackup(
      dir.path("out.md"),
      dir.path("out.md.bak"),
      "a much longer source body",
      "rollback",
    ).catch((err: unknown) => err);

    expect(caught).toBeInstanceOf(EngineError);
    const err = caught as EngineError;
    expect(err.code).toBe("FS_ERROR");
    expect(err.exitCode).toBe(1);
    expect(err.message).toContain("source=25 bytes");
    expect(err.message).toContain("backup=5 bytes");
    expect(err.message).toContain("rollback");
  });

  it("catches corruption that a size check alone would pass", async () => {
    const dir = getDir();
    const source = "alpha bravo charlie";
    // Same byte count, different bytes — exactly what the digest step is for.
    const corrupted = "alpha bravo charliX";
    expect(Buffer.byteLength(corrupted, "utf-8")).toBe(Buffer.byteLength(source, "utf-8"));
    await writeFile(dir.path("out.md.bak"), corrupted, "utf8");

    const caught = await verifyBackup(
      dir.path("out.md"),
      dir.path("out.md.bak"),
      source,
      "update",
    ).catch((err: unknown) => err);

    expect(caught).toBeInstanceOf(EngineError);
    expect((caught as EngineError).code).toBe("FS_ERROR");
    expect((caught as EngineError).message).toContain("SHA-256 mismatch");
  });
});

describe("resolveNonClobberingBakPath", () => {
  const getDir = useTempDir("bak-path");

  it("uses the canonical .bak path when it is free", async () => {
    const target = getDir().path("out.md");

    expect(await resolveNonClobberingBakPath(target)).toBe(`${target}.bak`);
  });

  it("draws a unique suffix rather than overwriting an existing backup", async () => {
    const dir = getDir();
    const target = dir.path("out.md");
    await writeFile(`${target}.bak`, "the first recovery copy", "utf8");

    const resolved = await resolveNonClobberingBakPath(target);

    expect(resolved).not.toBe(`${target}.bak`);
    expect(resolved).toMatch(/\.bak\.[0-9a-f]{8}$/);
    await expect(stat(resolved)).rejects.toMatchObject({ code: "ENOENT" });
    // The existing backup is untouched.
    expect(await readFile(`${target}.bak`, "utf8")).toBe("the first recovery copy");
  });

  it("counts a DANGLING symlink at the canonical .bak as occupied", async () => {
    const dir = getDir();
    await mkdir(dir.path("repo"));
    const target = dir.path("repo", "notes.md");
    await writeFile(target, "ATTACKER CONTROLLED BYTES\n", "utf8");
    // The plant a repository can carry in git: a link at the canonical backup
    // name aimed at a path that does not exist yet. `access` follows it, gets
    // ENOENT and reports the name free — after which a copy onto that name
    // follows the link and creates the outside file with this file's bytes.
    const victim = dir.path("outside", "authorized_keys");
    await symlink(victim, `${target}.bak`);

    const resolved = await resolveNonClobberingBakPath(target);

    expect(resolved).not.toBe(`${target}.bak`);
    expect(resolved).toMatch(/\.bak\.[0-9a-f]{8}$/);
    await expect(stat(resolved)).rejects.toMatchObject({ code: "ENOENT" });
    // The plant is reported around, not cleaned up: the resolver only picks names.
    expect((await lstat(`${target}.bak`)).isSymbolicLink()).toBe(true);
  });

  it("counts a LIVE symlink at the canonical .bak as occupied too", async () => {
    const dir = getDir();
    await mkdir(dir.path("repo"));
    await mkdir(dir.path("outside"));
    const target = dir.path("repo", "notes.md");
    const victim = dir.path("outside", "id_rsa");
    await writeFile(victim, "PRIVATE KEY\n", "utf8");
    await symlink(victim, `${target}.bak`);

    const resolved = await resolveNonClobberingBakPath(target);

    expect(resolved).toMatch(/\.bak\.[0-9a-f]{8}$/);
    expect(await readFile(victim, "utf8")).toBe("PRIVATE KEY\n");
  });
});

describe("failure paths that need a stubbed filesystem", () => {
  const getDir = useTempDir("stubbed-fs");

  afterEach(() => {
    vi.doUnmock("node:fs/promises");
    vi.doUnmock("proper-lockfile");
    vi.resetModules();
  });

  it("skips a sweep candidate that vanishes between the scan and the stat", async () => {
    const dir = getDir();
    await dir.seedFiles({ "racy.md.tmp.stamity-0f0f0f0f": "removed by someone else" });
    const mod = await importWithFs({
      stat: async () => {
        throw errnoError("ENOENT");
      },
    });

    expect(await mod.sweepOrphanTmpFiles(dir.dir)).toEqual([]);
  });

  it("skips a contention candidate that vanishes between the scan and the stat", async () => {
    process.env.STAMITY_LOCK = "0";
    const dir = getDir();
    await dir.seedFiles({ "racy.md.tmp.stamity-0f0f0f0f": "removed by someone else" });
    const mod = await importWithFs({
      stat: async () => {
        throw errnoError("ENOENT");
      },
    });

    expect(await mod.detectConcurrentWriteRisk(dir.dir)).toBeNull();
  });

  it("names its own temp file with the token the sweep matches on", async () => {
    // The round trip is the point: the writer mints the name and the sweep
    // decides what to unlink, and if those two shapes are written down
    // separately they drift — at which cost either the engine's own orphans
    // survive forever or a foreign file is removed. Faulting `rename` and
    // `unlink` together is what leaves a real writer temp file on disk to read.
    process.env.STAMITY_LOCK = "0";
    const dir = getDir();
    const errorSpy = captureConsoleError();
    const mod = await importWithFs({
      rename: async () => {
        throw errnoError("EACCES");
      },
      unlink: async () => {
        throw errnoError("EPERM");
      },
    });

    try {
      await expect(mod.atomicWriteFile(dir.path("out.md"), "payload")).rejects.toThrow();
    } finally {
      errorSpy.mockRestore();
    }

    const leftovers = await readdir(dir.dir);
    expect(leftovers).toHaveLength(1);
    expect(leftovers[0]).toMatch(/^out\.md\.tmp\.stamity-[0-9a-f]{8}$/);

    // …and the unpatched sweep claims exactly that file.
    await backdate(dir.path(leftovers[0] as string), 120_000);
    expect(await sweepOrphanTmpFiles(dir.dir)).toMatchObject([{ removed: true }]);
    expect(await readdir(dir.dir)).toEqual([]);
  });

  it("reports a matched temp file it could not remove as kept", async () => {
    const dir = getDir();
    await dir.seedFiles({ "stuck.md.tmp.stamity-11223344": "cannot be unlinked" });
    await backdate(dir.path("stuck.md.tmp.stamity-11223344"), 120_000);
    const errorSpy = captureConsoleError();
    const mod = await importWithFs({
      unlink: async () => {
        throw errnoError("EPERM");
      },
    });

    try {
      expect(await mod.sweepOrphanTmpFiles(dir.dir)).toMatchObject([
        { path: dir.path("stuck.md.tmp.stamity-11223344"), removed: false },
      ]);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Remove it manually"));
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("retries a rename losing to transient contention, then lands the write", async () => {
    process.env.STAMITY_LOCK = "0";
    const target = getDir().path("busy.md");
    let attempts = 0;
    const mod = await importWithFs({
      rename: async (from: string, to: string) => {
        attempts += 1;
        if (attempts <= 2) throw errnoError("EBUSY");
        return realFsPromises.rename(from, to);
      },
    });

    await mod.atomicWriteFile(target, "landed");

    expect(attempts).toBe(3);
    expect(await readFile(target, "utf8")).toBe("landed");
  });

  it("gives up once the rename retry budget is spent and removes the temp file", async () => {
    process.env.STAMITY_LOCK = "0";
    const dir = getDir();
    let attempts = 0;
    const mod = await importWithFs({
      rename: async () => {
        attempts += 1;
        throw errnoError("EPERM");
      },
    });

    await expect(mod.atomicWriteFile(dir.path("stuck.md"), "never")).rejects.toMatchObject({
      code: "EPERM",
    });

    // One initial attempt plus the four retries.
    expect(attempts).toBe(5);
    expect(await readdir(dir.dir)).toEqual([]);
  });

  it("reports a temp file it could not remove after the write landed", async () => {
    process.env.STAMITY_LOCK = "0";
    const target = getDir().path("kept-tmp.md");
    const errorSpy = captureConsoleError();
    const mod = await importWithFs({
      unlink: async () => {
        throw errnoError("EPERM");
      },
    });

    try {
      await mod.atomicWriteFile(target, "done");

      expect(await readFile(target, "utf8")).toBe("done");
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("orphan temp-file sweep"));
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("keeps the write atomic when the filesystem rejects the temp-file datasync", async () => {
    process.env.STAMITY_LOCK = "0";
    const target = getDir().path("no-datasync.md");
    // The stub delegates to the real `open` and overrides datasync alone: the
    // writer now creates the temp file through a handle (O_EXCL|O_NOFOLLOW), so
    // a handle that cannot write is a different failure than the one under test.
    // `stat` delegates for the same reason — the parent pin `fstat`s the handle
    // it opened, and a double that answers only the two calls the writer used to
    // make would fail the write on the pin rather than on the datasync.
    const mod = await importWithFs({
      open: async (path: never, flags: never, mode: never) => {
        const handle = await realFsPromises.open(path, flags, mode);
        return {
          writeFile: (...args: never[]) => (handle.writeFile as never as (...a: never[]) => unknown)(...args),
          stat: () => handle.stat(),
          datasync: async () => {
            throw errnoError("ENOTSUP");
          },
          close: () => handle.close(),
        };
      },
    });

    await mod.atomicWriteFile(target, "durable enough");

    expect(await readFile(target, "utf8")).toBe("durable enough");
  });

  it("surfaces a temp-file datasync errno that is not a known platform gap", async () => {
    process.env.STAMITY_LOCK = "0";
    const dir = getDir();
    const mod = await importWithFs({
      open: async (path: never, flags: never, mode: never) => {
        const handle = await realFsPromises.open(path, flags, mode);
        return {
          writeFile: (...args: never[]) => (handle.writeFile as never as (...a: never[]) => unknown)(...args),
          // Delegated for the same reason as the ENOTSUP case above: the parent
          // pin `fstat`s its own handle, and the subject here is the datasync.
          stat: () => handle.stat(),
          datasync: async () => {
            throw errnoError("EIO");
          },
          close: () => handle.close(),
        };
      },
    });

    await expect(mod.atomicWriteFile(dir.path("bad-disk.md"), "content")).rejects.toMatchObject({
      code: "FS_ERROR",
    });
    expect(await readdir(dir.dir)).toEqual([]);
  });

  it("swallows a directory fd that the platform refuses to open", async () => {
    const mod = await importWithFs({
      open: async () => {
        throw errnoError("EPERM");
      },
    });

    await expect(mod.syncParentDirectory(getDir().path("out.md"))).resolves.toBeUndefined();
  });

  it("swallows a directory datasync the filesystem rejects, and still closes the fd", async () => {
    const close = vi.fn(async () => {});
    const mod = await importWithFs({
      open: async () => ({
        datasync: async () => {
          throw errnoError("EINVAL");
        },
        close,
      }),
    });

    await expect(mod.syncParentDirectory(getDir().path("out.md"))).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("rethrows a directory datasync errno outside the tolerated set", async () => {
    const mod = await importWithFs({
      open: async (path: never, flags: never, mode: never) => {
        const handle = await realFsPromises.open(path, flags, mode);
        return {
          writeFile: (...args: never[]) => (handle.writeFile as never as (...a: never[]) => unknown)(...args),
          datasync: async () => {
            throw errnoError("EIO");
          },
          close: () => handle.close(),
        };
      },
    });

    await expect(mod.syncParentDirectory(getDir().path("out.md"))).rejects.toMatchObject({
      code: "EIO",
    });
  });

  it("reports a lock release failure without masking the completed write", async () => {
    const target = getDir().path("bad-release.md");
    const errorSpy = captureConsoleError();
    // Stubbed at the locking library, not at fs: proper-lockfile reaches the
    // filesystem through graceful-fs, so patching node:fs/promises cannot make
    // its release path fail.
    const mod = await importWithFs({}, { lock: async () => async () => {
      throw new Error("lockfile removal refused");
    } });

    try {
      await mod.atomicWriteFile(target, "written anyway");

      expect(await readFile(target, "utf8")).toBe("written anyway");
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to release the write lock"),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("surfaces a non-contention lock failure as an actionable FS_ERROR", async () => {
    const dir = getDir();
    // A write-side errno raised while creating the lockfile is the same failure
    // class the writer maps, so it must not escape as a bare mkdir errno.
    const mod = await importWithFs({}, {
      lock: async () => {
        throw errnoError("ENOSPC");
      },
    });

    // Shape rather than `instanceof`: the re-imported subject carries its own
    // copy of the error class, so a cross-instance identity check is
    // meaningless here. Every other suite asserts `instanceof` directly.
    await expect(mod.atomicWriteFile(dir.path("full-disk.md"), "content")).rejects.toMatchObject({
      name: "EngineError",
      code: "FS_ERROR",
      exitCode: 1,
      message: expect.stringContaining("disk space"),
    });
  });

  it("rethrows an unrecognised lock failure unchanged", async () => {
    const dir = getDir();
    const mod = await importWithFs({}, {
      lock: async () => {
        throw errnoError("EWEIRD");
      },
    });

    await expect(mod.atomicWriteFile(dir.path("odd.md"), "content")).rejects.toMatchObject({
      code: "EWEIRD",
    });
  });
});
