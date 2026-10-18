import { closeSync, fstatSync, lstatSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, realpathSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, posix, relative } from "node:path";
import { Argument, InvalidArgumentError, type Command } from "commander";
import { matchGlob } from "../../change/classify.ts";
import { heldPaths, PERSON_ONLY_PATHS } from "../../change/personOnlyPaths.ts";
import { personOnlyVerdict } from "../../hooks/personOnly.ts";
import { RUN_ENDED_MARKER_FILE } from "../../mcp/env.ts";
import { MORNING_FILE, prBodyFrom, screenOutbound } from "../../runs/morning.ts";
import { inferPrerequisites, type PrereqRow } from "../../runs/prerequisites.ts";
import { ensureDraftPr, HOST_NAME, resolveRepo, type PrOutcome } from "../../runs/pullRequest.ts";
import { parseGitDefaultBranch } from "../../workspace/git.ts";
import { ghApi } from "../engine/ghRunner.ts";
import { gitCheckRunner } from "../engine/gitStatus.ts";
import { gitWrite, type GitWriteResult } from "../engine/gitWrite.ts";
import { CliFailure } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";
import { readPushed, scanChange } from "./gate.ts";

/**
 * `stamity run start`, `stamity run checkpoint` and `stamity run end` — put an
 * unattended run on a branch of its own, push its work there and end on its
 * draft pull request (REQ-FLOW-092, REQ-FLOW-093, REQ-FLOW-094,
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
 * **`start` pins origin** (review/209): the one repository `resolveRepo` matches on
 * `origin`'s fetch URL and on every push URL git resolves for it (`pushInsteadOf`
 * applied) goes to the run folder's `origin.json` as `{ host, owner, repo }`,
 * staged with the run folder, read and written once the run is on its branch
 * (pr/4); one already there is kept, and `start` refuses
 * when origin now names another repository. An origin naming no GitHub
 * repository pins nothing, said in the text.
 *
 * **`start`'s exit codes.** 0 the run is on its branch; 1 a refused run id, no
 * commit to base the run on, origin changed, or a git call that failed; 2 a usage error, no
 * `--run` among them. The JSON is `{ subcommand, run, branch, created, base }`,
 * `base` the full commit id at `HEAD` once the run is on its branch, for the
 * record's `Base:`; `dryRun: true` joins it under `--dry-run`, which switches
 * nothing and reports what the run would land on.
 *
 * **`checkpoint`** reads the run's record head (`Mode:`, `Branch:`, `Base:`)
 * and, in this order: refuses a commit on a default branch (and on a checkout
 * that is not the record's `Branch:`, as `branch mismatch`, or a detached one; a
 * `Branch:` naming a default branch matches `stamity/<run-id>`, the branch
 * `start` switches such a run to; a record with no `Branch:` line at column 0
 * refuses as `commit refused: <record> names no Branch:`, pr/47); refuses as `origin changed` where origin's
 * fetch URL or any push URL git resolves now names another repository than `origin.json` pins (and, unattended, where
 * no pin is readable, as `origin not pinned`); stages
 * only the run folder's record, ledger, plan, morning list, origin pin and `held/*.patch`,
 * `.stamity/inbox.md` and `--paths` (never `-A`, never `-f`), a path git
 * ignores reported as `records: not committed (…)`; in an unattended run
 * (`Mode: unattended`, or no `Mode:` line with `STAMITY_UNATTENDED` set, as
 * the shell guard reads it) writes the work tree's and the index's change
 * against `Base:` under the person-only paths to `held/person-only.patch` and
 * restores those paths to `Base:` in the index only, after the staging, so a
 * `--paths` entry naming one is held too, and a symbolic link the change adds
 * or retypes at a held path or at a held glob's directory prefix (`.claude`,
 * `.github/workflows`, any `.vscode`) is held the same way (review/200); refuses
 * a path staged outside that list as `commit refused: <path> is staged and not
 * in --paths` (pr/5); commits (`--signoff` adding the DCO
 * line); in an unattended run refuses the push when a commit it would send
 * changes a person-only path, or `HEAD`'s tree still does (`held path in
 * history (…)`, never a history rewrite); scans the commits the remote lacks
 * and `Base..HEAD`'s, the work tree and the index left out (a hit, a
 * failed or an incomplete scan holds the push), both history reads taking what
 * the remote lacks from origin's branches and tags as `git ls-remote origin`
 * answers, read once, a remote it cannot read holding the push (pr/46); pushes `HEAD` to the branch,
 * the command checked by the shell guard's own person-only table first; and
 * with `--pr` opens or updates the run's draft pull request. Exit 0 when the
 * remote branch holds `HEAD` (pushed now, or already there with nothing
 * ahead, read from the remote itself, pr/20) and, with `--pr`, a pull request was opened, updated or commented;
 * else 1, `notDone[]` naming why. `notDone[]` may carry entries on exit 0 too
 * (an ignored record, a file the scan left unread). Under `--dry-run` nothing is staged, written,
 * committed or pushed.
 *
 * **`end`** (`--title` required, no `--pr`) runs `checkpoint`'s steps and
 * then the draft pull request every time, `--refused` titling it
 * `Refused: <title>` before the title screen (a pull request already open
 * keeps its own title, said in `notDone`). On an attended record reading
 * `Resumes: <run-id>` (the morning walk), the body is that run's morning
 * list, under its marker. A refusal, a scan hit or a
 * refused push returns before any pull request call, as in `checkpoint`.
 * Exit 0 when the remote branch holds `HEAD` and a pull request was opened,
 * updated or commented; else 1. The JSON is `checkpoint`'s with
 * `subcommand: "end"`, `inferred` always present.
 *
 * **The run-ended marker** (pr/17, pr/36, pr/37): `end --final-round`, the
 * run's last `end`, writes `{ "run": "<run-id>", "at": "<ISO time>" }` to
 * `.stamity/run-ended.json` at every exit past the record's read, `--dry-run`
 * aside, and `start` deletes it first; the ask gate allows the final question
 * round only on the branch of the closed run it names, and only for the
 * pre-flight canary's window after `at`. A plain `end` (a chain file the next one
 * follows, or a flag left out) writes none and removes one already there, so no
 * question passes between two chain files; one it cannot remove makes the exit 1,
 * its `notDone` line naming it.
 */

const START = "start";
const CHECKPOINT = "checkpoint";
const END = "end";

/** Every option beyond `--run`, by its key in commander's parsed options. */
const OPTION_FLAGS: Readonly<Record<string, string>> = {
  paths: "--paths",
  pr: "--pr",
  title: "--title",
  signoff: "--signoff",
  refused: "--refused",
  finalRound: "--final-round",
};

/** The options each subcommand takes beyond `--run`; any other one given is a usage error. */
const SUBCOMMAND_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  [START]: [],
  [CHECKPOINT]: ["paths", "pr", "title", "signoff"],
  // No --pr: the pull request is not optional at the end.
  [END]: ["paths", "title", "refused", "signoff", "finalRound"],
};

/** The origin pin `start` writes in the run folder (review/209). */
const ORIGIN_PIN = "origin.json";

/** The run folder's files a checkpoint stages where they exist. */
const RUN_FILES: readonly string[] = ["record.md", "ledger.jsonl", "plan.md", "morning.md", ORIGIN_PIN];

/** The most of an origin pin read; a pin is one short JSON object. */
const ORIGIN_PIN_MAX_BYTES = 4096;

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
      .addArgument(new Argument("<subcommand>", "which run action to run").choices([START, CHECKPOINT, END]))
      .option("--run <run-id>", "the run folder's name under .stamity/runs/", parseRun)
      .option("--paths <path...>", "checkpoint and end: also stage these paths, relative to the project root")
      .option("--pr", "checkpoint: open or update the run's draft pull request after the push (with --title)")
      .option("--title <title>", "checkpoint and end: the draft pull request's title (end needs it)")
      .option("--signoff", "checkpoint and end: add the Signed-off-by line to the commit")
      .option("--refused", "end: title the draft pull request Refused: <title>, for a run that refused to start")
      .option("--final-round", "end: the run's last end; write the run-ended marker the final question round needs (a plain end removes one)")
      // Usage errors, so exit 2 before the action and before git runs.
      .hook("preAction", (command) => {
        const subcommand = String(command.processedArgs[0]);
        const given = command.opts();
        if (given["run"] === undefined) command.error(`error: run ${subcommand} needs --run <run-id>`, { exitCode: 2 });
        const allowed = SUBCOMMAND_OPTIONS[subcommand] ?? [];
        const stray = Object.keys(OPTION_FLAGS).find((key) => given[key] !== undefined && !allowed.includes(key));
        if (stray !== undefined) command.error(`error: ${OPTION_FLAGS[stray] ?? stray} does not apply to ${subcommand}`, { exitCode: 2 });
        if (subcommand === END && given["title"] === undefined) command.error("error: run end needs --title <title>", { exitCode: 2 });
        if (subcommand === CHECKPOINT && (given["pr"] === true) !== (given["title"] !== undefined)) {
          command.error("error: --pr and --title <title> go together", { exitCode: 2 });
        }
        if (typeof given["title"] === "string" && given["title"].trim() === "") command.error("error: --title takes a title", { exitCode: 2 });
        const paths = (given["paths"] ?? []) as string[];
        if (paths.some((path) => path.trim() === "")) command.error("error: --paths takes no empty path", { exitCode: 2 });
      });
  },

  run(ctx, opts, args): Promise<CommandResult> {
    // Commander's `choices()` already refused every other subcommand at parse time.
    if (args[0] === CHECKPOINT) return runCheckpoint(ctx, opts, CHECKPOINT);
    if (args[0] === END) return runCheckpoint(ctx, opts, END);
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
  // pr/17: a new run starting closes the last one's final question round, which the ask gate reads off this marker.
  if (!ctx.dryRun) removeRunEndedMarker(cwd);
  const current = await currentBranch(cwd);
  const defaults = current === null ? null : await defaultBranches(ctx, cwd);
  const onDefault = defaults !== null && current !== null && defaults.names.includes(current.toLowerCase());

  if (current !== null && !onDefault) {
    const pinned = await pinOrigin(ctx, cwd, run);
    ctx.io.out(`branch: ${sanitizeLabel(current)} (kept: not the default branch)\nbase: ${head}\n${pinned}\n`);
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
  // pr/4: read on the run's branch, so a pin a checkpoint committed there is the one compared, and none is
  // written untracked first, where the switch to a branch that tracks it would refuse to overwrite it.
  // pr/28: a dry run switched nothing, so an existing branch's pin is read from its tree; pr/27: a refusal after a
  // switch names the branch the checkout is left on.
  const pinned = await pinOrigin(ctx, cwd, run, ctx.dryRun ? { rev: existing ?? undefined } : { checkout: runBranch });
  const lines = [`branch: ${runBranch} (${how})`, `base: ${base}`, pinned];
  if (defaults !== null) lines.push(`default branch read from: ${SOURCE_LABEL[defaults.source]}`);
  if (ctx.dryRun) lines.push("Dry run: nothing was switched.");
  ctx.io.out(`${lines.join("\n")}\n`);
  return { exitCode: 0, json: start(run, runBranch, existing === null, base, ctx.dryRun) };
}

/** A GitHub repository as `resolveRepo` names it, and as the origin pin holds it. */
interface OriginRepo {
  host: string;
  owner: string;
  repo: string;
}

/**
 * The one repository `origin` names, as git will use it: its fetch URL (where
 * the pull request goes) and every push URL `git remote get-url --push --all`
 * prints, `pushInsteadOf` and `insteadOf` applied (a `url.<base>.pushInsteadOf`
 * write moves the push with no `remote.*` key, review/209), each matched by
 * `resolveRepo`; else why there is none, for the text.
 */
async function originRepo(ctx: CliContext, cwd: string, verb: string): Promise<OriginRepo | { none: string }> {
  const env: NodeJS.ProcessEnv = { ...ctx.app.runtime.env };
  const fetch = await git(cwd, ["remote", "get-url", "origin"], verb);
  const fetched = fetch.code === 0 ? resolveRepo(env, fetch.stdout.trim()) : null;
  if (fetched === null) return { none: "origin names no GitHub repository gh reaches" };
  const push = await git(cwd, ["remote", "get-url", "--push", "--all", "origin"], verb);
  const urls = push.code === 0 ? push.stdout.split(/\r?\n/).filter((line) => line.trim() !== "") : [];
  if (urls.length === 0) return { none: "git names no push URL for origin" };
  const repo: OriginRepo = { host: fetched.host, owner: fetched.owner, repo: fetched.repo };
  for (const url of urls) {
    const target = resolveRepo(env, url.trim());
    if (target === null) return { none: "a push URL of origin names no GitHub repository gh reaches" };
    if (!sameRepo(repo, target)) return { none: "a push URL of origin names another repository than its fetch URL" };
  }
  return repo;
}

function sameRepo(a: OriginRepo, b: OriginRepo): boolean {
  return a.host === b.host && a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase();
}

function repoName(repo: OriginRepo): string {
  return `${repo.host}/${repo.owner}/${repo.repo}`;
}

/**
 * The run folder's origin pin: `undefined` where there is none, `null` where
 * one is there but is no regular file holding `{ host, owner, repo }` in the
 * names `resolveRepo` accepts (a work-tree file, read as data).
 */
function readOriginPin(cwd: string, pinRel: string): OriginRepo | null | undefined {
  if (!exists(join(cwd, pinRel))) return undefined;
  const read = readCapped(join(cwd, pinRel), ORIGIN_PIN_MAX_BYTES);
  return read === null ? null : parseOriginPin(read.text, read.truncated);
}

/**
 * The origin pin as commit `rev`'s tree holds it (pr/28), what a switch to it
 * would leave in the work tree: `undefined` where the tree has none, `null`
 * where its entry is no regular file holding a pin.
 */
async function readOriginPinAt(cwd: string, rev: string, pinRel: string): Promise<OriginRepo | null | undefined> {
  const listed = await git(cwd, ["ls-tree", "-z", rev, "--", pinRel]);
  if (listed.code !== 0 || listed.stdout === "") return undefined;
  if (!/^100(?:644|755) blob /.test(listed.stdout)) return null;
  const shown = await git(cwd, ["show", `${rev}:./${pinRel}`]);
  if (shown.code !== 0) return null;
  return parseOriginPin(shown.stdout.slice(0, ORIGIN_PIN_MAX_BYTES), shown.stdout.length > ORIGIN_PIN_MAX_BYTES);
}

/** A pin's text read as `{ host, owner, repo }` in the names `resolveRepo` accepts, else `null`. */
function parseOriginPin(text: string, truncated: boolean): OriginRepo | null {
  if (truncated) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { host, owner, repo } = parsed as Record<string, unknown>;
  if (typeof host !== "string" || typeof owner !== "string" || typeof repo !== "string") return null;
  const name = /^[A-Za-z0-9._-]+$/;
  if (!HOST_NAME.test(host) || !name.test(owner) || !name.test(repo)) return null;
  return { host, owner, repo };
}

/**
 * `start`'s pin (review/209): origin's repository to the run folder's
 * `origin.json`, kept where one is there already; the text line it reports.
 * Refuses where a pin is there and origin names another repository, or the pin
 * cannot be read; writes nothing under `--dry-run`. `rev`, a dry run's existing
 * run branch, is read from its tree where it holds a pin (pr/28); `checkout`, the
 * branch `start` switched to, is named in a refusal (pr/27).
 */
async function pinOrigin(ctx: CliContext, cwd: string, run: string, at: { rev?: string | undefined; checkout?: string } = {}): Promise<string> {
  const pinRel = `${ctx.engine.runs.layout.runRelPath(run)}/${ORIGIN_PIN}`;
  const now = await originRepo(ctx, cwd, START);
  const tracked = at.rev === undefined ? undefined : await readOriginPinAt(cwd, at.rev, pinRel);
  // A tree with no pin leaves the work tree's untracked one in place across the switch, so that one is read then.
  const pin = tracked !== undefined ? tracked : readOriginPin(cwd, pinRel);
  if (pin !== undefined) {
    if (pin !== null && !("none" in now) && sameRepo(pin, now)) return `origin: ${repoName(pin)} (pinned in ${pinRel}, kept)`;
    const where = at.checkout === undefined ? "" : `; the checkout is on ${at.checkout} now`;
    throw new CliFailure({
      code: "FAILURE",
      message: "Not done: origin changed",
      why:
        (pin === null
          ? `${pinRel} holds no repository this verb reads, so the run's origin is not proven`
          : `${pinRel} pins ${repoName(pin)}, and ${"none" in now ? now.none : `origin now names ${repoName(now)}`}`) + where,
      next: "point origin back at the repository the run started on; a person decides whether the run goes on",
    });
  }
  if ("none" in now) return `origin: not pinned (${now.none})`;
  if (ctx.dryRun) return `origin: ${repoName(now)} (would be pinned in ${pinRel})`;
  try {
    await ctx.engine.merge.atomicWrite.atomicWriteFile(join(cwd, pinRel), `${JSON.stringify(now)}\n`, { boundaryDir: cwd });
  } catch (cause) {
    throw new CliFailure({
      code: "FAILURE",
      message: `run start could not write ${pinRel}`,
      why: cause instanceof Error ? sanitizeLabel(cause.message) : "the write failed",
      next: "make the run folder writable, then run it again",
    });
  }
  return `origin: ${repoName(now)} (pinned in ${pinRel})`;
}

/**
 * Why `checkpoint` and `end` refuse the run's origin (review/209), or `null`:
 * origin now names another repository than the pin, or no GitHub repository
 * at all; a pin that is there and unreadable; and, unattended, no pin.
 */
async function originRefusal(ctx: CliContext, cwd: string, runDir: string, unattended: boolean, verb: string): Promise<string | null> {
  const pinRel = `${runDir}/${ORIGIN_PIN}`;
  const pin = readOriginPin(cwd, pinRel);
  if (pin === undefined) return unattended ? `origin not pinned: ${pinRel} is missing, so the push's destination is not proven the run's` : null;
  if (pin === null) return `origin not pinned: ${pinRel} holds no repository this verb reads`;
  const now = await originRepo(ctx, cwd, verb);
  if (!("none" in now) && sameRepo(pin, now)) return null;
  return `origin changed: ${pinRel} pins ${repoName(pin)}, and ${"none" in now ? now.none : `origin now names ${repoName(now)}`}`;
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

/** What origin's own refs name, read once a checkpoint from the remote ({@link remoteRefs}). */
interface RemoteRefs {
  /** Every commit origin's branches and tags name, once each: the `--not` set of both history reads (pr/46). */
  tips: string[];
  /** The commit origin's `refs/heads/<branch>` names, or `null` where the remote has no such branch (pr/20). */
  branch: string | null;
}

/**
 * Origin's branches and tags as the remote answers them (`git ls-remote
 * origin`, pr/20, pr/46), never a remote-tracking ref: a deletion or a move on
 * the remote leaves one stale, a run can write one, and an empty or unfetched
 * remote has none. A string, for `notDone`, where the remote could not be read.
 */
async function remoteRefs(top: string, branch: string, verb: string): Promise<RemoteRefs | string> {
  const read = await git(top, ["ls-remote", "origin"], verb);
  if (read.code !== 0) return `git ls-remote origin answered ${read.code}: ${firstLine(read.stderr)}`;
  const tips = new Set<string>();
  let tip: string | null = null;
  for (const row of read.stdout.split(/\r?\n/)) {
    const tab = row.indexOf("\t");
    const sha = row.slice(0, tab);
    const ref = row.slice(tab + 1);
    if (tab === -1 || !/^[0-9a-f]{40,64}$/.test(sha) || !(ref.startsWith("refs/heads/") || ref.startsWith("refs/tags/"))) continue;
    tips.add(sha);
    if (ref === `refs/heads/${branch}`) tip = sha;
  }
  return { tips: [...tips], branch: tip };
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

async function runCheckpoint(ctx: CliContext, opts: Record<string, unknown>, verb: typeof CHECKPOINT | typeof END): Promise<CommandResult> {
  const run = String(opts["run"]);
  checkRunId(ctx, verb, run);
  const { layout, resumeCard } = ctx.engine.runs;
  const cwd = ctx.app.runtime.cwd;
  const runDir = layout.runRelPath(run);
  const recordRel = `${runDir}/${layout.RECORD_FILE}`;
  const record = readCapped(join(cwd, recordRel), layout.RECORD_HEAD_READ_BYTES);
  if (record === null) {
    throw new CliFailure({
      code: "FAILURE",
      message: `run ${verb} found no record at ${recordRel}`,
      why: "the verb reads the record's Mode:, Branch: and Base: before it stages anything",
      next: "run it from the project root, naming the run folder that holds the record",
    });
  }
  const head = resumeCard.readRecordHead(record.text);
  const unattended = readsUnattended(head.mode, ctx.app.runtime.env["STAMITY_UNATTENDED"]);
  const recordBase = head.base;
  const base = recordBase === null ? null : await commitAt(cwd, recordBase, verb);
  if (base === null) {
    throw new CliFailure({
      code: "FAILURE",
      message: recordBase === null ? `run ${verb}: ${recordRel} names no Base:` : `run ${verb}: the record's Base: ${recordBase} names no commit here`,
      why: "the held paths and the secret scan are both read against the commit the run started from",
      next: "write the run's branch point as Base: <commit> in the record's head",
    });
  }

  const result: Checkpoint = { branch: null, base, committed: null, pushed: false, held: [], scan: { hits: [], unscanned: [] }, pr: null, notDone: [] };
  const lines: string[] = [`run: ${run} (${unattended ? "unattended" : "attended"})`, `base: ${base}`];
  const finish = async (passed: boolean, extra: Record<string, unknown> = {}): Promise<CommandResult> => {
    let ok = passed;
    // pr/37: only the run's last `end`, told so by --final-round, writes the marker the ask gate's final round reads;
    // a plain `end` (a chain file the next one follows, or the flag left out) leaves none for a question to pass on.
    if (verb === END && !ctx.dryRun) {
      if (opts["finalRound"] === true) {
        const marked = await markRunEnded(ctx, cwd, run);
        if (marked !== null) result.notDone.push(marked);
      } else {
        const left = dropRunEndedMarker(cwd);
        if (left !== null) {
          result.notDone.push(`run-ended marker not removed: ${RUN_ENDED_MARKER_FILE} (${left}), so a question before the next start could pass`);
          ok = false;
        }
      }
    }
    const notDone = result.notDone.map((entry) => sanitizeLabel(entry));
    result.notDone = notDone;
    ctx.io.out(`${[...lines, ...(notDone.length === 0 ? [] : ["Not done:", ...notDone.map((entry) => `  - ${entry}`)])].join("\n")}\n`);
    return { exitCode: ok ? 0 : 1, json: { subcommand: verb, run, ...result, ...(verb === END ? { inferred: [] } : {}), ...extra } };
  };

  // (1) Never a commit on a default branch, nor on a checkout that is not the run's.
  const current = await currentBranch(cwd, verb);
  const defaults = await defaultBranches(ctx, cwd, verb);
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
        : head.branch === null
          ? `commit refused: ${recordRel} names no Branch:`
          : !matches(head.branch, current)
            ? `branch mismatch: the checkout is on ${current}, and the record's Branch: names ${head.branch}`
            : PUSHABLE_BRANCH.test(current)
              ? null
              : `commit refused: the branch name ${current} holds characters the push check does not read`;
  lines.push(`branch: ${sanitizeLabel(current ?? "(detached HEAD)")}`);
  if (refusal !== null || current === null) {
    result.notDone.push(refusal ?? "commit refused");
    return finish(false);
  }
  // review/209: the push and the pull request go where origin points, so origin must still be the repository the run started on.
  const moved = await originRefusal(ctx, cwd, runDir, unattended, verb);
  if (moved !== null) {
    result.notDone.push(moved);
    return finish(false);
  }

  const top = (await git(cwd, ["rev-parse", "--show-toplevel"], verb)).stdout.replace(/\r?\n$/, "");
  const prefix = (await git(cwd, ["rev-parse", "--show-prefix"], verb)).stdout.replace(/\r?\n$/, "");
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
    if (unattended) {
      const wouldStage = stage.map((path) => ({ path, link: isLink(join(top, path)) }));
      result.held = heldOf([...(await changedSince(top, base)), ...(await changedSince(top, base, "index")), ...wouldStage]);
    }
    lines.push(`would stage: ${list(stage)}`, `would hold: ${list(result.held)}`, "Dry run: nothing was staged, written, committed or pushed.");
    return finish(true, { dryRun: true });
  }
  if (!(await add(top, stage, result.notDone))) return finish(false);

  // (2) Unattended: the person-only paths' change goes to an inert patch, and those paths back to Base: in the index.
  // review/156: the index is read too, since the commit takes it: a held change staged or committed and then
  // undone in the work tree alone is still held.
  if (unattended) {
    const indexSide = await changedSince(top, base, "index");
    const inIndex = heldOf(indexSide);
    const held = heldOf([...(await changedSince(top, base)), ...indexSide]);
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
      // Each path from the side the push would have carried: the index where it changes the path, else the work tree;
      // pr/6: a staged path then edited again also gets the index-to-work-tree part, so the patch applies to the work tree's bytes.
      const scratch = mkdtempSync(join(tmpdir(), "stamity-held-"));
      try {
        const staged = held.filter((path) => inIndex.includes(path));
        const sides: [string[], string[]][] = [
          [["--cached", base], staged],
          [[base], held.filter((path) => !inIndex.includes(path))],
          [[], staged],
        ];
        const written = await Promise.all(
          sides
            .filter(([, paths]) => paths.length > 0)
            .map(async ([side, paths], index) => {
              const out = join(scratch, `${index}-${HELD_PATCH}`);
              return { out, patch: await git(top, ["diff", "--binary", "--full-index", ...DIFF_PINS, `--output=${out}`, ...side, "--", ...paths], verb) };
            }),
        );
        const failed = written.find(({ patch }) => patch.code !== 0);
        if (failed !== undefined) {
          result.notDone.push(`hold failed: git diff answered ${failed.patch.code}: ${firstLine(failed.patch.stderr)}`);
          return finish(false);
        }
        const parts = written.map(({ out }) => readFileSync(out));
        try {
          await ctx.engine.merge.atomicWrite.atomicWriteFile(join(cwd, patchRel), Buffer.concat(parts), { boundaryDir: cwd });
        } catch (cause) {
          result.notDone.push(`hold failed: ${patchRel} could not be written (${cause instanceof Error ? cause.message : "write failed"})`);
          return finish(false);
        }
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
      const restored = await git(top, ["restore", "--staged", `--source=${base}`, "--", ...held], verb);
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

  // pr/46: what origin holds, read from the remote once, before the commit; unread, the push is held.
  const remote = await remoteRefs(top, current, verb);
  if (typeof remote === "string") {
    result.notDone.push(`push held: origin's branches and tags could not be read (${remote})`);
    return finish(false);
  }
  // review/159: the commits the push would send, read before the checkpoint's own, which puts held paths back to Base: only.
  const inHistory = unattended ? await heldInHistory(top, remote.tips) : [];

  // pr/5: the commit takes the whole index, so a path staged before the verb ran and not in its own list refuses it.
  const stray = await strayStaged(top, [...stage, ...patches, ...result.held], named);
  if (stray === null) {
    result.notDone.push("commit failed: git diff --cached could not list the staged paths");
    return finish(false);
  }
  if (stray.length > 0) {
    result.notDone.push(...stray.map((path) => `commit refused: ${path} is staged and not in --paths`));
    return finish(false);
  }

  // (4) The commit, only when something is staged.
  const staged = await git(top, ["diff", "--cached", "--quiet", "--no-ext-diff", "--ignore-submodules=none"], verb);
  if (staged.code === 1) {
    const commit = await git(top, ["commit", "--quiet", `--message=chore(run): checkpoint ${run}`, ...(opts["signoff"] === true ? ["--signoff"] : [])], verb);
    if (commit.code !== 0) {
      const why = `${commit.stderr}\n${commit.stdout}`;
      result.notDone.push(IDENTITY_REFUSAL.test(why) ? "commit failed (identity)" : `commit failed: ${firstLine(why)}`);
      return finish(false);
    }
    result.committed = await commitAt(top, "HEAD", verb);
  } else if (staged.code !== 0) {
    result.notDone.push(`commit failed: git diff --cached answered ${staged.code}: ${firstLine(staged.stderr)}`);
    return finish(false);
  }
  lines.push(`commit: ${result.committed ?? "nothing to commit"}`);

  // review/159, review/156: a held path in a pushed commit, or still changed in HEAD's tree (a hook that staged it
  // again), refuses the push; the verb never rewrites history.
  if (unattended) {
    const atTip = heldOf(await changedSince(top, base, "HEAD")).filter((path) => !inHistory.includes(path));
    result.notDone.push(...inHistory.map((path) => `held path in history (${path})`), ...atTip.map((path) => `held path in the pushed tree (${path})`));
    if (inHistory.length + atTip.length > 0) {
      lines.push("push: refused (a held path would be pushed)");
      return finish(false);
    }
  }

  // (5) The secret scan over what the push sends and no more (build/94, pr/46): a hit, a failure or an unread line holds the push.
  const outcome = scanChange(cwd, base, { scope: "pushed", remoteTips: remote.tips });
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
  // pr/7: an unread code file does not hold the push, but the morning list says the scan did not cover it.
  if (result.scan.unscanned.length > 0) {
    result.notDone.push(`secret scan: ${result.scan.unscanned.length} files unscanned (${result.scan.unscanned.join(", ")})`);
  }
  lines.push(`scan: ${result.scan.hits.length === 0 ? "no hits" : `${result.scan.hits.length} hit(s)`}; unscanned: ${list(result.scan.unscanned)}`);
  if (result.scan.hits.length > 0 || outcome.incomplete !== undefined) return finish(false);

  // (6) The push, its command checked by the shell guard's own table before it runs.
  const refspec = `HEAD:refs/heads/${current}`;
  const tip = await commitAt(top, "HEAD", verb);
  if (tip !== null && tip === remote.branch) {
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
    const pushed = await git(top, ["push", "--quiet", "origin", refspec], verb);
    if (pushed.code !== 0) {
      result.notDone.push(pushFailure(pushed));
      return finish(false);
    }
    result.pushed = true;
    lines.push(`push: origin ${refspec}`);
  }

  // (7) The draft pull request: `end` opens it every time, `checkpoint` only with --pr.
  if (verb !== END && opts["pr"] !== true) return finish(true);
  // --refused names the title before the screen reads it, so a hit still gives `Run <run-id>`.
  const title = verb === END && opts["refused"] === true ? `Refused: ${String(opts["title"])}` : String(opts["title"]);
  const step = await draftPr(ctx, { run, runDir, recordRel, top, cwd, base, branch: current, defaults, unattended, resumes: head.resumes, title });
  result.pr = step.pr;
  result.notDone.push(...step.notDone);
  // review/165: an open pull request keeps its own title, since the step sends only a body to one.
  if (verb === END && opts["refused"] === true && step.pr !== null && (step.pr.how === "existing" || step.pr.how === "commented")) {
    result.notDone.push(`title not changed: pull request #${step.pr.number} was already open, so it keeps its own title, not the Refused: one`);
  }
  lines.push(`pr: ${step.pr === null ? "not opened" : `#${step.pr.number} ${step.pr.url} (${step.pr.how})`}`);
  return finish(step.pr !== null, { inferred: step.inferred });
}

/** The pins every diff here takes against config: no external diff, colour, textconv or rename pairing, top-level names. */
const DIFF_PINS: readonly string[] = ["--no-color", "--no-ext-diff", "--no-textconv", "--no-renames", "--no-relative", "--ignore-submodules=none"];

/** What `changedSince` compares with `base`: the work tree, the index, or `HEAD`'s tree. */
type Side = "work tree" | "index" | "HEAD";

const SIDE_ARGS: Readonly<Record<Side, (base: string) => string[]>> = {
  "work tree": (base) => [base],
  index: (base) => ["--cached", base],
  HEAD: (base) => [base, "HEAD"],
};

/** One changed path, and whether its new side is a symbolic link (mode `120000`). */
interface Changed {
  path: string;
  link: boolean;
}

/** Git's mode for a symbolic link. */
const LINK_MODE = "120000";

/**
 * The paths of `git diff --raw -z` or `git log --raw -z` output, each with
 * whether its new side is a link: one `:<modes> <ids> <status>` field (`::…`
 * for a merge's combined form, the result's mode last among the modes), then
 * the path. Renames are pinned off, so one path follows each field.
 */
function rawEntries(stdout: string): Changed[] {
  const fields = stdout.split("\0");
  const entries: Changed[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = (fields[index] ?? "").replace(/^\n+/, "");
    if (!field.startsWith(":")) continue;
    const path = fields[index + 1] ?? "";
    index += 1;
    if (path === "") continue;
    const modes = field.replace(/^:+/, "").split(" ").filter((part) => /^[0-7]{6}$/.test(part));
    entries.push({ path, link: modes.at(-1) === LINK_MODE });
  }
  return entries;
}

/**
 * The directory prefixes of the person-only globs (review/200): each glob's
 * leading segments short of the whole, a prefix of `**` alone left out. A link
 * at one (`.claude`, `.github/workflows`, `x/.vscode`) puts a folder of its
 * choosing where a held glob reads.
 */
const HELD_PREFIXES: readonly string[] = [
  ...new Set(
    PERSON_ONLY_PATHS.flatMap((glob) => {
      const segments = glob.split("/");
      return segments
        .slice(1)
        .map((_, end) => segments.slice(0, end + 1))
        .filter((prefix) => prefix.some((segment) => segment !== "**"))
        .map((prefix) => prefix.join("/"));
    }),
  ),
];

/** Whether a link at `path` is held: at a held glob's directory prefix (its own match is {@link heldPaths}'). */
function heldLink(path: string): boolean {
  return HELD_PREFIXES.some((prefix) => matchGlob(path, prefix, { foldCase: true }));
}

/** The held paths of `entries`, sorted and once each: a person-only path, or a link at a held glob's prefix. */
function heldOf(entries: readonly Changed[]): string[] {
  const paths = [...new Set(entries.map((entry) => entry.path))];
  const links = new Set(entries.filter((entry) => entry.link).map((entry) => entry.path));
  const byGlob = new Set(heldPaths(paths));
  return paths.filter((path) => byGlob.has(path) || (links.has(path) && heldLink(path))).toSorted();
}

/** The top-level-relative paths `side` changes against `base`, committed changes included, each with its new mode's link reading. */
async function changedSince(top: string, base: string, side: Side = "work tree"): Promise<Changed[]> {
  const read = await git(top, ["diff", "--raw", "-z", ...DIFF_PINS, ...SIDE_ARGS[side](base), "--"], CHECKPOINT);
  if (read.code !== 0) {
    throw new CliFailure({
      code: "FAILURE",
      message: `run checkpoint could not list the ${side}'s change against the record's Base:`,
      why: `git diff answered ${read.code}: ${firstLine(read.stderr)}`,
      next: "run it inside the repository's work tree",
    });
  }
  return rawEntries(read.stdout);
}

/**
 * The person-only paths a commit the push would send changes (review/159):
 * every commit none of `tips` reaches (`HEAD --not <tips>`, as the scan reads
 * them, review/160, build/108, pr/46), the tips being origin's branches and
 * tags as the remote answers ({@link remoteRefs}), `--ignore-missing` for one
 * this clone lacks, and all of `HEAD`'s history when the remote names none; a
 * root commit included and a merge by its own resolution (`--cc`), renames
 * read as a deletion and an addition, a link at a held glob's prefix included
 * (review/200).
 */
async function heldInHistory(top: string, tips: readonly string[]): Promise<string[]> {
  const range = ["--ignore-missing", "HEAD", ...(tips.length === 0 ? [] : ["--not", ...tips])];
  const read = await git(top, ["log", "--root", "--format=", "--raw", "-z", "--cc", ...DIFF_PINS, ...range, "--"], CHECKPOINT);
  if (read.code !== 0) {
    throw new CliFailure({
      code: "FAILURE",
      message: "run checkpoint could not list the paths the commits it would push change",
      why: `git log answered ${read.code}: ${firstLine(read.stderr)}`,
      next: "run it inside the repository's work tree",
    });
  }
  return heldOf(rawEntries(read.stdout));
}

/**
 * Whether the run is unattended as the shell guard reads it: `Mode:
 * unattended`, or no `Mode:` line while `STAMITY_UNATTENDED` is set (not
 * empty, `false` or `0`); `Mode: attended` wins over the variable (review/162).
 */
function readsUnattended(mode: "attended" | "unattended" | null, flag: string | undefined): boolean {
  if (mode !== null) return mode === "unattended";
  return !["", "false", "0"].includes((flag ?? "").trim().toLowerCase());
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
 * The staged paths (the index against `HEAD`, what the commit takes) that are
 * neither one of `own` (the run files, the inbox, `--paths`, the held patches,
 * the held paths) nor under a `--paths` folder (pr/5); `null` when git could
 * not list them.
 */
async function strayStaged(top: string, own: readonly string[], named: readonly string[]): Promise<string[] | null> {
  const read = await git(top, ["diff", "--cached", "--name-only", "-z", ...DIFF_PINS, "HEAD", "--"], CHECKPOINT);
  if (read.code !== 0) return null;
  const exact = new Set(own);
  const folders = named.map((path) => `${path.replace(/\/+$/, "")}/`);
  return read.stdout
    .split("\0")
    .filter((path) => path !== "" && !exact.has(path) && !folders.some((folder) => path.startsWith(folder)))
    .toSorted();
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
  /** The record head's `Resumes:` value, as read; only an attended record's is used. */
  resumes: string | null;
  title: string;
}

/** The morning list a pull request body is made from: its run, and the base its prerequisites are read against. */
interface ListSource {
  run: string;
  base: string;
}

/**
 * The run's draft pull request (u19's step, shared by `run checkpoint --pr`):
 * on the repository `resolveRepo` matches on `origin`, against the default
 * branch read above. Unattended, the body is `prBodyFrom` over `morning.md`
 * with the prerequisites the change's added lines imply, after
 * `screenOutbound`; a hit, or no morning list, puts a fixed body in its
 * place. Attended, no morning list is written, so the body is a fixed one
 * naming the run and its record, except on the morning walk (review/164): an
 * attended record reading `Resumes: <run-id>`, a run id whose folder is under
 * `.stamity/runs/`, takes the body from that run's `morning.md` as the walk
 * left it, under that run's marker and through the same screen, so the open
 * pull request's body is replaced, not commented on; a `Resumes:` that names
 * no such run, or a list that cannot be read, keeps the fixed body, with a
 * `notDone` entry. The title passes the screen too, a hit replacing it with
 * `Run <run-id>`.
 */
async function draftPr(ctx: CliContext, at: PrInputs): Promise<PrStep> {
  const env: NodeJS.ProcessEnv = { ...ctx.app.runtime.env };
  const origin = await git(at.top, ["remote", "get-url", "origin"], CHECKPOINT);
  const repo = origin.code === 0 ? resolveRepo(env, origin.stdout.trim()) : null;
  if (repo === null) return { pr: null, inferred: [], notDone: ["draft PR not opened (origin names no GitHub repository gh reaches)"] };
  const target = at.defaults.named;
  if (target === undefined) return { pr: null, inferred: [], notDone: ["draft PR not opened (no default branch was read to target)"] };

  const notDone: string[] = [];
  // review/157: the title is screened as it posts, after the clean-up, so a character it drops cannot split a token past the screen.
  const cleanTitle = sanitizeLabel(at.title);
  const title = screenOutbound(cleanTitle, "pr-title").ok ? cleanTitle : `Run ${at.run}`;
  let inferred: PrereqRow[] = [];
  let body = `Run \`${at.run}\`, attended. Its record: \`${at.recordRel}\`.`;
  let marked = at.run;
  const source = at.unattended ? { run: at.run, base: at.base } : await resumedList(ctx, at, notDone);
  if (source !== null) {
    const morningRel = `${ctx.engine.runs.layout.runRelPath(source.run)}/${MORNING_FILE}`;
    const morning = readCapped(join(at.cwd, morningRel), MORNING_READ_MAX_BYTES);
    if (morning === null || morning.truncated) {
      const why = morning === null ? "missing" : `not posted (over ${MORNING_READ_MAX_BYTES} bytes)`;
      if (at.unattended) {
        notDone.push(morning === null ? "morning list missing" : `morning list ${why}`);
        body = `Run \`${at.run}\`: no morning list was posted. Its record: \`${at.recordRel}\`.`;
      } else {
        notDone.push(`pull request body not refreshed: the morning list of ${source.run} is ${why}`);
      }
    } else {
      marked = source.run;
      inferred = inferredFrom(at.top, source.base);
      const made = prBodyFrom(morning.text, source.run, { inferred });
      const screen = screenOutbound(made, "pr-body");
      body = made;
      if (!screen.ok) {
        const where = screen.hits.map((hit) => `line ${hit.line} (${hit.rule})`).join(", ");
        notDone.push(`pull request body replaced: the outbound screen matched ${where}`);
        body = `Run \`${source.run}\`: the body made from \`${morningRel}\` was not posted, because the outbound screen matched its ${where}. Read the morning list on the branch.`;
      }
    }
  }
  const gh = (request: Parameters<typeof ghApi>[0]) => ghApi(request, { cwd: at.top, env });
  const outcome: PrOutcome = await ensureDraftPr(gh, { host: repo.host, owner: repo.owner, repo: repo.repo, head: at.branch, base: target, title, body, runId: marked });
  if ("notDone" in outcome) return { pr: null, inferred, notDone: [...notDone, outcome.notDone] };
  return { pr: { number: outcome.number, url: outcome.url, how: outcome.how }, inferred, notDone };
}

/**
 * The run an attended record's `Resumes:` names, for the morning walk's body
 * (review/164): a run id whose folder is a directory under `.stamity/runs/`,
 * never through a link, and the base its prerequisites are read against, that
 * run's own `Base:` so the body names what the whole pull request implies (the
 * walk's `Base:` where that one names no commit here, said in `notDone`).
 * `null` with no `Resumes:`, and with a `notDone` entry where it names no such
 * run; the value itself is never echoed, since it may be any text.
 */
async function resumedList(ctx: CliContext, at: PrInputs, notDone: string[]): Promise<ListSource | null> {
  if (at.resumes === null) return null;
  const { layout, resumeCard } = ctx.engine.runs;
  if (!layout.isRunId(at.resumes)) {
    notDone.push("pull request body not refreshed: the record's Resumes: names no run id");
    return null;
  }
  const dir = layout.runRelPath(at.resumes);
  if (!isDirectory(join(at.cwd, dir))) {
    notDone.push(`pull request body not refreshed: Resumes: names ${at.resumes}, and ${dir} is no run folder here`);
    return null;
  }
  const record = readCapped(join(at.cwd, dir, layout.RECORD_FILE), layout.RECORD_HEAD_READ_BYTES);
  const named = record === null ? null : resumeCard.readRecordHead(record.text).base;
  const base = named === null ? null : await commitAt(at.top, named, CHECKPOINT);
  if (base === null) notDone.push(`prerequisites read since this run's Base: only: ${dir}/${layout.RECORD_FILE} names no Base: that is a commit here`);
  return { run: at.resumes, base: base ?? at.base };
}

/**
 * The prerequisites the pushed change's added lines imply, `HEAD`'s tree
 * against `base` (review/161): a line only the work tree or an untracked file
 * holds is not in the pull request; none where the lines cannot be read.
 */
function inferredFrom(top: string, base: string): PrereqRow[] {
  try {
    const runner = gitCheckRunner({ timeoutMs: 60_000, maxBuffer: 64 * 1024 * 1024 });
    return inferPrerequisites(readPushed(runner, { dir: top, prefix: "", topLevel: top }, base, process.platform === "win32").files);
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

function isDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
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

/**
 * `end --final-round`'s run-ended marker (pr/17, pr/36, REQ-FLOW-090): `{ "run": "<run-id>", "at": "<ISO time>" }`
 * at {@link RUN_ENDED_MARKER_FILE}, never through a link, `at` read as the verb exits, so the ask gate's window
 * opens after the push and the pull request; `null` once written, else the `notDone` line. A marker not written only
 * refuses the final round's question, so the exit stays as the run's own steps set it.
 */
async function markRunEnded(ctx: CliContext, cwd: string, run: string): Promise<string | null> {
  try {
    const at = ctx.app.runtime.clock.now().toISOString();
    await ctx.engine.merge.atomicWrite.atomicWriteFile(join(cwd, RUN_ENDED_MARKER_FILE), `${JSON.stringify({ run, at })}\n`, { boundaryDir: cwd });
    return null;
  } catch (cause) {
    return `run-ended marker not written: ${RUN_ENDED_MARKER_FILE} (${cause instanceof Error ? cause.message : "write failed"}), so the final round's question is refused`;
  }
}

/**
 * `start` removes the run-ended marker an earlier `end` wrote (pr/17): the
 * link itself where one is there, never its target; a marker that cannot be
 * removed fails the verb, since it would keep the earlier run's final round open.
 */
function removeRunEndedMarker(cwd: string): void {
  const left = dropRunEndedMarker(cwd);
  if (left === null) return;
  throw new CliFailure({
    code: "FAILURE",
    message: `run start could not remove ${RUN_ENDED_MARKER_FILE}`,
    why: sanitizeLabel(left),
    next: `remove ${RUN_ENDED_MARKER_FILE} by hand, then run it again`,
  });
}

/** Removes the run-ended marker, the link itself where one is there; `null` once gone, else why it is still there. */
function dropRunEndedMarker(cwd: string): string | null {
  const marker = join(cwd, RUN_ENDED_MARKER_FILE);
  if (!exists(marker)) return null;
  try {
    unlinkSync(marker);
    return null;
  } catch (cause) {
    return cause instanceof Error ? cause.message : "the remove failed";
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
