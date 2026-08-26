import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { afterEach, beforeEach } from "vitest";

/**
 * Real-filesystem fixtures for the tests that cannot run on a virtual volume: write locks,
 * temp+rename atomicity, parent-directory fsync. Everything that only reads or generates
 * belongs on the in-memory lane in `./vfs.ts` instead.
 */

const DEFAULT_PREFIX = "stamity-test";

export interface TempDirHandle {
  /** Absolute path of the directory this handle owns — symlink-resolved unless
   *  the handle was made with `{ realpath: false }`. */
  readonly dir: string;
  /** Joins segments onto `dir`; throws when the result would escape it. */
  path(...segments: string[]): string;
  /** Writes files keyed by directory-relative path, creating parent directories first. */
  seedFiles(files: Record<string, string>): Promise<void>;
  /** Removes the directory and everything under it. Idempotent. */
  cleanup(): Promise<void>;
}

export interface TempDirOptions {
  /**
   * Resolve the temp root before creating the directory (default `true`).
   *
   * Pass `false` to keep the RAW `os.tmpdir()` spelling, so the handle's `dir`
   * reaches the fixture through whatever ancestor symlink the host has (macOS
   * `/var` -> `/private/var`). The default hides that divergence, which is
   * exactly the class a containment check that compares a lexical path against
   * a resolved one gets wrong — a suite built only on realpath'd fixtures
   * cannot see it. Use the raw handle when the path spelling is the subject.
   */
  realpath?: boolean;
}

/**
 * Creates an isolated directory under the OS temp root. The name carries the process id plus
 * `mkdtemp`'s random suffix, so parallel vitest workers never share one.
 */
export async function makeTempDir(
  prefix?: string,
  opts: TempDirOptions = {},
): Promise<TempDirHandle> {
  // realpath by default: on macOS os.tmpdir() sits behind the /var -> /private/var symlink, and
  // a handle path that disagrees with fs.realpath output breaks every path assertion downstream.
  const base = opts.realpath === false ? tmpdir() : await realpath(tmpdir());
  const dir = await mkdtemp(join(base, `${sanitizePrefix(prefix)}-${process.pid}-`));

  return {
    dir,
    path: (...segments) => resolveWithin(dir, segments, "path()"),
    seedFiles: (files) => seedFiles(dir, files),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

/**
 * Wires a fresh temp directory into vitest's per-test lifecycle and returns a getter for it.
 * Call at suite scope; call the getter inside the test.
 */
export function useTempDir(prefix?: string): () => TempDirHandle {
  let current: TempDirHandle | null = null;

  beforeEach(async () => {
    current = await makeTempDir(prefix);
  });

  afterEach(async () => {
    const handle = current;
    current = null;
    await handle?.cleanup();
  });

  return () => {
    if (current === null) {
      throw new Error(
        "useTempDir(): no directory for the current test — call the getter inside it()/test(), not at suite scope",
      );
    }
    return current;
  };
}

async function seedFiles(dir: string, files: Record<string, string>): Promise<void> {
  const entries = Object.entries(files).map(([key, content]) => {
    const target = resolveWithin(dir, [key], "seedFiles()");
    if (target === dir) {
      throw new Error(`seedFiles(): ${JSON.stringify(key)} is not a file path`);
    }
    return { target, content };
  });

  // Every key is validated before the first write, so a rejected map leaves the directory empty.
  // Concurrent recursive mkdir on a shared ancestor can surface EEXIST instead of swallowing it;
  // the directory existing is the outcome we wanted, so only other codes propagate.
  await Promise.all(
    [...new Set(entries.map((entry) => dirname(entry.target)))].map(async (parent) => {
      try {
        await mkdir(parent, { recursive: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }),
  );
  await Promise.all(entries.map((entry) => writeFile(entry.target, entry.content, "utf8")));
}

function resolveWithin(dir: string, segments: readonly string[], label: string): string {
  const target = resolve(dir, ...segments);
  const rel = relative(dir, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`${label}: ${JSON.stringify(segments.join("/"))} escapes the temp dir ${dir}`);
  }
  return target;
}

function sanitizePrefix(prefix: string | undefined): string {
  const cleaned = (prefix ?? "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned === "" ? DEFAULT_PREFIX : cleaned;
}
