import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Argument, Option, type Command } from "commander";
import { STATE_DIR } from "../../types/markers.ts";
import type { BlockProblem } from "../../runs/blocks.ts";
import type { AppendResult, CloseChange, CloseResult } from "../../runs/ledgerStore.ts";
import { CliFailure, renderFailureHuman, type FailureDoc } from "../kit/output.ts";
import { packageCommand } from "../kit/packageName.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";

/**
 * `stamity ledger append` and `stamity ledger close` — the one serialized
 * writer of a work run's findings ledger, and the CLI's third hidden plumbing
 * verb. `append` files a report's findings as `open` rows; `close` moves rows on
 * a re-review's closures block (`--report` with the `--ids` it was handed) or
 * by one manual transition (`--id`, `--state`, `--rationale`). Hidden for the reason
 * `learn` and `handoff` are: its caller is the orchestrating session running
 * `/st-work`, not a person.
 *
 * **It decides nothing about a finding or a row.** The findings and closures
 * blocks' grammar lives in `../../runs/blocks.ts`; the run folder, the report path rules, the
 * row numbering, the closure rules, the lock and the write live in
 * `../../runs/ledgerStore.ts`; the
 * run id's grammar lives in `../../runs/layout.ts`. Every verdict printed here is
 * one of theirs. What this file owns is which flags spell an append or a close,
 * where the block's text comes from, and how a refusal reads on a terminal.
 *
 * **Stdout carries rows only**: for an append, one `<ledger-id> <severity>
 * <report-local id>` line each, with a trailing ` decision-needed` on a row the
 * orchestrator must sign off before a fixer acts on it, so the caller reads the
 * ids it dispatches by straight off the pipe; for a close, one
 * `<id> <from> -> <to>` line per row (with its closure status in parentheses),
 * or `<id> unchanged (already recorded)`. Everything else — the nothing-to-do
 * note, the warnings about a line that is not a row or about locking being off
 * — goes to stderr. The dry-run line is the one exception, and it ends the
 * output.
 *
 * **Why the subcommand is positional.** The funnel (`../kit/program.ts`) owns the
 * exit-code contract, the single JSON document and the failure rendering through
 * the action it registers on THIS command; commander dispatches a matched
 * sub-command instead of that action, so a real `ledger append` sub-command
 * would run outside the funnel.
 */

const APPEND = "append";
const CLOSE = "close";
const MANUAL_STATES = ["fixed", "rejected", "deferred"] as const;

/** Where the block came from when it was piped rather than named. */
const STDIN_SOURCE = "stdin";

/**
 * How many problems a refusal lists. A report may be up to 1 MiB of
 * one-character bad lines, one problem each, and the refusal lands in the
 * orchestrator's tool output: the first twenty are enough to start fixing, and
 * the count of the rest says how far there is to go.
 */
const PROBLEMS_LISTED = 20;

/**
 * A refusal that lists problems — a block that does not parse, or closures
 * that cannot apply: the failure document, then the first
 * {@link PROBLEMS_LISTED} as `<src>:<line>: <message>` and one
 * `… +<m> more problem(s)` line; under `--json`, the same first twenty and
 * `omitted`. A message quotes report text (and V8's own window of it, for a
 * line that is not JSON), so every one is sanitised here, where it meets the
 * terminal and the JSON document, not in the parser or the store that names it.
 */
function refuseWithProblems(
  ctx: CliContext,
  doc: FailureDoc,
  src: string,
  problems: readonly BlockProblem[],
): CommandResult {
  const listed = problems
    .slice(0, PROBLEMS_LISTED)
    .map((problem) => ({ line: problem.line, message: sanitizeLabel(problem.message) }));
  const omitted = problems.length - listed.length;
  if (!ctx.json) {
    const lines = listed.map((problem) => `${src}:${problem.line}: ${problem.message}`);
    if (omitted > 0) lines.push(`… +${omitted} more problem(s)`);
    ctx.io.err(`${renderFailureHuman(doc, ctx.palette)}\n${lines.join("\n")}\n`);
  }
  return { exitCode: 1, json: { error: doc, problems: listed, omitted } };
}

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

/** Say so when the lock that serializes ledger writers is switched off. */
function warnIfUnlocked(ctx: CliContext, writes: string): void {
  if (ctx.engine.merge.atomicWrite.isCrossProcessLockingEnabled()) return;
  ctx.io.err(
    `warning: cross-process locking is off (STAMITY_LOCK=0); concurrent ${writes} are not serialized\n`,
  );
}

/** One stderr line per ledger line that is not a row: kept, but named. */
function warnUnreadable(ctx: CliContext, ledger: string, lines: readonly number[]): void {
  for (const line of lines) {
    ctx.io.err(`warning: ${ledger} line ${line} is not a ledger row; it was left as it is\n`);
  }
}

/** The `--run` value, checked: present and a run id. */
function requireRun(ctx: CliContext, subcommand: string, opts: Record<string, unknown>): string {
  const run = text(opts, "run");
  if (run === undefined) throw missingFlag(subcommand, "--run");
  const { layout } = ctx.engine.runs;
  if (!layout.isRunId(run)) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `ledger: --run ${JSON.stringify(run)} is not a run id (YYYY-MM-DD_<lowercase-slug>)`,
      why: `a run id matches ${layout.RUN_ID_PATTERN.source}, the name of its folder under .stamity/runs/`,
      next: "pass the run folder's name exactly as it is on disk",
    });
  }
  return run;
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
  requireRun(ctx, APPEND, opts);

  const { ledgerStore, blocks } = ctx.engine.runs;
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
    return refuseWithProblems(
      ctx,
      {
        code: "VALIDATION_ERROR",
        message: `ledger append refused ${src}`,
        why: "the stamity-findings block does not parse, so no row was appended",
        next: "fix every line named above in the report, then re-run the append",
      },
      src,
      parsed.problems,
    );
  }

  if (parsed.items.length > 0) warnIfUnlocked(ctx, "appends");

  const result = await ledgerStore.appendFindings({
    rootDir,
    runId: run,
    phase,
    source,
    findings: parsed.items,
    report,
    dryRun: ctx.dryRun,
  });

  warnUnreadable(ctx, result.ledger, result.unreadableLines);
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

/** The stdout line of one close change. Ids and states are read from the report
 *  and the ledger, so the line is sanitised where it meets the terminal. */
function changeLine(change: CloseChange): string {
  if (change.unchanged) return sanitizeLabel(`${change.ledgerId} unchanged (already recorded)`);
  const status = change.status === null ? "" : ` (${change.status})`;
  return sanitizeLabel(`${change.ledgerId} ${change.from} -> ${change.to}${status}`);
}

/** `--ids`: split on commas, each item trimmed, blanks dropped, repeats collapsed. */
function handedIds(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter((item) => item !== ""))];
}

function closeUsage(message: string, why: string, next: string): CliFailure {
  return new CliFailure({ code: "VALIDATION_ERROR", message, why, next });
}

async function runClose(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
  const rootDir = ctx.app.runtime.cwd;
  await requireStateDir(rootDir);
  const run = requireRun(ctx, CLOSE, opts);

  const reportFlag = text(opts, "report");
  const id = text(opts, "id");
  const state = text(opts, "state");
  const rationale = text(opts, "rationale");
  const idsFlag = text(opts, "ids");
  if ((reportFlag === undefined) === (id === undefined)) {
    throw closeUsage(
      "ledger close takes exactly one of --report and --id",
      "a close applies either a re-review's closures block or one manual transition",
      "name the re-review with --report <path> --ids <ids>, or one row with --id <ledger-id>",
    );
  }

  const { ledgerStore, blocks } = ctx.engine.runs;
  let result: CloseResult;
  let report: string | null = null;

  if (reportFlag !== undefined) {
    if (state !== undefined || rationale !== undefined) {
      throw closeUsage(
        "ledger close --report takes no --state or --rationale; the closures block carries them",
        "each closure's status sets its row's state, and its note is the rationale",
        "drop --state and --rationale, or close one row with --id instead",
      );
    }
    const handed = idsFlag === undefined ? [] : handedIds(idsFlag);
    if (handed.length === 0) {
      throw closeUsage(
        "ledger close --report needs --ids, the ledger ids handed to this re-review",
        "a closure is applied only to a row its re-review was handed, so no other row moves",
        "re-run with --ids <id>,<id> — the ids the re-review's dispatch named",
      );
    }
    await ledgerStore.requireRunDir(rootDir, run);
    const resolved = await ledgerStore.resolveReportPath(rootDir, run, reportFlag);
    report = resolved.relative;

    const parsed = blocks.parseClosuresBlock(resolved.text);
    if (!parsed.ok) {
      return refuseWithProblems(
        ctx,
        {
          code: "VALIDATION_ERROR",
          message: `ledger close refused ${report}`,
          why: "the stamity-closures block does not parse, so no row changed",
          next: "fix every line named above in the re-review, then re-run the close",
        },
        report,
        parsed.problems,
      );
    }
    if (parsed.items.length > 0) warnIfUnlocked(ctx, "closes");
    try {
      result = await ledgerStore.applyClosures({
        rootDir,
        runId: run,
        closures: parsed.items,
        handedIds: handed,
        report,
        dryRun: ctx.dryRun,
      });
    } catch (error) {
      if (!(error instanceof ledgerStore.ClosuresRefused)) throw error;
      return refuseWithProblems(
        ctx,
        {
          code: "VALIDATION_ERROR",
          message: `ledger close refused ${report}`,
          why: "a closure cannot apply, so no row changed",
          next: "fix the closures named above, or the --ids handed, then re-run the close",
        },
        report,
        error.problems,
      );
    }
    if (parsed.items.length === 0) {
      ctx.io.err(`ledger close: no closures in ${report}; nothing changed\n`);
    }
  } else {
    if (idsFlag !== undefined) {
      throw closeUsage(
        "ledger close --id takes no --ids; it moves the one row it names",
        "--ids bounds a re-review's closures block, and a manual close has none",
        "drop --ids, or close a re-review's rows with --report <path> --ids <ids>",
      );
    }
    if (state === undefined) throw missingFlag(CLOSE, "--state");
    if (rationale === undefined) throw missingFlag(CLOSE, "--rationale");
    await ledgerStore.requireRunDir(rootDir, run);
    warnIfUnlocked(ctx, "closes");
    result = await ledgerStore.closeRow({
      rootDir,
      runId: run,
      ledgerId: id as string,
      // Commander's `choices()` refused every other value at parse time.
      state: state as (typeof MANUAL_STATES)[number],
      rationale,
      dryRun: ctx.dryRun,
    });
  }

  warnUnreadable(ctx, result.ledger, result.unreadableLines);
  for (const change of result.changes) ctx.io.out(`${changeLine(change)}\n`);
  if (ctx.dryRun) {
    const moving = result.changes.filter((change) => !change.unchanged).length;
    ctx.io.out(`Dry run: ${moving} row(s) would change in ${result.ledger}. Nothing was written.\n`);
  }

  return {
    exitCode: 0,
    json: { run, ledger: result.ledger, report, changes: [...result.changes], dryRun: ctx.dryRun },
  };
}

export const ledgerCommand: CommandModule = {
  name: "ledger",
  summary: "append findings to a run's ledger and close its rows, through one serialized writer (plumbing)",
  hidden: true,
  mutating: true,

  configure(cmd: Command): void {
    cmd
      .addArgument(new Argument("<subcommand>", "which ledger action to run").choices([APPEND, CLOSE]))
      .option("--run <run-id>", "the run folder's name under .stamity/runs/")
      .option("--phase <phase>", "the phase the rows are filed under, a lowercase slug (review, build)")
      .option("--source <role>", "the role whose findings these are, a lowercase slug (reviewer)")
      .option("--report <path>", "a report inside the run's reports/ folder")
      .option("--stdin", "read the findings block from stdin")
      .option("--ids <ledger-ids>", "the comma-separated ledger ids handed to this re-review")
      .option("--id <ledger-id>", "the one row a manual close moves")
      .addOption(
        new Option("--state <state>", "the state a manual close sets").choices([...MANUAL_STATES]),
      )
      .option("--rationale <text>", "why a manual close moves the row, recorded on it");
  },

  async run(ctx, opts, args): Promise<CommandResult> {
    // Commander's `choices()` already refused every other subcommand at parse time.
    return args[0] === CLOSE ? await runClose(ctx, opts) : await runAppend(ctx, opts);
  },
};
