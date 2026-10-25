import { execFile } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { lock } from "proper-lockfile";

/**
 * Build-on-demand for the dist e2e lane: `ensureDistBuilt` makes
 * `dist/cli.js` exist before a suite drives it, running the repo's own build
 * (`node_modules/.bin/tsdown --config-loader native` — the exact `npm run
 * build` command line, without the npm wrapper) ONLY when the file is absent.
 *
 * This is a local convenience: in CI the workflow builds before it tests, so
 * the absent branch never fires there. A dist that is PRESENT but older than
 * src/ is accepted as-is BY DESIGN — no mtime staleness logic. The lane's
 * claim is "the built artifact behaves", and which build that is belongs to
 * whoever produced it (locally: `npm run build`; CI: the fresh pre-test
 * build). Guessing staleness here would re-build mid-suite on every src edit
 * and still prove nothing about the artifact CI ships.
 *
 * Concurrency: nine callers reach this, eight suites and
 * test/support/cliHarness.ts, so two vitest workers can ask at once on a
 * checkout with no `dist/`. Within a process the check-then-build is memoized
 * per root, so every caller in one worker shares a single build. Across
 * processes the build runs under a `proper-lockfile` lock at
 * `<root>/node_modules/.cache/stamity/dist-build.lock` (inside the checkout
 * and already ignored), and the holder re-checks `dist/cli.js` once it has the
 * lock, so the second worker finds the first one's build and starts none. A
 * lock a killed run left behind is taken as stale after `LOCK_STALE_MS`.
 *
 * Lane discipline: like cliHarness.ts, this module imports nothing from
 * src/ — the build runs across a process boundary, same as the CLI under test.
 */

const execFileAsync = promisify(execFile);

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** A held lock refreshes every `LOCK_UPDATE_MS`; one left untouched this long was left by a killed run. */
const LOCK_STALE_MS = 30_000;
const LOCK_UPDATE_MS = 3_000;
/** A waiter polls once a second for up to five minutes, longer than any build this lane has seen. */
const LOCK_RETRIES = { retries: 300, factor: 1, minTimeout: 1_000, maxTimeout: 1_000 };

const inFlight = new Map<string, Promise<void>>();

/**
 * Resolves once `<root>/dist/cli.js` exists — building it first when absent.
 * `lockRetries` is how many times a waiter polls the build lock, a second
 * apart; only the first call for a root sets it, since the result is memoized.
 */
export function ensureDistBuilt({
  root = REPO_ROOT,
  lockRetries = LOCK_RETRIES.retries,
}: { root?: string; lockRetries?: number } = {}): Promise<void> {
  // A failed build stays memoized: every later caller in the run gets the
  // same actionable rejection instead of re-spawning a doomed build.
  let pending = inFlight.get(root);
  if (pending === undefined) {
    pending = buildIfAbsent(root, lockRetries);
    inFlight.set(root, pending);
  }
  return pending;
}

async function buildIfAbsent(root: string, lockRetries: number): Promise<void> {
  const distCli = join(root, "dist", "cli.js");
  if (await exists(distCli)) return;

  const lockfilePath = join(root, "node_modules", ".cache", "stamity", "dist-build.lock");
  await mkdir(dirname(lockfilePath), { recursive: true });
  let compromised: Error | undefined;
  let release: () => Promise<void>;
  try {
    release = await lock(root, {
      lockfilePath,
      realpath: false,
      stale: LOCK_STALE_MS,
      update: LOCK_UPDATE_MS,
      retries: { ...LOCK_RETRIES, retries: lockRetries },
      // The library's default rethrows from its refresh timer, which would crash
      // the worker; the build below reports it instead.
      onCompromised: (error: Error) => {
        compromised = error;
      },
    });
  } catch (error) {
    if ((error as { code?: unknown }).code !== "ELOCKED") throw error;
    throw new Error(
      `distBuild: the build lock at ${lockfilePath} was still held after ${lockRetries} retries a second apart, ` +
        `so ${distCli} was not built; if no other test run is building it, remove ${lockfilePath} and re-run`,
      { cause: error },
    );
  }
  try {
    // Another process may have built while this one waited for the lock.
    if (await exists(distCli)) return;
    await runBuild(root);
    if (compromised !== undefined) {
      throw new Error(
        `distBuild: the build lock at ${lockfilePath} was taken as stale while this build ran ` +
          `(${compromised.message}), so another process may have built ${root}/dist at the same time; re-run`,
        { cause: compromised },
      );
    }
    if (!(await exists(distCli))) {
      throw new Error(
        `distBuild: tsdown exited 0 but ${distCli} still does not exist — ` +
          "check tsdown.config.mjs entry/outDir",
      );
    }
  } finally {
    // A compromised lock is no longer this process's to release.
    if (compromised === undefined) await release();
  }
}

async function runBuild(root: string): Promise<void> {
  // A test stand-in for tsdown, set by env: the concurrency case in
  // test/ci/testScheduling.test.ts counts build starts over a temp root, and
  // the real build would compile this repository there. Unset, the real build runs.
  const stub = process.env["STAMITY_TEST_DIST_BUILD_STUB"];
  const [bin, args] =
    stub !== undefined && stub !== ""
      ? [process.execPath, [stub]]
      : [
          join(REPO_ROOT, "node_modules", ".bin", process.platform === "win32" ? "tsdown.cmd" : "tsdown"),
          ["--config-loader", "native"],
        ];
  try {
    await execFileAsync(bin, args, {
      cwd: root,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      // .bin shims on Windows are .cmd files, which Node refuses to execFile
      // without a shell since the CVE-2024-27980 hardening.
      shell: process.platform === "win32" && bin !== process.execPath,
    });
  } catch (error) {
    const failure = error as { stderr?: string; message?: string };
    const detail =
      failure.stderr !== undefined && failure.stderr.trim() !== ""
        ? failure.stderr.trim()
        : (failure.message ?? String(error));
    throw new Error(`distBuild: tsdown build failed:\n${detail}`, { cause: error });
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
