import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { MANIFEST_FILE } from "../types/manifest.ts";
import { STATE_DIR } from "../types/markers.ts";
import { WORKSPACE_MANIFEST_FILE } from "./model.ts";

/**
 * Workspace detection: which repositories sit under a directory, and how the
 * directory itself relates to a workspace.
 *
 * Every function here is a presence probe, so none of them can fail. An
 * unreadable directory, a dangling symlink, a path that does not exist are
 * each "no signal" rather than an error — detection picks defaults and offers
 * suggestions, it never gates a run, and refusing to scan a tree because one
 * subdirectory denied a read would be strictly worse than scanning the rest.
 *
 * Detection is deliberately not authority either. {@link detectWorkspaceContext}
 * classifies on the presence of a manifest, never on its contents: confirming
 * that a directory is a *registered* member means reading and validating the
 * manifest, and refusing an unregistered one is `resolveRepoConfig`'s job. The
 * context carries {@link WorkspaceContext.manifestPath} so a caller that needs
 * authority can go and get it; a caller that only needs a hint — a first-run
 * suggestion, a status line — stops at the role.
 */

/**
 * How deep {@link detectSubRepos} descends when the caller names no depth.
 *
 * The scan fans out — every level lists a directory and probes each child — so
 * the cap bounds cost as well as reach. Four covers the conventional layouts
 * (`repos/<name>`, `apps/<area>/<name>`, `packages/<scope>/<name>`) with a
 * level to spare, and the walk stops at the first repository on a branch, so
 * the budget is only ever spent on genuinely repo-free directories.
 */
const DEFAULT_MAX_DEPTH = 4;

/**
 * How many ancestors above the starting directory {@link detectWorkspaceContext}
 * examines. Ten is a single chain of stats rather than a fan-out, and it clears
 * the deepest member layouts a workspace realistically holds
 * (`apps/<area>/<name>/src/<module>` is five). The walk also stops at the
 * filesystem root, whichever comes first.
 */
const MAX_PARENT_WALK = 10;

/**
 * How many member repositories a directory must hold before
 * {@link shouldSuggestWorkspace} proposes a workspace. One repository is just a
 * repository; propagation only starts paying at two.
 */
const MIN_REPOS_TO_SUGGEST = 2;

/** Directory names the scan never enters: an installed dependency tree, and every dot-directory. */
const SKIPPED_DIR = "node_modules";

/**
 * A repository found under a scanned root — a candidate workspace member.
 *
 * Both flags are load-bearing because either one alone qualifies a directory:
 * `.git` marks a repository the workspace could adopt, and an existing state
 * directory marks one already set up (including a repository checked in as a
 * subdirectory of a larger one, which carries no `.git` of its own).
 */
export interface DetectedRepo {
  /** POSIX path relative to the scanned root (`apps/web`), never absolute. */
  path: string;
  /** Directory name — the default display name. */
  name: string;
  /** A `.git` entry is present: a directory for a clone, a file for a worktree or submodule. */
  hasGit: boolean;
  /** A setup manifest is already present at `.stamity/manifest.json`. */
  hasManifest: boolean;
}

/** Where a directory stands relative to a workspace. */
export type WorkspaceRole = "workspace-root" | "workspace-member" | "standalone";

/**
 * The classification of one directory. `workspaceRoot` and `manifestPath` are
 * both non-null exactly when the role is not `standalone` — a role that names a
 * workspace always says which one, and where its manifest is.
 */
export interface WorkspaceContext {
  role: WorkspaceRole;
  /** Absolute path of the workspace root; null when standalone. */
  workspaceRoot: string | null;
  /** Absolute path of the workspace manifest; null when standalone. */
  manifestPath: string | null;
}

/**
 * Repositories under `rootDir`, sorted by path.
 *
 * A directory qualifies when it carries a `.git` entry or a setup manifest of
 * our own, and the walk stops there: a repository nested inside a member is
 * that member's business, not the workspace's. `rootDir` is never a result —
 * the scan starts at its children — so a workspace root that is itself a
 * repository is not counted as one of its own members.
 *
 * Dot-directories and `node_modules` are skipped at every level. That is what
 * keeps `.git`'s own internals and a dependency tree's vendored checkouts out
 * of the results, and it means a member directory whose name starts with a dot
 * is out of scope by construction.
 *
 * Symlinked directories are not followed. A recursive walk that follows links
 * needs a cycle guard, and a member reached through one would report a path
 * that a later write would follow back out of the workspace — neither is worth
 * paying for a layout that can be expressed with a real directory.
 *
 * Ordering is byte-order on the path, not locale-aware, so the same tree scans
 * to the same list on every machine.
 */
export async function detectSubRepos(
  rootDir: string,
  opts?: { maxDepth?: number },
): Promise<DetectedRepo[]> {
  const maxDepth = normalizeDepth(opts?.maxDepth);
  const found: DetectedRepo[] = [];

  const visit = async (dir: string, prefix: string, depth: number): Promise<void> => {
    const entries = await readDirEntries(dir);
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === SKIPPED_DIR) {
          return;
        }
        const child = join(dir, entry.name);
        const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
        const [hasGit, hasManifest] = await Promise.all([
          pathExists(join(child, ".git")),
          fileExists(join(child, STATE_DIR, MANIFEST_FILE)),
        ]);

        if (hasGit || hasManifest) {
          found.push({ path, name: entry.name, hasGit, hasManifest });
          return;
        }
        if (depth < maxDepth) await visit(child, path, depth + 1);
      }),
    );
  };

  await visit(resolve(rootDir), "", 1);
  return found.toSorted((a, b) => compare(a.path, b.path));
}

/**
 * Classify `dir`: the workspace root itself, a directory below one, or neither.
 *
 * `dir` and its ancestors are one candidate list, probed in a single round of
 * IO. The chain is pure path arithmetic, so nothing is gained by discovering it
 * one stat at a time, and the nearest candidate holding a manifest wins —
 * which is what makes a nested workspace shadow an outer one for the
 * directories it contains. Both roles fall out of the same probe: a manifest in
 * `dir` makes it the root, the same manifest above it makes `dir` a member, so
 * the two classifications cannot drift apart.
 *
 * Membership here is positional, not registered: a directory below a workspace
 * root classifies as a member whether or not the manifest lists it. That is the
 * honest limit of a probe that does not read the manifest, and it is why the
 * result carries `manifestPath` — a caller about to tell the user that this
 * repository is managed by the workspace should confirm registration through
 * the manifest layer first.
 */
export async function detectWorkspaceContext(dir: string): Promise<WorkspaceContext> {
  const start = resolve(dir);
  const candidates = ancestorChain(start).map((root) => ({
    root,
    manifestPath: join(root, WORKSPACE_MANIFEST_FILE),
  }));

  const present = await Promise.all(
    candidates.map((candidate) => fileExists(candidate.manifestPath)),
  );
  const nearest = candidates.find((_candidate, index) => present[index] === true);
  if (nearest === undefined) return { role: "standalone", workspaceRoot: null, manifestPath: null };

  return {
    role: nearest.root === start ? "workspace-root" : "workspace-member",
    workspaceRoot: nearest.root,
    manifestPath: nearest.manifestPath,
  };
}

/**
 * `dir` followed by its ancestors, nearest first: at most
 * {@link MAX_PARENT_WALK} of them, and fewer when the filesystem root arrives
 * first (`dirname` reaches a fixpoint there, which is what terminates the walk).
 */
function ancestorChain(dir: string): string[] {
  const chain = [dir];
  let current = dir;
  for (let step = 0; step < MAX_PARENT_WALK; step++) {
    const parent = dirname(current);
    if (parent === current) break;
    chain.push(parent);
    current = parent;
  }
  return chain;
}

/**
 * Whether `dir` looks like it wants to become a workspace: it holds at least
 * {@link MIN_REPOS_TO_SUGGEST} repositories and is not already a workspace root.
 *
 * `dir` being a repository itself is not a veto. A repository holding
 * submodules or vendored checkouts is precisely a tree whose members want one
 * shared policy, and vetoing it would contradict the rule that a root is
 * allowed to be a repository. The existing-manifest check runs first so a
 * settled workspace never pays for the tree walk.
 */
export async function shouldSuggestWorkspace(dir: string): Promise<boolean> {
  if (await isWorkspaceRoot(dir)) return false;
  const repos = await detectSubRepos(dir);
  return repos.length >= MIN_REPOS_TO_SUGGEST;
}

/**
 * Whether `dir` holds a workspace manifest. The probe requires a regular file:
 * a directory sharing the manifest's name answers no, so a mislabelled
 * directory cannot make an ordinary folder read as a workspace root.
 */
export async function isWorkspaceRoot(dir: string): Promise<boolean> {
  return fileExists(join(resolve(dir), WORKSPACE_MANIFEST_FILE));
}

/**
 * A depth the walk can act on. Zero and negatives would scan nothing and report
 * an empty tree — a wrong answer dressed as a fact — so the floor is one level,
 * and a non-finite value falls back to the default rather than looping forever.
 */
function normalizeDepth(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_MAX_DEPTH;
  return Math.max(1, Math.floor(value));
}

/**
 * Run a filesystem read, answering `fallback` when the filesystem says no.
 *
 * ENOENT (absent), EACCES/EPERM (unreadable), ENOTDIR (a file where a directory
 * was expected), and ELOOP (a symlink cycle) all mean the same thing to a
 * presence probe: no signal here. A rejection carrying no errno is a defect in
 * this module rather than a fact about the tree, so it propagates instead of
 * being absorbed into a plausible-looking result.
 */
async function probe<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (typeof (error as NodeJS.ErrnoException).code === "string") return fallback;
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  return probe(async () => {
    await stat(path);
    return true;
  }, false);
}

async function fileExists(path: string): Promise<boolean> {
  return probe(async () => (await stat(path)).isFile(), false);
}

async function readDirEntries(path: string): Promise<Dirent[]> {
  return probe<Dirent[]>(() => readdir(path, { withFileTypes: true }), []);
}

/** Byte-order comparison, so scan ordering does not shift with the machine's locale. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
