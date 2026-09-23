import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Argument, type Command } from "commander";
import { STATE_DIR } from "../../types/markers.ts";
import type { AppendResult } from "../../runs/ledgerStore.ts";
import { CliFailure, renderFailureHuman, type FailureDoc } from "../kit/output.ts";
import { packageCommand } from "../kit/packageName.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";

/**
 * `stamity ledger append` — the one serialized writer of a work run's findings
 * ledger, and the CLI's third hidden plumbing verb. Hidden for the reason
 * `learn` and `handoff` are: its caller is the orchestrating session running
 * `/st-work`, not a person.
 *
 * **It decides nothing about a finding or a row.** The findings block's grammar
 * lives in `../../runs/blocks.ts`; the run folder, the report path rules, the
 * row numbering, the lock and the write live in `../../runs/ledgerStore.ts`; the
 * run id's grammar lives in `../../runs/layout.ts`. Every verdict printed here is
 * one of theirs. What this file owns is which flags spell an append, where the
 * block's text comes from, and how a refusal reads on a terminal.
 *
 * **Stdout carries rows only**, one `<ledger-id> <severity> <report-local id>`
 * line each, with a trailing ` decision-needed` on a row the orchestrator must
 * sign off before a fixer acts on it, so the caller reads the ids it dispatches
 * by straight off the pipe. Everything else — the nothing-to-append note, the
 * warnings about a line that is not a row or about locking being off — goes to
 * stderr. The dry-run line is the one exception, and it ends the output.
 *
 * **Why the subcommand is positional.** The funnel (`../kit/program.ts`) owns the
 * exit-code contract, the single JSON document and the failure rendering through
 * the action it registers on THIS command; commander dispatches a matched
 * sub-command instead of that action, so a real `ledger append` sub-command
 * would run outside the funnel.
 */

const APPEND = "append";

/** Where the block came from when it was piped rather than named. */
const STDIN_SOURCE = "stdin";

/**
 * How many problems a parse refusal lists. A report may be up to 1 MiB of
 * one-character bad lines, one problem each, and the refusal lands in the
 * orchestrator's tool output: the first twenty are enough to start fixing, and
 * the count of the rest says how far there is to go.
 */
const PROBLEMS_LISTED = 20;

function text(opts: Record<string, unknown>, key: string): string | undefined {
  const value = opts[key];
  return typeof value === "string" ? value : undefined;
}

/** A flag one subcommand requires and the others do not use. Exit 1, not 2: the
 *  line parsed, and the subcommand is what makes the flag mandatory. */
function missingFlag(subcommand: string, flag: string): CliFailure {
  return new CliFailure({
    code: "VALIDATION_ERROR",
    message: `ledger ${subcommand} needs ${flag}`,
    why: `${flag} is required by ${subcommand} and unused by the other subcommands, so it is checked here rather than by the argument parser`,
    next: `re-run with ${flag} <value>`,
  });
}

/** The one precondition: `.stamity/` exists, so a ledger row is never written
 *  into a state directory minted in whatever folder the caller happened to be. */
async function requireStateDir(rootDir: string): Promise<void> {
  try {
    await stat(join(rootDir, STATE_DIR));
  } catch (cause) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `this repo is not initialised — there is no ${STATE_DIR}/ directory to write a ledger row into`,
      why: cause instanceof Error ? cause.message : String(cause),
      next: `run: ${packageCommand("init")}`,
    });
  }
}

/** Read a stream to EOF under the engine's user-content ceiling, so an unbounded
 *  pipe is refused before it is buffered whole. */
async function readAll(input: NodeJS.ReadableStream, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of input) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
    total += buffer.byteLength;
    if (total > maxBytes) {
      throw new CliFailure({
        code: "VALIDATION_ERROR",
        message: `the block piped on stdin is over the ${maxBytes} byte input ceiling`,
        why: "a findings block is one line per finding; a report is read by path, not piped",
        next: "pipe the stamity-findings block alone, or name the report with --report",
      });
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** The row line a caller reads its ledger ids from. */
function rowLine(row: AppendResult["rows"][number]): string {
  return `${row.ledgerId} ${row.severity} ${row.localId}${row.decisionNeeded ? " decision-needed" : ""}`;
}

async function runAppend(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
  const rootDir = ctx.app.runtime.cwd;
  // Before the pipe is read: an append pointed at the wrong directory should not
  // first consume the caller's stdin.
  await requireStateDir(rootDir);

  const run = text(opts, "run");
  if (run === undefined) throw missingFlag(APPEND, "--run");
  const phase = text(opts, "phase");
  if (phase === undefined) throw missingFlag(APPEND, "--phase");
  const source = text(opts, "source");
  if (source === undefined) throw missingFlag(APPEND, "--source");

  const { layout, ledgerStore, blocks } = ctx.engine.runs;
  if (!layout.isRunId(run)) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `ledger: --run ${JSON.stringify(run)} is not a run id (YYYY-MM-DD_<lowercase-slug>)`,
      why: `a run id matches ${layout.RUN_ID_PATTERN.source}, the name of its folder under .stamity/runs/`,
      next: "pass the run folder's name exactly as it is on disk",
    });
  }
  for (const [flag, value] of [
    ["--phase", phase],
    ["--source", source],
  ] as const) {
    if (!ledgerStore.LEDGER_SLUG_PATTERN.test(value)) {
      throw new CliFailure({
        code: "VALIDATION_ERROR",
        message: `ledger: ${flag} ${JSON.stringify(value)} is not a lowercase slug ([a-z][a-z0-9-]*)`,
        why: `${flag} becomes part of every ledger id and row this append writes`,
        next: `re-run with ${flag} spelled in lowercase letters, digits and hyphens`,
      });
    }
  }

  const reportFlag = text(opts, "report");
  const fromStdin = opts["stdin"] === true;
  if ((reportFlag === undefined) === !fromStdin) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: "ledger append takes exactly one of --report and --stdin",
      why: "the findings block is read from one place, and a row records which report it came from",
      next: "name the report with --report <path>, or pipe the block with --stdin",
    });
  }

  await ledgerStore.requireRunDir(rootDir, run);

  let blockText: string;
  let report: string | null = null;
  if (reportFlag !== undefined) {
    const resolved = await ledgerStore.resolveReportPath(rootDir, run, reportFlag);
    blockText = resolved.text;
    report = resolved.relative;
  } else {
    blockText = ctx.terminal.stdinIsTTY
      ? ""
      : await readAll(ctx.promptIo.input, ctx.engine.guard.promptGuard.MAX_USER_CONTENT_LENGTH);
  }
  const src = report ?? STDIN_SOURCE;

  const parsed = blocks.parseFindingsBlock(blockText);
  if (!parsed.ok) {
    const doc: FailureDoc = {
      code: "VALIDATION_ERROR",
      message: `ledger append refused ${src}`,
      why: "the stamity-findings block does not parse, so no row was appended",
      next: "fix every line named above in the report, then re-run the append",
    };
    // A message quotes report text (and V8's own window of it, for a line that
    // is not JSON), so every one is sanitised here, where it meets the terminal
    // and the JSON document, not in the parser that names it.
    const listed = parsed.problems
      .slice(0, PROBLEMS_LISTED)
      .map((problem) => ({ line: problem.line, message: sanitizeLabel(problem.message) }));
    const omitted = parsed.problems.length - listed.length;
    if (!ctx.json) {
      const lines = listed.map((problem) => `${src}:${problem.line}: ${problem.message}`);
      if (omitted > 0) lines.push(`… +${omitted} more problem(s)`);
      ctx.io.err(`${renderFailureHuman(doc, ctx.palette)}\n${lines.join("\n")}\n`);
    }
    return { exitCode: 1, json: { error: doc, problems: listed, omitted } };
  }

  if (parsed.items.length > 0 && !ctx.engine.merge.atomicWrite.isCrossProcessLockingEnabled()) {
    ctx.io.err(
      "warning: cross-process locking is off (STAMITY_LOCK=0); concurrent appends are not serialized\n",
    );
  }

  const result = await ledgerStore.appendFindings({
    rootDir,
    runId: run,
    phase,
    source,
    findings: parsed.items,
    report,
    dryRun: ctx.dryRun,
  });

  for (const line of result.unreadableLines) {
    ctx.io.err(`warning: ${result.ledger} line ${line} is not a ledger row; it was left as it is\n`);
  }
  if (result.rows.length === 0) {
    // stderr, so stdout stays the rows a caller parses: zero lines there is the
    // machine's answer, this sentence is the person's.
    ctx.io.err(`ledger append: no findings in ${src}; nothing appended\n`);
  }
  for (const row of result.rows) ctx.io.out(`${rowLine(row)}\n`);
  if (ctx.dryRun) {
    ctx.io.out(
      `Dry run: ${result.rows.length} row(s) would be appended to ${result.ledger}. Nothing was written.\n`,
    );
  }

  return {
    exitCode: 0,
    json: { run, ledger: result.ledger, source: src, rows: [...result.rows], dryRun: ctx.dryRun },
  };
}

export const ledgerCommand: CommandModule = {
  name: "ledger",
  summary: "append findings to a run's ledger through one serialized writer (plumbing)",
  hidden: true,
  mutating: true,

  configure(cmd: Command): void {
    cmd
      .addArgument(new Argument("<subcommand>", "which ledger action to run").choices([APPEND]))
      .option("--run <run-id>", "the run folder's name under .stamity/runs/")
      .option("--phase <phase>", "the phase the rows are filed under, a lowercase slug (review, build)")
      .option("--source <role>", "the role whose findings these are, a lowercase slug (reviewer)")
      .option("--report <path>", "a report inside the run's reports/ folder")
      .option("--stdin", "read the findings block from stdin");
  },

  async run(ctx, opts): Promise<CommandResult> {
    // Commander's `choices()` already refused every other subcommand at parse time.
    return await runAppend(ctx, opts);
  },
};
