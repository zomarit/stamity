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
 *
 * The FORK LAYER resolves beside it ({@link resolveBundledForkRoot}): `fork/`
 * is the directory a downstream fork of this repository fills with its own
 * agents, rules, commands and skills (`docs/specs/fork-layer.md`), and it sits
 * next to the corpus in both layouts — `<packageRoot>/fork` beside `content`,
 * `<packageRoot>/dist/fork` beside `dist/content`. It is probed as the sibling
 * of whichever corpus candidate won rather than as a candidate list of its
 * own, so a stale `dist/fork` left by an earlier build never joins a source
 * checkout that has no `fork/`. This repository ships no `fork/`, and an absent
 * directory resolves to nothing — never to an error.
 */

/** Candidate corpus directories relative to the package root, in probe order. */
const CONTENT_CANDIDATES: readonly (readonly string[])[] = [["content"], ["dist", "content"]];

/** The fork layer's directory name, beside the corpus root's own directory. */
const FORK_DIR = "fork";

let cached: string | null = null;

/**
 * The fork root, once resolved: `root` is `undefined` when the directory is
 * absent. `null` means not resolved yet — a three-state cell rather than a
 * bare optional, so a pinned absence ({@link __setForkRootForTests}) and an
 * unresolved cache do not read the same way.
 */
let forkCache: { readonly root: string | undefined } | null = null;

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
 * The bundled fork layer's root, or `undefined` when the package ships none.
 *
 * Resolved once per process like the corpus root, as that root's sibling:
 * `<dir>/fork` beside `<dir>/content`, whichever layout the corpus resolved
 * to. Absence is the ordinary answer — this repository has no `fork/`, and
 * only a downstream fork's package carries one — so it is cached like a
 * presence and never raised. What DOES propagate is the corpus probe's own
 * `CONFIG_ERROR`: a package with no corpus has no fork layer to pair with it,
 * and that failure is not cached here either, for the reason the corpus probe
 * does not cache it.
 */
export function resolveBundledForkRoot(): string | undefined {
  if (forkCache !== null) return forkCache.root;

  const candidate = join(dirname(resolveBundledContentRoot()), FORK_DIR);
  forkCache = { root: isDirectory(candidate) ? candidate : undefined };
  return forkCache.root;
}

/**
 * Drop the resolved roots so the next call probes again. Test-only (the `__`
 * prefix marks a non-production export): resolution is cached for the process,
 * so a test that changes the layout after a first resolve would otherwise see
 * the stale value. Both caches drop together — the fork root is defined as
 * the corpus root's sibling, so one cannot be re-probed without the other.
 */
// oxlint-disable-next-line no-underscore-dangle
export function __resetContentRootCacheForTests(): void {
  cached = null;
  forkCache = null;
}

/**
 * Pin the corpus root to a fixture directory, bypassing the probe. Test-only.
 *
 * The path is stored verbatim and is never stat-ed, which is the point: the
 * reader tests run against an in-memory volume whose paths do not exist on the
 * real filesystem. Pair with {@link __resetContentRootCacheForTests} in teardown.
 *
 * The fork cache drops with the pin: a fork root resolved beside the previous
 * corpus root is not the sibling of the pinned one, and a fixture that wants a
 * fork layer names it through {@link __setForkRootForTests}.
 */
// oxlint-disable-next-line no-underscore-dangle
export function __setContentRootForTests(dir: string): void {
  cached = dir;
  forkCache = null;
}

/**
 * Pin the fork root — to a fixture directory, or to `undefined` for a package
 * that ships none — bypassing the sibling probe. Test-only, and stored verbatim
 * like the corpus pin. Pair with {@link __resetContentRootCacheForTests} in
 * teardown.
 */
// oxlint-disable-next-line no-underscore-dangle
export function __setForkRootForTests(dir: string | undefined): void {
  forkCache = { root: dir };
}
