import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { isPlainObject } from "../config/parse.ts";

/**
 * Which package manager a repository runs on.
 *
 * Two independent signals, ranked. The `packageManager` field in
 * `package.json` — the Corepack pin, `<name>@<version>` with an optional
 * `+<integrity>` suffix (nodejs.org/api/packages.html#packagemanager, accessed
 * 2026-08-13) — is a statement by the repo's owner and outranks the disk: a
 * repo that pins pnpm is a pnpm repo even while a `package-lock.json` left over
 * from an earlier toolchain sits beside the pin. Only when no usable pin exists
 * does a lockfile decide.
 *
 * Lockfile order is fixed rather than first-found, so two checkouts of the same
 * repo never disagree, and it runs from the most-specific manager to the least:
 * `pnpm` and `yarn` lockfiles are written only by those tools, while
 * `package-lock.json` is also what a stray `npm install` leaves behind in a
 * repo that belongs to another manager. Ranking npm last makes that stray file
 * the weakest evidence rather than the winner.
 *
 * Nothing here fails: an unreadable or malformed `package.json` is a missing
 * signal, and a repo with no evidence at all resolves to npm — the manager
 * every Node install already has. `lockfile` and `fromPackageJsonField` report
 * what was actually observed, so a caller can tell an observed npm repo from a
 * defaulted one.
 */

export type PackageManagerName = "bun" | "pnpm" | "yarn" | "npm";

export interface PackageManagerInfo {
  name: PackageManagerName;
  /** Filename of the highest-precedence lockfile present in the root, or null when there is none. */
  lockfile: string | null;
  /** True when `name` came from the `packageManager` pin rather than from a lockfile. */
  fromPackageJsonField: boolean;
}

/** Lockfiles in precedence order; the first one present decides an unpinned repo. */
const LOCKFILES: readonly { readonly file: string; readonly name: PackageManagerName }[] = [
  { file: "pnpm-lock.yaml", name: "pnpm" },
  { file: "yarn.lock", name: "yarn" },
  // Bun 1.2 made the text `bun.lock` the default; `bun.lockb` is the pre-1.2 binary form
  // that migrating repos still carry (bun.com/docs/pm/lockfile, accessed 2026-08-13).
  { file: "bun.lock", name: "bun" },
  { file: "bun.lockb", name: "bun" },
  { file: "package-lock.json", name: "npm" },
  { file: "npm-shrinkwrap.json", name: "npm" },
];

const PACKAGE_MANAGER_NAMES: readonly PackageManagerName[] = ["bun", "pnpm", "yarn", "npm"];

/** Leading name of a Corepack pin: `pnpm@9.0.0+sha512.…` → `pnpm`. */
const PIN_NAME = /^([a-z]+)(?:@|$)/;

type LockfileMatch = (typeof LOCKFILES)[number];

/**
 * Detect the package manager of the repository rooted at `rootDir`.
 *
 * Both signals are read concurrently and reconciled afterwards, so the returned
 * `lockfile` always describes the disk even when the pin is what named the
 * manager — a pnpm pin beside a `package-lock.json` is exactly the mixed state
 * a caller wants to see reported, not hidden.
 */
export async function detectPackageManager(rootDir: string): Promise<PackageManagerInfo> {
  const [pinned, lockfile] = await Promise.all([readPinnedName(rootDir), findLockfile(rootDir)]);
  return {
    name: pinned ?? lockfile?.name ?? "npm",
    lockfile: lockfile?.file ?? null,
    fromPackageJsonField: pinned !== null,
  };
}

/**
 * The manager named by the `packageManager` pin, or null.
 *
 * A pin naming a manager this engine does not know (`deno@2.0.0`) yields null
 * rather than an error: detection reports what it recognises and lets the
 * remaining evidence speak, because a stack the engine cannot name is a
 * legitimate repo, not a defect.
 */
async function readPinnedName(rootDir: string): Promise<PackageManagerName | null> {
  const manifest = await readManifest(join(rootDir, "package.json"));
  const pin = manifest?.packageManager;
  if (typeof pin !== "string") return null;

  const name = PIN_NAME.exec(pin.trim().toLowerCase())?.[1];
  if (name === undefined) return null;
  return (PACKAGE_MANAGER_NAMES as readonly string[]).includes(name)
    ? (name as PackageManagerName)
    : null;
}

/** The highest-precedence lockfile present, or null. All candidates are probed concurrently. */
async function findLockfile(rootDir: string): Promise<LockfileMatch | null> {
  const present = await Promise.all(
    LOCKFILES.map(async (entry) => ((await isFile(join(rootDir, entry.file))) ? entry : null)),
  );
  return present.find((entry) => entry !== null) ?? null;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    // Absent (ENOENT), unreadable (EACCES), or reached through a broken link
    // (ELOOP/ENOTDIR) are all "no lockfile here" to a presence probe. A rejection
    // carrying no errno is a defect in this module and still propagates.
    if (typeof (error as NodeJS.ErrnoException).code === "string") return false;
    throw error;
  }
}

/** Root manifest as an object, or null when it is absent, unreadable, or not valid JSON. */
async function readManifest(path: string): Promise<Record<string, unknown> | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (typeof (error as NodeJS.ErrnoException).code === "string") return null;
    throw error;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    // A manifest that does not parse is one no package manager could act on
    // either; the lockfile evidence stands on its own.
    return null;
  }
}
