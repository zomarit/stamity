import { closeSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { readAutonomy, strictestAutonomy, type ResolvedAutonomy } from "../../config/autonomy.ts";
import { personOnlyVerdict } from "../../hooks/personOnly.ts";
import { readGitSurface, SURFACE_RECORD_FILE, surfaceRefusal, type RecordFileReads } from "../../runs/gitSurface.ts";
import { hookPathsRead, setupRootsAt, type HookScratch } from "../../runs/hookPaths.ts";
import {
  askPathsOf,
  checkEvidence,
  decideLand,
  entryPlaceOf,
  evidenceLine,
  ledgerEvidence,
  parseBranch,
  parseBranchRules,
  parseCheckRuns,
  parseFiles,
  parsePr,
  placeOf,
  parseThreadsPage,
  ownPr,
  pollWhilePending,
  withinAny,
  unresolvedThreads,
  waitsLine,
  withStatusLine,
  type CheckEvidence,
  type CheckRunRead,
  type ForwardFacts,
  type LandDecision,
  type LandInput,
  type LandPr,
  type PlaceReads,
  type PollClock,
  type RequiredCheck,
  type ThreadRead,
} from "../../runs/landEvidence.ts";
import { screenOutbound } from "../../runs/morning.ts";
import { PR_RECORD_FILE, prRecordRefusal, resolveRepo, runMarker } from "../../runs/pullRequest.ts";
import { gitProgramFor } from "../../shared/programPath.ts";
import {
  ghApi,
  ghMarkReady,
  ghMergePull,
  ghProgramPath,
  ghReviewThreads,
  withoutVersionChoice,
  type GhApiOptions,
  type GhResponse,
  type MergeMethod,
} from "../engine/ghRunner.ts";
import { gitWrite, gitWriteEnv, type GitWriteResult } from "../engine/gitWrite.ts";
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
 * and the work tree's manifest. `gh` must resolve outside the work tree and the temp folders. Unattended, git's
 * surface must still be the pre-flight's (REQ-FLOW-131), at the start and again just before the act.
 *
 * **The act.** `--ready` marks a draft ready only once the rest holds, then merges. Before the merge the body gains
 * one "evidence checked at" line, never "landed"; only after the merge call succeeds does `record.md` gain
 * `- <UTC> land: #<n> <sha> merged`. A killed process or a failed merge leaves the pull request open and its body
 * saying what was checked; its own state is what the next call reads. `--fast-forward` pushes `<sha>` to the default
 * branch with no force, through the shell guard's own table first, where no rule requires a pull request.
 *
 * Exit 0 `landed` or `already-landed`; 1 `asks` or `refused` (the JSON's `outcome` is how a flow branches); 2 usage.
 */

/** `--wait` polls every this many milliseconds. */
const POLL_MS = 30_000;
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
/** A branch name as it goes into a path unencoded, as the push check reads it. */
const PATH_BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]+$/;
/** UTF-8's byte-order mark, which a manifest's reader drops before it parses; built from its code, never typed. */
const BOM = String.fromCharCode(0xfeff);
/** The run's manifest, from the project root. */
const MANIFEST = ".stamity/manifest.json";
/** The most of a manifest, a ledger or a record read. */
const READ_MAX_BYTES = 4_194_304;

/** What the verb's JSON carries. */
interface LandResult {
  outcome: "landed" | "already-landed" | "asks" | "refused" | "would-land";
  pr: { number: number; url: string; head: string } | null;
  evidence: {
    checks: { name: string; state: "green" | "pending" | "failing" | "missing" }[];
    threads: { unresolved: number | null };
    ledger: { open: string[] };
    held: string[];
    mergeableState: string | null;
  };
  /** review/110: every reason, `reason` the first for older readers, and the head an approval must name. */
  asks?: { reason: string; reasons: string[]; act: string; head: string };
  /** review/103, review/110: the asks outcome the person approved with --approved <sha>, where the verb landed over one. */
  approved?: { sha: string; reason: string; reasons: string[]; act: string };
  notDone: string[];
}

/** A refusal before the decision: the reasons go to `notDone`. */
class Refused extends Error {
  readonly reasons: string[];

  constructor(...reasons: string[]) {
    super(reasons.join("; "));
    this.reasons = reasons;
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

/**
 * review/96: the folder every `gh` call starts in: `/` on POSIX; on Windows the system drive's root (`SystemDrive` and
 * a `\`), else the root of the home folder's drive.
 */
function filesystemRoot(): string {
  if (process.platform !== "win32") return "/";
  const drive = process.env["SystemDrive"] ?? "";
  return /^[A-Za-z]:$/.test(drive) ? `${drive}\\` : parse(homedir()).root;
}

/**
 * build/18: the temp folders a planted `gh` must not lie in: `os.tmpdir()`; `/tmp` on POSIX; on win32 also `%TEMP%`,
 * `%TMP%` and the user's local `Temp` folder under `AppData`, from the verb's environment and the process's, as found.
 */
function tempRoots(env: NodeJS.ProcessEnv): string[] {
  if (process.platform !== "win32") return [tmpdir(), "/tmp"];
  const named = [env, process.env].flatMap((from) => [from["TEMP"], from["TMP"], from["LOCALAPPDATA"] === undefined ? undefined : join(from["LOCALAPPDATA"], "Temp")]);
  return [tmpdir(), join(homedir(), "AppData", "Local", "Temp"), ...named.filter((root): root is string => typeof root === "string" && root !== "")];
}

/** A branch name or value encoded for a query string in the REST runner's path alphabet. */
function encodeQuery(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export async function runLand(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
  const run = String(opts["run"]);
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
  const unattended = resumeCard.readsUnattended(head.mode, env["STAMITY_UNATTENDED"]);
  const fastForward = opts["fastForward"] === true;
  /**
   * review/103, review/110: the person's answer to an `asks` outcome, given on the line the guard asks them about
   * (`a4`): the head commit they approved, which the asks outcome's JSON printed; `null` where none was given.
   */
  const approvedSha = typeof opts["approved"] === "string" ? opts["approved"].toLowerCase() : null;
  const approved = approvedSha !== null;
  const ready = opts["ready"] === true;
  const method = (typeof opts["method"] === "string" ? opts["method"] : "merge") as MergeMethod;
  const waitMinutes = typeof opts["wait"] === "number" ? opts["wait"] : 0;
  const budgetEnd = LAND_CLOCK.now() + LAND_BUDGET_MS - ACT_RESERVE_MS;

  const result: LandResult = { outcome: "refused", pr: null, evidence: { checks: [], threads: { unresolved: null }, ledger: { open: [] }, held: [], mergeableState: null }, notDone: [] };
  const lines: string[] = [`run: ${run} (${unattended ? "unattended" : "attended"})`];
  const finish = (): CommandResult => {
    result.notDone = result.notDone.map((entry) => sanitizeLabel(entry));
    if (result.pr !== null) lines.push(`pr: #${result.pr.number} ${result.pr.url} at ${result.pr.head}`);
    const { checks, threads, ledger, held, mergeableState } = result.evidence;
    if (checks.length > 0) lines.push(`checks: ${checks.map((check) => `${check.name} ${check.state}`).join(", ")}`);
    if (threads.unresolved !== null) lines.push(`threads: ${threads.unresolved} unresolved`);
    lines.push(`ledger: ${ledger.open.length} open Critical/Warning rows`, ...(held.length === 0 ? [] : [`asks for: ${held.join(", ")}`]));
    if (mergeableState !== null) lines.push(`mergeable_state: ${mergeableState}`);
    if (result.asks !== undefined) {
      lines.push(...result.asks.reasons.map((reason) => `asks: ${sanitizeLabel(reason)}`), `approve with: --approved ${result.asks.head} (${result.asks.act}, the head commit these reasons hold for)`);
    }
    lines.push(`outcome: ${result.outcome}`);
    const notDone = result.notDone;
    ctx.io.out(`${[...lines, ...(notDone.length === 0 ? [] : ["Not done:", ...notDone.map((entry) => `  - ${entry}`)])].join("\n")}\n`);
    const landed = result.outcome === "landed" || result.outcome === "already-landed" || result.outcome === "would-land";
    return { exitCode: landed ? 0 : 1, json: { subcommand: "land", run, ...result, ...(ctx.dryRun ? { dryRun: true } : {}) } };
  };

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
  /** review/97 (REQ-FLOW-131): unattended, git's surface must be the one the pre-flight recorded, a passing one. */
  const surfaceMoved = async (): Promise<string | null> => {
    if (!unattended) return null;
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
  try {
    // review/103: --approved is the person's answer; an unattended run has no person to give it, so it refuses first.
    if (approved && unattended) throw new Refused("--approved is the person's answer to an asks outcome, and this run is unattended, so no person gave it");
    // (1) gh, before any of its answers is trusted: outside the work tree and the temp folders.
    const top = await gitLine(["rev-parse", "--show-toplevel"]);
    if (top === null) throw new Refused("the work tree's top could not be read");
    const prefix = (await gitLine(["rev-parse", "--show-prefix"])) ?? "";
    const gh = ghProgramPath({ cwd, env });
    if (gh === null) throw new Refused("gh not found on PATH");
    if (!isAbsolute(gh)) throw new Refused("gh resolves to a PATH entry that is not an absolute path");
    // review/91: the PATH entry (its folder's links resolved) and the program it finally names are each checked; a
    // version manager's shim is a link whose target picks the tool by the name it was started under. build/18: each
    // place and each root read as one real, normalised form (Windows' short and long names, either separator, any
    // letter case), compared by a separator boundary; a place that does not resolve counts as inside.
    const placeReads: PlaceReads = { platform: process.platform, realpath: (path) => realpathSync.native(path) };
    const ghPlaces = [entryPlaceOf(gh, placeReads), placeOf(gh, placeReads)];
    const where = (roots: readonly string[]): boolean => ghPlaces.some((place) => withinAny(place, roots, placeReads));
    if (where([top])) throw new Refused("gh resolves to a program inside the work tree, whose answers the run could write");
    if (where(tempRoots(env))) throw new Refused("gh resolves to a program inside a temp folder, whose answers the run could write");
    // review/75, review/91: every later call starts this same absolute PATH entry, never one resolved again from PATH,
    // and never its link target, so a shim still sees its own name. review/95, review/96: from the filesystem's root
    // (every call names its host and its full API path, so gh needs no repository folder), which has no parent a
    // version manager's shim reads a version file from and which no one but an administrator writes, and without the
    // version managers' version-choosing variables, so the run cannot steer a shim to another program.
    const shimNeutral = withoutVersionChoice(env);
    if (shimNeutral.dropped.length > 0) lines.push(`gh environment: dropped ${shimNeutral.dropped.join(", ")}`);
    const ghOpts = { cwd: filesystemRoot(), env: shimNeutral.env, program: gh };
    const moved = await surfaceMoved();
    if (moved !== null) throw new Refused(moved);

    // (2) Origin's repository, the default branch, and the run's branch.
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
    const remote = await git(["ls-remote", "origin", `refs/heads/${runBranch}`]);
    if (remote.code !== 0) throw new Refused(`git ls-remote origin answered ${remote.code}`);
    const originTip = /^([0-9a-f]{40,64})\t/.exec(remote.stdout)?.[1] ?? null;

    // (3) The run's own pull request: from the run's branch, into the default branch, its body ending with the marker,
    // and the number the run verb recorded when it opened the draft (review/73).
    const marker = runMarker(run);
    const listed = await json(`${repoPath}/pulls?head=${encodeQuery(`${repo.owner}:${runBranch}`)}&base=${encodeQuery(defaultBranch)}&state=all&per_page=100`, "the pull request lookup");
    const numbers = (Array.isArray(listed) ? listed : [])
      .map((entry) => parsePrSummary(entry))
      .filter((entry) => entry !== null && entry.headRef === runBranch && entry.body.trimEnd().endsWith(marker))
      .map((entry) => (entry as { number: number }).number);
    if (numbers.length === 0) throw new Refused(`no pull request from ${runBranch} into ${defaultBranch} ends with the run's marker`);
    const number = Math.max(...numbers);
    const gitDir = await gitLine(["rev-parse", "--git-dir"]);
    const recordPlace = gitDir === null || gitDir === "" ? { unreadable: "git rev-parse --git-dir answered no folder" } : { path: join(resolve(cwd, gitDir), ...PR_RECORD_FILE.split("/")) };
    const unrecorded = prRecordRefusal(recordPlace, RECORD_READS, { run, host: repo.host, owner: repo.owner, repo: repo.repo, number });
    if (unrecorded !== null) throw new Refused(unrecorded);
    // review/73 and the login source: the login gh is authenticated as comes from the thread query's viewer, one source
    // for the author check and the thread rule; an app installation token answers it where it refuses `GET user`.
    const firstThreads = await reviewThreads(repo.host, repo.owner, repo.repo, number, ghOpts);
    if (firstThreads === null) throw new Refused("the review threads could not be read, nor with them the login gh is authenticated as");
    const viewer = firstThreads.viewer;
    // review/94: the pull request's author from the same query, in the spelling viewer has, never REST's user.login.
    const prAuthor = firstThreads.author;
    const readPr = async (): Promise<LandPr> => {
      const pr = parsePr(await json(`${repoPath}/pulls/${number}`, `the read of #${number}`));
      if (pr === null) throw new Refused(`GitHub's answer for #${number} names no pull request this verb reads`);
      return { ...pr, author: prAuthor };
    };
    let pr = await readPr();
    result.pr = { number: pr.number, url: pr.url, head: pr.headSha };
    result.evidence.mergeableState = pr.mergeableState;
    const own = { repo: `${repo.owner}/${repo.repo}`, runBranch, head: sha, originTip, marker, defaultBranch, viewer };
    // build/6: from here the pull request is known; on asks or refused, why its merge waits goes into its own body,
    // while it still reads as the run's own, open and unmerged. A dry run writes nothing.
    noteWaits = async (reasons: readonly string[]): Promise<void> => {
      const check = ownPr(pr, own);
      if (ctx.dryRun || reasons.length === 0 || check.already || check.refusals.length > 0) return;
      const wanted = waitsLine(reasons.map((reason) => sanitizeLabel(reason)));
      const line = screenOutbound(wanted, "pr-body").ok ? wanted : `${waitsLine(["reasons not posted, since the outbound screen matched them; read the run's record"])}`;
      try {
        const written = await ghApi({ method: "PATCH", path: `${repoPath}/pulls/${number}`, body: { body: withStatusLine(pr.body, marker, line) }, hostname: repo.host }, ghOpts);
        if (written.status !== 200) result.notDone.push(`why the merge waits was not written into #${number}'s body (HTTP ${written.status})`);
      } catch {
        result.notDone.push(`why the merge waits was not written into #${number}'s body (gh failed before GitHub answered)`);
      }
    };

    // (4) The setting: the strictest of the default branch's, HEAD's and the work tree's manifest.
    const setting = await readSetting(cwd, prefix, repoPath, defaultBranch, gitLine, call);

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
    const branch = parseBranch(await json(`${repoPath}/branches/${defaultBranch}`, "the default branch read"));
    if (branch === null) throw new Refused("the default branch did not read");
    const required: RequiredCheck[] = [...(ruleRead?.required ?? []), ...branch.required];
    const readChecks = async (): Promise<CheckEvidence> => checkEvidence(required, await checkRuns(json, repoPath, sha));

    // build/2, review/74, review/80: the hook files and the scripts the repository's own declarations name, at Base:,
    // at the head and at the default branch's tip, ask in every mode: a run that edits a declared hook script reaches
    // every later session's hook, whichever of the three declares it.
    // REQ-FLOW-102: from every setup root the three trees hold, as the hold reads them.
    const { paths: hookPaths, setups } = await declaredHookPaths({ base: head.base, head: sha, tip: branch.tip, defaultBranch, prefix }, git, gitLine);
    result.evidence.held = askPathsOf(files, setups, typeof hookPaths === "string" ? [] : hookPaths);

    // (7) The review threads, every page, read again on every later read (review/72).
    const readThreads = async (): Promise<number | null> => {
      const read = await reviewThreads(repo.host, repo.owner, repo.repo, number, ghOpts);
      return read === null || read.viewer.toLowerCase() !== viewer.toLowerCase() ? null : read.count;
    };
    let threads: number | null = firstThreads.count;

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
      threads,
      ledger,
      ...(forward === undefined ? {} : { forward }),
    });
    const show = (checks: CheckEvidence, now: LandPr): void => {
      result.pr = { number: now.number, url: now.url, head: now.headSha };
      result.evidence.mergeableState = now.mergeableState;
      result.evidence.threads.unresolved = threads;
      result.evidence.checks = [
        ...checks.green.map((name) => ({ name, state: "green" as const })),
        ...checks.pending.map((name) => ({ name, state: "pending" as const })),
        ...checks.failing.map((name) => ({ name, state: "failing" as const })),
        ...checks.missing.map((name) => ({ name, state: "missing" as const })),
      ];
    };
    let checks: CheckEvidence = await readChecks();
    const deadline = Math.min(LAND_CLOCK.now() + waitMinutes * 60_000, budgetEnd);
    /** One fresh read of everything that moves: the check runs, the threads and (after any ready mark) the pull request. */
    const reread = async (beforeReady: boolean): Promise<LandDecision> => {
      checks = await readChecks();
      threads = await readThreads();
      if (!beforeReady) pr = await readPr();
      return decideLand(inputFor(pr, checks, beforeReady));
    };
    const pending = (decision: LandDecision): boolean => decision.outcome === "refused" && decision.pending;
    /** `--wait`: while only pending checks or an uncomputed merge state stop it, sleep a poll's interval, then read again. */
    const waitOut = async (decision: LandDecision, beforeReady: boolean): Promise<LandDecision> => {
      let now = decision;
      if (waitMinutes === 0) return now;
      while (pending(now) && LAND_CLOCK.now() + POLL_MS <= deadline) {
        // oxlint-disable-next-line no-await-in-loop -- a poll: each read waits out the interval after the last one
        await LAND_CLOCK.sleep(POLL_MS);
        // oxlint-disable-next-line no-await-in-loop -- the next read decides whether the wait goes on
        now = await reread(beforeReady);
      }
      return now;
    };

    // (10) The decision; --ready on a draft decides first on what does not need the ready state. review/103: with
    // --approved an asks outcome goes on to the act as a land does; every refused condition still refuses.
    const proceeds = (now: LandDecision): boolean => now.outcome === "land" || (approved && now.outcome === "asks");
    const draftReady = pr.draft && ready;
    let decision = await waitOut(decideLand(inputFor(pr, checks, draftReady)), draftReady);
    if (proceeds(decision) && draftReady && !ctx.dryRun) {
      const marked = await answered(ghMarkReady({ hostname: repo.host, id: pr.nodeId }, ghOpts), "the ready mark");
      if (marked.status !== 200 || typeof marked.json !== "object" || marked.json === null || "errors" in marked.json) {
        throw new Refused(`marking #${number} ready answered HTTP ${marked.status}${marked.status === 200 ? " with errors" : ""}`);
      }
      lines.push(`ready: marked #${number} ready for review`);
      // review/79, review/90: GitHub computes the merge state after the mark; it is read again until computed, at most
      // 60 s and never past the verb's budget, and still uncomputed it refuses as not computed yet.
      const computing = (now: LandPr): boolean => now.mergeableState === null || now.mergeableState === "unknown";
      pr = await pollWhilePending(readPr, computing, Math.min(LAND_CLOCK.now() + READY_MERGEABLE_MS, budgetEnd), READY_POLL_MS, LAND_CLOCK);
      decision = await waitOut(await reread(false), false);
    } else if (proceeds(decision) && draftReady) {
      lines.push(`ready: would mark #${number} ready for review`);
    }
    // review/110: the pull request's head as last read must still be the approved commit.
    if (approvedSha !== null && pr.headSha !== approvedSha) throw headMoved(pr.headSha);
    // review/72, review/78: the threads once more just before the act, and the decision on that last count; a dry run
    // on a draft decides on its merge state as it reads now (review/82), which a ready mark has not computed yet.
    if (proceeds(decision)) {
      threads = await readThreads();
      decision = decideLand(inputFor(ctx.dryRun && draftReady ? { ...pr, draft: false } : pr, checks, false));
    }
    show(checks, pr);
    if (decision.outcome === "already-landed") {
      result.outcome = "already-landed";
      if (!ctx.dryRun) await noteLanded(ctx, cwd, recordRel, number, sha, fastForward && !pr.merged ? "fast-forwarded" : "merged", result);
      return finish();
    }
    if (decision.outcome === "refused") {
      result.notDone.push(...decision.reasons);
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
      await noteWaits([`${decision.reasons.join("; ")} (a person decides: ${decision.act})`]);
      return finish();
    }
    if (ctx.dryRun) {
      result.outcome = "would-land";
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
    const at = new Date().toISOString();
    const line = evidenceLine(at, sha, checks.green.length, threads ?? 0, 0, approval === null ? undefined : { sha: approval.sha, reasons: approval.reasons.map((reason) => sanitizeLabel(reason)) });
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
        throw new Refused(
          merged.status === 409
            ? `GitHub refused the merge (HTTP 409): the head moved since ${sha}; run it again`
            : `GitHub refused the merge (HTTP ${merged.status}); #${number} stays open`,
        );
      }
      lines.push(`act: merged #${number} at ${sha} (${method})`);
    }
    result.outcome = "landed";
    const how = fastForward ? "fast-forwarded" : "merged";
    await noteLanded(ctx, cwd, recordRel, number, sha, approval === null ? how : `${how} (approved by the person for ${approval.sha})`, result);
    if (approval !== null) result.approved = approval;
    return finish();
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    result.outcome = "refused";
    result.notDone.push(...error.reasons);
    await noteWaits(error.reasons);
    return finish();
  }
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

/** The unresolved review threads ({@link unresolvedThreads}) and the login they were read as, every page; `null` where a page does not read. */
async function reviewThreads(hostname: string, owner: string, repo: string, number: number, opts: GhApiOptions): Promise<{ count: number; viewer: string; author: string | null } | null> {
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
    if (read.next === null) return { count: unresolvedThreads(threads, viewer), viewer, author };
    after = read.next;
  }
  return null;
}

/** The ledger's evidence at `sha`, refusing a missing one, one that is no regular file, or a work-tree copy that differs. */
async function ledgerAt(
  cwd: string,
  sha: string,
  ledgerRel: string,
  git: (args: readonly string[]) => Promise<GitWriteResult>,
): Promise<{ open: string[] } | { refused: string }> {
  const listed = await git(["ls-tree", "-z", sha, "--", ledgerRel]);
  if (listed.code !== 0 || listed.stdout === "") return { refused: `${ledgerRel} is missing from the commit` };
  if (!/^100(?:644|755) blob /.test(listed.stdout)) return { refused: `${ledgerRel} is not a regular file in the commit` };
  const shown = await git(["show", `${sha}:./${ledgerRel}`]);
  if (shown.code !== 0 || shown.stdout.length > READ_MAX_BYTES) return { refused: `${ledgerRel} could not be read from the commit` };
  const local = readCapped(join(cwd, ledgerRel), READ_MAX_BYTES);
  if (local === null || local.truncated || local.text.replaceAll("\r\n", "\n") !== shown.stdout.replaceAll("\r\n", "\n")) {
    return { refused: `the work tree's ${ledgerRel} differs from the commit's: checkpoint first` };
  }
  return ledgerEvidence(shown.stdout);
}

/** The setting a manifest's text resolves to; text that does not parse resolves to the strictest. */
function settingOf(text: string): ResolvedAutonomy {
  try {
    const parsed: unknown = JSON.parse(text.startsWith(BOM) ? text.slice(1) : text);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return readAutonomy(parsed as { autonomy?: unknown });
  } catch {
    // Falls through to the strictest setting.
  }
  return readAutonomy({ autonomy: "unreadable" });
}

/**
 * The setting as the strictest of the default branch's manifest (so the run cannot loosen it on its own branch),
 * `HEAD`'s and the work tree's; none of the three there refuses as `no setup found`.
 */
async function readSetting(
  cwd: string,
  prefix: string,
  repoPath: string,
  defaultBranch: string,
  gitLine: (args: readonly string[]) => Promise<string | null>,
  call: (path: string) => Promise<GhResponse>,
): Promise<ResolvedAutonomy> {
  const found: ResolvedAutonomy[] = [];
  const path = `${prefix}${MANIFEST}`.split("/").map((segment) => encodeQuery(segment)).join("/");
  const remote = await call(`${repoPath}/contents/${path}?ref=${encodeQuery(defaultBranch)}`);
  if (remote.status === 200) {
    const content = typeof remote.json === "object" && remote.json !== null ? (remote.json as Record<string, unknown>)["content"] : undefined;
    found.push(typeof content === "string" ? settingOf(Buffer.from(content, "base64").toString("utf8")) : settingOf(""));
  } else if (remote.status !== 404) {
    throw new Refused(`the default branch's manifest read answered HTTP ${remote.status}`);
  }
  const committed = await gitLine(["show", `HEAD:./${MANIFEST}`]);
  if (committed !== null) found.push(settingOf(committed));
  const local = readCapped(join(cwd, MANIFEST), READ_MAX_BYTES);
  if (local !== null) found.push(local.truncated ? settingOf("") : settingOf(local.text));
  const [first, ...rest] = found;
  if (first === undefined) throw new Refused(`no setup found: no ${MANIFEST} on ${defaultBranch}, at HEAD or in the work tree`);
  return strictestAutonomy(first, ...rest);
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
