import { readdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type { Command } from "commander";
import { CliFailure } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { confirm, promptGate, sanitizeLabel, type PromptGate } from "../kit/prompts.ts";
import { EngineError } from "../../types/errors.ts";
import { STATE_DIR } from "../../types/markers.ts";
import {
  isInside,
  readWorktreeInventory,
  runWorktreeCleanup,
  type WorktreeCleanupResult,
  type WorktreeInventory,
  type WorktreeInventoryRow,
} from "../../worktree/cleanup.ts";
import {
  isDirty,
  readDirtyCounts,
  resolveGitCommonDir,
  runGit,
  type WorktreeDirtyCounts,
  type WorktreeGitRunner,
} from "../../worktree/git.ts";
import { readWorktreePolicy, resolveFarmDir, type WorktreePolicy } from "../../worktree/policy.ts";
import {
  planWorktreeSetup,
  probeSetupPresence,
  runWorktreeSetup,
  type ConsentAnswer,
  type SetupPresence,
  type WorktreeSetupConsent,
  type WorktreeSetupPlan,
  type WorktreeSetupResult,
} from "../../worktree/setup.ts";

/**
 * `stamity worktree` — the managed parallel-checkout lane.
 *
 *   worktree                  the inventory, identical to `list`, on every stream
 *   worktree list             every registered worktree, plus the repo-global stash line
 *   worktree setup <name>     create one worktree and place what a checkout cannot carry
 *   worktree cleanup <name>   invert that worktree's receipt; `--all` sweeps every managed one
 *
 * Four properties hold across the surface.
 *
 * **One subject, one refusal.** All three subcommands resolve the same lane —
 * the repository root, the policy file, and the farm the policy points at
 * ({@link resolveLane}) — so "this is not a git repository" and "the farm
 * resolves inside the repository" are each written once rather than three times
 * with three wordings.
 *
 * **Bare `worktree` is the inventory, on every stream.** No interactive picker:
 * unlike `config` there is no single key to settle here, and every mutation this
 * verb performs takes a name a person typed. A TTY and a pipe produce the same
 * bytes.
 *
 * **Consent is read at this layer and handed down as an answer.** The engine has
 * no prompt channel and must not grow one, so the four gated operations are
 * resolved here — an explicit flag first, then `-y`, then a question when the
 * gate is open, and `unanswered` when it is closed. A closed gate is never
 * answered by a confirmation's default: `promptGate` reports `interactive:
 * false` for `--json` and for a non-TTY stdin, and the branches below read that
 * before they read any default. Every refusal names the COMPLETE rerun line,
 * built from the invocation as the operator typed it, because a refusal naming
 * only a flag makes them reconstruct the command that produced it.
 *
 * **A setup that created a tree and then failed an entry RETURNS exit 1; it
 * does not throw.** A thrown failure renders through the funnel's error
 * envelope, which carries `ok`, `command`, `version` and `error` and nothing the
 * command computed — so an operator would be left with a worktree on disk and a
 * message saying the command failed. A returned `{ exitCode: 1, json }` is
 * rendered as the payload with the envelope keys spread over it, which is the
 * one shape that can carry the path, the per-entry outcomes and the error
 * document together (`../kit/program.ts`).
 *
 * Import rule: this file value-imports the lane's engine modules directly, the
 * way `./clean.ts` imports the manifest and reclaim modules. That is also what
 * makes them REACHED — `test/architecture/boundaries.test.ts` strips the
 * composition root's own edges before it walks, so a module whose only importer
 * is the registry is reported as wired-and-uncalled rather than certified.
 */

/** The closed subcommand set, named in the unknown-subcommand refusal. */
const SUBCOMMANDS = ["list", "setup", "cleanup"] as const;

/** Everything all three subcommands need, resolved once per run. */
interface Lane {
  readonly repoRoot: string;
  readonly policy: WorktreePolicy;
  readonly farmDir: string;
  readonly run: WorktreeGitRunner;
}

/**
 * Resolves the repository root, the policy, and the farm.
 *
 * The root is git's own answer rather than the process cwd, and it is the MAIN
 * worktree's root rather than the current one's. Both halves matter. The farm is
 * `<parent-of-repo>/.stamity-worktrees/<repo-directory-name>` and the policy
 * file is `<root>/.stamity/worktree.json`, so a run from a subdirectory that
 * took the cwd would resolve both against the wrong directory; and a run from
 * INSIDE a linked worktree, where `--show-toplevel` answers with that worktree,
 * would resolve a farm under the farm — which would then find no managed rows
 * and report "nothing to clean" to an operator standing in the very tree they
 * asked to remove. The common dir is one per clone and identical from every
 * linked worktree, so its parent is the one root all of them agree on.
 *
 * The `.git` basename check is what keeps that inference honest: for the two
 * layouts this lane supports the common dir is `<main>/.git`, and for anything
 * else — a bare repository, an external `GIT_DIR` — the answer falls back to
 * git's own top level rather than to this function's guess about a parent.
 *
 * Reading the policy here is what makes REQ-WORKTREE-003's document-level
 * refusals — a contested path, a glob, an unknown key, a version this build does
 * not read — fire on EVERY subcommand rather than only on the one that
 * materializes. The admissibility pass (does git track or ignore each row?) is
 * deliberately NOT run here; it belongs to `setup`, and the reason is in
 * {@link runSetup}.
 */
async function resolveLane(ctx: CliContext): Promise<Lane> {
  const run = runGit;
  const cwd = ctx.app.runtime.cwd;
  const outcome = await run({ args: ["rev-parse", "--show-toplevel"], cwd });
  if (outcome.status !== 0) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `${cwd} is not inside a git repository, and every worktree verb acts on one.`,
      why: sanitizeLabel(outcome.stderr.trim() || outcome.stdout.trim()),
      next: "Run the command from inside a clone, or create one with `git init`.",
    });
  }
  const topLevel = resolve(outcome.stdout.trim());
  const commonDir = await resolveGitCommonDir(run, cwd);
  const repoRoot = basename(commonDir) === ".git" ? dirname(commonDir) : topLevel;
  const policy = await readWorktreePolicy(repoRoot);
  return { repoRoot, policy, farmDir: resolveFarmDir(policy, repoRoot), run };
}

/**
 * The invocation as the operator typed it, so every refusal can name the
 * complete rerun line rather than a bare flag.
 *
 * Reconstructed from the parsed options rather than from `process.argv`: the
 * funnel hands command bodies the parsed set, argv is not reachable here, and a
 * reconstruction is what keeps the line correct for `st` and for any other alias
 * the package installs.
 */
function rerunLine(subcommand: string, name: string | null, opts: Record<string, unknown>): string {
  const parts = ["stamity worktree", subcommand];
  if (name !== null) parts.push(name);
  for (const [flag, key] of [
    ["--all", "all"],
    ["--files-only", "filesOnly"],
    ["--copy-secrets", "copySecrets"],
    ["--force", "force"],
    ["--json", "json"],
    ["--dry-run", "dryRun"],
  ] as const) {
    if (opts[key] === true) parts.push(flag);
  }
  for (const [key, positive, negative] of [
    ["useExisting", "--use-existing", "--no-use-existing"],
    ["track", "--track", "--no-track"],
  ] as const) {
    if (opts[key] === true) parts.push(positive);
    if (opts[key] === false) parts.push(negative);
  }
  return parts.join(" ");
}

/**
 * One gate's answer, in the order the refusal matrix reads it.
 *
 * An explicit flag beats everything, because it is the operator saying the words
 * — `--no-use-existing` is an ANSWER with its own behaviour, not the absence of
 * one. `-y` comes next, since its published description promises it takes the
 * non-interactive path and a destructive confirmation proceeds. Only then is a
 * question asked, and only when the gate is open; a closed gate resolves to
 * `unanswered`, which is what makes a non-interactive run refuse rather than
 * proceed on an assumed yes.
 */
async function answerGate(
  ctx: CliContext,
  gate: PromptGate,
  opts: {
    readonly flag: boolean | undefined;
    readonly question: string;
    readonly defaultYes: boolean;
    readonly preamble?: string;
  },
): Promise<ConsentAnswer> {
  if (opts.flag === true) return "granted";
  if (opts.flag === false) return "declined";
  if (ctx.yes) return "granted";
  if (!gate.interactive) return "unanswered";
  if (opts.preamble !== undefined) ctx.io.out(`${opts.preamble}\n`);
  return (await confirm(gate, ctx.promptIo, { question: opts.question, defaultYes: opts.defaultYes }))
    ? "granted"
    : "declined";
}

// ── list (REQ-WORKTREE-014, REQ-WORKTREE-015) ──────────────────────────────

/** One inventory row as the report carries it. */
interface ListRow {
  readonly path: string;
  readonly current: boolean;
  readonly branch: string | null;
  readonly detached: boolean;
  readonly head: string | null;
  readonly dirty: WorktreeDirtyCounts | null;
  readonly upstream: { readonly ahead: number; readonly behind: number } | null;
  readonly managed: boolean;
  readonly receiptEntries: number | null;
  readonly setup: SetupPresence | null;
  readonly handoffs: number | null;
  readonly locked: boolean;
  readonly prunable: boolean;
  readonly reason: string | null;
}

/**
 * `git rev-list --left-right --count HEAD...@{upstream}`, or null when the
 * branch has no upstream.
 *
 * A missing upstream is git's own non-zero exit and is not a failure worth
 * stopping a read-only inventory for — most worktrees this lane creates are
 * branches that were never pushed.
 */
async function readAheadBehind(
  run: WorktreeGitRunner,
  worktreePath: string,
): Promise<{ ahead: number; behind: number } | null> {
  const outcome = await run({
    args: ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    cwd: worktreePath,
  });
  if (outcome.status !== 0) return null;
  const [ahead, behind] = outcome.stdout.trim().split(/\s+/u).map(Number);
  if (ahead === undefined || behind === undefined || Number.isNaN(ahead) || Number.isNaN(behind)) {
    return null;
  }
  return { ahead, behind };
}

/**
 * Handoff records in one worktree.
 *
 * Counted, never moved: REQ-WORKTREE-015 makes cross-session coordination
 * inventory rather than orchestration, and this column is what lets a session
 * resuming in one tree SEE that records exist in another without this lane
 * writing into a directory another session may be reading. Dot-files are
 * excluded because `.gitkeep` is the scaffold's placeholder, not a record.
 */
async function countHandoffs(worktreePath: string): Promise<number> {
  try {
    const entries = await readdir(resolve(worktreePath, STATE_DIR, "handoffs"));
    return entries.filter((entry) => !entry.startsWith(".")).length;
  } catch {
    return 0;
  }
}

/**
 * Turns one classified inventory row into a display row.
 *
 * A prunable registration points at a directory that is gone, so every probe
 * that would read that directory is skipped rather than run and swallowed: the
 * honest answer for a tree that is not there is "no answer", and a `git status`
 * in a missing cwd is a failure this read-only verb has no reason to raise.
 */
async function toListRow(
  run: WorktreeGitRunner,
  row: WorktreeInventoryRow,
  cwd: string,
): Promise<ListRow> {
  const { entry } = row;
  const reachable = !entry.prunable;
  return {
    path: entry.path,
    current: isInside(cwd, entry.path),
    branch: entry.branch,
    detached: entry.detached,
    head: entry.head,
    // The engine reads dirty counts for the rows it may take down; every other
    // row still owes the operator the same column, so it is read here.
    dirty: reachable ? (row.dirty ?? (await readDirtyCounts(run, entry.path))) : null,
    upstream: reachable ? await readAheadBehind(run, entry.path) : null,
    managed: row.classification === "managed",
    receiptEntries: row.receipt?.entries.length ?? null,
    setup: reachable ? await probeSetupPresence(entry.path) : null,
    handoffs: reachable ? await countHandoffs(entry.path) : null,
    locked: entry.locked,
    prunable: entry.prunable,
    reason: row.reason,
  };
}

function renderDirty(row: ListRow): string {
  if (row.dirty === null) return "—";
  if (!isDirty(row.dirty)) return "clean";
  return `${row.dirty.modified} modified, ${row.dirty.untracked} untracked`;
}

function renderUpstream(row: ListRow): string {
  if (row.upstream === null) return "no upstream";
  const { ahead, behind } = row.upstream;
  if (ahead === 0 && behind === 0) return "up to date";
  return `${ahead} ahead, ${behind} behind`;
}

function renderList(ctx: CliContext, farmDir: string, rows: readonly ListRow[], stash: number): void {
  const { palette } = ctx;

  // Above the table, once, and only when there is something to say. A stash is
  // ONE list for the whole clone and belongs to no row below it — a per-worktree
  // column would print the same number on every line and read as a per-worktree
  // fact, which is the signal the design this replaces lost entirely.
  if (stash > 0) {
    ctx.io.out(
      `${palette.yellow(`${stash} stash ${stash === 1 ? "entry" : "entries"}`)} — a stash is one ` +
        `list for the whole clone and belongs to none of the worktrees below.\n`,
    );
  }

  ctx.io.out(`${palette.bold("farm")} ${sanitizeLabel(farmDir)}\n`);
  for (const row of rows) {
    const flags = [row.locked ? "locked" : null, row.prunable ? "prunable" : null].filter(
      (flag): flag is string => flag !== null,
    );
    const managed =
      row.managed && row.receiptEntries !== null
        ? `managed: yes (${row.receiptEntries} ${row.receiptEntries === 1 ? "entry" : "entries"})`
        : "managed: no";
    ctx.io.out(
      `${row.current ? palette.cyan("*") : " "} ${sanitizeLabel(row.path)}  ` +
        `${palette.bold(sanitizeLabel(row.branch ?? "(detached)"))}  ` +
        `${palette.dim(sanitizeLabel(row.head ?? "—").slice(0, 7))}` +
        `${flags.length === 0 ? "" : `  ${palette.yellow(`[${flags.join(", ")}]`)}`}\n`,
    );
    ctx.io.out(
      `    ${palette.dim(
        [
          renderDirty(row),
          renderUpstream(row),
          managed,
          `setup: ${row.setup ?? "—"}`,
          `handoffs: ${row.handoffs ?? "—"}`,
        ].join(" · "),
      )}\n`,
    );
    if (row.reason !== null && !row.managed) {
      ctx.io.out(`    ${palette.dim(sanitizeLabel(row.reason))}\n`);
    }
  }
  if (rows.length === 0) {
    // [m5] Names the concrete next step, matching the empty-state pattern
    // `workspace list` already uses ("no members registered — add repos[]
    // entries to workspace.json") rather than stating the absence alone.
    ctx.io.out(
      `  ${palette.dim("no worktrees registered — run stamity worktree setup <name> to create one")}\n`,
    );
  }
}

/**
 * The inventory. Reads only, and exits 0 whatever the rows say — a report is not
 * a gate, and a third verb disagreeing with `check` about severity is how a CI
 * step starts getting ignored.
 */
async function runList(ctx: CliContext, lane: Lane): Promise<CommandResult> {
  const inventory: WorktreeInventory = await readWorktreeInventory(lane);
  const rows: ListRow[] = [];
  for (const row of inventory.worktrees) {
    // oxlint-disable-next-line no-await-in-loop -- each row costs several git reads against ITS OWN checkout; fanning them out spawns a process per registered worktree
    rows.push(await toListRow(lane.run, row, ctx.app.runtime.cwd));
  }

  renderList(ctx, lane.farmDir, rows, inventory.stash.entries);
  return {
    exitCode: 0,
    json: { farm: lane.farmDir, worktrees: rows, stash: inventory.stash },
  };
}

// ── setup (REQ-WORKTREE-008, 011, 012, 013) ────────────────────────────────

/**
 * The three gates `setup` owns, resolved for this invocation.
 *
 * `plan` is null exactly when nothing here can ask — a non-interactive run,
 * whose consent is fully determined by its flags and by `-y`. Every gate is
 * therefore resolved either from the plan that names it or, with no plan, from
 * the flags alone; a gate the plan says will not be reached keeps
 * `unanswered`, which the engine ignores because it only reads the answer for
 * the branch plan it resolved.
 */
async function resolveSetupConsent(
  ctx: CliContext,
  gate: PromptGate,
  plan: WorktreeSetupPlan | null,
  name: string,
  opts: Record<string, unknown>,
): Promise<WorktreeSetupConsent> {
  const kind = plan?.branchPlan.kind ?? null;
  const branch = plan?.branchPlan.branch ?? name;
  // EVERY secret row, not just the first: one consent answer applies to all of
  // them, so the operator must be shown the whole set to consent informedly.
  const secretEntries = plan?.entries.filter((entry) => entry.secret) ?? [];
  const flagOf = (key: string): boolean | undefined =>
    typeof opts[key] === "boolean" ? opts[key] : undefined;

  const attach =
    plan === null || kind === "attach"
      ? await answerGate(ctx, gate, {
          flag: flagOf("useExisting"),
          question: `Attach the new worktree to the existing local branch \`${sanitizeLabel(branch)}\`?`,
          defaultYes: true,
        })
      : "unanswered";

  const track =
    plan === null || kind === "track"
      ? await answerGate(ctx, gate, {
          flag: flagOf("track"),
          question: `Track the remote branch \`origin/${sanitizeLabel(branch)}\`?`,
          defaultYes: true,
        })
      : "unanswered";

  const secrets =
    plan === null || secretEntries.length > 0
      ? await answerGate(ctx, gate, {
          flag: flagOf("copySecrets"),
          // The warning is a line the operator can ANSWER, not a box they scroll
          // past: it names EVERY secret file and what each holds, and the
          // question under it is the gate — one answer covers the whole set, so
          // the whole set is shown.
          ...(secretEntries.length === 0 ? {} : { preamble: secretPreamble(secretEntries) }),
          question:
            secretEntries.length === 0
              ? "Copy the secret entries into the new worktree?"
              : `Copy ${secretEntries.map((entry) => sanitizeLabel(entry.path)).join(", ")} into the new worktree?`,
          defaultYes: true,
        })
      : "unanswered";

  return { attach, track, secrets };
}

/** Names every secret row and what it holds, for the consent preamble. */
function secretPreamble(entries: readonly { path: string; reason: string | null }[]): string {
  const named = entries
    .map(
      (entry) =>
        `${sanitizeLabel(entry.path)}${entry.reason === null ? "" : ` (${sanitizeLabel(entry.reason)})`}`,
    )
    .join(", ");
  const verb = entries.length === 1 ? "holds secret material and would be" : "hold secret material and would be";
  return `${named} ${verb} copied into the new worktree at 0600.`;
}

function renderPlan(ctx: CliContext, plan: WorktreeSetupPlan, wouldAsk: boolean): void {
  const { palette } = ctx;
  ctx.io.out(
    `${palette.bold("worktree setup")} ${sanitizeLabel(plan.name)} ` +
      `${palette.yellow("(dry run — nothing was written)")}\n`,
  );
  ctx.io.out(`  ${palette.dim(`farm: ${sanitizeLabel(plan.farmDir)}`)}\n`);
  ctx.io.out(`  ${palette.dim(`worktree: ${sanitizeLabel(plan.worktreePath)}`)}\n`);
  ctx.io.out(`  ${palette.dim(`policy: ${sanitizeLabel(plan.policySource)}`)}\n`);
  ctx.io.out(
    `  branch: ${palette.bold(sanitizeLabel(plan.branchPlan.branch))} — ` +
      `${plan.branchPlan.kind} (${sanitizeLabel(plan.branchPlan.reason)})\n`,
  );
  for (const gate of plan.gates) {
    ctx.io.out(`  gate ${gate.gate}: ${gate.answer} → ${gate.effect}\n`);
  }
  if (wouldAsk && plan.gates.some((gate) => gate.answer === "unanswered")) {
    ctx.io.out(
      `  ${palette.dim("a real run from this terminal would ASK each unanswered gate; this preview does not")}\n`,
    );
  }
  if (plan.entries.length === 0) {
    ctx.io.out(`  ${palette.dim("no entries to place — the checkout supplies everything")}\n`);
  }
  for (const entry of plan.entries) {
    ctx.io.out(
      `  entry ${sanitizeLabel(entry.path)}  ${entry.strategy}${entry.secret ? " (secret)" : ""}\n`,
    );
  }
  ctx.io.out(
    `${palette.dim("the remote was NOT consulted for this preview — a preview that mutates remote-tracking refs changed something")}\n`,
  );
}

function renderSetup(ctx: CliContext, result: WorktreeSetupResult): void {
  const { palette } = ctx;
  const created = result.status === "partial" ? palette.yellow("created") : palette.green("created");
  ctx.io.out(
    `${palette.bold("worktree")} ${sanitizeLabel(result.worktree.path)} ${created} on ` +
      `${palette.bold(sanitizeLabel(result.worktree.branch))} (${result.branchPlan})\n`,
  );
  for (const entry of result.entries) {
    const detail = entry.reason === null ? "" : ` — ${sanitizeLabel(entry.reason)}`;
    ctx.io.out(
      `  ${sanitizeLabel(entry.path)}  ${entry.outcome}${detail}` +
        `${entry.errno === null ? "" : ` [${entry.errno}]`}\n`,
    );
  }
  ctx.io.out(`  ${palette.dim(`setup: ${result.setup}`)}\n`);
  for (const notice of result.notices) ctx.io.out(`  ${palette.dim(sanitizeLabel(notice))}\n`);

  if (result.error !== null) {
    // The human half of REQ-WORKTREE-011: it must say the worktree WAS created,
    // name its path, and name both recovery paths — an operator reading only
    // "the command failed" would go looking for a tree that is really there.
    ctx.io.err(
      `${palette.yellow("partial:")} ${sanitizeLabel(result.error.message)}\n` +
        `  ${palette.dim("next:")} ${sanitizeLabel(result.error.next)}\n`,
    );
    return;
  }
  ctx.io.out(`${palette.dim(`next: cd ${sanitizeLabel(result.worktree.path)}`)}\n`);
}

/**
 * `setup <name>` end to end.
 *
 * The admissibility pass — is every materializing row a path git IGNORES? — runs
 * inside {@link planWorktreeSetup}, which is to say on `setup` and on nothing
 * else. That placement is deliberate rather than incidental: the built-in
 * default entry set names `.env.mcp`, and a repository that never ran `stamity
 * init` does not ignore it, so running the pass on `list` would make the lane's
 * read verb refuse in exactly the repositories an operator would run it in
 * first. Nothing is materialized by a read, so nothing a read does can dirty a
 * worktree.
 *
 * A dry run stops here: it plans, prints, and returns. No lock is taken, no
 * fetch is performed, and `git worktree list` is unchanged afterwards.
 */
async function runSetup(
  ctx: CliContext,
  lane: Lane,
  name: string | undefined,
  opts: Record<string, unknown>,
): Promise<CommandResult> {
  if (name === undefined) {
    throw new CliFailure({
      code: "USAGE",
      message: "worktree setup needs a name",
      why: "the name is both the directory under the farm and the branch the worktree checks out",
      next: "run `stamity worktree setup <name>`",
    });
  }

  const gate = promptGate({
    stdinIsTTY: ctx.terminal.stdinIsTTY,
    yes: ctx.yes,
    json: ctx.json,
    env: ctx.app.runtime.env,
    palette: ctx.palette,
  });
  const rerun = rerunLine("setup", name, opts);
  const planOptions = {
    repoRoot: lane.repoRoot,
    name,
    run: lane.run,
    policy: lane.policy,
    // REQ-WORKTREE-009: a preview never contacts the remote. A preview that
    // mutates remote-tracking refs is a preview that changed something.
    fetch: !ctx.dryRun,
  };

  // A DRY RUN NEVER ASKS. "Touches nothing" includes the operator's attention:
  // a preview that stops to ask about a branch it is not going to create has
  // already changed something. So the gate is read as closed here, and the plan
  // prints the answer THIS invocation's flags give — with the line below saying
  // an interactive run would ask. The entry table, which is what REQ-WORKTREE-012
  // pins row for row, does not depend on consent at all: a withheld secret is a
  // row in both tables, not an absence from one.
  const consentGate: PromptGate = ctx.dryRun ? { interactive: false } : gate;

  // The plan is resolved ahead of the run ONLY when it could change an answer. A
  // non-interactive, non-preview run's consent is fully determined by its flags,
  // so it goes straight to `runWorktreeSetup` and plans exactly once; an
  // interactive run plans twice, because the gate it must ask about is a
  // property of the plan and the engine has no prompt channel to ask from.
  const preview = gate.interactive || ctx.dryRun ? await planWorktreeSetup(planOptions) : null;
  const consent = await resolveSetupConsent(ctx, consentGate, preview, name, opts);

  if (ctx.dryRun) {
    const planned = await planWorktreeSetup({ ...planOptions, consent });
    renderPlan(ctx, planned, gate.interactive);
    return {
      exitCode: 0,
      json: {
        dryRun: true,
        name: planned.name,
        farm: planned.farmDir,
        worktree: planned.worktreePath,
        policy: planned.policySource,
        branchPlan: planned.branchPlan,
        gates: planned.gates,
        entries: planned.entries,
      },
    };
  }

  const result = await runWorktreeSetup({
    ...planOptions,
    consent,
    engineVersion: ctx.app.version,
    rerun,
  });
  renderSetup(ctx, result);

  const payload = {
    status: result.status,
    worktree: result.worktree,
    branchPlan: result.branchPlan,
    entries: result.entries,
    notices: result.notices,
    setup: result.setup,
    receiptPath: result.receiptPath,
    ...(result.error === null ? {} : { error: result.error }),
  };
  // Returned, never thrown: the payload is what tells the operator a tree
  // exists. A throw would render as the error envelope and drop all of it.
  return result.status === "partial"
    ? { exitCode: 1, json: payload }
    : { exitCode: 0, json: payload };
}

// ── cleanup (REQ-WORKTREE-007, REQ-WORKTREE-008) ───────────────────────────

/** The `message`/`next` pair a partial cleanup's error document owes. */
export interface PartialCleanupErrorDocument {
  readonly message: string;
  readonly next: string;
}

/**
 * The error document a partial cleanup owes, naming what actually failed and
 * pointing at the recovery that matches it. [secfix NEW-2, residual: `next`]
 *
 * A TREE-level failure (`git worktree remove` itself errored, after any
 * file-level inversion already ran) and a FILE-level one (a receipt row
 * could not be removed) are different facts, and a document that always says
 * "receipt rows" / "remove the remaining files by hand" misdescribes the
 * first — a tree-only failure leaves `files: []` on every report, so "the
 * rows above name each one" points at rows that do not exist. `message` and
 * `next` are chosen from the SAME three-way read of the result, so the two
 * can never disagree about which case this run is in. Exported as a pure
 * function, tested directly against hand-built results the way this codebase
 * already tests its other pure classifiers (`classifyFetchFailure`,
 * `classifyReceiptEntry`) rather than through a git-backed integration case.
 */
export function partialCleanupErrorDocument(
  result: WorktreeCleanupResult,
  rerun: string,
): PartialCleanupErrorDocument {
  const treeFailed = result.worktrees.some((report) => report.treeFailure !== null);
  const fileFailed = result.worktrees.some((report) =>
    report.files.some((file) => file.outcome === "failed"),
  );
  if (treeFailed && fileFailed) {
    return {
      message:
        "One or more worktrees could not be fully removed, and one or more receipt rows could not be removed.",
      next: `Fix the cause and re-run \`${rerun}\`. The worktree failures need \`git worktree remove\` to succeed on their own; the receipt rows that failed are named above and may need removing by hand.`,
    };
  }
  if (treeFailed) {
    return {
      message: "One or more worktrees could not be fully removed.",
      next: `Fix the cause \`git worktree remove\` reported above, then re-run \`${rerun}\` — there are no remaining receipt-row files to remove by hand for this failure.`,
    };
  }
  return {
    message: "One or more receipt rows could not be removed.",
    next: `Fix the cause and re-run \`${rerun}\`, or remove the remaining files by hand — the rows above name each one.`,
  };
}

function renderCleanup(ctx: CliContext, result: WorktreeCleanupResult): void {
  const { palette } = ctx;
  for (const report of result.worktrees) {
    const state =
      report.treeFailure !== null
        ? palette.red("failed")
        : report.skipped !== null
          ? palette.dim(`skipped (${report.classification})`)
          : report.removed
            ? palette.green("removed")
            : palette.yellow("files only");
    ctx.io.out(`${state} ${sanitizeLabel(report.path)}\n`);
    if (report.skipped !== null) {
      ctx.io.out(`    ${palette.dim(sanitizeLabel(report.skipped))}\n`);
    }
    // [secfix NEW-2] A tree-level failure — the `git worktree remove` call
    // itself, not any one receipt entry — reports on its own line rather
    // than as a fabricated file row with no receipt-relative path to give it.
    if (report.treeFailure !== null) {
      ctx.io.out(`    ${palette.red(sanitizeLabel(report.treeFailure))}\n`);
    }
    for (const file of report.files) {
      const detail = file.detail === null ? "" : ` — ${sanitizeLabel(file.detail)}`;
      ctx.io.out(`    ${sanitizeLabel(file.path)}  ${file.outcome} (${file.reason})${detail}\n`);
    }
    for (const dropped of report.droppedRows) {
      ctx.io.out(
        `    ${palette.yellow(`receipt row ${dropped.index} dropped`)}: ${sanitizeLabel(dropped.reason)}\n`,
      );
    }
    // Named, never run. A directory is reconstructible from a ref, and a ref is
    // not reconstructible from a directory — so the branch is the operator's.
    if (report.branchCommand !== null) {
      ctx.io.out(`    ${palette.dim(`the branch is untouched: ${report.branchCommand}`)}\n`);
    }
  }
  if (result.pruned > 0) {
    ctx.io.out(`${palette.dim(`pruned ${result.pruned} stale registration(s)`)}\n`);
  }
  for (const notice of result.notices) ctx.io.out(`${palette.dim(sanitizeLabel(notice))}\n`);
}

/**
 * `cleanup <name>` / `cleanup --all`.
 *
 * The inventory is read here before the engine reads its own, and it buys two
 * things a second read cannot: the consent question can name the worktrees it is
 * about to take down, and a name that matches no managed worktree is refused
 * rather than silently doing nothing.
 */
async function runCleanup(
  ctx: CliContext,
  lane: Lane,
  name: string | undefined,
  opts: Record<string, unknown>,
): Promise<CommandResult> {
  const all = opts["all"] === true;
  const names = name === undefined ? [] : [name];
  const rerun = rerunLine("cleanup", name ?? null, opts);

  if (names.length === 0 && !all) {
    // REQ-WORKTREE-007 calls this a `USAGE` failure. `USAGE` is a CLI-layer code
    // the engine cannot spell without importing the CLI, so the engine
    // classifies it as far as its vocabulary reaches and the verb RE-RAISES it
    // here — the shape `config get` with no key already has. The engine is still
    // called for its sentence rather than a second copy being written here: this
    // refusal is its first statement, ahead of every read, so the call costs
    // nothing and the two surfaces cannot drift apart. Both spellings are named,
    // because the operator does not yet know which one they meant.
    let message = "cleanup needs a name, or --all to sweep every worktree this lane manages.";
    try {
      await runWorktreeCleanup({
        repoRoot: lane.repoRoot,
        farmDir: lane.farmDir,
        run: lane.run,
        names,
        all,
        cwd: ctx.app.runtime.cwd,
        rerun,
      });
    } catch (error) {
      if (error instanceof EngineError) message = error.message;
    }
    throw new CliFailure({
      code: "USAGE",
      message,
      why: "cleanup inverts one worktree's receipt, and a sweep of every managed worktree is a different request",
      next: "run `stamity worktree cleanup <name>`, or `stamity worktree cleanup --all`",
    });
  }

  const inventory = await readWorktreeInventory(lane);
  // Both managed and managed-orphan trees are cleanable. An orphan (no readable
  // receipt) is removable only as a whole tree under --force, which the engine
  // enforces and the consent below requires.
  const cleanable = inventory.worktrees.filter(
    (row) => row.classification === "managed" || row.classification === "managed-orphan",
  );
  const candidates = all
    ? cleanable
    : cleanable.filter((row) => resolve(row.entry.path) === resolve(lane.farmDir, name ?? ""));

  if (!all && candidates.length === 0) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `No worktree this lane manages is named ${JSON.stringify(name ?? "")} under ${lane.farmDir}.`,
      why: "cleanup inverts a receipt or force-removes a receipt-less orphan, and a name that matches neither is refused rather than silently doing nothing",
      next: "run `stamity worktree list` to see what is registered and which rows are managed",
    });
  }

  const gate = promptGate({
    stdinIsTTY: ctx.terminal.stdinIsTTY,
    yes: ctx.yes,
    json: ctx.json,
    env: ctx.app.runtime.env,
    palette: ctx.palette,
  });
  const dirty = candidates.filter((row) => row.dirty !== null && isDirty(row.dirty));
  const orphans = candidates.filter((row) => row.classification === "managed-orphan");
  // A sweep that would take nothing down has nothing to consent to, which is
  // also where the engine draws the line — asking about an empty `--all` would
  // train the operator to answer the question without reading it. A dirty tree
  // OR a receipt-less orphan needs consent too: both remove a checkout the run
  // cannot otherwise justify.
  const needsConsent = (all && candidates.length > 0) || dirty.length > 0 || orphans.length > 0;
  // [secfix A5] Every dirty row is already in hand from the filter above — the
  // preamble names each one rather than only the sweep's total count, so an
  // operator approving `--all` sees WHICH trees carry uncommitted work before
  // they say yes to removing them.
  const dirtyList = dirty.map((row) => sanitizeLabel(row.entry.path)).join(", ");
  const preamble = all
    ? `--all would take down ${candidates.length} worktree${candidates.length === 1 ? "" : "s"}` +
      (dirty.length === 0
        ? "."
        : `, ${dirty.length} carrying uncommitted changes: ${dirtyList}.`)
    : orphans.length > 0
      ? `${sanitizeLabel(orphans[0]?.entry.path ?? "")} carries no readable receipt, so cleanup cannot ` +
        `verify what it placed and would remove the whole tree.`
      : `${sanitizeLabel(dirty[0]?.entry.path ?? "")} carries uncommitted changes.`;
  // Default NO, unlike the three setup gates: this one removes a checkout, and
  // the prompt kit's own rule is that a destructive confirmation on a closed
  // gate refuses rather than proceeding on an assumed yes.
  //
  // [secfix A4] `not-required`, not `granted`, when nothing needed asking: this
  // CLI-layer read is not the engine's own — the engine re-reads the inventory
  // and checks dirtiness itself before it removes anything (`cleanup.ts`), and
  // that re-check only holds if a truthful "nothing to ask about" cannot be
  // misread as "the operator said yes" for a tree that turned dirty in the gap
  // between the two reads.
  const force: ConsentAnswer = needsConsent
    ? await answerGate(ctx, gate, {
        flag: opts["force"] === true ? true : undefined,
        preamble,
        question: "Remove them?",
        defaultYes: false,
      })
    : "not-required";

  if (force === "declined") {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: "worktree cleanup cancelled — nothing was removed",
      why: "the confirmation was declined",
      next: `re-run and answer y, or re-run with the decision made: ${rerun} ${all ? "-y" : "--force"}`,
    });
  }

  const result = await runWorktreeCleanup({
    repoRoot: lane.repoRoot,
    farmDir: lane.farmDir,
    run: lane.run,
    names,
    all,
    ...(opts["filesOnly"] === true ? { filesOnly: true } : {}),
    force,
    cwd: ctx.app.runtime.cwd,
    rerun,
  });
  renderCleanup(ctx, result);

  const payload = {
    status: result.status,
    worktrees: result.worktrees,
    pruned: result.pruned,
    notices: result.notices,
    stash: result.stash,
  };
  if (result.status !== "partial") return { exitCode: 0, json: payload };

  // Same seam as a partial setup: returned, so the per-file outcomes survive.
  // The funnel's contract is that a returned exit-1 result OWES an error
  // document, and the engine's cleanup result carries none, so it is written
  // here rather than left for a consumer to infer from the rows.
  const errorDocument = partialCleanupErrorDocument(result, rerun);
  return {
    exitCode: 1,
    json: {
      ...payload,
      error: {
        code: "FS_ERROR",
        message: errorDocument.message,
        next: errorDocument.next,
      },
    },
  };
}

export const worktreeCommand: CommandModule = {
  name: "worktree",
  summary: "parallel checkouts of this repository: the inventory, guided setup, and receipt-based teardown",
  // `setup` creates a checkout and `cleanup` removes one, so the shared
  // --dry-run flag registers. It is inert on `list`, which is a read.
  mutating: true,
  args: [
    // These descriptions are copied verbatim into the generated
    // `docs/cli-reference.md` (`../docs/cliReference.ts`, byte-gated by its
    // suite), so editing either string is a docs change: regenerate the page in
    // the same commit.
    {
      name: "subcommand",
      description: "list | setup | cleanup — omit for list",
      required: false,
    },
    {
      name: "name",
      description: "the worktree name — its directory under the farm, and the branch it checks out",
      required: false,
    },
  ],

  /**
   * Commander registers flags per COMMAND, not per subcommand, so all seven are
   * visible everywhere and are inert wherever the subcommand does not read them.
   * Each description names the subcommand that reads it rather than leaving a
   * reader of `--help` — and of the generated reference page, which copies these
   * strings verbatim — to find out by trying.
   *
   * The two negatable pairs are registered positive-first, which is what keeps
   * commander from defaulting the negative to `true`: an unanswered gate has to
   * be distinguishable from an operator who said no, because a closed gate
   * refuses and naming the flag while an explicit `no` has its own behaviour.
   */
  configure(cmd: Command): void {
    cmd.option("--use-existing", "worktree setup: attach to an existing local branch of that name");
    cmd.option(
      "--no-use-existing",
      "worktree setup: refuse rather than attach to an existing local branch",
    );
    cmd.option("--track", "worktree setup: track the remote branch of that name");
    cmd.option("--no-track", "worktree setup: create a new local branch off HEAD instead of tracking");
    cmd.option(
      "--copy-secrets",
      "worktree setup: copy entries marked `secret` in the policy — without it they are skipped and the report says so",
    );
    cmd.option("--all", "worktree cleanup: sweep every worktree this lane manages");
    cmd.option(
      "--files-only",
      "worktree cleanup: invert the receipt's files and leave the checkout in place",
    );
    cmd.option("--force", "worktree cleanup: proceed on a worktree carrying uncommitted changes");
  },

  run: async (ctx, opts, args): Promise<CommandResult> => {
    const [subcommand, name] = args;
    const lane = await resolveLane(ctx);

    // Bare `worktree` is the inventory on EVERY stream: unlike `config` there is
    // no single key to settle here, so a picker would have nothing to pick.
    if (subcommand === undefined) return runList(ctx, lane);

    switch (subcommand) {
      case "list":
        return runList(ctx, lane);
      case "setup":
        return runSetup(ctx, lane, name, opts);
      case "cleanup":
        return runCleanup(ctx, lane, name, opts);
      default:
        throw new CliFailure({
          code: "USAGE",
          message: `unknown worktree subcommand ${JSON.stringify(subcommand)}`,
          why: "worktree takes one of three subcommands",
          next: `use one of: ${SUBCOMMANDS.join(", ")}`,
        });
    }
  },
};
