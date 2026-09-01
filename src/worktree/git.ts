import { spawn } from "node:child_process";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";
import { EngineError } from "../types/errors.ts";
import type { GitPathClass } from "./policy.ts";

/**
 * The worktree lane's one seam onto `git`, plus the pure parsers over what git
 * prints back.
 *
 * Three rules shape this module, and they are the reason it is a file of its
 * own rather than part of the flows above it.
 *
 *   1. **One process boundary.** Every subprocess in this lane goes through
 *      {@link runGit}, so a test replaces one function rather than a scattering
 *      of `execFile` calls, and the flows above never spell an argv.
 *   2. **Parsing is pure.** {@link parseWorktreeList} takes the bytes, not a
 *      repository, so the `--porcelain -z` grammar — NUL-terminated tokens,
 *      records separated by an empty token, `bare`/`detached`/`locked`/
 *      `prunable` as bare or valued keys — is unit-testable with no clone on
 *      disk. The same holds for {@link classifyFetchFailure} and
 *      {@link checkWorktreeNameShape}.
 *   3. **A non-zero exit is data, not an exception.** {@link runGit} returns
 *      the status; the wrappers decide what each one MEANS. That distinction is
 *      load-bearing three times over: `check-ignore` exits 1 for "nothing
 *      matched", `show-ref --verify` exits 1 for "no such ref", and a `fetch`
 *      that exits 128 is either a missing ref (fall through to create,
 *      REQ-WORKTREE-009) or a transport failure (`NETWORK_ERROR`) depending on
 *      one sentence of stderr. A wrapper that threw on every non-zero status
 *      would have to catch and re-read the message at each of those.
 *
 * The name rules live here too, for the same reason: `git check-ref-format`
 * answers half the question and a subprocess cannot answer the other half. A
 * control character or a leading `-` has to be refused BEFORE the name reaches
 * an argv, so the shape pass is pure and runs first, and `check-ref-format` is
 * consulted only on a string already known to be safe to pass.
 */

/** One git invocation. `stdin` is written and closed before output is read. */
export interface GitInvocation {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly stdin?: string;
  /**
   * Wall-clock ceiling in ms for THIS call, or absent for no ceiling. Scoped
   * per-invocation rather than global: a `fetch` against an unreachable host
   * needs one, and a large `worktree add` legitimately exceeds any short ceiling
   * — a SIGTERM'd add leaves an orphan checkout, which is the failure this lane
   * exists to avoid.
   */
  readonly timeoutMs?: number;
}

/** What git said. A non-zero `status` is a fact for the caller to classify. */
export interface GitOutcome {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** The injectable seam. Every subprocess in this lane goes through one of these. */
export type WorktreeGitRunner = (invocation: GitInvocation) => Promise<GitOutcome>;

/**
 * Wall-clock ceiling for a `fetch`, the one git call this lane bounds. A fetch
 * against an unreachable host is the case it exists for: without it a setup
 * hangs until the operator gives up, with no worktree and no message. It is NOT
 * applied to the mutating `worktree add`/`remove` — a large add legitimately
 * runs long, and a SIGTERM'd add leaves an orphan checkout on disk.
 */
export const GIT_FETCH_TIMEOUT_MS = 60_000;

/**
 * Default seam: `git` as a child process, stdout and stderr captured, stdin
 * written when the caller supplies it.
 *
 * A spawn error (no git on PATH) surfaces as status 127 with the message on
 * stderr rather than as a rejection, so every caller has exactly one shape to
 * read and the "git is not installed" case reaches the operator through the
 * same wrapper that names what was being attempted.
 */
export const runGit: WorktreeGitRunner = (invocation) =>
  new Promise<GitOutcome>((settle) => {
    const child = spawn("git", [...invocation.args], {
      cwd: invocation.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      // Per-invocation, not global: only the callers that ask for a ceiling get
      // one. `spawn` treats an undefined `timeout` as "no timeout".
      ...(invocation.timeoutMs === undefined ? {} : { timeout: invocation.timeoutMs }),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", (error) => settle({ status: 127, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => settle({ status: code ?? 1, stdout, stderr }));
    // Most git subcommands never read stdin and can exit before this write
    // lands, which raises EPIPE on the pipe. An unhandled `error` on a stream
    // is an uncaught exception that takes the whole process down, and it would
    // say nothing the exit status below does not already say — the child is
    // gone and its output is already captured. Swallowed here, deliberately,
    // rather than left to crash a run that actually succeeded.
    child.stdin.on("error", () => undefined);
    child.stdin.end(invocation.stdin ?? "");
  });

function refuse(message: string, next?: string): never {
  throw new EngineError(message, {
    code: "VALIDATION_ERROR",
    ...(next === undefined ? {} : { next }),
  });
}

/**
 * A git call whose failure has no more specific reading than "git could not do
 * it". `FS_ERROR` rather than a git-shaped code, because the codes this project
 * publishes classify the FAILURE, and what failed here is an operation against
 * the repository on disk; git's own stderr carries the detail in `why`.
 */
function gitFailed(what: string, outcome: GitOutcome): never {
  const detail = outcome.stderr.trim() === "" ? outcome.stdout.trim() : outcome.stderr.trim();
  throw new EngineError(`${what} failed (git exited ${outcome.status}).`, {
    code: "FS_ERROR",
    why: sanitizeGitOutput(detail),
  });
}

/**
 * Strips control bytes from git's own stdout/stderr before it becomes a `why`
 * that renders to the terminal. Git's output is untrusted enough — a branch
 * name, a remote URL, a path — that an ESC byte in it would otherwise ride the
 * operator's cursor raw. Mirrors the CLI's `sanitizeLabel`, restated here rather
 * than imported because the engine never imports the CLI layer.
 */
// oxlint-disable-next-line no-control-regex -- stripping control bytes IS the point
const GIT_CONTROL_BYTES = /[\u0000-\u001F\u007F-\u009F]/gu;
function sanitizeGitOutput(text: string): string {
  return text.replace(/[\r\n\t]/gu, " ").replace(GIT_CONTROL_BYTES, "").trim();
}

/** Runs git and returns trimmed stdout, or throws naming `what`. */
async function expectGit(
  run: WorktreeGitRunner,
  what: string,
  invocation: GitInvocation,
): Promise<string> {
  const outcome = await run(invocation);
  if (outcome.status !== 0) gitFailed(what, outcome);
  return outcome.stdout.trim();
}

// ---------------------------------------------------------------------------
// Names and paths (REQ-WORKTREE-002, REQ-WORKTREE-009)
// ---------------------------------------------------------------------------

/**
 * Control characters, written as escapes rather than as literals for the reason
 * the policy module states: a literal one makes this source file binary to
 * every tool that reads it.
 */
// oxlint-disable-next-line no-control-regex -- a control character in a worktree name IS the defect
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * The path-safety half of the name rule, pure and FIRST.
 *
 * Returns the refusal sentence, or null when the shape is admissible. It runs
 * before `git check-ref-format` because two of these refusals exist precisely
 * to keep the name out of an argv: a leading `-` would be read by git as an
 * option, and a control character would reach a subprocess, a path, and every
 * log line downstream. `check-ref-format` also accepts several of these — a
 * name may legitimately start with `-` as far as ref syntax is concerned — so
 * this pass is not redundant with it in either direction.
 */
export function checkWorktreeNameShape(name: string): string | null {
  if (name === "") return "the name is empty.";
  if (CONTROL_CHARACTERS.test(name)) return "the name carries a control character.";
  if (name.includes("\\")) {
    return `${JSON.stringify(name)} carries a backslash. A worktree name is a POSIX path fragment — spell nesting with \`/\`.`;
  }
  if (name.startsWith("-")) {
    return `${JSON.stringify(name)} starts with \`-\`, which git reads as an option rather than as a name.`;
  }
  if (isAbsolute(name) || name.startsWith("/")) {
    return `${JSON.stringify(name)} is an absolute path. A worktree name is relative to the farm directory.`;
  }
  for (const segment of name.split("/")) {
    if (segment === "") {
      return `${JSON.stringify(name)} carries an empty path segment. Spell the name plainly, with single \`/\` separators and no trailing slash.`;
    }
    if (segment === "." || segment === "..") {
      return `${JSON.stringify(name)} carries the segment ${JSON.stringify(segment)}, which would resolve outside the farm directory.`;
    }
  }
  return null;
}

/**
 * The full name rule: the pure shape pass, then git's own
 * `check-ref-format --branch`.
 *
 * Both halves are required and neither subsumes the other. The shape pass keeps
 * the name safe to hand to a subprocess and safe to compose into a path; git's
 * pass is the authority on ref syntax (`feat..x`, a trailing `.lock`, `@{`, a
 * component starting with a dot), which no hand-written check should try to
 * restate.
 */
export async function assertWorktreeName(
  run: WorktreeGitRunner,
  repoRoot: string,
  name: string,
): Promise<void> {
  const shape = checkWorktreeNameShape(name);
  if (shape !== null) {
    refuse(`${shape} A worktree name is also the branch name, so it must be a valid ref.`);
  }
  const outcome = await run({ args: ["check-ref-format", "--branch", name], cwd: repoRoot });
  if (outcome.status !== 0) {
    refuse(
      `${JSON.stringify(name)} is not a valid branch name: git check-ref-format rejected it.`,
      `Pick a name git accepts as a ref — no \`..\`, no \`~^:?*[\`, no trailing \`.lock\`, and no component starting with a dot.`,
    );
  }
}

/**
 * `<farm>/<name>`, with any `/` in the name preserved as nesting.
 *
 * Composed with a containment check rather than by string concatenation alone:
 * the shape pass above already refuses the spellings that would escape, and
 * this is the assertion that the two rules agree — a name that ever resolved
 * outside its farm would put a checkout somewhere nobody named.
 *
 * The explicit `isAbsolute(name)` refusal below is defence-in-depth: the sole
 * caller, {@link assertWorktreeName}, already refuses an absolute name before
 * this function ever runs. It is restated here because `join(farm, name)` does
 * NOT re-root on an absolute second argument the way `resolve` would —
 * `join("/farm", "/abs")` is `/farm/abs`, which passes the containment check
 * below despite being a name this function was never asked to accept.
 */
export function worktreePathFor(farmDir: string, name: string): string {
  if (isAbsolute(name)) {
    refuse(
      `The worktree name ${JSON.stringify(name)} is an absolute path, and a worktree name is relative to the farm directory.`,
      `Name the worktree relative to the farm directory, without a leading \`/\` or drive.`,
    );
  }
  // Compose with join, not resolve: the farm is already an absolute native path
  // from resolveFarmDir, and resolve would re-anchor a drive-less absolute onto
  // the current drive on Windows — turning `\farm` into `C:\farm` and moving the
  // result off the farm the caller named. join nests `name` under the farm and
  // normalises away any `.`/`..`, which is all the containment guard below needs.
  const farm = normalize(farmDir);
  const target = join(farm, name);
  if (target !== farm && target.startsWith(`${farm}${sep}`)) return target;
  refuse(
    `The worktree name ${JSON.stringify(name)} resolves to ${target}, which is outside the farm at ${farm}.`,
    `Name the worktree relative to the farm directory, without \`..\` segments.`,
  );
}

// ---------------------------------------------------------------------------
// The inventory (REQ-WORKTREE-007, REQ-WORKTREE-014)
// ---------------------------------------------------------------------------

/** One row of `git worktree list --porcelain -z`. */
export interface WorktreeInventoryEntry {
  readonly path: string;
  /** Short branch name, or null when the checkout is detached or bare. */
  readonly branch: string | null;
  readonly head: string | null;
  readonly bare: boolean;
  readonly detached: boolean;
  readonly locked: boolean;
  readonly lockReason: string | null;
  readonly prunable: boolean;
  readonly prunableReason: string | null;
}

/**
 * Parses `git worktree list --porcelain -z`.
 *
 * The grammar: every attribute is a NUL-terminated `key` or `key value` token,
 * and one empty token ends a record. `-z` rather than the newline form because
 * a worktree path may contain a newline and the newline form escapes it into a
 * quoted C string — a second grammar to parse, with its own escaping rules,
 * for no gain.
 */
export function parseWorktreeList(output: string): WorktreeInventoryEntry[] {
  const entries: WorktreeInventoryEntry[] = [];
  let current: Record<string, string | true> | null = null;

  const flush = (): void => {
    if (current === null) return;
    const path = current["worktree"];
    if (typeof path === "string") entries.push(toInventoryEntry(path, current));
    current = null;
  };

  for (const token of output.split("\0")) {
    if (token === "") {
      flush();
      continue;
    }
    const space = token.indexOf(" ");
    const key = space === -1 ? token : token.slice(0, space);
    const value = space === -1 ? true : token.slice(space + 1);
    if (key === "worktree") flush();
    current ??= {};
    current[key] = value;
  }
  flush();
  return entries;
}

function toInventoryEntry(path: string, record: Record<string, string | true>): WorktreeInventoryEntry {
  const branchRef = record["branch"];
  const head = record["HEAD"];
  const locked = record["locked"];
  const prunable = record["prunable"];
  return {
    path,
    branch: typeof branchRef === "string" ? shortBranchName(branchRef) : null,
    head: typeof head === "string" ? head : null,
    bare: record["bare"] !== undefined,
    detached: record["detached"] !== undefined,
    locked: locked !== undefined,
    lockReason: typeof locked === "string" && locked !== "" ? locked : null,
    prunable: prunable !== undefined,
    prunableReason: typeof prunable === "string" && prunable !== "" ? prunable : null,
  };
}

/** `refs/heads/release/2.x` -> `release/2.x`; anything else is returned as given. */
export function shortBranchName(ref: string): string {
  return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
}

/** Reads the live inventory. */
export async function listWorktrees(
  run: WorktreeGitRunner,
  repoRoot: string,
): Promise<WorktreeInventoryEntry[]> {
  const outcome = await run({ args: ["worktree", "list", "--porcelain", "-z"], cwd: repoRoot });
  if (outcome.status !== 0) gitFailed("reading the worktree inventory", outcome);
  // git prints worktree paths in forward-slash form on every platform, including
  // Windows, where a real checkout is a backslash path everywhere else this lane
  // talks about it (the farm from resolveFarmDir, the receipt location, the
  // refusal an operator reads to cd there). Normalise each to the native form at
  // this seam so a reported path compares equal to a `join`-composed one and an
  // operator is handed a path their shell accepts. `normalize`, not `resolve`:
  // git already reports an absolute path, and on Windows `resolve` would anchor
  // the process's current drive onto a drive-less absolute (`/farm/x` -> `D:\farm\x`),
  // disagreeing with the `join`-composed paths this lane and its tests use — the
  // same drive-anchoring trap `worktreePathFor` avoids. `parseWorktreeList` stays a
  // pure grammar parser, verbatim over its input, so its own unit cases keep
  // asserting the bytes git emitted.
  return parseWorktreeList(outcome.stdout).map((entry) =>
    Object.assign({}, entry, { path: normalize(entry.path) }),
  );
}

/**
 * The stash entry count for the whole clone.
 *
 * Repo-global by construction: a stash belongs to the clone, not to any one
 * worktree, which is why the report places it once above the table rather than
 * as a column that would print the same number on every row.
 */
export async function readStashCount(run: WorktreeGitRunner, repoRoot: string): Promise<number> {
  const outcome = await run({ args: ["stash", "list", "--format=%H"], cwd: repoRoot });
  // A repository that has never stashed has no `refs/stash`, and some git
  // versions report that as a non-zero exit rather than as empty output. Either
  // way the answer is zero, and it is not a failure worth stopping a run for.
  if (outcome.status !== 0) return 0;
  return outcome.stdout.split("\n").filter((line) => line.trim() !== "").length;
}

/** Modified-and-staged versus untracked counts for one checkout. */
export interface WorktreeDirtyCounts {
  readonly modified: number;
  readonly untracked: number;
}

/** True when either count is non-zero. */
export function isDirty(counts: WorktreeDirtyCounts): boolean {
  return counts.modified > 0 || counts.untracked > 0;
}

/** Reads `git status --porcelain` in one checkout and counts the two classes. */
export async function readDirtyCounts(
  run: WorktreeGitRunner,
  worktreePath: string,
): Promise<WorktreeDirtyCounts> {
  const outcome = await run({ args: ["status", "--porcelain"], cwd: worktreePath });
  if (outcome.status !== 0) gitFailed(`reading git status in ${worktreePath}`, outcome);
  let modified = 0;
  let untracked = 0;
  for (const line of outcome.stdout.split("\n")) {
    if (line.trim() === "") continue;
    if (line.startsWith("??")) untracked += 1;
    else modified += 1;
  }
  return { modified, untracked };
}

// ---------------------------------------------------------------------------
// Path classification (REQ-WORKTREE-003)
// ---------------------------------------------------------------------------

/**
 * Answers, for every path at once, whether git tracks it, ignores it, or
 * neither — the facts `assertRulesAdmissible` is a rule about.
 *
 * TWO subprocesses for the whole set, not two per path: the admissibility check
 * runs on every invocation of every subcommand, and a per-path pass would put a
 * process spawn on each row of a policy file the operator is free to grow.
 *
 * `ls-files` answers tracking. A directory row is tracked when git tracks
 * anything UNDER it, which is why the match is on the path or on `path/` as a
 * prefix rather than on equality — `node_modules` is not itself an index entry
 * even in a repository that commits its contents.
 *
 * `check-ignore --stdin -z` answers ignoring, and its exit status 1 means
 * "nothing matched" rather than "the call failed"; only 128 and above are real.
 * Paths arrive on stdin because `-z` is accepted only with `--stdin`, which is
 * also what keeps a path starting with `-` off the argv.
 */
export async function classifyRepoPaths(
  run: WorktreeGitRunner,
  repoRoot: string,
  relPaths: readonly string[],
): Promise<Map<string, GitPathClass>> {
  const classes = new Map<string, GitPathClass>();
  if (relPaths.length === 0) return classes;

  const tracked = await run({ args: ["ls-files", "-z", "--", ...relPaths], cwd: repoRoot });
  if (tracked.status !== 0) gitFailed("listing tracked paths", tracked);
  const trackedPaths = tracked.stdout.split("\0").filter((entry) => entry !== "");

  const ignored = await run({
    args: ["check-ignore", "-z", "--stdin"],
    cwd: repoRoot,
    stdin: `${relPaths.join("\0")}\0`,
  });
  // 0 = at least one path is ignored, 1 = none are. Anything else is a fault.
  if (ignored.status !== 0 && ignored.status !== 1) gitFailed("checking ignored paths", ignored);
  const ignoredPaths = new Set(ignored.stdout.split("\0").filter((entry) => entry !== ""));

  for (const relPath of relPaths) {
    const isTracked = trackedPaths.some(
      (entry) => entry === relPath || entry.startsWith(`${relPath}/`),
    );
    if (isTracked) classes.set(relPath, "tracked");
    else if (ignoredPaths.has(relPath)) classes.set(relPath, "ignored");
    else classes.set(relPath, "untracked");
  }
  return classes;
}

// ---------------------------------------------------------------------------
// Refs, remotes, and the fetch (REQ-WORKTREE-009)
// ---------------------------------------------------------------------------

/** True when `refs/heads/<branch>` resolves. */
export async function localBranchExists(
  run: WorktreeGitRunner,
  repoRoot: string,
  branch: string,
): Promise<boolean> {
  const outcome = await run({
    args: ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
    cwd: repoRoot,
  });
  return outcome.status === 0;
}

/** True when `refs/remotes/origin/<branch>` resolves. */
export async function remoteBranchExists(
  run: WorktreeGitRunner,
  repoRoot: string,
  branch: string,
): Promise<boolean> {
  const outcome = await run({
    args: ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`],
    cwd: repoRoot,
  });
  return outcome.status === 0;
}

/** True when the clone has an `origin` remote configured. */
export async function hasOriginRemote(run: WorktreeGitRunner, repoRoot: string): Promise<boolean> {
  const outcome = await run({ args: ["remote", "get-url", "origin"], cwd: repoRoot });
  return outcome.status === 0 && outcome.stdout.trim() !== "";
}

/** What a fetch of one branch ended as. Neither value is a failure. */
export type FetchOutcome = "fetched" | "missing-ref";

/**
 * The sentence git prints when the remote has no such ref.
 *
 * This is the one classification that decides between a fall-through to
 * `create` and a `NETWORK_ERROR`, so it is a named constant rather than an
 * inline regex: a git that reworded it would break the branch plan silently,
 * and a test asserts the real binary still says it.
 */
const MISSING_REF_MARKER = "couldn't find remote ref";

/** Pure classifier over a failed fetch's stderr. Exported for its own test. */
export function classifyFetchFailure(stderr: string): FetchOutcome | "transport" {
  return stderr.toLowerCase().includes(MISSING_REF_MARKER) ? "missing-ref" : "transport";
}

/**
 * `git fetch origin <branch>`.
 *
 * A fetch that succeeds and finds no such ref is not a failure — REQ-WORKTREE-009
 * falls through to creating the branch — so it comes back as `missing-ref`. A
 * failure at the transport is this build's FIRST producer of `NETWORK_ERROR`,
 * which the generated CLI reference has until now labelled reserved and never
 * thrown.
 */
export async function fetchBranch(
  run: WorktreeGitRunner,
  repoRoot: string,
  branch: string,
): Promise<FetchOutcome> {
  const outcome = await run({
    args: ["fetch", "origin", branch],
    cwd: repoRoot,
    // The ONE call this lane bounds: an unreachable host must not hang setup
    // forever. The mutating add/remove carry no such ceiling (see the constant).
    timeoutMs: GIT_FETCH_TIMEOUT_MS,
  });
  if (outcome.status === 0) return "fetched";
  if (classifyFetchFailure(outcome.stderr) === "missing-ref") return "missing-ref";
  throw new EngineError(
    `Could not reach \`origin\` to look for the branch ${JSON.stringify(branch)}.`,
    {
      code: "NETWORK_ERROR",
      why: sanitizeGitOutput(outcome.stderr),
      next: `Check the network and the remote, or re-run with --no-track to create ${JSON.stringify(branch)} off the current HEAD without consulting origin.`,
    },
  );
}

// ---------------------------------------------------------------------------
// Administrative directories
// ---------------------------------------------------------------------------

/**
 * The shared common dir — one per clone, the same absolute path from every
 * linked worktree. That sharing is the whole reason the lock lives there: a
 * second process running from a different worktree of the same repository has
 * to see the same lock file, and the per-worktree admin dir would give it a
 * different one.
 */
export async function resolveGitCommonDir(run: WorktreeGitRunner, cwd: string): Promise<string> {
  const printed = await expectGit(run, "resolving the git common directory", {
    args: ["rev-parse", "--git-common-dir"],
    cwd,
  });
  return resolve(cwd, printed);
}

/**
 * The PER-WORKTREE administrative directory, which is where the receipt lives.
 *
 * Resolved rather than assumed: REQ-WORKTREE-006's placement depends on what
 * git says `--git-dir` is from inside a linked worktree, and the day that
 * changes should be the day a test goes red rather than the day a receipt turns
 * up in someone's `git status`.
 */
export async function resolveWorktreeGitDir(
  run: WorktreeGitRunner,
  worktreePath: string,
): Promise<string> {
  const printed = await expectGit(run, `resolving the git directory of ${worktreePath}`, {
    args: ["rev-parse", "--git-dir"],
    cwd: worktreePath,
  });
  return resolve(worktreePath, printed);
}

/** The commit `rev` names, as a full sha. */
export async function resolveSha(
  run: WorktreeGitRunner,
  cwd: string,
  rev = "HEAD",
): Promise<string> {
  return expectGit(run, `resolving ${rev}`, { args: ["rev-parse", rev], cwd });
}

// ---------------------------------------------------------------------------
// The mutating wrappers
// ---------------------------------------------------------------------------

/** How `git worktree add` should acquire the branch. */
export type BranchPlanKind = "attach" | "track" | "create";

/** The argv `git worktree add` is invoked with, as a decision rather than a string. */
export interface WorktreeAddRequest {
  readonly path: string;
  readonly branch: string;
  readonly kind: BranchPlanKind;
}

/**
 * Git's phrasing when the branch is already checked out somewhere else. Matched
 * so the refusal can name the OTHER worktree's path, which is the one fact that
 * turns "this failed" into "here is where your branch already is".
 */
const ALREADY_CHECKED_OUT = /already used by worktree at '([^']*)'/;

/**
 * `git worktree add`, with its two operator-facing collisions classified.
 *
 * Both are `VALIDATION_ERROR` rather than an infrastructure failure, because
 * both are answers to what the operator asked for: the target directory is
 * taken, or the branch is checked out elsewhere. Everything else keeps git's
 * own stderr and reports as `FS_ERROR`.
 */
export async function addWorktree(
  run: WorktreeGitRunner,
  repoRoot: string,
  request: WorktreeAddRequest,
): Promise<void> {
  const args =
    request.kind === "attach"
      ? ["worktree", "add", request.path, request.branch]
      : request.kind === "track"
        ? ["worktree", "add", "--track", "-b", request.branch, request.path, `origin/${request.branch}`]
        : ["worktree", "add", "-b", request.branch, request.path];

  const outcome = await run({ args, cwd: repoRoot });
  if (outcome.status === 0) return;

  const collision = ALREADY_CHECKED_OUT.exec(outcome.stderr);
  if (collision !== null) {
    // [m3] `collision[1]` is a path lifted out of GIT'S OWN stderr — untrusted
    // the same way the rest of it is (see `sanitizeGitOutput`'s own header
    // comment) — so it is sanitized before it rides into a message the
    // operator's terminal renders, consistent with how `why` already is.
    const other = sanitizeGitOutput(collision[1] ?? "");
    refuse(
      `The branch ${JSON.stringify(request.branch)} is already checked out in the worktree at ${other}.`,
      `Work in ${other}, or run setup with a different name.`,
    );
  }
  if (outcome.stderr.includes("already exists")) {
    refuse(
      `${request.path} already exists, so there is nothing for this run to create.`,
      `Remove it, or run \`stamity worktree cleanup\` for that name first.`,
    );
  }
  gitFailed(`creating the worktree at ${request.path}`, outcome);
}

/**
 * `git worktree remove`. `force` is passed only when the caller has consent for
 * it (REQ-WORKTREE-008), and git's own refusal on a dirty tree without it is
 * surfaced as a `VALIDATION_ERROR` naming the flag rather than as a fault.
 */
export async function removeWorktree(
  run: WorktreeGitRunner,
  repoRoot: string,
  worktreePath: string,
  force: boolean,
): Promise<void> {
  const args = force
    ? ["worktree", "remove", "--force", worktreePath]
    : ["worktree", "remove", worktreePath];
  const outcome = await run({ args, cwd: repoRoot });
  if (outcome.status === 0) return;
  if (outcome.stderr.includes("contains modified or untracked files")) {
    refuse(
      `${worktreePath} carries uncommitted changes, so it was not removed.`,
      `Commit or discard them, or re-run with --force.`,
    );
  }
  gitFailed(`removing the worktree at ${worktreePath}`, outcome);
}

/** `git worktree prune`. Abandoned registrations are always pruned. */
export async function pruneWorktrees(run: WorktreeGitRunner, repoRoot: string): Promise<void> {
  await expectGit(run, "pruning abandoned worktree registrations", {
    args: ["worktree", "prune"],
    cwd: repoRoot,
  });
}
