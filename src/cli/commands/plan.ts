import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { Argument, InvalidArgumentError, Option, type Command } from "commander";
import { checkPlans, type PlanCheckDoc, type PlanCheckResult, type PlanReport } from "../../runs/planCheck.ts";
import { gitCheckRunner } from "../engine/gitStatus.ts";
import { CliFailure } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";
import type { GitRunner } from "../../workspace/git.ts";

/**
 * `stamity plan check` — a plan's readiness for an unattended start
 * (REQ-FLOW-091), and the CLI's fifth hidden plumbing verb. Hidden for the
 * reason `learn`, `handoff`, `ledger` and `gate` are: its caller is the
 * `st-unattended` skill's ready check, not a person.
 *
 * **It decides nothing about a plan.** Every blocker, advisory and lint verdict
 * is `../../runs/planCheck.ts`'s; the JSON document is its `PlanCheckResult`
 * as returned. What this file owns is where the inputs come from: the plans
 * and the contract by path, the specs from `docs/specs/*.md` (every `.md` but
 * `manifest.md`, sorted, as the coverage script reads a spec directory), the
 * repository root git names, and the git reads through the CLI's hardened
 * runner. With no `docs/specs/` folder there is no spec and each plan carries
 * the `missing-spec-input` advisory the coverage script gives, so a cited id
 * its own delta does not define is `lint-L4`, as there.
 *
 * **Paths are the repository's.** Every path given is resolved against the
 * directory the verb runs in and must land, symlinks followed, inside the git
 * top-level; it is checked by its top-level-relative form, the form a plan's
 * head `depends_on` and a contract's `plan` name it by. A plan that does not
 * exist, is not a regular file, is larger than {@link MAX_INPUT_BYTES} or lies
 * outside the repository is not read: the verb exits 1 with a `no-plan`
 * blocker naming it (`contract` for the contract) and checks nothing, since a
 * chain missing one of its files would read the others' order wrong.
 *
 * **Exit codes.** 0 every plan ready; 1 a blocker, an unread input, or no git
 * work tree to read from; 2 a usage error, `--chain` without `--since` and
 * `--since` over several plans without `--chain` among them. Read-only: nothing is written.
 */

const CHECK = "check";

/** The largest plan, spec or contract read, in bytes; the repository's largest spec is about 0.3 MiB. */
const MAX_INPUT_BYTES = 4 * 1024 * 1024;

/** The spec folder, relative to the repository root. */
const SPECS_DIR = "docs/specs";

/** Where the preAction hook puts the variadic plan list, which the funnel's positional list leaves out. */
const PLANS_KEY = "planPaths";

/** The coverage script's message for an absent spec directory (`spec-plan-coverage.mjs`, `missing-spec-input`). */
const MISSING_SPECS_MESSAGE = `${SPECS_DIR} does not exist; read as no spec — every cited ID must be defined in this plan's delta or the unit must say spec carries no ids.`;

/** An input the verb did not read, by the path it was given. */
interface Unread {
  code: "no-plan" | "contract";
  path: string;
  message: string;
}

/** `--since`: the run's `Base:`, a commit id as the freshness guard resolves it. */
function parseSince(value: string): string {
  if (!/^[0-9a-f]{7,64}$/i.test(value)) throw new InvalidArgumentError("--since takes a commit id, 7 to 64 hex characters.");
  return value;
}

export const planCommand: CommandModule = {
  name: "plan",
  summary: "check that plans are ready for an unattended start (plumbing)",
  hidden: true,
  mutating: false,

  configure(cmd: Command): void {
    cmd
      .addArgument(new Argument("<subcommand>", "which plan action to run").choices([CHECK]))
      .addArgument(new Argument("<plan...>", "one or more plan files, in chain order with --chain"))
      .option("--chain", "the plans are one chain: each file's head depends_on names the file before it")
      .addOption(new Option("--since <sha>", "the run's base: a path moved only after it is exempt; one plan takes it alone, several need --chain").argParser(parseSince))
      .option("--contract <path>", "the run contract the plans run under")
      // Usage errors, so exit 2 before the action and before git runs.
      .hook("preAction", (command) => {
        const given = command.opts();
        if (given["chain"] === true && given["since"] === undefined) {
          command.error("error: --chain needs --since <sha>, the run's base", { exitCode: 2 });
        }
        if (given["since"] !== undefined && given["chain"] !== true && (command.processedArgs[1] as unknown[]).length > 1) {
          command.error("error: --since over several plans needs --chain; one plan takes it alone", { exitCode: 2 });
        }
        command.setOptionValue(PLANS_KEY, command.processedArgs[1]);
      });
  },

  run(ctx, opts): Promise<CommandResult> {
    // Commander's `choices()` already refused every other subcommand at parse time.
    const plans = Array.isArray(opts[PLANS_KEY]) ? opts[PLANS_KEY].map(String) : [];
    return runCheck(ctx, plans, opts);
  },
};

async function runCheck(ctx: CliContext, planArgs: readonly string[], opts: Record<string, unknown>): Promise<CommandResult> {
  // Every side in the file system's own spelling (prove/1): git answers its top level that way, while the JS
  // realpath keeps the spelling it was given, so a letter case or a Windows 8.3 name (`RUNNER~1`) read as outside.
  const cwd = realpathSync.native(ctx.app.runtime.cwd);
  const git = gitCheckRunner();
  const root = repositoryRoot(git, cwd);

  const unread: Unread[] = [];
  const plans: PlanCheckDoc[] = [];
  for (const given of planArgs) {
    const read = readInput(root, cwd, given);
    if (typeof read === "string") unread.push({ code: "no-plan", path: given, message: read });
    else plans.push(read);
  }
  let contract: PlanCheckDoc | undefined;
  if (typeof opts["contract"] === "string") {
    const read = readInput(root, cwd, opts["contract"]);
    if (typeof read === "string") unread.push({ code: "contract", path: opts["contract"], message: read });
    else contract = read;
  }
  if (unread.length > 0) {
    for (const entry of unread) ctx.io.err(`${entry.code} ${sanitizeLabel(entry.path)}  ${sanitizeLabel(entry.message)}\n`);
    ctx.io.err("ready: no (nothing was checked)\n");
    return { exitCode: 1, json: { ready: false, plans: [], blockers: unread } };
  }

  const specs = readSpecs(root);
  const result = await checkPlans(plans, {
    specs: specs ?? [],
    git,
    cwd: root,
    ...(typeof opts["since"] === "string" ? { chain: { since: opts["since"] } } : {}), // one plan: a chain of one
    ...(contract === undefined ? {} : { contract }),
  });
  if (specs === undefined) {
    for (const report of result.plans) report.advisories.unshift({ code: "missing-spec-input", message: MISSING_SPECS_MESSAGE });
  }
  ctx.io.out(render(result, contract?.path));
  return { exitCode: result.ready ? 0 : 1, json: { ...result } };
}

/** The git top-level holding `cwd`, symlinks resolved; outside a work tree there is nothing to measure from. */
function repositoryRoot(git: GitRunner, cwd: string): string {
  try {
    return realpathSync.native(git(["rev-parse", "--show-toplevel"], cwd).trim());
  } catch (cause) {
    throw new CliFailure({
      code: "FAILURE",
      message: "plan check found no git work tree to read the plans from",
      why: `${sanitizeLabel(cwd)} is not inside a git work tree git could read (${cause instanceof Error ? sanitizeLabel(cause.message) : "git failed"}), and freshness is measured against its history`,
      next: "run the check from inside the repository the plans belong to",
    });
  }
}

/** A top-level-relative path in `/` form, or undefined when `absolute` lies outside `root`. */
function inside(root: string, absolute: string): string | undefined {
  const rel = relative(root, absolute);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return undefined;
  return rel.split(sep).join("/");
}

/**
 * One input file by the path given: the document under its repository path, or the reason it was
 * not read. Containment is decided on the real path, so a symlink out of the repository is refused;
 * the path reported is the given one's own form where that lies inside, so a link keeps its name.
 */
function readInput(root: string, cwd: string, given: string): PlanCheckDoc | string {
  const absolute = resolve(cwd, given);
  let real: string;
  try {
    real = realpathSync.native(absolute);
  } catch {
    return "does not exist, so it was not read";
  }
  const realPath = inside(root, real);
  if (realPath === undefined) return "is outside the repository, so it was not read";
  const stats = statSync(real);
  if (!stats.isFile()) return "is not a regular file, so it was not read";
  if (stats.size > MAX_INPUT_BYTES) return `is larger than ${MAX_INPUT_BYTES} bytes, so it was not read`;
  return { path: inside(root, absolute) ?? realPath, text: readFileSync(real, "utf8") };
}

/**
 * The specs under `docs/specs/`, or undefined when the folder is absent (the coverage script's
 * "read as no spec"). A spec that cannot be read refuses the check: a missing definition would
 * read as a dangling reference and blame the plan.
 */
function readSpecs(root: string): PlanCheckDoc[] | undefined {
  const dir = join(root, SPECS_DIR);
  try {
    if (!statSync(dir).isDirectory()) return undefined;
  } catch {
    return undefined;
  }
  const names = readdirSync(dir).filter((name) => name.endsWith(".md") && name !== "manifest.md").toSorted();
  return names.map((name) => {
    const path = `${SPECS_DIR}/${name}`;
    const read = readInput(root, root, path);
    if (typeof read !== "string") return read;
    throw new CliFailure({
      code: "FAILURE",
      message: `plan check could not read the spec ${sanitizeLabel(path)}`,
      why: `${sanitizeLabel(path)} ${read}, and the requirement ids it defines would read as dangling`,
      next: "make the spec a regular file inside the repository, or move it out of docs/specs",
    });
  });
}

/** The verdict as a person reads it: each plan, its blockers by `<path>:<line>`, its advisories, the contract. */
function render(result: PlanCheckResult, contractPath: string | undefined): string {
  const lines: string[] = [];
  for (const report of result.plans) lines.push(...renderPlan(report));
  if (result.contract !== undefined && contractPath !== undefined) {
    lines.push(`contract ${sanitizeLabel(contractPath)}: ${result.contract.ok ? "ok" : "refused"}`);
    for (const problem of result.contract.problems) lines.push(`  ${sanitizeLabel(problem)}`);
  }
  lines.push(`ready: ${result.ready ? "yes" : "no"}`);
  return `${lines.join("\n")}\n`;
}

function renderPlan(report: PlanReport): string[] {
  const path = sanitizeLabel(report.path);
  const lines = [`${path}: ${report.ready ? "ready" : "not ready"}`];
  for (const blocker of report.blockers) {
    const where = blocker.line === undefined ? path : `${path}:${blocker.line}`;
    lines.push(`  ${blocker.code} ${where}  ${sanitizeLabel(blocker.message)}`);
  }
  for (const advisory of report.advisories) lines.push(`  advisory ${advisory.code}  ${sanitizeLabel(advisory.message)}`);
  return lines;
}
