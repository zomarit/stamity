import { realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Argument, InvalidArgumentError, Option, type Command } from "commander";
import {
  CLASS_CHECKS,
  classifyChange,
  type BaseState,
  type ClassifyResult,
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
 * rules alone. Without it the change is read from git: the tracked changes
 * (staged and unstaged) against the base, renames as renames, plus the
 * untracked files. `--base <ref>` names the base, resolved once to a commit id
 * every later call uses; with no `--base` the reads run against `HEAD` and the
 * reason says no base was given.
 *
 * **Fail-closed.** Every git call runs through {@link gitCheckRunner}, the
 * hardened construction the CLI's other git reads use. A directory outside a
 * work tree, no git binary, a timeout, an oversized output or any other git
 * failure gives `product` with the failure named; a base that does not resolve
 * gives at least `product` with the ref named. Never a narrower class: the
 * class narrows the gates a flow runs, so an unread change takes the full set.
 *
 * **The project, not the repository.** The project is the nearest ancestor of
 * the directory the verb runs in, up to the git top-level, that holds a
 * `.stamity/` folder, or the top-level when none does; every git read runs
 * from it ({@link findProjectRoot}). Each changed path is classified by its
 * project-relative form ({@link toProjectPath}), so the rules read the
 * project's own layout; a path outside the project is left out and counted in
 * the reason.
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
 * A ref git would read as an option is refused before git runs: `--end-of-options`
 * already guards the resolve, and this keeps the refusal at the parser, exit 2.
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

/** A git call that failed, carrying the step that failed for the reason. */
class GitReadError extends Error {
  // Plain fields, not parameter properties: Node's type stripping runs this file as-is.
  readonly step: string;
  readonly failure: unknown;

  constructor(step: string, failure: unknown) {
    super(`git ${step} failed`);
    this.step = step;
    this.failure = failure;
  }
}

function runGit(runner: GitRunner, cwd: string, step: string, args: readonly string[]): string {
  try {
    return runner(args, cwd);
  } catch (err) {
    throw new GitReadError(step, err);
  }
}

/** Why a git read failed, in words: the step and the cause the error carries. */
function describeGitFailure(err: GitReadError): string {
  const failure = err.failure as { code?: unknown; status?: unknown };
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
      if (from === undefined || to === undefined) throw new GitReadError("diff --name-status", new Error("truncated row"));
      renames.push({ from, to });
      index += 3;
    } else {
      const path = fields[index + 1];
      if (path === undefined) throw new GitReadError("diff --name-status", new Error("truncated row"));
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
  outside: number;
}

/**
 * The change against `commit`: tracked changes (staged and unstaged, renames
 * as `R` rows) plus untracked files, both NUL-separated so `core.quotePath`
 * cannot escape a name, and both top-level-relative (`--no-relative`, so a
 * `diff.relative` setting cannot narrow the read) before {@link toProjectPath}.
 */
function readChange(runner: GitRunner, cwd: string, prefix: string, commit: string): ChangeRead {
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
      commit,
      "--",
    ]),
  );
  const untracked = runGit(runner, cwd, "ls-files --others", [
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
    if (inside === null) outside.add(path);
    return inside;
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
  return { paths, renames, outside: outside.size };
}

/** The project a run reads: its directory, and its prefix below the git top-level. */
interface ProjectRoot {
  dir: string;
  prefix: string;
}

function holdsStateFolder(dir: string): boolean {
  try {
    return statSync(join(dir, ".stamity")).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The project root: the nearest ancestor of `cwd`, up to the git top-level,
 * that holds a `.stamity/` folder, or the top-level when none does (re-review
 * r3, `plan/63`). A run started in a subfolder, a run folder under
 * `.stamity/runs/` included, so still reads every changed path of its project.
 * The walk follows `git rev-parse --show-prefix` up from the real cwd, so it
 * never leaves the work tree git answered for.
 */
function findProjectRoot(runner: GitRunner, cwd: string): ProjectRoot {
  const cwdPrefix = runGit(runner, cwd, "rev-parse --show-prefix", ["rev-parse", "--show-prefix"]).replace(
    /\r?\n$/,
    "",
  );
  const segments = cwdPrefix.split("/").filter((segment) => segment !== "");
  let start = cwd;
  try {
    start = realpathSync(cwd);
  } catch {
    // git answered from this cwd, so it exists; the lexical form walks the same steps.
  }
  for (let depth = segments.length; depth > 0; depth -= 1) {
    const dir = resolve(start, ...Array.from({ length: segments.length - depth }, () => ".."));
    if (holdsStateFolder(dir)) return { dir, prefix: `${segments.slice(0, depth).join("/")}/` };
  }
  return { dir: resolve(start, ...Array.from({ length: segments.length }, () => "..")), prefix: "" };
}

/** A full object id, SHA-1 or SHA-256. */
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** `<ref>` as a commit id, or `null` when it does not resolve to a commit. */
function resolveBase(runner: GitRunner, cwd: string, ref: string): string | null {
  try {
    const id = runner(["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`], cwd).trim();
    return OBJECT_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** The verdict for a change git could not read: `product`, the failure named. */
function failClosed(reason: string): ClassifyResult {
  return { class: "product", byPath: [], checks: [...CLASS_CHECKS.product], lenses: [], reason };
}

function withReasons(result: ClassifyResult, reasons: readonly string[]): ClassifyResult {
  if (reasons.length === 0) return result;
  return { ...result, reason: [...reasons, result.reason].filter((part) => part !== "").join("; ") };
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
    const root = findProjectRoot(runner, cwd);
    const commit = ref === undefined ? null : resolveBase(runner, root.dir, ref);
    const baseState: BaseState = ref === undefined ? "absent" : commit === null ? "unresolved" : "given";
    const reasons: string[] = [];
    if (baseState === "unresolved") reasons.push(`the base ${ref ?? ""} does not resolve to a commit here`);

    if (listed !== undefined) {
      return { result: withReasons(classifyChange({ paths: listed, base: baseState }), reasons), base: commit };
    }
    // An unresolved base leaves nothing to diff against: no path is read, and the class is at least product.
    const change =
      baseState === "unresolved"
        ? { paths: [], renames: [], outside: 0 }
        : readChange(runner, root.dir, root.prefix, commit ?? "HEAD");
    if (change.outside > 0) {
      reasons.push(`${change.outside} changed path${change.outside === 1 ? "" : "s"} outside the project left out`);
    }
    const result = classifyChange({ paths: change.paths, renames: change.renames, base: baseState });
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
  const { result, base } = classify(ctx.app.runtime.cwd, listed, ref);

  // Paths and refs are the caller's bytes: sanitised where they meet the terminal.
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
      paths: result.byPath.map((entry) => entry.path),
      class: result.class,
      checks: result.checks,
      lenses: result.lenses,
      reason: result.reason,
      byPath: result.byPath,
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
