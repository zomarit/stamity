import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { acquireWriteLock } from "../merge/atomicWrite.ts";
import { EngineError } from "../types/errors.ts";
import { isInside, readWorktreeInventory } from "../worktree/cleanup.ts";
import { isDirty, listWorktrees, readDirtyCounts, removeWorktree, resolveGitCommonDir, resolveWorktreeGitDir, runGit, type WorktreeGitRunner } from "../worktree/git.ts";
import { readWorktreePolicy, resolveFarmDir, WORKTREE_POLICY_FILE } from "../worktree/policy.ts";
import { classifyReceiptEntry, inspectEntryState, readWorktreeReceipt, type WorktreeReceipt } from "../worktree/receipt.ts";
import { worktreeLockPath } from "../worktree/setup.ts";
import { isRunId } from "./layout.ts";
import { ITEM_REF_SHAPE } from "./preflight.ts";

/**
 * A landed run cleans up what it started (REQ-FLOW-176): the issue it took closes on the merge, and the session's
 * `run land` removes the run's own lanes, its local branch and a tracking ref origin no longer has. Nothing else.
 *
 * **What is the run's.** A lane is the run's when it sits in the managed farm and its receipt is tagged with the run
 * (`worktree setup --run`); an untagged lane, another run's, a locked one and the checkout the verb runs in are not
 * touched. The branch is `stamity/<run-id>`, the name the run verbs give a run's own branch; a branch a person named in
 * the record's `Branch:` is theirs and stays.
 *
 * **Never force.** A lane goes only when it is clean and holds no ignored file but the ones its setup placed and
 * nobody changed: `git worktree remove` takes ignored files with the tree, and an ignored file is where a capture or a
 * build sits. It goes through `git worktree remove` with no `--force`, after a fresh read under the lane's name lock.
 * The branch goes through `git branch -d`, never `-D`, so git's own merge test keeps work not yet merged; and not
 * while any checkout has it. A tracking ref is dropped only when `git ls-remote` shows origin lacks the branch. A
 * remote branch is never touched.
 *
 * **No machine path out.** What the clean-up returns reaches a pull request's morning list and a person's terminal, so
 * a lane is named by its farm-relative name and a branch's holder by its place. A failure the clean-up's own engine
 * raised once its places are read is its first line with each known folder taken out, in the spelling given and the
 * one through its links. Any other failure, one raised before the places are read or one whose message comes from the
 * policy reader, the git runner or the operating system, is named by its class and by its own words only where those
 * hold no path separator, never by its raw message.
 */

/** One lane the run's receipt tags, as read before any act. */
interface RunCleanupLane {
  readonly path: string;
  /** The lane's name relative to the farm, `/`-joined; its base name where it reads outside the farm. */
  readonly name: string;
  /** Ignored entries in the lane, repository-relative, less the ones its setup placed and nobody changed. */
  readonly ignored: string[];
  readonly dirty: boolean;
  /**
   * Present only where the lane's HEAD keeps it (review/43): `detached` where it names no branch, `unreachable` where
   * no branch and no origin ref holds its commit, or git could not say. `git worktree remove` takes the lane's HEAD
   * reflog with it, so commits only that HEAD holds would drop off every ref.
   */
  readonly head?: "detached" | "unreachable";
}

/** What a run's clean-up would act on, read and not yet acted on. */
export interface RunCleanupPlan {
  readonly run: string;
  readonly lanes: RunCleanupLane[];
  /** `stamity/<run-id>` where it exists locally, and whether `git branch -d` would take it; `null` where it does not. */
  readonly branch: { readonly name: string; readonly merged: boolean } | null;
  /** `refs/remotes/origin/stamity/<run-id>` where origin answered that it no longer has the branch. */
  readonly staleTracking: string[];
}

/** What the clean-up did: `removed` and `kept` for the JSON, `acts` one record line each. */
export interface RunCleanupResult {
  readonly removed: string[];
  readonly kept: { path: string; reason: string }[];
  /** One `cleanup:` record line each, naming a lane by its farm-relative name, never a machine path. */
  readonly acts: string[];
}

/** The most ignored entries a kept lane's reason names. */
const REASON_NAMES = 5;

/** The wall time on origin's read, a network call: past it the tracking ref is kept and the rest still runs. */
const LS_REMOTE_TIMEOUT_MS = 60_000;

/**
 * `<owner>/<repo>#<n>` where the run's `item` is an issue in origin's repository, else `null` (REQ-FLOW-176): an item
 * in another repository is never closed from here, and a value of any other shape names nothing. GitHub's names ignore
 * case, as `run contract`'s own check reads them.
 */
export function closingRef(item: string | undefined, origin: { readonly owner: string; readonly repo: string }): string | null {
  if (item === undefined) return null;
  const match = ITEM_REF_SHAPE.exec(item);
  if (match === null || match[2] === "." || match[2] === "..") return null;
  const [, owner = "", repo = ""] = match;
  return owner.toLowerCase() === origin.owner.toLowerCase() && repo.toLowerCase() === origin.repo.toLowerCase() ? item : null;
}

/** The clone's main checkout, its common git directory and its farm. */
interface Places {
  readonly repoRoot: string;
  readonly commonDir: string;
  readonly farmDir: string;
}

/** Failures whose message the clean-up built with no machine path in it, so it reaches a reason as it is. */
const pathFree = new WeakSet<Error>();

/** An `EngineError` whose `message` the caller built with no machine path, marked so a reason keeps it whole. */
function named(message: string, code: EngineError["code"]): EngineError {
  const error = new EngineError(message, { code });
  pathFree.add(error);
  return error;
}

/** A failure's class: its string code, else the signal that stopped it, else a name more telling than `Error`. */
function classOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const { code, signal, name } = error as { code?: unknown; signal?: unknown; name?: unknown };
  for (const value of [code, signal]) if (typeof value === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(value)) return value;
  return typeof name === "string" && name !== "Error" && /^[A-Za-z]{1,40}$/.test(name) ? name : null;
}

/** `line` where it holds no path separator, so no folder of the machine can be in it; else `null`. */
function pathless(line: string): string | null {
  const trimmed = line.trim();
  return trimmed === "" || /[\\/]/.test(trimmed) ? null : trimmed;
}

/** A failure's own first line where it holds no path separator, `source: ` taken off its front first; else `null`. */
function wordsOf(error: unknown, source?: string): string | null {
  const line = firstLine(error);
  return pathless(source !== undefined && line.startsWith(`${source}: `) ? line.slice(source.length + 2) : line);
}

/**
 * A failure from outside the clean-up named with no machine path by construction: its own words where they hold no
 * path separator, and its class.
 */
function classed(error: unknown): string {
  const words = wordsOf(error);
  const cls = classOf(error);
  if (words !== null) return cls === null || words.includes(cls) ? words : `${words} (${cls})`;
  const { syscall, signal } = (typeof error === "object" && error !== null ? error : {}) as { syscall?: unknown; signal?: unknown };
  if (typeof syscall === "string" && syscall.startsWith("spawn")) return `git could not be started (${cls ?? "no class"})`;
  if (typeof signal === "string") return `git was stopped before it finished (${cls ?? "no class"})`;
  return `it failed with ${cls ?? "no class"}; its message names a path, so it is left out`;
}

/** Runs one read of `placesOf`, naming its failure as `what` and its class, and its own words where they hold no path. */
async function step<T>(what: string, read: () => Promise<T>, source?: string): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const words = wordsOf(error, source);
    throw named(`${what} (${classOf(error) ?? "no class"})${words === null ? "" : `: ${words}`}`, error instanceof EngineError ? error.code : "FS_ERROR");
  }
}

/**
 * The clone's main checkout, its common git directory and its farm, read from any checkout of it. Every failure here
 * comes before the places are known, so each is named by the read that failed and its class (REQ-FLOW-176).
 */
async function placesOf(rootDir: string, git: WorktreeGitRunner): Promise<Places> {
  const top = await step("the checkout the clean-up runs from could not be read", () => git({ args: ["rev-parse", "--show-toplevel"], cwd: rootDir }));
  if (top.status !== 0) throw named("the folder the clean-up runs from is not inside a git checkout, so no clean-up was read", "FS_ERROR");
  const commonDir = await step("the clone's git directory could not be read", () => resolveGitCommonDir(git, rootDir));
  // As the worktree verbs read it: a linked checkout's common directory is the main checkout's `.git`.
  const repoRoot = basename(commonDir) === ".git" ? dirname(commonDir) : resolve(top.stdout.trim());
  const source = join(repoRoot, WORKTREE_POLICY_FILE);
  const policy = await step(`the worktree policy ${WORKTREE_POLICY_FILE} did not read`, () => readWorktreePolicy(repoRoot), source);
  const farmDir = await step("the worktree policy's farmDir was refused", async () => resolveFarmDir(policy, repoRoot), policy.source);
  return { repoRoot, commonDir, farmDir };
}

/** A lane's name relative to `farmDir`, `/`-joined; its base name where it reads outside the farm. */
function laneName(farmDir: string, path: string): string {
  const name = relative(resolve(farmDir), resolve(path)).split(sep).join("/");
  return name === "" || name.startsWith("..") || isAbsolute(name) ? basename(path) : name;
}

/** A path's start in a line: at its front or after a space, a quote or a mark, a `/`, `\`, `~` or drive letter. */
const MACHINE_PATH = /(?:^|[\s"'`(=:,[])(?:[\\/~]|[A-Za-z]:[\\/])/;

/**
 * A failure's line with no machine path (REQ-FLOW-176). One the clean-up built path-free is kept whole. One the
 * clean-up's engine raised once its places are read keeps its first line with the lane's path as its name, then each
 * known folder's prefix taken out in the spelling given and the one through its links, the longest first so a farm
 * inside the checkout goes before the checkout, and a bare folder said by its place; where a path still shows, it is
 * named by its class. Any other, raised before the places are read or from outside the clean-up, is named by its class.
 */
async function failureLine(error: unknown, at: { readonly places: Places | null; readonly rootDir: string; readonly lane?: RunCleanupLane }): Promise<string> {
  if (error instanceof Error && pathFree.has(error)) return firstLine(error);
  if (!(error instanceof EngineError) || at.places === null) return classed(error);
  // [folder, its words, whether it is replaced whole]. A tie in length keeps this order, so the main checkout reads as
  // itself where the clean-up runs from it.
  const known: [string, string, boolean][] = [
    ...(at.lane === undefined ? [] : ([[at.lane.path, at.lane.name, true]] as [string, string, boolean][])),
    [at.places.farmDir, "the lane farm", false],
    [at.places.commonDir, "the git directory", false],
    [at.places.repoRoot, "the main checkout", false],
    [at.rootDir, "the checkout the clean-up runs from", false],
  ];
  const spellings = await Promise.all(
    known.map(async ([folder, place, keeps]): Promise<[string, string, boolean][]> => [
      [resolve(folder), place, keeps],
      [await real(folder), place, keeps],
    ]),
  );
  let line = firstLine(error);
  for (const [folder, place, keeps] of spellings.flat().toSorted((a, b) => b[0].length - a[0].length)) {
    line = keeps ? line.replaceAll(folder, place) : line.replaceAll(`${folder}${sep}`, "").replaceAll(folder, place);
  }
  return MACHINE_PATH.test(line) ? classed(error) : line;
}

/** `path` through its links, or as given where it does not resolve, so two spellings of one folder compare equal. */
async function real(path: string): Promise<string> {
  return realpath(path).catch(() => resolve(path));
}

/** One line of a git read, or `null` where git answered non-zero. */
async function gitLine(git: WorktreeGitRunner, cwd: string, args: readonly string[]): Promise<string | null> {
  const read = await git({ args, cwd });
  return read.status === 0 ? read.stdout.trim() : null;
}

/**
 * The lane's ignored entries (`--directory`, so a whole ignored folder is one entry), less each receipt row still as
 * setup placed it: a link still a link, a copy whose bytes match. Throws where git cannot list them, so a lane whose
 * ignored files are unknown is never removed.
 */
async function laneIgnored(git: WorktreeGitRunner, path: string, name: string, receipt: WorktreeReceipt): Promise<string[]> {
  const listed = await git({ args: ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"], cwd: path });
  if (listed.status !== 0) throw new EngineError(`the ignored files of lane ${name} could not be listed (git exited ${listed.status})`, { code: "FS_ERROR" });
  const placed = new Set<string>();
  for (const entry of receipt.entries) {
    // oxlint-disable-next-line no-await-in-loop -- one lstat per receipt row, a handful at most
    const verdict = classifyReceiptEntry(entry, await inspectEntryState(join(path, entry.path)));
    if (verdict.disposition === "remove") placed.add(entry.path);
  }
  return listed.stdout
    .split("\0")
    .filter((entry) => entry !== "")
    .filter((entry) => !placed.has(entry.replace(/\/$/, "")));
}

/**
 * Why the lane's HEAD keeps it (review/43), or `null` where a branch holds it: `detached` where `HEAD` names no
 * branch; `unreachable` where no local branch and no origin ref contains its commit, or git could not read either.
 */
async function laneHead(git: WorktreeGitRunner, path: string): Promise<"detached" | "unreachable" | null> {
  const attached = await git({ args: ["symbolic-ref", "--quiet", "HEAD"], cwd: path });
  if (attached.status === 1) return "detached";
  if (attached.status !== 0) return "unreachable";
  const tip = await gitLine(git, path, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  if (tip === null) return "unreachable";
  const holder = await gitLine(git, path, ["for-each-ref", "--count=1", "--format=%(refname)", "--contains", tip, "refs/heads", "refs/remotes/origin"]);
  return holder === null || holder === "" ? "unreachable" : null;
}

/** The lane's facts read now: still the run's, dirty, its ignored entries, its HEAD; `null` where its receipt no longer names the run. */
async function laneFacts(git: WorktreeGitRunner, path: string, name: string, run: string): Promise<RunCleanupLane | null> {
  const read = await readWorktreeReceipt(await resolveWorktreeGitDir(git, path));
  if (read.receipt?.run !== run) return null;
  const head = await laneHead(git, path);
  return { path, name, ignored: await laneIgnored(git, path, name, read.receipt), dirty: isDirty(await readDirtyCounts(git, path)), ...(head === null ? {} : { head }) };
}

/**
 * Reads what the clean-up of `run` would act on, from the checkout at `rootDir`; writes nothing. Throws where the run
 * id, the checkout or the worktree policy does not read, so the caller reports the clean-up as not done; the thrown
 * message holds no machine path, as every reason the clean-up gives.
 */
export async function planRunCleanup(rootDir: string, run: string, git: WorktreeGitRunner = runGit): Promise<RunCleanupPlan> {
  if (!isRunId(run)) throw new EngineError(`${JSON.stringify(run)} is not a run id`, { code: "VALIDATION_ERROR" });
  let places: Places | null = null;
  try {
    places = await placesOf(rootDir, git);
    return await readPlan(rootDir, run, places, git);
  } catch (error) {
    throw new EngineError(await failureLine(error, { places, rootDir: resolve(rootDir) }), { code: error instanceof EngineError ? error.code : "FS_ERROR" });
  }
}

/** The plan's reads, once the checkout's places read. */
async function readPlan(rootDir: string, run: string, places: Places, git: WorktreeGitRunner): Promise<RunCleanupPlan> {
  const { repoRoot, farmDir } = places;
  const inventory = await readWorktreeInventory({ repoRoot, farmDir, run: git });
  const lanes: RunCleanupLane[] = [];
  for (const row of inventory.worktrees) {
    if (row.classification !== "managed" || row.receipt?.run !== run) continue;
    // oxlint-disable-next-line no-await-in-loop -- two git reads a lane; a run tags a few lanes
    const facts = await laneFacts(git, row.entry.path, laneName(farmDir, row.entry.path), run);
    if (facts !== null) lanes.push(facts);
  }

  const name = `stamity/${run}`;
  let branch: RunCleanupPlan["branch"] = null;
  const tip = await gitLine(git, rootDir, ["rev-parse", "--verify", "--quiet", `refs/heads/${name}^{commit}`]);
  if (tip !== null) {
    // git's own test for `branch -d`: merged into the branch's upstream where that resolves, else into HEAD.
    const into = (await gitLine(git, rootDir, ["rev-parse", "--verify", "--quiet", `${name}@{upstream}^{commit}`])) ?? (await gitLine(git, rootDir, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]));
    const merged = into !== null && (await git({ args: ["merge-base", "--is-ancestor", tip, into], cwd: rootDir })).status === 0;
    branch = { name, merged };
  }

  const tracking = `refs/remotes/origin/${name}`;
  const staleTracking: string[] = [];
  if ((await git({ args: ["show-ref", "--verify", "--quiet", tracking], cwd: rootDir })).status === 0) {
    // Only a read origin answered, naming no such branch, makes the ref stale; a failed read keeps it, and so does one
    // that never finished (review/39: past the wall time the runner rejects), so the local clean-up still runs.
    const remote = await git({ args: ["ls-remote", "origin", `refs/heads/${name}`], cwd: rootDir, timeoutMs: LS_REMOTE_TIMEOUT_MS }).catch(() => null);
    if (remote !== null && remote.status === 0 && remote.stdout.trim() === "") staleTracking.push(tracking);
  }
  return { run, lanes, branch, staleTracking };
}

/** Why a lane read as `facts` stays, or `null` where it may go. */
function laneKeeps(facts: RunCleanupLane, rootDir: string): string | null {
  if (isInside(rootDir, facts.path)) return "the verb runs inside it";
  if (facts.dirty) return "it holds uncommitted changes";
  if (facts.head === "detached") return "its HEAD is detached, so commits only it holds would drop off every ref";
  if (facts.head === "unreachable") return "its HEAD commit is on no branch and no origin ref";
  if (facts.ignored.length > 0) {
    const more = facts.ignored.length > REASON_NAMES ? ` and ${facts.ignored.length - REASON_NAMES} more` : "";
    return `it holds ignored files: ${facts.ignored.slice(0, REASON_NAMES).join(", ")}${more}`;
  }
  return null;
}

/**
 * Where a checkout holding the run's branch is, by its place: the main checkout, a lane by its farm-relative name, else
 * another checkout. Compared through links, as git prints a checkout's path resolved.
 */
async function holderPlace(holder: string, places: Places): Promise<string> {
  const [at, repoRoot, farmDir] = await Promise.all([real(holder), real(places.repoRoot), real(places.farmDir)]);
  if (at === repoRoot) return "in the main checkout";
  if (at !== farmDir && isInside(at, farmDir)) return `in lane ${laneName(farmDir, at)}`;
  return "in another checkout";
}

/** The first line of a failure, for a kept row's reason. */
function firstLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split(/\r?\n/)[0] ?? "";
}

/**
 * Acts on `plan`: each clean lane removed, then the branch deleted, then each stale tracking ref dropped, in that order
 * so `git branch -d` still reads the upstream. A lane is read again under its name lock just before its removal. With
 * `dryRun`, `removed` names what would go and nothing is acted on. Never throws for one item: an act that fails is a
 * `kept` row with its reason.
 */
export async function applyRunCleanup(plan: RunCleanupPlan, opts: { readonly dryRun: boolean; readonly rootDir: string; readonly git?: WorktreeGitRunner }): Promise<RunCleanupResult> {
  const git = opts.git ?? runGit;
  const rootDir = resolve(opts.rootDir);
  const removed: string[] = [];
  const kept: { path: string; reason: string }[] = [];
  const acts: string[] = [];
  const keep = (path: string, reason: string): void => {
    kept.push({ path, reason });
  };
  let places: Places | null = null;

  for (const lane of plan.lanes) {
    const reason = laneKeeps(lane, rootDir);
    if (reason !== null) {
      keep(lane.name, reason);
      continue;
    }
    if (opts.dryRun) {
      removed.push(lane.name);
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- read once, at the first lane that may go
      places ??= await placesOf(rootDir, git);
      // oxlint-disable-next-line no-await-in-loop -- one name lock at a time, as `worktree cleanup` takes them
      const release = await acquireWriteLock(worktreeLockPath(places.commonDir, lane.name), places.commonDir);
      try {
        // oxlint-disable-next-line no-await-in-loop -- the fresh read decides the removal under the same lock
        const fresh = await laneFacts(git, lane.path, lane.name, plan.run);
        const now = fresh === null ? "its receipt no longer names the run" : laneKeeps(fresh, rootDir);
        if (now !== null) {
          keep(lane.name, now);
          continue;
        }
        // oxlint-disable-next-line no-await-in-loop -- ordered after the fresh read, under the lock
        await removeWorktree(git, places.repoRoot, lane.path, false);
        removed.push(lane.name);
        acts.push(`removed lane ${lane.name}`);
      } finally {
        // oxlint-disable-next-line no-await-in-loop -- the lock goes before the next lane's is taken
        await release();
      }
    } catch (error) {
      // oxlint-disable-next-line no-await-in-loop -- the failed lane's reason is read before the next lane's lock
      keep(lane.name, `the removal failed: ${await failureLine(error, { places, rootDir, lane })}`);
    }
  }

  // review/40: past the lanes, a read or an act that throws is a kept row, never a throw, so the acts already done
  // still reach the record as their `cleanup:` lines.
  if (plan.branch !== null) {
    const { name, merged } = plan.branch;
    try {
      const holder = merged ? (await listWorktrees(git, rootDir)).find((entry) => entry.branch === name) : undefined;
      if (!merged) keep(name, "not merged into its upstream or HEAD, so git branch -d would refuse it");
      else if (holder !== undefined) {
        places ??= await placesOf(rootDir, git);
        keep(name, `checked out ${await holderPlace(holder.path, places)}`);
      } else if (opts.dryRun) removed.push(name);
      else {
        const deleted = await git({ args: ["branch", "-d", name], cwd: rootDir });
        if (deleted.status === 0) {
          removed.push(name);
          acts.push(`deleted branch ${name}`);
        } else keep(name, `git branch -d refused it (git exited ${deleted.status})`);
      }
    } catch (error) {
      keep(name, `the branch was not deleted: ${await failureLine(error, { places, rootDir })}`);
    }
  }

  for (const ref of plan.staleTracking) {
    if (opts.dryRun) {
      removed.push(ref);
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- one ref a run
      const dropped = await git({ args: ["update-ref", "-d", ref], cwd: rootDir });
      if (dropped.status === 0) {
        removed.push(ref);
        acts.push(`dropped ${ref.replace(/^refs\/remotes\//, "")}, which origin no longer has`);
      } else keep(ref, `git update-ref -d failed (git exited ${dropped.status})`);
    } catch (error) {
      // oxlint-disable-next-line no-await-in-loop -- one ref a run
      keep(ref, `the ref was not dropped: ${await failureLine(error, { places, rootDir })}`);
    }
  }
  return { removed, kept, acts };
}
