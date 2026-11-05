import { lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { LAND_JOB_NAME } from "../../adapters/landWorkflow.ts";
import { autoShipVerdict, filesOverLimit, type AutoShipRules, type AutoShipVerdict } from "../../change/autoShip.ts";
import { CLASS_FILE } from "../../change/classify.ts";
import { matchesDeployingBranch } from "../../config/autonomy.ts";
import { personOnlyVerdict } from "../../hooks/personOnly.ts";
import { readGitSurface, SURFACE_RECORD_FILE, surfaceRefusal, type RecordFileReads } from "../../runs/gitSurface.ts";
import { hookPathsRead, setupRootsAt, type HookScratch } from "../../runs/hookPaths.ts";
import {
  askPathsOf,
  checkEvidence,
  closedOverAnother,
  decideLand,
  evidenceLine,
  ledgerEvidence,
  parseBranch,
  parseBranchRules,
  parseCheckRuns,
  parseEditorsPage,
  parseFileContent,
  parseFiles,
  parseIssueComments,
  parseMergeBase,
  parsePr,
  parseReactions,
  parseReviews,
  parseThreadsPage,
  ownPr,
  pollWhilePending,
  threadResolved,
  toolThreadIds,
  unresolvedThreads,
  waitsLine,
  withStatusLine,
  type CheckEvidence,
  type CheckRunRead,
  type ForwardFacts,
  type LandDecision,
  type LandInput,
  type LandPr,
  type PollClock,
  type RequiredCheck,
  type ThreadRead,
} from "../../runs/landEvidence.ts";
import { MORNING_EMPTY, MORNING_FILE, MORNING_REFUSED, screenOutbound } from "../../runs/morning.ts";
import { PR_RECORD_FILE, prRecordRefusal, resolveRepo, runMarker } from "../../runs/pullRequest.ts";
import { parseStateBlock, requestMarker, reviewToolVerdict, UNREAD_EDITOR, withoutRequestMarkers, type ReviewToolFacts, type ReviewToolVerdict } from "../../runs/reviewTool.ts";
import { gitProgramFor } from "../../shared/programPath.ts";
import { EngineError } from "../../types/errors.ts";
import type { ReviewToolConfig } from "../../types/manifest.ts";
import { classifyRange, namePaths, type RangeFacts } from "../engine/changeRange.ts";
import {
  ghApi,
  ghCommentEditors,
  ghMarkReady,
  ghMergePull,
  ghResolveReviewThread,
  ghReviewThreads,
  type GhApiOptions,
  type GhResponse,
  type MergeMethod,
} from "../engine/ghRunner.ts";
import { readGuardLegs } from "../engine/autonomyGate.ts";
import { trustedGh } from "../engine/ghTrust.ts";
import { gitWrite, gitWriteEnv, type GitWriteResult } from "../engine/gitWrite.ts";
import { encodeQuery, Held, READ_MAX_BYTES, readCapped, readLegs, readLooserKeys, readSetting, Refused, settingOfLegs, type LandSetting } from "../engine/landSetting.ts";
import { CliFailure } from "../kit/output.ts";
import type { CliContext, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";

/**
 * `stamity run land` (REQ-FLOW-132, REQ-FLOW-133): merge the run's own pull request, or fast-forward the default
 * branch to its head, when the evidence holds; else ask, or refuse naming every reason. Registered by `./run.ts`,
 * from which it imports nothing (a runtime cycle otherwise): the git surface re-check, the record reads and the
 * capped read are its own, over the same modules `run.ts` uses.
 *
 * **Its own pull request.** Found by its head branch (the record's `Branch:`, or `stamity/<run-id>` where that names
 * a default branch) and the run's marker ending its body; its head must be `HEAD` and origin's tip, its base the
 * default branch, its head repository origin's own. Already merged at `HEAD` is `already-landed`, exit 0.
 *
 * **The evidence** (`../../runs/landEvidence.ts`): the required check runs on the head (a ruleset's and the
 * branch protection's, else every check run there), the review threads, the ledger as the head commit holds it (the
 * work tree's copy must equal it), `mergeable_state`. The setting is the strictest of the default branch's, `HEAD`'s
 * and the work tree's manifest and the baked guard, read at the repository's top wherever the verb started, a project
 * below the top adding its own legs; a default branch with no manifest at the top refuses. `gh` must resolve outside the
 * work tree and the temp folders. Unattended, git's
 * surface must still be the pre-flight's (REQ-FLOW-131), at the start and again just before the act.
 *
 * **The factory's evidence.** A required check failing on the default branch's tip asks, and a tip that does not read asks
 * (REQ-FLOW-153); the branch is read again at each re-read, so a newer commit is the one judged. A deploying default branch
 * asks unless the change fits `autonomy.autoShip`, read from the commits that merge, with GitHub naming the merge base, holding
 * the class file and agreeing with the range (REQ-FLOW-152). A named review tool is read on the head, asked once where it has no
 * run there, and waited for: only its clean word passes (REQ-FLOW-154). The tip and the tool are read again before the act. A wait
 * that outlasts the verb ends as `asks` with `asks.pending`, which no `--approved` passes: the next call reads the tool's word.
 * On that clean word on the exact head, the tool's own open threads stop counting, and a `blocked` merge state waits on them, as a
 * rule requiring resolved conversations reads that way. Just before the act they are resolved, then the threads and the pull
 * request read again, so a resolve that fails, a thread still open or a state still `blocked` holds the merge (build/29, review/68).
 * While the tool is awaited they are a pending gap, `blocked` beside them too, so a head a fix round left them on still gets its
 * request; on any other verdict, a plain one.
 *
 * **The act.** `--ready` marks a draft ready only once the rest holds, then merges. Before the merge the body gains
 * one "evidence checked at" line, never "landed"; only after the merge call succeeds does `record.md` gain
 * `- <UTC> land: #<n> <sha> merged`. A killed process or a failed merge leaves the pull request open and its body
 * saying what was checked; its own state is what the next call reads. `--fast-forward` pushes `<sha>` to the default
 * branch with no force, through the shell guard's own table first, where no rule requires a pull request.
 *
 * **Job mode** (`--job --pr <n>`, REQ-FLOW-157): the land workflow's own call, on a fresh checkout of the head, which holds
 * nothing a session wrote under the git directory. It adds no trust: the evidence above is re-proved, and each of the three
 * reads that lived there has a stand-in the head or GitHub holds. The run comes from the marker ending the body, a pull request
 * with none being no run's; the number and the run's login from the record's `PR:` and `Login:` lines at the head; origin's tip
 * from REST. The login stands where `viewer` does above, in the author check, the thread rule and whose request markers count,
 * since `gh` is the job's token there and a person's thread the run closed must stay unresolved whichever account reads it. The
 * record at the head must read `Status: closed` with no `(blocked:`, and neither it nor the morning list may hold a `## Refused`
 * row, the rule step 4 of the unattended ending states. The git surface is not read, since no pre-flight ran here. The job writes
 * no `land:` line, the body's evidence line standing. A cloud run cannot ask the review tool, so the job does, through the same
 * request, and a silent tool sends no event, so the job waits it out in this one call. Its markers count as the run's, in every
 * land of a setup with the job on, and no one else's do.
 *
 * **A job's exit.** 0 on every normal end, pending or held; 1 for a true failure alone, a read or a write GitHub did not answer
 * as it should, the status line's own among them, since a green job and no line would hide the hold. A read that fails into a
 * decision is no such failure: it holds, with its line, and exits 0, as the threads read again after the resolve do. A hold
 * shows as the pull request's status line, never as a red job, since GitHub may put a failing job's run on the default branch's tip. Three ends
 * leave no line: a run still in progress, a head a newer job speaks for, and a pull request {@link ownPr} refuses, whose body is
 * not the run's to write, so its reason is only in the job's log. The method must pass every ruleset's `allowed_merge_methods`,
 * any linear-history rule and the repository's flags, merge before squash before rebase; none is a hold. So is a default branch
 * with no manifest at the top, and a refusal from a read of the setting past the verb's own folder: the top's legs from below it,
 * the setups elsewhere, the keys a head loosens. Each stops the land as in a session, and none of them turns a job red, so the job
 * off in a leg is judged on the top's and the project's legs first, ahead of the reads that can fail, and again on the setups.
 *
 * Exit 0 `landed` or `already-landed`; 1 `asks` or `refused` (the JSON's `outcome` is how a flow branches); 2 usage. A job's
 * exit is above.
 */

/** `--wait` polls every this many milliseconds. */
const POLL_MS = 30_000;
/** A job polls the review tool less often: one poll is about 9 calls, and every job on a repository shares `GITHUB_TOKEN`'s hourly allowance. */
const JOB_POLL_MS = 120_000;
/** review/79: after the ready mark, the merge state is read again every this many milliseconds, for at most the next. */
const READY_POLL_MS = 5_000;
const READY_MERGEABLE_MS = 60_000;
/**
 * review/90: the whole verb, every poll included, ends within 9 minutes of its start, under a client's ten-minute shell
 * call (decision D17; `--wait`'s cap in `./run.ts` is the same 9). No poll goes on past the budget less a reserve for the
 * reads, the evidence write and the merge that follow the last one.
 */
const LAND_BUDGET_MS = 9 * 60_000;
const ACT_RESERVE_MS = 30_000;

/**
 * The clock `--wait` and the read after the ready mark poll on. Mock seam: a test replaces `now` and `sleep`, since a
 * poll of 30 s or 5 s a step cannot run in a unit test's time; the verb itself never replaces them.
 */
export const LAND_CLOCK: PollClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise<void>((done) => setTimeout(done, ms)),
};
/** Pages read of a paged list; 100 entries each. */
const MAX_PAGES = 10;
/** GitHub lists at most 3,000 changed files, 30 pages of 100. */
const MAX_FILE_PAGES = 30;
/** What a job's `GITHUB_TOKEN` posts as: a login no person holds, which the token's own workflow alone writes under. */
const JOB_BOT = "github-actions[bot]";
/** A login as `viewer` names it: REST spells an app `app[bot]` where viewer names it `app` (review/94). */
const bareLogin = (login: string): string => login.replace(/\[bot\]$/, "").toLowerCase();
/** Why a thread someone wrote in stops the land, and the way out: GitHub may show it resolved, so this line is all a person has to go on (review/120). */
const closedOverReason = (id: string | undefined): string =>
  `someone else wrote in review thread ${id ?? "with no id"}, which GitHub may show as resolved: a person reopens it and closes it themselves, so the land reads it as theirs, and asks where another person wrote in it too`;
/** A branch name as it goes into a path unencoded, as the push check reads it. */
const PATH_BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]+$/;
/** The manifest below the project root: a pull request whose file list leaves it out cannot loosen a key. */
const MANIFEST_PATH = ".stamity/manifest.json";
/** The merge methods a job may take, in the order it prefers them. */
const MERGE_METHODS: readonly MergeMethod[] = ["merge", "squash", "rebase"];
/** The default branch's tip as read (REQ-FLOW-153): only `failing` is red. */
interface TipRead {
  failing: string[];
  unread: string | null;
  notRed: string[];
}
/** What the verb's JSON carries. */
interface LandResult {
  /** Job mode only. `pending`: evidence still to come, so the job did nothing. `not-a-run`: not the job's to land. */
  outcome: "landed" | "already-landed" | "asks" | "refused" | "would-land" | "pending" | "not-a-run";
  pr: { number: number; url: string; head: string } | null;
  evidence: {
    checks: { name: string; state: "green" | "pending" | "failing" | "missing" }[];
    threads: { unresolved: number | null };
    ledger: { open: string[] };
    held: string[];
    mergeableState: string | null;
    /** The default branch's tip: what fails there, why it did not read, and what is missing or pending, which is not red. */
    defaultBranch: TipRead;
    /** The named review tool's verdict on the head; `null` where none was read. */
    review: { state: string; reason: string } | null;
    /** Whether the change fits `autonomy.autoShip`; `null` where the rules were not read. */
    autoShip: AutoShipVerdict | null;
  };
  /**
   * review/110: every reason, `reason` the first for older readers, and the head an approval must name. `pending`: the
   * review tool is still awaited, so the next call decides, and an approval passes nothing.
   */
  asks?: { reason: string; reasons: string[]; act: string; head: string; pending?: true };
  /** review/103, review/110: the asks outcome the person approved with --approved <sha>, where the verb landed over one. */
  approved?: { sha: string; reason: string; reasons: string[]; act: string };
  notDone: string[];
}

/** The pre-flight record's reads (review/34): the kind by `lstat`, never through a link, and the capped read, which keeps the module's 64 KiB cap. */
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

/** The hook read's scratch folder (`../../runs/hookPaths.ts`): a fresh folder under the temp folder, removed whole after. */
const HOOK_SCRATCH: HookScratch = {
  create: () => mkdtempSync(join(tmpdir(), "stamity-hooks-")),
  place: (root, path, text) => {
    const file = join(root, ...path.split("/"));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  },
  remove: (root) => rmSync(root, { recursive: true, force: true }),
};

/** The run's git calls: `git`, whose failure to start is the verb's failure, and `gitLine`, one line of output or `null`. */
function landGit(cwd: string, unattended: boolean): { git: (args: readonly string[]) => Promise<GitWriteResult>; gitLine: (args: readonly string[]) => Promise<string | null> } {
  const git = async (args: readonly string[]): Promise<GitWriteResult> => {
    try {
      return await gitWrite(cwd, args, unattended ? { unattended: true } : {});
    } catch (cause) {
      throw new CliFailure({
        code: "FAILURE",
        message: `run land could not run git ${args[0] ?? ""}`.trimEnd(),
        why: cause instanceof Error ? sanitizeLabel(cause.message) : "git did not start or did not finish",
        next: "put git on PATH, then run it again",
      });
    }
  };
  const gitLine = async (args: readonly string[]): Promise<string | null> => {
    const read = await git(args);
    return read.code === 0 ? read.stdout.replace(/\r?\n$/, "") : null;
  };
  return { git, gitLine };
}

/** (2) Origin's repository, every push URL naming the same one. */
async function originRepoOf(gitLine: (args: readonly string[]) => Promise<string | null>, env: NodeJS.ProcessEnv): Promise<{ host: string; owner: string; repo: string }> {
  const fetchUrl = await gitLine(["remote", "get-url", "origin"]);
  const repo = fetchUrl === null ? null : resolveRepo(env, fetchUrl);
  if (repo === null) throw new Refused("origin names no GitHub repository gh reaches");
  const pushUrls = ((await gitLine(["remote", "get-url", "--push", "--all", "origin"])) ?? "").split(/\r?\n/).filter((url) => url.trim() !== "");
  for (const url of pushUrls) {
    const target = resolveRepo(env, url.trim());
    if (target === null || target.host !== repo.host || target.owner.toLowerCase() !== repo.owner.toLowerCase() || target.repo.toLowerCase() !== repo.repo.toLowerCase()) {
      throw new Refused("a push URL of origin names another repository than its fetch URL");
    }
  }
  return repo;
}

/** The run a pull request's body ends by naming, as job mode reads it (REQ-FLOW-157). */
const BODY_MARKER = /<!-- stamity:run (\S+) -->$/;

/**
 * Job mode's first read (REQ-FLOW-157): the run `number`'s body names, or the result that ends the call. The workflow starts
 * on every pull request a watched workflow passes on, so one no run opened is no failure: it exits 0 as `not-a-run`.
 */
async function jobTarget(ctx: CliContext, number: number): Promise<{ run: string; number: number } | { stop: CommandResult }> {
  const { cwd, env: given } = ctx.app.runtime;
  const env: NodeJS.ProcessEnv = { ...given };
  const stop = (outcome: "refused" | "not-a-run" | "already-landed", notDone: string[]): { stop: CommandResult } => {
    const reasons = notDone.map((entry) => sanitizeLabel(entry));
    ctx.io.out(`${[`pr: #${number}`, `outcome: ${outcome}`, ...reasons.map((entry) => `  - ${entry}`)].join("\n")}\n`);
    return { stop: { exitCode: outcome === "refused" ? 1 : 0, json: { subcommand: "land", run: null, outcome, pr: { number }, notDone: reasons } } };
  };
  try {
    const { gitLine } = landGit(cwd, true);
    const top = await gitLine(["rev-parse", "--show-toplevel"]);
    if (top === null) throw new Refused("the work tree's top could not be read");
    const ghOpts = trustedGh(cwd, env, top, []);
    const repo = await originRepoOf(gitLine, env);
    const reply = await answered(ghApi({ method: "GET", path: `repos/${repo.owner}/${repo.repo}/pulls/${number}`, hostname: repo.host }, ghOpts), "a read");
    const pr = reply.status === 200 ? parsePr(reply.json) : null;
    if (pr === null) throw new Refused(`the read of #${number} answered HTTP ${reply.status}`);
    const run = BODY_MARKER.exec(pr.body.trimEnd())?.[1] ?? "";
    if (!ctx.engine.runs.layout.isRunId(run)) return stop("not-a-run", [`#${number}'s body names no run, so the job leaves it as it is`]);
    // Read first, since a repository may delete the head branch on the merge, and a later event still starts a job.
    if (pr.merged) return stop("already-landed", []);
    if (pr.state !== "open") return stop("not-a-run", [`#${number} is closed, so the job leaves it as it is`]);
    return { run, number };
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    return stop("refused", error.reasons);
  }
}

export async function runLand(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
  const job = opts["job"] === true ? await jobTarget(ctx, Number(opts["pr"])) : null;
  if (job !== null && "stop" in job) return job.stop;
  const run = job?.run ?? String(opts["run"]);
  const { layout, resumeCard } = ctx.engine.runs;
  if (!layout.isRunId(run)) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `run land: --run ${JSON.stringify(sanitizeLabel(run))} is not a run id (YYYY-MM-DD_<lowercase-slug>)`,
      why: `a run id matches ${layout.RUN_ID_PATTERN.source}, the name of its folder under .stamity/runs/ and of its branch`,
      next: "pass the run folder's name exactly as it is on disk",
    });
  }
  const cwd = ctx.app.runtime.cwd;
  const env: NodeJS.ProcessEnv = { ...ctx.app.runtime.env };
  const runDir = layout.runRelPath(run);
  const recordRel = `${runDir}/${layout.RECORD_FILE}`;
  const record = readCapped(join(cwd, recordRel), layout.RECORD_HEAD_READ_BYTES);
  if (record === null) {
    throw new CliFailure({
      code: "FAILURE",
      message: `run land found no record at ${recordRel}`,
      why: "the verb reads the record's Mode: and Branch: before it reads anything else",
      next: "run it from the project root, naming the run folder that holds the record",
    });
  }
  const head = resumeCard.readRecordHead(record.text);
  const unattended = job !== null || resumeCard.readsUnattended(head.mode, env["STAMITY_UNATTENDED"]);
  const fastForward = opts["fastForward"] === true;
  /**
   * review/103, review/110: the person's answer to an `asks` outcome, given on the line the guard asks them about
   * (`a4`): the head commit they approved, which the asks outcome's JSON printed; `null` where none was given.
   */
  const approvedSha = typeof opts["approved"] === "string" ? opts["approved"].toLowerCase() : null;
  const approved = approvedSha !== null;
  const ready = opts["ready"] === true;
  let method = (typeof opts["method"] === "string" ? opts["method"] : "merge") as MergeMethod;
  const waitMinutes = typeof opts["wait"] === "number" ? opts["wait"] : 0;
  let budgetEnd = LAND_CLOCK.now() + LAND_BUDGET_MS - ACT_RESERVE_MS;

  const result: LandResult = {
    outcome: "refused",
    pr: null,
    evidence: { checks: [], threads: { unresolved: null }, ledger: { open: [] }, held: [], mergeableState: null, defaultBranch: { failing: [], unread: null, notRed: [] }, review: null, autoShip: null },
    notDone: [],
  };
  const lines: string[] = [`run: ${run} (${job !== null ? "job" : unattended ? "unattended" : "attended"})`];
  /** A true failure in a job, the one end that exits 1 there. */
  let jobFailed = false;
  const finish = (): CommandResult => {
    result.notDone = result.notDone.map((entry) => sanitizeLabel(entry));
    if (result.pr !== null) lines.push(`pr: #${result.pr.number} ${result.pr.url} at ${result.pr.head}`);
    const { checks, threads, ledger, held, mergeableState, review } = result.evidence;
    if (checks.length > 0) lines.push(`checks: ${checks.map((check) => `${check.name} ${check.state}`).join(", ")}`);
    if (threads.unresolved !== null) lines.push(`threads: ${threads.unresolved} unresolved`);
    lines.push(`ledger: ${ledger.open.length} open Critical/Warning rows`, ...(held.length === 0 ? [] : [`asks for: ${held.join(", ")}`]));
    if (mergeableState !== null) lines.push(`mergeable_state: ${mergeableState}`);
    if (review !== null) lines.push(`review: ${review.state}: ${sanitizeLabel(review.reason)}`);
    if (result.asks !== undefined) {
      const next = result.asks.pending === true ? "pending: run land again for the review tool's word; no approval passes a wait" : `approve with: --approved ${result.asks.head} (${result.asks.act}, the head commit these reasons hold for)`;
      lines.push(...result.asks.reasons.map((reason) => `asks: ${sanitizeLabel(reason)}`), next);
    }
    lines.push(`outcome: ${result.outcome}`);
    const notDone = result.notDone;
    ctx.io.out(`${[...lines, ...(notDone.length === 0 ? [] : ["Not done:", ...notDone.map((entry) => `  - ${entry}`)])].join("\n")}\n`);
    const landed = ["landed", "already-landed", "would-land"].includes(result.outcome) || (job !== null && !jobFailed);
    return { exitCode: landed ? 0 : 1, json: { subcommand: "land", run, ...result, ...(ctx.dryRun ? { dryRun: true } : {}) } };
  };
  // An attended close opens its pull request with `checkpoint --pr`, so no `end` stamped it: a person lands it, and it is no failure.
  if (job !== null && head.mode === "attended" && !/^PR: /m.test(record.text)) {
    result.outcome = "not-a-run";
    result.notDone.push("an attended run's pull request, which no run end stamped, so the job leaves it as it is");
    return finish();
  }

  const { git, gitLine } = landGit(cwd, unattended);
  /** review/97 (REQ-FLOW-131): unattended, git's surface must be the one the pre-flight recorded, a passing one; no pre-flight ran for a job. */
  const surfaceMoved = async (): Promise<string | null> => {
    if (!unattended || job !== null) return null;
    const dir = await gitLine(["rev-parse", "--git-dir"]);
    const place = dir === null || dir === "" ? { unreadable: "git rev-parse --git-dir answered no folder" } : { path: join(resolve(cwd, dir), ...SURFACE_RECORD_FILE.split("/")) };
    const readNow = () => {
      const surfaceEnv = gitWriteEnv(process.env, { unattended: true });
      return readGitSurface((args) => gitWrite(cwd, args, { unattended: true }), surfaceEnv, gitProgramFor(cwd, surfaceEnv));
    };
    return surfaceRefusal(place, RECORD_READS, readNow, "push");
  };

  /** build/6: writes why the merge waits into the run's own pull request, once that pull request is known; a no-op before. */
  let noteWaits = async (reasons: readonly string[]): Promise<void> => {
    void reasons;
  };
  /** A job writes why only for a normal end, set where one is reached: a true failure's red run says it. */
  let bodyTakesWaits = job === null;
  try {
    // review/103: --approved is the person's answer; an unattended run has no person to give it, so it refuses first.
    if (approved && unattended) throw new Refused("--approved is the person's answer to an asks outcome, and this run is unattended, so no person gave it");
    const top = await gitLine(["rev-parse", "--show-toplevel"]);
    if (top === null) throw new Refused("the work tree's top could not be read");
    const prefix = (await gitLine(["rev-parse", "--show-prefix"])) ?? "";
    const ghOpts = trustedGh(cwd, env, top, lines);
    const moved = await surfaceMoved();
    if (moved !== null) throw new Refused(moved);

    // (2) Origin's repository, the default branch, and the run's branch.
    const repo = await originRepoOf(gitLine, env);
    const repoPath = `repos/${repo.owner}/${repo.repo}`;
    const call = (path: string): Promise<GhResponse> => answered(ghApi({ method: "GET", path, hostname: repo.host }, ghOpts), "a read");
    const json = async (path: string, what: string): Promise<unknown> => {
      const reply = await call(path);
      if (reply.status !== 200) throw new Refused(`${what} answered HTTP ${reply.status}`);
      return reply.json;
    };
    const about = await json(repoPath, "the repository read");
    const defaultBranch = typeof about === "object" && about !== null ? (about as Record<string, unknown>)["default_branch"] : undefined;
    if (typeof defaultBranch !== "string" || !PATH_BRANCH.test(defaultBranch)) throw new Refused("GitHub named no default branch this verb reads");
    const defaults = [...new Set([defaultBranch, "main", "master"].map((name) => name.toLowerCase()))];
    if (head.branch === null) throw new Refused(`${recordRel} names no Branch:`);
    const runBranch = defaults.includes(head.branch.toLowerCase()) ? `stamity/${run}` : head.branch;
    if (!PATH_BRANCH.test(runBranch)) throw new Refused(`the run's branch ${runBranch} holds characters this verb does not read`);
    const sha = await gitLine(["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
    if (sha === null || !/^[0-9a-f]{40,64}$/.test(sha)) throw new Refused("HEAD names no commit");
    // review/110: the approval holds for the commit the person approved, and no other.
    const headMoved = (now: string): Refused => new Refused(`the head moved since the approval: ${approvedSha ?? ""} → ${now}`);
    if (approvedSha !== null && sha !== approvedSha) throw headMoved(sha);
    // REQ-FLOW-157: a job has no pre-flight, no session and no credential in its clone, so it reads the run's end from the
    // head, and origin's tip from REST: `git ls-remote` would need the token the checkout was told not to keep.
    const ended = job === null ? null : await endedAtHead({ sha, recordRel, morningRel: `${runDir}/${MORNING_FILE}`, number: job.number }, git, (text) => resumeCard.readRecordHead(text).status);
    const runLogin = ended?.login ?? undefined;
    const readOriginTip = async (): Promise<string | null> => {
      if (job !== null) return parseBranch(await json(`${repoPath}/branches/${runBranch}`, "the run's branch read"))?.tip ?? null;
      const remote = await git(["ls-remote", "origin", `refs/heads/${runBranch}`]);
      if (remote.code !== 0) throw new Refused(`git ls-remote origin answered ${remote.code}`);
      return /^([0-9a-f]{40,64})\t/.exec(remote.stdout)?.[1] ?? null;
    };
    const originTip = await readOriginTip();

    // (3) The run's own pull request: from the run's branch, into the default branch, its body ending with the marker,
    // and the number the run verb recorded when it opened the draft (review/73). A job has its number from `--pr`, held
    // against the head's `PR:` line above; `ownPr` reads the rest of this below.
    const marker = runMarker(run);
    const recordedNumber = async (): Promise<number> => {
      const listed = await json(`${repoPath}/pulls?head=${encodeQuery(`${repo.owner}:${runBranch}`)}&base=${encodeQuery(defaultBranch)}&state=all&per_page=100`, "the pull request lookup");
      const numbers = (Array.isArray(listed) ? listed : [])
        .map((entry) => parsePrSummary(entry))
        .filter((entry) => entry !== null && entry.headRef === runBranch && entry.body.trimEnd().endsWith(marker))
        .map((entry) => (entry as { number: number }).number);
      if (numbers.length === 0) throw new Refused(`no pull request from ${runBranch} into ${defaultBranch} ends with the run's marker`);
      const newest = Math.max(...numbers);
      const gitDir = await gitLine(["rev-parse", "--git-dir"]);
      const recordPlace = gitDir === null || gitDir === "" ? { unreadable: "git rev-parse --git-dir answered no folder" } : { path: join(resolve(cwd, gitDir), ...PR_RECORD_FILE.split("/")) };
      const unrecorded = prRecordRefusal(recordPlace, RECORD_READS, { run, host: repo.host, owner: repo.owner, repo: repo.repo, number: newest });
      if (unrecorded !== null) throw new Refused(unrecorded);
      return newest;
    };
    const number = job?.number ?? (await recordedNumber());
    // review/73 and the login source: the login gh is authenticated as comes from the thread query's viewer, one source
    // for the author check and the thread rule; an app installation token answers it where it refuses `GET user`. In a job
    // that login is the job's token, so `viewer`, the run's own login, is the head's `Login:` and `actor` alone is gh's.
    const firstThreads = await reviewThreads(repo.host, repo.owner, repo.repo, number, ghOpts, runLogin);
    if (firstThreads === null) throw new Refused("the review threads could not be read, nor with them the login gh is authenticated as");
    const actor = firstThreads.viewer;
    // A head with no `Login:` is held below, on the status line, for which the pull request must still read as the run's.
    const viewer = ended === null ? actor : (runLogin ?? firstThreads.author ?? actor);
    // review/94: the pull request's author from the same query, in the spelling viewer has, never REST's user.login.
    const prAuthor = firstThreads.author;
    const readPr = async (): Promise<LandPr> => {
      const pr = parsePr(await json(`${repoPath}/pulls/${number}`, `the read of #${number}`));
      if (pr === null) throw new Refused(`GitHub's answer for #${number} names no pull request this verb reads`);
      return { ...pr, author: prAuthor };
    };
    const computing = (now: LandPr): boolean => now.mergeableState === null || now.mergeableState === "unknown";
    // A job gets one start per event, so an answer GitHub has not computed yet is waited out here, not left to a next call.
    let pr = job === null ? await readPr() : await pollWhilePending(readPr, computing, Math.min(LAND_CLOCK.now() + READY_MERGEABLE_MS, budgetEnd), READY_POLL_MS, LAND_CLOCK);
    result.pr = { number: pr.number, url: pr.url, head: pr.headSha };
    result.evidence.mergeableState = pr.mergeableState;
    const own = { repo: `${repo.owner}/${repo.repo}`, runBranch, head: sha, originTip, marker, defaultBranch, viewer };
    // build/6: from here the pull request is known; on asks or refused, why its merge waits goes into its own body,
    // while it still reads as the run's own, open and unmerged. A dry run writes nothing.
    noteWaits = async (reasons: readonly string[]): Promise<void> => {
      const check = ownPr(pr, own);
      if (!bodyTakesWaits || ctx.dryRun || reasons.length === 0 || check.already || check.refusals.length > 0) return;
      const wanted = waitsLine(reasons.map((reason) => sanitizeLabel(reason)));
      const line = screenOutbound(wanted, "pr-body").ok ? wanted : `${waitsLine(["reasons not posted, since the outbound screen matched them; read the run's record"])}`;
      try {
        const written = await ghApi({ method: "PATCH", path: `${repoPath}/pulls/${number}`, body: { body: withStatusLine(pr.body, marker, line) }, hostname: repo.host }, ghOpts);
        if (written.status === 200) return;
        result.notDone.push(`why the merge waits was not written into #${number}'s body (HTTP ${written.status})`);
      } catch {
        result.notDone.push(`why the merge waits was not written into #${number}'s body (gh failed before GitHub answered)`);
      }
      // review/121: in a job this line is the hold's only sign, so a green run with no line would hide it.
      jobFailed = job !== null;
    };

    if (ended !== null && ended.holds.length > 0) throw new Held(!ended.inProgress, ...ended.holds);

    // (4) The legs of the setting: the default branch's, HEAD's and the work tree's manifest and the baked guard, read at the top
    // wherever the verb started, a project below the top adding its own. The job's hold is judged on them here, ahead of every read
    // that can fail below, and again once the setups elsewhere are read.
    const legs = await readLegs({ top, cwd, prefix }, repoPath, defaultBranch, gitLine, call, readGuardLegs);
    // REQ-FLOW-157: the strictest read keeps `landJob` only where every leg holds it equal, so no head turns the job on for itself.
    const holdJobOff = (now: LandSetting): void => {
      if (job !== null && now.landJob === undefined) throw new Held(true, "autonomy.landJob is not on in every leg of the setting, so the job does not land here");
    };
    holdJobOff(settingOfLegs(legs));

    // (5) The changed files, every page, a rename's old name included.
    const files: string[] = [];
    let counted = 0;
    for (let page = 1; page <= MAX_FILE_PAGES && counted < pr.changedFiles; page += 1) {
      // oxlint-disable-next-line no-await-in-loop -- a page past the last is not asked for; the count read so far decides
      const read = parseFiles(await json(`${repoPath}/pulls/${number}/files?per_page=100&page=${page}`, "the changed files read"));
      if (read === null) throw new Refused("the changed files did not read");
      files.push(...read.paths);
      counted += read.count;
      if (read.count < 100) break;
    }

    // (6) The required checks: the rulesets' and the branch protection's; a 403 or 404 on the rules falls back to all.
    const rules = await call(`${repoPath}/rules/branches/${defaultBranch}`);
    const ruleRead = rules.status === 200 ? parseBranchRules(rules.json) : null;
    if (rules.status === 200 && ruleRead === null) throw new Refused("the branch rules did not read");
    if (job !== null) {
      const allowed = allowedMethod(rules.status === 200 ? rules.json : null, about);
      if (allowed === null) throw new Held(true, `no merge method is allowed on ${defaultBranch}, so the job has none to take`);
      method = allowed;
    }
    const branch = parseBranch(await json(`${repoPath}/branches/${defaultBranch}`, "the default branch read"));
    if (branch === null) throw new Refused("the default branch did not read");
    const required: RequiredCheck[] = [...(ruleRead?.required ?? []), ...branch.required];
    const readChecks = async (): Promise<CheckEvidence> => checkEvidence(required, await checkRuns(json, repoPath, sha));
    /**
     * REQ-FLOW-153: the required checks of the tip as it stands now, read from the branch each time, so a commit landed since
     * the last read is the one judged. A context missing or pending there is not red, and a read that fails asks.
     */
    const readTip = async (): Promise<TipRead> => {
      try {
        const latest = parseBranch(await json(`${repoPath}/branches/${defaultBranch}`, "the default branch read"));
        if (latest === null) throw new Refused("the default branch did not read");
        // The land job's own run may sit on the tip, and a job's hold or failure says nothing of the branch.
        const now = checkEvidence(required, (await checkRuns(json, repoPath, latest.tip)).filter((entry) => entry.name !== LAND_JOB_NAME));
        return { failing: now.failing, unread: null, notRed: [...now.pending, ...now.missing] };
      } catch (error) {
        if (!(error instanceof Refused)) throw error;
        return { failing: [], unread: error.message, notRed: [] };
      }
    };

    // build/2, review/74, review/80: the hook files and the scripts the repository's own declarations name, at Base:,
    // at the head and at the default branch's tip, ask in every mode: a run that edits a declared hook script reaches
    // every later session's hook, whichever of the three declares it.
    // REQ-FLOW-102: from every setup root the three trees hold, as the hold reads them.
    const { paths: hookPaths, setups } = await declaredHookPaths({ base: head.base, head: sha, tip: branch.tip, defaultBranch, prefix }, git, gitLine);
    result.evidence.held = askPathsOf(files, setups, typeof hookPaths === "string" ? [] : hookPaths);

    // (4b) The setting whole: the legs above and what any other setup on the default branch names, read here for the list.
    // A list that did not read has asked already, through `hookPaths`.
    const setting = await readSetting(legs, { prefix, setups }, repoPath, defaultBranch, call);
    holdJobOff(setting);
    // Only a pull request that changes a manifest the setting reads can loosen a key, and those are the top's, the verb's own folder's and
    // every setup the list names: a default branch tightened since the fork loosens nothing here.
    const changedRoots = [...new Set(["", prefix, ...setups])].filter((root) => files.includes(`${root}${MANIFEST_PATH}`));
    const looserKeys = await readLooserKeys(changedRoots, repoPath, defaultBranch, gitLine, call);
    // Legs that disagree on the review tool go to a person: `setting.reviewTool` is then only the first leg's, and it judges nothing.
    const tool = setting.reviewToolConflict.length === 0 ? setting.reviewTool : undefined;
    // A job has no client's shell limit and no next call to leave a wait to: its budget takes in the tool's whole wait.
    if (job !== null) budgetEnd += (tool?.waitMinutes ?? 0) * 60_000;
    // REQ-FLOW-152: read only where it can spare an ask, the tip being in this clone by now.
    const autoShip =
      setting.autoShip !== undefined && matchesDeployingBranch(defaultBranch, setting.deployingBranches)
        ? await autoShipRead(cwd, { tip: branch.tip, head: sha, prefix, files, pr }, setting.autoShip, (path) => call(`${repoPath}/${path}`))
        : undefined;

    // (7) The review threads, every page, read again on every later read (review/72).
    const toolOwn = (read: readonly ThreadRead[]): string[] => (tool === undefined ? [] : toolThreadIds(read, tool.login, viewer));
    /** build/29: the open threads only the tool holds, as last read; `run land` alone closes these. */
    let toolOpen = toolOwn(firstThreads.threads);
    /** Every thread as last read. */
    let lastThreads = firstThreads.threads;
    /** The accounts a job writes as, beside the run's own: a thread one of them closed was closed by the land, not by a person. */
    const jobLogins = [...(setting.landJob === undefined ? [] : [JOB_BOT]), ...(job === null ? [] : [actor])].map(bareLogin);
    /**
     * Threads a job closed over someone's comment, which `unresolvedThreads` does not count, since it reads the run's login alone.
     * Counted so a later job, or a session, does not land past a person the race let the job close over. A resolver that reads null
     * may be the job's own account, so it counts over a person's comment; over bots' comments alone it does not, or a review bot
     * closing its own thread would stop every land (review/119).
     */
    const closedOver = (read: readonly ThreadRead[]): ThreadRead[] =>
      read.filter((entry) => {
        if (!entry.isResolved) return false;
        if (entry.resolvedBy === null) return joinedBySomeone({ ...entry, authors: entry.authors.filter(({ person }) => person) }, tool?.login, viewer);
        return bareLogin(entry.resolvedBy) !== bareLogin(viewer) && jobLogins.includes(bareLogin(entry.resolvedBy)) && joinedBySomeone(entry, tool?.login, viewer);
      });
    const readThreads = async (): Promise<number | null> => {
      const read = await reviewThreads(repo.host, repo.owner, repo.repo, number, ghOpts, runLogin);
      const usable = read !== null && read.viewer.toLowerCase() === actor.toLowerCase();
      toolOpen = usable ? toolOwn(read.threads) : [];
      lastThreads = usable ? read.threads : [];
      return usable ? read.count + closedOver(read.threads).length : null;
    };
    let threads: number | null = firstThreads.count + closedOver(firstThreads.threads).length;

    // (8) The ledger as the head commit holds it, and the work tree's copy, which must equal it.
    const ledger = await ledgerAt(cwd, sha, `${runDir}/${layout.LEDGER_FILE}`, git);
    result.evidence.ledger.open = "open" in ledger ? ledger.open : [];

    // (9) For --fast-forward: whether a rule may require a pull request, and whether the head moves the tip forward.
    let forward: ForwardFacts | undefined;
    if (fastForward) {
      const compare = await call(`${repoPath}/compare/${branch.tip}...${sha}`);
      const status = compare.status === 200 && typeof compare.json === "object" && compare.json !== null ? (compare.json as Record<string, unknown>)["status"] : null;
      const requiresPr =
        rules.status !== 200
          ? "the branch rules could not be read, so a fast-forward could pass a rule that requires a pull request"
          : ruleRead?.requiresPr === true
            ? `a rule requires a pull request on ${defaultBranch}, so the fast-forward is the person's`
            : branch.protectedBranch
              ? `${defaultBranch}'s branch protection may require a pull request, which only an admin reads`
              : null;
      forward = { requiresPr, compare: typeof status === "string" ? status : null };
    }

    // (9b) The review tool's three reads, the editors last, so an edit landing between the reads shows as a foreign editor.
    // Only the run's own request markers go in: a stranger's cannot spend a round or stand for a request. With the land job on
    // the job's token asks too, so its markers count in every land, and in a job whatever login that token proves to be.
    const requesters = new Set([bareLogin(viewer), ...jobLogins]);
    const fromRun = (login: string): boolean => requesters.has(bareLogin(login));
    const readFacts = async (): Promise<ReviewToolFacts> => {
      const comments = await everyPage(json, `${repoPath}/issues/${number}/comments`, "the pull request's comments read", parseIssueComments);
      const reviews = await everyPage(json, `${repoPath}/pulls/${number}/reviews`, "the pull request's reviews read", parseReviews);
      const reactions = await everyPage(json, `${repoPath}/issues/${number}/reactions`, "the pull request's reactions read", parseReactions);
      const editors = await commentEditors(repo.host, repo.owner, repo.repo, number, ghOpts);
      return {
        head: sha,
        now: LAND_CLOCK.now(),
        comments: comments.map(({ id, userLogin, userType, body, createdAt }) => ({
          id,
          userLogin,
          userType,
          createdAt,
          body: fromRun(userLogin) ? body : withoutRequestMarkers(body),
          editor: editors?.has(id) === true ? (editors.get(id) as string | null) : UNREAD_EDITOR,
        })),
        reviews,
        reactions,
      };
    };
    let facts: ReviewToolFacts | undefined;
    let review: ReviewToolVerdict | undefined;
    const readReview = async (): Promise<void> => {
      if (tool === undefined) return;
      facts = await readFacts();
      review = reviewToolVerdict(facts, tool);
    };
    await readReview();
    let tip = await readTip();
    /**
     * build/29: the threads set aside, those of the tool's own while it reads clean on this exact head. A reaction's clean names
     * no commit, so it sets nothing aside; once the resolve has run, nothing is set aside and the re-read count stands alone.
     */
    let resolving = true;
    const setAside = (now: LandPr): string[] => (resolving && tool !== undefined && tool.clean !== "reaction" && review?.state === "clean" && review.head === now.headSha ? toolOpen : []);

    const inputFor = (now: LandPr, checks: CheckEvidence, beforeReady: boolean): LandInput => ({
      pr: now,
      own,
      ready,
      beforeReady,
      setting,
      files: { paths: files, complete: counted === now.changedFiles },
      prefix: setups,
      hookPaths,
      checks,
      threads: threads === null ? null : threads - setAside(now).length,
      pendingThreads: threads !== null && review?.state === "waiting" ? toolOpen.length : 0,
      setAsideThreads: setAside(now).length,
      closedThreads: closedOverAnother(lastThreads, viewer),
      ledger,
      looserKeys,
      reviewToolConflict: setting.reviewToolConflict,
      defaultBranchRed: tip,
      ...(forward === undefined ? {} : { forward }),
      ...(review === undefined ? {} : { reviewTool: review }),
      ...(autoShip === undefined ? {} : { autoShip }),
    });
    /** The decision, each thread {@link closedOver} named beside the count: GitHub shows those resolved, so the count alone gives a person nothing to act on (review/120). */
    const decide = (input: LandInput): LandDecision => {
      const decision = decideLand(input);
      return decision.outcome === "refused" ? { ...decision, reasons: [...decision.reasons, ...closedOver(lastThreads).map((entry) => closedOverReason(entry.id))] } : decision;
    };
    const show = (checks: CheckEvidence, now: LandPr): void => {
      result.pr = { number: now.number, url: now.url, head: now.headSha };
      result.evidence.mergeableState = now.mergeableState;
      result.evidence.threads.unresolved = threads;
      result.evidence.defaultBranch = tip;
      result.evidence.review = review === undefined ? null : { state: review.state, reason: review.reason };
      result.evidence.autoShip = autoShip ?? null;
      result.evidence.checks = [
        ...checks.green.map((name) => ({ name, state: "green" as const })),
        ...checks.pending.map((name) => ({ name, state: "pending" as const })),
        ...checks.failing.map((name) => ({ name, state: "failing" as const })),
        ...checks.missing.map((name) => ({ name, state: "missing" as const })),
      ];
    };
    let checks: CheckEvidence = await readChecks();
    const deadline = job === null ? Math.min(LAND_CLOCK.now() + waitMinutes * 60_000, budgetEnd) : budgetEnd;
    /** One fresh read of everything that moves: the check runs, the threads, the tip, the tool and (after any ready mark, and always in a job) the pull request. */
    const reread = async (beforeReady: boolean): Promise<LandDecision> => {
      checks = await readChecks();
      threads = await readThreads();
      if (!beforeReady || job !== null) pr = await readPr();
      tip = await readTip();
      await readReview();
      return decide(inputFor(pr, checks, beforeReady));
    };
    const pending = (decision: LandDecision): boolean => decision.outcome === "refused" && decision.pending;
    /** Whether the review request failed to post, leaving no marker for the tool's wait to run from. */
    let requestFailed = false;
    /**
     * REQ-FLOW-154: asks the tool on a head whose only stops are waits, so no round goes on a head that cannot land, and
     * only where the run has not asked on it yet. A run the tool started itself gets the marker alone (build/11): the clock
     * starts and no second run does. A head it already finished with findings gets the marker alone too, whatever else stops
     * that head, so a tool reviewing every push still spends its rounds (review/47). A dry run writes nothing, and a request
     * that fails ends the wait, since with no marker no wait could end: a job leaves its status line, a session refuses.
     */
    const askTool = async (now: LandDecision, beforeReady: boolean): Promise<LandDecision> => {
      if (tool === undefined || facts === undefined || ctx.dryRun) return now;
      const standing = ownPr(pr, own);
      const finished = review?.state === "findings" && !standing.already && standing.refusals.length === 0;
      if (!finished && (!pending(now) || review?.state !== "waiting")) return now;
      const asked = requestMarker(sha);
      if (facts.comments.some((comment) => comment.body.includes(asked))) return now;
      const body = ranOnHead(facts, tool) ? asked : `${tool.request}\n\n${asked}`;
      const written = await ghApi({ method: "POST", path: `${repoPath}/issues/${number}/comments`, body: { body }, hostname: repo.host }, ghOpts).catch(() => null);
      if (written?.status === 201) return reread(beforeReady);
      result.notDone.push(`the review request was not posted to #${number} (${written === null ? "gh failed before GitHub answered" : `HTTP ${written.status}`})`);
      requestFailed = true;
      return now;
    };
    /**
     * Nothing waits on a request that never posted, which no wait ends. A job waits on the tool alone, whose silence sends no
     * event; anything else pending goes on the status line, since a check outside the watched workflows sends no event either.
     */
    const worthWaiting = (now: LandDecision): boolean => pending(now) && !requestFailed && (job === null || review?.state === "waiting");
    /** `--wait`: while only pending checks or an uncomputed merge state stop it, sleep a poll's interval, then read again. */
    const waitOut = async (decision: LandDecision, beforeReady: boolean): Promise<LandDecision> => {
      let now = decision;
      if (waitMinutes === 0 && job === null) return now;
      const poll = job === null ? POLL_MS : JOB_POLL_MS;
      while (worthWaiting(now) && LAND_CLOCK.now() + poll <= deadline) {
        // oxlint-disable-next-line no-await-in-loop -- a poll: each read waits out the interval after the last one
        await LAND_CLOCK.sleep(poll);
        // oxlint-disable-next-line no-await-in-loop -- the next read decides whether the wait goes on
        now = await reread(beforeReady);
      }
      return now;
    };

    // (10) The decision; --ready on a draft decides first on what does not need the ready state. review/103: with
    // --approved an asks outcome goes on to the act as a land does; every refused condition still refuses.
    const proceeds = (now: LandDecision): boolean => now.outcome === "land" || (approved && now.outcome === "asks");
    const draftReady = pr.draft && ready;
    let decision = await waitOut(await askTool(decide(inputFor(pr, checks, draftReady)), draftReady), draftReady);
    if (proceeds(decision) && draftReady && !ctx.dryRun) {
      const marked = await answered(ghMarkReady({ hostname: repo.host, id: pr.nodeId }, ghOpts), "the ready mark");
      if (marked.status !== 200 || typeof marked.json !== "object" || marked.json === null || "errors" in marked.json) {
        throw new Refused(`marking #${number} ready answered HTTP ${marked.status}${marked.status === 200 ? " with errors" : ""}`);
      }
      lines.push(`ready: marked #${number} ready for review`);
      // review/79, review/90: GitHub computes the merge state after the mark; it is read again until computed, at most
      // 60 s and never past the verb's budget, and still uncomputed it refuses as not computed yet.
      pr = await pollWhilePending(readPr, computing, Math.min(LAND_CLOCK.now() + READY_MERGEABLE_MS, budgetEnd), READY_POLL_MS, LAND_CLOCK);
      decision = await waitOut(await reread(false), false);
    } else if (proceeds(decision) && draftReady) {
      lines.push(`ready: would mark #${number} ready for review`);
    }
    // review/110: the pull request's head as last read must still be the approved commit.
    if (approvedSha !== null && pr.headSha !== approvedSha) throw headMoved(pr.headSha);
    // review/72, review/78: the threads once more just before the act, and the decision on that last count; a dry run
    // on a draft decides on its merge state as it reads now (review/82), which a ready mark has not computed yet.
    // The tip and the tool too, the tool's word against the pull request's head as it reads now.
    if (proceeds(decision)) {
      threads = await readThreads();
      tip = await readTip();
      if (tool !== undefined) pr = await readPr();
      await readReview();
      decision = decide(inputFor(ctx.dryRun && draftReady ? { ...pr, draft: false } : pr, checks, false));
    }
    show(checks, pr);
    if (decision.outcome === "already-landed") {
      result.outcome = "already-landed";
      if (!ctx.dryRun && job === null) await noteLanded(ctx, cwd, recordRel, number, sha, fastForward && !pr.merged ? "fast-forwarded" : "merged", result);
      return finish();
    }
    if (decision.outcome === "refused" && decision.pending && job !== null) {
      result.outcome = "pending";
      result.notDone.push(...decision.reasons);
      bodyTakesWaits = true;
      await noteWaits(result.notDone);
      return finish();
    }
    if (decision.outcome === "refused") {
      bodyTakesWaits = true;
      // A tool wait runs up to `waitMinutes`, past the verb's budget, so what is left of it goes to the next call.
      // A request that did not post is no wait: the next call would only hear the same, so this refuses (review/49).
      if (decision.pending && review?.state === "waiting" && !requestFailed) {
        const [reason = ""] = decision.reasons;
        result.outcome = "asks";
        result.asks = { reason, reasons: decision.reasons, act: fastForward ? "push-default" : "pr-merge", head: sha, pending: true };
      } else {
        result.notDone.push(...decision.reasons);
      }
      await noteWaits(decision.reasons);
      return finish();
    }
    const approval =
      decision.outcome === "asks" && approvedSha !== null ? { sha: approvedSha, reason: decision.reason, reasons: decision.reasons, act: decision.act } : null;
    if (approval !== null) lines.push(`approved: by the person for ${approval.sha}, over ${approval.reasons.map((reason) => sanitizeLabel(reason)).join("; ")}`);
    if (decision.outcome === "asks" && approval === null) {
      result.outcome = "asks";
      // review/110: every reason, and the head an approval must name (`--approved <head>`).
      result.asks = { reason: decision.reason, reasons: decision.reasons, act: decision.act, head: sha };
      bodyTakesWaits = true;
      await noteWaits([`${decision.reasons.join("; ")} (a person decides: ${decision.act})`]);
      return finish();
    }
    if (ctx.dryRun) {
      result.outcome = "would-land";
      const toResolve = setAside(pr).length;
      if (toResolve > 0) lines.push(`threads: would resolve ${toResolve} of the tool's own, and only then is the merge state judged`);
      lines.push(fastForward ? `act: would fast-forward ${defaultBranch} to ${sha}` : `act: would merge #${number} at ${sha} (${method})`);
      return finish();
    }

    // (11) The act: the surface again, the evidence line in the body, the merge or the push, then the record's line.
    const movedNow = await surfaceMoved();
    if (movedNow !== null) throw new Refused(movedNow);
    // review/110: and the work tree's HEAD, read again just before the act, is still the approved commit.
    if (approvedSha !== null) {
      const headNow = await gitLine(["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
      if (headNow !== approvedSha) throw headMoved(headNow ?? "no commit");
    }
    // review/177: the shell guard's verdict on the fast-forward's push, before anything is written into the body. A
    // default branch the setting also names as deploying reads `push-deploying` first, which passes only on the
    // person's approval, since the decision put that reason in front of them.
    const refspec = `${sha}:refs/heads/${defaultBranch}`;
    if (fastForward) {
      let verdict: ReturnType<typeof personOnlyVerdict>;
      try {
        verdict = personOnlyVerdict(`git push origin ${refspec}`, { defaultBranches: defaults, currentBranch: null, tags: [], deployingBranches: setting.deployingBranches });
      } catch {
        throw new Refused("the shell guard's table could not decide the fast-forward's push");
      }
      const asked = verdict.deny && verdict.ask ? verdict.rule : null;
      if (verdict.deny && asked !== "push-default" && !(asked === "push-deploying" && approval !== null)) throw new Refused(`push refused: ${verdict.reason}`);
    }
    // build/29: the tool's own threads, last of all before the evidence is written, then the threads once more: only what
    // that read says stands, so a failed resolve or a thread a person joined meanwhile stops the land here.
    const ownThreads = setAside(pr);
    if (ownThreads.length > 0) {
      const failed = await resolveThreads(ownThreads, repo.host, ghOpts);
      resolving = false;
      threads = await readThreads();
      // review/68: the pull request again, whose merge state counts from here. A rule requiring resolved conversations lifts
      // `blocked` only now, and GitHub may take a moment over it, read as after the ready mark; with a thread still open nothing will lift it.
      const lifting = (now: LandPr): boolean => failed.length === 0 && threads === 0 && (computing(now) || now.mergeableState === "blocked");
      pr = await pollWhilePending(readPr, lifting, Math.min(LAND_CLOCK.now() + READY_MERGEABLE_MS, budgetEnd), READY_POLL_MS, LAND_CLOCK);
      show(checks, pr);
      const after = decide(inputFor(pr, checks, false));
      // Whoever closed it: a comment by anyone but the tool or the run's login is theirs to weigh, and only this read shows it.
      // A read that failed shows no thread, so it names no one: `after` already refuses on the threads not reading.
      const joined = threads === null
        ? []
        : ownThreads.filter((id) => {
            const entry = lastThreads.find((read) => read.id === id);
            return entry === undefined || joinedBySomeone(entry, tool?.login, viewer);
          });
      // This read can raise an ask no one was shown, a thread closed just now; with no approval it stops the land as a gap does.
      const unasked = after.outcome === "asks" && approval === null ? after.reasons : [];
      // review/120: named whatever else stops it. A set, since `decide` has already named the threads it counts.
      const stops = [...new Set([...failed, ...(after.outcome === "refused" ? after.reasons : []), ...unasked, ...joined.map((id) => closedOverReason(id))])];
      if (stops.length > 0) throw new Held(true, ...stops);
      lines.push(`threads: resolved ${ownThreads.length} of the tool's own`);
    }
    const at = new Date().toISOString();
    const notes = [
      ...(review === undefined ? [] : [review.reason]),
      ...(ownThreads.length === 0 ? [] : [`${ownThreads.length} of the tool's review threads resolved on its clean word`]),
      ...(tip.notRed.length === 0 ? [] : [`${defaultBranch}'s tip reads not red with ${tip.notRed.join(", ")} missing or pending`]),
      ...(autoShip?.eligible === true && !fastForward ? [autoShip.evidence] : []),
    ];
    const line = evidenceLine(
      at,
      sha,
      checks.green.length,
      threads ?? 0,
      0,
      approval === null ? undefined : { sha: approval.sha, reasons: approval.reasons.map((reason) => sanitizeLabel(reason)) },
      notes.map((note) => sanitizeLabel(note)),
    );
    const patched = await answered(
      ghApi({ method: "PATCH", path: `${repoPath}/pulls/${number}`, body: { body: withStatusLine(pr.body, marker, line) }, hostname: repo.host }, ghOpts),
      "the evidence write",
    );
    if (patched.status !== 200) throw new Refused(`writing the evidence into #${number}'s body answered HTTP ${patched.status}`);
    if (fastForward) {
      const pushed = await git(["push", "--quiet", "origin", refspec]);
      if (pushed.code !== 0) throw new Refused(`the fast-forward's push answered ${pushed.code}`);
      lines.push(`act: fast-forwarded ${defaultBranch} to ${sha}`);
    } else {
      const merged = await answered(
        ghMergePull({ hostname: repo.host, owner: repo.owner, repo: repo.repo, number, sha, method }, ghOpts),
        `the merge call (#${number}'s own state decides whether it merged; run it again)`,
      );
      if (merged.status !== 200) {
        const why = merged.status === 409 ? `GitHub refused the merge (HTTP 409): the head moved since ${sha}; run it again` : `GitHub refused the merge (HTTP ${merged.status}); #${number} stays open`;
        // A refusal is a hold; a moved head's own job speaks for it; a GitHub that failed is a true failure.
        throw merged.status >= 500 ? new Refused(why) : new Held(merged.status !== 409, why);
      }
      lines.push(`act: merged #${number} at ${sha} (${method})`);
    }
    result.outcome = "landed";
    const how = fastForward ? "fast-forwarded" : "merged";
    if (job === null) await noteLanded(ctx, cwd, recordRel, number, sha, approval === null ? how : `${how} (approved by the person for ${approval.sha})`, result);
    if (approval !== null) result.approved = approval;
    return finish();
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    result.outcome = "refused";
    result.notDone.push(...error.reasons);
    if (error instanceof Held) bodyTakesWaits ||= error.shown;
    else jobFailed = job !== null;
    await noteWaits(error.reasons);
    return finish();
  }
}

/**
 * The method a job merges by (REQ-FLOW-157): the first of {@link MERGE_METHODS} that the rules and the repository both allow, since
 * GitHub refuses a method either side turns off. The rules are every ruleset's `allowed_merge_methods`, and a linear-history rule
 * takes `merge` out; the repository is its flags. `null` where none is left. A flag GitHub does not show this token reads as on:
 * the merge call's own answer then decides.
 */
function allowedMethod(rules: unknown, about: unknown): MergeMethod | null {
  const read = (Array.isArray(rules) ? rules : []) as ({ type?: unknown; parameters?: { allowed_merge_methods?: unknown } } | null)[];
  const lists = read.flatMap((rule) => {
    const list = rule?.type === "pull_request" ? rule.parameters?.allowed_merge_methods : undefined;
    return Array.isArray(list) ? [list as unknown[]] : [];
  });
  const linear = read.some((rule) => rule?.type === "required_linear_history");
  const flags = (typeof about === "object" && about !== null ? about : {}) as Record<string, unknown>;
  const flagged: Readonly<Record<MergeMethod, unknown>> = { merge: flags["allow_merge_commit"], squash: flags["allow_squash_merge"], rebase: flags["allow_rebase_merge"] };
  return MERGE_METHODS.find((method) => flagged[method] !== false && !(linear && method === "merge") && lists.every((list) => list.includes(method))) ?? null;
}

/** Whether `thread` holds a comment by anyone but the review tool and the run's login, or did not read whole. */
function joinedBySomeone(thread: ThreadRead, toolLogin: string | undefined, runLogin: string): boolean {
  if (!thread.complete) return true;
  return thread.authors.some(({ login, person }) => login === null || (bareLogin(login) !== bareLogin(runLogin) && (person || `${login}[bot]` !== toolLogin)));
}

/**
 * A `gh` call's answer; a rejection (no `gh`, no login, no network, a call the runner refused) refuses by its class,
 * never by `gh`'s own text (review/199).
 */
async function answered(call: Promise<GhResponse>, what: string): Promise<GhResponse> {
  try {
    return await call;
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
    throw new Refused(`${what} failed before GitHub answered (${typeof code === "string" ? code : "gh failed"})`);
  }
}

/**
 * The hook paths the declarations name at the record's `Base:`, at the head and at the default branch's tip
 * (`../../runs/hookPaths.ts`, review/74, review/80), together and sorted; or why they are not known, which asks, worded
 * with the person's next step (review/81). The tip is fetched first where this clone does not hold it. REQ-FLOW-102:
 * every setup root any of the three trees holds is read beside the run's own project, as the hold reads them, and
 * `setups` lists them for the ask set; a tree whose setups could not be listed asks, `setups` then the run's own alone.
 */
async function declaredHookPaths(
  at: { base: string | null; head: string; tip: string; defaultBranch: string; prefix: string },
  git: (args: readonly string[]) => Promise<GitWriteResult>,
  gitLine: (args: readonly string[]) => Promise<string | null>,
): Promise<{ paths: string[] | string; setups: string[] }> {
  const unknown = (where: string, why: string, next: string): { paths: string; setups: string[] } => ({
    paths: `the hook declarations at ${where} could not be read (${why}), so whether the diff reaches a hook script is not known; ${next}, then run land again, or a person decides`,
    setups: [at.prefix],
  });
  const onDefault = `fix the declaration on ${at.defaultBranch}`;
  const base = at.base === null ? null : await gitLine(["rev-parse", "--verify", "--quiet", `${at.base}^{commit}`]);
  if (base === null) return unknown("the record's Base:", "it names no commit here", "write the commit the run started from as the record's Base:");
  if (!/^[0-9a-f]{40,64}$/.test(at.tip)) return unknown(`${at.defaultBranch}'s tip`, "GitHub named no commit id", onDefault);
  if ((await git(["cat-file", "-e", `${at.tip}^{commit}`])).code !== 0) {
    await git(["fetch", "--quiet", "--no-tags", "origin", `refs/heads/${at.defaultBranch}`]);
    if ((await git(["cat-file", "-e", `${at.tip}^{commit}`])).code !== 0) {
      return unknown(`${at.defaultBranch}'s tip ${at.tip}`, "this clone does not hold that commit, and fetching it did not bring it", `fetch ${at.defaultBranch} from origin`);
    }
  }
  const reads = { git, scratch: HOOK_SCRATCH };
  const sides = [
    { where: `the record's Base: ${base}`, commit: base, next: onDefault },
    { where: `${at.defaultBranch}'s tip ${at.tip}`, commit: at.tip, next: onDefault },
    { where: `the head ${at.head}`, commit: at.head, next: "fix the declaration on the run's branch" },
  ];
  const listed = await Promise.all(sides.map((side) => setupRootsAt(git, side.commit)));
  const setups = [at.prefix];
  for (const [index, side] of sides.entries()) {
    const roots = listed[index];
    if (roots === undefined) continue;
    if (typeof roots === "string") return unknown(side.where, "the setups in its tree could not be listed", side.next);
    setups.push(...roots);
  }
  const unique = [...new Set(setups)];
  const read = await Promise.all(sides.map((side) => hookPathsRead(reads, unique, side.commit)));
  const paths: string[] = [];
  for (const [index, side] of sides.entries()) {
    const found = read[index];
    if (found === undefined) continue;
    if (!Array.isArray(found)) return { ...unknown(side.where, found.subject === null ? found.why : `${found.subject} ${found.why}`, side.next), setups: unique };
    paths.push(...found);
  }
  return { paths: [...new Set(paths)].toSorted(), setups: unique };
}

/** The fields of one list entry the lookup matches on. */
function parsePrSummary(entry: unknown): { number: number; headRef: string; body: string } | null {
  if (typeof entry !== "object" || entry === null) return null;
  const { number, head, body } = entry as Record<string, unknown>;
  const ref = typeof head === "object" && head !== null ? (head as Record<string, unknown>)["ref"] : undefined;
  if (typeof number !== "number" || typeof ref !== "string") return null;
  return { number, headRef: ref, body: typeof body === "string" ? body : "" };
}

/** Every check run on `sha`, at most {@link MAX_PAGES} pages; more than that, or a page that does not read, refuses. */
async function checkRuns(json: (path: string, what: string) => Promise<unknown>, repoPath: string, sha: string): Promise<CheckRunRead[]> {
  const runs: CheckRunRead[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- a page past the total is not asked for; the count read so far decides
    const read = parseCheckRuns(await json(`${repoPath}/commits/${sha}/check-runs?per_page=100&page=${page}`, "the check runs read"));
    if (read === null) throw new Refused("the check runs did not read");
    runs.push(...read.runs);
    if (runs.length >= read.total || read.runs.length < 100) return runs;
  }
  throw new Refused(`more than ${MAX_PAGES * 100} check runs on ${sha}, so the required ones are not proven read`);
}

/** Every entry of the paged list at `path`, at most {@link MAX_PAGES} pages; more than that, or a page that does not read, refuses. */
async function everyPage<T>(json: (path: string, what: string) => Promise<unknown>, path: string, what: string, entriesOf: (page: unknown) => T[] | null): Promise<T[]> {
  const entries: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- a page past a short one is not asked for
    const read = entriesOf(await json(`${path}?per_page=100&page=${page}`, what));
    if (read === null) throw new Refused(`${what} did not read`);
    entries.push(...read);
    if (read.length < 100) return entries;
  }
  throw new Refused(`${what} holds more than ${MAX_PAGES * 100} entries, so it is not proven read whole`);
}

/**
 * Who last edited each comment, by id, every page; `null` where a page does not read, a cloud's proxy refusing GraphQL
 * among them. Every comment then reads as edited by nobody it can trust, which holds a land on the tool's state comment.
 */
async function commentEditors(hostname: string, owner: string, repo: string, number: number, opts: GhApiOptions): Promise<Map<number, string | null> | null> {
  const editors = new Map<number, string | null>();
  let after: string | undefined;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let reply: GhResponse;
    try {
      // oxlint-disable-next-line no-await-in-loop -- each page's cursor comes from the page before
      reply = await ghCommentEditors({ hostname, owner, repo, number, ...(after === undefined ? {} : { after }) }, opts);
    } catch {
      return null;
    }
    const read = reply.status === 200 ? parseEditorsPage(reply.json) : null;
    if (read === null) return null;
    for (const [id, editor] of read.editors) editors.set(id, editor);
    if (read.next === null) return editors;
    after = read.next;
  }
  return null;
}

/** Whether the tool has a run on the head: a block or a review of its own there, whatever the run's state. */
function ranOnHead(facts: ReviewToolFacts, tool: ReviewToolConfig): boolean {
  const { stateMarker: marker, stateSection: section } = tool;
  const blockOn = (body: string): boolean => marker !== undefined && section !== undefined && parseStateBlock(body, marker, section)?.commitSha === facts.head;
  return facts.reviews.some((review) => review.userLogin === tool.login && review.commitId === facts.head) || facts.comments.some((comment) => comment.userLogin === tool.login && blockOn(comment.body));
}

/** Where the range read and GitHub's own view of the pull request part, in words; `null` where they agree. */
function rangeDisagreement(range: RangeFacts, files: readonly string[], pr: LandPr): string | null {
  const read = new Set(range.paths);
  const listed = new Set(files);
  const differ = [...[...read].filter((path) => !listed.has(path)), ...[...listed].filter((path) => !read.has(path))];
  if (differ.length > 0) return `the range read and GitHub's file list differ on ${namePaths(differ.toSorted())}`;
  const total = pr.additions === null || pr.deletions === null ? null : pr.additions + pr.deletions;
  return range.lines === null || range.lines === total ? null : `the range read counts ${range.lines} lines and GitHub ${total ?? "none"}`;
}

/**
 * The class file GitHub holds at `tip`, at the repository's top, for {@link classifyRange}: its text, `null` where it holds
 * none, or why it is not known.
 */
async function classFileAt(tip: string, read: (path: string) => Promise<GhResponse | null>): Promise<{ text: string | null } | { failed: string }> {
  const reply = await read(`contents/${CLASS_FILE.split("/").map((segment) => encodeQuery(segment)).join("/")}?ref=${encodeQuery(tip)}`);
  if (reply?.status === 404) return { text: null };
  const text = reply?.status === 200 ? parseFileContent(reply.json) : null;
  if (text !== null) return { text };
  const why = reply === null ? "gh failed" : reply.status === 200 ? "GitHub's answer is no file" : `HTTP ${reply.status}`;
  return { failed: `${CLASS_FILE} did not read from GitHub at ${tip} (${why})` };
}

/**
 * Whether what merges fits `rules` (REQ-FLOW-152). What a run could write in the clone comes from GitHub: the merge base, the
 * file list and line counts the range must match, and the class file. The tip's file judges the change, since a run picks its
 * merge base by where it forks, and the tip is the rules as they stand today. Only the hunks are the clone's, the stated limit
 * in `../engine/changeRange.ts`. A compare that names no base, a class file that does not read, a range that disagrees with
 * GitHub and a commit this clone does not hold (a shallow clone) all read as not eligible, so the land asks instead of failing.
 * So does a land started below the top, read no further: the rules judge paths from the top by the top's class file, and the
 * start folder picks neither.
 */
async function autoShipRead(
  cwd: string,
  at: { tip: string; head: string; prefix: string; files: readonly string[]; pr: LandPr },
  rules: AutoShipRules,
  call: (path: string) => Promise<GhResponse>,
): Promise<AutoShipVerdict> {
  const { tip, head, prefix, files, pr } = at;
  // review/42: GitHub's count is at most the range's, a rename counting once there, so this rule needs no read of every file.
  if (pr.changedFiles > rules.maxFiles) return { eligible: false, reasons: [filesOverLimit(pr.changedFiles, rules.maxFiles)] };
  if (prefix !== "") return { eligible: false, reasons: [`auto-ship is judged only from the repository's top, and this land started in ${prefix}`] };
  const incomplete = (why: string): AutoShipVerdict => ({ eligible: false, reasons: [`the classification is incomplete: ${why}`] });
  const read = (path: string): Promise<GhResponse | null> =>
    call(path).catch((error: unknown) => {
      if (error instanceof Refused) return null;
      throw error;
    });
  const compare = await read(`compare/${tip}...${head}`);
  const base = compare?.status === 200 ? parseMergeBase(compare.json) : null;
  if (base === null) return incomplete(`GitHub's compare of ${tip} and ${head} named no merge base (${compare === null ? "gh failed" : `HTTP ${compare.status}`})`);
  const classFile = await classFileAt(tip, read);
  if ("failed" in classFile) return incomplete(classFile.failed);
  try {
    const range = await classifyRange(cwd, base, head, classFile.text);
    const differs = rangeDisagreement(range, files, pr);
    return differs === null ? autoShipVerdict(range, rules) : incomplete(differs);
  } catch (error) {
    if (!(error instanceof EngineError) || error.code !== "VALIDATION_ERROR") throw error;
    return incomplete(error.message);
  }
}

/** Resolves each thread by its node id (build/29); what comes back names every one that did not close, and why. */
async function resolveThreads(ids: readonly string[], hostname: string, opts: GhApiOptions): Promise<string[]> {
  const replies = await Promise.all(ids.map((id) => ghResolveReviewThread({ hostname, id }, opts).catch(() => null)));
  return ids.flatMap((id, index) => {
    const reply = replies[index] ?? null;
    if (reply?.status === 200 && threadResolved(reply.json)) return [];
    const why = reply === null ? "gh failed before GitHub answered" : reply.status === 200 ? "GitHub did not say it closed" : `HTTP ${reply.status}`;
    return [`the tool's review thread ${id} was not resolved (${why})`];
  });
}

/**
 * The unresolved review threads ({@link unresolvedThreads}) and the login they were read as, every page; `null` where a page
 * does not read. `runLogin` is whose closing of a person's thread does not count: the run's. Absent, that is gh's own login.
 */
async function reviewThreads(hostname: string, owner: string, repo: string, number: number, opts: GhApiOptions, runLogin?: string): Promise<{ count: number; viewer: string; author: string | null; threads: ThreadRead[] } | null> {
  const threads: ThreadRead[] = [];
  let after: string | undefined;
  let viewer = "";
  let author: string | null = null;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let reply: GhResponse;
    try {
      // oxlint-disable-next-line no-await-in-loop -- each page's cursor comes from the page before
      reply = await ghReviewThreads({ hostname, owner, repo, number, ...(after === undefined ? {} : { after }) }, opts);
    } catch {
      return null;
    }
    const read = reply.status === 200 ? parseThreadsPage(reply.json) : null;
    if (read === null) return null;
    viewer = read.viewer;
    author = read.author;
    threads.push(...read.threads);
    if (read.next === null) return { count: unresolvedThreads(threads, runLogin ?? viewer), viewer, author, threads };
    after = read.next;
  }
  return null;
}

/** A regular file's text in the commit `sha`, or why not, `missing` where the commit holds nothing at `path`. */
async function regularFileAt(sha: string, path: string, git: (args: readonly string[]) => Promise<GitWriteResult>): Promise<{ text: string } | { refused: string; missing: boolean }> {
  const listed = await git(["ls-tree", "-z", sha, "--", path]);
  if (listed.code !== 0 || listed.stdout === "") return { refused: `${path} is missing from the commit`, missing: true };
  if (!/^100(?:644|755) blob /.test(listed.stdout)) return { refused: `${path} is not a regular file in the commit`, missing: false };
  const shown = await git(["show", `${sha}:./${path}`]);
  if (shown.code !== 0 || shown.stdout.length > READ_MAX_BYTES) return { refused: `${path} could not be read from the commit`, missing: false };
  return { text: shown.stdout };
}

/** Whether `text` holds a row under a `## Refused` heading: any line there, up to the next heading, but the empty section's word. */
function holdsRefusedRow(text: string): boolean {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const start = lines.indexOf(`## ${MORNING_REFUSED}`);
  if (start === -1) return false;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).some((line) => line !== "" && line.toLowerCase() !== MORNING_EMPTY);
}

/** The last value `line` captures in `text`, line by line: a later `run end` wrote the line that stands. */
function lastLine(text: string, line: RegExp): string | null {
  return text.split(/\r?\n/).flatMap((entry) => line.exec(entry)?.[1] ?? []).at(-1) ?? null;
}

/**
 * Job mode's proof that the run ended unblocked, all of it at the head, and the run's login (REQ-FLOW-157): `Status: closed`
 * with no `(blocked:`, no `## Refused` row in the record or the morning list, and `PR:` naming this pull request. The run wrote
 * these, so they hold it to its own word and no further: the login still has to be the author GitHub names. `holds` lists every
 * reason, none echoing the head's text, and `inProgress` says the run is still at work, which is no one's hold yet.
 */
async function endedAtHead(
  at: { sha: string; recordRel: string; morningRel: string; number: number },
  git: (args: readonly string[]) => Promise<GitWriteResult>,
  statusOf: (text: string) => string | null,
): Promise<{ login: string | null; holds: string[]; inProgress: boolean }> {
  const record = await regularFileAt(at.sha, at.recordRel, git);
  if ("refused" in record) return { login: null, holds: [record.refused], inProgress: false };
  const status = statusOf(record.text) ?? "";
  const login = lastLine(record.text, /^Login: (\S+)$/);
  if (!/^closed\b/i.test(status.trim())) return { login, holds: [`the record at ${at.sha} does not read Status: closed, so the run has not ended`], inProgress: true };
  const morning = await regularFileAt(at.sha, at.morningRel, git);
  const holds: string[] = [];
  if (/\(blocked:/i.test(status)) holds.push(`the record at ${at.sha} reads (blocked:, so a person decides`);
  if (holdsRefusedRow(record.text)) holds.push(`the record at ${at.sha} holds a ## Refused row, so a person decides`);
  if ("text" in morning && holdsRefusedRow(morning.text)) holds.push(`the morning list at ${at.sha} holds a ## Refused row, so a person decides`);
  if ("refused" in morning && !morning.missing) holds.push(morning.refused);
  if (lastLine(record.text, /^PR: ([0-9]+)$/) !== String(at.number)) holds.push(`the record at ${at.sha} does not name #${at.number} on a PR: line`);
  if (login === null) holds.push(`the record at ${at.sha} names no Login:`);
  return { login, holds, inProgress: false };
}

/** The ledger's evidence at `sha`, refusing a missing one, one that is no regular file, or a work-tree copy that differs. */
async function ledgerAt(
  cwd: string,
  sha: string,
  ledgerRel: string,
  git: (args: readonly string[]) => Promise<GitWriteResult>,
): Promise<{ open: string[] } | { refused: string }> {
  const shown = await regularFileAt(sha, ledgerRel, git);
  if ("refused" in shown) return { refused: shown.refused };
  const local = readCapped(join(cwd, ledgerRel), READ_MAX_BYTES);
  if (local === null || local.truncated || local.text.replaceAll("\r\n", "\n") !== shown.text.replaceAll("\r\n", "\n")) {
    return { refused: `the work tree's ${ledgerRel} differs from the commit's: checkpoint first` };
  }
  return ledgerEvidence(shown.text);
}

/**
 * After the merge call succeeded (or for a pull request already merged at the head): `- <UTC> land: #<n> <sha> <how>`
 * appended to the record, once per pull request and head; a line not written goes to `notDone`, the landing stands.
 */
async function noteLanded(ctx: CliContext, cwd: string, recordRel: string, number: number, sha: string, how: string, result: LandResult): Promise<void> {
  const path = join(cwd, recordRel);
  const read = readCapped(path, READ_MAX_BYTES);
  if (read === null || read.truncated) {
    result.notDone.push(`record line not written: ${recordRel} could not be read whole`);
    return;
  }
  if (read.text.split(/\r?\n/).some((line) => line.includes(` land: #${number} ${sha} `))) return;
  const text = `${read.text}${read.text === "" || read.text.endsWith("\n") ? "" : "\n"}- ${new Date().toISOString()} land: #${number} ${sha} ${how}\n`;
  try {
    await ctx.engine.merge.atomicWrite.atomicWriteFile(path, text, { boundaryDir: cwd });
  } catch (cause) {
    result.notDone.push(`record line not written: ${recordRel} (${cause instanceof Error ? cause.message : "the write failed"})`);
  }
}
