import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findPackageRoot } from "../shared/paths.ts";
import { EngineError } from "../types/errors.ts";

/**
 * Locate the canonical corpus that ships inside the installed package.
 *
 * The corpus is package-bundled, never mirrored into the user's repo, so every
 * reader starts here. Resolution walks from this module's own directory up to
 * the package root and probes the two layouts that can hold the corpus, in
 * order:
 *
 *   1. `<packageRoot>/content` — a source checkout, usable with no build step.
 *   2. `<packageRoot>/dist/content` — what the build stages and what the
 *      published tarball ships.
 *
 * Source-checkout first is deliberate: when both exist, a developer editing
 * `content/` expects those edits to be what runs, not the last build's copy.
 *
 * A candidate qualifies on being a directory, nothing more. Class-level
 * completeness (which content classes are present, whether ids collide) is the
 * catalog reader's gate, and an empty corpus is a legitimate state — it is the
 * state of this repo until the corpus lands.
 */

/** Candidate corpus directories relative to the package root, in probe order. */
const CONTENT_CANDIDATES: readonly (readonly string[])[] = [["content"], ["dist", "content"]];

let cached: string | null = null;

function isDirectory(path: string): boolean {
  try {
    return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;
  } catch {
    // An unreadable path (EACCES) or a broken symlink is not a usable corpus
    // root; fall through to the next candidate instead of failing the probe on
    // a directory we were only looking at.
    return false;
  }
}

/**
 * The bundled corpus root, resolved once and cached for the life of the process.
 *
 * Throws `CONFIG_ERROR` naming the package root and every probed path when no
 * candidate exists. The failure is deliberately not cached, so a retry after a
 * reinstall or a build re-runs resolution instead of replaying the old error.
 */
export function resolveBundledContentRoot(): string {
  if (cached !== null) return cached;

  const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
  const probed = CONTENT_CANDIDATES.map((segments) => join(packageRoot, ...segments));
  const found = probed.find(isDirectory);
  if (found === undefined) {
    throw new EngineError(
      `Bundled content not found under ${packageRoot}. Probed ${probed.join(" and ")}. ` +
        `Reinstall the package, or run \`npm run build\` in a source checkout to stage the ` +
        `corpus under dist/content/.`,
      { code: "CONFIG_ERROR" },
    );
  }

  cached = found;
  return found;
}

/**
 * Drop the resolved root so the next call probes again. Test-only (the `__`
 * prefix marks a non-production export): resolution is cached for the process,
 * so a test that changes the layout after a first resolve would otherwise see
 * the stale value.
 */
// oxlint-disable-next-line no-underscore-dangle
export function __resetContentRootCacheForTests(): void {
  cached = null;
}

/**
 * Pin the corpus root to a fixture directory, bypassing the probe. Test-only.
 *
 * The path is stored verbatim and is never stat-ed, which is the point: the
 * reader tests run against an in-memory volume whose paths do not exist on the
 * real filesystem. Pair with {@link __resetContentRootCacheForTests} in teardown.
 */
// oxlint-disable-next-line no-underscore-dangle
export function __setContentRootForTests(dir: string): void {
  cached = dir;
}
