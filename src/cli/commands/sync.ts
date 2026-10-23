import type { Command } from "commander";
import { scopeRegistryArg } from "../../shared/cliCall.ts";
import { MANIFEST_FILE } from "../../types/manifest.ts";
import { STATE_DIR } from "../../types/markers.ts";
import { hasNpmChannel, npmRegistry, packageCommand, packageName } from "../kit/packageName.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { assertNotLoosened } from "../engine/autonomyGate.ts";
import { listerTreeRoot } from "../engine/clientModels.ts";
import type { WorkingTreeStatus } from "../engine/gitStatus.ts";
import { readClientModelLists } from "./init/apply.ts";
import { applySync, planSync, refusalRemedyLines, type SyncApplyReport, type SyncPlan } from "./sync/engine.ts";
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
 *   carries the `init` remedy for this installation), newer-schema manifest
 *   (`CONFIG_ERROR`, upgrade
 *   guidance) — passes through to the kit funnel, which renders it and exits 1.
 * - **Update path.** There is no update command: a sync run by the newer
 *   release, `npx -y <this package>@<version> sync` with the exact version to
 *   move to, IS the update, so the help text says exactly that, and manifest schema
 *   migrations run inside sync — a migrated manifest gets its own report line
 *   so the on-version-change rewrite is visible.
 */

/**
 * The update story, baked into `sync --help` — no update command exists.
 * Module-private: the only consumer is `configure()` below, and the contract is
 * asserted through the rendered help output ("sync — help text" in
 * test/cli/commands/sync.test.ts), not by importing the string.
 *
 * A function rather than a constant because the name is read from the running
 * installation: a downstream that renamed the package per
 * `docs/enterprise-forks.md` must be told to run ITS package, not ours.
 *
 * The exact-version form, never `@latest`: an `@latest` advice runs whatever the
 * registry serves on the day it is typed, and a setup pinned to one version is
 * moved on purpose, the same form the update notice prints
 * (`../notice/updateNotice.ts`). The version is spelled as a placeholder, since
 * help text has no registry answer to name and the pinned call
 * (`../../shared/cliCall.ts`) refuses a version that is not semver-shaped.
 *
 * A package with no npm channel (`hasNpmChannel()` false: private, no
 * `publishConfig.registry`) follows the update notice's private-package rule
 * (`../notice/updateNotice.ts`) and names no registry fetch. Its name is one
 * nobody holds on the public registry, and an `npx <name>@<version>` with neither
 * `-y` nor `--no` installs without asking in a shell with no TTY, which is
 * an agent's. So the line says to install the newer release into the project
 * first and then run `npx --no <name> sync`, which runs that installed copy
 * and refuses to fetch one.
 */
function updatePathHelp(): string {
  if (!hasNpmChannel()) {
    return (
      `update = install the newer release into this project, then npx --no ${packageName()} sync — ` +
      `regenerating from the newest release is the update; no separate update command exists.`
    );
  }
  // A `--registry` fork names its registry for its scope ahead of the spec
  // (REQ-PLUGIN-048); `npmRegistry()` answers only a registry the call can write.
  const registryArg = scopeRegistryArg(packageName(), npmRegistry() ?? undefined);
  const call = ["npx -y", registryArg, `${packageName()}@<version> sync`].filter((word) => word !== "").join(" ");
  return (
    `update = ${call}, with <version> the release to move to — ` +
    `regenerating from that release is the update; no separate update command exists.`
  );
}

/** Continuous-onboarding close after a run that changed files on disk. */
export const NEXT_AFTER_WRITE_LINE = "next: git diff to review, stamity check to verify";

/**
 * The same close where the engine's look before git kept the setup root from
 * git (`WorkingTreeStatus.reason`, `../engine/gitStatus.ts`): this folder, or a
 * folder above it, has the layout of a bare repository. Plain git typed there
 * opens that folder and takes its configuration, so this line names no git
 * command (review/58). It says why, and what the review has without git: the
 * rows the report printed above it, and the `.bak` an overwrite keeps wherever
 * git cannot vouch for the previous bytes (`../../merge/safeWrite.ts`), each
 * named by that overwrite's own warning.
 */
export const NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE =
  "next: review without git, stamity check to verify — git was not started here: this folder, or a " +
  "folder above it, has the layout of a bare repository, so do not run git in it or in any folder " +
  "under it, this one included. To review, read the files listed above, and compare a file with " +
  "the .bak a warning above names for it.";

/**
 * The same close wherever else git did not answer for the setup root
 * (`WorkingTreeStatus.available` false with no `reason`): no repository, no git
 * the engine found, or a git too slow for the probe. "git diff to review" is a
 * git command typed where the engine's own git gave no answer, found by the
 * shell's rules and not by the engine's walk, so this line names none either.
 * It gives no cause of its own: `check`'s `git-available` row tells the causes
 * apart by what the engine found, and the line points there.
 */
export const NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE =
  "next: review without git, stamity check to verify — git did not answer here, and the " +
  "git-available row of stamity check says what the engine found. To review, read the files " +
  "listed above, and compare a file with the .bak a warning above names for it.";

/**
 * How many per-file rows the report prints before it folds the rest into one
 * `… and N more` row. The number is `./sync/report.ts`'s `MAX_FILE_LINES`, which
 * that module keeps to itself, so it is spelled a second time here. Two cases
 * run the real report beside the step and hold the two together
 * (`test/cli/commands/sync.test.ts`): a run of this many rows, and one more.
 */
const LISTED_FILE_ROWS = 20;

/**
 * What {@link NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE} and
 * {@link NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE} add where the report's list
 * was cut short, or `null` where it was printed whole (review/66). The step
 * says to read "the files listed above", and past the fold they are not all
 * listed; the usual way to see the rest is git, which this step cannot name.
 *
 * It says only what the tree holds. Nothing the engine writes records which
 * files one run changed: the manifest's ledger names every managed path with
 * its owner and a hash, each file this run wrote among them
 * (`../engine/emissionWrite.ts::ledgerRowsForOutput`), and the `--json` payload
 * holds every row under `wrote` (`./sync/report.ts::syncJsonPayload`) for the
 * run that prints it, where a later run plans the same files as unchanged.
 *
 * The rows counted are the ones the report lists: every `wrote` row but the
 * unchanged ones, a skipped write included.
 */
function listCutShortLine(report: SyncApplyReport): string | null {
  const listed = report.wrote.filter((result) => result.action !== "unchanged").length;
  const folded = listed - LISTED_FILE_ROWS;
  if (folded <= 0) return null;
  return (
    `That list was cut short at \`… and ${folded} more\`, and the engine keeps no record of which ` +
    `files those are. The \`ledger\` in ${STATE_DIR}/${MANIFEST_FILE} names every file the engine ` +
    `manages, each file this run wrote among them, and does not say which of them changed; ` +
    `sync --json prints every row under \`wrote\`, but only for the run it is given on, and a run ` +
    `now reports the files this one wrote as unchanged.`
  );
}

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
 * the migration notice whenever the manifest reader rewrote the schema (in
 * "would be" wording on a dry run, which writes nothing), and
 * the review next-step only when a live run actually changed files — an
 * all-unchanged or empty-corpus run has nothing to review, and a dry run wrote
 * nothing (the report's own honesty lines cover both; this layer never
 * duplicates them). The step is {@link NEXT_AFTER_WRITE_LINE} wherever git
 * answered. At a folder the look before git refused it is
 * {@link NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE}, and wherever else git did not
 * answer {@link NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE}; each of those two is
 * followed on the same line by {@link listCutShortLine} where the report folded
 * rows out of its list.
 */
export function syncClosingLines(plan: SyncPlan, report: SyncApplyReport): string[] {
  const lines: string[] = [];
  if (plan.manifestMigrated) {
    // A dry run writes nothing, so it says what the live run would do.
    lines.push(
      report.dryRun
        ? `manifest schema would be migrated to ${plan.manifest.version}`
        : `manifest schema migrated to ${plan.manifest.version}`,
    );
  }
  if (!report.dryRun && report.created + report.updated > 0) {
    const withoutGit =
      plan.dirty.reason === "bare-layout"
        ? NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE
        : plan.dirty.available
          ? null
          : NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE;
    if (withoutGit === null) {
      lines.push(NEXT_AFTER_WRITE_LINE);
    } else {
      const cutShort = listCutShortLine(report);
      lines.push(cutShort === null ? withoutGit : `${withoutGit} ${cutShort}`);
    }
  }
  // Last line, because it is the one the exit code is about. A partial run
  // prints its successes above; without this the operator would read a report
  // full of written files and an exit 1 with nothing connecting them.
  lines.push(...refusalRemedyLines(plan, report.refused));
  return lines;
}

/**
 * The model lists the selected clients' own CLIs give this account, read
 * before the plan (REQ-LADDER-006) and handed to it as an overlay on the lists
 * the git-ignored cache keeps (REQ-LADDER-009): a live run keeps them in that
 * cache, never in the manifest, a dry run writes nothing, and a client that
 * does not answer keeps its cached list.
 * Read through the run's own environment, so `STAMITY_NO_CLIENT_PROBE=1`
 * there skips every read. An uninitialised repository reads nothing here and
 * gets the plan's own refusal.
 */
async function freshModelLists(ctx: CliContext, rootDir: string): ReturnType<typeof readClientModelLists> {
  const manifest = await ctx.engine.manifest.manifest.readManifest(rootDir);
  if (manifest === null) return {};
  return readClientModelLists(manifest.tools, ctx.app.runtime.env, await listerTreeRoot(rootDir));
}

export const syncCommand: CommandModule = {
  name: "sync",
  summary: "regenerate every managed file from the manifest and bundled content",
  mutating: true,

  configure(cmd: Command): void {
    cmd.option("--force", "overwrite colliding unmanaged files after a verified .bak");
    cmd.option("--loosen", "write a guard copy looser than the autonomy setting on disk, at HEAD or in the manifest it replaces (the person's act)");
    cmd.addHelpText("after", `\n${updatePathHelp()}\n`);
  },

  async run(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
    const rootDir = ctx.app.runtime.cwd;
    const engineVersion = ctx.app.version;
    const force = opts["force"] === true;
    const loosen = opts["loosen"] === true;

    // Spinner around plan+apply (TTY human mode renders frames; piped mode
    // prints the text once as a plain line; JSON mode prints nothing).
    ctx.spinner.start(ctx.dryRun ? "previewing sync…" : "syncing…");
    const listedOverlay = await freshModelLists(ctx, rootDir);
    const plan = await planSync(rootDir, engineVersion, { listedOverlay });
    const warning = dirtyTreeWarning(plan.dirty);
    if (warning !== null) ctx.io.err(`${warning}\n`);
    const report = await applySync(rootDir, plan, {
      engineVersion,
      force,
      dryRun: ctx.dryRun,
      now: ctx.app.runtime.clock.now(),
      // The loosen gate (REQ-FLOW-138): `--loosen` is the person's word, which the guard asks for.
      // Under `--loosen`, each guard copy it loosens is named on stderr.
      guardGate: (next, copies) =>
        assertNotLoosened(rootDir, next, { loosen, copies, remedy: packageCommand("sync --loosen"), notice: (line) => ctx.io.err(`${line}\n`) }),
    });
    ctx.spinner.stop();
    if (report.modelListCacheWarning !== undefined) ctx.io.err(`warning: ${report.modelListCacheWarning}\n`);

    ctx.io.out(`${renderSyncReport(plan, report, ctx.palette)}\n`);
    for (const line of syncClosingLines(plan, report)) ctx.io.out(`${line}\n`);

    // Non-zero when the run left something undone. The collision gate is
    // per-path now (`./sync/engine.ts`), so the refusal no longer throws — the
    // rest of the plan is on disk and this is what keeps a CI probe failing on
    // the part that is not.
    return { exitCode: report.refused.length > 0 ? 1 : 0, json: syncJsonPayload(plan, report) };
  },
};
