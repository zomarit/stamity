import { statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Command } from "commander";
import { assessReadiness, readReadinessFiles, type ReadinessReads, type ReadinessReport } from "../../detect/readiness.ts";
import { analyzeRepo } from "../../detect/repoAnalyzer.ts";
import { readManifest } from "../../manifest/manifest.ts";
import { MANIFEST_FILE, type SetupManifest } from "../../types/manifest.ts";
import { STATE_DIR } from "../../types/markers.ts";
import { runGit } from "../../worktree/git.ts";
import { CliFailure } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";
import { checkLandJobWorkflows, resolveCharterGates } from "./check.ts";

/**
 * `stamity ready [--path <dir>]` — whether a repository is ready for unattended runs (REQ-FLOW-182).
 *
 * A report, not a gate: exit 0 on any verdict, 1 when the root cannot be read, 2 on a usage error (a
 * `--path` that is a file). It reads files and runs none of the repository's commands. The one process
 * it starts is `git ls-files`, through `runGit` (which pins `core.fsmonitor=false`), to learn whether
 * the setup manifest is committed; outside a clone that answer is `unknown`.
 *
 * The checks and the file reads are `../../detect/readiness.ts`'s. This verb fills the half that module
 * may not reach from the engine layer: the charter gates (`resolveCharterGates`), the land job's
 * workflow names (`checkLandJobWorkflows`) and the setup's pin and commit.
 */

/** A `--path` naming a file is the caller's defect, so it exits 2 before anything is read. */
function checkPath(command: Command): void {
  const path = command.opts<Record<string, unknown>>()["path"];
  if (typeof path !== "string") return;
  let isFile = false;
  try {
    // The shipped CLI's runtime cwd is the process's, so this resolves as `run` does below.
    isFile = statSync(resolve(path)).isFile();
  } catch {
    // Absent or unreadable: `run` names that as a root it cannot read, exit 1.
  }
  if (isFile) command.error(`error: --path takes a folder, and ${sanitizeLabel(path)} is a file`, { exitCode: 2 });
}

async function readSetup(rootDir: string): Promise<{ manifest: SetupManifest | null; setup: ReadinessReads["setup"] }> {
  let manifest: SetupManifest | null;
  try {
    manifest = await readManifest(rootDir);
  } catch {
    return { manifest: null, setup: { manifest: "unreadable", pinnedVersion: null, committed: null } };
  }
  if (manifest === null) return { manifest, setup: { manifest: "absent", pinnedVersion: null, committed: null } };
  const tracked = await runGit({ args: ["ls-files", "--", `${STATE_DIR}/${MANIFEST_FILE}`], cwd: rootDir });
  const committed = tracked.status === 0 ? tracked.stdout.trim().length > 0 : null;
  const pinnedVersion = manifest.generatedBy.length > 0 ? manifest.generatedBy : null;
  return { manifest, setup: { manifest: "present", pinnedVersion, committed } };
}

async function landJob(rootDir: string, manifest: SetupManifest | null, absent: boolean): Promise<ReadinessReads["landJob"]> {
  if (absent) return "off";
  if (manifest === null) return null;
  try {
    return (await checkLandJobWorkflows(rootDir, manifest)) ?? "off";
  } catch {
    return null;
  }
}

function render(ctx: CliContext, report: ReadinessReport): void {
  const out = (line: string): void => {
    ctx.io.out(`${line}\n`);
  };
  const label = (text: string): string => sanitizeLabel(text);
  const width = Math.max(...report.checks.map((row) => row.id.length));
  for (const row of report.checks) {
    out(`${row.id.padEnd(width)}  ${row.state.padEnd(11)}  ${label(row.evidence)}  (fix: ${label(row.fix)})`);
  }
  const versions = report.stack.versions.map((entry) => `${label(entry.language)} ${label(entry.version)} from ${label(entry.source)}`);
  const languages = report.stack.languages.length > 0 ? report.stack.languages.join(", ") : "none detected";
  out(`languages: ${languages}${versions.length > 0 ? `; versions: ${versions.join(", ")}` : ""}`);
  if (report.stack.legacyStacks.length > 0) out(`legacy: ${report.stack.legacyStacks.join(", ")}`);
  if (report.coverage !== null) out(`coverage: ${String(report.coverage.linesPct)}% from ${report.coverage.file}`);
  const named = (state: string): string[] => report.checks.filter((row) => row.state === state).map((row) => row.id);
  const open = [
    ...(named("gap").length > 0 ? [`gaps: ${named("gap").join(", ")}`] : []),
    ...(named("unknown").length > 0 ? [`unknown: ${named("unknown").join(", ")}`] : []),
  ];
  out(report.ready ? "verdict: ready" : `verdict: not ready (${open.join("; ")})`);
}

export const readyCommand: CommandModule = {
  name: "ready",
  summary: "report whether this repository is ready for unattended runs, reading files only",
  mutating: false,

  configure(cmd: Command): void {
    cmd.option("--path <dir>", "the repository root to read (default: the current folder)").hook("preAction", checkPath);
  },

  async run(ctx, opts): Promise<CommandResult> {
    const given = opts["path"];
    const rootDir = resolve(ctx.app.runtime.cwd, typeof given === "string" ? given : ".");
    try {
      await readdir(rootDir);
    } catch (cause) {
      throw new CliFailure({
        code: "FS_ERROR",
        message: `stamity ready cannot read ${sanitizeLabel(rootDir)} as a folder.`,
        why: sanitizeLabel((cause as NodeJS.ErrnoException).code ?? "unreadable"),
        next: "Name a repository folder you can read, with --path or by running from inside it.",
      });
    }
    const [info, files, { manifest, setup }] = await Promise.all([
      analyzeRepo(rootDir),
      readReadinessFiles(rootDir),
      readSetup(rootDir),
    ]);
    const gates =
      manifest === null
        ? null
        : resolveCharterGates(rootDir, manifest, ctx.engine.detect.verificationGates, {
            platform: process.platform,
            env: ctx.app.runtime.env,
          });
    const report = assessReadiness(info, {
      ...files,
      gates,
      landJob: await landJob(rootDir, manifest, setup.manifest === "absent"),
      setup,
    });
    render(ctx, report);
    return { exitCode: 0, json: { ...report } };
  },
};
