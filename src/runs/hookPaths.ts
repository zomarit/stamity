import { join, posix } from "node:path";
import { isPlainObject, parseJsonStrict } from "../config/parse.ts";
import { readHookDefinitions } from "../hooks/userHooks.ts";
import { checkLauncherArgv } from "../shared/launcherAllowlist.ts";

/**
 * The hook files and scripts a commit's hook declarations name (review/175, review/182-/189, signed off), read from
 * that commit's tree objects alone, never a work tree: what an unattended `run checkpoint` and `run end` hold at
 * `Base:`, and what `run land` asks for at `Base:` and at the head (build/2). Moved out of `../cli/commands/run.ts`
 * unchanged, behind injected reads in the pattern of `./preflight.ts`: git comes as a function, and so does the
 * scratch folder the engine's own declaration reader ({@link readHookDefinitions}) reads a stand-in copy from. The
 * module starts no process and touches no file itself.
 */

/** One git call (the caller's hardened runner): its exit status, stdout and stderr; a git that could not run throws. */
export type HookGitRead = (args: readonly string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

/** The scratch folder the declarations' stand-in copy is laid out in. */
export interface HookScratch {
  /** A fresh, empty folder; its absolute path. */
  create(): string;
  /** `text` at the POSIX `path` below `root`, its folders made; throws where it cannot land. */
  place(root: string, path: string, text: string): void;
  /** The folder and everything in it gone. */
  remove(root: string): void;
}

/** What {@link hookPathsAt} reads through. */
export interface HookPathReads {
  git: HookGitRead;
  scratch: HookScratch;
}

/** review/175: the manifest, the default folder of the repository's own hook declarations, and the installed packs' folder. */
const MANIFEST_PATH = ".stamity/manifest.json";
const USER_HOOKS_DIR = ".stamity/hooks";
const PACKS_DIR = ".stamity/packs";

/** UTF-8's byte-order mark, which the manifest reader drops before it parses (`src/manifest/manifest.ts`, review/188). */
const BOM = String.fromCharCode(0xfeff);

/** A link's mode in a tree listing. */
const LINK_MODE = "120000";

/** One entry of a folder at `Base:`, as `git ls-tree -z` lists it: its name, its object id and what it is. */
interface TreeEntry {
  name: string;
  id: string;
  kind: "folder" | "file" | "link" | "submodule";
}

/** A path read at `Base:`: its top-relative spelling and what it names there (a missing name has no id), or why it does not resolve cleanly. */
type AtBase = { path: string; kind: "folder" | "file" | "missing"; id: string } | { refused: string };

/** The reads {@link baseReader} offers: a project-relative path, a top-relative path's segments, and one folder's entries. */
interface BaseReader {
  resolve: (path: string) => Promise<AtBase>;
  walk: (segments: readonly string[]) => Promise<AtBase>;
  list: (tree: string) => Promise<TreeEntry[] | string>;
}

/**
 * review/108: a failed read's class, as a caller may print it on a public page: the first error code found on the error
 * or its causes (`EACCES`, `ENOENT`, a runner's `GH_REFUSED`), never a message; `read failed` where none is found.
 */
function errorCode(cause: unknown): string {
  for (let at: unknown = cause, depth = 0; at !== null && typeof at === "object" && depth < 4; at = (at as { cause?: unknown }).cause, depth += 1) {
    const code = (at as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]{1,40}$/.test(code)) return code;
  }
  return "read failed";
}

/**
 * review/185, review/186 (signed off): the one resolver the hold reads `Base:` through. It walks `base`'s tree objects
 * from the root, one listing per folder, never a work tree and never a path git resolves. A project-relative path reads
 * its backslashes as separators and drops its `.` segments; a `..` segment, an absolute path or one naming a drive or a
 * scheme, and the project root itself do not resolve cleanly. Nor does a segment that is a link or a submodule at
 * `Base:`, or one the tree spells in another letter case or holds twice by letter case, since a checkout that follows
 * the link or folds the case reads another file there. A path that meets a missing name, or a file where a folder
 * goes, names nothing at `Base:`, cleanly.
 */
function baseReader(git: HookGitRead, base: string, prefix: string): BaseReader {
  const listings = new Map<string, Promise<TreeEntry[] | string>>();
  const entriesOf = (tree: string): Promise<TreeEntry[] | string> => {
    const known = listings.get(tree);
    if (known !== undefined) return known;
    const listing = listTree(git, tree);
    listings.set(tree, listing);
    return listing;
  };
  const fold = (name: string): string => name.normalize("NFC").toLowerCase();
  const walk = async (segments: readonly string[]): Promise<AtBase> => {
    const path = segments.join("/");
    let tree = base;
    for (const [index, segment] of segments.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- the walk's next folder is the entry this listing finds
      const entries = await entriesOf(tree);
      if (typeof entries === "string") return { refused: entries };
      const like = entries.filter((entry) => fold(entry.name) === fold(segment));
      const spelled = like.map((entry) => [...segments.slice(0, index), entry.name].join("/")).join(", ");
      const [entry] = like;
      if (entry === undefined) return { path, kind: "missing", id: "" };
      if (like.length > 1) return { refused: `is ambiguous by letter case in the tree (${spelled})` };
      // review/204: a name equal to the tree's once both are composed differs by normalization alone, not by letter case.
      if (entry.name !== segment) {
        const form = entry.name.normalize("NFC") === segment.normalize("NFC") ? "Unicode normalization form" : "letter case";
        return { refused: `is spelled in another ${form} than the tree's ${spelled}` };
      }
      if (entry.kind === "link" || entry.kind === "submodule") return { refused: `passes through a ${entry.kind} (${spelled})` };
      if (index === segments.length - 1) return { path, kind: entry.kind, id: entry.id };
      if (entry.kind === "file") return { path, kind: "missing", id: "" };
      tree = entry.id;
    }
    return { refused: "names the project root" };
  };
  const resolvePath = async (path: string): Promise<AtBase> => {
    const unified = path.replaceAll("\\", "/");
    if (unified.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(unified)) return { refused: "is absolute or names a drive or a scheme" };
    const named = unified.split("/").filter((segment) => segment !== "" && segment !== ".");
    if (named.includes("..")) return { refused: "holds a .. segment" };
    if (named.length === 0) return { refused: "names the project root" };
    return walk([...prefix.split("/").filter((segment) => segment !== ""), ...named]);
  };
  return { resolve: resolvePath, walk, list: entriesOf };
}

/** The entries of the tree `tree` names (a commit names its root tree), or why they could not be listed, for `notDone`. */
async function listTree(git: HookGitRead, tree: string): Promise<TreeEntry[] | string> {
  const read = await git(["ls-tree", "-z", tree]);
  // review/108: git's exit code alone; its stderr can name a machine's path, and this text can reach the pull request.
  if (read.code !== 0) return `could not be listed (git ls-tree answered ${read.code})`;
  return read.stdout.split("\0").flatMap((line): TreeEntry[] => {
    const [, mode, type, id, name] = /^(\d{6}) (\w+) ([0-9a-f]{40,64})\t([^]+)$/.exec(line) ?? [];
    if (mode === undefined || type === undefined || id === undefined || name === undefined) return [];
    return [{ name, id, kind: type === "tree" ? "folder" : type !== "blob" ? "submodule" : mode === LINK_MODE ? "link" : "file" }];
  });
}

/** review/205: what ends every hold refusal read at `Base:`, the person's next step. */
const NEXT_STEP = "; fix it on the base branch, then start the run again from it";

/**
 * REQ-FLOW-102: the setup root a path names where it is a setup's manifest (`<root>.stamity/manifest.json`), the root
 * top-relative and `/`-ended, the top as `""`; else `null`. The two last segments compare as the `Base:` walk reads
 * names, without case and in one Unicode normalization form, since a case-folding checkout opens that file there.
 */
export function setupRootOf(path: string): string | null {
  const segments = path.replaceAll("\\", "/").split("/");
  const fold = (segment: string | undefined): string => (segment ?? "").normalize("NFC").toLowerCase();
  if (segments.length < 2 || fold(segments.at(-2)) !== ".stamity" || fold(segments.at(-1)) !== "manifest.json") return null;
  const folders = segments.slice(0, -2);
  return folders.length === 0 ? "" : `${folders.join("/")}/`;
}

/**
 * REQ-FLOW-102: every setup root in `commit`'s tree, sorted and once each: each folder that holds a setup's manifest
 * ({@link setupRootOf}), whatever it is there, so a manifest that is a link or a submodule is a root whose read then
 * refuses, as the run's own does. One recursive listing of the tree objects, never a work tree; a failed listing is
 * the refusal text, worded for `notDone`.
 */
export async function setupRootsAt(git: HookGitRead, commit: string): Promise<string[] | string> {
  const read = await git(["ls-tree", "-r", "-z", "--name-only", "--full-tree", commit]);
  // review/108: git's exit code alone; its stderr can name a machine's path, and this text can reach the pull request.
  if (read.code !== 0) {
    return `hold refused: the setups in the tree of ${commit} could not be listed (git ls-tree answered ${read.code}), so the person-only files they hold are unknown and the run pushes nothing`;
  }
  const roots = read.stdout.split("\0").flatMap((path) => {
    const root = path === "" ? null : setupRootOf(path);
    return root === null ? [] : [root];
  });
  return [...new Set(roots)].toSorted();
}

/**
 * review/175, review/182-/189 (signed off): what the hold holds from the hook declarations at `base`, top-relative and
 * sorted. First the files it reads there, each held whole wherever it lies: the manifest, the folder of the
 * repository's own declarations the manifest names (`.stamity/hooks` by default), and the installed packs' folder,
 * whose `<pack>/hooks/` folders hold theirs. Then the script each declaration names, and every other argument that
 * names a repository file (its launcher where that is a path rather than a name on PATH, build/98, an option's value and
 * an argument word, bare or written as a path), held whether or not it exists at `base` (review/196, review/199); a
 * folder an argument names is not held (review/197), nor a value with a URL-like scheme (review/198). All of them
 * resolve from the project root the manifest sits in (`prefix`, the project's folder below the git top). The
 * declarations are read at `base`, never from the work tree, so a run cannot unhold a script by editing or deleting
 * its declaration, and through the engine's own reader ({@link readHookDefinitions}, with {@link checkLauncherArgv}'s
 * one script argument), so a declaration emission refuses for its shape names nothing held. The reader runs over a
 * scratch copy of them ({@link HookScratch}) whose arguments read backslashes as separators, as a Windows checkout
 * reads them, and in which every path an argument names stands as an empty file: whether the script exists is not
 * judged, since emission on a checkout where it was there but uncommitted wired it, and a run that then adds it must
 * not push it.
 *
 * The hold fails closed on anything it cannot resolve cleanly at `base`. Every path it reads and every script a
 * declaration names goes through {@link baseReader}'s one resolver, and a file that does not read or parse, a folder
 * that is a file, a script whose stand-in did not land (the reader then reads it as missing), and an argument the
 * reader reads as leaving the repository refuse too: the reason, for `notDone`. Residuals the pages name: a hook
 * written by hand into a client's settings file; anything a held script reads or loads beyond the files its
 * declaration names (review/187, review/197); a run that rewrites its own record head's `Base:`, as it can its `Mode:`.
 *
 * REQ-FLOW-102: `prefix` may list several project roots (every setup root, {@link setupRootsAt}, and the run's own);
 * each is read as one root is, from its own folder, and the paths held are their union. Any root that does not resolve
 * cleanly refuses, naming its file. One root written alone reads as before.
 */
export async function hookPathsAt(reads: HookPathReads, prefix: string | readonly string[], base: string): Promise<string[] | string> {
  const read = await hookPathsRead(reads, prefix, base);
  if (Array.isArray(read)) return read;
  // review/205: the refusal names the person's next step, since the fix lands on the base branch, not on the run's.
  return read.subject === null
    ? `hold refused: the hook declarations at Base: could not be read (${read.why}), so the hook scripts they name are unknown and the run pushes nothing${NEXT_STEP}`
    : `hold refused: ${read.subject} at Base: ${read.why}, so the hook scripts it names are unknown and the run pushes nothing${NEXT_STEP}`;
}

/** Why the hook paths at a commit are not known: the file or folder it stopped at (`null` for a failed read) and why. */
export interface HookReadRefusal {
  subject: string | null;
  why: string;
}

/**
 * {@link hookPathsAt}'s read with its refusal unworded, so each caller states its own next step: the hold's names the
 * base branch and a restart, `run land`'s (review/81) the branch that holds the declaration and another land call.
 * Several roots are read once each, in the order given (an empty list reads the top); the first that refuses decides.
 */
export async function hookPathsRead(reads: HookPathReads, prefix: string | readonly string[], base: string): Promise<string[] | HookReadRefusal> {
  const listed = typeof prefix === "string" ? [prefix] : prefix;
  const roots = [...new Set(listed.length === 0 ? [""] : listed)];
  const read = await Promise.all(roots.map((root) => rootHookPaths(reads, root, base)));
  const held: string[] = [];
  for (const paths of read) {
    if (!Array.isArray(paths)) return paths;
    held.push(...paths);
  }
  return [...new Set(held)].toSorted();
}

/** {@link hookPathsRead} for the one project root `prefix` names. */
async function rootHookPaths(reads: HookPathReads, prefix: string, base: string): Promise<string[] | HookReadRefusal> {
  const { git, scratch: folder } = reads;
  const at = baseReader(git, base, prefix);
  const unknown = (path: string, why: string): HookReadRefusal => ({ subject: path, why });
  const json = async (path: string, id: string): Promise<{ document: unknown } | { refused: HookReadRefusal }> => {
    const read = await git(["cat-file", "blob", id]);
    if (read.code !== 0) return { refused: unknown(path, `could not be read (git cat-file answered ${read.code})`) };
    try {
      return { document: parseJsonStrict(read.stdout.startsWith(BOM) ? read.stdout.slice(BOM.length) : read.stdout, path) };
    } catch {
      return { refused: unknown(path, "does not parse") };
    }
  };

  // The manifest, and the folder of the repository's own declarations it names.
  const manifest = await at.resolve(MANIFEST_PATH);
  if ("refused" in manifest) return unknown(`${prefix}${MANIFEST_PATH}`, manifest.refused);
  if (manifest.kind === "folder") return unknown(manifest.path, "is a folder where the manifest goes");
  let hooksDir = USER_HOOKS_DIR;
  if (manifest.kind === "file") {
    const read = await json(manifest.path, manifest.id);
    if ("refused" in read) return read.refused;
    const hooks = isPlainObject(read.document) ? (read.document["hooks"] ?? {}) : null;
    const named = isPlainObject(hooks) ? hooks["userHooksDir"] : null;
    if (named !== undefined && typeof named !== "string") return unknown(manifest.path, "names no hooks folder the engine reads");
    if (named !== undefined) hooksDir = named;
  }

  // The declaration folders: that one, and each installed pack's `hooks/`.
  const hooksFolder = await at.resolve(hooksDir);
  if ("refused" in hooksFolder) return unknown(`${prefix}${hooksDir}`, hooksFolder.refused);
  const packs = await at.resolve(PACKS_DIR);
  if ("refused" in packs) return unknown(`${prefix}${PACKS_DIR}`, packs.refused);
  if (packs.kind === "file") return unknown(packs.path, "is a file where the packs folder goes");
  const roots = packs.kind === "folder" ? await at.list(packs.id) : [];
  if (typeof roots === "string") return unknown(packs.path, roots);
  const packHooks = await Promise.all(
    roots.map(async (root) => ({ subject: `${packs.path}/${root.name}/hooks`, folder: await at.walk([...packs.path.split("/"), root.name, "hooks"]) })),
  );
  const candidates: { subject: string; folder: AtBase }[] = [{ subject: hooksFolder.path, folder: hooksFolder }, ...packHooks];
  const folders: { path: string; id: string }[] = [];
  for (const { subject, folder: candidate } of candidates) {
    if ("refused" in candidate) return unknown(subject, candidate.refused);
    if (candidate.kind === "file") return unknown(candidate.path, "is a file where a hook folder goes");
    if (candidate.kind === "folder" && !folders.some((known) => known.path === candidate.path)) folders.push(candidate);
  }
  const held = new Set([manifest.path, hooksFolder.path, packs.path]);

  // The declaration files the reader takes: each folder's own regular `.json` files (it refuses a link and skips the rest).
  const listed = await Promise.all(folders.map(async (entry) => ({ folder: entry, entries: await at.list(entry.id) })));
  const declarations: { path: string; id: string }[] = [];
  for (const { folder: owner, entries } of listed) {
    if (typeof entries === "string") return unknown(owner.path, entries);
    for (const entry of entries) {
      if (entry.kind === "file" && entry.name.endsWith(".json")) declarations.push({ path: `${owner.path}/${entry.name}`, id: entry.id });
    }
  }
  const texts: { path: string; text: string }[] = [];
  const named = new Set<string>();
  const parsed = await Promise.all(declarations.map(async ({ path, id }) => ({ path, read: await json(path, id) })));
  for (const { path, read } of parsed) {
    if ("refused" in read) return read.refused;
    const copy = separatorsRead(read.document);
    texts.push({ path, text: `${JSON.stringify(copy)}\n` });
    for (const argument of declaredArguments(copy)) named.add(argument);
  }
  if (texts.length === 0) return [...held].toSorted();

  // Every contained path an argument names stands as an empty file, short of one another's folders and the declarations'.
  const project = (path: string): string => path.slice(prefix.length);
  const occupied = texts.map(({ path }) => project(path));
  const stand = [...named].filter(
    (path) => ![...named, ...occupied].some((other) => other.startsWith(`${path}/`)) && !occupied.includes(path),
  );
  const scratch = folder.create();
  try {
    for (const path of stand) {
      try {
        folder.place(scratch, path, "");
      } catch {
        // review/189: a stand-in that cannot land (a name this file system cannot hold, or one a case-insensitive
        // scratch folder already holds as a folder) leaves its path missing to the reader, which refuses a hook that
        // names it as the code it runs as MISSING_SCRIPT, and that refuses the hold below rather than dropping a script.
      }
    }
    for (const { path, text } of texts) folder.place(scratch, project(path), text);
    const dirs = [...new Set(occupied.map((path) => posix.dirname(path)))];
    const definitions = await Promise.all(dirs.map((dir) => readHookDefinitions(join(scratch, ...dir.split("/")), scratch)));
    // The copy holds no link, so the reader's two path verdicts mean a stand-in that did not land, or a path it reads
    // as leaving the repository: either refuses, naming the declaration (review/186, review/189).
    const unread = definitions.flatMap((read) => read.errors).find((error) => error.code === "MISSING_SCRIPT" || error.code === "UNSAFE_PATH");
    if (unread !== undefined) {
      return unknown(`${prefix}${unread.file}`, unread.code === "MISSING_SCRIPT" ? "names a script the hold could not stand in for" : "names a path outside the repository");
    }
    // build/98 and the option-value question: every argument that names a repository file is code the hook runs or a
    // file it reads, so it is held beside the script, through the same resolver, whether or not Base: holds it
    // (review/196, review/199): a run that adds a file a declaration names reaches the next session's hook. One written
    // as a path (a separator in it, a flag's `=` value read as the launcher check reads it, the launcher's own
    // included) refuses where it does not resolve cleanly; one naming the project root names no file. A bare name past
    // the launcher is held too, a subcommand or a word alike, since it reads as a file of that name; where the resolver
    // refuses it, it is held as written, as a held path matches without case. A folder an argument names is not held (review/197): holding it would hold every
    // change under it, and what a held script reads there is the pages' named residual; the script and a path-written
    // launcher stay held whatever Base: holds there, as before. A value with a URL-like scheme, two characters or more
    // before its colon, names no repository file and is neither held nor refused (review/198); a drive letter is no
    // such scheme, so a drive path stays absolute and refuses. A bare launcher is looked up on PATH, never here.
    const executed = definitions.flatMap((read) =>
      read.hooks.flatMap((hook) => {
        const verdict = checkLauncherArgv(hook.command, scratch);
        const declaration = `${prefix}${hook.sourceFile}`;
        const values = hook.command.flatMap((argument, index) => {
          const path = !argument.startsWith("-") ? argument : argument.includes("=") ? argument.slice(argument.indexOf("=") + 1) : "";
          // review/203: a value led by a drive letter (`C:x.sh`) names a file on a Windows drive, so it is no bare name.
          const bare = !path.includes("/") && !/^[A-Za-z]:/.test(path);
          if ((bare && (index === 0 || path === "" || path === "." || path === "..")) || (!bare && path.split("/").every((segment) => segment === "" || segment === "."))) return [];
          if (/^[A-Za-z][A-Za-z0-9+.-]+:/.test(path)) return [];
          return [{ path, declaration, bare, code: index === 0 }];
        });
        return [...(verdict.ok ? [{ path: verdict.script, declaration, bare: false, code: true }] : []), ...values];
      }),
    );
    const scripts = await Promise.all(
      executed.map(async ({ path, declaration, bare, code }) => {
        const script = await at.resolve(path);
        if ("refused" in script) return bare ? { path: `${prefix}${path}` } : { refused: unknown(declaration, `names ${path}, which ${script.refused}`) };
        return script.kind === "folder" && !code ? null : { path: script.path };
      }),
    );
    for (const script of scripts) {
      if (script === null) continue;
      if ("refused" in script) return script.refused;
      held.add(script.path);
    }
    return [...held].toSorted();
  } catch (cause) {
    // review/108: the error's code, never its message, which can name a machine's path and reaches the pull request.
    return { subject: null, why: errorCode(cause) };
  } finally {
    folder.remove(scratch);
  }
}

/** review/183, review/186: a declaration's copy whose hook arguments read backslashes as separators, as a Windows checkout reads them. */
function separatorsRead(document: unknown): unknown {
  const hooks = isPlainObject(document) ? document["hooks"] : undefined;
  if (!isPlainObject(document) || !Array.isArray(hooks)) return document;
  const read = (hook: unknown): unknown => {
    const command = isPlainObject(hook) ? hook["command"] : undefined;
    if (!isPlainObject(hook) || !Array.isArray(command)) return hook;
    return { ...hook, command: command.map((argument: unknown) => (typeof argument === "string" ? argument.replaceAll("\\", "/") : argument)) };
  };
  return { ...document, hooks: hooks.map(read) };
}

/**
 * The project-relative paths a hook file's `command` arguments name, contained in the project: every string argument,
 * and a flag's `=` value, as the launcher check reads a path; the rest (a launcher's name, a flag) stand harmlessly.
 */
function declaredArguments(document: unknown): string[] {
  const hooks = isPlainObject(document) ? document["hooks"] : undefined;
  if (!Array.isArray(hooks)) return [];
  return hooks
    .flatMap((hook: unknown) => {
      const command = isPlainObject(hook) ? hook["command"] : undefined;
      return Array.isArray(command) ? command.filter((argument: unknown): argument is string => typeof argument === "string") : [];
    })
    .flatMap((argument) => {
      const separator = argument.indexOf("=");
      return argument.startsWith("-") && separator !== -1 ? [argument.slice(separator + 1)] : [argument];
    })
    .map((argument) => posix.normalize(argument.replaceAll("\\", "/")))
    .filter(
      (path) =>
        path !== "." && path !== ".." && !path.startsWith("../") && !path.startsWith("/") && !path.endsWith("/") && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path),
    );
}
