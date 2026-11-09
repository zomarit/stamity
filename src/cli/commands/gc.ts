import { basename, dirname, join, resolve } from "node:path";
import type { Command } from "commander";
import { CliFailure } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";
import {
  GC_DEFAULT_REPORT_DAYS,
  applyGc,
  planGc,
  type GcReport,
  type HandoffSweep,
  type HandoffTarget,
} from "../../runs/gc.ts";
import { STATE_DIR } from "../../types/markers.ts";
import { resolveGitCommonDir, runGit } from "../../worktree/git.ts";
import { readWorktreePolicy, resolveFarmDir } from "../../worktree/policy.ts";

/**
 * `stamity gc` — what the setup's runs left on this machine, how large it is, and, with `--apply`, the freeing of
 * it (REQ-FLOW-177).
 *
 *   gc                          report only; writes nothing
 *   gc --apply                  free the default set: reports past the age, handoffs past retention,
 *                               gone worktree registrations, tracking refs origin no longer has
 *   --reports-older-than <d>    the report age, default 30 days
 *   --runs-older-than <d>       also free the untracked files of run folders older than that
 *   --branches                  also delete merged local `stamity/*` branches with `git branch -d`
 *
 * A preview by default, so the verb that deletes is the one a person spelled. `--dry-run` (the kit's, since the
 * verb is `mutating`) holds a run to a preview even beside `--apply`. The bounds — `.stamity/` and the farm only,
 * no tracked file, no remote branch, no dirty tree, no link followed — are the engine's, stated in
 * `../../runs/gc.ts` where each is checked.
 *
 * Shaped after `./worktree.ts`: the root is the MAIN checkout's, found through git's common dir, so a run from
 * inside a lane reads the `.stamity/` and the farm every lane shares rather than its own copy.
 *
 * Handoffs go through the engine registry's store (`ctx.engine.handoffs`), the way `./handoff.ts` reaches it: the
 * preview mirrors that verb's dry-run prune over the same verdicts, and the apply acts on that preview: the store's
 * `archiveHandoff` moves each expired one, and the engine removes each one past retention under its own bounds.
 *
 * Exit 1 when any act the sweep attempted failed, with the failures in the payload and an `error` document;
 * a kept item is not a failure.
 */

const HANDOFFS_DIR = "handoffs";
const ARCHIVE_DIR = "archive";
const MS_PER_DAY = 86_400_000;

/** A non-negative whole number of days, or a usage refusal naming the flag. */
function parseDays(flag: string, value: unknown): number | null {
  if (value === undefined) return null;
  const text = String(value);
  if (!/^[0-9]{1,5}$/u.test(text)) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `${flag} takes a whole number of days, and ${JSON.stringify(sanitizeLabel(text))} is not one.`,
      next: `Name the days as digits, for example \`stamity gc ${flag} 30\`.`,
    });
  }
  return Number(text);
}

async function resolveRoot(ctx: CliContext): Promise<string> {
  const cwd = ctx.app.runtime.cwd;
  const outcome = await runGit({ args: ["rev-parse", "--show-toplevel"], cwd });
  if (outcome.status !== 0) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `${cwd} is not inside a git repository git opens, and gc reads git's tracked list before it frees anything.`,
      why: sanitizeLabel(outcome.stderr.trim() || outcome.stdout.trim()),
      next: "Run the command from inside a clone.",
    });
  }
  const topLevel = resolve(outcome.stdout.trim());
  const commonDir = await resolveGitCommonDir(runGit, cwd);
  return basename(commonDir) === ".git" ? dirname(commonDir) : topLevel;
}

/** The store's prune as a preview and a sweep, over the engine registry's handoff modules. */
function handoffSweep(ctx: CliContext): HandoffSweep {
  const { schema, store, validation } = ctx.engine.handoffs;
  return {
    async preview(rootDir, now) {
      const archive = join(rootDir, STATE_DIR, HANDOFFS_DIR, ARCHIVE_DIR);
      const held = await store.listHandoffs(rootDir);
      const expired = held.filter(
        (handoff) =>
          dirname(handoff.filePath) !== archive &&
          validation.isHandoffExpired(handoff, now) &&
          schema.isValidStatusTransition(handoff.frontmatter.status, "archived"),
      );
      const archiving = new Set(expired.map((handoff) => handoff.frontmatter.id));
      const cutoff = now.getTime() - store.DEFAULT_ARCHIVE_RETENTION_DAYS * MS_PER_DAY;
      const stale = held.filter((handoff) => {
        if (dirname(handoff.filePath) !== archive || archiving.has(handoff.frontmatter.id)) return false;
        const expires = Date.parse(handoff.frontmatter.expires);
        return !Number.isNaN(expires) && expires <= cutoff;
      });
      const target = (handoff: (typeof held)[number]): HandoffTarget => ({
        id: handoff.frontmatter.id,
        path: handoff.filePath,
      });
      return { archive: expired.map(target), remove: stale.map(target) };
    },
    async archive(rootDir, id) {
      await store.archiveHandoff(rootDir, id);
    },
  };
}

/** Bytes for a reader: whole bytes under a KiB, else one decimal in the largest fitting binary unit. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit] ?? "TiB"}`;
}

function render(ctx: CliContext, report: GcReport, reportDays: number): void {
  const out = (line: string): void => {
    ctx.io.out(`${line}\n`);
  };
  const label = (text: string): string => sanitizeLabel(text);
  out(
    report.dryRun
      ? "stamity gc: a preview. Nothing was removed; --apply frees what is marked."
      : "stamity gc: applied.",
  );
  out("");
  out(`Run folders (${String(report.runs.length)}):`);
  for (const row of report.runs) {
    out(
      `  ${label(row.run)}  ${formatBytes(row.bytes)} (reports ${formatBytes(row.reportsBytes)}), ` +
        `${String(row.ageDays)} days${row.tracked ? ", holds tracked files" : ""}` +
        `${row.open ? ", open: kept whole" : ""}`,
    );
  }
  out(
    `Reports: ${String(report.reports.files)} files, ${formatBytes(report.reports.bytes)}; ` +
      `${String(report.reports.eligible)} past ${String(reportDays)} days`,
  );
  out(`Branches stamity/* (${String(report.branches.length)}):`);
  for (const row of report.branches) {
    const state = row.eligible ? "deleted with --apply" : row.merged ? "merged (--branches deletes it)" : "not merged";
    out(`  ${label(row.name)}  ${state}`);
  }
  out(`Tracking refs origin no longer has (${String(report.staleTracking.length)}):`);
  for (const ref of report.staleTracking) out(`  ${label(ref)}`);
  out(`Worktrees (${String(report.worktrees.length)}):`);
  for (const row of report.worktrees) {
    const ignored = row.ignored.length === 0 ? "" : `, ignored: ${row.ignored.map(label).join(", ")}`;
    out(`  ${label(row.path)}  ${row.class}${ignored}`);
  }
  out(
    `Handoffs: ${String(report.handoffs.archived.length)} expired to archive, ` +
      `${String(report.handoffs.eligible.length)} archived past retention`,
  );
  if (report.kept.length > 0) {
    out("Kept:");
    for (const row of report.kept) out(`  ${label(row.path)}: ${row.reason}`);
  }
  if (report.failed.length > 0) {
    out("Failed:");
    for (const row of report.failed) out(`  ${label(row.path)}: ${label(row.reason)}`);
  }
  out("");
  out(
    `${report.dryRun ? "Would free" : "Freed"} ${formatBytes(report.freed.bytes)} across ` +
      `${String(report.freed.paths.length)} paths and refs${report.freed.paths.length === 0 ? "." : ":"}`,
  );
  for (const path of report.freed.paths) out(`  ${label(path)}`);
}

export const gcCommand: CommandModule = {
  name: "gc",
  summary: "report the disk local runs, branches, worktrees and handoffs hold, and free it with --apply",
  mutating: true,

  configure(cmd: Command): void {
    cmd
      .option("--apply", "free the default set; without it the run is a preview")
      .option(
        "--reports-older-than <days>",
        "free run reports older than this many days",
        String(GC_DEFAULT_REPORT_DAYS),
      )
      .option("--runs-older-than <days>", "also free the untracked files of run folders older than this many days")
      .option("--branches", "also delete merged local stamity/* branches, with git branch -d");
  },

  async run(ctx, opts): Promise<CommandResult> {
    const reportDays = parseDays("--reports-older-than", opts["reportsOlderThan"]) ?? GC_DEFAULT_REPORT_DAYS;
    const runDays = parseDays("--runs-older-than", opts["runsOlderThan"]);
    const repoRoot = await resolveRoot(ctx);
    const policy = await readWorktreePolicy(repoRoot);
    const handoffs = handoffSweep(ctx);
    const now = ctx.app.runtime.clock.now();
    const plan = await planGc({
      repoRoot,
      farmDir: resolveFarmDir(policy, repoRoot),
      now,
      reportsOlderThanDays: reportDays,
      runsOlderThanDays: runDays,
      branches: opts["branches"] === true,
      handoffs,
      run: runGit,
    });
    const apply = opts["apply"] === true && !ctx.dryRun;
    const report = apply ? await applyGc(plan, { handoffs, run: runGit }) : plan.report;
    render(ctx, report, reportDays);
    const json = { ...report } as Record<string, unknown>;
    if (report.failed.length === 0) return { exitCode: 0, json };
    ctx.io.err(`stamity gc: ${String(report.failed.length)} act(s) failed; each is listed under Failed.\n`);
    return {
      exitCode: 1,
      json: {
        ...json,
        error: {
          code: "FS_ERROR",
          message: `${String(report.failed.length)} act(s) failed; the rest of the sweep ran.`,
          next: "Read each failed row's reason, fix it, and run stamity gc --apply again.",
        },
      },
    };
  },
};
