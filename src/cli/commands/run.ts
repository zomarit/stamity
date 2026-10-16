import { closeSync, fstatSync, lstatSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, realpathSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, posix, relative } from "node:path";
import { Argument, InvalidArgumentError, type Command } from "commander";
import { heldPaths } from "../../change/personOnlyPaths.ts";
import { personOnlyVerdict } from "../../hooks/personOnly.ts";
import { MORNING_FILE, prBodyFrom, screenOutbound } from "../../runs/morning.ts";
import { inferPrerequisites, type PrereqRow } from "../../runs/prerequisites.ts";
import { ensureDraftPr, resolveRepo, type PrOutcome } from "../../runs/pullRequest.ts";
import { parseGitDefaultBranch } from "../../workspace/git.ts";
import { ghApi } from "../engine/ghRunner.ts";
import { gitCheckRunner } from "../engine/gitStatus.ts";
import { gitWrite, type GitWriteResult } from "../engine/gitWrite.ts";
import { CliFailure } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";
import { readChange, scanChange } from "./gate.ts";

/**
 * `stamity run start` and `stamity run checkpoint` — put an unattended run on a
 * branch of its own and push its work there (REQ-FLOW-092, REQ-FLOW-093,
 * REQ-FLOW-102, REQ-FLOW-103), and the CLI's sixth hidden plumbing verb.
 * Hidden for the reason `learn`, `handoff`, `ledger`, `gate` and `plan` are:
 * its callers are the `st-unattended` skill and the close walks, not a person.
 *
 * **It never leaves a run on a default branch.** On the repository's default
 * branch, or at a detached `HEAD`, it switches to `stamity/<run-id>`, creating
 * it at `HEAD` where no local branch of that name exists and checking the one
 * that does out, never recreating it. Any other branch, a platform's own
 * (`claude/…`, `cursor/…`, `copilot/…`) included, is kept. Uncommitted work
 * rides the switch, as `git switch` carries it; a switch git refuses (a local
 * change the target would overwrite) fails the verb and leaves the checkout
 * where it was.
 *
 * **The default branch** is read from GitHub's REST API (`default_branch` of
 * `repos/<owner>/<repo>`, the repository `resolveRepo` matches on `origin`,
 * every call naming the host it matched on); where that read gives no answer
 * (no `origin`, a host `gh` does not talk to, no `gh`, no login, any status
 * but 200), from `refs/remotes/origin/HEAD`; and where neither names one,
 * `main` and `master` both count as the default. The first source that answers
 * decides.
 *
 * **Every git call goes through the write runner** (`../engine/gitWrite.ts`),
 * reads included, so the run verbs share one hardened git: the pinned options,
 * the bare-repository look, git by its absolute path. Paths go plain after a
 * `--`, where the runner gives each its `:(literal)` magic; `push` takes no
 * `--`, and an option value that could read as one goes attached
 * (`--message=…`). The scan and the prerequisite read are `gate`'s own
 * (`./gate.ts`), on the read runner it gives them.
 *
 * **`start`'s exit codes.** 0 the run is on its branch; 1 a refused run id, no
 * commit to base the run on, or a git call that failed; 2 a usage error, no
 * `--run` among them. The JSON is `{ subcommand, run, branch, created, base }`,
 * `base` the full commit id at `HEAD` once the run is on its branch, for the
 * record's `Base:`; `dryRun: true` joins it under `--dry-run`, which switches
 * nothing and reports what the run would land on.
 *
 * **`checkpoint`** reads the run's record head (`Mode:`, `Branch:`, `Base:`)
 * and, in this order: refuses a commit on a default branch (and on a checkout
 * that is not the record's `Branch:`, as `branch mismatch`, or a detached one; a
 * `Branch:` naming a default branch matches `stamity/<run-id>`, the branch
 * `start` switches such a run to); stages
 * only the run folder's record, ledger, plan, morning list and `held/*.patch`,
 * `.stamity/inbox.md` and `--paths` (never `-A`, never `-f`), a path git
 * ignores reported as `records: not committed (…)`; under `Mode: unattended`
 * writes the change against `Base:` under the person-only paths to
 * `held/person-only.patch` and restores those paths to `Base:` in the index
 * only, after the staging, so a `--paths` entry naming one is held too;
 * commits (`--signoff` adding the DCO line); scans `Base..HEAD`'s commits, the
 * work tree and the index left out (a hit, a
 * failed or an incomplete scan holds the push); pushes `HEAD` to the branch,
 * the command checked by the shell guard's own person-only table first; and
 * with `--pr` opens or updates the run's draft pull request. Exit 0 when the
 * remote branch holds `HEAD` (pushed now, or already there with nothing
 * ahead) and, with `--pr`, a pull request was opened, updated or commented;
 * else 1, `notDone[]` naming why. `notDone[]` may carry entries on exit 0 too
 * (an ignored record). Under `--dry-run` nothing is staged, written,
 * committed or pushed.
 */

const START = "start";
const CHECKPOINT = "checkpoint";

/** The options only `checkpoint` takes; on `start` each one is a usage error. */
const CHECKPOINT_OPTIONS: Readonly<Record<string, string>> = {
  paths: "--paths",
  pr: "--pr",
  title: "--title",
  signoff: "--signoff",
};

/** The run folder's files a checkpoint stages where they exist. */
const RUN_FILES: readonly string[] = ["record.md", "ledger.jsonl", "plan.md", "morning.md"];

/** The deferral inbox, staged beside the run folder. */
const INBOX_PATH = ".stamity/inbox.md";

/** The held patch's folder inside the run folder, and the one patch this verb writes there. */
const HELD_DIR = "held";
const HELD_PATCH = "person-only.patch";

/** A branch the push command names unquoted: what the guard's shell reading and git both take as one word. */
const PUSHABLE_BRANCH = /^(?!-)[A-Za-z0-9._/-]+$/;

/** The most of a morning list read for the pull request body; a larger one is not posted. */
const MORNING_READ_MAX_BYTES = 1_048_576;

/** Git's refusals of a commit for a missing author or committer identity. */
const IDENTITY_REFUSAL = /please tell me who you are|unable to auto-detect|no email was given|empty ident name|identity unknown/i;

/** The prefix of every branch this verb creates; the run id after it is the run folder's name. */
const RUN_BRANCH_PREFIX = "stamity/";

/**
 * The names that always count as default branches, beside whatever REST or `origin/HEAD` names
 * and alone where neither names one, as the guard's table counts them (`../../hooks/personOnly.ts`,
 * `PersonOnlyContext.defaultBranches`): a run must never stay on a branch a push from would be refused.
 */
const FALLBACK_DEFAULTS: readonly string[] = ["main", "master"];

/** Where the default branch was read from, as the text output names it. */
type DefaultSource = "rest" | "origin-head" | "fallback";

const SOURCE_LABEL: Readonly<Record<DefaultSource, string>> = {
  rest: "GitHub's REST API",
  "origin-head": "refs/remotes/origin/HEAD",
  fallback: "no source answered, so main and master",
};

interface DefaultBranches {
  /** Lowercased, main and master always among them. */
  names: readonly string[];
  source: DefaultSource;
  /** The default branch as the source that answered spells it, the pull request's target; absent on the fallback. */
  named?: string;
}

/** The `--run` value as given: checked against the run folder's grammar in the action, where the engine is. */
function parseRun(value: string): string {
  if (value.trim() === "") throw new InvalidArgumentError("--run takes the run folder's name.");
  return value;
}

export const runCommand: CommandModule = {
  name: "run",
  summary: "put an unattended run on a branch of its own, and push its work there (plumbing)",
  hidden: true,
  mutating: true,

  configure(cmd: Command): void {
    cmd
      .addArgument(new Argument("<subcommand>", "which run action to run").choices([START, CHECKPOINT]))
      .option("--run <run-id>", "the run folder's name under .stamity/runs/", parseRun)
      .option("--paths <path...>", "checkpoint: also stage these paths, relative to the project root")
      .option("--pr", "checkpoint: open or update the run's draft pull request after the push (with --title)")
      .option("--title <title>", "checkpoint: the draft pull request's title")
      .option("--signoff", "checkpoint: add the Signed-off-by line to the commit")
      // Usage errors, so exit 2 before the action and before git runs.
      .hook("preAction", (command) => {
        const subcommand = String(command.processedArgs[0]);
        const given = command.opts();
        if (given["run"] === undefined) command.error(`error: run ${subcommand} needs --run <run-id>`, { exitCode: 2 });
        if (subcommand === START) {
          const stray = Object.keys(CHECKPOINT_OPTIONS).find((key) => given[key] !== undefined);
          if (stray !== undefined) command.error(`error: ${CHECKPOINT_OPTIONS[stray] ?? stray} does not apply to start`, { exitCode: 2 });
        }
        if ((given["pr"] === true) !== (given["title"] !== undefined)) {
          command.error("error: --pr and --title <title> go together", { exitCode: 2 });
        }
        if (typeof given["title"] === "string" && given["title"].trim() === "") command.error("error: --title takes a title", { exitCode: 2 });
        const paths = (given["paths"] ?? []) as string[];
        if (paths.some((path) => path.trim() === "")) command.error("error: --paths takes no empty path", { exitCode: 2 });
      });
  },

  run(ctx, opts, args): Promise<CommandResult> {
    // Commander's `choices()` already refused every other subcommand at parse time.
    if (args[0] === CHECKPOINT) return runCheckpoint(ctx, opts);
    return runStart(ctx, String(opts["run"]));
  },
};

/** `run` checked against the run folder's grammar; anything else is refused before git runs. */
function checkRunId(ctx: CliContext, verb: string, run: string): void {
  const { layout } = ctx.engine.runs;
  if (layout.isRunId(run)) return;
  throw new CliFailure({
    code: "VALIDATION_ERROR",
    message: `run ${verb}: --run ${JSON.stringify(sanitizeLabel(run))} is not a run id (YYYY-MM-DD_<lowercase-slug>)`,
    why: `a run id matches ${layout.RUN_ID_PATTERN.source}, the name of its folder under .stamity/runs/ and of its branch`,
    next: "pass the run folder's name exactly as it is on disk",
  });
}

async function runStart(ctx: CliContext, run: string): Promise<CommandResult> {
  checkRunId(ctx, START, run);
  const cwd = ctx.app.runtime.cwd;
  const runBranch = `${RUN_BRANCH_PREFIX}${run}`;

  const head = await commitAt(cwd, "HEAD");
  if (head === null) {
    throw new CliFailure({
      code: "FAILURE",
      message: "run start found no commit to base the run on",
      why: "HEAD names no commit here (an empty repository, or no git work tree), and the record's Base: is a commit",
      next: "run it inside a repository with at least one commit",
    });
  }
  const current = await currentBranch(cwd);
  const defaults = current === null ? null : await defaultBranches(ctx, cwd);
  const onDefault = defaults !== null && current !== null && defaults.names.includes(current.toLowerCase());

  if (current !== null && !onDefault) {
    ctx.io.out(`branch: ${sanitizeLabel(current)} (kept: not the default branch)\nbase: ${head}\n`);
    return { exitCode: 0, json: start(run, current, false, head, ctx.dryRun) };
  }

  const existing = await commitAt(cwd, `refs/heads/${runBranch}`);
  const from = current === null ? "a detached HEAD" : `${sanitizeLabel(current)}, the default branch`;
  const how = existing === null ? `created from ${from}` : `checked out from ${from}; it already existed`;
  if (!ctx.dryRun) {
    const switched = await git(cwd, existing === null ? ["switch", "--quiet", "--create", runBranch] : ["switch", "--quiet", runBranch]);
    if (switched.code !== 0) {
      throw new CliFailure({
        code: "FAILURE",
        message: `run start could not switch to ${runBranch}`,
        why: `git switch answered ${switched.code}: ${firstLine(switched.stderr)}; the checkout stays on ${current === null ? "the detached HEAD" : sanitizeLabel(current)}`,
        next: "commit or move the local change git names, then run it again",
      });
    }
  }
  // Read after the switch: an existing branch's own tip is the run's base, not the default branch's.
  const base = ctx.dryRun ? (existing ?? head) : await commitAt(cwd, "HEAD");
  if (base === null) {
    throw new CliFailure({
      code: "FAILURE",
      message: `run start switched to ${runBranch} but could not read its commit`,
      why: "git rev-parse named no commit at HEAD after the switch",
      next: `read it with git rev-parse HEAD, and write that as the record's Base:`,
    });
  }
  const lines = [`branch: ${runBranch} (${how})`, `base: ${base}`];
  if (defaults !== null) lines.push(`default branch read from: ${SOURCE_LABEL[defaults.source]}`);
  if (ctx.dryRun) lines.push("Dry run: nothing was switched.");
  ctx.io.out(`${lines.join("\n")}\n`);
  return { exitCode: 0, json: start(run, runBranch, existing === null, base, ctx.dryRun) };
}

function start(run: string, branch: string, created: boolean, base: string, dryRun: boolean): Record<string, unknown> {
  return { subcommand: START, run, branch, created, base, ...(dryRun ? { dryRun: true } : {}) };
}

/** One git call through the write runner; a git that could not start or finish is a failure of the verb. */
async function git(cwd: string, args: readonly string[], verb: string = START): Promise<GitWriteResult> {
  try {
    return await gitWrite(cwd, args);
  } catch (cause) {
    throw new CliFailure({
      code: "FAILURE",
      message: `run ${verb} could not run git ${args[0] ?? ""}`.trimEnd(),
      why: cause instanceof Error ? sanitizeLabel(cause.message) : "git did not start or did not finish",
      next: "put git on PATH, then run it again",
    });
  }
}

/** The full commit id `rev` names, or `null` where it names none. */
async function commitAt(cwd: string, rev: string, verb: string = START): Promise<string | null> {
  const read = await git(cwd, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`], verb);
  const sha = read.stdout.trim();
  return read.code === 0 && /^[0-9a-f]{40,64}$/.test(sha) ? sha : null;
}

/** The branch `HEAD` is on, or `null` at a detached `HEAD`. */
async function currentBranch(cwd: string, verb: string = START): Promise<string | null> {
  const read = await git(cwd, ["symbolic-ref", "--quiet", "HEAD"], verb);
  if (read.code === 1) return null;
  const ref = read.stdout.trim();
  if (read.code !== 0 || !ref.startsWith("refs/heads/")) {
    throw new CliFailure({
      code: "FAILURE",
      message: `run ${verb} could not read the branch HEAD is on`,
      why: `git symbolic-ref answered ${read.code}: ${firstLine(read.stderr)}`,
      next: "run it inside the repository's work tree",
    });
  }
  return ref.slice("refs/heads/".length);
}

/**
 * The default branches, lowercased: the one the first source names (REST, then `origin/HEAD`), with
 * main and master always beside it, the set and the caseless match the guard's table uses
 * (`../../hooks/personOnly.ts`, `personOnlyVerdict`).
 */
async function defaultBranches(ctx: CliContext, cwd: string, verb: string = START): Promise<DefaultBranches> {
  const origin = await git(cwd, ["remote", "get-url", "origin"], verb);
  const url = origin.code === 0 ? origin.stdout.trim() : "";
  if (url !== "") {
    const rest = await restDefaultBranch(ctx, cwd, url);
    if (rest !== null) return withFallbacks(rest, "rest");
  }
  const symbolic = await git(cwd, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], verb);
  const named = symbolic.code === 0 ? parseGitDefaultBranch(symbolic.stdout) : null;
  if (named !== null) return withFallbacks(named, "origin-head");
  return { names: FALLBACK_DEFAULTS, source: "fallback" };
}

function withFallbacks(named: string, source: DefaultSource): DefaultBranches {
  return { names: [...new Set([named, ...FALLBACK_DEFAULTS].map((name) => name.toLowerCase()))], source, named };
}

/**
 * `default_branch` of the repository `origin` names, read through `gh api` on the host
 * `resolveRepo` matched; `null` for every answer that names none, a `gh` that is absent or
 * failed included, so the next source decides.
 */
async function restDefaultBranch(ctx: CliContext, cwd: string, originUrl: string): Promise<string | null> {
  const env: NodeJS.ProcessEnv = { ...ctx.app.runtime.env };
  const repo = resolveRepo(env, originUrl);
  if (repo === null) return null;
  try {
    const reply = await ghApi({ method: "GET", path: `repos/${repo.owner}/${repo.repo}`, hostname: repo.host }, { cwd, env });
    if (reply.status !== 200 || typeof reply.json !== "object" || reply.json === null) return null;
    const branch = (reply.json as Record<string, unknown>)["default_branch"];
    return typeof branch === "string" && branch !== "" ? branch : null;
  } catch {
    return null;
  }
}

function firstLine(text: string): string {
  return sanitizeLabel(text.split(/\r?\n/).find((line) => line.trim() !== "")?.trim() ?? "no output");
}

/** One secret-scan hit as the checkpoint names it: path, line and rule, never the value. */
interface CheckpointHit {
  path: string;
  line: number;
  rule: string;
  commit?: string;
}

/** What one checkpoint did, in its JSON document's order. */
interface Checkpoint {
  branch: string | null;
  base: string | null;
  /** The commit this checkpoint made, or `null` where it made none. */
  committed: string | null;
  pushed: boolean;
  held: string[];
  scan: { hits: CheckpointHit[]; unscanned: string[] };
  pr: { number: number; url: string; how: string } | null;
  notDone: string[];
}

/** What the run's draft pull request step returns. */
interface PrStep {
  pr: Checkpoint["pr"];
  inferred: PrereqRow[];
  notDone: string[];
}

async function runCheckpoint(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
  const run = String(opts["run"]);
  checkRunId(ctx, CHECKPOINT, run);
  const { layout, resumeCard } = ctx.engine.runs;
  const cwd = ctx.app.runtime.cwd;
  const runDir = layout.runRelPath(run);
  const recordRel = `${runDir}/${layout.RECORD_FILE}`;
  const record = readCapped(join(cwd, recordRel), layout.RECORD_HEAD_READ_BYTES);
  if (record === null) {
    throw new CliFailure({
      code: "FAILURE",
      message: `run checkpoint found no record at ${recordRel}`,
      why: "the checkpoint reads the record's Mode:, Branch: and Base: before it stages anything",
      next: "run it from the project root, naming the run folder that holds the record",
    });
  }
  const head = resumeCard.readRecordHead(record.text);
  const unattended = head.mode === "unattended";
  const recordBase = head.base;
  const base = recordBase === null ? null : await commitAt(cwd, recordBase, CHECKPOINT);
  if (base === null) {
    throw new CliFailure({
      code: "FAILURE",
      message: recordBase === null ? `run checkpoint: ${recordRel} names no Base:` : `run checkpoint: the record's Base: ${recordBase} names no commit here`,
      why: "the held paths and the secret scan are both read against the commit the run started from",
      next: "write the run's branch point as Base: <commit> in the record's head",
    });
  }

  const result: Checkpoint = { branch: null, base, committed: null, pushed: false, held: [], scan: { hits: [], unscanned: [] }, pr: null, notDone: [] };
  const lines: string[] = [`run: ${run} (${unattended ? "unattended" : "attended"})`, `base: ${base}`];
  const finish = (ok: boolean, extra: Record<string, unknown> = {}): CommandResult => {
    const notDone = result.notDone.map((entry) => sanitizeLabel(entry));
    result.notDone = notDone;
    ctx.io.out(`${[...lines, ...(notDone.length === 0 ? [] : ["Not done:", ...notDone.map((entry) => `  - ${entry}`)])].join("\n")}\n`);
    return { exitCode: ok ? 0 : 1, json: { subcommand: CHECKPOINT, run, ...result, ...extra } };
  };

  // (1) Never a commit on a default branch, nor on a checkout that is not the run's.
  const current = await currentBranch(cwd, CHECKPOINT);
  const defaults = await defaultBranches(ctx, cwd, CHECKPOINT);
  const isDefault = (name: string): boolean => defaults.names.includes(name.toLowerCase());
  // build/97: a record whose Branch: names a default branch matches the branch `run start` switches this run to.
  const matches = (recorded: string, checkout: string): boolean =>
    recorded === checkout || (isDefault(recorded) && checkout === `${RUN_BRANCH_PREFIX}${run}`);
  result.branch = current;
  const refusal =
    current === null
      ? "commit refused: HEAD is detached, so there is no run branch to push"
      : isDefault(current)
        ? `commit refused: ${current} is the default branch (read from ${SOURCE_LABEL[defaults.source]})`
        : head.branch !== null && !matches(head.branch, current)
          ? `branch mismatch: the checkout is on ${current}, and the record's Branch: names ${head.branch}`
          : PUSHABLE_BRANCH.test(current)
            ? null
            : `commit refused: the branch name ${current} holds characters the push check does not read`;
  lines.push(`branch: ${sanitizeLabel(current ?? "(detached HEAD)")}`);
  if (refusal !== null || current === null) {
    result.notDone.push(refusal ?? "commit refused");
    return finish(false);
  }

  const top = (await git(cwd, ["rev-parse", "--show-toplevel"], CHECKPOINT)).stdout.replace(/\r?\n$/, "");
  const prefix = (await git(cwd, ["rev-parse", "--show-prefix"], CHECKPOINT)).stdout.replace(/\r?\n$/, "");
  const fromTop = (projectPath: string): string => posix.normalize(`${prefix}${projectPath}`);

  // (3) What is staged: the run folder's files, the inbox and --paths; never -A, never -f.
  const own = [...RUN_FILES.map((file) => `${runDir}/${file}`), INBOX_PATH].filter((path) => isRegular(join(cwd, path))).map(fromTop);
  const heldDir = `${runDir}/${HELD_DIR}`;
  const patchRel = `${heldDir}/${HELD_PATCH}`;
  const patches = [...new Set([patchRel, ...listPatches(join(cwd, heldDir)).map((name) => `${heldDir}/${name}`)])].map(fromTop);
  const named = await namedPaths(top, cwd, prefix, (opts["paths"] ?? []) as string[], result.notDone);
  const ignored = await ignoredPaths(top, [...own, ...named, ...patches]);
  if (ignored === null) {
    result.notDone.push("stage failed: git check-ignore could not read the ignore rules");
    return finish(false);
  }
  const notCommitted = (path: string): void => {
    const source = ignored.get(path);
    if (source !== undefined) result.notDone.push(`records: not committed (${path}: ${source})`);
  };
  const wanted = [...new Set([...own, ...named])];
  wanted.forEach(notCommitted);
  const stage = wanted.filter((path) => !ignored.has(path));

  if (ctx.dryRun) {
    if (unattended) result.held = heldPaths([...new Set([...(await changedSince(top, base)), ...stage])]);
    lines.push(`would stage: ${list(stage)}`, `would hold: ${list(result.held)}`, "Dry run: nothing was staged, written, committed or pushed.");
    return finish(true, { dryRun: true });
  }
  if (!(await add(top, stage, result.notDone))) return finish(false);

  // (2) Unattended: the person-only paths' change goes to an inert patch, and those paths back to Base: in the index.
  if (unattended) {
    const held = heldPaths(await changedSince(top, base));
    if (held.length === 0) {
      // A patch an earlier checkpoint wrote names a change the run no longer makes: it leaves the folder and the branch.
      const stale = await removeStalePatch(cwd, top, heldDir, fromTop(patchRel));
      if (stale !== null) {
        result.notDone.push(stale);
        return finish(false);
      }
    }
    if (held.length > 0) {
      // Git writes the patch to a file, so its bytes never pass a text decode: a held file in any encoding applies again.
      const scratch = mkdtempSync(join(tmpdir(), "stamity-held-"));
      try {
        const out = join(scratch, HELD_PATCH);
        const patch = await git(top, ["diff", "--binary", "--full-index", ...DIFF_PINS, `--output=${out}`, base, "--", ...held], CHECKPOINT);
        if (patch.code !== 0) {
          result.notDone.push(`hold failed: git diff answered ${patch.code}: ${firstLine(patch.stderr)}`);
          return finish(false);
        }
        try {
          await ctx.engine.merge.atomicWrite.atomicWriteFile(join(cwd, patchRel), readFileSync(out), { boundaryDir: cwd });
        } catch (cause) {
          result.notDone.push(`hold failed: ${patchRel} could not be written (${cause instanceof Error ? cause.message : "write failed"})`);
          return finish(false);
        }
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
      const restored = await git(top, ["restore", "--staged", `--source=${base}`, "--", ...held], CHECKPOINT);
      if (restored.code !== 0) {
        result.notDone.push(`hold failed: git restore answered ${restored.code}: ${firstLine(restored.stderr)}`);
        return finish(false);
      }
      result.held = held;
    }
  }
  // Checked before it exists, since check-ignore reads the rules, not the file; named only once it does.
  const written = patches.filter((path) => isRegular(join(top, path)));
  written.forEach(notCommitted);
  const patchFiles = written.filter((path) => !ignored.has(path));
  if (!(await add(top, patchFiles, result.notDone))) return finish(false);
  lines.push(`staged: ${list([...stage, ...patchFiles])}`);
  lines.push(
    result.held.length === 0
      ? "held: none"
      : `held (in ${patchRel}; the work tree keeps them): ${list(result.held)}`,
  );

  // (4) The commit, only when something is staged.
  const staged = await git(top, ["diff", "--cached", "--quiet", "--no-ext-diff", "--ignore-submodules=none"], CHECKPOINT);
  if (staged.code === 1) {
    const commit = await git(top, ["commit", "--quiet", `--message=chore(run): checkpoint ${run}`, ...(opts["signoff"] === true ? ["--signoff"] : [])], CHECKPOINT);
    if (commit.code !== 0) {
      const why = `${commit.stderr}\n${commit.stdout}`;
      result.notDone.push(IDENTITY_REFUSAL.test(why) ? "commit failed (identity)" : `commit failed: ${firstLine(why)}`);
      return finish(false);
    }
    result.committed = await commitAt(top, "HEAD", CHECKPOINT);
  } else if (staged.code !== 0) {
    result.notDone.push(`commit failed: git diff --cached answered ${staged.code}: ${firstLine(staged.stderr)}`);
    return finish(false);
  }
  lines.push(`commit: ${result.committed ?? "nothing to commit"}`);

  // (5) The secret scan over Base..HEAD, what the push sends and no more (build/94): a hit, a failure or an unread line holds the push.
  const outcome = scanChange(cwd, base, { scope: "pushed" });
  if ("failed" in outcome) {
    result.notDone.push(`push held: the secret scan failed (${outcome.failed})`);
    return finish(false);
  }
  result.scan = {
    hits: outcome.hits.map((hit) => ({ ...hit, path: sanitizeLabel(hit.path) })),
    unscanned: outcome.unscanned.map((path) => sanitizeLabel(path)),
  };
  for (const hit of result.scan.hits) {
    result.notDone.push(`push held: secret scan hit at ${hit.path}:${hit.line}${hit.commit === undefined ? "" : ` (commit ${hit.commit})`} (${hit.rule})`);
  }
  if (outcome.incomplete !== undefined) result.notDone.push(`push held: the secret scan is incomplete (${outcome.incomplete})`);
  lines.push(`scan: ${result.scan.hits.length === 0 ? "no hits" : `${result.scan.hits.length} hit(s)`}; unscanned: ${list(result.scan.unscanned)}`);
  if (result.scan.hits.length > 0 || outcome.incomplete !== undefined) return finish(false);

  // (6) The push, its command checked by the shell guard's own table before it runs.
  const refspec = `HEAD:refs/heads/${current}`;
  const tip = await commitAt(top, "HEAD", CHECKPOINT);
  if (tip !== null && tip === (await commitAt(top, `refs/remotes/origin/${current}`, CHECKPOINT))) {
    lines.push(`push: nothing ahead of origin/${current}`);
  } else {
    const verdict = personOnlyVerdict(`git push origin ${refspec}`, {
      defaultBranches: defaults.names,
      currentBranch: current,
      tags: await localTags(top),
    });
    if (verdict.deny) {
      result.notDone.push(`push refused: ${verdict.reason}`);
      return finish(false);
    }
    const pushed = await git(top, ["push", "--quiet", "origin", refspec], CHECKPOINT);
    if (pushed.code !== 0) {
      result.notDone.push(pushFailure(pushed));
      return finish(false);
    }
    result.pushed = true;
    lines.push(`push: origin ${refspec}`);
  }

  // (7) The draft pull request, as `run end` opens it.
  if (opts["pr"] !== true) return finish(true);
  const step = await draftPr(ctx, { run, runDir, recordRel, top, cwd, base, branch: current, defaults, unattended, title: String(opts["title"]) });
  result.pr = step.pr;
  result.notDone.push(...step.notDone);
  lines.push(`pr: ${step.pr === null ? "not opened" : `#${step.pr.number} ${step.pr.url} (${step.pr.how})`}`);
  return finish(step.pr !== null, { inferred: step.inferred });
}

/** The pins every diff here takes against config: no external diff, colour, textconv or rename pairing, top-level names. */
const DIFF_PINS: readonly string[] = ["--no-color", "--no-ext-diff", "--no-textconv", "--no-renames", "--no-relative", "--ignore-submodules=none"];

/** The top-level-relative paths the work tree and the index change against `base`, committed changes included. */
async function changedSince(top: string, base: string): Promise<string[]> {
  const read = await git(top, ["diff", "--name-only", "-z", ...DIFF_PINS, base, "--"], CHECKPOINT);
  if (read.code !== 0) {
    throw new CliFailure({
      code: "FAILURE",
      message: "run checkpoint could not list the change against the record's Base:",
      why: `git diff answered ${read.code}: ${firstLine(read.stderr)}`,
      next: "run it inside the repository's work tree",
    });
  }
  return read.stdout.split("\0").filter((path) => path !== "");
}

/**
 * `--paths` as top-level-relative paths: one that leaves the repository or
 * names the whole project, or that neither the work tree nor the index holds,
 * is left out and named in `notDone`.
 */
async function namedPaths(top: string, cwd: string, prefix: string, given: readonly string[], notDone: string[]): Promise<string[]> {
  const kept: string[] = [];
  const missing: string[] = [];
  const project = prefix.replace(/\/$/, "");
  for (const raw of given) {
    const spelled = isAbsolute(raw) ? relative(cwd, raw) : raw;
    const path = posix.normalize(`${prefix}${process.platform === "win32" ? spelled.replaceAll("\\", "/") : spelled}`);
    if (path === ".." || path.startsWith("../") || isAbsolute(path)) notDone.push(`not staged: ${raw} (outside the repository)`);
    else if (path === "." || path === "./" || path.replace(/\/$/, "") === project) notDone.push(`not staged: ${raw} (names the whole project)`);
    else if (exists(join(top, path))) kept.push(path);
    else missing.push(path);
  }
  if (missing.length === 0) return kept;
  // A path the work tree no longer holds still stages as a deletion where the index tracks it.
  const tracked = await git(top, ["ls-files", "-z", "--cached", "--", ...missing], CHECKPOINT);
  const names = tracked.code === 0 ? tracked.stdout.split("\0").filter((name) => name !== "") : [];
  for (const path of missing) {
    const under = path.endsWith("/") ? path : `${path}/`;
    if (names.some((name) => name === path || name.startsWith(under))) kept.push(path);
    else notDone.push(`not staged: ${path} (no such file)`);
  }
  return kept;
}

/**
 * The paths of `paths` git ignores, each with the rule that ignores it
 * (`<source>:<line> <pattern>`), from `git check-ignore -v`; a negated
 * pattern's match is not ignored, nor is a tracked path. `null` when git
 * could not answer. `check-ignore` refuses pathspec magic, so these paths
 * cannot go after a `--`, where the write runner adds it; each goes as
 * `./<path>`, which no option and no magic starts with.
 */
async function ignoredPaths(top: string, paths: readonly string[]): Promise<Map<string, string> | null> {
  const ignored = new Map<string, string>();
  if (paths.length === 0) return ignored;
  const read = await git(top, ["check-ignore", "-v", "--non-matching", ...paths.map((path) => `./${path}`)], CHECKPOINT);
  const rows = read.stdout.split("\n").filter((row) => row !== "");
  if ((read.code !== 0 && read.code !== 1) || rows.length !== paths.length) return null;
  rows.forEach((row, index) => {
    const info = row.slice(0, row.lastIndexOf("\t"));
    const match = /^(.*):(\d+):(.*)$/s.exec(info);
    const path = paths[index];
    if (match === null || path === undefined || (match[3] ?? "").startsWith("!")) return;
    ignored.set(path, `${match[1] ?? ""}:${match[2] ?? ""} ${match[3] ?? ""}`);
  });
  return ignored;
}

/** `git add -- <paths>`, never `-A` or `-f`; false, with the reason in `notDone`, when git refused it. */
async function add(top: string, paths: readonly string[], notDone: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  const added = await git(top, ["add", "--", ...paths], CHECKPOINT);
  if (added.code === 0) return true;
  notDone.push(`stage failed: git add answered ${added.code}: ${firstLine(added.stderr)}`);
  return false;
}

/**
 * Removes the held patch where it is left from an earlier checkpoint: out of
 * the index (`git rm --cached`, so the commit drops it from the branch), then
 * out of the work tree, only where `held/` is the run folder's own directory
 * and the patch a regular file, never through a link. `null` once it is gone
 * or was never there; else the reason, for `notDone`.
 */
async function removeStalePatch(cwd: string, top: string, heldDir: string, patchFromTop: string): Promise<string | null> {
  const patch = join(top, patchFromTop);
  const tracked = await git(top, ["ls-files", "-z", "--cached", "--", patchFromTop], CHECKPOINT);
  if (tracked.code !== 0) return `hold failed: git ls-files answered ${tracked.code}: ${firstLine(tracked.stderr)}`;
  if (tracked.stdout === "" && !isRegular(patch)) return null;
  if (tracked.stdout !== "") {
    const removed = await git(top, ["rm", "--cached", "--quiet", "--ignore-unmatch", "--", patchFromTop], CHECKPOINT);
    if (removed.code !== 0) return `hold failed: git rm answered ${removed.code}: ${firstLine(removed.stderr)}`;
  }
  if (!isRegular(patch)) return null;
  try {
    if (realpathSync(join(cwd, heldDir)) !== join(realpathSync(cwd), heldDir)) return `hold failed: ${heldDir} is not the run folder's own directory`;
    unlinkSync(patch);
  } catch (cause) {
    return `hold failed: ${patchFromTop} could not be removed (${cause instanceof Error ? cause.message : "remove failed"})`;
  }
  return null;
}

/** The repository's local tag names, read through the write runner; `[]` where git names none. */
async function localTags(top: string): Promise<string[]> {
  const read = await git(top, ["for-each-ref", "--format=%(refname:strip=2)", "refs/tags/"], CHECKPOINT);
  return read.code === 0 ? read.stdout.split(/\r?\n/).filter((name) => name !== "") : [];
}

/** A refused push in the words the skill copies: the remote's refusal, a hook's, or git's first line. */
function pushFailure(pushed: GitWriteResult): string {
  const rejected = pushed.stderr.split(/\r?\n/).find((line) => /\[(?:remote )?rejected\]/.test(line));
  if (rejected !== undefined) return `push rejected by the remote: ${firstLine(rejected)}`;
  if (pushed.code === 1 && /failed to push some refs/.test(pushed.stderr)) return "push refused by a hook";
  return `push failed: git push answered ${pushed.code}: ${firstLine(pushed.stderr)}`;
}

/** What the pull request step reads. */
interface PrInputs {
  run: string;
  runDir: string;
  recordRel: string;
  top: string;
  cwd: string;
  base: string;
  branch: string;
  defaults: DefaultBranches;
  unattended: boolean;
  title: string;
}

/**
 * The run's draft pull request (u19's step, shared by `run checkpoint --pr`):
 * on the repository `resolveRepo` matches on `origin`, against the default
 * branch read above. Unattended, the body is `prBodyFrom` over `morning.md`
 * with the prerequisites the change's added lines imply, after
 * `screenOutbound`; a hit, or no morning list, puts a fixed body in its
 * place. Attended, no morning list is written, so the body is a fixed one
 * naming the run and its record. The title passes the screen too, a hit
 * replacing it with `Run <run-id>`.
 */
async function draftPr(ctx: CliContext, at: PrInputs): Promise<PrStep> {
  const env: NodeJS.ProcessEnv = { ...ctx.app.runtime.env };
  const origin = await git(at.top, ["remote", "get-url", "origin"], CHECKPOINT);
  const repo = origin.code === 0 ? resolveRepo(env, origin.stdout.trim()) : null;
  if (repo === null) return { pr: null, inferred: [], notDone: ["draft PR not opened (origin names no GitHub repository gh reaches)"] };
  const target = at.defaults.named;
  if (target === undefined) return { pr: null, inferred: [], notDone: ["draft PR not opened (no default branch was read to target)"] };

  const notDone: string[] = [];
  const title = screenOutbound(at.title, "pr-title").ok ? sanitizeLabel(at.title) : `Run ${at.run}`;
  let inferred: PrereqRow[] = [];
  let body = `Run \`${at.run}\`, attended. Its record: \`${at.recordRel}\`.`;
  if (at.unattended) {
    const morningRel = `${at.runDir}/${MORNING_FILE}`;
    const morning = readCapped(join(at.cwd, morningRel), MORNING_READ_MAX_BYTES);
    if (morning === null || morning.truncated) {
      notDone.push(morning === null ? "morning list missing" : `morning list not posted (over ${MORNING_READ_MAX_BYTES} bytes)`);
      body = `Run \`${at.run}\`: no morning list was posted. Its record: \`${at.recordRel}\`.`;
    } else {
      inferred = inferredFrom(at.top, at.base);
      const made = prBodyFrom(morning.text, at.run, { inferred });
      const screen = screenOutbound(made, "pr-body");
      body = made;
      if (!screen.ok) {
        const where = screen.hits.map((hit) => `line ${hit.line} (${hit.rule})`).join(", ");
        notDone.push(`pull request body replaced: the outbound screen matched ${where}`);
        body = `Run \`${at.run}\`: the body made from \`${morningRel}\` was not posted, because the outbound screen matched its ${where}. Read the morning list on the branch.`;
      }
    }
  }
  const gh = (request: Parameters<typeof ghApi>[0]) => ghApi(request, { cwd: at.top, env });
  const outcome: PrOutcome = await ensureDraftPr(gh, { host: repo.host, owner: repo.owner, repo: repo.repo, head: at.branch, base: target, title, body, runId: at.run });
  if ("notDone" in outcome) return { pr: null, inferred, notDone: [...notDone, outcome.notDone] };
  return { pr: { number: outcome.number, url: outcome.url, how: outcome.how }, inferred, notDone };
}

/** The prerequisites the change's added lines against `base` imply; none where the lines cannot be read. */
function inferredFrom(top: string, base: string): PrereqRow[] {
  try {
    const runner = gitCheckRunner({ timeoutMs: 60_000, maxBuffer: 64 * 1024 * 1024 });
    const { lines } = readChange(runner, { dir: top, prefix: "", topLevel: top }, base, process.platform === "win32");
    return "failed" in lines ? [] : inferPrerequisites(lines.hunks);
  } catch {
    return [];
  }
}

/** At most `maxBytes` of a regular file (never through a link), and whether it held more; `null` when absent or unreadable. */
function readCapped(path: string, maxBytes: number): { text: string; truncated: boolean } | null {
  try {
    if (!lstatSync(path).isFile()) return null;
    const fd = openSync(path, "r");
    try {
      if (!fstatSync(fd).isFile()) return null;
      const buffer = Buffer.alloc(maxBytes + 1);
      let filled = 0;
      while (filled < buffer.length) {
        const read = readSync(fd, buffer, filled, buffer.length - filled, filled);
        if (read === 0) break;
        filled += read;
      }
      return { text: buffer.toString("utf8", 0, Math.min(filled, maxBytes)), truncated: filled > maxBytes };
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

function isRegular(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** The `*.patch` files directly in the run's `held/` folder; none where it is absent or not a folder. */
function listPatches(dir: string): string[] {
  try {
    if (!lstatSync(dir).isDirectory()) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".patch"))
      .map((entry) => entry.name)
      .toSorted();
  } catch {
    return [];
  }
}

function list(paths: readonly string[]): string {
  return paths.length === 0 ? "none" : paths.map((path) => sanitizeLabel(path)).join(", ");
}
