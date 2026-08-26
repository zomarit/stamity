import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

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
 * Concurrency: the check-then-build is memoized per process, so every caller
 * in one vitest worker shares a single build. Only the dist dogfood suite
 * calls this today, so no cross-worker race exists; a second calling file
 * would need a cross-process lock, not a wider memo.
 *
 * Lane discipline: like cliHarness.ts, this module imports nothing from
 * src/ — the build runs across a process boundary, same as the CLI under test.
 */

const execFileAsync = promisify(execFile);

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DIST_CLI = join(REPO_ROOT, "dist", "cli.js");

let inFlight: Promise<void> | null = null;

/** Resolves once `dist/cli.js` exists — building it first when absent. */
export function ensureDistBuilt(): Promise<void> {
  // A failed build stays memoized: every later caller in the run gets the
  // same actionable rejection instead of re-spawning a doomed build.
  inFlight ??= buildIfAbsent();
  return inFlight;
}

async function buildIfAbsent(): Promise<void> {
  if (await exists(DIST_CLI)) return;

  const bin = join(
    REPO_ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsdown.cmd" : "tsdown",
  );
  try {
    await execFileAsync(bin, ["--config-loader", "native"], {
      cwd: REPO_ROOT,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      // .bin shims on Windows are .cmd files, which Node refuses to execFile
      // without a shell since the CVE-2024-27980 hardening.
      shell: process.platform === "win32",
    });
  } catch (error) {
    const failure = error as { stderr?: string; message?: string };
    const detail =
      failure.stderr !== undefined && failure.stderr.trim() !== ""
        ? failure.stderr.trim()
        : (failure.message ?? String(error));
    throw new Error(`distBuild: tsdown build failed:\n${detail}`, { cause: error });
  }

  if (!(await exists(DIST_CLI))) {
    throw new Error(
      `distBuild: tsdown exited 0 but ${DIST_CLI} still does not exist — ` +
        "check tsdown.config.mjs entry/outDir",
    );
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
