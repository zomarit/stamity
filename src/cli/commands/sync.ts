import type { Command } from "commander";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import type { WorkingTreeStatus } from "../engine/gitStatus.ts";
import { applySync, planSync, type SyncApplyReport, type SyncPlan } from "./sync/engine.ts";
import { renderSyncReport, syncJsonPayload } from "./sync/report.ts";

/**
 * `stamity sync` — the regenerate verb: the thin commander wrapper over the
 * plan/apply engine in `./sync/engine.ts`. Every decision lives there; this
 * layer owns only the UX seams:
 *
 * - **Flags.** `--force` here; `--json` / `-y` / `--dry-run` come from the
 *   shared matrix. `-y` is accepted-and-inert — sync never prompts, but a
 *   uniform `-y` keeps scripted call sites copy-pasteable across commands.
 * - **Dirty-tree WARNING, never a gate.** A dirty working tree gets one stderr
 *   line and the run proceeds: git is the restore path, so the useful advice
 *   is to commit first, not to refuse. An unavailable git (`available: false`)
 *   warns about nothing — the tree state is unknown, not known-dirty.
 * - **Exit codes.** 0 on success, all-unchanged and empty-corpus runs
 *   included, and 0 on `--dry-run` even when collisions exist (a preview must
 *   not fail CI probes that use it as a peek — the collision rows carry the
 *   report's "would refuse" marker instead). 1 when a live run REFUSED at least
 *   one path: the collision gate is per-path, so the rest of the plan is on
 *   disk and the exit code reports the remainder rather than the whole run.
 *   Every engine throw — uninitialised repo (`VALIDATION_ERROR`, message
 *   carries `npx @zomarit/stamity init`), newer-schema manifest (`CONFIG_ERROR`, upgrade
 *   guidance) — passes through to the kit funnel, which renders it and exits 1.
 * - **Update path.** There is no update command: `npx @zomarit/stamity@latest sync` IS
 *   the update, so the help text says exactly that, and manifest schema
 *   migrations run inside sync — a migrated manifest gets its own report line
 *   so the on-version-change rewrite is visible.
 */

/**
 * The update story, baked into `sync --help` — no update command exists.
 * Module-private: the only consumer is `configure()` below, and the contract is
 * asserted through the rendered help output ("sync — help text" in
 * test/cli/commands/sync.test.ts), not by importing the string.
 */
const UPDATE_PATH_HELP =
  "update = npx @zomarit/stamity@latest sync — regenerating from the newest release is the update; " +
  "no separate update command exists.";

/** Continuous-onboarding close after a run that changed files on disk. */
export const NEXT_AFTER_WRITE_LINE = "next: git diff to review, stamity check to verify";

/**
 * The one stderr warning line for a dirty working tree, or `null` when there
 * is nothing to warn about: a clean tree needs no warning, and an unavailable
 * git (`available: false`) cannot be warned about — unknown is not dirty.
 */
export function dirtyTreeWarning(dirty: WorkingTreeStatus): string | null {
  if (!dirty.available || !dirty.dirty) return null;
  return (
    `warning: working tree has ${dirty.changedCount} uncommitted change(s) — sync writes ` +
    `into it; commit first for an easy git-revert restore path`
  );
}

/**
 * Human-mode lines appended after the rendered report, derived from run state:
 * the migration notice whenever the manifest reader rewrote the schema, and
 * the review next-step only when a live run actually changed files — an
 * all-unchanged or empty-corpus run has nothing to review, and a dry run wrote
 * nothing (the report's own honesty lines cover both; this layer never
 * duplicates them).
 */
export function syncClosingLines(plan: SyncPlan, report: SyncApplyReport): string[] {
  const lines: string[] = [];
  if (plan.manifestMigrated) lines.push(`manifest schema migrated to ${plan.manifest.version}`);
  if (!report.dryRun && report.created + report.updated > 0) lines.push(NEXT_AFTER_WRITE_LINE);
  // Last line, because it is the one the exit code is about. A partial run
  // prints its successes above; without this the operator would read a report
  // full of written files and an exit 1 with nothing connecting them.
  if (report.refused.length > 0) {
    lines.push(
      `${report.refused.length} file(s) were NOT written — they collide with files the engine ` +
        `cannot prove it wrote (named above). Everything else in the plan is on disk. Move each ` +
        `aside and re-run, or re-run with --force to overwrite them after a verified .bak.`,
    );
  }
  return lines;
}

export const syncCommand: CommandModule = {
  name: "sync",
  summary: "regenerate every managed file from the manifest and bundled content",
  mutating: true,

  configure(cmd: Command): void {
    cmd.option("--force", "overwrite colliding unmanaged files after a verified .bak");
    cmd.addHelpText("after", `\n${UPDATE_PATH_HELP}\n`);
  },

  async run(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
    const rootDir = ctx.app.runtime.cwd;
    const engineVersion = ctx.app.version;
    const force = opts["force"] === true;

    // Spinner around plan+apply (TTY human mode renders frames; piped mode
    // prints the text once as a plain line; JSON mode prints nothing).
    ctx.spinner.start(ctx.dryRun ? "previewing sync…" : "syncing…");
    const plan = await planSync(rootDir, engineVersion);
    const warning = dirtyTreeWarning(plan.dirty);
    if (warning !== null) ctx.io.err(`${warning}\n`);
    const report = await applySync(rootDir, plan, {
      engineVersion,
      force,
      dryRun: ctx.dryRun,
      now: ctx.app.runtime.clock.now(),
    });
    ctx.spinner.stop();

    ctx.io.out(`${renderSyncReport(plan, report, ctx.palette)}\n`);
    for (const line of syncClosingLines(plan, report)) ctx.io.out(`${line}\n`);

    // Non-zero when the run left something undone. The collision gate is
    // per-path now (`./sync/engine.ts`), so the refusal no longer throws — the
    // rest of the plan is on disk and this is what keeps a CI probe failing on
    // the part that is not.
    return { exitCode: report.refused.length > 0 ? 1 : 0, json: syncJsonPayload(plan, report) };
  },
};
