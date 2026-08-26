import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { EngineError } from "../types/errors.ts";

function hasPackageJson(dir: string): boolean {
  try {
    return statSync(join(dir, "package.json"), { throwIfNoEntry: false })?.isFile() === true;
  } catch {
    // An unreadable ancestor (EACCES) or a broken symlink is not a package root;
    // keep walking instead of failing the whole lookup on a directory we were
    // only passing through.
    return false;
  }
}

/**
 * Nearest ancestor of `startDir` — the directory itself included — that holds a
 * `package.json` file. This is how the engine locates the installed package
 * that ships the bundled corpus, and how repo-relative paths get anchored.
 *
 * The walk probes the filesystem root before it stops, so a `package.json` at
 * `/` is found rather than missed, and it terminates at the root fixpoint
 * instead of looping. Nothing qualifying is a typed `FS_ERROR`, not a fallback
 * to `startDir`: handing back a directory that is not a package root turns a
 * clear failure into a wrong-path failure further downstream.
 */
export function findPackageRoot(startDir: string): string {
  const start = resolve(startDir);
  let dir = start;
  for (;;) {
    if (hasPackageJson(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new EngineError(
    `No package.json found in ${start} or any parent directory. ` +
      `Run inside an installed package, or pass a directory below one.`,
    { code: "FS_ERROR" },
  );
}
