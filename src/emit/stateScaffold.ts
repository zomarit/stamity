import { lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { STATE_DIR } from "../types/markers.ts";

/**
 * The state directories every run scaffolds, and the placeholder that keeps
 * them in git.
 *
 * Git tracks files, not directories, so an EMPTY `.stamity/learnings/` and
 * `.stamity/handoffs/` cannot be committed. Three things followed from that, all
 * of them wrong at once:
 *
 * - init's own security line said "the state directory is committed on
 *   purpose", which was false for two of the three paths it covers;
 * - every teammate who cloned the repository got a permanent `check` warning
 *   about directories nothing on their machine would recreate;
 * - the remedy that warning named — `stamity init` — hard-refuses a second run
 *   on an initialised repo (`VALIDATION_ERROR`, exit 1) and creates nothing,
 *   and `sync` scaffolded no directories either. There was no command that did
 *   what the warning said.
 *
 * A `.gitkeep` closes the first two; routing BOTH write verbs through this
 * module closes the third.
 *
 * Deliberately NOT a planned emission. As a ledgered row a missing placeholder
 * would be missing-generated-file DRIFT — turning an advisory "these rebuild on
 * first write" warning into a red `check` and an exit 1, which is a severity
 * escalation nothing asked for. It is scaffolding, like the state directories
 * themselves and like the `.gitignore` rule: written by the verb, owned by no
 * ledger row, taken back by `clean` ({@link removeStateScaffold}).
 */
export const STATE_SUBDIRS: readonly string[] = ["learnings", "handoffs"];

/** Git's own convention for the same job. */
export const STATE_KEEP_FILE = ".gitkeep";

/**
 * Placeholder body. Not empty: the file is committed into the operator's
 * repository, and a reader who finds it should learn why it is there from the
 * file itself rather than from this module.
 */
const STATE_KEEP_CONTENT =
  "# Keeps this directory in git, which tracks files rather than directories.\n" +
  "# The setup writes learnings and handoffs here; remove this file and the\n" +
  "# directory disappears from a fresh clone.\n";

/** Repo-relative POSIX path of one state subdirectory. */
function stateDirPath(name: string): string {
  return `${STATE_DIR}/${name}`;
}

/** Repo-relative POSIX paths of the placeholders, in creation order. */
export function stateKeepPaths(): string[] {
  return STATE_SUBDIRS.map((name) => `${stateDirPath(name)}/${STATE_KEEP_FILE}`);
}

/**
 * Create the state subdirectories and their placeholders, idempotently.
 *
 * `wx` on the placeholder write, so an operator who edited the file keeps their
 * bytes: this scaffolds an absence, it does not maintain a document. A dry run
 * touches nothing and reports what it would have created.
 *
 * Returns the repo-relative directories that did not exist beforehand, which is
 * what init's report lists as `createdDirs`.
 */
export async function ensureStateScaffold(
  rootDir: string,
  opts: { dryRun?: boolean } = {},
): Promise<string[]> {
  if (opts.dryRun === true) return STATE_SUBDIRS.map(stateDirPath);
  // Independent paths under one parent, so they run together: nothing here
  // reads what a sibling wrote, and `recursive: true` makes the shared parent's
  // creation idempotent whichever call reaches it first.
  const created = await Promise.all(
    STATE_SUBDIRS.map(async (name) => {
      const dir = join(rootDir, STATE_DIR, name);
      // `recursive` reports the topmost directory it created and `undefined`
      // when the path already existed — the "did this run add it" answer, read
      // from the syscall rather than from a second `stat` that could race it.
      const madeDir = await mkdir(dir, { recursive: true });
      try {
        await writeFile(join(dir, STATE_KEEP_FILE), STATE_KEEP_CONTENT, { flag: "wx" });
      } catch (err) {
        if ((err as NodeJS.ErrnoException | null)?.code !== "EEXIST") throw err;
      }
      return madeDir === undefined ? null : stateDirPath(name);
    }),
  );
  return created.filter((row): row is string => row !== null);
}

/**
 * Take the placeholders back out (REQ-FLOW-028): `clean` keeps the state
 * directory's user content, so the scaffold that marks an empty store is the
 * setup's to remove, and only as the bytes it wrote. Each placeholder that is a
 * regular file holding exactly the scaffold's body is unlinked; an edited one,
 * a link at its name and a missing one are left. A store folder that is a link
 * is never looked into, since its placeholder is not under this repository: it
 * is left, and returned in `linked` (review/60). The folders stay for the
 * caller, which prunes them once empty.
 *
 * Returns the repo-relative placeholders it removed and the linked store
 * folders (ending in `/`) it left, each in creation order.
 */
export async function removeStateScaffold(rootDir: string): Promise<{ removed: string[]; linked: string[] }> {
  const outcomes = await Promise.all(
    STATE_SUBDIRS.map(async (name): Promise<{ removed?: string; linked?: string }> => {
      const dir = join(rootDir, STATE_DIR, name);
      const path = `${stateDirPath(name)}/${STATE_KEEP_FILE}`;
      try {
        const folder = await lstat(dir);
        if (folder.isSymbolicLink()) return { linked: `${stateDirPath(name)}/` };
        if (!folder.isDirectory()) return {};
        const absPath = join(dir, STATE_KEEP_FILE);
        if (!(await lstat(absPath)).isFile() || (await readFile(absPath, "utf8")) !== STATE_KEEP_CONTENT) return {};
        await unlink(absPath);
        return { removed: path };
      } catch (err) {
        if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT") return {};
        throw err;
      }
    }),
  );
  return {
    removed: outcomes.flatMap(({ removed }) => (removed === undefined ? [] : [removed])),
    linked: outcomes.flatMap(({ linked }) => (linked === undefined ? [] : [linked])),
  };
}
