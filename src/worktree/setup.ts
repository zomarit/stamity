import { chmod, lstat, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { acquireWriteLock, isCrossProcessLockingEnabled } from "../merge/atomicWrite.ts";
import { EngineError } from "../types/errors.ts";
import {
  addWorktree,
  classifyRepoPaths,
  fetchBranch,
  hasOriginRemote,
  listWorktrees,
  localBranchExists,
  remoteBranchExists,
  resolveGitCommonDir,
  resolveSha,
  resolveWorktreeGitDir,
  runGit,
  assertWorktreeName,
  worktreePathFor,
  type BranchPlanKind,
  type WorktreeGitRunner,
} from "./git.ts";
import {
  materializeEntries,
  receiptEntryFor,
  type MaterializeRequest,
  type MaterializeResult,
  type MaterializeStrategy,
} from "./materialize.ts";
import {
  assertRulesAdmissible,
  isKnownCredentialPath,
  materializationRules,
  readWorktreePolicy,
  resolveFarmDir,
  resolveStrategy,
  type GitPathClass,
  type WorktreePolicy,
} from "./policy.ts";
import { createWorktreeReceipt, writeWorktreeReceipt, type WorktreeReceiptEntry } from "./receipt.ts";

/**
 * `stamity worktree setup <name>`: the flow that turns a name into a checkout
 * with the machine-local state a checkout cannot carry, and a receipt saying
 * exactly what it placed.
 *
 * **The plan is separated from the run, and that separation IS the dry-run
 * guarantee.** {@link planWorktreeSetup} resolves everything that can be
 * resolved without writing — the farm path, the name, the entry table, the
 * branch plan, and the answer every consent gate would give for this
 * invocation — and {@link runWorktreeSetup} calls it and then acts on it. The
 * two therefore cannot disagree row for row, which REQ-WORKTREE-012 asks for;
 * a predictor written beside the writer and kept in step by hand can, and the
 * merge engine already pins the same property for the same reason.
 *
 * **Plan resolution is pure of consent.** The branch plan says what the
 * repository's state implies — attach, track, or create — and says nothing
 * about whether the operator agreed to it. Consent is applied afterwards
 * ({@link applySetupConsent}) so a dry run can print the gate and the answer it
 * would get, and so the refusals are one table rather than three branches
 * buried in a resolution.
 *
 * **One lock spans the whole critical section.** It is taken before the
 * existence check and released after the receipt write, so the loser of a
 * same-name race finds the directory present and refuses rather than both
 * runners passing a check that ran before either wrote. Locking only the file
 * writes — leaving `git worktree add` outside — is the exact shape of the race
 * this design closes. The lock is NAME-scoped and lives in the shared git
 * common dir: different names run in parallel, and a second process running
 * from a different worktree of the same clone still sees the same lock.
 *
 * **A failure after the tree exists is not a throw.** REQ-WORKTREE-011's
 * `partial` is a RETURNED result carrying the worktree path, the per-entry
 * outcomes and an error document, because a thrown failure renders through an
 * envelope that drops everything the run computed — leaving an operator with a
 * worktree on disk and a message saying the command failed.
 */

/**
 * What the operator has said about one gated operation.
 *
 * `not-required` is distinct from `granted`: it is what a caller passes when
 * ITS OWN read of the world found nothing to ask about, and it must never be
 * read as an answered gate. `cleanup`'s consent is resolved by the CLI from
 * one inventory read, then re-checked by the engine against a SECOND,
 * independent read taken later — a tree that turned dirty in that window must
 * still refuse, which only holds if "nothing needed asking" and "the operator
 * said yes" are different values. A caller that collapsed the two onto
 * `granted` would have the engine treat its own stale non-answer as consent.
 */
export type ConsentAnswer = "granted" | "declined" | "unanswered" | "not-required";

/**
 * True for an explicit `"granted"` answer, false for every other value —
 * `declined`, `unanswered`, `not-required`, and any future `ConsentAnswer`
 * member. [secfix NR-1]
 *
 * Every consent check in this lane routes through this rather than
 * enumerating the negative answers and falling through to proceed: a
 * negative-only chain (`declined ? refuse : unanswered ? refuse : proceed`)
 * is fail-OPEN by construction — it proceeds for any answer the author did
 * not think to list, which is exactly how `applySetupConsent`'s attach and
 * track gates let the later-added `"not-required"` value sail through with
 * nobody having said yes. A positive `isGranted` check is fail-CLOSED by the
 * same construction: a fifth `ConsentAnswer` member refuses by default rather
 * than proceeding by default, with no gate needing to be told about it.
 */
export function isGranted(answer: ConsentAnswer): boolean {
  return answer === "granted";
}

/**
 * The three gates of REQ-WORKTREE-008 that `setup` owns.
 *
 * `unanswered` is a distinct value rather than `false` on purpose: a closed
 * gate must refuse and name the flag, while an explicit `declined` is an answer
 * with its own behaviour — `--no-use-existing` suggests a different name, and
 * `--no-track` creates the branch off HEAD instead. Collapsing the two would
 * make a non-interactive run indistinguishable from an operator who said no.
 */
export interface WorktreeSetupConsent {
  readonly attach: ConsentAnswer;
  readonly track: ConsentAnswer;
  readonly secrets: ConsentAnswer;
}

/** Nothing granted: the shape a `--json` or non-TTY run arrives with. */
export const UNANSWERED_CONSENT: WorktreeSetupConsent = Object.freeze({
  attach: "unanswered",
  track: "unanswered",
  secrets: "unanswered",
});

/** How the branch will be acquired, and how that was decided. */
export interface BranchPlan {
  readonly kind: BranchPlanKind;
  readonly branch: string;
  /** One sentence naming the evidence, for the report and the dry run. */
  readonly reason: string;
  /** False when no `git fetch` was performed — a dry run, or no `origin`. */
  readonly remoteConsulted: boolean;
  /** The other worktree already holding this branch, when there is one. */
  readonly checkedOutAt: string | null;
}

/** One row of the entry table, identical in the dry run and the real run. */
export interface PlannedEntry {
  readonly path: string;
  readonly strategy: MaterializeStrategy;
  readonly secret: boolean;
  readonly reason: string | null;
}

/** A gate the real run would hit, and the answer this invocation gives it. */
export interface PlannedConsentGate {
  readonly gate: "attach" | "track" | "secrets";
  readonly answer: ConsentAnswer;
  /** What that answer produces: `proceed`, `refuse`, `skip`, or `create`. */
  readonly effect: "proceed" | "refuse" | "skip" | "create-instead";
}

/** Everything resolvable without writing a byte. */
export interface WorktreeSetupPlan {
  readonly name: string;
  readonly farmDir: string;
  readonly worktreePath: string;
  /** Absolute path of the policy file, or the built-in label. */
  readonly policySource: string;
  readonly policy: WorktreePolicy;
  readonly entries: readonly PlannedEntry[];
  readonly branchPlan: BranchPlan;
  readonly gates: readonly PlannedConsentGate[];
}

/** Inputs to the planner. */
export interface WorktreeSetupPlanOptions {
  readonly repoRoot: string;
  readonly name: string;
  readonly consent?: WorktreeSetupConsent;
  /**
   * Whether the remote may be consulted. `false` on `--dry-run`: a preview that
   * mutates remote-tracking refs is a preview that changed something.
   */
  readonly fetch?: boolean;
  readonly run?: WorktreeGitRunner;
  /** Pre-read policy, so one invocation reads the file once. */
  readonly policy?: WorktreePolicy;
}

/** Whether the new checkout is usable by a session right now. */
export type SetupPresence = "present" | "absent" | "unreadable";

/** One entry's outcome as the report carries it. */
export interface WorktreeEntryReport {
  readonly path: string;
  readonly requested: MaterializeStrategy;
  readonly strategy: MaterializeStrategy;
  // [secfix A2] `withheld`: a credential child discovered while expanding a
  // copied directory, for which this run had no secrets consent — distinct
  // from `skipped`, which means the destination already holds bytes.
  readonly outcome: "materialized" | "skipped" | "absent" | "failed" | "withheld";
  readonly reason: string | null;
  readonly mode: string | null;
  readonly errno: string | null;
  readonly fallbackFrom: "symlink" | null;
}

/** The error document a `partial` run owes (`src/cli/kit/program.ts`). */
export interface WorktreeErrorDocument {
  readonly code: "FS_ERROR";
  readonly message: string;
  readonly next: string;
}

/** What `setup` returns. `partial` is exit 1 with this payload intact. */
export interface WorktreeSetupResult {
  readonly status: "complete" | "partial";
  readonly worktree: { readonly path: string; readonly branch: string; readonly head: string };
  readonly branchPlan: BranchPlanKind;
  readonly entries: readonly WorktreeEntryReport[];
  readonly notices: readonly string[];
  readonly setup: SetupPresence;
  readonly receiptPath: string | null;
  readonly error: WorktreeErrorDocument | null;
}

/** Inputs to the real run. */
export interface WorktreeSetupOptions extends WorktreeSetupPlanOptions {
  /** Stamped into the receipt, so a later cleanup knows which build wrote it. */
  readonly engineVersion: string;
  /** Injected clock; the receipt's `createdAt` is the only time this flow reads. */
  readonly now?: () => Date;
  /**
   * The invocation as the operator typed it, so every refusal can name the
   * COMPLETE rerun line rather than a bare flag.
   */
  readonly rerun?: string;
}

function refuse(message: string, next: string): never {
  throw new EngineError(message, { code: "VALIDATION_ERROR", next });
}

// ---------------------------------------------------------------------------
// Branch plan (REQ-WORKTREE-009)
// ---------------------------------------------------------------------------

/**
 * Resolves attach / track / create, in that order, with no reference to
 * consent.
 *
 * A local branch wins outright. Otherwise the remote decides, and `fetch: false`
 * is what a dry run passes: the local remote-tracking refs are still READ,
 * because reading them costs nothing and makes the preview more accurate than
 * pretending the remote is unknown, and the plan records `remoteConsulted:
 * false` so the report can say the remote was not contacted.
 *
 * The already-checked-out collision is carried on the plan rather than thrown
 * here, for the same reason consent is applied later: this function answers
 * what the repository implies, and the refusal belongs to the flow that was
 * about to act on it.
 */
export async function resolveBranchPlan(
  run: WorktreeGitRunner,
  repoRoot: string,
  branch: string,
  opts: { readonly fetch: boolean },
): Promise<BranchPlan> {
  if (await localBranchExists(run, repoRoot, branch)) {
    const holder = (await listWorktrees(run, repoRoot)).find((entry) => entry.branch === branch);
    return {
      kind: "attach",
      branch,
      reason: `a local branch \`${branch}\` already exists`,
      remoteConsulted: false,
      checkedOutAt: holder?.path ?? null,
    };
  }

  if (!opts.fetch) {
    const known = await remoteBranchExists(run, repoRoot, branch);
    return {
      kind: known ? "track" : "create",
      branch,
      reason: known
        ? `no local branch \`${branch}\`, and \`origin/${branch}\` is already known locally — the remote was NOT consulted for this preview`
        : `no local branch \`${branch}\` and no local \`origin/${branch}\` — the remote was NOT consulted for this preview`,
      remoteConsulted: false,
      checkedOutAt: null,
    };
  }

  if (!(await hasOriginRemote(run, repoRoot))) {
    return {
      kind: "create",
      branch,
      reason: `no local branch \`${branch}\` and no \`origin\` remote to look in`,
      remoteConsulted: false,
      checkedOutAt: null,
    };
  }

  // A transport failure escapes as NETWORK_ERROR; a fetch that simply found no
  // such ref is not a failure and falls through to `create`.
  const fetched = await fetchBranch(run, repoRoot, branch);
  const known = fetched === "fetched" && (await remoteBranchExists(run, repoRoot, branch));
  return {
    kind: known ? "track" : "create",
    branch,
    reason: known
      ? `\`origin/${branch}\` was found on the remote`
      : `\`origin\` has no branch \`${branch}\``,
    remoteConsulted: true,
    checkedOutAt: null,
  };
}

// ---------------------------------------------------------------------------
// The plan (REQ-WORKTREE-012)
// ---------------------------------------------------------------------------

/** Resolves everything a run needs, writing nothing. */
export async function planWorktreeSetup(
  opts: WorktreeSetupPlanOptions,
): Promise<WorktreeSetupPlan> {
  const run = opts.run ?? runGit;
  const consent = opts.consent ?? UNANSWERED_CONSENT;

  await assertWorktreeName(run, opts.repoRoot, opts.name);

  const policy = opts.policy ?? (await readWorktreePolicy(opts.repoRoot));
  const farmDir = resolveFarmDir(policy, opts.repoRoot);
  const worktreePath = worktreePathFor(farmDir, opts.name);

  const rules = materializationRules(policy);
  // One batched `ls-files` / `check-ignore` pass over the whole resolved set,
  // answering both admissibility conditions at once.
  const classes = await classifyRepoPaths(run, opts.repoRoot, rules.map((rule) => rule.path));
  assertRulesAdmissible(policy, (relPath) => classes.get(relPath) ?? "untracked");

  const entries: PlannedEntry[] = rules.map((rule) => ({
    path: rule.path,
    strategy: rule.strategy as MaterializeStrategy,
    secret: rule.secret,
    reason: rule.reason ?? null,
  }));

  const branchPlan = await resolveBranchPlan(run, opts.repoRoot, opts.name, {
    fetch: opts.fetch ?? true,
  });

  return {
    name: opts.name,
    farmDir,
    worktreePath,
    policySource: policy.source,
    policy,
    entries,
    branchPlan,
    gates: planConsentGates(branchPlan, entries, consent),
  };
}

/** The gates the real run would hit, with the answer this invocation gives. */
function planConsentGates(
  branchPlan: BranchPlan,
  entries: readonly PlannedEntry[],
  consent: WorktreeSetupConsent,
): PlannedConsentGate[] {
  const gates: PlannedConsentGate[] = [];
  if (branchPlan.kind === "attach") {
    gates.push({
      gate: "attach",
      answer: consent.attach,
      effect: isGranted(consent.attach) ? "proceed" : "refuse",
    });
  }
  if (branchPlan.kind === "track") {
    gates.push({
      gate: "track",
      answer: consent.track,
      // A DECLINED track is the one gate whose refusal is not a stop: the
      // operator asked for a new local branch off HEAD instead.
      effect: isGranted(consent.track)
        ? "proceed"
        : consent.track === "declined"
          ? "create-instead"
          : "refuse",
    });
  }
  if (entries.some((entry) => entry.secret)) {
    gates.push({
      gate: "secrets",
      answer: consent.secrets,
      effect: isGranted(consent.secrets) ? "proceed" : "skip",
    });
  }
  return gates;
}

/**
 * Applies consent to a resolved plan: the refusals, and the one gate whose
 * `declined` answer changes the plan rather than stopping it.
 *
 * Every refusal carries the COMPLETE rerun line including the name argument,
 * because a refusal naming only a flag makes the operator reconstruct the
 * command that produced it.
 */
export function applySetupConsent(
  plan: WorktreeSetupPlan,
  consent: WorktreeSetupConsent,
  rerun: string,
): BranchPlan {
  const { branchPlan } = plan;

  if (branchPlan.kind === "attach") {
    if (branchPlan.checkedOutAt !== null) {
      refuse(
        `The branch \`${branchPlan.branch}\` is already checked out in the worktree at ${branchPlan.checkedOutAt}, and a branch can be checked out in one worktree at a time.`,
        `Work in ${branchPlan.checkedOutAt}, or run setup under a different name.`,
      );
    }
    // [secfix NR-1] Positive `!isGranted`, not a negative enumeration: the
    // gate used to list `declined` and `unanswered` by name and fall through
    // to PROCEED for anything else, which is fail-open — a `ConsentAnswer`
    // this chain did not name (`"not-required"`, or a future member) sailed
    // through with nobody having said yes. `declined` keeps its own wording;
    // every other non-granted answer (today: `unanswered`, `not-required`)
    // gets the "this run cannot ask" refusal, because none of them is an
    // operator saying no on purpose — they are all "no answer was given".
    if (!isGranted(consent.attach)) {
      if (consent.attach === "declined") {
        refuse(
          `A local branch \`${branchPlan.branch}\` already exists and --no-use-existing was given, so this run will not attach to it.`,
          `Pick a name with no branch behind it, or re-run: ${rerun} --use-existing`,
        );
      }
      refuse(
        `Setting up \`${plan.name}\` would ATTACH the new worktree to the existing local branch \`${branchPlan.branch}\`, and this run cannot ask.`,
        `Re-run with the decision made: ${rerun} --use-existing`,
      );
    }
    return branchPlan;
  }

  if (branchPlan.kind === "track") {
    // [secfix NR-1] Same positive-check shape as the attach gate above:
    // `declined` still falls through to `create` rather than refusing (the
    // operator asked for a new branch off HEAD), but every OTHER non-granted
    // answer refuses instead of proceeding.
    if (!isGranted(consent.track)) {
      if (consent.track === "declined") {
        return {
          ...branchPlan,
          kind: "create",
          reason: `\`origin/${branchPlan.branch}\` exists, but --no-track was given, so the branch is created off the current HEAD instead`,
        };
      }
      refuse(
        `Setting up \`${branchPlan.branch}\` would TRACK the remote branch \`origin/${branchPlan.branch}\`, and this run cannot ask.`,
        `Re-run with the decision made: ${rerun} --track`,
      );
    }
  }

  return branchPlan;
}

// ---------------------------------------------------------------------------
// The run (REQ-WORKTREE-005, 006, 010, 011, 013)
// ---------------------------------------------------------------------------

/** Directory inside the git common dir that holds this lane's name locks. */
export const WORKTREE_LOCK_SUBDIR = join("stamity", "worktree");

/**
 * The lock target for one name.
 *
 * Under the git COMMON dir, which is one per clone and identical from every
 * linked worktree — that sharing is what makes the lock visible to a second
 * process running from a different worktree of the same repository. Name-scoped
 * rather than repo-scoped, so a setup of `a` never waits on a setup of `b`.
 */
export function worktreeLockPath(gitCommonDir: string, name: string): string {
  return join(gitCommonDir, WORKTREE_LOCK_SUBDIR, name);
}

/**
 * Creates one worktree.
 *
 * The whole critical section — existence check, `git worktree add`,
 * materialization, receipt write — runs under one name lock, so a same-name
 * race has exactly one winner by construction and the loser refuses on a
 * directory that is really there.
 */
export async function runWorktreeSetup(opts: WorktreeSetupOptions): Promise<WorktreeSetupResult> {
  const run = opts.run ?? runGit;
  const consent = opts.consent ?? UNANSWERED_CONSENT;
  const rerun = opts.rerun ?? `stamity worktree setup ${opts.name}`;

  const plan = await planWorktreeSetup({ ...opts, run, consent });
  const branchPlan = applySetupConsent(plan, consent, rerun);

  const notices: string[] = [];
  if (!isCrossProcessLockingEnabled()) {
    notices.push(
      "Cross-process locking is off for this run (STAMITY_LOCK=0 or an explicit opt-out), so a " +
        "concurrent setup of this same name is UNSUPPORTED and may leave a half-built worktree.",
    );
  }

  const commonDir = await resolveGitCommonDir(run, opts.repoRoot);
  const release = await acquireWriteLock(worktreeLockPath(commonDir, opts.name), commonDir);
  try {
    return await setupUnderLock(plan, branchPlan, opts, run, consent, notices);
  } finally {
    await release();
  }
}

async function setupUnderLock(
  plan: WorktreeSetupPlan,
  branchPlan: BranchPlan,
  opts: WorktreeSetupOptions,
  run: WorktreeGitRunner,
  consent: WorktreeSetupConsent,
  notices: string[],
): Promise<WorktreeSetupResult> {
  // Inside the lock, so the loser of a same-name race meets a directory that
  // really exists rather than a check that ran before the winner wrote.
  if (await pathExists(plan.worktreePath)) {
    refuse(
      `${plan.worktreePath} already exists, so there is nothing for this run to create.`,
      `Run \`stamity worktree cleanup ${plan.name}\` first, or set up under a different name.`,
    );
  }

  // Create the farm explicitly at 0700 BEFORE `git worktree add`, which would
  // otherwise create it at the ambient umask (often 0755) — world-listable on a
  // shared host, exposing the names of every managed checkout. `mkdir`'s own
  // mode is umask-masked, so the `chmod` is what makes 0700 hold regardless.
  await mkdir(plan.farmDir, { recursive: true, mode: 0o700 });
  await chmod(plan.farmDir, 0o700);

  await addWorktree(run, opts.repoRoot, {
    path: plan.worktreePath,
    branch: branchPlan.branch,
    kind: branchPlan.kind,
  });

  const withheld = plan.entries.filter((entry) => entry.secret && !isGranted(consent.secrets));
  if (withheld.length > 0) {
    notices.push(
      `${withheld.length === 1 ? "One entry holds" : `${withheld.length} entries hold`} secret ` +
        `material (${withheld.map((entry) => entry.path).join(", ")}) and was not copied, because ` +
        `this run had no consent for it. Re-run with --copy-secrets to place it.`,
    );
  }

  const options = {
    sourceRoot: opts.repoRoot,
    worktreeRoot: plan.worktreePath,
    // Wired to the policy's own longest-prefix answer, so a `skip` override
    // carved out of a copied directory is honoured during the walk rather than
    // copied and deleted afterwards.
    isSkipped: (relPath: string) => resolveStrategy(plan.policy, relPath) === "skip",
    // [secfix A2] A child discovered while expanding a copied DIRECTORY gets
    // the same identity check a top-level row gets: `isKnownCredentialPath`
    // raises secrecy for the child's own basename regardless of what the
    // parent directory row declared, and `secretsGranted` is this run's own
    // consent answer — a child elevated this way is copied at `0600` when
    // consent was granted, withheld (not copied, named in the report) when it
    // was not.
    isKnownCredential: isKnownCredentialPath,
    secretsGranted: isGranted(consent.secrets),
  };

  // Materialized one PLAN ROW at a time rather than as one batch, so each
  // result keeps the row it came from. That attribution is what lets the report
  // interleave a withheld secret back into the table at its own position:
  // REQ-WORKTREE-012 promises the dry run and the real run agree row for row
  // AND in the same order, and a directory row expands to many results, so
  // there is no other way back from the flat result list to the plan's order.
  // Materialization is sequential inside the batch anyway, so this costs
  // nothing but the loop.
  const entries: WorktreeEntryReport[] = [];
  const placed: MaterializeResult[] = [];
  for (const entry of plan.entries) {
    if (entry.secret && !isGranted(consent.secrets)) {
      // A withheld secret is a ROW in the table, not an absence from it:
      // REQ-WORKTREE-008 asks for that entry's outcome to be `skipped`, and an
      // entry silently missing from the report is the shape the question
      // protocol names — a default applied with nothing in the output saying so.
      entries.push({
        path: entry.path,
        requested: entry.strategy,
        strategy: entry.strategy,
        outcome: "skipped",
        reason: "this run had no consent to copy secret material (--copy-secrets)",
        mode: null,
        errno: null,
        fallbackFrom: null,
      });
      continue;
    }
    const request: MaterializeRequest = {
      relPath: entry.path,
      strategy: entry.strategy,
      secret: entry.secret,
    };
    // oxlint-disable-next-line no-await-in-loop -- rows share parent directories; a parallel batch races its own mkdir and reports an errno that names no row
    const results = await materializeEntries([request], options);
    placed.push(...results);
    entries.push(...results.map(toEntryReport));
    notices.push(...placementNotices(results));
  }

  // [secfix A6b] `resolveSha` and `resolveWorktreeGitDir` both run AFTER the
  // tree exists and after materialization, and both throw on a non-zero git
  // exit. REQ-WORKTREE-011 promises a failure past that point is RETURNED, not
  // thrown, so both calls — and the receipt write that depends on their
  // answers — share one try/catch: any failure here leaves no git-dir to write
  // a receipt to anyway, so it is reported the same way a receipt-write
  // failure already was, rather than escaping and dropping the entries and
  // notices this run already computed.
  let head = "";
  let receiptPath: string | null = null;
  let receiptFailure: string | null = null;
  try {
    head = await resolveSha(run, plan.worktreePath);
    const gitDir = await resolveWorktreeGitDir(run, plan.worktreePath);
    const receiptEntries = placed
      .map(receiptEntryFor)
      .filter((entry): entry is WorktreeReceiptEntry => entry !== null);
    receiptPath = await writeWorktreeReceipt(
      gitDir,
      createWorktreeReceipt({
        createdAt: (opts.now?.() ?? new Date()).toISOString(),
        engineVersion: opts.engineVersion,
        worktree: { path: plan.worktreePath, branch: branchPlan.branch, head },
        entries: receiptEntries,
      }),
    );
  } catch (error) {
    // A receipt that cannot be written — or git facts that cannot be resolved
    // to write it FROM — is a materialization failure, not a silent
    // degradation: without a receipt, cleanup has no authority to remove
    // anything this run placed.
    receiptFailure = error instanceof Error ? error.message : String(error);
  }

  const setup = await probeSetupPresence(plan.worktreePath);
  notices.push(...presenceNotices(setup, plan.worktreePath));
  notices.push(
    "Records under .stamity/handoffs/ and .stamity/learnings/ travel only once they are " +
      "COMMITTED — a checkout carries committed content, so uncommitted ones stay where they are.",
  );

  const failed = entries.filter((entry) => entry.outcome === "failed");
  const partial = failed.length > 0 || receiptFailure !== null;

  return {
    status: partial ? "partial" : "complete",
    worktree: { path: plan.worktreePath, branch: branchPlan.branch, head },
    branchPlan: branchPlan.kind,
    entries,
    notices,
    setup,
    receiptPath,
    error: partial
      ? {
          code: "FS_ERROR",
          message:
            receiptFailure === null
              ? `The worktree was created, but ${failed.length} of ${entries.length} entries could not be placed.`
              : `The worktree was created, but its receipt could not be written: ${receiptFailure}`,
          // The recovery is cleanup, not a re-run of setup: the tree now exists,
          // so a second `setup` refuses on the present directory. With a receipt
          // written (an entry failed but the receipt landed), `cleanup <name>`
          // inverts what DID land and takes the tree down. With NO receipt (the
          // write itself failed), the tree is a managed-orphan that nothing
          // scopes, so `cleanup <name> --force` removes the whole tree. Then set
          // up again.
          next:
            receiptFailure === null
              ? `Fix the cause, then run \`stamity worktree cleanup ${plan.name}\` to take the tree back ` +
                `down — its receipt inverts the entries that DID land — and set up again.`
              : `The worktree has no receipt to scope a teardown, so run ` +
                `\`stamity worktree cleanup ${plan.name} --force\` to remove the whole tree, then set up again.`,
        }
      : null,
  };
}

function toEntryReport(result: MaterializeResult): WorktreeEntryReport {
  return {
    path: result.relPath,
    requested: result.requested,
    strategy: result.strategy,
    outcome: result.outcome,
    reason: result.reason ?? null,
    mode: result.mode ?? null,
    errno: result.errno ?? null,
    fallbackFrom: result.fallbackFrom ?? null,
  };
}

/**
 * The two platform substitutions that must never happen silently: a symlink the
 * platform refused and copied instead, and a secret copy left at whatever
 * permissions the platform gave it because there was no POSIX mode to harden.
 * Both are reported facts rather than quiet accommodations — the second in
 * particular, because a report claiming a tightening it did not perform is
 * worse than no report at all.
 */
function placementNotices(results: readonly MaterializeResult[]): string[] {
  const notices: string[] = [];
  for (const result of results) {
    if (result.fallbackFrom === "symlink" && result.outcome !== "failed") {
      notices.push(
        `${result.relPath}: the platform refused a symlink, so it was COPIED instead. The receipt ` +
          `records \`copy\`, and cleanup will invert it as one.`,
      );
    }
    if (result.secretModeApplied === false) {
      notices.push(
        `${result.relPath}: this platform has no POSIX mode, so the secret copy was left at ` +
          `whatever permissions the platform gave it rather than hardened to 0600.`,
      );
    }
    // [secfix A2] Named through the SAME withheld-notice channel a top-level
    // secret row uses (see the notice built from `withheld` above) — a child
    // this run elevated by identity inside a copied directory, but had no
    // consent to copy.
    if (result.outcome === "withheld") {
      notices.push(
        `${result.relPath}: holds secret material (a known credential name found inside a copied ` +
          `directory) and was not copied, because this run had no consent for it. Re-run with ` +
          `--copy-secrets to place it.`,
      );
    }
  }
  return notices;
}

function presenceNotices(setup: SetupPresence, worktreePath: string): string[] {
  if (setup === "absent") {
    return [
      `This branch predates the setup: ${join(worktreePath, ".stamity", "manifest.json")} is not ` +
        `there. Run \`stamity init\` inside ${worktreePath} to give the worktree its own.`,
    ];
  }
  if (setup === "unreadable") {
    return [
      `${join(worktreePath, ".stamity", "manifest.json")} exists but does not parse. Run ` +
        `\`stamity check\` inside ${worktreePath}.`,
    ];
  }
  return [];
}

/**
 * The REQ-WORKTREE-013 probe: one read, no write, no re-spawn.
 *
 * `setup` deliberately does not run `stamity sync` in the new worktree. The
 * client trees are COMMITTED in this project, so the checkout is already
 * self-consistent, and a sync would regenerate from whichever engine version
 * ran it — a worktree created off an older branch would come up dirty before
 * the first edit of the work it was made for. The probe answers the question
 * the sync was really asked ("is this usable by a session right now?") and
 * writes nothing.
 */
export async function probeSetupPresence(worktreePath: string): Promise<SetupPresence> {
  const manifestPath = join(worktreePath, ".stamity", "manifest.json");
  let text: string;
  try {
    text = await readFile(manifestPath, "utf8");
  } catch {
    return "absent";
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? "present"
      : "unreadable";
  } catch {
    return "unreadable";
  }
}

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await lstat(absPath);
    return true;
  } catch {
    return false;
  }
}

/** Re-exported so a consumer wiring the classifier does not import two modules. */
export type { GitPathClass };
