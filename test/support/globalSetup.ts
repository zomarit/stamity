import { mkdirSync, readdirSync, rmSync, statfsSync, statSync, type StatsFs } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * The run's private temp root: `vitest.config.ts` points `TMPDIR`, `TEMP` and `TMP` at
 * `<os temp>/stamity-vitest-<pid>` for every worker and every process a test spawns, and this
 * global setup owns the folder's life.
 *
 * Setup creates it, sweeps the folders earlier runs left behind (a killed run never reaches its
 * teardown), and warns when the temp volume is nearly full. Teardown removes the folder, and with
 * it every tree the suites handed to `lazyCleanup` — once, after the last test, where no hook
 * timeout applies. That is what keeps a large cleanup out of an `afterAll`: under concurrent load
 * the removal alone outlasted the 20s hook timeout, and the file went red with no assertion failed.
 */

export const PRIVATE_TMP_PREFIX = "stamity-vitest-";

/** A sibling folder older than this belongs to a run that is gone. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const LOW_FREE_RATIO = 0.1;
const LOW_FREE_BYTES = 2 * 1024 ** 3;

type VolumeStats = Pick<StatsFs, "bavail" | "bsize" | "blocks">;
type Warn = (line: string) => void;

/** The one field of vitest's `TestProject` the setup reads, kept structural so this support
 *  module imports nothing beyond `node:` (test/support/support.test.ts holds the lane to that). */
export interface SetupProject {
  readonly config: { readonly env: Readonly<Record<string, string | undefined>> };
}

function gib(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

/** The warning line for a volume under 10% or 2 GiB free, or `null` when it has room. */
export function tempVolumeWarning(path: string, stats: VolumeStats): string | null {
  const free = Number(stats.bavail) * Number(stats.bsize);
  const total = Number(stats.blocks) * Number(stats.bsize);
  const ratio = total > 0 ? free / total : 1;
  if (ratio >= LOW_FREE_RATIO && free >= LOW_FREE_BYTES) return null;
  return `warning: temp volume ${path} has ${gib(free)} free (${(ratio * 100).toFixed(1)}%)`;
}

/**
 * Removes every `stamity-vitest-*` folder in `parent` other than `own` whose mtime is older than
 * `STALE_AFTER_MS`. Returns the names removed. A folder that refuses removal is reported and left
 * for the next run.
 */
export function sweepStaleRoots(parent: string, own: string, now: number, warn: Warn): string[] {
  const removed: string[] = [];
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(PRIVATE_TMP_PREFIX) || entry.name === basename(own)) continue;
    const path = join(parent, entry.name);
    try {
      if (now - statSync(path).mtimeMs <= STALE_AFTER_MS) continue;
      rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      removed.push(entry.name);
    } catch (error) {
      warn(`warning: could not sweep ${path}: ${(error as Error).message}`);
    }
  }
  return removed;
}

export interface PrepareOptions {
  /** The private root, `<os temp>/stamity-vitest-<pid>`. */
  readonly root: string;
  readonly now?: number;
  readonly statfs?: (path: string) => VolumeStats;
  readonly warn?: Warn;
}

/**
 * Creates the private root, sweeps stale siblings, and checks the temp volume. Idempotent. The
 * volume check is advisory: a volume that cannot be read is warned about, never thrown out of
 * vitest's global setup, where a throw would fail every test.
 */
export function prepareTempRoot(options: PrepareOptions): void {
  const { root, now = Date.now(), statfs = statfsSync, warn = console.warn } = options;
  const parent = dirname(root);
  mkdirSync(root, { recursive: true });
  sweepStaleRoots(parent, root, now, warn);
  let stats: VolumeStats;
  try {
    stats = statfs(parent);
  } catch (error) {
    warn(`warning: could not read the temp volume at ${parent}: ${(error as Error).message}`);
    return;
  }
  const line = tempVolumeWarning(parent, stats);
  if (line !== null) warn(line);
}

/** Removes the private root and everything moved into it. Never throws: a leftover is swept later. */
export function removeTempRoot(root: string, warn: Warn = console.warn): void {
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    warn(`warning: could not remove ${root}: ${(error as Error).message}; the next run's sweep removes it`);
  }
}

/**
 * Vitest's entry. It can run once per project (the Windows scheduling declares two) and every
 * step is idempotent, so a second call changes nothing. A config without the private root in its
 * env gets no setup at all rather than a guess at where the root is.
 */
export default function setup(project: SetupProject): () => void {
  const root = project.config.env["TMPDIR"];
  if (typeof root !== "string" || !basename(root).startsWith(PRIVATE_TMP_PREFIX)) return () => {};
  prepareTempRoot({ root });
  return () => removeTempRoot(root);
}
