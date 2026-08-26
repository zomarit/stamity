/**
 * Per-package emission planning for monorepos.
 *
 * Detection enumerates workspace packages; this module decides which of them
 * get their own copy of a generated file, and where. It plans only — nothing
 * here reads or writes the filesystem, so the caller keeps ownership of
 * merge decisions, ledger accounting and dry-run behaviour.
 *
 * ## Why this is tool-scoped
 *
 * A per-package copy is worth writing only for a client whose load model
 * actually reads per-directory files AND that has no other way to scope
 * guidance to a package:
 *
 * - **codex** — merges `AGENTS.md` from the repository root down to the
 *   working directory, and cannot express glob-scoped rules. Nesting is the
 *   only channel through which a package gets its own scope, which is exactly
 *   what makes the copy a capability rather than a duplicate.
 * - **cursor** — resolves `.mdc` rules by glob from the repository root, so a
 *   package is already targetable centrally; a nested copy would restate what
 *   the glob covers.
 * - **claude** — loads the root file and every ancestor file, so a copy of
 *   root content inside a package double-loads the same guidance.
 * - **copilot** — reads a fixed repo-root instructions file plus central
 *   path-scoped instructions; a directory-nested copy is never read at all.
 *
 * Emitting copies for the last three manufactures precisely the stale-
 * duplicate class the reclaim sweep exists to remove, so they are dropped at
 * the source and every caller inherits the scoping by passing the producing
 * tool.
 *
 * ## Verbatim re-target, by design
 *
 * A planned output is the same content at a different path. No per-package
 * analysis runs and no per-package configuration layer is read: a monorepo
 * whose packages use different stacks receives the same guidance in each. The
 * single edit point for changing that is here plus a customization layer, and
 * this note records the gap as deliberate rather than missed.
 */

import type { Tool } from "../types/core.ts";
import type { PackageEntry } from "../types/detect.ts";
import { EngineError } from "../types/errors.ts";

/**
 * Tools whose load model makes a nested copy a capability. Adding a tool here
 * is the whole change needed to opt it in across every caller.
 */
const PER_PACKAGE_TOOLS: ReadonlySet<Tool> = new Set<Tool>(["codex"]);

/** Normalisation result for a path that resolves to the repository root. */
const ROOT = ".";

/**
 * Whether per-package emission applies to a tool. Exposed so callers can skip
 * collecting package state at all instead of planning their way to an empty
 * array.
 */
export function emitsPerPackage(tool: Tool): boolean {
  return PER_PACKAGE_TOOLS.has(tool);
}

/** One planned per-package emission target. */
export interface PerPackageOutput {
  /** Repo-relative package directory, posix-normalised. */
  packagePath: string;
  /** Repo-relative file to write inside that package, posix-normalised. */
  outputPath: string;
}

/**
 * Plan where `fileName` is written for each workspace package.
 *
 * Returns an empty plan for a tool that does not read per-directory files and
 * for a repo with no workspace packages. The repository root is never a
 * target: the root emission already covers it, and planning it again would
 * collide with that write.
 *
 * Package paths arrive from workspace globs — repository data, not caller
 * code — so an unusable one (absolute, drive-rooted, escaping the root) is
 * skipped and the rest of the plan still stands. `fileName` is engine-owned
 * input, so an unusable value is a defect worth surfacing rather than
 * silently planning nothing.
 *
 * The result is deduplicated and sorted by package path, making the plan a
 * function of the package set alone and not of the order detection happened
 * to enumerate it in.
 *
 * @throws EngineError `VALIDATION_ERROR` when `fileName` is not a
 * repo-relative path inside a package.
 */
export function planPerPackageOutputs(
  packages: readonly PackageEntry[],
  tool: Tool,
  fileName: string,
): PerPackageOutput[] {
  if (!emitsPerPackage(tool)) return [];
  if (packages.length === 0) return [];

  const target = normalizeRelative(fileName);
  if (target === null || target === ROOT) {
    throw new EngineError(
      `Per-package emission target ${JSON.stringify(fileName)} is not a repo-relative file path. ` +
        `Pass a path inside the package, such as "AGENTS.md".`,
      { code: "VALIDATION_ERROR" },
    );
  }

  const dirs = new Set<string>();
  for (const pkg of packages) {
    const dir = normalizeRelative(pkg.path);
    if (dir === null || dir === ROOT) continue;
    dirs.add(dir);
  }

  return [...dirs].toSorted().map((packagePath) => ({
    packagePath,
    outputPath: `${packagePath}/${target}`,
  }));
}

/**
 * Reduce a repo-relative path to its posix form: backslashes become
 * separators, empty and `.` segments collapse, and the result carries no
 * leading or trailing separator. Returns {@link ROOT} for anything that
 * resolves to the repository root itself, and null for a path that is not
 * repo-relative — absolute, drive-rooted, or climbing out with `..`.
 *
 * Sorting and deduplication run on this form, so two spellings of one package
 * directory cannot produce two plan entries.
 */
function normalizeRelative(path: string): string | null {
  const posix = path.replaceAll("\\", "/");
  if (posix.startsWith("/")) return null;
  if (/^[A-Za-z]:/.test(posix)) return null;

  const segments: string[] = [];
  for (const segment of posix.split("/")) {
    if (segment === "" || segment === ROOT) continue;
    if (segment === "..") return null;
    segments.push(segment);
  }
  return segments.length === 0 ? ROOT : segments.join("/");
}
