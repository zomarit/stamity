import { existsSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  BUILT_IN_RULES,
  CLASS_CHECKS,
  CLASS_FILE,
  CLASS_ORDER,
  classifyChange,
  hasCodeExtension,
  keepSecurityLens,
  lineRulesCover,
  mergeRules,
  outsideSecurityRule,
  parseClassFile,
  type ChangeClass,
  type ClassifyResult,
  type ClassRule,
  type Hunk,
  type Lockfile,
  type PathSource,
  type TestInput,
} from "../../change/classify.ts";
import { EngineError } from "../../types/errors.ts";
import type { GitRunner } from "../../workspace/git.ts";
import { sanitizeLabel } from "../kit/prompts.ts";
import { gitCheckRunner, keptFromGit, type GitInputRunner } from "./gitStatus.ts";

/**
 * What a committed range classifies as (REQ-FLOW-152), and the git reads `gate` and `run land` share to say so.
 *
 * **{@link classifyRange} is a read of its own.** `gate classify` compares a base with the work tree, the index and
 * the untracked files; a land acts on what merges, so this reads two commits from the object store alone: names and
 * counts by `git diff-tree`, hunks, heads and lockfile copies from blobs. A change committed and then reverted in the
 * work tree still counts, and nothing left uncommitted does. The class file is the base commit's, so no change sets
 * its own rules, and so are the tree-level attributes: git reads `.gitattributes` for a diff from the work tree even
 * between two commits, and a `diff=` driver there moves where `-W` stops, which can take a call out of a hunk's context
 * and a class down with it. `--attr-source` needs git 2.41; an older git fails that read, and the range fails closed.
 * `--attr-source` moves the tree-level file alone. An empty `core.attributesFile` turns the user's file off. Git's
 * `info/attributes` has no such switch, so a non-empty one reads `complete` false. The system file is still read: its
 * switch, `GIT_ATTR_NOSYSTEM`, is a variable, and `gitCheckRunner` strips every `GIT_*` one from what it starts.
 *
 * **The rest moved here from `../commands/gate.ts`, unchanged,** because `gate.ts` and `../commands/runLand.ts` share
 * a wave and neither may import the other: the class-file read, the name, count and patch parsers, the project-root
 * walk and the floors over a path read.
 */

/** A change's diff can outgrow a status probe, so `gate` widens the runner's bounds. */
export const GATE_GIT_TIMEOUT_MS = 60_000;
export const GATE_GIT_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * A top-level-relative path (as `git diff --no-relative` and `ls-files
 * --full-name` print it) in the project's own layout: the project's prefix
 * (`git rev-parse --show-prefix`, empty at the top-level) stripped, or `null`
 * for a path outside the project.
 */
export function toProjectPath(prefix: string, topLevelPath: string): string | null {
  const root = prefix === "" || prefix.endsWith("/") ? prefix : `${prefix}/`;
  if (!topLevelPath.startsWith(root)) return null;
  const inside = topLevelPath.slice(root.length);
  return inside === "" ? null : inside;
}

export interface Rename {
  from: string;
  to: string;
}

/** A git call that failed, carrying the step that failed and the directory it ran in, for the reason. */
export class GitReadError extends Error {
  // Plain fields, not parameter properties: Node's type stripping runs this file as-is.
  readonly step: string;
  readonly failure: unknown;
  readonly cwd: string;

  constructor(step: string, failure: unknown, cwd: string) {
    super(`git ${step} failed`);
    this.step = step;
    this.failure = failure;
    this.cwd = cwd;
  }
}

export function runGit(runner: GitInputRunner, cwd: string, step: string, args: readonly string[], input?: string): string {
  try {
    return runner(args, cwd, input);
  } catch (err) {
    throw new GitReadError(step, err, cwd);
  }
}

/**
 * Why a git read failed, in words: the step and the cause the error carries.
 * Two failures name no git call, since the reader is a session that may re-run
 * a named call by hand. One no git gave: the look before git kept the folder
 * from git (`keptFromGit`), so no call failed, git gave no status, and plain
 * git run there opens it (review/60). The other is the first read, which fails
 * wherever git does not answer here: a typed git is found by the shell's rules.
 */
export function describeGitFailure(err: GitReadError): string {
  if (keptFromGit(err.failure)) {
    return (
      "git was not started here: this folder, or a folder above it, has the layout of a bare repository, so the " +
      "engine did not hand it to git, and plain git run here or in any folder under that one would open it"
    );
  }
  const failure = err.failure as { code?: unknown; status?: unknown };
  // A spawn in a missing directory fails ENOENT as a missing binary does (review/18).
  if (failure.code === "ENOENT" && !existsSync(err.cwd)) return `the directory git runs in, ${err.cwd}, does not exist`;
  if (failure.code === "ENOENT") return "git could not run (no git binary was found)";
  const firstRead = err.step === "rev-parse --show-prefix";
  const what = firstRead ? "git's search for a work tree here" : `git ${err.step}`;
  if (failure.code === "ETIMEDOUT") return `${what} did not finish within ${GATE_GIT_TIMEOUT_MS / 1000} seconds`;
  if (failure.code === "ENOBUFS") return `${what} printed more than ${GATE_GIT_MAX_BUFFER / 1024 / 1024} MiB`;
  const status = typeof failure.status === "number" ? `, exit ${failure.status}` : "";
  if (firstRead) {
    return `no git work tree was found here (the engine found a git binary, and git's search for one failed${status})`;
  }
  return `git ${err.step} failed${status}`;
}

/** One file section the patch holds, in the name list's order: its old and new names. */
export type Section = Rename;

/**
 * `git diff --name-status -z` rows: a status, then one path, or two for a
 * rename or a copy; and the patch's sections in the same order, where a type
 * change (`T`) is two sections, the old type removed and the new one added.
 */
export function parseNameStatus(output: string): { paths: string[]; renames: Rename[]; sections: Section[] } {
  const fields = output.split("\0");
  const paths: string[] = [];
  const renames: Rename[] = [];
  const sections: Section[] = [];
  let index = 0;
  while (index < fields.length) {
    const status = fields[index] ?? "";
    if (status === "") {
      index += 1;
      continue;
    }
    if (status.startsWith("R") || status.startsWith("C")) {
      const from = fields[index + 1];
      const to = fields[index + 2];
      if (from === undefined || to === undefined) throw new GitReadError("diff --name-status", new Error("truncated row"), "");
      renames.push({ from, to });
      sections.push({ from, to });
      index += 3;
    } else {
      const path = fields[index + 1];
      if (path === undefined) throw new GitReadError("diff --name-status", new Error("truncated row"), "");
      paths.push(path);
      sections.push(...Array.from({ length: status.startsWith("T") ? 2 : 1 }, () => ({ from: path, to: path })));
      index += 2;
    }
  }
  return { paths, renames, sections };
}

/** A patch that does not read as the name list says: the line read fails closed. */
export class PatchError extends Error {}

/** One file section of the patch: its hunks, whether it deletes the file, and whether git printed no lines for it. */
interface PatchSection {
  hunks: Omit<Hunk, "path">[];
  deleted: boolean;
  unshown: boolean;
}

/**
 * The patch, one ordered walk: section `n` is the name list's entry `n`, so no
 * header is parsed for a name and a C-quoted name is read by its real one. An
 * unquoted header must name that entry exactly; a count that differs, a hunk
 * header that does not parse or a hunk line its header does not allow is a
 * {@link PatchError}. Each hunk's lines are counted from its header, so a
 * binary file's raw bytes, NULs and `diff --git` text included, stay data.
 */
export function parsePatch(output: string, sections: readonly Section[]): PatchSection[] {
  const lines = output.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const parsed: PatchSection[] = [];
  let at = 0;
  const next = (): string => lines[at] ?? "";
  while (at < lines.length) {
    const expected = sections[parsed.length];
    const header = next();
    if (expected === undefined || !header.startsWith("diff --git ")) throw new PatchError("the patch holds more sections than the name list");
    if (!header.includes('"') && header !== `diff --git a/${expected.from} b/${expected.to}`) {
      throw new PatchError("a patch section's header does not name the file the name list gives in its place");
    }
    const section: PatchSection = { hunks: [], deleted: false, unshown: false };
    for (at += 1; at < lines.length && !next().startsWith("@@ ") && !next().startsWith("diff --git "); at += 1) {
      if (next().startsWith("deleted file mode ")) section.deleted = true;
      if (next().startsWith("Binary files ")) section.unshown = true;
    }
    while (at < lines.length && next().startsWith("@@ ")) {
      const counts = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(next());
      if (counts === null) throw new PatchError("a hunk header did not parse");
      let oldLeft = Number(counts[1] ?? 1);
      let newLine = Number(counts[2]);
      let newLeft = Number(counts[3] ?? 1);
      const hunk = { added: [] as { line: number; text: string }[], removed: [] as string[], context: [] as string[] };
      for (at += 1; oldLeft > 0 || newLeft > 0; at += 1) {
        if (at >= lines.length) throw new PatchError("a hunk ended before its header's line counts");
        const line = next();
        const text = line.slice(1);
        if (line.startsWith("\\")) continue;
        // `diff.suppressBlankEmpty` prints an empty context line with no leading space.
        if ((line === "" || line.startsWith(" ")) && oldLeft > 0 && newLeft > 0) {
          hunk.context.push(text);
          oldLeft -= 1;
          newLeft -= 1;
          newLine += 1;
        } else if (line.startsWith("-") && oldLeft > 0) {
          hunk.removed.push(text);
          oldLeft -= 1;
        } else if (line.startsWith("+") && newLeft > 0) {
          hunk.added.push({ line: newLine, text });
          newLeft -= 1;
          newLine += 1;
        } else throw new PatchError("a hunk line does not fit its header's line counts");
      }
      while (at < lines.length && next().startsWith("\\")) at += 1;
      section.hunks.push(hunk);
    }
    parsed.push(section);
  }
  if (parsed.length !== sections.length) throw new PatchError("the patch holds fewer sections than the name list");
  return parsed;
}

/** The binary sniff reads this many bytes from a file's start (plan/62). */
export const SNIFF_BYTES = 8_000;
/** A changed file's head is read this far: the sniff, and the classifier's shebang and import reads. */
export const HEAD_BYTES = 64 * 1024;

/** A file's first line is looked for a shebang this far. */
export const SHEBANG_BYTES = 1024;

/** Whether lines, joined, hold a NUL in their first {@link SNIFF_BYTES} characters. */
export function holdsNul(lines: readonly string[]): boolean {
  return lines.join("\n").slice(0, SNIFF_BYTES).includes("\0");
}

/** One `diff --numstat -z` row: its old and new names, whether git printed `-` counts (a binary to git), and its added and deleted lines. */
interface NumstatRow extends Rename {
  binary: boolean;
  lines: number;
}

/** `git diff --numstat -z` rows: `<added>\t<deleted>\t<path>`, or for a rename the two names in the next fields. */
export function parseNumstat(output: string): NumstatRow[] {
  const fields = output.split("\0");
  const rows: NumstatRow[] = [];
  let index = 0;
  while (index < fields.length) {
    const field = fields[index] ?? "";
    if (field === "") {
      index += 1;
      continue;
    }
    const row = /^(-|\d+)\t(-|\d+)\t([\s\S]*)$/.exec(field);
    if (row === null) throw new GitReadError("diff --numstat", new Error("a row did not parse"), "");
    const binary = row[1] === "-";
    const lines = binary ? 0 : Number(row[1]) + Number(row[2]);
    const path = row[3] ?? "";
    if (path !== "") {
      rows.push({ from: path, to: path, binary, lines });
      index += 1;
      continue;
    }
    const from = fields[index + 1];
    const to = fields[index + 2];
    if (from === undefined || to === undefined) throw new GitReadError("diff --numstat", new Error("truncated row"), "");
    rows.push({ from, to, binary, lines });
    index += 3;
  }
  return rows;
}

/** The flags every diff of the line read pins against config: no external diff, colour or textconv, every submodule. */
export const DIFF_PINS: readonly string[] = ["--no-relative", "--no-ext-diff", "--no-color", "--no-textconv", "--ignore-submodules=none"];

/** A top-level-relative name in the project's layout, or `null` outside it; on win32 a `\\` read as a separator too. */
export function insideOf(prefix: string, windows: boolean): (name: string) => string | null {
  return (name) => toProjectPath(prefix, name) ?? (windows ? toProjectPath(prefix, name.replaceAll("\\", "/")) : null);
}

/** A top-level-relative name as the scan names a file outside the project: from the project root, `../` first. */
export function awayFrom(prefix: string): (name: string) => string {
  const up = "../".repeat(prefix.split("/").filter((part) => part !== "").length);
  return (name) => `${up}${name}`;
}

/** The project a run reads: its directory, its prefix below the git top-level, and the top-level's directory. */
export interface ProjectRoot {
  dir: string;
  prefix: string;
  topLevel: string;
}

/** A git error carrying an exit status and no spawn code: git ran and answered no. */
export function gitSaidNo(err: unknown, status?: number): boolean {
  const { code, status: exit } = err as { code?: unknown; status?: unknown };
  return code === undefined && typeof exit === "number" && (status === undefined || exit === status);
}

/**
 * The type of the entry `treeish` holds at the top-level-relative `path`
 * (`blob`, `tree`, `commit` for a submodule), or `null` when git answers
 * cleanly that nothing is there: `ls-tree` exits 0 printing no entry for an
 * absent path. That is the one "no". A missing or corrupt object, a failed lazy
 * fetch, a timeout or no binary fails the call, and a failed read fails closed
 * (p2a M-2): `cat-file -t` exits 128 for an absent path and a corrupt store
 * alike, so it could not tell them apart. `--literal-pathspecs` reads the path
 * as a name, never as pathspec magic; `--full-tree` ignores the cwd.
 */
function baseEntryType(runner: GitRunner, cwd: string, treeish: string, path: string): string | null {
  return baseEntry(runner, cwd, treeish, path)?.type ?? null;
}

/** The type and object id of the entry `treeish` holds at `path`, read as {@link baseEntryType} reads it. */
export function baseEntry(runner: GitRunner, cwd: string, treeish: string, path: string): { type: string; id: string } | null {
  const output = runGit(runner, cwd, "ls-tree", ["--literal-pathspecs", "ls-tree", "-z", "--full-tree", treeish, "--", path]);
  for (const record of output.split("\0")) {
    const tab = record.indexOf("\t");
    if (tab === -1 || record.slice(tab + 1) !== path) continue;
    const [, type, id] = record.slice(0, tab).split(" ");
    return type === undefined ? null : { type, id: id ?? "" };
  }
  return null;
}

/** Whether `<treeish>:<prefix>.stamity` is a folder in that commit's tree; any failed read throws (p2a M-2). */
function baseHoldsStateFolder(runner: GitRunner, cwd: string, treeish: string, prefix: string): boolean {
  return baseEntryType(runner, cwd, treeish, `${prefix}.stamity`) === "tree";
}

/** The cwd's path below the git top-level (`git rev-parse --show-prefix`); outside a work tree this call fails. */
export function readCwdPrefix(runner: GitRunner, cwd: string): string {
  return runGit(runner, cwd, "rev-parse --show-prefix", ["rev-parse", "--show-prefix"]).replace(/\r?\n$/, "");
}

/**
 * The project root: the nearest ancestor of `cwd`, up to the git top-level,
 * whose `.stamity/` folder is in `treeish`'s tree, or the top-level when none
 * is (re-review r3, `plan/63`; review/13). A run started in a subfolder, a run
 * folder under `.stamity/runs/` included, so still reads every changed path of
 * its project, and a `.stamity/` the change plants, untracked or staged, is not
 * a root. The walk follows `git rev-parse --show-prefix` up from the real cwd,
 * so it never leaves the work tree git answered for.
 */
export function findProjectRoot(runner: GitRunner, cwd: string, cwdPrefix: string, treeish: string): ProjectRoot {
  const segments = cwdPrefix.split("/").filter((segment) => segment !== "");
  let start = cwd;
  try {
    start = realpathSync(cwd);
  } catch {
    // git answered from this cwd, so it exists; the lexical form walks the same steps.
  }
  const topLevel = resolve(start, ...Array.from({ length: segments.length }, () => ".."));
  for (let depth = segments.length; depth > 0; depth -= 1) {
    const prefix = `${segments.slice(0, depth).join("/")}/`;
    if (baseHoldsStateFolder(runner, cwd, treeish, prefix)) {
      return { dir: resolve(start, ...Array.from({ length: segments.length - depth }, () => "..")), prefix, topLevel };
    }
  }
  return { dir: topLevel, prefix: "", topLevel };
}

/** A full object id, SHA-1 or SHA-256. */
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/**
 * `<ref>` as a commit id, or `null` when it does not resolve to a commit:
 * `--verify --quiet` exits 1, printing nothing, for a name that is no commit.
 * Any other failure (a timeout, the output bound, no binary, another exit) is
 * a failed read, named as such (review/17). No `--end-of-options`: the parser's
 * refusal of a `-`-led ref is the guard ({@link parseBaseRef}).
 */
export function resolveBase(runner: GitRunner, cwd: string, ref: string): string | null {
  let output: string;
  try {
    output = runner(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd);
  } catch (err) {
    if (gitSaidNo(err, 1)) return null;
    throw new GitReadError("rev-parse --verify", err, cwd);
  }
  const id = output.trim();
  return OBJECT_ID.test(id) ? id : null;
}

/** The base commit's class file: absent, read and valid, or refused with its first error. */
type BaseClassFile =
  | { state: "absent" }
  | { state: "valid"; rules: ClassRule[]; testInputs: TestInput[]; testGlobs: string[] }
  | { state: "invalid"; error: string; raising: ClassRule[] };

/**
 * `<commit>:<prefix>.stamity/change-classes.json`, read as a raw blob (`cat-file
 * blob`, so no textconv or filter rewrites it) after {@link baseEntryType} says
 * what the base holds there. Only git's clean "nothing there" is an absent
 * file; any other failure is a failed read and fails closed. An entry that is
 * not a blob (a folder, a submodule) is refused, never read as absent.
 */
export function readBaseClassFile(runner: GitRunner, root: ProjectRoot, commit: string): BaseClassFile {
  const path = `${root.prefix}${CLASS_FILE}`;
  const type = baseEntryType(runner, root.dir, commit, path);
  if (type === null) return { state: "absent" };
  const spec = `${commit}:${path}`;
  if (type !== "blob") return { state: "invalid", error: `the base holds a ${type} there, not a file`, raising: [] };
  const parsed = parseClassFile(runGit(runner, root.dir, "cat-file blob", ["cat-file", "blob", spec]));
  if (parsed.ok) return { state: "valid", rules: parsed.rules, testInputs: parsed.testInputs, testGlobs: parsed.testGlobs };
  return { state: "invalid", error: parsed.errors[0] ?? "refused", raising: parsed.raising };
}

/** The rules a base's class file gives, and the reason clause it adds, if any. */
export function rulesFrom(classFile: BaseClassFile): { rules: readonly ClassRule[]; reason?: string } {
  if (classFile.state === "valid") return { rules: mergeRules(BUILT_IN_RULES, classFile.rules) };
  if (classFile.state === "absent") {
    return { rules: BUILT_IN_RULES, reason: `the base holds no ${CLASS_FILE}, so only the built-in rules apply` };
  }
  const invalid = `the base copy of ${CLASS_FILE} is invalid (${classFile.error})`;
  if (classFile.raising.length === 0) {
    return { rules: BUILT_IN_RULES, reason: `${invalid}: no map was read from it, so the class is at least product` };
  }
  return {
    rules: mergeRules(BUILT_IN_RULES, classFile.raising),
    reason: `${invalid}: only its product, public-contract and security-sensitive entries were read, so the class is at least product`,
  };
}

/** The verdict for a change git could not read: `product`, the failure named. */
export function failClosed(reason: string): ClassifyResult {
  return { class: "product", byPath: [], checks: [...CLASS_CHECKS.product], lenses: [], reason };
}

export function withReasons(result: ClassifyResult, reasons: readonly string[]): ClassifyResult {
  if (reasons.length === 0) return result;
  return { ...result, reason: [...reasons, result.reason].filter((part) => part !== "").join("; ") };
}

/** The security lens, as the classifier names it for a `security-sensitive` change. */
const SECURITY_LENS = "stamity-security";

/**
 * `result` raised to at least `floor`; a lens it already had stays, and `security-sensitive` adds its lens first,
 * also to a result the audit-first rule left without it, since that rule held over the paths alone (p5g).
 */
export function raiseTo(result: ClassifyResult, floor: ChangeClass): ClassifyResult {
  if (floor === "security-sensitive" && result.class === floor) return keepSecurityLens(result);
  if (CLASS_ORDER.indexOf(result.class) <= CLASS_ORDER.indexOf(floor)) return result;
  const lenses =
    floor === "security-sensitive" ? [SECURITY_LENS, ...result.lenses.filter((lens) => lens !== SECURITY_LENS)] : result.lenses;
  return { ...result, class: floor, checks: [...CLASS_CHECKS[floor]], lenses };
}

/** At most this many paths are named in one reason clause; the rest are counted. */
const PATHS_NAMED = 5;

export function namePaths(paths: readonly string[]): string {
  const named = paths.slice(0, PATHS_NAMED).join(", ");
  return paths.length > PATHS_NAMED ? `${named} and ${paths.length - PATHS_NAMED} more` : named;
}

/** A change's names in the project's layout: what the classifier reads, and what sits outside the project. */
export interface PlacedChange {
  paths: string[];
  renames: Rename[];
  /** Top-level-relative paths left out because they sit outside the project. */
  outside: string[];
}

/**
 * Top-level-relative names placed by {@link toProjectPath}. On win32 (`windows`) a name outside the project by its
 * literal reading that lands inside it with `\` as a separator is read there too, and stays counted outside: the
 * stronger reading wins either way (review/43).
 */
export function placeChange(named: readonly string[], renamed: readonly Rename[], prefix: string, windows: boolean): PlacedChange {
  const outside = new Set<string>();
  const project = (path: string): string | null => {
    const inside = toProjectPath(prefix, path);
    if (inside !== null) return inside;
    outside.add(path);
    return windows ? toProjectPath(prefix, path.replaceAll("\\", "/")) : null;
  };
  const paths: string[] = [];
  const renames: Rename[] = [];
  for (const path of named) {
    const inside = project(path);
    if (inside !== null) paths.push(inside);
  }
  for (const rename of renamed) {
    const from = project(rename.from);
    const to = project(rename.to);
    // A rename with one side outside keeps its inside side as a changed path.
    if (from !== null && to !== null) renames.push({ from, to });
    else if (from !== null) paths.push(from);
    else if (to !== null) paths.push(to);
  }
  return { paths, renames, outside: [...outside] };
}

/**
 * The floors the git read adds over the path rules: a path outside the project
 * raises the class to at least `product` (review/13), or to `security-sensitive`
 * when the security floor or row matches it (review/21), one clause per rule
 * naming its paths through {@link namePaths} (review/42); a name that is not
 * valid UTF-8, decoded to U+FFFD, raises it to at least `product` (review/19).
 */
export function applyReadFloors(
  result: ClassifyResult,
  change: PlacedChange & { lines: { skipped: number } | { failed: string } },
  source: PathSource,
): ClassifyResult {
  let raised = result;
  const reasons: string[] = [];
  if (change.outside.length > 0) {
    const count = change.outside.length;
    reasons.push(`${count} changed path${count === 1 ? "" : "s"} outside the project left out, so the class is at least product`);
    raised = raiseTo(raised, "product");
    const byRule = new Map<string, string[]>();
    for (const path of change.outside) {
      const rule = outsideSecurityRule(path, source);
      if (rule !== undefined) byRule.set(rule, [...(byRule.get(rule) ?? []), path]);
    }
    for (const [rule, paths] of byRule) {
      const verb = paths.length === 1 ? "matches" : "match";
      reasons.push(`${namePaths(paths)} outside the project ${verb} ${rule}, so the class is security-sensitive`);
      raised = raiseTo(raised, "security-sensitive");
    }
  }
  const unreadable = [...change.paths, ...change.renames.flatMap((rename) => [rename.from, rename.to])].filter((path) =>
    path.includes("\uFFFD"),
  );
  if (unreadable.length > 0) {
    reasons.push(`not valid UTF-8, so unreadable by name and the class is at least product: ${namePaths(unreadable)}`);
    raised = raiseTo(raised, "product");
  }
  if ("failed" in change.lines) {
    // review/87: no line rule could read the lines, so the lens reads them instead.
    reasons.push(`the changed lines could not be read (${change.lines.failed}), so the class is security-sensitive and its lens reads them`);
    raised = raiseTo(raised, "security-sensitive");
  } else if (change.lines.skipped > 0) {
    const { skipped } = change.lines;
    reasons.push(`${skipped} changed file${skipped === 1 ? "" : "s"} not read line by line (binary, over 1 MiB, or not a regular file)`);
  }
  return withReasons(raised, reasons);
}

/**
 * A changed path whose name holds a code point the report strips (a control,
 * bidi, tag or other invisible character, by {@link sanitizeLabel}) is printed
 * under a name that is not the file's own, so nothing can open it by the name
 * read back: the class is at least `product` and the reason names it, whatever
 * the paths' source (review/36). The path keeps its own class in `byPath`.
 */
export function applyNameFloor(result: ClassifyResult): ClassifyResult {
  const altered = result.byPath.map((entry) => entry.path).filter((path) => sanitizeLabel(path) !== path);
  if (altered.length === 0) return result;
  return withReasons(raiseTo(result, "product"), [
    `names the report cannot show as they are, so the class is at least product: ${namePaths(altered)}`,
  ]);
}

/** The one lockfile whose two copies the audit-first rule reads (p5g). */
export const NPM_LOCKFILE = "package-lock.json";

/** What a committed range holds, as `run land` weighs it. */
export interface RangeFacts {
  result: ClassifyResult;
  /** The changed paths, each side of a rename counted. */
  files: number;
  /** The numstat sum of added and deleted lines; `null` when a file has no count. */
  lines: number | null;
  /** Whether every changed file's lines were read. */
  complete: boolean;
}

/** A range's lines in project-relative hunks, what the read could not show, and the numstat sum. */
interface RangeLines {
  hunks: Hunk[];
  /** Files whose lines were not read, and that are not code. */
  skipped: number;
  /** Code files whose lines were not read. */
  unscanned: string[];
  /** Those of `unscanned` a covered shebang or the executable mode, not an extension, makes code (review/200). */
  unscannedCode: string[];
  /** Top-level-relative submodule paths the range touches: a pointer's lines say nothing of the code behind it. */
  gitlinks: string[];
  /** `null` when a file has no count, or its lines were not read. */
  total: number | null;
}

/** A range's `diff-tree` call, up to its output flag: the base's attributes and no user file, then {@link DIFF_PINS}. */
function rangeDiff(base: string): string[] {
  return [`--attr-source=${base}`, "-c", "core.attributesFile=", "diff-tree", "-r", "-M", ...DIFF_PINS];
}

/**
 * Whether the repository's own `info/attributes` holds anything. Git reads it above the base's attributes and no option
 * turns it off, so a read that cannot rule it out is treated as one that found it; only git's "no such file" is absent.
 */
function holdsLocalAttributes(runner: GitRunner, root: ProjectRoot): boolean {
  const name = runGit(runner, root.dir, "rev-parse --git-path", ["rev-parse", "--git-path", "info/attributes"]).replace(/\r?\n$/, "");
  try {
    return statSync(resolve(root.dir, name)).size > 0;
  } catch (err) {
    return (err as { code?: unknown }).code !== "ENOENT";
  }
}

/** The first read of a range, named so a git too old for `--attr-source` says what it lacks. */
const FIRST_RANGE_READ = "diff-tree --attr-source (git 2.41 or later)";

/**
 * The text of `commit`'s blob at the top-level-relative `name`, from the object store with no filter or textconv;
 * `undefined` for no blob there (a deletion, a submodule) or one past the runner's output bound.
 */
function readBlob(runner: GitRunner, root: ProjectRoot, commit: string, name: string): string | undefined {
  const entry = baseEntry(runner, root.dir, commit, name);
  if (entry?.type !== "blob") return undefined;
  const size = Number(runGit(runner, root.dir, "cat-file -s", ["cat-file", "-s", entry.id]).trim());
  if (!(size <= GATE_GIT_MAX_BUFFER)) return undefined;
  return runGit(runner, root.dir, "cat-file blob", ["cat-file", "blob", entry.id]);
}

/** Whether `text` holds a NUL where the one rule that decides binary looks (plan/62). */
function sniffsBinary(text: string): boolean {
  return text.slice(0, SNIFF_BYTES).includes("\0");
}

/**
 * The lines `base` to `head` changes, read as `gate classify` reads one side against its base (`../commands/gate.ts`,
 * `readSide`), with blobs in place of work-tree files: the same patch flags, so the line rules read the same hunks, and
 * the same nomination, a file numstat calls binary leaving the text read only when its head blob sniffs binary too.
 * `sections` is the unfiltered name list, used when nothing is left out.
 */
function readRangeLines(
  runner: GitRunner,
  root: ProjectRoot,
  base: string,
  head: string,
  sections: readonly Section[],
  windows: boolean,
): RangeLines {
  const inside = insideOf(root.prefix, windows);
  const revs = [base, head];
  const numstat = parseNumstat(runGit(runner, root.dir, "diff-tree --numstat", [...rangeDiff(base), "--numstat", "-z", ...revs, "--"]));
  const reads = (name: string): boolean => {
    const body = readBlob(runner, root, head, name);
    return body !== undefined && !sniffsBinary(body);
  };
  const binaries = numstat.filter((row) => row.binary && !reads(row.to));
  const pathspec = [...new Set(binaries.flatMap((row) => [row.from, row.to]))].map((name) => `:(top,literal,exclude)${name}`);
  const shown =
    pathspec.length === 0
      ? sections
      : parseNameStatus(runGit(runner, root.dir, "diff-tree --name-status", [...rangeDiff(base), "--name-status", "-z", ...revs, "--", ...pathspec])).sections;
  const patch = runGit(runner, root.dir, "diff-tree --text", [
    "-c",
    "core.quotePath=false",
    ...rangeDiff(base),
    "-p",
    "-U3",
    "-W",
    "--text",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    "--inter-hunk-context=0",
    "--submodule=short",
    ...revs,
    "--",
    ...pathspec,
  ]);
  // Two fields a row with renames off, so a name that reads like a row is never taken for one.
  const rows = runGit(runner, root.dir, "diff-tree --raw", ["diff-tree", "-r", ...DIFF_PINS, "--no-renames", "--raw", "-z", ...revs, "--"]).split("\0");
  const gitlinks = rows.flatMap((field, at) => (at % 2 === 0 && field.slice(1).split(" ", 2).includes("160000") ? [rows[at + 1] ?? ""] : []));
  const read: Omit<RangeLines, "total"> = { hunks: [], skipped: 0, unscanned: [], unscannedCode: [], gitlinks };
  // review/200: whether git records the file executable (mode 100755) on either side.
  const executable = (name: string): boolean => {
    const raw = runGit(runner, root.dir, "diff-tree --raw", ["diff-tree", "-r", ...DIFF_PINS, "--raw", "-z", ...revs, "--", `:(top,literal)${name}`]);
    return raw.split("\0").some((field) => field.startsWith(":") && field.slice(1).split(" ", 2).includes("100755"));
  };
  // A file with no code extension: code by a covered shebang in its head blob, or, with none to read, by its mode.
  const script = (name: string, path: string): boolean => {
    const body = readBlob(runner, root, head, name);
    if (body === undefined) return executable(name);
    const first = body.split("\n", 1)[0] ?? "";
    return first.startsWith("#!") && lineRulesCover(path, "git", first);
  };
  const notRead = (name: string, path: string | null): void => {
    if (path === null) return;
    const extension = hasCodeExtension(path);
    if (!extension && !script(name, path)) {
      read.skipped += 1;
      return;
    }
    read.unscanned.push(path);
    if (!extension) read.unscannedCode.push(path);
  };
  for (const row of binaries) notRead(row.to, inside(row.to));
  parsePatch(patch, shown).forEach((section, index) => {
    const name = shown[index]?.to ?? "";
    const path = inside(name);
    const body = section.deleted ? undefined : readBlob(runner, root, head, name);
    const lines = section.hunks.flatMap((hunk) => (section.deleted ? hunk.removed : hunk.added.map((line) => line.text)));
    if (section.unshown || (body === undefined ? holdsNul(lines) : sniffsBinary(body))) {
      notRead(name, path);
      return;
    }
    // The classifier reads no file outside the project (review/96), and `complete` says so.
    if (path === null) return;
    const opening = body ?? (section.deleted ? lines.join("\n") : undefined);
    // Past the runner's bound there is no head to read, so a shebang or import outside the hunks goes unseen.
    if (opening === undefined && !gitlinks.includes(name)) read.skipped += 1;
    for (const hunk of section.hunks) read.hunks.push({ path, ...hunk, ...(opening === undefined ? {} : { head: opening.slice(0, HEAD_BYTES) }) });
  });
  const unread = numstat.some((row) => row.binary) || read.skipped > 0 || read.unscanned.length > 0 || gitlinks.length > 0;
  return { ...read, total: unread ? null : numstat.reduce((sum, row) => sum + row.lines, 0) };
}

/**
 * Each changed `package-lock.json`'s two copies, both from blobs (`../commands/gate.ts`, `readLockfiles`, reads the
 * work tree's): `staged` is `same`, since a commit is one copy. A head copy that cannot be read leaves the file out and
 * a base copy that cannot be read is `base: null`, the failure named, so the security lens stays either way.
 */
function readRangeLockfiles(runner: GitRunner, root: ProjectRoot, base: string, head: string, paths: readonly string[]): Lockfile[] {
  const show = (commit: string, path: string): string | GitReadError => {
    try {
      return runGit(runner, root.dir, "show", ["show", "--no-textconv", `${commit}:${root.prefix}${path}`]);
    } catch (err) {
      if (err instanceof GitReadError) return err;
      throw err;
    }
  };
  return paths
    .filter((path) => path.slice(path.lastIndexOf("/") + 1) === NPM_LOCKFILE)
    .flatMap((path): Lockfile[] => {
      const after = show(head, path);
      if (after instanceof GitReadError) return [];
      const before = show(base, path);
      if (before instanceof GitReadError) return [{ path, base: null, head: after, staged: "same", baseFailure: describeGitFailure(before) }];
      return [{ path, base: before, head: after, staged: "same" }];
    });
}

/** `ref` as a commit id the object store holds; anything else refuses, as a shallow clone's missing base does. */
function commitOf(runner: GitRunner, cwd: string, side: "base" | "head", ref: string): string {
  // No parser stands in front of this read as one does for `--base`, so the refusal of a `-`-led ref is here.
  const commit = ref.startsWith("-") ? null : resolveBase(runner, cwd, ref);
  if (commit !== null) return commit;
  throw new EngineError(`the ${side} ${sanitizeLabel(ref)} is not a commit the object store holds, so the range cannot be classified`, {
    code: "VALIDATION_ERROR",
    why: "a shallow clone or an unfetched ref leaves the commit out",
    next: "fetch the commit, then classify the range again",
  });
}

/**
 * What `base` to `head` classifies as, read from committed objects alone (REQ-FLOW-152). A base or head the object
 * store does not hold rejects with a coded error. Any other failed read gives what `gate classify` gives, `product`
 * with the failure named, here with nothing counted and `complete` false; a failed line read keeps the path classes
 * and makes the class `security-sensitive`. `complete` is false for a file the classifier read no line of: a binary,
 * one past the runner's bound, one outside the project, or a submodule, whose pointer stands for code nobody read; and
 * for a git directory whose own attributes file holds anything. Paths and reasons are the repository's bytes: a caller
 * sanitises them where they meet a terminal or a comment, as `gate classify` does.
 */
export async function classifyRange(cwd: string, base: string, head: string): Promise<RangeFacts> {
  const runner = gitCheckRunner({ timeoutMs: GATE_GIT_TIMEOUT_MS, maxBuffer: GATE_GIT_MAX_BUFFER });
  try {
    const cwdPrefix = readCwdPrefix(runner, cwd);
    const from = commitOf(runner, cwd, "base", base);
    const to = commitOf(runner, cwd, "head", head);
    const root = findProjectRoot(runner, cwd, cwdPrefix, from);
    const classFile = readBaseClassFile(runner, root, from);
    const { rules, reason } = rulesFrom(classFile);
    // On win32 git's names are read both ways (review/43); elsewhere literally (review/20).
    const windows = process.platform === "win32";
    const source: PathSource = windows ? "listed" : "git";
    const named = parseNameStatus(runGit(runner, root.dir, FIRST_RANGE_READ, [...rangeDiff(from), "--name-status", "-z", from, to, "--"]));
    const placed = placeChange(named.paths, named.renames, root.prefix, windows);
    let lines: RangeLines | { failed: string };
    try {
      lines = readRangeLines(runner, root, from, to, named.sections, windows);
    } catch (err) {
      if (err instanceof GitReadError) lines = { failed: describeGitFailure(err) };
      else if (err instanceof PatchError) lines = { failed: err.message };
      else throw err;
    }
    const read = "failed" in lines ? {} : { hunks: lines.hunks, unscanned: lines.unscanned, unscannedCode: lines.unscannedCode };
    const lockfiles = readRangeLockfiles(runner, root, from, to, placed.paths);
    const classified = classifyChange({ paths: placed.paths, renames: placed.renames, base: "given", source, ...read, lockfiles }, rules);
    const floored = applyReadFloors(classified, { ...placed, lines }, source);
    const raised = classFile.state === "invalid" ? raiseTo(floored, "product") : floored;
    const total = "failed" in lines ? null : lines.total;
    const localAttributes = holdsLocalAttributes(runner, root);
    const gitlinks = "failed" in lines ? [] : lines.gitlinks;
    const unread = [
      ...(reason === undefined ? [] : [reason]),
      ...(localAttributes ? ["info/attributes in the git directory is not empty and git reads it above the base's attributes, so the hunks may not be the base's and the read is not complete"] : []),
      ...(gitlinks.length === 0 ? [] : [`no line of the code behind a submodule pointer was read, so the read is not complete: ${namePaths(gitlinks)}`]),
    ];
    return {
      result: applyNameFloor(withReasons(raised, unread)),
      files: new Set([...named.paths, ...named.renames.flatMap((rename) => [rename.from, rename.to])]).size,
      lines: total,
      complete: total !== null && placed.outside.length === 0 && !localAttributes,
    };
  } catch (err) {
    if (!(err instanceof GitReadError)) throw err;
    return { result: failClosed(`the change could not be read (${describeGitFailure(err)}), so the class is product`), files: 0, lines: null, complete: false };
  }
}
