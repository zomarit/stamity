/**
 * The evidence `stamity run land` merges the run's own pull request on, and the decision it reaches
 * (REQ-FLOW-132, REQ-FLOW-133), as pure functions over what the verb read from GitHub and git: no network, no file,
 * no process, so every branch is provable with no network.
 *
 * **The ask set** ({@link LAND_ASK_PATHS}, decision D2): the person-only paths less the charter, rule and
 * agent-definition files, which land on the evidence (the review loop reads their diff), plus what decides which
 * checks run and who reviews. A diff touching one, a rename's old path included, or carrying a held patch, asks.
 *
 * **The evidence**: every required check run on the head green (a commit status never counts), no unresolved review
 * thread, the ledger at the head readable with no open Critical or Warning row, and `mergeable_state` `clean`, the
 * one state an admin's merge cannot pass silently.
 */
import { posix, win32 } from "node:path";
import { matchGlob } from "../change/classify.ts";
import { fromProjectRoot, PERSON_ONLY_PATHS } from "../change/personOnlyPaths.ts";
import { matchesDeployingBranch, type ResolvedAutonomy } from "../config/autonomy.ts";
import { parseLedgerText } from "./ledgerStore.ts";

/** The person-only globs that land on the evidence: the charter, the rule files and the agent definitions (D2). */
export const LANDS_ON_EVIDENCE: readonly string[] = [
  "**/AGENTS.md",
  "**/AGENTS.override.md",
  "**/CLAUDE.md",
  ".claude/rules/**",
  ".cursor/rules/**",
  ".cursorrules",
  ".github/copilot-instructions.md",
  ".github/instructions/**",
  ".claude/agents/**",
  ".claude/commands/**",
  ".claude/skills/**",
  ".agents/skills/**",
  ".cursor/agents/**",
  ".cursor/commands/**",
  ".cursor/skills/**",
  ".codex/agents/**",
  ".codex/skills/**",
  ".github/agents/**",
  ".github/prompts/**",
  ".github/skills/**",
  ".github/chatmodes/**",
];

/**
 * Beside the held set, the files that decide which checks run and who reviews (D2), named even where it holds them.
 * The last three are this repository's CI classifier and the source it loads (`.github/workflows/ci.yml`, "Classify
 * the change"): CI runs the base commit's copy, so an edit to them picks the checks of every later change, and a
 * person lands it (ledger build/5, review/83).
 */
const DEFINES_THE_EVIDENCE: readonly string[] = [
  ".github/actions/**",
  "**/action.yml",
  "**/action.yaml",
  "CODEOWNERS",
  ".github/CODEOWNERS",
  "docs/CODEOWNERS",
  ".stamity/change-classes.json",
  "scripts/ci/records-only.mjs",
  "src/change/classify.ts",
  "src/roster/triggers.ts",
];

/** The paths whose change makes `run land` ask: the held set less {@link LANDS_ON_EVIDENCE}, plus the evidence's own. */
export const LAND_ASK_PATHS: readonly string[] = [
  ...new Set([...PERSON_ONLY_PATHS.filter((glob) => !LANDS_ON_EVIDENCE.includes(glob)), ...DEFINES_THE_EVIDENCE]),
];

/** A held patch in any run folder: the run's own person-only change, which only a person lands. */
const HELD_PATCH = "**/.stamity/runs/*/held/*.patch";

/** A path as a case-insensitive, normalization-insensitive checkout reads it, as the run verbs' hold folds one. */
function foldPath(path: string): string {
  return path.replaceAll("\\", "/").normalize("NFC").toLowerCase();
}

/**
 * The paths of `paths` (git-top relative, a rename's old name among them) in {@link LAND_ASK_PATHS}, holding a held
 * patch, or at or under one of `hookPaths` (the hook files and the scripts the repository's own hook declarations name,
 * `./hookPaths.ts`, top-relative, build/2), sorted and once each: as written, or from the project root below the top
 * that `prefix` names, or from any of the roots it lists (REQ-FLOW-102: every setup root, the run's own among them).
 * A hook path matches without case and in one Unicode normalization form, as the hold matches it.
 */
export function askPathsOf(paths: readonly string[], prefix: string | readonly string[] = "", hookPaths: readonly string[] = []): string[] {
  const roots = hookPaths.map(foldPath);
  const prefixes = typeof prefix === "string" ? [prefix] : prefix;
  const asks = (path: string): boolean =>
    LAND_ASK_PATHS.some((glob) => matchGlob(path, glob, { foldCase: true })) || matchGlob(path, HELD_PATCH, { foldCase: true });
  const hooked = (path: string): boolean => {
    const folded = foldPath(path);
    return roots.some((root) => folded === root || folded.startsWith(`${root}/`));
  };
  return [...new Set(paths)]
    .filter(
      (path) =>
        asks(path) ||
        prefixes.some((root) => {
          const fromProject = fromProjectRoot(path, root);
          return fromProject !== null && asks(fromProject);
        }) ||
        hooked(path),
    )
    .toSorted();
}

/** Whether `path` is a held patch ({@link HELD_PATCH}). */
export function isHeldPatch(path: string): boolean {
  return matchGlob(path, HELD_PATCH, { foldCase: true });
}

const SEVERITIES: ReadonlySet<string> = new Set(["Critical", "Warning", "Minor"]);
const STATES: ReadonlySet<string> = new Set(["open", "fixed", "rejected", "deferred"]);

/** The ledger's open Critical and Warning rows by id, or why it does not read: a line that is no row, an unknown word. */
export function ledgerEvidence(text: string): { open: string[] } | { refused: string } {
  const parsed = parseLedgerText(text);
  if (parsed.unreadable.length > 0) return { refused: `the ledger's line ${parsed.unreadable.join(", ")} does not read as a row` };
  const open: string[] = [];
  for (const row of parsed.rows.values()) {
    if (!SEVERITIES.has(row.severity)) return { refused: `ledger row ${row.id} has a severity that is not Critical, Warning or Minor` };
    if (!STATES.has(row.state)) return { refused: `ledger row ${row.id} has a state that is not open, fixed, rejected or deferred` };
    if (row.state === "open" && row.severity !== "Minor") open.push(row.id);
  }
  return { open };
}

/** A required check as a ruleset or the branch's protection names it, with the app that must run it where named. */
export interface RequiredCheck {
  context: string;
  appId: number | null;
}

/** One check run on the head commit. */
export interface CheckRunRead {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  appId: number | null;
}

/** Each required check's state on the head; `missing` names a required context no check run carries. */
export interface CheckEvidence {
  green: string[];
  pending: string[];
  failing: string[];
  missing: string[];
}

/** The conclusions GitHub's own protection counts as passing a required check. */
const PASSING: ReadonlySet<string> = new Set(["success", "neutral", "skipped"]);

/**
 * Every required check's state: the latest check run of its name (and of its app, where the rule names one). With no
 * required set read, or an empty one, every check run name on the head is required, and at least one must be there.
 * A context only a commit status carries is `missing`: statuses never count, since a token can write them.
 */
export function checkEvidence(required: readonly RequiredCheck[] | null, runs: readonly CheckRunRead[]): CheckEvidence {
  const set: RequiredCheck[] =
    required !== null && required.length > 0 ? [...required] : [...new Set(runs.map((run) => run.name))].map((context) => ({ context, appId: null }));
  const out: CheckEvidence = { green: [], pending: [], failing: [], missing: [] };
  if (set.length === 0) out.missing.push("any check run");
  for (const check of set) {
    const latest = runs
      .filter((run) => run.name === check.context && (check.appId === null || run.appId === check.appId))
      .reduce<CheckRunRead | null>((best, run) => (best === null || run.id > best.id ? run : best), null);
    if (latest === null) out.missing.push(check.context);
    else if (latest.status !== "completed") out.pending.push(check.context);
    else if (latest.conclusion !== null && PASSING.has(latest.conclusion)) out.green.push(check.context);
    else out.failing.push(check.context);
  }
  return out;
}

/** One review thread: resolved or not, by whom, and every comment's author (`login` null where GitHub names none). */
export interface ThreadRead {
  isResolved: boolean;
  resolvedBy: string | null;
  authors: { login: string | null; person: boolean }[];
  /** Whether every comment's author was read (the thread holds no more comments than one page). */
  complete: boolean;
}

/**
 * How many threads count as unresolved (review/71): every open one, and every one `viewer` (the run's own login)
 * resolved that holds a comment by any other person, whichever comment it is, since the run may not close a person's
 * objection itself, or whose comments did not read whole. An author GitHub no longer names counts as a person; an
 * app's comments do not hold a thread open. On a single-account repository the person is the run's login: a residual.
 */
export function unresolvedThreads(threads: readonly ThreadRead[], viewer: string): number {
  const same = (a: string | null, b: string): boolean => a !== null && a.toLowerCase() === b.toLowerCase();
  return threads.filter((thread) => {
    if (!thread.isResolved) return true;
    if (!same(thread.resolvedBy, viewer)) return false;
    return !thread.complete || thread.authors.some((author) => author.login === null || (author.person && !same(author.login, viewer)));
  }).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(value: unknown, ...keys: string[]): unknown {
  let here: unknown = value;
  for (const key of keys) here = isRecord(here) ? here[key] : undefined;
  return here;
}

/** One page of {@link ThreadRead}s with the viewer and the next cursor, or `null` for an answer that does not read. */
export function parseThreadsPage(json: unknown): { viewer: string; author: string | null; threads: ThreadRead[]; next: string | null } | null {
  if (field(json, "errors") !== undefined) return null;
  const viewer = field(json, "data", "viewer", "login");
  const page = field(json, "data", "repository", "pullRequest", "reviewThreads");
  const nodes = field(page, "nodes");
  if (typeof viewer !== "string" || viewer === "" || !Array.isArray(nodes)) return null;
  const threads: ThreadRead[] = [];
  for (const node of nodes) {
    const resolved = field(node, "isResolved");
    if (typeof resolved !== "boolean") return null;
    const by = field(node, "resolvedBy", "login");
    const comments = field(node, "comments", "nodes");
    const count = field(node, "comments", "totalCount");
    if (!Array.isArray(comments) || typeof count !== "number") return null;
    const authors = comments.map((comment) => {
      const login = field(comment, "author", "login");
      return { login: typeof login === "string" ? login : null, person: field(comment, "author", "__typename") !== "Bot" };
    });
    threads.push({ isResolved: resolved, resolvedBy: typeof by === "string" ? by : null, authors, complete: count <= authors.length });
  }
  const more = field(page, "pageInfo", "hasNextPage") === true;
  const cursor = field(page, "pageInfo", "endCursor");
  if (more && typeof cursor !== "string") return null;
  const author = field(json, "data", "repository", "pullRequest", "author", "login");
  return { viewer, author: typeof author === "string" && author !== "" ? author : null, threads, next: more ? (cursor as string) : null };
}

/** One page of check runs with GitHub's `total_count`, or `null` for an answer that does not read. */
export function parseCheckRuns(json: unknown): { total: number; runs: CheckRunRead[] } | null {
  const total = field(json, "total_count");
  const list = field(json, "check_runs");
  if (typeof total !== "number" || !Array.isArray(list)) return null;
  const runs: CheckRunRead[] = [];
  for (const entry of list) {
    const { id, name, status, conclusion } = isRecord(entry) ? entry : {};
    if (typeof id !== "number" || typeof name !== "string" || typeof status !== "string") return null;
    const app = field(entry, "app", "id");
    runs.push({ id, name, status, conclusion: typeof conclusion === "string" ? conclusion : null, appId: typeof app === "number" ? app : null });
  }
  return { total, runs };
}

/**
 * The required checks a `rules/branches/<b>` answer names, and whether a rule requires a pull request, or `null` for
 * an answer that does not read as a rule list.
 */
export function parseBranchRules(json: unknown): { required: RequiredCheck[]; requiresPr: boolean } | null {
  if (!Array.isArray(json)) return null;
  const required: RequiredCheck[] = [];
  let requiresPr = false;
  for (const rule of json) {
    const type = field(rule, "type");
    if (type === "pull_request") requiresPr = true;
    if (type !== "required_status_checks") continue;
    const checks = field(rule, "parameters", "required_status_checks");
    if (!Array.isArray(checks)) return null;
    for (const check of checks) {
      const context = field(check, "context");
      const app = field(check, "integration_id");
      if (typeof context === "string") required.push({ context, appId: typeof app === "number" ? app : null });
    }
  }
  return { required, requiresPr };
}

/**
 * What a `branches/<b>` answer says: its tip, the required checks its classic protection names, and whether that
 * protection is on (it may require a pull request, which only an admin can read); `null` where it does not read.
 */
export function parseBranch(json: unknown): { tip: string; required: RequiredCheck[]; protectedBranch: boolean } | null {
  const tip = field(json, "commit", "sha");
  if (typeof tip !== "string") return null;
  const required: RequiredCheck[] = [];
  const checks = field(json, "protection", "required_status_checks", "checks");
  for (const check of Array.isArray(checks) ? checks : []) {
    const context = field(check, "context");
    const app = field(check, "app_id");
    if (typeof context === "string") required.push({ context, appId: typeof app === "number" ? app : null });
  }
  const contexts = field(json, "protection", "required_status_checks", "contexts");
  for (const context of Array.isArray(contexts) ? contexts : []) {
    if (typeof context === "string" && !required.some((check) => check.context === context)) required.push({ context, appId: null });
  }
  return { tip, required, protectedBranch: field(json, "protection", "enabled") === true };
}

/** The changed paths of one `pulls/<n>/files` page, a rename's old name included, or `null` where it does not read. */
export function parseFiles(json: unknown): { paths: string[]; count: number } | null {
  if (!Array.isArray(json)) return null;
  const paths: string[] = [];
  for (const entry of json) {
    const name = field(entry, "filename");
    if (typeof name !== "string") return null;
    paths.push(name);
    const old = field(entry, "previous_filename");
    if (typeof old === "string") paths.push(old);
  }
  return { paths, count: json.length };
}

/** The fields of a pull request the land verb reads. */
export interface LandPr {
  number: number;
  url: string;
  nodeId: string;
  state: string;
  merged: boolean;
  draft: boolean;
  headRef: string;
  headSha: string;
  /** `owner/repo` of the head's repository; `null` where GitHub names none (a deleted fork). */
  headRepo: string | null;
  baseRef: string;
  body: string;
  mergeableState: string | null;
  changedFiles: number;
  /**
   * The login that opened it as the review-thread query names it (review/94), the spelling `viewer` has; `null` where
   * GitHub names none. {@link parsePr} leaves it `null`: REST spells an app `app[bot]`, so the caller fills it.
   */
  author: string | null;
}

/** A `pulls/<n>` answer as {@link LandPr}, or `null` where a field it needs is missing. */
export function parsePr(json: unknown): LandPr | null {
  const number = field(json, "number");
  const url = field(json, "html_url");
  const nodeId = field(json, "node_id");
  const state = field(json, "state");
  const headRef = field(json, "head", "ref");
  const headSha = field(json, "head", "sha");
  const baseRef = field(json, "base", "ref");
  const changed = field(json, "changed_files");
  if (typeof number !== "number" || typeof url !== "string" || typeof nodeId !== "string" || typeof state !== "string") return null;
  if (typeof headRef !== "string" || typeof headSha !== "string" || typeof baseRef !== "string" || typeof changed !== "number") return null;
  const repo = field(json, "head", "repo", "full_name");
  const body = field(json, "body");
  const mergeable = field(json, "mergeable_state");
  return {
    number,
    url,
    nodeId,
    state,
    merged: field(json, "merged") === true,
    draft: field(json, "draft") === true,
    headRef,
    headSha,
    headRepo: typeof repo === "string" ? repo : null,
    baseRef,
    body: typeof body === "string" ? body : "",
    mergeableState: typeof mergeable === "string" ? mergeable : null,
    changedFiles: changed,
    author: null,
  };
}

/** What makes a pull request the run's own, read locally and from origin. */
export interface OwnPrFacts {
  /** `owner/repo` of the repository origin names. */
  repo: string;
  /** The run's branch: the record's `Branch:` (or `stamity/<run-id>` where it names a default branch). */
  runBranch: string;
  /** The commit `HEAD` names. */
  head: string;
  /** The commit origin's run branch names, or `null` where origin has none. */
  originTip: string | null;
  /** The run's marker (`./pullRequest.ts` `runMarker`). */
  marker: string;
  defaultBranch: string;
  /** The login `gh` is authenticated as (review/73): the run's own pull request was opened by it. */
  viewer: string;
}

/**
 * Whether `pr` is the run's own and already merged at the head (`already`), else why it is not the run's own to land.
 * Its own: head branch the run's, head `HEAD` and origin's tip, body ending with the marker, into the default branch,
 * from the same repository, opened by the run's login (review/73; the number the run verb recorded is checked by the
 * caller). On a single-account repository the run's login is the person's, so the author check cannot tell them apart.
 */
export function ownPr(pr: LandPr, own: OwnPrFacts): { already: boolean; refusals: string[] } {
  const refusals: string[] = [];
  if (pr.headRef !== own.runBranch) refusals.push(`pull request #${pr.number} is from ${pr.headRef}, not the run's branch ${own.runBranch}`);
  if (pr.headRepo === null || pr.headRepo.toLowerCase() !== own.repo.toLowerCase()) refusals.push(`pull request #${pr.number} comes from a fork, not ${own.repo}`);
  if (pr.baseRef !== own.defaultBranch) refusals.push(`pull request #${pr.number} targets ${pr.baseRef}, not the default branch ${own.defaultBranch}`);
  if (!pr.body.trimEnd().endsWith(own.marker)) refusals.push(`pull request #${pr.number}'s body does not end with the run's marker`);
  if (pr.headSha !== own.head) refusals.push(`pull request #${pr.number}'s head ${pr.headSha} is not HEAD ${own.head}`);
  if (pr.author === null || pr.author.toLowerCase() !== own.viewer.toLowerCase()) {
    refusals.push(`pull request #${pr.number} was opened by ${pr.author ?? "an account GitHub no longer names"}, not by the run's login ${own.viewer}`);
  }
  if (refusals.length === 0 && pr.merged) return { already: true, refusals };
  if (pr.state !== "open") refusals.push(`pull request #${pr.number} is ${pr.merged ? "merged at another head" : "closed"}`);
  if (own.originTip !== own.head) refusals.push(own.originTip === null ? `origin has no branch ${own.runBranch}` : `origin's ${own.runBranch} is at ${own.originTip}, not HEAD ${own.head}`);
  return { already: false, refusals };
}

/** What `--fast-forward` reads beside the merge's evidence. */
export interface ForwardFacts {
  /** Why a rule may require a pull request on the default branch, or `null` where none does. */
  requiresPr: string | null;
  /** GitHub's `compare/<tip>...<head>` status (`ahead`, `identical`, `behind`, `diverged`), `null` where unread. */
  compare: string | null;
}

/** Everything {@link decideLand} decides on. */
export interface LandInput {
  pr: LandPr;
  own: OwnPrFacts;
  /** `--ready`: a draft is marked ready once the rest holds. */
  ready: boolean;
  /** Set for the check before a ready mark: the draft state and `mergeable_state` are read after it. */
  beforeReady?: boolean;
  setting: ResolvedAutonomy;
  /** The changed paths, renames' old names included, and whether the list read whole. */
  files: { paths: readonly string[]; complete: boolean };
  /**
   * The project's folder below the git top (`git rev-parse --show-prefix`), or every setup root the land read with it
   * (REQ-FLOW-102), each read as {@link askPathsOf} reads one.
   */
  prefix: string | readonly string[];
  /**
   * The hook files and declared hook scripts read at `Base:` and at the head (`./hookPaths.ts`, build/2), or why they
   * could not be read, which asks: whether the diff reaches a hook is then not known.
   */
  hookPaths: readonly string[] | string;
  checks: CheckEvidence;
  /** Unresolved review threads, or `null` where they could not be read. */
  threads: number | null;
  ledger: { open: string[] } | { refused: string };
  /** Present for `--fast-forward`. */
  forward?: ForwardFacts;
}

/** The act a person is asked for. */
export type LandAct = "pr-merge" | "pr-ready" | "push-default";

/** What the land verb does: land, report a landing already made, ask the person, or refuse naming every reason. */
export type LandDecision =
  | { outcome: "land" | "already-landed" }
  /** review/110: `reasons` holds every reason the act is the person's; `reason` and `act` are the first one's. */
  | { outcome: "asks"; reason: string; reasons: string[]; act: LandAct }
  | { outcome: "refused"; reasons: string[]; pending: boolean };

/** Why `mergeable_state` stops the merge, or `null` for `clean`. */
function mergeableRefusal(state: string | null): string | null {
  if (state === "clean") return null;
  if (state === null || state === "unknown") return "mergeable_state is not computed yet, run it again";
  if (state === "blocked") return "mergeable_state is blocked: an admin merge past the branch's rules asks";
  if (state === "behind") return "mergeable_state is behind: the branch is behind the default branch";
  if (state === "dirty") return "mergeable_state is dirty: the branch conflicts with the default branch";
  if (state === "unstable") return "mergeable_state is unstable: a check that is not required is failing";
  if (state === "draft") return "mergeable_state reads draft: GitHub computes it after the ready mark, which a dry run does not make";
  return `mergeable_state is ${state}, not clean`;
}

/**
 * The decision, in this order: not the run's own (refused) or merged already (already-landed); then every gap in the
 * evidence (refused, `pending` where checks still run or GitHub has not computed the merge state, so a wait may help);
 * then every reason the act is the person's (asks: mode `ask`, the ask set or a held patch, a deploying branch or act,
 * a rule requiring a pull request for a fast-forward); else land.
 */
export function decideLand(input: LandInput): LandDecision {
  const { pr, setting } = input;
  const own = ownPr(pr, input.own);
  if (own.already) return { outcome: "already-landed" };
  if (own.refusals.length > 0) return { outcome: "refused", reasons: own.refusals, pending: false };

  const reasons: string[] = [];
  let waitable = true;
  const gap = (reason: string, pending = false): void => {
    reasons.push(reason);
    if (!pending) waitable = false;
  };
  if (pr.draft && !input.ready && input.beforeReady !== true) gap("the pull request is a draft: mark it ready first, or pass --ready");
  if (!input.files.complete) gap(`the changed files did not read whole (GitHub names ${pr.changedFiles})`);
  const { checks } = input;
  // review/107: a required check with no check run yet may still be queued to start, so it is waited for as pending.
  for (const name of checks.missing) gap(`required check ${name} has no check run yet on ${pr.headSha} (commit statuses do not count)`, true);
  for (const name of checks.failing) gap(`required check ${name} did not pass on ${pr.headSha}`);
  for (const name of checks.pending) gap(`required check ${name} is still running on ${pr.headSha}`, true);
  if (input.threads === null) gap("the review threads could not be read");
  else if (input.threads > 0) gap(`${input.threads} review thread${input.threads === 1 ? " is" : "s are"} unresolved`);
  if ("refused" in input.ledger) gap(`the ledger at ${pr.headSha} does not read: ${input.ledger.refused}`);
  else if (input.ledger.open.length > 0) gap(`the ledger at ${pr.headSha} holds open Critical or Warning rows: ${input.ledger.open.join(", ")}`);
  if (input.beforeReady !== true) {
    const mergeable = mergeableRefusal(pr.mergeableState);
    if (mergeable !== null) gap(mergeable, pr.mergeableState === null || pr.mergeableState === "unknown");
  }
  const forward = input.forward;
  if (forward !== undefined && forward.compare !== "ahead") {
    if (forward.compare === "identical" && reasons.length === 0) return { outcome: "already-landed" };
    gap(`the head is not a fast-forward of ${input.own.defaultBranch} (GitHub's compare reads ${forward.compare ?? "nothing"})`);
  }
  if (reasons.length > 0) return { outcome: "refused", reasons, pending: waitable };

  // review/110: every reason the act is the person's, in this order, so the person approves all of what they are shown.
  const act: LandAct = forward !== undefined ? "push-default" : "pr-merge";
  const asks: { reason: string; act: LandAct }[] = [];
  if (setting.mode === "ask") asks.push({ reason: "autonomy.mode is ask", act });
  if (typeof input.hookPaths === "string") asks.push({ reason: input.hookPaths, act });
  const held = askPathsOf(input.files.paths, input.prefix, typeof input.hookPaths === "string" ? [] : input.hookPaths);
  const patches = held.filter((path) => isHeldPatch(path));
  const others = held.filter((path) => !isHeldPatch(path));
  if (patches.length > 0) asks.push({ reason: `the diff carries a held patch (${patches.join(", ")})`, act });
  if (others.length > 0) asks.push({ reason: `the diff touches paths that define the evidence: ${others.join(", ")}`, act });
  if (matchesDeployingBranch(input.own.defaultBranch, setting.deployingBranches)) asks.push({ reason: `${input.own.defaultBranch} is named in autonomy.deployingBranches`, act });
  if (pr.draft && input.ready && setting.deploying.includes("pr-ready")) asks.push({ reason: "autonomy.deployingActs names pr-ready", act: "pr-ready" });
  if (setting.deploying.includes(act)) asks.push({ reason: `autonomy.deployingActs names ${act}`, act });
  if (forward !== undefined && forward.requiresPr !== null) asks.push({ reason: forward.requiresPr, act });
  const [first] = asks;
  if (first === undefined) return { outcome: "land" };
  return { outcome: "asks", reason: first.reason, reasons: asks.map((entry) => entry.reason), act: first.act };
}

/** The line that opens the evidence the pull request's body carries before a merge. */
const EVIDENCE_OPENING = "evidence checked at ";

/** build/6: the line that opens why the run's merge waits, on an `asks` or a `refused` outcome. */
const WAITS_OPENING = "merge waits on: ";

/**
 * The evidence line: what was checked, when and for which head, never that it landed; with `approval`, the head the
 * person approved and every asks reason they approved it over (review/103, review/110).
 */
export function evidenceLine(at: string, sha: string, greenChecks: number, threads: number, openRows: number, approval?: { sha: string; reasons: readonly string[] }): string {
  const checked = `${EVIDENCE_OPENING}${at} for ${sha}: ${greenChecks} required check runs green, ${threads} open threads, ${openRows} open Critical/Warning rows`;
  if (approval === undefined) return checked;
  const over = approval.reasons.map((reason) => reason.replaceAll(/\s*\r?\n\s*/g, " ")).join("; ");
  return `${checked}; approved by the person for ${approval.sha} over: ${over}`;
}

/** build/6: why the merge waits, every reason on one line, never that it landed. */
export function waitsLine(reasons: readonly string[]): string {
  return `${WAITS_OPENING}${reasons.map((reason) => reason.replaceAll(/\s*\r?\n\s*/g, " ")).join("; ")}`;
}

/**
 * `body` with `line` as its one status line, just before the run's `marker`, which still ends it: an earlier evidence
 * line or "merge waits on" line goes, so the evidence written before a merge replaces why it waited (build/6).
 */
export function withStatusLine(body: string, marker: string, line: string): string {
  const kept = body
    .trimEnd()
    .split(/\r?\n/)
    .filter((text) => !text.startsWith(EVIDENCE_OPENING) && !text.startsWith(WAITS_OPENING))
    .join("\n")
    .trimEnd();
  const before = kept.endsWith(marker) ? kept.slice(0, -marker.length).trimEnd() : kept;
  return `${before === "" ? "" : `${before}\n\n`}${line}\n\n${marker}`;
}

/** The waits `--wait` makes, injected so the poll is provable with no clock. */
export interface PollClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

/**
 * Read with `read` until `pending` says the answer is final or the next read would land past `deadline` (ms on
 * `clock`), sleeping `intervalMs` between reads; the last answer read.
 */
export async function pollWhilePending<T>(read: () => Promise<T>, pending: (value: T) => boolean, deadline: number, intervalMs: number, clock: PollClock): Promise<T> {
  let value = await read();
  while (pending(value) && clock.now() + intervalMs <= deadline) {
    // oxlint-disable-next-line no-await-in-loop -- a poll: each read waits out the interval after the last one
    await clock.sleep(intervalMs);
    // oxlint-disable-next-line no-await-in-loop -- the next read decides whether the poll goes on
    value = await read();
  }
  return value;
}

/**
 * build/18: what a place check needs, injected so the win32 reading is provable on any host: the platform whose
 * path rules apply, and a `realpath` that names an existing path in its long, real form (Node's `realpath.native`)
 * and throws for one that does not exist.
 */
export interface PlaceReads {
  platform: NodeJS.Platform;
  realpath(path: string): string;
}

/**
 * `path` as one comparable form: absolute by the platform's rules, its deepest existing ancestor named by `realpath`
 * (so a Windows 8.3 short name and the long name read alike, as does a folder reached through a link) with the rest
 * appended; on win32 with one separator and one letter case. `null` where not even the root resolves.
 */
export function placeOf(path: string, reads: PlaceReads): string | null {
  const rules = reads.platform === "win32" ? win32 : posix;
  let at = rules.resolve(path);
  const rest: string[] = [];
  for (;;) {
    let found: string | null = null;
    try {
      found = reads.realpath(at);
    } catch {
      found = null;
    }
    if (found !== null) {
      const joined = rest.length === 0 ? rules.resolve(found) : rules.join(rules.resolve(found), ...rest.toReversed());
      return reads.platform === "win32" ? joined.replaceAll("/", "\\").toLowerCase() : joined;
    }
    const parent = rules.dirname(at);
    if (parent === at) return null;
    rest.push(rules.basename(at));
    at = parent;
  }
}

/** Whether `place` is `root` or lies under it, by a separator boundary: a sibling that only shares a prefix is not. */
function under(place: string, root: string, platform: NodeJS.Platform): boolean {
  const separator = platform === "win32" ? "\\" : "/";
  const base = root.endsWith(separator) ? root : `${root}${separator}`;
  return place === root || place.startsWith(base);
}

/**
 * `path` with its folder read by {@link placeOf} and its own last name kept, not followed: where a `PATH` entry lies,
 * as against the program a link there names (review/91). `null` where its folder does not resolve.
 */
export function entryPlaceOf(path: string, reads: PlaceReads): string | null {
  const rules = reads.platform === "win32" ? win32 : posix;
  const folder = placeOf(rules.dirname(rules.resolve(path)), reads);
  if (folder === null) return null;
  const joined = rules.join(folder, rules.basename(path));
  return reads.platform === "win32" ? joined.toLowerCase() : joined;
}

/**
 * build/18: whether `place` (already read by {@link placeOf} or {@link entryPlaceOf}; `null` where it did not resolve)
 * lies in any of `roots`, each read by {@link placeOf}. Fails closed: a `null` place counts as inside. A root that
 * does not resolve is passed over, as it holds nothing.
 */
export function withinAny(place: string | null, roots: readonly string[], reads: PlaceReads): boolean {
  if (place === null) return true;
  return roots.some((root) => {
    const base = placeOf(root, reads);
    return base !== null && under(place, base, reads.platform);
  });
}

/** {@link withinAny} for a path not yet read: the path itself, every link followed. */
export function insideAny(path: string, roots: readonly string[], reads: PlaceReads): boolean {
  return withinAny(placeOf(path, reads), roots, reads);
}
