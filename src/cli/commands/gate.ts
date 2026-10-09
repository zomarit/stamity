import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { Argument, InvalidArgumentError, Option, type Command } from "commander";
import {
  BUILT_IN_RULES,
  CLASS_CHECKS,
  CLASS_FILE,
  CLASS_ORDER,
  classifyChange,
  mergeRules,
  outsideSecurityRule,
  parseClassFile,
  type BaseState,
  type ChangeClass,
  type ClassifyResult,
  type ClassRule,
  type PathSource,
} from "../../change/classify.ts";
import { gitCheckRunner } from "../engine/gitStatus.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";
import type { GitRunner } from "../../workspace/git.ts";

/**
 * `stamity gate classify` — the change class a flow's gates follow
 * (REQ-FLOW-061), and the CLI's fourth hidden plumbing verb. Hidden for the
 * reason `learn`, `handoff` and `ledger` are: its caller is the orchestrating
 * session running `/st-quick` or `/st-work`, not a person.
 *
 * **It decides nothing about a class.** The classes, their order, the rules,
 * the code-path floor and the checks each class names live in
 * `../../change/classify.ts`; this file owns where the changed paths come from
 * and how the verdict reads on a terminal and in the JSON document.
 *
 * **Where the paths come from.** `--paths` classifies the listed paths by path
 * rules alone, each read both ways (a backslash as a separator and as a
 * filename character). Without it the change is read from git: the tracked
 * changes (staged and unstaged) against the base, renames as renames, plus the
 * untracked files of the whole work tree; git's names are read literally, as
 * git gave them (review/20), except on win32, where a backslash in a name is a
 * separator at checkout (with `core.protectNTFS` off), so there they are read
 * both ways and the stronger class kept, as `--paths` are (review/43); the
 * project's prefix and the outside rules read them both ways too. `--base
 * <ref>` names the base, resolved once to a commit id every later call uses;
 * with no `--base` the reads run against `HEAD` and the reason says no base
 * was given.
 *
 * **Fail-closed.** Every git call runs through {@link gitCheckRunner}, the
 * hardened construction the CLI's other git reads use. A directory outside a
 * work tree, no git binary, a timeout, an oversized output or any other git
 * failure gives `product` with the failure named; a base that does not resolve
 * gives at least `product` with the ref named. Never a narrower class: the
 * class narrows the gates a flow runs, so an unread change takes the full set.
 *
 * **The project, not the repository.** The project is the nearest ancestor of
 * the directory the verb runs in, up to the git top-level, whose `.stamity/`
 * folder is in the base commit's tree (`HEAD`'s with no base), or the
 * top-level when none is; every git read runs from it ({@link findProjectRoot}).
 * A `.stamity/` the change itself adds is no root, so a change cannot move the
 * boundary it is read through (review/13). Each changed path is classified by
 * its project-relative form ({@link toProjectPath}), so the rules read the
 * project's own layout. A path outside the project is left out, counted in the
 * reason, and raises the class to at least `product`; one the built-in security
 * floor or the trigger roster's security row matches raises it to
 * `security-sensitive` (review/21). A name that is not valid UTF-8 raises it to
 * at least `product` too, since nothing can open it by the name read back, and
 * so, for any source, does a name the report has to strip (review/36).
 *
 * **The class file comes from the base.** With a resolved `--base`, the
 * project's {@link CLASS_FILE} is read as the base commit's blob, under the
 * project's prefix, and merged with the built-in rules; the head copy and the
 * work tree's are never read, so a change cannot lower its own checks through
 * the file, and a change to the file is at least `config` by a built-in rule. A
 * base with no file gives the built-ins alone. A base copy the validator refuses
 * gives no map at all and at least `product`, its first error named (plan/25).
 * With no base, no class file is read (D5). `--paths` with `--base` reads the
 * base copy the same way, from the same project root.
 *
 * **Why the subcommand is positional**, as in `ledger.ts`: the funnel
 * (`../kit/program.ts`) owns the exit codes and the one JSON document through
 * the action it registers on THIS command, and a commander sub-command would run
 * outside it. An unknown subcommand, an unknown option or a `--base` that starts
 * with `-` is refused by the parser, so each exits 2 before git runs.
 */

const CLASSIFY = "classify";

/** A change's diff can outgrow a status probe, so `gate` widens the runner's bounds. */
const GATE_GIT_TIMEOUT_MS = 60_000;
const GATE_GIT_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * A ref git would read as an option is refused before git runs, exit 2. This is
 * the guard: the resolve passes no `--end-of-options`, which `rev-parse` takes
 * only from git 2.43, so a base resolves on an older git too (review/15).
 */
function parseBaseRef(value: string): string {
  if (value.startsWith("-")) throw new InvalidArgumentError("a base ref never starts with '-'.");
  return value;
}

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

interface Rename {
  from: string;
  to: string;
}

/** A git call that failed, carrying the step that failed and the directory it ran in, for the reason. */
class GitReadError extends Error {
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

function runGit(runner: GitRunner, cwd: string, step: string, args: readonly string[]): string {
  try {
    return runner(args, cwd);
  } catch (err) {
    throw new GitReadError(step, err, cwd);
  }
}

/** Why a git read failed, in words: the step and the cause the error carries. */
function describeGitFailure(err: GitReadError): string {
  const failure = err.failure as { code?: unknown; status?: unknown };
  // A spawn in a missing directory fails ENOENT as a missing binary does (review/18).
  if (failure.code === "ENOENT" && !existsSync(err.cwd)) return `the directory git runs in, ${err.cwd}, does not exist`;
  if (failure.code === "ENOENT") return "git could not run (no git binary was found)";
  if (failure.code === "ETIMEDOUT") {
    return `git ${err.step} did not finish within ${GATE_GIT_TIMEOUT_MS / 1000} seconds`;
  }
  if (failure.code === "ENOBUFS") return `git ${err.step} printed more than ${GATE_GIT_MAX_BUFFER / 1024 / 1024} MiB`;
  const status = typeof failure.status === "number" ? `, exit ${failure.status}` : "";
  if (err.step === "rev-parse --show-prefix") {
    return `no git work tree was found here (git rev-parse --show-prefix failed${status})`;
  }
  return `git ${err.step} failed${status}`;
}

/** `git diff --name-status -z` rows: a status, then one path, or two for a rename or a copy. */
function parseNameStatus(output: string): { paths: string[]; renames: Rename[] } {
  const fields = output.split("\0");
  const paths: string[] = [];
  const renames: Rename[] = [];
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
      index += 3;
    } else {
      const path = fields[index + 1];
      if (path === undefined) throw new GitReadError("diff --name-status", new Error("truncated row"), "");
      paths.push(path);
      index += 2;
    }
  }
  return { paths, renames };
}

/** What the git read hands the classifier, in project-relative paths. */
interface ChangeRead {
  paths: string[];
  renames: Rename[];
  /** Top-level-relative paths left out because they sit outside the project. */
  outside: string[];
}

/**
 * The change against `commit`: tracked changes (staged and unstaged, renames
 * as `R` rows) plus untracked files, both NUL-separated so `core.quotePath`
 * cannot escape a name, and both top-level-relative (`--no-relative`, so a
 * `diff.relative` setting cannot narrow the read) before {@link toProjectPath}.
 * The untracked list runs from the top-level, so an untracked file outside the
 * project meets the outside rules as a tracked one does (review/34). On win32
 * (`windows`) a name outside the project by its literal reading that lands
 * inside it with `\` as a separator is read there too, and stays counted
 * outside: the stronger reading wins either way (review/43).
 */
function readChange(runner: GitRunner, root: ProjectRoot, commit: string, windows: boolean): ChangeRead {
  const { dir: cwd, prefix } = root;
  const diff = parseNameStatus(
    runGit(runner, cwd, "diff --name-status", [
      "diff",
      "--name-status",
      "-M",
      "-z",
      "--no-relative",
      "--no-ext-diff",
      "--no-color",
      "--no-textconv",
      // A committed `.gitmodules` or a local setting must not hide a submodule bump (review/14).
      "--ignore-submodules=none",
      commit,
      "--",
    ]),
  );
  const untracked = runGit(runner, root.topLevel, "ls-files --others", [
    "ls-files",
    "--others",
    "--exclude-standard",
    "--full-name",
    "-z",
  ])
    .split("\0")
    .filter((path) => path !== "");

  const outside = new Set<string>();
  const project = (path: string): string | null => {
    const inside = toProjectPath(prefix, path);
    if (inside !== null) return inside;
    outside.add(path);
    return windows ? toProjectPath(prefix, path.replaceAll("\\", "/")) : null;
  };
  const paths: string[] = [];
  const renames: Rename[] = [];
  for (const path of [...diff.paths, ...untracked]) {
    const inside = project(path);
    if (inside !== null) paths.push(inside);
  }
  for (const rename of diff.renames) {
    const from = project(rename.from);
    const to = project(rename.to);
    // A rename with one side outside keeps its inside side as a changed path.
    if (from !== null && to !== null) renames.push({ from, to });
    else if (from !== null) paths.push(from);
    else if (to !== null) paths.push(to);
  }
  return { paths, renames, outside: [...outside] };
}

/** The project a run reads: its directory, its prefix below the git top-level, and the top-level's directory. */
interface ProjectRoot {
  dir: string;
  prefix: string;
  topLevel: string;
}

/** A git error carrying an exit status and no spawn code: git ran and answered no. */
function gitSaidNo(err: unknown, status?: number): boolean {
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
  const output = runGit(runner, cwd, "ls-tree", ["--literal-pathspecs", "ls-tree", "-z", "--full-tree", treeish, "--", path]);
  for (const record of output.split("\0")) {
    const tab = record.indexOf("\t");
    if (tab !== -1 && record.slice(tab + 1) === path) return record.slice(0, tab).split(" ")[1] ?? null;
  }
  return null;
}

/** Whether `<treeish>:<prefix>.stamity` is a folder in that commit's tree; any failed read throws (p2a M-2). */
function baseHoldsStateFolder(runner: GitRunner, cwd: string, treeish: string, prefix: string): boolean {
  return baseEntryType(runner, cwd, treeish, `${prefix}.stamity`) === "tree";
}

/** The cwd's path below the git top-level (`git rev-parse --show-prefix`); outside a work tree this call fails. */
function readCwdPrefix(runner: GitRunner, cwd: string): string {
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
function findProjectRoot(runner: GitRunner, cwd: string, cwdPrefix: string, treeish: string): ProjectRoot {
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
function resolveBase(runner: GitRunner, cwd: string, ref: string): string | null {
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
type BaseClassFile = { state: "absent" } | { state: "valid"; rules: ClassRule[] } | { state: "invalid"; error: string };

/**
 * `<commit>:<prefix>.stamity/change-classes.json`, read as a raw blob (`cat-file
 * blob`, so no textconv or filter rewrites it) after {@link baseEntryType} says
 * what the base holds there. Only git's clean "nothing there" is an absent
 * file; any other failure is a failed read and fails closed. An entry that is
 * not a blob (a folder, a submodule) is refused, never read as absent.
 */
function readBaseClassFile(runner: GitRunner, root: ProjectRoot, commit: string): BaseClassFile {
  const path = `${root.prefix}${CLASS_FILE}`;
  const type = baseEntryType(runner, root.dir, commit, path);
  if (type === null) return { state: "absent" };
  const spec = `${commit}:${path}`;
  if (type !== "blob") return { state: "invalid", error: `the base holds a ${type} there, not a file` };
  const parsed = parseClassFile(runGit(runner, root.dir, "cat-file blob", ["cat-file", "blob", spec]));
  return parsed.ok ? { state: "valid", rules: parsed.rules } : { state: "invalid", error: parsed.errors[0] ?? "refused" };
}

/** The rules a base's class file gives, and the reason clause it adds, if any. */
function rulesFrom(classFile: BaseClassFile): { rules: readonly ClassRule[]; reason?: string } {
  if (classFile.state === "valid") return { rules: mergeRules(BUILT_IN_RULES, classFile.rules) };
  if (classFile.state === "absent") {
    return { rules: BUILT_IN_RULES, reason: `the base holds no ${CLASS_FILE}, so only the built-in rules apply` };
  }
  return {
    rules: BUILT_IN_RULES,
    reason: `the base copy of ${CLASS_FILE} is invalid (${classFile.error}): no map was read from it, so the class is at least product`,
  };
}

/** The verdict for a change git could not read: `product`, the failure named. */
function failClosed(reason: string): ClassifyResult {
  return { class: "product", byPath: [], checks: [...CLASS_CHECKS.product], lenses: [], reason };
}

function withReasons(result: ClassifyResult, reasons: readonly string[]): ClassifyResult {
  if (reasons.length === 0) return result;
  return { ...result, reason: [...reasons, result.reason].filter((part) => part !== "").join("; ") };
}

/** The security lens, as the classifier names it for a `security-sensitive` change. */
const SECURITY_LENS = "stamity-security";

/** `result` raised to at least `floor`; a lens it already had stays, and `security-sensitive` adds its lens first. */
function raiseTo(result: ClassifyResult, floor: ChangeClass): ClassifyResult {
  if (CLASS_ORDER.indexOf(result.class) <= CLASS_ORDER.indexOf(floor)) return result;
  const lenses =
    floor === "security-sensitive" ? [SECURITY_LENS, ...result.lenses.filter((lens) => lens !== SECURITY_LENS)] : result.lenses;
  return { ...result, class: floor, checks: [...CLASS_CHECKS[floor]], lenses };
}

/** At most this many paths are named in one reason clause; the rest are counted. */
const PATHS_NAMED = 5;

function namePaths(paths: readonly string[]): string {
  const named = paths.slice(0, PATHS_NAMED).join(", ");
  return paths.length > PATHS_NAMED ? `${named} and ${paths.length - PATHS_NAMED} more` : named;
}

/**
 * The floors the git read adds over the path rules: a path outside the project
 * raises the class to at least `product` (review/13), or to `security-sensitive`
 * when the security floor or row matches it (review/21), one clause per rule
 * naming its paths through {@link namePaths} (review/42); a name that is not
 * valid UTF-8, decoded to U+FFFD, raises it to at least `product` (review/19).
 */
function applyReadFloors(result: ClassifyResult, change: ChangeRead, source: PathSource): ClassifyResult {
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
  return withReasons(raised, reasons);
}

/**
 * A changed path whose name holds a code point the report strips (a control,
 * bidi, tag or other invisible character, by {@link sanitizeLabel}) is printed
 * under a name that is not the file's own, so nothing can open it by the name
 * read back: the class is at least `product` and the reason names it, whatever
 * the paths' source (review/36). The path keeps its own class in `byPath`.
 */
function applyNameFloor(result: ClassifyResult): ClassifyResult {
  const altered = result.byPath.map((entry) => entry.path).filter((path) => sanitizeLabel(path) !== path);
  if (altered.length === 0) return result;
  return withReasons(raiseTo(result, "product"), [
    `names the report cannot show as they are, so the class is at least product: ${namePaths(altered)}`,
  ]);
}

/**
 * The classification and the resolved base for one run. `--paths` alone reads
 * no git at all; anything else goes through the hardened runner.
 */
function classify(cwd: string, listed: readonly string[] | undefined, ref: string | undefined): {
  result: ClassifyResult;
  base: string | null;
} {
  if (listed !== undefined && ref === undefined) return { result: classifyChange({ paths: listed, base: "absent" }), base: null };

  const runner = gitCheckRunner({ timeoutMs: GATE_GIT_TIMEOUT_MS, maxBuffer: GATE_GIT_MAX_BUFFER });
  try {
    // Read first: outside a work tree this is the call that fails, and says so.
    const cwdPrefix = readCwdPrefix(runner, cwd);
    const commit = ref === undefined ? null : resolveBase(runner, cwd, ref);
    const baseState: BaseState = ref === undefined ? "absent" : commit === null ? "unresolved" : "given";
    const reasons: string[] = [];
    if (baseState === "unresolved") reasons.push(`the base ${ref ?? ""} does not resolve to a commit here`);

    // An unresolved base leaves no class file to read and, without --paths, nothing to diff against.
    if (baseState === "unresolved") {
      return { result: withReasons(classifyChange({ paths: listed ?? [], base: baseState }), reasons), base: commit };
    }
    const treeish = commit ?? "HEAD";
    const root = findProjectRoot(runner, cwd, cwdPrefix, treeish);
    // With no base no class file is read (D5); with one, only the base commit's copy is.
    const classFile = commit === null ? undefined : readBaseClassFile(runner, root, commit);
    const { rules, reason: fileReason } = classFile === undefined ? { rules: BUILT_IN_RULES } : rulesFrom(classFile);
    if (fileReason !== undefined) reasons.push(fileReason);

    let result: ClassifyResult;
    if (listed !== undefined) {
      result = classifyChange({ paths: listed, base: baseState }, rules);
    } else {
      // On win32 git's names are read both ways (review/43); elsewhere literally (review/20).
      const windows = process.platform === "win32";
      const source: PathSource = windows ? "listed" : "git";
      const change = readChange(runner, root, treeish, windows);
      result = applyReadFloors(
        classifyChange({ paths: change.paths, renames: change.renames, base: baseState, source }, rules),
        change,
        source,
      );
    }
    if (classFile?.state === "invalid") result = raiseTo(result, "product");
    return { result: withReasons(result, reasons), base: commit };
  } catch (err) {
    if (!(err instanceof GitReadError)) throw err;
    return { result: failClosed(`${describeGitFailure(err)}, so the class is product`), base: null };
  }
}

function list(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function runClassify(ctx: CliContext, opts: Record<string, unknown>): CommandResult {
  const listed = opts["paths"] as string[] | undefined;
  const ref = opts["base"] as string | undefined;
  const classified = classify(ctx.app.runtime.cwd, listed, ref);
  const { base } = classified;
  const result = applyNameFloor(classified.result);

  // Paths, rules and refs are the caller's or the repository's bytes: sanitised
  // where they meet the terminal and, the same way, in the JSON an agent reads
  // (review/10). `base` is a validated object id or null, so it carries none.
  const lines = [
    `class: ${result.class}`,
    `checks: ${list(result.checks)}`,
    `lenses: ${list(result.lenses)}`,
    `reason: ${sanitizeLabel(result.reason)}`,
    ...result.byPath.map((entry) => sanitizeLabel(`  ${entry.path}  ${entry.class}  (${entry.rule})`)),
  ];
  ctx.io.out(`${lines.join("\n")}\n`);

  return {
    exitCode: 0,
    json: {
      subcommand: CLASSIFY,
      base,
      paths: result.byPath.map((entry) => sanitizeLabel(entry.path)),
      class: result.class,
      checks: result.checks,
      lenses: result.lenses,
      reason: sanitizeLabel(result.reason),
      byPath: result.byPath.map((entry) => ({
        path: sanitizeLabel(entry.path),
        class: entry.class,
        rule: sanitizeLabel(entry.rule),
      })),
    },
  };
}

export const gateCommand: CommandModule = {
  name: "gate",
  summary: "classify a change by its paths: the class, its checks and its lenses (plumbing)",
  hidden: true,
  mutating: false,

  configure(cmd: Command): void {
    cmd
      .addArgument(new Argument("<subcommand>", "which gate action to run").choices([CLASSIFY]))
      .addOption(
        new Option("--base <ref>", "the base the change is read against (default: HEAD, reported as no base)").argParser(
          parseBaseRef,
        ),
      )
      .option("--paths <path...>", "classify these paths by path rules instead of reading the change from git");
  },

  run(ctx, opts): Promise<CommandResult> {
    // Commander's `choices()` already refused every other subcommand at parse time.
    return Promise.resolve(runClassify(ctx, opts));
  },
};
