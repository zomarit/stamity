import { closeSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readlinkSync, readSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { Argument, InvalidArgumentError, Option, type Command } from "commander";
import { matchGlob } from "../../change/classify.ts";
import { fromProjectRoot, heldPaths, PERSON_ONLY_PATHS } from "../../change/personOnlyPaths.ts";
import { personOnlyVerdict } from "../../hooks/personOnly.ts";
import { RUN_ENDED_MARKER_FILE } from "../../mcp/env.ts";
import { checkSurfaceRecord, type RecordFileReads, type RecordUse, type SurfaceCheck } from "../../runs/gitSurface.ts";
import { hookPathsAt, setupRootOf, setupRootsAt, type HookScratch } from "../../runs/hookPaths.ts";
import { blastRadiusSection, MORNING_FILE, prBodyFrom, screenOutbound, withBlastRadius } from "../../runs/morning.ts";
import { inferPrerequisites, type PrereqRow } from "../../runs/prerequisites.ts";
import { ensureDraftPr, HOST_NAME, PR_RECORD_FILE, prRecordText, resolveRepo, type PrOutcome } from "../../runs/pullRequest.ts";
import { parseGitDefaultBranch } from "../../workspace/git.ts";
import { ghApi } from "../engine/ghRunner.ts";
import { gitCheckRunner, revisionLines } from "../engine/gitStatus.ts";
import { GitWriteGroupStopped, gitProgramVariablesIn, gitWrite, type GitWriteResult } from "../engine/gitWrite.ts";
import { CliFailure } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";
import { gitSurfaceRecordPath, readPushed, readRunGitSurface, scanChange } from "./gate.ts";
import { runLand } from "./runLand.ts";

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
 * that does out, never recreating it. Where only `refs/remotes/origin/stamity/<run-id>`
 * names a commit (a run continued on a fresh clone, v21), the branch is created
 * at that tip instead, once `git ls-remote origin` names the same tip for the
 * branch (n14: a branch origin no longer has, another tip there, or a remote
 * it cannot read refuses, in either mode) and the run's record there names a
 * `Base:` the tip descends from; a tip that does not, or carries no record,
 * refuses. Any other branch, a platform's own
 * (`claude/…`, `cursor/…`, `copilot/…`) included, is kept. Uncommitted work
 * rides the switch, as `git switch` carries it; a switch git refuses (a local
 * change the target would overwrite) fails the verb and leaves the checkout
 * where it was.
 *
 * **The default branch** is read from GitHub's REST API (`default_branch` of
 * `repos/<owner>/<repo>`, the repository `resolveRepo` matches on `origin`,
 * every call naming the host it matched on); where that read gives no answer
 * (no `origin`, a host `gh` does not talk to, no `gh`, no login, any status
 * but 200), from `refs/remotes/origin/HEAD`. The first source that answers
 * decides, and `main` and `master` always count as default beside it, alone
 * where neither names one (`withFallbacks`). Where REST named it, `start`, `checkpoint` and `end` point
 * `refs/remotes/origin/HEAD`, the shell guard's only source, at
 * `refs/remotes/origin/<named>` when it is absent or names another branch,
 * said in the text and skipped under `--dry-run` (pr/55). Unattended, all
 * three refuse where only the `main`/`master` fallback answered: `start` (its
 * record's `Mode:` where the work tree holds one, else the one the run's branch
 * carries, `refs/heads/stamity/<run-id>` then origin's, else the variable; n14)
 * exits 1, and `checkpoint` and `end` refuse the commit after the origin check,
 * before they stage. That one reading also sets `start`'s git hardening.
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
 * commit to base the run on, origin changed, origin's run branch refused (gone
 * or moved on origin, origin unread, no record, or not from its `Base:`), or a
 * git call that failed; 2 a usage error, no
 * `--run` among them. The JSON is `{ subcommand, run, branch, created, base }`,
 * `base` the full commit id at `HEAD` once the run is on its branch, for the
 * record's `Base:`; `dryRun: true` joins it under `--dry-run`, which switches
 * nothing and reports what the run would land on. Unattended, `gitEnvRemoved`
 * joins it where git's program-valued variables were removed from git's
 * environment: their names, never their values (REQ-FLOW-122, review/17).
 *
 * **`checkpoint`** reads the run's record head (`Mode:`, `Branch:`, `Base:`)
 * and, in this order: refuses a commit on a default branch (and on a checkout
 * that is not the record's `Branch:`, as `branch mismatch`, or a detached one; a
 * `Branch:` naming a default branch matches `stamity/<run-id>`, the branch
 * `start` switches such a run to; a record with no `Branch:` line at column 0
 * refuses as `commit refused: <record> names no Branch:`, pr/47); refuses as `origin changed` where origin's
 * fetch URL or any push URL git resolves now names another repository than `origin.json` pins (and, unattended, where
 * no pin is readable, as `origin not pinned`); unattended, refuses as `config changed`, `configuration unreadable` or
 * `no pre-flight record` where git's configuration and environment are not the ones `gate preflight --unattended`
 * recorded (REQ-FLOW-131, review/97, `../../runs/gitSurface.ts`), read once here and again after the commit, just
 * before the push, a refused pre-flight's record taken by `end --refused` alone (review/33), which then refuses
 * `--paths` and any path but the run folder's and the inbox that a commit the push would send (read from origin's
 * tips, never from `Base:`) or the index changes, as
 * `refused ending carries only the run's records: …` (review/50); stages
 * only the run folder's record, ledger, plan, morning list, origin pin and `held/*.patch`,
 * `.stamity/inbox.md` and `--paths` (never `-A`, never `-f`), a path git
 * ignores reported as `records: not committed (…)`; in an unattended run
 * (`Mode: unattended`, or no `Mode:` line with `STAMITY_UNATTENDED` set, as
 * the shell guard reads it) writes the work tree's and the index's change
 * against `Base:` under the person-only paths to `held/person-only.patch` and
 * restores those paths to `Base:` in the index only, after the staging, so a
 * `--paths` entry naming one is held too, and a symbolic link the change adds
 * or retypes at a held path or at a held glob's directory prefix (`.claude`,
 * `.github/workflows`, any `.vscode`) is held the same way (review/200), and a
 * patch an earlier checkpoint committed is kept, its paths listed as held, while
 * the work tree holds no held change (review/6), and where it does, that patch's
 * sections for paths not held now are kept in order before the new ones, their
 * paths listed as held, a path held again taking the current diff (n14); refuses
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
 * `subcommand: "end"`, `inferred` always present. Both carry `start`'s
 * `gitEnvRemoved` the same way, absent where none was removed.
 *
 * **The run-ended marker** (pr/17, pr/36, pr/37): `end --final-round`, the
 * run's last `end`, writes `{ "run": "<run-id>", "at": "<ISO time>" }` to
 * `.stamity/run-ended.json` at every exit past the record's read, `--dry-run`
 * aside, and `start` deletes it first; the ask gate allows the final question
 * round only on the branch of the closed run it names, and only for the
 * marker's 15 minutes after `at` (`RUN_ENDED_MAX_AGE_MS`, `../../mcp/env.ts`). A plain `end` (a chain file the next one
 * follows, or a flag left out) writes none and removes one already there, so no
 * question passes between two chain files; one it cannot remove makes the exit 1,
 * its `notDone` line naming it.
 *
 * **`land`** (REQ-FLOW-132, REQ-FLOW-133) merges the run's own pull request, or fast-forwards the default branch to
 * its head, when the evidence holds, else asks or refuses; its body is `./runLand.ts`, registered here only.
 */

const START = "start";
const CHECKPOINT = "checkpoint";
const END = "end";
const LAND = "land";

/** Every option beyond `--run`, by its key in commander's parsed options. */
const OPTION_FLAGS: Readonly<Record<string, string>> = {
  paths: "--paths",
  pr: "--pr",
  title: "--title",
  signoff: "--signoff",
  refused: "--refused",
  finalRound: "--final-round",
  dropHeld: "--drop-held",
  fastForward: "--fast-forward",
  method: "--method",
  ready: "--ready",
  wait: "--wait",
  approved: "--approved",
};

/** The options each subcommand takes beyond `--run`; any other one given is a usage error. */
const SUBCOMMAND_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  [START]: [],
  [CHECKPOINT]: ["paths", "pr", "title", "signoff", "dropHeld"],
  // No --pr: the pull request is not optional at the end.
  [END]: ["paths", "title", "refused", "signoff", "finalRound", "dropHeld"],
  // No --paths and no --title: land stages and titles nothing.
  [LAND]: ["fastForward", "method", "ready", "wait", "approved"],
};

/** `--wait`'s most minutes: under a client's ten-minute shell-call limit (decision D17). */
const LAND_WAIT_MAX = 9;

/** review/110: `--approved <sha>`: the full 40-character head commit the person approved, as the asks outcome printed it. */
function parseApproved(value: string): string {
  if (!/^[0-9a-fA-F]{40}$/.test(value)) throw new InvalidArgumentError("--approved takes the full 40-character commit the person approved.");
  return value.toLowerCase();
}

/** `--wait <minutes>`: a whole number from 0 to {@link LAND_WAIT_MAX}. */
function parseWait(value: string): number {
  const minutes = /^[0-9]+$/.test(value) ? Number(value) : Number.NaN;
  if (!(minutes >= 0 && minutes <= LAND_WAIT_MAX)) throw new InvalidArgumentError(`--wait takes whole minutes from 0 to ${LAND_WAIT_MAX}.`);
  return minutes;
}

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
/** The most of a run record read for its `## Blast radius` section; a larger record's section is not posted. */
const RECORD_READ_MAX_BYTES = 4_194_304;

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
      .addArgument(new Argument("<subcommand>", "which run action to run").choices([START, CHECKPOINT, END, LAND]))
      .option("--run <run-id>", "the run folder's name under .stamity/runs/", parseRun)
      .option("--paths <path...>", "checkpoint and end: also stage these paths, relative to the project root")
      .option("--pr", "checkpoint: open or update the run's draft pull request after the push (with --title)")
      .option("--title <title>", "checkpoint and end: the draft pull request's title (end needs it)")
      .option("--signoff", "checkpoint and end: add the Signed-off-by line to the commit")
      .option("--refused", "end: title the draft pull request Refused: <title>, for a run that refused to start")
      .option("--final-round", "end: the run's last end; write the run-ended marker the final question round needs (a plain end removes one)")
      .option("--drop-held <path...>", "checkpoint and end: withdraw the held patch's sections for these paths, which the run undid (one it still changes stays held)")
      .option("--fast-forward", "land: fast-forward the default branch to the pull request's head instead of merging it")
      .addOption(new Option("--method <method>", "land: the merge method").choices(["merge", "squash", "rebase"]))
      .option("--ready", "land: mark the run's draft ready for review once the evidence holds, then land it")
      .option("--wait <minutes>", `land: wait up to this many minutes (at most ${LAND_WAIT_MAX}) for pending check runs`, parseWait)
      .option("--approved <sha>", "land: the head commit the person approved over an asks outcome; land it if the head is still that commit and nothing refuses (never in an unattended run)", parseApproved)
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
        const dropped = (given["dropHeld"] ?? []) as string[];
        if (dropped.some((path) => path.trim() === "")) command.error("error: --drop-held takes no empty path", { exitCode: 2 });
        if (given["fastForward"] === true && given["method"] !== undefined) command.error("error: --method does not apply to --fast-forward", { exitCode: 2 });
      });
  },

  run(ctx, opts, args): Promise<CommandResult> {
    // Commander's `choices()` already refused every other subcommand at parse time.
    if (args[0] === CHECKPOINT) return runCheckpoint(ctx, opts, CHECKPOINT);
    if (args[0] === END) return runCheckpoint(ctx, opts, END);
    if (args[0] === LAND) return runLand(ctx, opts);
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
  // n14 (P1): the mode is decided once, before any other git call, and sets both the hardening and the refusal below.
  const unattended = await startsUnattended(ctx, run, runBranch);
  const removed = startVerbGit(unattended);

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
  // pr/55: unattended, main and master alone would let a run keep, and push, a default branch of another name.
  if (defaults !== null && defaults.source === "fallback" && unattended) {
    throw new CliFailure({
      code: "FAILURE",
      message: `run start refused: ${FALLBACK_REFUSAL}`,
      why: "an unattended run must not stay on, or push, a default branch neither source names",
      next: "log gh in for origin's host, or have a person run git remote set-head origin -a, then run it again",
    });
  }
  const originHead = defaults === null ? null : await alignOriginHead(ctx, cwd, defaults);
  const onDefault = defaults !== null && current !== null && defaults.names.includes(current.toLowerCase());

  if (current !== null && !onDefault) {
    const pinned = await pinOrigin(ctx, cwd, run);
    const kept = [`branch: ${sanitizeLabel(current)} (kept: not the default branch)`, `base: ${head}`, ...removedLine(removed), pinned, ...(originHead === null ? [] : [originHead])];
    ctx.io.out(`${kept.join("\n")}\n`);
    return { exitCode: 0, json: start(run, current, false, head, ctx.dryRun, removed) };
  }

  const existing = await commitAt(cwd, `refs/heads/${runBranch}`);
  // v21: a continuation on another machine, the run's branch only origin's, starts at origin's tip, so the next push
  // fast-forwards; refused where that tip does not carry the run's record or does not descend from its Base:.
  const remoteTip = existing === null ? await originRunTip(ctx, cwd, run, runBranch) : null;
  const from = current === null ? "a detached HEAD" : `${sanitizeLabel(current)}, the default branch`;
  const how =
    existing !== null ? `checked out from ${from}; it already existed` : remoteTip !== null ? `created from origin's ${runBranch}` : `created from ${from}`;
  if (!ctx.dryRun) {
    const create = ["switch", "--quiet", "--create", runBranch, ...(remoteTip === null ? [] : [remoteTip])];
    const switched = await git(cwd, existing === null ? create : ["switch", "--quiet", runBranch]);
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
  const base = ctx.dryRun ? (existing ?? remoteTip ?? head) : await commitAt(cwd, "HEAD");
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
  const pinned = await pinOrigin(ctx, cwd, run, ctx.dryRun ? { rev: existing ?? remoteTip ?? undefined } : { checkout: runBranch });
  const lines = [`branch: ${runBranch} (${how})`, `base: ${base}`, ...removedLine(removed), pinned];
  if (defaults !== null) lines.push(`default branch read from: ${SOURCE_LABEL[defaults.source]}`);
  if (originHead !== null) lines.push(originHead);
  if (ctx.dryRun) lines.push("Dry run: nothing was switched.");
  ctx.io.out(`${lines.join("\n")}\n`);
  return { exitCode: 0, json: start(run, runBranch, existing === null, base, ctx.dryRun, removed) };
}

/**
 * v21: the commit `refs/remotes/origin/<runBranch>` names, for a run continued on a machine whose clone has the run's
 * branch only as origin's; `null` where that ref names no commit (a clone that never fetched it among them), so the
 * run starts as before. n14 (P2): that ref is used only where origin itself names the same commit for the branch
 * ({@link remoteRefs}), since a branch deleted or moved on the server leaves it stale; a branch origin no longer
 * has, another tip there, or a remote that cannot be read refuses, in either mode. The run's record at that tip, a
 * regular file, must name a `Base:` that is a commit here and that the tip descends from; anything else refuses,
 * naming the tip, before anything is switched.
 */
async function originRunTip(ctx: CliContext, cwd: string, run: string, runBranch: string): Promise<string | null> {
  const { layout, resumeCard } = ctx.engine.runs;
  const tracking = `refs/remotes/origin/${runBranch}`;
  const tip = await commitAt(cwd, tracking);
  if (tip === null) return null;
  const remote = await remoteRefs(cwd, runBranch, START);
  if (typeof remote === "string") {
    throw new CliFailure({
      code: "FAILURE",
      message: `run start refused: origin's ${runBranch} could not be read from origin (${remote})`,
      why: `${tracking} names ${tip}, and only origin shows whether the branch is still there at that commit`,
      next: "make origin readable (its URL, the network, the login), then run it again",
    });
  }
  if (remote.branch === null) {
    throw new CliFailure({
      code: "FAILURE",
      message: `run start refused: ${tracking} names ${tip}, and origin no longer has ${runBranch}`,
      why: "the remote-tracking ref is stale: a branch deleted on origin would be created again from it and pushed back",
      next: `a person reads why origin's ${runBranch} is gone; git fetch --prune origin drops the stale ref, and the run then starts again`,
    });
  }
  if (remote.branch !== tip) {
    throw new CliFailure({
      code: "FAILURE",
      message: `run start refused: origin's ${runBranch} is at ${remote.branch}, not at the ${tip} ${tracking} names`,
      why: "the run would start from a tip origin has moved off, and its next push would not land on origin's branch",
      next: "fetch origin first (git fetch origin), then run it again",
    });
  }
  const recordRel = `${layout.runRelPath(run)}/${layout.RECORD_FILE}`;
  // review/4: a refusal read off history names a deeper fetch on a shallow clone, whose cut history reads as a rewrite.
  const refuse = async (why: string, history = false): Promise<CliFailure> => {
    const shallow = history && (await git(cwd, ["rev-parse", "--is-shallow-repository"])).stdout.trim() === "true";
    return new CliFailure({
      code: "FAILURE",
      message: `run start refused: origin's ${runBranch} at ${tip} ${why}`,
      why: "a run continued from origin's branch must carry its record and descend from the commit the run started from",
      next: shallow
        ? "this clone is shallow, so the history between the two may be cut off: fetch it whole (git fetch --unshallow origin), then run it again; if it still refuses, a person reads origin's branch"
        : "a person reads origin's branch; the run starts again once it holds the run's record on a history from its Base:",
    });
  };
  const record = await recordHeadAt(ctx, cwd, tip, recordRel);
  if (record === null) throw await refuse(`carries no run record at ${recordRel}`);
  const recordBase = resumeCard.readRecordHead(record).base;
  if (recordBase === null) throw await refuse("carries a run record that names no Base:");
  const base = await commitAt(cwd, recordBase);
  if (base === null) throw await refuse(`carries a run record whose Base: ${recordBase} names no commit here`, true);
  const descends = await git(cwd, ["merge-base", "--is-ancestor", base, tip]);
  if (descends.code === 1) throw await refuse(`does not descend from its record's Base: ${base}`, true);
  if (descends.code !== 0) throw await refuse(`could not be read against its record's Base: ${base} (git merge-base answered ${descends.code}: ${firstLine(descends.stderr)})`, true);
  return tip;
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

/** The record check's file reads (review/34): the kind by `lstat`, never through a link, and {@link readCapped}. */
const RECORD_READS: RecordFileReads = {
  kind: (path) => {
    try {
      return lstatSync(path).isFile() ? "file" : "other";
    } catch {
      return "missing";
    }
  },
  read: readCapped,
};

/**
 * review/97, review/34 (REQ-FLOW-131): whether an unattended `checkpoint` or `end` takes git's surface, by the
 * module's one record check (`../../runs/gitSurface.ts` `checkSurfaceRecord`). `use` is `refused-end` for
 * `end --refused` alone, which takes a refused pre-flight's record (review/33) and then carries the run's records
 * alone (review/50, {@link refusedEndingStray}).
 */
async function surfaceCheck(cwd: string, use: RecordUse): Promise<SurfaceCheck> {
  return checkSurfaceRecord(await gitSurfaceRecordPath(cwd), RECORD_READS, () => readRunGitSurface(cwd), use);
}

/** review/50: the line every refusal of a refused pre-flight's ending begins with. */
const REFUSED_ENDING = "refused ending carries only the run's records";

/**
 * review/50: why `end --refused` under a refused pre-flight's record would carry more than the run's records, or
 * `null`. The ending may stage the run folder's files and the inbox alone, so `--paths` refuses, and so does any
 * other path that a commit the push would send ({@link pushedChanges}, from origin's `tips`) or the index (against
 * `HEAD`) changes, each named. The record's `Base:` plays no part: the run folder holds it, so this ending could move
 * it. `top`-relative paths; `ownDir` and `inbox` likewise.
 */
async function refusedEndingStray(top: string, tips: readonly string[], ownDir: string, inbox: string, paths: readonly string[], verb: string): Promise<string | null> {
  if (paths.length > 0) return `${REFUSED_ENDING}: --paths names ${paths.join(", ")}`;
  const changed = [...(await pushedChanges(top, tips, verb)), ...(await changedSince(top, "HEAD", verb, "index"))].map((entry) => entry.path);
  const stray = [...new Set(changed.filter((path) => path !== inbox && !path.startsWith(`${ownDir}/`)))].toSorted();
  return stray.length === 0 ? null : `${REFUSED_ENDING}: the commits the push would send or the index change ${stray.join(", ")}`;
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

function start(run: string, branch: string, created: boolean, base: string, dryRun: boolean, removed: readonly string[]): Record<string, unknown> {
  return { subcommand: START, run, branch, created, base, ...removedKey(removed), ...(dryRun ? { dryRun: true } : {}) };
}

/**
 * The mode the running verb's git calls start in (REQ-FLOW-122), set by each verb before its first git call
 * ({@link startVerbGit}): the helpers below that start git are shared by the three verbs and take no mode.
 */
const verbGit = { unattended: false };

/**
 * Sets the mode {@link git} starts git in and returns the names, never the values, of the program-valued variables
 * an unattended run removes from git's environment; none where it is attended.
 */
function startVerbGit(unattended: boolean): string[] {
  verbGit.unattended = unattended;
  return unattended ? gitProgramVariablesIn(process.env) : [];
}

/** The verb's text line naming the removed variables ({@link startVerbGit}); no line where it removes none. */
function removedLine(removed: readonly string[]): string[] {
  return removed.length === 0 ? [] : [`removed from git's environment: ${removed.join(", ")}`];
}

/**
 * The same names for the verb's JSON (review/17): an unattended run calls every verb with `--json`, which silences
 * the text line, so `gitEnvRemoved` carries them; absent where none was removed, so an attended document is unchanged.
 */
function removedKey(removed: readonly string[]): { gitEnvRemoved?: string[] } {
  return removed.length === 0 ? {} : { gitEnvRemoved: [...removed] };
}

/**
 * One git call through the write runner, unattended without git's program-valued variables (REQ-FLOW-122); a git
 * that could not start or finish is a failure of the verb. `processGroup` (review/179) is the checkpoint's commit's
 * alone: on POSIX its git runs in a process group of its own, which the wall time stops and waits for as a whole.
 */
async function git(cwd: string, args: readonly string[], verb: string = START, input?: string, processGroup = false): Promise<GitWriteResult> {
  try {
    return await gitWrite(cwd, args, {
      ...(input === undefined ? {} : { input }),
      ...(verbGit.unattended ? { unattended: true } : {}),
      ...(processGroup ? { processGroup: true } : {}),
    });
  } catch (cause) {
    throw new GitStopped(
      {
        code: "FAILURE",
        message: `run ${verb} could not run git ${args[0] ?? ""}`.trimEnd(),
        why: cause instanceof Error ? sanitizeLabel(cause.message) : "git did not start or did not finish",
        next: "put git on PATH, then run it again",
      },
      groupGone(cause),
    );
  }
}

/**
 * review/148, review/179: a git call that did not finish, and whether everything it started is gone: `exited` is true
 * only for a {@link GitWriteGroupStopped} whose group the runner stopped at the wall time and saw gone. An output past
 * the runner's buffer cap leaves it false whatever the group did (review/180), so that commit keeps the marker (fail
 * closed); so does every other rejection (git never started, a stop by a signal the runner did not send).
 */
class GitStopped extends CliFailure {
  readonly exited: boolean;

  constructor(doc: CliFailure["doc"], exited: boolean) {
    super(doc);
    this.exited = exited;
  }
}

/**
 * Whether a runner's rejection shows the stopped call's whole process group gone (review/179): a POSIX wrapper's own
 * git and a hook's children are in that group, so a stop of the program on `PATH` alone no longer counts. Never on
 * Windows: there the program on `PATH` may be Git for Windows' launcher, the runner starts no group, and stopping the
 * launcher does not show that the git it started has ended.
 */
function groupGone(cause: unknown): boolean {
  return process.platform !== "win32" && cause instanceof GitWriteGroupStopped && cause.groupGone;
}

/** The full commit id `rev` names, or `null` where it names none. */
async function commitAt(cwd: string, rev: string, verb: string = START): Promise<string | null> {
  const read = await git(cwd, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`], verb);
  const sha = read.stdout.trim();
  return read.code === 0 && /^[0-9a-f]{40,64}$/.test(sha) ? sha : null;
}

/** What origin's own refs name, read from the remote once a checkpoint, and by `start` for a continued run's branch (n14) ({@link remoteRefs}). */
interface RemoteRefs {
  /** Every commit origin's branches and tags name, once each: the `^<tip>` set of both history reads (pr/46, pr/49). */
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

/** Why an unattended run verb refuses where no source named the default branch (pr/55). */
const FALLBACK_REFUSAL = "no source named the default branch (GitHub's REST API gave no answer and refs/remotes/origin/HEAD names none)";

/** The ref the shell guard reads the default branch from, and the only one it reads it from. */
const ORIGIN_HEAD = "refs/remotes/origin/HEAD";

/**
 * pr/55: the shell guard reads the default branch off {@link ORIGIN_HEAD} alone, so where GitHub's REST API named it
 * and that ref is absent or names another branch, it is pointed at `refs/remotes/origin/<named>`, as `git remote
 * set-head origin -a` would; nothing is written under `--dry-run`, nor where REST gave no answer. The text line, or
 * `null` where the ref already names it.
 */
async function alignOriginHead(ctx: CliContext, cwd: string, defaults: DefaultBranches, verb: string = START): Promise<string | null> {
  if (defaults.source !== "rest" || defaults.named === undefined) return null;
  const named = defaults.named;
  const target = `refs/remotes/origin/${named}`;
  const read = await git(cwd, ["symbolic-ref", "--quiet", ORIGIN_HEAD], verb);
  const now = read.code === 0 ? read.stdout.trim() : null;
  if (now === target) return null;
  const was = now === null ? "absent" : `naming ${sanitizeLabel(now)}`;
  if (!PUSHABLE_BRANCH.test(named)) return `origin/HEAD: not written (${was}): the default branch's name holds characters the push check does not read`;
  const counts = `so the shell guard counts ${named} as the default branch`;
  if (ctx.dryRun) return `origin/HEAD: would point at ${target} (${was}), ${counts}`;
  const wrote = await git(cwd, ["symbolic-ref", ORIGIN_HEAD, target], verb);
  if (wrote.code !== 0) return `origin/HEAD: not written (${was}): git symbolic-ref answered ${wrote.code}: ${firstLine(wrote.stderr)}`;
  return `origin/HEAD: pointed at ${target} (was ${was}), ${counts}`;
}

/**
 * Whether `run start` starts an unattended run: its record's `Mode:` where the work tree holds the record, as before;
 * else (n14, P1) the record head the run's branch carries, `refs/heads/<runBranch>` first, then
 * `refs/remotes/origin/<runBranch>`, so a continuation on a fresh clone, whose record is on the branch alone, starts in
 * the mode it ran in; else the variable. Those reads run with git hardened, since the mode is not known yet.
 */
async function startsUnattended(ctx: CliContext, run: string, runBranch: string): Promise<boolean> {
  const { layout, resumeCard } = ctx.engine.runs;
  const cwd = ctx.app.runtime.cwd;
  const flag = ctx.app.runtime.env["STAMITY_UNATTENDED"];
  const recordRel = `${layout.runRelPath(run)}/${layout.RECORD_FILE}`;
  const record = readCapped(join(cwd, recordRel), layout.RECORD_HEAD_READ_BYTES);
  if (record !== null) return resumeCard.readsUnattended(resumeCard.readRecordHead(record.text).mode, flag);
  startVerbGit(true);
  const heads = await Promise.all(
    [`refs/heads/${runBranch}`, `refs/remotes/origin/${runBranch}`].map(async (ref) => {
      const tip = await commitAt(cwd, ref);
      return tip === null ? null : recordHeadAt(ctx, cwd, tip, recordRel);
    }),
  );
  const text = heads.find((head) => head !== null);
  return resumeCard.readsUnattended(text === undefined || text === null ? null : resumeCard.readRecordHead(text).mode, flag);
}

/**
 * The head of the run's record as commit `rev`'s tree holds it, a regular file (a link or a folder at its path is
 * none), or `null` where it holds none: the one read `start`'s mode ({@link startsUnattended}) and origin's tip
 * ({@link originRunTip}) share.
 */
async function recordHeadAt(ctx: CliContext, cwd: string, rev: string, recordRel: string): Promise<string | null> {
  const listed = await git(cwd, ["ls-tree", "-z", rev, "--", recordRel]);
  if (listed.code !== 0 || !/^100(?:644|755) blob /.test(listed.stdout)) return null;
  const shown = await git(cwd, ["show", `${rev}:./${recordRel}`]);
  return shown.code === 0 ? shown.stdout.slice(0, ctx.engine.runs.layout.RECORD_HEAD_READ_BYTES) : null;
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
  /** review/248: the paths `--drop-held` named whose sections left the held patch. */
  withdrawn: string[];
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
  const unattended = resumeCard.readsUnattended(head.mode, ctx.app.runtime.env["STAMITY_UNATTENDED"]);
  const removed = startVerbGit(unattended);
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

  const result: Checkpoint = { branch: null, base, committed: null, pushed: false, held: [], withdrawn: [], scan: { hits: [], unscanned: [] }, pr: null, notDone: [] };
  const lines: string[] = [`run: ${run} (${unattended ? "unattended" : "attended"})`, `base: ${base}`, ...removedLine(removed)];
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
    return { exitCode: ok ? 0 : 1, json: { subcommand: verb, run, ...removedKey(removed), ...result, ...(verb === END ? { inferred: [] } : {}), ...extra } };
  };

  // (1) Never a commit on a default branch, nor on a checkout that is not the run's.
  const current = await currentBranch(cwd, verb);
  const defaults = await defaultBranches(ctx, cwd, verb);
  const originHead = await alignOriginHead(ctx, cwd, defaults, verb);
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
  if (originHead !== null) lines.push(originHead);
  if (originHead?.startsWith("origin/HEAD: not written") === true) result.notDone.push(originHead);
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
  // review/97 (REQ-FLOW-131): unattended, git's configuration and environment must be the ones the pre-flight vetted.
  const recordUse: RecordUse = verb === END && opts["refused"] === true ? "refused-end" : "push";
  const surface = unattended ? await surfaceCheck(cwd, recordUse) : null;
  if (surface !== null && surface.refusal !== null) {
    result.notDone.push(surface.refusal);
    return finish(false);
  }
  /** review/50: the ending of a pre-flight that refused, which carries the run's records alone. */
  const refusedRecord = surface !== null && surface.refused;
  // pr/55: unattended, main and master alone would let the run push a default branch of another name.
  if (unattended && defaults.source === "fallback") {
    result.notDone.push(`commit refused: ${FALLBACK_REFUSAL}, so an unattended run pushes nothing`);
    return finish(false);
  }
  // review/14: only an unattended run writes the held patch --drop-held withdraws from, so an attended one refuses it
  // rather than ignore it and exit 0.
  if (!unattended && ((opts["dropHeld"] ?? []) as string[]).length > 0) {
    result.notDone.push("not withdrawn: --drop-held reads only in an unattended run, where the held patch is written");
    return finish(false);
  }

  const top = (await git(cwd, ["rev-parse", "--show-toplevel"], verb)).stdout.replace(/\r?\n$/, "");
  const prefix = (await git(cwd, ["rev-parse", "--show-prefix"], verb)).stdout.replace(/\r?\n$/, "");
  const fromTop = (projectPath: string): string => posix.normalize(`${prefix}${projectPath}`);
  // review/50: before anything is staged, a refused pre-flight's ending refuses --paths and any product change.
  // The set the push sends is read from origin's tips, as the held-path check reads it; unread, the ending is held.
  if (refusedRecord) {
    const origin = await remoteRefs(top, current, verb);
    const stray =
      typeof origin === "string"
        ? `push held: origin's branches and tags could not be read (${origin})`
        : await refusedEndingStray(top, origin.tips, fromTop(runDir), fromTop(INBOX_PATH), (opts["paths"] ?? []) as string[], verb);
    if (stray !== null) {
      result.notDone.push(stray);
      return finish(false);
    }
  }
  // review/175, review/182-/189 (signed off): unattended, the hook files and folders Base: holds and the script each
  // declaration there names are held as person-only paths are, read before anything is staged; anything the hold
  // cannot resolve cleanly at Base: refuses the run's push. REQ-FLOW-102: every setup root Base: holds is read beside
  // the run's own project, since a later session started in any of them reads its settings and runs its hooks.
  let hookPaths: string[] = [];
  let setups: string[] = [prefix];
  if (unattended) {
    const atBase = await setupRootsAt((args) => git(top, args, verb), base);
    if (typeof atBase === "string") {
      result.notDone.push(atBase);
      return finish(false);
    }
    setups = [...new Set([prefix, ...atBase])];
    const read = await hookPathsAt({ git: (args) => git(top, args, verb), scratch: HOOK_SCRATCH }, setups, base);
    if (typeof read === "string") {
      result.notDone.push(read);
      return finish(false);
    }
    hookPaths = read;
  }

  // pr/4: an earlier checkpoint's marker (a link or a folder at its path too) refuses before any `git add`, held-patch
  // write or index restore, so the index and the held patch stay as the uncertain commit left them. A dry run reads none.
  const marker = ctx.dryRun ? "" : await markerPath(top, verb);
  if (!ctx.dryRun) {
    const present = markerPresent(marker);
    if (present !== false) {
      result.notDone.push(present === true ? await markerRefusal(top, marker, verb) : `commit and push refused: the checkpoint marker ${marker} could not be read (${present})`);
      return finish(false);
    }
  }

  // (3) What is staged: the run folder's files, the inbox and --paths; never -A, never -f.
  // pr/79: a run-owned path the work tree no longer holds stages as its deletion where the index tracks it, as a
  // --paths entry does; one whose deletion is already staged is the run's own too. A link stays out, as before.
  const runOwned = [...RUN_FILES.map((file) => `${runDir}/${file}`), INBOX_PATH];
  const gone = runOwned.filter((path) => !exists(join(cwd, path))).map(fromTop);
  const goneTracked = await indexTracked(top, gone, verb);
  const own = runOwned.flatMap((path) => {
    const fromRoot = fromTop(path);
    return isRegular(join(cwd, path)) || goneTracked.has(fromRoot) ? [fromRoot] : [];
  });
  const heldDir = `${runDir}/${HELD_DIR}`;
  const patchRel = `${heldDir}/${HELD_PATCH}`;
  /** The held patch written whole, atomically, inside the project; else the reason, for `notDone`. */
  const writePatch = async (bytes: Buffer): Promise<string | null> => {
    try {
      await ctx.engine.merge.atomicWrite.atomicWriteFile(join(cwd, patchRel), bytes, { boundaryDir: cwd });
      return null;
    } catch (cause) {
      return `hold failed: ${patchRel} could not be written (${cause instanceof Error ? cause.message : "write failed"})`;
    }
  };
  const patches = [...new Set([patchRel, ...listPatches(join(cwd, heldDir)).map((name) => `${heldDir}/${name}`)])].map(fromTop);
  const { paths: named, deleted: namedDeleted } = await namedPaths(top, cwd, prefix, base, (opts["paths"] ?? []) as string[], result.notDone, verb);
  // review/84: a deletion already staged is no ignored record, though check-ignore reads its path as untracked now.
  const ignored = await ignoredPaths(top, [...own, ...named.filter((path) => !namedDeleted.includes(path)), ...patches], verb);
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
      // build/103: a folder holding `.git` stages as a gitlink (mode 160000), which the real run holds as a link.
      const gitlink = (path: string): boolean => isDirectory(join(top, path)) && exists(join(top, path, ".git"));
      const wouldStage = stage.map((path) => ({ path, link: isLink(join(top, path)) || gitlink(path), added: false }));
      result.held = heldOf([...(await changedSince(top, base, verb)), ...(await changedSince(top, base, verb, "index")), ...wouldStage], hookPaths, setups);
    }
    lines.push(`would stage: ${list(stage)}`, `would hold: ${list(result.held)}`, "Dry run: nothing was staged, written, committed or pushed.");
    return finish(true, { dryRun: true });
  }
  // review/84: a --paths deletion already staged is committed as it stands; git add refuses a path no layer holds.
  if (!(await add(top, stage.filter((path) => !namedDeleted.includes(path)), result.notDone, verb))) return finish(false);

  // (2) Unattended: the person-only paths' change goes to an inert patch, and those paths back to Base: in the index.
  let unsectioned: string[] = [];
  // review/6: the held paths a patch an earlier checkpoint committed names, kept and listed while no section is written.
  let kept: string[] = [];
  // n14 (P3): the paths whose sections a patch the branch carries is kept for beside a new one, none held now.
  let carried: string[] = [];
  // review/156: the index is read too, since the commit takes it: a held change staged or committed and then
  // undone in the work tree alone is still held.
  if (unattended) {
    const indexSide = await changedSince(top, base, verb, "index");
    const treeSide = await changedSince(top, base, verb);
    // REQ-FLOW-102: a setup the change adds is a root of the tree the push sends, so every read below holds its files.
    const roots = [...setups, ...setupsNamed([...treeSide, ...indexSide])];
    const inIndex = heldOf(indexSide, hookPaths, roots);
    const held = heldOf([...treeSide, ...indexSide], hookPaths, roots);
    // v21 (pr/39): a held path absent at Base: and absent from the work tree, staged and then deleted, gets no
    // section: its two layers would add and delete it, and a patch applied part by part would create a file the run
    // deleted. Absent at Base:, a path the work tree held would show on the work tree's side, so one missing there is gone.
    const inTree = new Set(treeSide.map((entry) => entry.path));
    const bothAbsent = new Set(indexSide.filter((entry) => entry.added && !inTree.has(entry.path)).map((entry) => entry.path));
    const sectioned = held.filter((path) => !bothAbsent.has(path));
    const isHeld = (path: string, link: boolean): boolean => heldOf([{ path, link, added: false }], hookPaths, roots).length > 0;
    // review/248: the paths --drop-held names leave the patch where the run undid them; one still changed stays held.
    const toDrop = ((opts["dropHeld"] ?? []) as string[]).map((path) => fromTop(path.replaceAll("\\", "/")));
    const withdraw = [...new Set(toDrop.filter((path) => !held.includes(path)))];
    for (const still of [...new Set(toDrop.filter((path) => held.includes(path)))].toSorted()) {
      result.notDone.push(`not withdrawn: ${sanitizeLabel(still)} is still changed in the work tree or the index, so it stays held`);
    }
    if (sectioned.length === 0) {
      // review/6 (signed off): a patch an earlier checkpoint committed is kept and listed until a checkpoint writes a
      // new one (which keeps its sections for paths not held then, n14), never dropped because the work tree holds no
      // held change: a run continued on a fresh clone (REQ-FLOW-105) has its person-only change in that patch alone.
      // One no commit carries leaves the folder.
      const committed = await committedPatchPaths(top, fromTop(patchRel), isHeld, verb);
      if (typeof committed === "string") {
        result.notDone.push(committed);
        return finish(false);
      }
      if (committed !== null) kept = committed;
      // review/248: the withdrawn paths' sections leave the kept patch, read as a carried one is; none left, it goes.
      if (committed !== null && committed.some((path) => withdraw.includes(path))) {
        const scratch = mkdtempSync(join(tmpdir(), "stamity-held-"));
        try {
          const left = await carriedSections(top, fromTop(patchRel), withdraw, isHeld, scratch, verb);
          if (typeof left === "string") {
            result.notDone.push(left);
            return finish(false);
          }
          const unwritten = left.sections.length === 0 ? await removeStalePatch(cwd, top, heldDir, fromTop(patchRel), verb) : await writePatch(Buffer.concat(left.sections));
          if (unwritten !== null) {
            result.notDone.push(unwritten);
            return finish(false);
          }
          kept = left.paths;
          result.withdrawn = left.dropped.filter((path) => withdraw.includes(path));
        } finally {
          rmSync(scratch, { recursive: true, force: true });
        }
      }
      const stale = committed === null ? await removeStalePatch(cwd, top, heldDir, fromTop(patchRel), verb) : null;
      if (stale !== null) {
        result.notDone.push(stale);
        return finish(false);
      }
    }
    if (sectioned.length > 0) {
      // Git writes the patch to a file, so its bytes never pass a text decode: a held file in any encoding applies again.
      // Each path from the side the push would have carried: the index where it changes the path, else the work tree;
      // pr/6: a staged path then edited again also gets the index-to-work-tree part, so the patch applies to the work tree's bytes.
      const scratch = mkdtempSync(join(tmpdir(), "stamity-held-"));
      try {
        const staged = sectioned.filter((path) => inIndex.includes(path));
        const sides: [string[], string[]][] = [
          [["--cached", base], staged],
          [[base], sectioned.filter((path) => !inIndex.includes(path))],
          [[], staged],
        ];
        // review/2: a staged path the index no longer holds (git rm, git rm --cached) while the work tree has a file
        // there is untracked, so the index-to-work-tree part skips it; its own part adds the work tree's bytes.
        const readded = await untrackedOf(top, staged, verb);
        if (typeof readded === "string") {
          result.notDone.push(readded);
          return finish(false);
        }
        const written = await Promise.all([
          ...sides
            .filter(([, paths]) => paths.length > 0)
            .map(async ([side, paths], index) => {
              const out = join(scratch, `${index}-${HELD_PATCH}`);
              return { out, patch: await git(top, ["diff", "--binary", "--full-index", ...PATCH_PINS, `--output=${out}`, ...side, "--", ...paths], verb), step: "diff" };
            }),
          ...readded.map(async (path, index) => {
            const out = join(scratch, `added-${index}-${HELD_PATCH}`);
            const part = await workTreeAddition(top, path, out, verb);
            return { out, patch: part.patch, step: part.step };
          }),
        ]);
        const failed = written.find(({ patch }) => patch.code !== 0);
        if (failed !== undefined) {
          result.notDone.push(`hold failed: git ${failed.step} answered ${failed.patch.code}: ${firstLine(failed.patch.stderr)}`);
          return finish(false);
        }
        // n14 (P3): a run continued on a fresh clone holds the earlier person-only change in the branch's patch alone,
        // so a new patch keeps that patch's sections for paths not held now, in their order, before its own.
        // review/248: a withdrawn path's earlier section goes as a path held now does, and no current diff takes its place.
        const earlier = await carriedSections(top, fromTop(patchRel), [...held, ...withdraw], isHeld, scratch, verb);
        if (typeof earlier === "string") {
          result.notDone.push(earlier);
          return finish(false);
        }
        carried = earlier.paths;
        result.withdrawn = earlier.dropped.filter((path) => withdraw.includes(path));
        const unwritten = await writePatch(Buffer.concat([...earlier.sections, ...written.map(({ out }) => readFileSync(out))]));
        if (unwritten !== null) {
          result.notDone.push(unwritten);
          return finish(false);
        }
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    }
    if (held.length > 0) {
      // Every held path, one with no section too, leaves the index for Base:'s.
      const restored = await git(top, ["restore", "--staged", `--source=${base}`, "--", ...held], verb);
      if (restored.code !== 0) {
        result.notDone.push(`hold failed: git restore answered ${restored.code}: ${firstLine(restored.stderr)}`);
        return finish(false);
      }
      result.held = held;
      unsectioned = held.filter((path) => bothAbsent.has(path));
    }
    if (kept.length > 0 || carried.length > 0) result.held = [...new Set([...kept, ...carried, ...result.held])].toSorted();
  }
  // Checked before it exists, since check-ignore reads the rules, not the file; named only once it does.
  const written = patches.filter((path) => isRegular(join(top, path)));
  written.forEach(notCommitted);
  const patchFiles = written.filter((path) => !ignored.has(path));
  if (!(await add(top, patchFiles, result.notDone, verb))) return finish(false);
  lines.push(`staged: ${list([...stage, ...patchFiles])}`);
  const heldNames = result.held.map((path) => (unsectioned.includes(path) ? `${path} (staged, then deleted: no section)` : path));
  lines.push(
    result.held.length === 0
      ? "held: none"
      : kept.length > 0
        ? `held (kept in ${patchRel} from an earlier checkpoint; the work tree holds no held change): ${list(heldNames)}`
        : carried.length > 0
          ? `held (in ${patchRel}; the work tree keeps them, save ${list(carried)}, whose sections are kept from an earlier checkpoint): ${list(heldNames)}`
          : `held (in ${patchRel}; the work tree keeps them): ${list(heldNames)}`,
  );
  if (result.withdrawn.length > 0) lines.push(`withdrawn (their sections left the held patch): ${list(result.withdrawn)}`);

  // pr/46: what origin holds, read from the remote once, before the commit; unread, the push is held.
  const remote = await remoteRefs(top, current, verb);
  if (typeof remote === "string") {
    result.notDone.push(`push held: origin's branches and tags could not be read (${remote})`);
    return finish(false);
  }
  // review/159: the commits the push would send, read before the checkpoint's own, which puts held paths back to Base: only.
  const inHistory = unattended ? await heldInHistory(top, remote.tips, hookPaths, setups, verb) : [];

  // pr/5: the commit takes the whole index, so a path staged before the verb ran and not in its own list refuses it.
  const isOwn = ownPath([...stage, ...gone, ...patches, ...result.held], named);
  const stray = await strayStaged(top, isOwn, verb);
  if (stray === null) {
    result.notDone.push("commit failed: git diff --cached could not list the staged paths");
    return finish(false);
  }
  if (stray.length > 0) {
    result.notDone.push(...stray.map((path) => `commit refused: ${path} is staged and not in --paths`));
    return finish(false);
  }

  // (4) The commit, only when something is staged.
  // review/142, review/143: a commit whose check did not read clean leaves the checkpoint marker, and every later call
  // refuses while it is there, whatever Base: its record names and whatever --paths it is given (read above, pr/4).
  const staged = await git(top, ["diff", "--cached", "--quiet", "--no-ext-diff", "--ignore-submodules=none"], verb);
  if (staged.code === 1) {
    // pr/1: the repository's hooks run inside the commit, after the check above, so HEAD is read before it and the
    // commit's own paths after it; a hook's path outside the list, or a commit of its own, undoes the commit.
    const before = await commitAt(top, "HEAD", verb);
    if (before === null) {
      result.notDone.push("commit refused: HEAD names no commit, so the commit's own paths could not be read against it");
      return finish(false);
    }
    const taken = takeMarker(marker, before);
    if (taken !== null) {
      result.notDone.push(taken === true ? await markerRefusal(top, marker, verb) : `commit refused: the checkpoint marker ${marker} could not be created (${taken})`);
      return finish(false);
    }
    // review/136: a commit, path read or undo that does not finish (the write runner's wall time) fails closed here,
    // naming the commit HEAD holds and the reset target, and leaves the marker, so every later call refuses.
    let commit: GitWriteResult;
    // review/148, review/179: the commit's own git, in a group of its own, was stopped and its whole group is gone
    // (GitStopped), so its catch may read the index lock and HEAD.
    let exited = false;
    try {
      const message = `--message=chore(run): checkpoint ${run}`;
      commit = await git(top, ["commit", "--quiet", message, ...(opts["signoff"] === true ? ["--signoff"] : [])], verb, undefined, true).catch(
        (stop: unknown) => {
          exited = stop instanceof GitStopped && stop.exited;
          throw stop;
        },
      );
      const widened = await hookWidened(top, before, commit.code === 0, isOwn, verb);
      if (widened !== null) {
        const failure = await undoCommit(top, current, before, widened.head, verb);
        const undone = failure === null ? " (commit undone)" : "";
        result.notDone.push(
          ...(widened.ownCommit ? [`commit refused: a hook made a commit of its own${undone}`] : []),
          ...widened.outside.map((path) => `commit refused: ${path} was staged by a hook and is not in --paths${undone}`),
          ...(widened.unread === null ? [] : [`commit refused: ${widened.unread}${undone}`]),
          ...(commit.code === 0 ? [] : [`commit failed: ${firstLine(`${commit.stderr}\n${commit.stdout}`)}`]),
        );
        if (failure !== null) {
          if (commit.code === 0) result.committed = widened.head;
          result.notDone.push(`commit not undone: ${failure}; HEAD holds ${widened.head ?? "an unread commit"}, reset target ${before}`, markerLeft(marker, before));
          lines.push(`commit: ${widened.head ?? "unread"} (not undone; reset target ${before})`);
          return finish(false);
        }
        const dropped = dropMarker(marker);
        if (dropped !== null) result.notDone.push(dropped);
        const why = widened.outside.length > 0 ? "a hook staged paths outside the list" : widened.ownCommit ? "a hook made a commit of its own" : "its paths could not be read";
        lines.push(`commit: undone (${why})`);
        return finish(false);
      }
    } catch (cause) {
      if (!(cause instanceof CliFailure)) throw cause;
      // review/148, review/179 (signed off): a commit whose whole process group is gone, with no index lock left and
      // HEAD still naming `before` on the run branch, made no commit, so the marker goes and the next call can run; a
      // lock there (review/178), or HEAD moved or unread, it stays, as below. A hook's child that left the group on
      // purpose is the residual SECURITY.md names: these reads hold at the time they were made.
      if (exited && markerPresent(indexLockBeside(marker)) === false && (await stillAt(top, current, before, verb))) {
        const dropped = dropMarker(marker);
        result.notDone.push(`commit not made: ${cause.doc.message} (${cause.doc.why ?? "no reason given"})`, ...(dropped === null ? [] : [dropped]));
        lines.push(`commit: not made (HEAD still ${before})`);
        return finish(false);
      }
      const held = await commitAt(top, "HEAD", verb).catch(() => null);
      result.notDone.push(
        `commit not checked: ${cause.doc.message} (${cause.doc.why ?? "no reason given"}); HEAD holds ${held ?? "an unread commit"}, reset target ${before}`,
        markerLeft(marker, before),
      );
      lines.push(`commit: ${held ?? "unread"} (not checked; reset target ${before})`);
      return finish(false);
    }
    // review/142: the commit read clean, so the marker goes now, before the scan and the push; a later stop leaves none.
    const dropped = dropMarker(marker);
    if (commit.code !== 0) {
      const why = `${commit.stderr}\n${commit.stdout}`;
      result.notDone.push(IDENTITY_REFUSAL.test(why) ? "commit failed (identity)" : `commit failed: ${firstLine(why)}`, ...(dropped === null ? [] : [dropped]));
      return finish(false);
    }
    result.committed = await commitAt(top, "HEAD", verb);
    if (dropped !== null) {
      result.notDone.push(dropped);
      return finish(false);
    }
  } else if (staged.code !== 0) {
    result.notDone.push(`commit failed: git diff --cached answered ${staged.code}: ${firstLine(staged.stderr)}`);
    return finish(false);
  } else if (exists(marker)) {
    result.notDone.push(await markerRefusal(top, marker, verb));
    return finish(false);
  }
  lines.push(`commit: ${result.committed ?? "nothing to commit"}`);

  // review/159, review/156: a held path in a pushed commit, or still changed in HEAD's tree (a hook that staged it
  // again), refuses the push; the verb never rewrites history.
  if (unattended) {
    const atTip = heldOf(await changedSince(top, base, verb, "HEAD"), hookPaths, setups).filter((path) => !inHistory.includes(path));
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

  // review/97: read again after the commit, whose hooks could have edited git's configuration, and before the push.
  const surfaceNow = unattended ? await surfaceCheck(cwd, recordUse) : null;
  if (surfaceNow !== null && surfaceNow.refusal !== null) {
    result.notDone.push(surfaceNow.refusal);
    lines.push("push: refused (git's configuration or environment moved since the pre-flight)");
    return finish(false);
  }
  // review/50: the commit made, a refused pre-flight's ending (or one whose record turned refused since the first
  // read) still pushes the run's records alone.
  if (refusedRecord || (surfaceNow !== null && surfaceNow.refused)) {
    const strayNow = await refusedEndingStray(top, remote.tips, fromTop(runDir), fromTop(INBOX_PATH), refusedRecord ? [] : ((opts["paths"] ?? []) as string[]), verb);
    if (strayNow !== null) {
      result.notDone.push(strayNow);
      lines.push("push: refused (a refused pre-flight's ending carries the run's records alone)");
      return finish(false);
    }
  }

  // (6) The push, its command checked by the shell guard's own table before it runs.
  const refspec = `HEAD:refs/heads/${current}`;
  const tip = await commitAt(top, "HEAD", verb);
  if (tip !== null && tip === remote.branch) {
    lines.push(`push: nothing ahead of origin/${current}`);
  } else {
    const context = { defaultBranches: defaults.names, currentBranch: current, tags: await localTags(top, verb) };
    let verdict: ReturnType<typeof personOnlyVerdict>;
    try {
      verdict = personOnlyVerdict(`git push origin ${refspec}`, context);
    } catch (error) {
      // pr/61: a git-legal branch name can nest command substitutions past the verdict's four levels, and the verdict
      // throws there rather than decide; the push is refused as the guard refuses that line.
      if ((error as { code?: unknown } | null)?.code !== "NESTING_DEPTH") throw error;
      result.notDone.push("push refused: the shell guard's table could not decide this push, its branch name nesting past four levels (NESTING_DEPTH)");
      return finish(false);
    }
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
  // n10: a title already reading `Refused:` (leading white space set aside) is used as given, so it is never doubled.
  const given = String(opts["title"]);
  const title = verb === END && opts["refused"] === true && !given.trimStart().startsWith("Refused:") ? `Refused: ${given}` : given;
  const step = await draftPr(ctx, { run, runDir, recordRel, top, cwd, base, branch: current, defaults, unattended, resumes: head.resumes, title, verb });
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

/**
 * review/254: the held patch's diffs take git's default prefixes too, as the gate's diff pins them, so `diff.noprefix`,
 * `diff.mnemonicPrefix` and `diff.srcPrefix`/`diff.dstPrefix` cannot move a name `git apply` reads one folder off.
 * Measured with git 2.52: the explicit pins win over each of those settings.
 */
const PATCH_PINS: readonly string[] = [...DIFF_PINS, "--src-prefix=a/", "--dst-prefix=b/"];

/** What `changedSince` compares with `base`: the work tree, the index, or `HEAD`'s tree. */
type Side = "work tree" | "index" | "HEAD";

const SIDE_ARGS: Readonly<Record<Side, (base: string) => string[]>> = {
  "work tree": (base) => [base],
  index: (base) => ["--cached", base],
  HEAD: (base) => [base, "HEAD"],
};

/**
 * One changed path, whether its new side puts a tree of another's choosing there (a symbolic link, mode `120000`, or,
 * review/195, a submodule's commit, mode `160000`, which a person's `git submodule update` fills), and whether its old
 * side is absent.
 */
interface Changed {
  path: string;
  link: boolean;
  /** Every old side's mode is `000000`: the path is absent on the side compared against (v21). */
  added: boolean;
}

/** Git's mode for a symbolic link. */
const LINK_MODE = "120000";

/** Git's mode for a submodule's commit (a gitlink). */
const GITLINK_MODE = "160000";

/** Git's mode for a path one side does not hold. */
const ABSENT_MODE = "000000";

/**
 * review/3: both raw reads print whole object ids, so `core.abbrev=6` at any config level cannot print one (the zero
 * id among them) in six octal-looking digits that {@link rawEntries} would count as a mode.
 */
const RAW_IDS = "--no-abbrev";

/**
 * The paths of `git diff --raw -z` or `git log --raw -z` output, each with
 * whether its new side is a link and whether every old side is absent: one
 * `:<modes> <ids> <status>` field (`::…` for a merge's combined form, the
 * result's mode last among the modes), then the path. Renames are pinned off,
 * so one path follows each field.
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
    const result = modes.at(-1);
    entries.push({ path, link: result === LINK_MODE || result === GITLINK_MODE, added: modes.length > 1 && modes.slice(0, -1).every((mode) => mode === ABSENT_MODE) });
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

/**
 * Whether a link at `path` is held: at a held glob's directory prefix (its own match is {@link heldPaths}'), as
 * written from the git top or, for a project below it (build/99), from any project root `roots` names (REQ-FLOW-102).
 */
function heldLink(path: string, roots: readonly string[]): boolean {
  const at = (read: string): boolean => HELD_PREFIXES.some((prefix) => matchGlob(read, prefix, { foldCase: true }));
  return (
    at(path) ||
    roots.some((root) => {
      const fromProject = fromProjectRoot(path, root);
      return fromProject !== null && at(fromProject);
    })
  );
}

/**
 * REQ-FLOW-102: the setup roots `entries` add or change a manifest in, or put a link or a submodule at as the setup
 * folder, each once ({@link setupRootOf}).
 */
function setupsNamed(entries: readonly Changed[]): string[] {
  return [...new Set(entries.flatMap((entry) => setupRootOf(entry.path, entry.link) ?? []))];
}

/**
 * The held paths of `entries`, sorted and once each: a person-only path, a path at or under one of `hookPaths` (the
 * hook files and folders the hold reads at `Base:`, and the scripts their declarations name: `hookPathsAt` in `../../runs/hookPaths.ts`,
 * review/175, review/182), or a link or a submodule at a held glob's prefix or at a folder above one of `hookPaths`
 * (review/195). A hook path matches without case, in one Unicode normalization form (review/194) and over the Windows
 * reading of a path, as the globs and the `Base:` walk read names. `setups` are the project roots below the git top
 * (build/99, REQ-FLOW-102: the run's own and every setup root at `Base:`), to which every root whose manifest `entries`
 * change is added, so a setup the change adds is read too: the globs and their prefixes match from each of them; the
 * hook paths already carry theirs.
 */
function heldOf(entries: readonly Changed[], hookPaths: readonly string[], setups: readonly string[]): string[] {
  const paths = [...new Set(entries.map((entry) => entry.path))];
  const links = new Set(entries.filter((entry) => entry.link).map((entry) => entry.path));
  const prefixes = [...new Set([...setups, ...setupsNamed(entries)])];
  const byGlob = new Set(heldPaths(paths, prefixes));
  const roots = hookPaths.map(foldPath);
  const above = new Set(
    roots.flatMap((root) => {
      const segments = root.split("/");
      return segments.slice(1).map((_, end) => segments.slice(0, end + 1).join("/"));
    }),
  );
  const under = (folded: string): boolean => roots.some((root) => folded === root || folded.startsWith(`${root}/`));
  const held = (path: string): boolean =>
    byGlob.has(path) || under(foldPath(path)) || (links.has(path) && (heldLink(path, prefixes) || above.has(foldPath(path))));
  return paths.filter(held).toSorted();
}

/**
 * A path as a case-insensitive, normalization-insensitive checkout reads it: forward slashes, one Unicode
 * normalization form (review/194, the form the `Base:` walk in `../../runs/hookPaths.ts` compares names in), one letter case.
 */
function foldPath(path: string): string {
  return path.replaceAll("\\", "/").normalize("NFC").toLowerCase();
}

/**
 * The scratch folder the hold's declaration reader reads a stand-in copy from (`../../runs/hookPaths.ts`): a fresh
 * folder under the system's temp folder, removed whole after the read.
 */
const HOOK_SCRATCH: HookScratch = {
  create: () => mkdtempSync(join(tmpdir(), "stamity-hooks-")),
  place: (root, path, text) => {
    const file = join(root, ...path.split("/"));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  },
  remove: (root) => rmSync(root, { recursive: true, force: true }),
};

/** The top-level-relative paths `side` changes against `base`, committed changes included, each with its new mode's link reading. */
async function changedSince(top: string, base: string, verb: string, side: Side = "work tree"): Promise<Changed[]> {
  const read = await git(top, ["diff", "--raw", RAW_IDS, "-z", ...DIFF_PINS, ...SIDE_ARGS[side](base), "--"], verb);
  if (read.code !== 0) {
    throw new CliFailure({
      code: "FAILURE",
      message: `run ${verb} could not list the ${side}'s change against the record's Base:`,
      why: `git diff answered ${read.code}: ${firstLine(read.stderr)}`,
      next: "run it inside the repository's work tree",
    });
  }
  return rawEntries(read.stdout);
}

/**
 * The person-only paths a commit the push would send changes (review/159):
 * every commit none of `tips` reaches (`HEAD` and a `^<tip>` each on stdin, as the scan reads
 * them, review/160, build/108, pr/46, pr/49), the tips being origin's branches and
 * tags as the remote answers ({@link remoteRefs}), `--ignore-missing` for one
 * this clone lacks, and all of `HEAD`'s history when the remote names none; a
 * root commit included and a merge by its own resolution (`--cc`), renames
 * read as a deletion and an addition, a link or a submodule at a held glob's
 * prefix included (review/200, review/195), every glob read from the project
 * root too where the project lies below the git top (build/99), and from every setup root (REQ-FLOW-102).
 */
async function heldInHistory(top: string, tips: readonly string[], hookPaths: readonly string[], setups: readonly string[], verb: string): Promise<string[]> {
  return heldOf(await pushedChanges(top, tips, verb), hookPaths, setups);
}

/**
 * Every path each commit the push would send changes (review/159, review/50): the commits `HEAD` reaches and none
 * of `tips` (origin's branches and tags, {@link remoteRefs}) does, read as {@link heldInHistory} reads them.
 */
async function pushedChanges(top: string, tips: readonly string[], verb: string): Promise<Changed[]> {
  const range = ["--ignore-missing", "--stdin"];
  const read = await git(top, ["log", "--root", "--format=", "--raw", RAW_IDS, "-z", "--cc", ...DIFF_PINS, ...range, "--"], verb, revisionLines(tips));
  if (read.code !== 0) {
    throw new CliFailure({
      code: "FAILURE",
      message: `run ${verb} could not list the paths the commits it would push change`,
      why: `git log answered ${read.code}: ${firstLine(read.stderr)}`,
      next: "run it inside the repository's work tree",
    });
  }
  return rawEntries(read.stdout);
}

/**
 * `--paths` as top-level-relative paths: one that leaves the repository or
 * names the whole project, or that neither the work tree nor the index holds
 * and whose deletion is not already staged, is left out and named in `notDone`;
 * one a commit since `base` touched (an earlier checkpoint committed its
 * deletion, the eval fix's code fact, or created and later deleted it,
 * review/177) is left out silently, as there is nothing to stage.
 * `deleted` lists the kept ones whose deletion is already staged (review/84):
 * `git add` refuses a path no layer holds, so they are committed as staged.
 */
async function namedPaths(
  top: string,
  cwd: string,
  prefix: string,
  base: string,
  given: readonly string[],
  notDone: string[],
  verb: string,
): Promise<{ paths: string[]; deleted: string[] }> {
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
  if (missing.length === 0) return { paths: kept, deleted: [] };
  // A path the work tree no longer holds still stages as a deletion where the index tracks it.
  const tracked = await indexTracked(top, missing, verb);
  const deleted = await stagedDeletions(top, missing.filter((path) => !tracked.has(path)), verb);
  const committed = await committedDeletions(top, base, missing.filter((path) => !tracked.has(path) && !deleted.has(path)), verb);
  for (const path of missing) {
    if (tracked.has(path) || deleted.has(path)) kept.push(path);
    else if (!committed.has(path)) notDone.push(`not staged: ${path} (no such file)`);
  }
  return { paths: kept, deleted: [...deleted] };
}

/**
 * The eval fix's code fact, review/177: of `paths`, which neither the work tree nor the index holds, the top-relative
 * ones a commit in `base..HEAD` touched, as a file or as a folder that held one: `HEAD` then holds their absence as
 * the run committed it, a deletion of a file `base` held or a file the run created and later deleted, and a run's
 * ending names again what its checkpoints committed. None where git could not answer.
 */
async function committedDeletions(top: string, base: string, paths: readonly string[], verb: string): Promise<Set<string>> {
  if (paths.length === 0) return new Set();
  const read = await git(top, ["log", "--format=", "--name-only", "-z", "--no-show-signature", ...DIFF_PINS, `${base}..HEAD`, "--", ...paths], verb);
  return namedIn(paths, read.code === 0 ? read.stdout.split("\0").filter((name) => name !== "") : []);
}

/**
 * The top-relative `paths` whose deletion the index already holds against `HEAD`
 * (`git rm`), as a file or as a folder holding one (review/84). None where git could not answer.
 */
async function stagedDeletions(top: string, paths: readonly string[], verb: string): Promise<Set<string>> {
  if (paths.length === 0) return new Set();
  const read = await git(top, ["diff", "--cached", "--name-only", "-z", "--diff-filter=D", ...DIFF_PINS, "HEAD", "--", ...paths], verb);
  return namedIn(paths, read.code === 0 ? read.stdout.split("\0").filter((name) => name !== "") : []);
}

/** The `paths` that name one of `names` exactly, or a folder holding one. */
function namedIn(paths: readonly string[], names: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (const path of paths) {
    const under = path.endsWith("/") ? path : `${path}/`;
    if (names.some((name) => name === path || name.startsWith(under))) found.add(path);
  }
  return found;
}

/**
 * The top-relative `paths` the index tracks, as a file or as a folder holding
 * one (`git ls-files --cached`): a path the work tree no longer holds stages as
 * its deletion when it is one of these. None where git could not answer.
 */
async function indexTracked(top: string, paths: readonly string[], verb: string): Promise<Set<string>> {
  if (paths.length === 0) return new Set();
  const read = await git(top, ["ls-files", "-z", "--cached", "--", ...paths], verb);
  return namedIn(paths, read.code === 0 ? read.stdout.split("\0").filter((name) => name !== "") : []);
}

/**
 * The paths of `paths` git ignores, each with the rule that ignores it
 * (`<source>:<line> <pattern>`), from `git check-ignore -v`; a negated
 * pattern's match is not ignored, nor is a tracked path. `null` when git
 * could not answer. `check-ignore` refuses pathspec magic, so these paths
 * cannot go after a `--`, where the write runner adds it; each goes as
 * `./<path>`, which no option and no magic starts with.
 */
async function ignoredPaths(top: string, paths: readonly string[], verb: string): Promise<Map<string, string> | null> {
  const ignored = new Map<string, string>();
  if (paths.length === 0) return ignored;
  const read = await git(top, ["check-ignore", "-v", "--non-matching", ...paths.map((path) => `./${path}`)], verb);
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

/**
 * `git add -- <paths>`, never `-A` or `-f`; false, with the reason in `notDone`, when git refused it. review/224: a
 * path the index tracks as a file goes through `git add -u` instead, which stages it the same way, since a plain `git
 * add` of a tracked file inside a folder a `.gitignore` folder rule ignores stages it and still exits 1 (measured with
 * git 2.52). A folder that rule ignores never gets here: `check-ignore` names it first ({@link ignoredPaths}).
 */
async function add(top: string, paths: readonly string[], notDone: string[], verb: string): Promise<boolean> {
  if (paths.length === 0) return true;
  const listed = await git(top, ["ls-files", "-z", "--cached", "--", ...paths], verb);
  if (listed.code !== 0) {
    notDone.push(`stage failed: git ls-files answered ${listed.code}: ${firstLine(listed.stderr)}`);
    return false;
  }
  // A tracked file the work tree now holds a folder at takes the plain add, which also adds that folder's new files.
  const indexed = new Set(listed.stdout.split("\0"));
  const tracked = new Set(paths.filter((path) => indexed.has(path) && !isDirectory(join(top, path))));
  /** One `git add` over `group`, none where it is empty; false, the reason in `notDone`, where git refused it. */
  const step = async (args: readonly string[], group: readonly string[]): Promise<boolean> => {
    if (group.length === 0) return true;
    const added = await git(top, [...args, ...group], verb);
    if (added.code === 0) return true;
    notDone.push(`stage failed: git add answered ${added.code}: ${firstLine(added.stderr)}`);
    return false;
  };
  // In turn, never side by side: both take the index lock.
  return (
    (await step(["add", "-u", "--"], paths.filter((path) => tracked.has(path)))) && (await step(["add", "--"], paths.filter((path) => !tracked.has(path))))
  );
}

/**
 * Whether a top-relative path is the verb's own to commit: one of `own` (the
 * run files, the inbox, `--paths`, deletions, the held patches, the held
 * paths) or under a `--paths` folder of `named` (pr/5, pr/1).
 */
function ownPath(own: readonly string[], named: readonly string[]): (path: string) => boolean {
  const exact = new Set(own);
  const folders = named.map((path) => `${path.replace(/\/+$/, "")}/`);
  return (path) => exact.has(path) || folders.some((folder) => path.startsWith(folder));
}

/**
 * The staged paths (the index against `HEAD`, what the commit takes) that are
 * not the verb's own (`isOwn`, pr/5); `null` when git could not list them.
 */
async function strayStaged(top: string, isOwn: (path: string) => boolean, verb: string): Promise<string[] | null> {
  const read = await git(top, ["diff", "--cached", "--name-only", "-z", ...DIFF_PINS, "HEAD", "--"], verb);
  if (read.code !== 0) return null;
  return read.stdout
    .split("\0")
    .filter((path) => path !== "" && !isOwn(path))
    .toSorted();
}

/** pr/1: what the repository's hooks did to the verb's commit, read after it. */
interface HookWidening {
  /** The paths between the HEAD before the commit and the HEAD after it that are not the verb's own. */
  outside: string[];
  /** HEAD moved past the commit the verb made, or moved where the verb's own commit failed. */
  ownCommit: boolean;
  /** Why the commit's paths could not be read, or `null` where they were. */
  unread: string | null;
  /** The commit `HEAD` named when the check read it, the one the undo swaps out (review/138); `null` where unread. */
  head: string | null;
}

/**
 * pr/1: reads, after the verb's commit, whether a hook widened it: the commit's
 * parent must be `before` (where the commit failed, HEAD must still be it), and
 * every path of `before..HEAD` must be the verb's own. `null` where neither was
 * crossed and HEAD holds nothing the verb did not commit.
 */
async function hookWidened(top: string, before: string, committed: boolean, isOwn: (path: string) => boolean, verb: string): Promise<HookWidening | null> {
  const head = await commitAt(top, "HEAD", verb);
  if (!committed && head === before) return null;
  const ownCommit = (committed ? await commitAt(top, "HEAD^", verb) : head) !== before;
  const read = await git(top, ["diff", "--name-only", "-z", ...DIFF_PINS, before, "HEAD", "--"], verb);
  if (read.code !== 0) return { outside: [], ownCommit, unread: `git diff answered ${read.code}: ${firstLine(read.stderr)}`, head };
  const outside = read.stdout
    .split("\0")
    .filter((path) => path !== "" && !isOwn(path))
    .toSorted();
  return outside.length === 0 && !ownCommit ? null : { outside, ownCommit, unread: null, head };
}

/**
 * review/138: undoes the commit {@link hookWidened} read by rewinding the run
 * branch by name from `checked` to `before`, a compare-and-swap (`git
 * update-ref`), never whatever `HEAD` then names; the index stays, as a soft
 * reset leaves it. `null` once rewound; else why not, for `notDone`: `HEAD`
 * has left the run branch (a hook switched it), the check read no commit, or
 * git refused the swap.
 */
async function undoCommit(top: string, branch: string, before: string, checked: string | null, verb: string): Promise<string | null> {
  const on = await currentBranch(top, verb);
  if (on !== branch) {
    const tip = await commitAt(top, `refs/heads/${branch}`, verb);
    return `HEAD has left ${branch} (at ${tip ?? "an unread commit"}) for ${on ?? "a detached HEAD"}, so neither branch was rewound`;
  }
  if (checked === null) return "the commit HEAD holds could not be read";
  const swapped = await git(top, ["update-ref", `refs/heads/${branch}`, before, checked], verb);
  return swapped.code === 0 ? null : `git update-ref answered ${swapped.code}: ${firstLine(swapped.stderr)}`;
}

/** The checkpoint marker's place under the work tree's own git directory ({@link markerPath}). */
const PENDING_MARKER = "stamity/checkpoint-pending";

/**
 * review/142, review/143: the checkpoint marker, {@link PENDING_MARKER} under
 * this work tree's own git directory (`git rev-parse --git-dir`, a linked work
 * tree's own), so no commit or push carries it and a parallel work tree keeps
 * its own. It holds the `HEAD` read before a checkpoint's commit, from before
 * the commit until the commit's check reads clean or its undo succeeds; one
 * still there means a commit was left unchecked or not undone, so every later
 * `checkpoint` and `end` refuses until a person removes it.
 */
async function markerPath(top: string, verb: string): Promise<string> {
  const read = await git(top, ["rev-parse", "--git-dir"], verb);
  const dir = read.stdout.replace(/\r?\n$/, "");
  if (read.code !== 0 || dir === "") {
    throw new CliFailure({
      code: "FAILURE",
      message: `run ${verb} could not read the work tree's git directory`,
      why: `git rev-parse answered ${read.code}: ${firstLine(read.stderr)}`,
      next: "run it inside the repository's work tree",
    });
  }
  return join(resolve(top, dir), PENDING_MARKER);
}

/** Creates the marker exclusively, holding `before`: `null` once created, `true` where one is already there, else why not. */
function takeMarker(marker: string, before: string): true | string | null {
  try {
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, `${before}\n`, { flag: "wx" });
    return null;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "EEXIST" && exists(marker)) return true;
    return cause instanceof Error ? cause.message : "the write failed";
  }
}

/**
 * pr/4: whether anything sits at the marker's path, a link or a folder included: `false` where nothing does (its
 * folder missing, or a file in the folder's place), `true` where something does, else why it could not be read.
 */
function markerPresent(marker: string): boolean | string {
  try {
    lstatSync(marker);
    return true;
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    return cause instanceof Error ? cause.message : "the read failed";
  }
}

/**
 * review/178: git's index lock in the work tree's own git directory, the one {@link markerPath} puts the marker under
 * (`<git-dir>/stamity/checkpoint-pending`): a commit holds it while its hooks run, and a git stopped by a signal
 * removes it, so one still there is a commit still under way or a lock nothing removed.
 */
function indexLockBeside(marker: string): string {
  return resolve(dirname(marker), "..", "index.lock");
}

/** review/148: whether `HEAD` is still on `branch` and names `before`; a read that fails or does not finish is a no. */
async function stillAt(top: string, branch: string, before: string, verb: string): Promise<boolean> {
  try {
    return (await currentBranch(top, verb)) === branch && (await commitAt(top, "HEAD", verb)) === before;
  } catch {
    return false;
  }
}

/** Removes the marker, a link itself where one is there: `null` once gone, else the `notDone` line. */
function dropMarker(marker: string): string | null {
  try {
    unlinkSync(marker);
    return null;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
    return `checkpoint marker not removed: ${marker} (${cause instanceof Error ? cause.message : "the remove failed"}), so every later call refuses until a person removes it`;
  }
}

/** The `notDone` line naming the marker a call leaves where its commit was not checked or not undone. */
function markerLeft(marker: string, before: string): string {
  return `checkpoint marker left: ${marker} records ${before}, so every later checkpoint and end refuses until a person resolves it`;
}

/** The refusal while a marker is there: what it records, what `HEAD` holds, and what a person does before removing it. */
async function markerRefusal(top: string, marker: string, verb: string): Promise<string> {
  const recorded = readCapped(marker, 128)?.text.trim() ?? "";
  const before = /^[0-9a-f]{40,64}$/.test(recorded) ? recorded : "an unread commit";
  const head = await commitAt(top, "HEAD", verb);
  return (
    `commit and push refused: ${marker} records ${before}, left by a checkpoint whose commit was not checked or not undone, ` +
    `and HEAD holds ${head ?? "an unread commit"}; a person reviews the commits after ${before}, resets the branch to it ` +
    `if one carries a path outside --paths, then removes ${marker}`
  );
}

/**
 * Removes the held patch where it is left from an earlier checkpoint: out of
 * the index (`git rm --cached`, so the commit drops it from the branch), then
 * out of the work tree, only where `held/` is the run folder's own directory
 * and the patch a regular file, never through a link. `null` once it is gone
 * or was never there; else the reason, for `notDone`.
 */
async function removeStalePatch(cwd: string, top: string, heldDir: string, patchFromTop: string, verb: string): Promise<string | null> {
  const patch = join(top, patchFromTop);
  const tracked = await git(top, ["ls-files", "-z", "--cached", "--", patchFromTop], verb);
  if (tracked.code !== 0) return `hold failed: git ls-files answered ${tracked.code}: ${firstLine(tracked.stderr)}`;
  if (tracked.stdout === "" && !isRegular(patch)) return null;
  if (tracked.stdout !== "") {
    const removed = await git(top, ["rm", "--cached", "--quiet", "--ignore-unmatch", "--", patchFromTop], verb);
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

/**
 * review/6: the paths the held patch `HEAD` carries names, read from the copy the commit takes: the work tree's where
 * it is a regular file, else `HEAD`'s. `null` where `HEAD` carries none; else the reason it could not be read, for
 * `notDone`. Each section is read as {@link carriedSections} reads one ({@link sectionPathsOf}): review/15, its header
 * checked first; review/33, refused where git reads it as more than one file patch; build/15, refused where it names a
 * path `isHeld` does not hold, so `held` never names a path the hold does not hold. review/33: a patch that does not
 * start at a `diff --git` line is refused, since a file patch git reads before the first section lies in none of them.
 */
async function committedPatchPaths(
  top: string,
  patchFromTop: string,
  isHeld: (path: string, link: boolean) => boolean,
  verb: string,
): Promise<string[] | string | null> {
  const listed = await git(top, ["ls-tree", "-z", "HEAD", "--", patchFromTop], verb);
  if (listed.code !== 0) return `hold failed: git ls-tree answered ${listed.code}: ${firstLine(listed.stderr)}`;
  const blob = /^100(?:644|755) blob ([0-9a-f]{40,64})\t/.exec(listed.stdout)?.[1];
  if (blob === undefined) return null;
  const file = join(top, patchFromTop);
  let patch: Buffer;
  if (isRegular(file)) {
    patch = readFileSync(file);
  } else {
    const shown = await git(top, ["cat-file", "blob", blob], verb);
    if (shown.code !== 0) return `hold failed: git cat-file answered ${shown.code}: ${firstLine(shown.stderr)}`;
    patch = Buffer.from(shown.stdout, "utf8");
  }
  const starts = sectionStarts(patch);
  if (starts[0] !== 0) {
    return `hold failed: the kept ${patchFromTop} does not start at a diff --git line, as every patch this verb writes does, so a file patch git apply reads before its first section would be carried unlisted`;
  }
  const scratch = mkdtempSync(join(tmpdir(), "stamity-held-"));
  try {
    const mapped = await sectionPathsOf(top, patchFromTop, starts.map((from, index) => patch.subarray(from, starts[index + 1] ?? patch.length)), isHeld, scratch, verb);
    return typeof mapped === "string" ? mapped : [...new Set(mapped.flat())].toSorted();
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Where each section of a patch starts: its offset, at a line-start `diff --git ` header. */
function sectionStarts(patch: Buffer): number[] {
  const header = Buffer.from("diff --git ");
  const starts: number[] = patch.subarray(0, header.length).equals(header) ? [0] : [];
  for (let at = patch.indexOf(`\n${header.toString()}`); at !== -1; at = patch.indexOf(`\n${header.toString()}`, at + 1)) starts.push(at + 1);
  return starts;
}

/**
 * n14 (P3): the sections of the held patch `HEAD` carries whose paths are none of `heldNow`, as bytes in the patch's
 * order, and those paths, beside the paths of the sections left out (review/248's withdrawn ones among them); none
 * where `HEAD` carries no patch. The patch is read from the copy the commit takes, as
 * {@link committedPatchPaths} reads it: the work tree's where it is a regular file, else `HEAD`'s, which passes a text
 * decode and so is refused where that decode is not whole. A section runs from one line-start `diff --git ` header to
 * the next (a binary section's base85 lines hold no space, so it is kept whole), and `git apply --numstat -z`, which
 * applies nothing, names its paths from its own bytes, written to `scratch`. A path held now takes the current diff,
 * so its earlier sections go. Refused (review/249): a section git reads as more than one file patch (a `---`/`+++`
 * pair after its hunks needs no `diff --git` header, so it gets no split point), whose paths past its first would ride
 * unlisted. Refused (review/250): a section naming a path `isHeld` does not hold, read with the section's new-side
 * mode as {@link rawEntries} reads a link, so no path the hold does not hold joins `held` and the commit's own paths.
 * Refused (review/251): a section whose header is not one the verb's own diffs write ({@link foreignSectionHeader}),
 * checked before `git apply` reads it, since `git apply --numstat -z` names only a section's new path and the path a
 * rename (in any spelling), a `diff --git` line naming two paths or a `---` line naming another moves would ride
 * unlisted. Else the reason, for `notDone`.
 */
async function carriedSections(
  top: string,
  patchFromTop: string,
  heldNow: readonly string[],
  isHeld: (path: string, link: boolean) => boolean,
  scratch: string,
  verb: string,
): Promise<{ sections: Buffer[]; paths: string[]; dropped: string[] } | string> {
  const listed = await git(top, ["ls-tree", "-z", "HEAD", "--", patchFromTop], verb);
  if (listed.code !== 0) return `hold failed: git ls-tree answered ${listed.code}: ${firstLine(listed.stderr)}`;
  const blob = /^100(?:644|755) blob ([0-9a-f]{40,64})\t/.exec(listed.stdout)?.[1];
  if (blob === undefined) return { sections: [], paths: [], dropped: [] };
  const file = join(top, patchFromTop);
  let patch: Buffer;
  if (isRegular(file)) {
    patch = readFileSync(file);
  } else {
    const shown = await git(top, ["cat-file", "blob", blob], verb);
    if (shown.code !== 0) return `hold failed: git cat-file answered ${shown.code}: ${firstLine(shown.stderr)}`;
    if (shown.stdout.includes("\uFFFD")) return `hold failed: the kept ${patchFromTop} is not in the work tree, and HEAD's copy holds bytes this verb cannot read whole`;
    patch = Buffer.from(shown.stdout, "utf8");
  }
  const starts = sectionStarts(patch);
  const sections = starts.map((from, index) => patch.subarray(from, starts[index + 1] ?? patch.length));
  const mapped = await sectionPathsOf(top, patchFromTop, sections, isHeld, scratch, verb);
  if (typeof mapped === "string") return mapped;
  const keep = mapped.map((paths) => !paths.some((path) => heldNow.includes(path)));
  const named = (kept: boolean): string[] => [...new Set(mapped.flatMap((paths, index) => ((keep[index] === true) === kept ? paths : [])))].toSorted();
  return { sections: sections.filter((_, index) => keep[index] === true), paths: named(true), dropped: named(false) };
}

/**
 * The paths each section of the kept `patchFromTop` names, in order, as {@link carriedSections} documents its
 * refusals (review/249, review/250, review/251), each section's numstat written to `scratch`; else the first
 * section's reason, for `notDone`.
 */
async function sectionPathsOf(
  top: string,
  patchFromTop: string,
  sections: readonly Buffer[],
  isHeld: (path: string, link: boolean) => boolean,
  scratch: string,
  verb: string,
): Promise<string[][] | string> {
  const mapped = await Promise.all(
    sections.map(async (section, index): Promise<string[] | string> => {
      const foreign = foreignSectionHeader(section);
      if (foreign !== null) return `hold failed: a section of the kept ${patchFromTop} ${foreign}`;
      const out = join(scratch, `carried-${index}.patch`);
      writeFileSync(out, section);
      const read = await git(top, ["apply", "--numstat", "-z", out], verb);
      if (read.code !== 0) return `hold failed: the kept ${patchFromTop} could not be read (git apply answered ${read.code}: ${firstLine(read.stderr)})`;
      // One `<added>\t<deleted>\t<path>` record per file patch, NUL-terminated (a rename's or copy's new path only,
      // review/251, so the header check above lets none through); an empty path field is read as git diff's two-path
      // form, defensively.
      const tokens = read.stdout.split("\0");
      const records: string[][] = [];
      for (let at = 0; at < tokens.length; at += 1) {
        const fields = (tokens[at] ?? "").replace(/^\n+/, "").split("\t");
        if (fields.length < 3) continue;
        const named = fields.slice(2).join("\t");
        records.push(named === "" ? tokens.slice(at + 1, at + 3) : [named]);
        if (named === "") at += 2;
      }
      if (records.length > 1) return `hold failed: a section of the kept ${patchFromTop} carries more than one file patch, so a path past its first would be carried unlisted`;
      const sectionPaths = (records[0] ?? []).filter((path) => path !== "");
      if (sectionPaths.length === 0) return `hold failed: a section of the kept ${patchFromTop} names no path`;
      const link = sectionLink(section);
      const outside = sectionPaths.find((path) => !isHeld(path, link));
      return outside === undefined ? sectionPaths : `hold failed: a section of the kept ${patchFromTop} names ${sanitizeLabel(outside)}, which the hold does not hold`;
    }),
  );
  const failed = mapped.find((paths) => typeof paths === "string");
  if (typeof failed === "string") return failed;
  return mapped.filter((paths) => typeof paths !== "string");
}

/** review/251: an extended header line the verb's own diffs write (renames pinned off, `--full-index`), whole. */
const SECTION_HEADER_LINE = /^(?:(?:old mode|new mode|new file mode|deleted file mode) [0-7]{6}|index [0-9a-f]{40,64}\.\.[0-9a-f]{40,64}(?: [0-7]{6})?)$/;

/**
 * review/251, review/254: a `diff --git` name's first component, one of the prefixes git writes and `git apply` sets
 * aside: `a/` and `b/`, which the verb's own diffs pin ({@link PATCH_PINS}), and the mnemonic `c/`, `i/`, `w/`, `o/`,
 * `1/` and `2/`, which an older version's patch may carry. Any other first component is a folder of the path, so a
 * section without one of these is refused, never set one folder off. A no-prefix section under a folder of one of
 * these names reads as prefixed and so applies one folder up: a named residual.
 */
const NAME_PREFIX = "[abciwo12]/";

/** review/251: a byte git writes as it is in a name: printable but `"` and backslash, or past ASCII (Latin-1 read). */
const NAME_BYTE = String.raw`[ !#-[\]-~\x80-\xff]`;

/** review/251: a `diff --git` line's two names where git C-quoted them, each a prefix, then the quoted rest. */
const QUOTED_NAMES = new RegExp(String.raw`^"(${NAME_PREFIX})((?:${NAME_BYTE}|\\(?:[abfnrtv"\\]|[0-3][0-7]{2}))+)" "(${NAME_PREFIX})(\2)"$`);

/** review/251: a name's prefix at the start of the text read. */
const PREFIX_FIRST = new RegExp(`^${NAME_PREFIX}`);

/** review/251: a `diff --git` line's names where git quoted neither: bytes it writes as they are, and nothing else. */
const PLAIN_NAMES = new RegExp(`^${NAME_BYTE}+$`);

/**
 * review/251: the two names a `diff --git ` line gives, as written, where both name one path as `git apply` reads them,
 * each name's first component set aside; else null. Git C-quotes a name holding a `"`, a backslash or a control byte,
 * so an unquoted one holds none (`git apply` reads a `"` there as the start of a quoted second name). A prefix is plain
 * (no escape, no space), so the path after it is the same whether read quoted or not, and of the spaces in the line
 * at most one splits it into two names whose paths have one length.
 */
function diffGitNames(line: string): [string, string] | null {
  if (!line.startsWith("diff --git ")) return null;
  const names = line.slice("diff --git ".length);
  const quoted = QUOTED_NAMES.exec(names);
  if (quoted !== null) return [`"${quoted[1] ?? ""}${quoted[2] ?? ""}"`, `"${quoted[3] ?? ""}${quoted[4] ?? ""}"`];
  const first = PREFIX_FIRST.exec(names)?.[0];
  if (first === undefined || !PLAIN_NAMES.test(names)) return null;
  for (let at = names.indexOf(" "); at !== -1; at = names.indexOf(" ", at + 1)) {
    const second = PREFIX_FIRST.exec(names.slice(at + 1))?.[0];
    const path = names.slice(first.length, at);
    if (second !== undefined && path !== "" && path.length === names.length - at - 1 - second.length && names.endsWith(` ${second}${path}`)) {
      return [names.slice(0, at), names.slice(at + 1)];
    }
  }
  return null;
}

/**
 * review/254: whether a `diff --git ` line names one name twice, quoted or not, as git writes it under `diff.noprefix`:
 * `git apply` reads the first component of each as a prefix, so such a section lands one folder off, or nowhere.
 */
function noPrefixNames(line: string): boolean {
  if (!line.startsWith("diff --git ")) return false;
  const names = line.slice("diff --git ".length);
  const half = (names.length - 1) / 2;
  return Number.isInteger(half) && half > 0 && names[half] === " " && names.slice(0, half) === names.slice(half + 1);
}

/**
 * review/16: whether a `diff --git ` line names one path under two first folders of its own, as git writes it under
 * `diff.srcPrefix`/`diff.dstPrefix`: two plain names (unquoted, as {@link diffGitNames} reads them), each split at its
 * first `/`, the rest of each equal and not empty. Read after {@link diffGitNames} gave none, so at least one of those
 * folders is not a prefix the verb's diffs write. `git apply` sets one folder aside, so a one-folder prefix lands at its
 * path and a deeper one (`x/z/`) one folder below it; the line cannot tell which was written, so either is refused.
 * Measured with git 2.52.
 */
function customPrefixNames(line: string): boolean {
  if (!line.startsWith("diff --git ")) return false;
  const names = line.slice("diff --git ".length);
  if (!PLAIN_NAMES.test(names)) return false;
  for (let at = names.indexOf(" "); at !== -1; at = names.indexOf(" ", at + 1)) {
    const [first, second] = [names.slice(0, at), names.slice(at + 1)];
    const [cut, cutSecond] = [first.indexOf("/"), second.indexOf("/")];
    if (cut > 0 && cutSecond > 0 && first.length - cut > 1 && first.slice(cut) === second.slice(cutSecond)) return true;
  }
  return false;
}

/**
 * review/251: why a held patch section is not one the verb's own diffs write, in the words `carriedSections` gives
 * it, or null where it is one. Its header is every line before its first `@@ ` or `GIT binary patch` line, which is as
 * far as `git apply` reads one (a rename line after the `+++` line still renames), a CR before an LF read as part of
 * the line end, as a checkout under `core.autocrlf` leaves it. A section the verb writes names one path twice on its
 * `diff --git` line ({@link diffGitNames}), then holds only mode and `index` lines (none at all for a dirty
 * submodule), then either a `---` and a `+++` line naming those two names as written (`/dev/null` on the side it adds
 * or deletes, a tab after a name holding a space) and its first hunk, or its binary patch, or nothing more. Measured
 * with git 2.52 (`test/cli/commands/runCheckpoint.test.ts` pins each kind of section). So `git apply` reads one path
 * from the section, the one `--numstat` names.
 */
function foreignSectionHeader(section: Buffer): string | null {
  const lines = section.toString("latin1").split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const bodyAt = lines.findIndex((line, index) => index > 0 && (line.startsWith("@@ ") || line === "GIT binary patch"));
  const header = lines.slice(1, bodyAt === -1 ? lines.length : bodyAt);
  if (header.some((line) => /^(?:rename |copy |similarity index )/.test(line))) {
    return "renames or copies a path, and git apply --numstat names only its new one, so the path it moves or reads from would be carried unlisted";
  }
  const names = diffGitNames(lines[0] ?? "");
  if (names === null && noPrefixNames(lines[0] ?? "")) return "was written with no diff prefix, so git apply would place it one folder off";
  if (names === null && customPrefixNames(lines[0] ?? "")) {
    return "was written with diff prefixes other than a/ and b/ (diff.srcPrefix/diff.dstPrefix), so git apply, which sets aside one folder, could place it off its path";
  }
  if (names === null) {
    return "does not name one path twice on its diff --git line, as every section this verb writes does, so a path git apply moves there would be carried unlisted";
  }
  const pairAt = header.findIndex((line) => line.startsWith("--- ") || line.startsWith("+++ "));
  const modes = pairAt === -1 ? header : header.slice(0, pairAt);
  const pair = pairAt === -1 ? [] : header.slice(pairAt);
  const body = bodyAt === -1 ? undefined : lines[bodyAt];
  const shaped = pair.length === 0 ? body === undefined || body === "GIT binary patch" : pair.length === 2 && body?.startsWith("@@ -") === true;
  if (!shaped || !modes.every((line) => SECTION_HEADER_LINE.test(line))) {
    return "has a header line this verb's own diffs never write, so what git apply does with it would be carried unchecked";
  }
  const label = (name: string): string => (name.includes(" ") ? `${name}\t` : name);
  const adds = modes.some((line) => line.startsWith("new file mode "));
  const deletes = modes.some((line) => line.startsWith("deleted file mode "));
  if (pair.length === 2 && (pair[0] !== `--- ${label(adds ? "/dev/null" : names[0])}` || pair[1] !== `+++ ${label(deletes ? "/dev/null" : names[1])}`)) {
    return "has a --- or +++ line that does not name its diff --git line's path (or /dev/null where it adds or deletes the file), so a path git apply moves there would be carried unlisted";
  }
  return null;
}

/**
 * review/250: whether a held patch section's new side is a link or a submodule, as {@link rawEntries} reads a path's
 * result mode: the last mode its extended header names (`new file mode`, `new mode`, or the `index` line's), read
 * before its first `--- `, `@@` or binary line. A deletion's side names none, so it reads as no link, as there.
 */
function sectionLink(section: Buffer): boolean {
  // review/256: a CR before an LF is part of the line end, as foreignSectionHeader reads it, so a CRLF copy's mode line reads.
  const lines = section.toString("latin1").split(/\r?\n/).slice(1);
  const end = lines.findIndex((line) => /^(?:--- |@@|GIT binary patch|Binary files )/.test(line));
  const modes = (end === -1 ? lines : lines.slice(0, end)).flatMap((line) => {
    const mode = /^(?:new file mode|new mode) ([0-7]{6})$/.exec(line)?.[1] ?? /^index [0-9a-f]+\.\.[0-9a-f]+ ([0-7]{6})$/.exec(line)?.[1];
    return mode === undefined ? [] : [mode];
  });
  const mode = modes.at(-1);
  return mode === LINK_MODE || mode === GITLINK_MODE;
}

/**
 * review/2: of `paths`, those the index holds no entry for while the work tree has a file there (`git ls-files
 * --others`, ignored ones included, never past a link), each matched whole; else the reason, for `notDone`.
 */
async function untrackedOf(top: string, paths: readonly string[], verb: string): Promise<string[] | string> {
  if (paths.length === 0) return [];
  const read = await git(top, ["ls-files", "-z", "--others", "--", ...paths], verb);
  if (read.code !== 0) return `hold failed: git ls-files answered ${read.code}: ${firstLine(read.stderr)}`;
  const listed = new Set(read.stdout.split("\0"));
  return paths.filter((path) => listed.has(path));
}

/**
 * review/2: the held patch's part from absent to the work tree's bytes at `path`, written to `out`, the real index
 * untouched: the file (a link's target text, for a link) goes to the object store as `git add` would read it
 * (`hash-object` with the path's attributes), under a tree built for it alone (`mktree`), diffed from the empty tree.
 * The result is the call that failed, or the diff's.
 */
async function workTreeAddition(top: string, path: string, out: string, verb: string): Promise<{ patch: GitWriteResult; step: string }> {
  const full = join(top, path);
  const link = isLink(full);
  const blob = link
    ? await git(top, ["hash-object", "-w", "--stdin"], verb, readlinkSync(full))
    : await git(top, ["hash-object", "-w", `--path=${path}`, full], verb);
  if (blob.code !== 0) return { patch: blob, step: "hash-object" };
  const executable = !link && process.platform !== "win32" && (lstatSync(full).mode & 0o111) !== 0;
  const segments = path.split("/");
  // Each folder's tree holds the one below it, from the file's own folder up to the top; each waits on the one below.
  const nest = async (depth: number, entry: string): Promise<GitWriteResult> => {
    const tree = await git(top, ["mktree", "-z"], verb, entry);
    return tree.code !== 0 || depth === 0 ? tree : nest(depth - 1, `040000 tree ${tree.stdout.trim()}\t${segments[depth - 1] ?? ""}\0`);
  };
  const mode = link ? LINK_MODE : executable ? "100755" : "100644";
  const tree = await nest(segments.length - 1, `${mode} blob ${blob.stdout.trim()}\t${segments.at(-1) ?? path}\0`);
  if (tree.code !== 0) return { patch: tree, step: "mktree" };
  const empty = await git(top, ["mktree"], verb, "");
  if (empty.code !== 0) return { patch: empty, step: "mktree" };
  const diff = await git(top, ["diff", "--binary", "--full-index", ...PATCH_PINS, `--output=${out}`, empty.stdout.trim(), tree.stdout.trim(), "--", path], verb);
  return { patch: diff, step: "diff" };
}

/** The repository's local tag names, read through the write runner; `[]` where git names none. */
async function localTags(top: string, verb: string): Promise<string[]> {
  const read = await git(top, ["for-each-ref", "--format=%(refname:strip=2)", "refs/tags/"], verb);
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
  /** The verb running, `checkpoint` or `end`, which every git call the step makes names (build/105). */
  verb: string;
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
 * `Run <run-id>`. The record's `## Blast radius` section (REQ-FLOW-127),
 * screened on its own, follows the body before the marker: passed to
 * `prBodyFrom`, else appended to the fixed body by `withBlastRadius`; on the
 * walk it is the walk's own record's, else the resumed run's, so a walk with
 * no new approval keeps the overnight one. A record with none keeps the
 * body as it was.
 */
async function draftPr(ctx: CliContext, at: PrInputs): Promise<PrStep> {
  const env: NodeJS.ProcessEnv = { ...ctx.app.runtime.env };
  const origin = await git(at.top, ["remote", "get-url", "origin"], at.verb);
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
  let listed = false; // whether `body` is prBodyFrom's, which places the section itself
  const source = at.unattended ? { run: at.run, base: at.base } : await resumedList(ctx, at, notDone);
  // REQ-FLOW-127: the record's `## Blast radius` section follows the body; on the walk, the walk's own, else the resumed run's.
  const resumedRecord = !at.unattended && source !== null ? `${ctx.engine.runs.layout.runRelPath(source.run)}/${ctx.engine.runs.layout.RECORD_FILE}` : null;
  const blastRadius = screenedBlastRadius(ctx, at.cwd, [at.recordRel, ...(resumedRecord === null ? [] : [resumedRecord])], notDone);
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
      const made = prBodyFrom(morning.text, source.run, { inferred, ...(blastRadius === null ? {} : { blastRadius }) });
      const screen = screenOutbound(made, "pr-body");
      body = made;
      listed = true;
      if (!screen.ok) {
        const where = screen.hits.map((hit) => `line ${hit.line} (${hit.rule})`).join(", ");
        notDone.push(`pull request body replaced: the outbound screen matched ${where}`);
        body = `Run \`${source.run}\`: the body made from \`${morningRel}\` was not posted, because the outbound screen matched its ${where}. Read the morning list on the branch.`;
        listed = false;
      }
    }
  }
  if (!listed) body = withBlastRadius(body, marked, blastRadius);
  const gh = (request: Parameters<typeof ghApi>[0]) => ghApi(request, { cwd: at.top, env });
  const outcome: PrOutcome = await ensureDraftPr(gh, { host: repo.host, owner: repo.owner, repo: repo.repo, head: at.branch, base: target, title, body, runId: marked });
  if ("notDone" in outcome) return { pr: null, inferred, notDone: [...notDone, outcome.notDone] };
  // review/73: the pull request this run opened or whose body it owns (never a person's, which gets a comment) is
  // recorded for `run land`, which merges that number alone.
  if (outcome.how !== "commented") {
    const unrecorded = await recordPullRequest(ctx, at.top, { run: marked, host: repo.host, owner: repo.owner, repo: repo.repo, number: outcome.number });
    if (unrecorded !== null) notDone.push(unrecorded);
  }
  return { pr: { number: outcome.number, url: outcome.url, how: outcome.how }, inferred, notDone };
}

/**
 * review/73: the pull request a run verb opened or updated, written atomically to {@link PR_RECORD_FILE} under the work
 * tree's own git directory, beside the pre-flight record; `null` once written, else the `notDone` line, by error code.
 */
async function recordPullRequest(ctx: CliContext, top: string, record: Parameters<typeof prRecordText>[0]): Promise<string | null> {
  const place = await gitSurfaceRecordPath(top);
  if ("unreadable" in place) return `pull request not recorded (${place.unreadable}), so run land refuses it`;
  const path = join(place.gitDir, ...PR_RECORD_FILE.split("/"));
  try {
    mkdirSync(dirname(path), { recursive: true });
    await ctx.engine.merge.atomicWrite.atomicWriteFile(path, prRecordText(record), { boundaryDir: place.gitDir, mode: 0o600 });
    return null;
  } catch (cause) {
    const code = (cause as { code?: unknown } | null)?.code;
    return `pull request not recorded (${PR_RECORD_FILE} in the git directory: ${typeof code === "string" ? code : "write failed"}), so run land refuses it`;
  }
}

/**
 * The `## Blast radius` section of the first record in `records` that holds
 * one (REQ-FLOW-127), screened as the body is (`screenOutbound`, `pr-body`);
 * `null` when none holds one. A record over {@link RECORD_READ_MAX_BYTES}
 * is not read, and a section the screen matches is left out, each named in
 * `notDone` and on stderr by line and rule, never by any part of the text.
 */
function screenedBlastRadius(ctx: CliContext, cwd: string, records: readonly string[], notDone: string[]): string | null {
  for (const rel of records) {
    const record = readCapped(join(cwd, rel), RECORD_READ_MAX_BYTES);
    if (record === null) continue;
    if (record.truncated) {
      const why = `blast radius not posted: ${rel} is over ${RECORD_READ_MAX_BYTES} bytes, so its section was not read`;
      notDone.push(why);
      ctx.io.err(`warning: ${why}\n`);
      return null;
    }
    const section = blastRadiusSection(record.text);
    if (section === null) continue;
    const screen = screenOutbound(section, "pr-body");
    if (screen.ok) return section;
    const where = screen.hits.map((hit) => `line ${hit.line} (${hit.rule})`).join(", ");
    const why = `blast radius not posted: the outbound screen matched ${rel}'s section at its ${where}`;
    notDone.push(why);
    ctx.io.err(`warning: ${why}\n`);
    return null;
  }
  return null;
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
  const base = named === null ? null : await commitAt(at.top, named, at.verb);
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
