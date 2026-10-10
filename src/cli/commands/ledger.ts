import { constants as FS, type Stats } from "node:fs";
import { lstat, open, stat } from "node:fs/promises";
import { join } from "node:path";
import { Argument, Option, type Command } from "commander";
import {
  CONTENT_DENY_PATTERNS,
  INJECTION_PATTERNS,
  INVISIBLE_SMUGGLING_CHARS,
  LEARNINGS_INJECTION_PATTERNS,
  normalizeForDenyScan,
} from "../../denyscan/denyScan.ts";
import { STATE_DIR } from "../../types/markers.ts";
import type { BlockProblem } from "../../runs/blocks.ts";
import type { InboxProblem, InboxRow, MatchedBy } from "../../runs/inboxStore.ts";
import type { AppendResult, CloseChange, CloseResult } from "../../runs/ledgerStore.ts";
import type { ResumeCard } from "../../runs/resumeCard.ts";
import { CliFailure, renderFailureHuman, type FailureDoc } from "../kit/output.ts";
import { packageCommand } from "../kit/packageName.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";

/**
 * `stamity ledger append`, `stamity ledger close`, `stamity ledger status` and
 * `stamity ledger inbox` — the one serialized writer of a work run's findings
 * ledger, its reader, the deferral inbox's query, and the CLI's third hidden
 * plumbing verb. `append` files a report's findings as `open`
 * rows; `close` moves rows on a re-review's closures block (`--report` with the
 * `--ids` it was handed), by one manual transition (`--id`, `--state`,
 * `--rationale`) or by one retirement (`--id`, `--retired`); `status`
 * prints the run's resume card, the same lines the session-start hook prints
 * after a compaction or a resume, and writes nothing; `inbox` prints the
 * deferral inbox's rows a change's paths touch, each line screened first in
 * the form it prints in, and writes nothing.
 * Hidden for the reason `learn` and `handoff` are: its caller is the orchestrating session running
 * `/st-work`, not a person.
 *
 * **It decides nothing about a finding or a row.** The findings and closures
 * blocks' grammar lives in `../../runs/blocks.ts`; the run folder, the report path rules, the
 * row numbering, the closure rules, the lock and the write live in
 * `../../runs/ledgerStore.ts`; the
 * run id's grammar lives in `../../runs/layout.ts`; the resume card lives in
 * `../../runs/resumeCard.ts`; the inbox's grammar and query live in
 * `../../runs/inboxStore.ts`. Every verdict printed here is
 * one of theirs. What this file owns is which flags spell an append, a close or
 * a status, where the block's text comes from, and how a refusal reads on a
 * terminal. A flag only another subcommand reads is a usage error, never ignored.
 *
 * **Stdout carries rows only**: for an append, one `<ledger-id> <severity>
 * <report-local id>` line each, with a trailing ` decision-needed` on a row the
 * orchestrator must sign off before a fixer acts on it, and a trailing
 * ` already-filed` on a `--stdin` finding an existing row already carries (the
 * id printed is that row's), so the caller reads the
 * ids it dispatches by straight off the pipe; for a close, one
 * `<id> <from> -> <to>` line per row (with its closure status, or a
 * retirement's `retired: <value>`, in parentheses),
 * or `<id> unchanged (already recorded)`; for a status, the card's lines, or the
 * one no-run sentence; for an inbox, the count line, then the matched rows, the
 * unparsed lines and the skipped lines. Everything else — the nothing-to-do
 * note, the warnings about a line that is not a row or about locking being off
 * — goes to stderr. The dry-run line is the one exception, and it ends the
 * output; a status writes nothing, so its dry run prints no such line.
 *
 * **Why the subcommand is positional.** The funnel (`../kit/program.ts`) owns the
 * exit-code contract, the single JSON document and the failure rendering through
 * the action it registers on THIS command; commander dispatches a matched
 * sub-command instead of that action, so a real `ledger append` sub-command
 * would run outside the funnel.
 */

const APPEND = "append";
const CLOSE = "close";
const STATUS = "status";
const INBOX = "inbox";
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

/**
 * The flags a subcommand does not read, keyed by subcommand: each as its
 * commander option key, its spelling, and the subcommands that do read it.
 * `--run` is read by every subcommand but inbox; `--report` by append and close;
 * `--paths`, `--plan` and `--area` by inbox alone.
 */
const FOREIGN_FLAGS: Readonly<Record<string, readonly (readonly [string, string, readonly string[]])[]>> = {
  [APPEND]: [
    ["ids", "--ids", [CLOSE]],
    ["id", "--id", [CLOSE]],
    ["state", "--state", [CLOSE]],
    ["rationale", "--rationale", [CLOSE]],
    ["retired", "--retired", [CLOSE]],
    ["paths", "--paths", [INBOX]],
    ["plan", "--plan", [INBOX]],
    ["area", "--area", [INBOX]],
  ],
  [CLOSE]: [
    ["phase", "--phase", [APPEND]],
    ["source", "--source", [APPEND]],
    ["stdin", "--stdin", [APPEND]],
    ["paths", "--paths", [INBOX]],
    ["plan", "--plan", [INBOX]],
    ["area", "--area", [INBOX]],
  ],
  [STATUS]: [
    ["phase", "--phase", [APPEND]],
    ["source", "--source", [APPEND]],
    ["stdin", "--stdin", [APPEND]],
    ["report", "--report", [APPEND, CLOSE]],
    ["ids", "--ids", [CLOSE]],
    ["id", "--id", [CLOSE]],
    ["state", "--state", [CLOSE]],
    ["rationale", "--rationale", [CLOSE]],
    ["retired", "--retired", [CLOSE]],
    ["paths", "--paths", [INBOX]],
    ["plan", "--plan", [INBOX]],
    ["area", "--area", [INBOX]],
  ],
  [INBOX]: [
    ["run", "--run", [APPEND, CLOSE, STATUS]],
    ["phase", "--phase", [APPEND]],
    ["source", "--source", [APPEND]],
    ["stdin", "--stdin", [APPEND]],
    ["report", "--report", [APPEND, CLOSE]],
    ["ids", "--ids", [CLOSE]],
    ["id", "--id", [CLOSE]],
    ["state", "--state", [CLOSE]],
    ["rationale", "--rationale", [CLOSE]],
    ["retired", "--retired", [CLOSE]],
  ],
};

/** Refuse a flag of another subcommand rather than silently ignore it. A
 *  usage error, checked before anything else is read. */
function refuseForeignFlags(subcommand: string, opts: Record<string, unknown>): void {
  for (const [key, flag, owners] of FOREIGN_FLAGS[subcommand] ?? []) {
    if (opts[key] === undefined) continue;
    const named = owners.map((owner) => `ledger ${owner}`);
    throw new CliFailure({
      code: "USAGE",
      message: `ledger ${subcommand} takes no ${flag}; it is a flag of ${named.join(" and ")}`,
      why: "each ledger subcommand reads only its own flags, so a flag of another is refused rather than silently ignored",
      next: `drop ${flag}, or run ${named.join(" or ")}`,
    });
  }
}

/** The one precondition: `.stamity/` exists, so a ledger row is never written
 *  into a state directory minted in whatever folder the caller happened to be,
 *  and a status never reports on a folder that is not a repository's state. */
async function requireStateDir(rootDir: string, purpose = "to write a ledger row into"): Promise<void> {
  try {
    await stat(join(rootDir, STATE_DIR));
  } catch (cause) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `this repo is not initialised — there is no ${STATE_DIR}/ directory ${purpose}`,
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
        // `total` is what was read when the ceiling tripped: the pipe is not drained further.
        message: `the block piped on stdin is at least ${total} bytes, over the ${maxBytes} byte input ceiling`,
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

/**
 * One stderr line per row written after Unicode tag characters were stripped
 * from `field`. Non-blocking: no legitimate finding or rationale carries them,
 * and the orchestrator is told which rows were cleaned.
 */
function warnTagsStripped(ctx: CliContext, ledgerIds: readonly string[], field: string): void {
  for (const ledgerId of ledgerIds) {
    ctx.io.err(
      `warning: ${ledgerId} carried Unicode tag characters in its ${field}; they were stripped before the row was written\n`,
    );
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

/**
 * The row line a caller reads its ledger ids from; ` already-filed` ends the
 * line of a finding an existing row carries. That row's id is read from the
 * ledger, not minted here, so the line is sanitised where it meets the
 * terminal, as a close's line is.
 */
function rowLine(row: AppendResult["rows"][number]): string {
  return sanitizeLabel(
    `${row.ledgerId} ${row.severity} ${row.localId}${row.decisionNeeded ? " decision-needed" : ""}${row.alreadyFiled ? " already-filed" : ""}`,
  );
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

  const { ledgerStore, blocks, layout } = ctx.engine.runs;
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
    // The name is a C1 report name by now, so it carries a role; --stdin carries no name to compare.
    const role = layout.reportNameRole(resolved.relative.slice(resolved.relative.lastIndexOf("/") + 1));
    if (role !== source) {
      throw new CliFailure({
        code: "VALIDATION_ERROR",
        message: `ledger: --source ${JSON.stringify(source)} is not ${role ?? "the role"}, the role the report name ${resolved.relative} carries`,
        why: "a report's rows are filed under the role that wrote it, so one role's findings never read as another's",
        next: `re-run with --source ${role ?? "<role>"}, or name that role's own report`,
      });
    }
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
  warnTagsStripped(ctx, result.tagsStripped, "locator or summary");
  if (result.rows.length === 0) {
    // stderr, so stdout stays the rows a caller parses: zero lines there is the
    // machine's answer, this sentence is the person's.
    ctx.io.err(`ledger append: no findings in ${src}; nothing appended\n`);
  }
  for (const row of result.rows) ctx.io.out(`${rowLine(row)}\n`);
  if (ctx.dryRun) {
    const appending = result.rows.filter((row) => !row.alreadyFiled).length;
    ctx.io.out(`Dry run: ${appending} row(s) would be appended to ${result.ledger}. Nothing was written.\n`);
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
  const status =
    change.retired !== undefined
      ? ` (retired: ${change.retired})`
      : change.status === null
        ? ""
        : ` (${change.status})`;
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
  const retired = text(opts, "retired");
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
  let tagField = "rationale";

  if (reportFlag !== undefined) {
    if (state !== undefined || rationale !== undefined) {
      throw closeUsage(
        "ledger close --report takes no --state or --rationale; the closures block carries them",
        "each closure's status sets its row's state, and its note is the rationale",
        "drop --state and --rationale, or close one row with --id instead",
      );
    }
    if (retired !== undefined) {
      throw closeUsage(
        "ledger close --report takes no --retired; a retirement names its one row with --id",
        "a closures block moves the rows a re-review was handed, and a retirement records one deferred row's inbox exit",
        "drop --retired, or retire the row with --id <ledger-id> --retired <disposition>",
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
    if (retired !== undefined) {
      // Taken before the manual close's --state and --rationale checks: a
      // retirement keeps the row's state and records its own disposition.
      if (state !== undefined || rationale !== undefined) {
        throw closeUsage(
          "ledger close --retired takes no --state or --rationale; a retirement keeps the row's state",
          "a retired row stays deferred and gains the dated retired field, so there is no state to set and no rationale to append",
          "drop --state and --rationale, or move the row with --state and --rationale alone",
        );
      }
      await ledgerStore.requireRunDir(rootDir, run);
      warnIfUnlocked(ctx, "closes");
      result = await ledgerStore.retireRow({
        rootDir,
        runId: run,
        ledgerId: id as string,
        disposition: retired,
        now: ctx.app.runtime.clock.now(),
        dryRun: ctx.dryRun,
      });
      tagField = "retired disposition";
    } else {
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
  }

  warnUnreadable(ctx, result.ledger, result.unreadableLines);
  warnTagsStripped(ctx, result.tagsStripped, tagField);
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

/** What `status` prints when there is no card: no run in progress, no recent closed run, no open debug round, or none named. */
const NO_CARD = "stamity: no run in progress under .stamity/runs/ — no resume card.";

/** The status JSON document with no card: the same keys, every count at zero. */
const NO_CARD_JSON = {
  run: null,
  inProgress: false,
  status: null,
  card: null,
  counts: { openRows: 0, unledgeredReports: 0, lanes: 0 },
  ledgerStates: { fixed: 0, deferred: 0, rejected: 0, open: 0 },
  debugRounds: [],
  withheld: null,
  listsWithheld: null,
  unreadableLedgerLines: 0,
  ledgerUnreadable: false,
  notReportNamed: 0,
} as const;

/**
 * The status JSON document of a card. The lists are echoed only when neither
 * the card nor the full lists tripped the screen — the card names ten items of
 * each, the document would name all of them — and then flattened as the card
 * prints them; the counts are always there. The record's status is screened
 * with the lists (the in-progress card never prints it), so it is null on a hit.
 * The open debug rounds' ids are always a key, for the no-card document's
 * shape, and empty on a hit. `run` is null on the card of open debug rounds alone.
 */
function statusJson(card: ResumeCard): Record<string, unknown> {
  const echo = card.withheld === null && card.listsWithheld === null;
  return {
    run: card.runId,
    inProgress: card.inProgress,
    status: echo ? card.status : null,
    card: [...card.lines],
    counts: {
      openRows: card.openRowIds.length,
      unledgeredReports: card.unledgeredReports.length,
      lanes: card.lanes.length,
    },
    ledgerStates: { ...card.ledgerStates },
    debugRounds: echo ? [...card.debugRounds] : [],
    ...(echo
      ? {
          openRowIds: [...card.openRowIds],
          unledgeredReports: [...card.unledgeredReports],
          lanes: [...card.lanes],
        }
      : {}),
    withheld: card.withheld,
    listsWithheld: card.listsWithheld,
    unreadableLedgerLines: card.unreadableLedgerLines,
    ledgerUnreadable: card.ledgerUnreadable,
    notReportNamed: card.notReportNamed,
  };
}

/**
 * `ledger status`: the resume card of the run in progress — with none, the
 * closed card of the newest closed run dated within the last two days; with
 * neither, the card of the open debug rounds, which names no run — or of the run `--run`
 * names whether or not it is in progress, in the in-progress layout. The
 * card's lines go to stdout exactly as the session-start hook prints them, so a client whose hook never
 * prints the card (or that does not re-run it after a compaction) gets the same
 * bytes by hand. Reads only; `--dry-run` is accepted and changes nothing.
 */
async function runStatus(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
  const rootDir = ctx.app.runtime.cwd;
  await requireStateDir(rootDir, "to read a resume card from");
  const { layout, ledgerStore, resumeCard } = ctx.engine.runs;

  let runId: string | undefined;
  if (opts["run"] !== undefined) {
    runId = requireRun(ctx, STATUS, opts);
    await ledgerStore.requireRunDir(rootDir, runId);
  }

  const card = resumeCard.collectResumeCard({
    rootDir,
    now: ctx.app.runtime.clock.now(),
    ...(runId === undefined ? {} : { runId }),
  });
  if (card === null) {
    ctx.io.out(`${NO_CARD}\n`);
    return {
      exitCode: 0,
      json: {
        ...NO_CARD_JSON,
        counts: { ...NO_CARD_JSON.counts },
        ledgerStates: { ...NO_CARD_JSON.ledgerStates },
        debugRounds: [],
      },
    };
  }

  // The card of open debug rounds alone names no run, and so no ledger to warn about.
  if (card.runId !== null && card.ledgerUnreadable) {
    ctx.io.err(
      `warning: ${layout.runRelPath(card.runId, layout.LEDGER_FILE)} exists but could not be read; its open rows are not counted\n`,
    );
  }
  if (card.runId !== null && card.unreadableLedgerLines > 0) {
    ctx.io.err(
      `warning: ${layout.runRelPath(card.runId, layout.LEDGER_FILE)} has ${card.unreadableLedgerLines} line(s) that are not ledger rows\n`,
    );
  }
  ctx.io.out(`${card.lines.join("\n")}\n`);

  return { exitCode: 0, json: statusJson(card) };
}

/** The largest inbox `ledger inbox` reads: 1 MiB, the engine's report ceiling. */
const INBOX_READ_MAX_BYTES = 1_048_576;

/**
 * The inbox screen: the session-start screen's three catalogs in its order
 * (`../../hooks/scripts.ts`), block rows only, WITHOUT its network-vocabulary
 * filter. That filter keeps the emitted hook script free of network words; this
 * screen ships in no script, so the exfil rows (`remote-exec-pipe`,
 * `send-data-external`, `image-url-exfiltration`) stay in. Each pattern is a
 * private copy, so a `lastIndex` left on a catalog row never reaches here.
 */
export const INBOX_SCREEN: readonly { readonly id: string; readonly re: RegExp }[] = [
  ...LEARNINGS_INJECTION_PATTERNS,
  ...CONTENT_DENY_PATTERNS,
  ...INJECTION_PATTERNS,
]
  .filter((entry) => entry.severity === "block")
  .map((entry) => ({ id: entry.id, re: new RegExp(entry.pattern.source, entry.pattern.flags) }));

/**
 * The longest bullet the screen reads, in UTF-16 code units: about four times
 * the longest row of this repository's own inbox. Two screen rows
 * (`remote-exec-pipe`, and `image-url-exfiltration`'s tag alternative) rescan
 * to the end of the line from every start, so their cost grows with the square
 * of a line's length; the read's byte ceiling bounds the file and not a line.
 * A bullet past the cap is skipped by its line number, unscreened, as
 * {@link INBOX_OVER_LENGTH}.
 */
export const INBOX_BULLET_MAX_CHARS = 4096;

/** The reason an over-long bullet's skip names where a hit names a pattern id; no screen row carries it. */
export const INBOX_OVER_LENGTH = "over-length";

/**
 * The first {@link INBOX_SCREEN} id, in list order, whose pattern matches a
 * view of the line; "" when none does. The views are the line as written and
 * the line as it prints (`sanitizeLabel`), each beside its copy with invisible
 * smuggling characters stripped and that copy's normalized form: the union
 * `screenCard` composes (`../../runs/resumeCard.ts`), taken twice.
 *
 * The printed form is screened because it is not the written one:
 * `sanitizeLabel` drops the C0 and C1 controls, which no other view removes,
 * so a keyword one of them splits passes the written views and prints joined.
 * The written form is still screened, since the printed one has lost what the
 * tag-block and control rows match on.
 */
function screenInboxLine(line: string): string {
  const views = new Set<string>();
  for (const form of [line, sanitizeLabel(line)]) {
    const stripped = form.replace(INVISIBLE_SMUGGLING_CHARS, "");
    views.add(form).add(stripped).add(normalizeForDenyScan(stripped));
  }
  const copies = [...views];
  const hit = INBOX_SCREEN.find((entry) =>
    copies.some((copy) => {
      entry.re.lastIndex = 0;
      return entry.re.test(copy);
    }),
  );
  return hit === undefined ? "" : hit.id;
}

/** The first hit {@link screenInboxLine} reports over the fields, in their order; "" when each passes. */
function screenInboxFields(fields: readonly string[]): string {
  for (const field of fields) {
    const pattern = screenInboxLine(field);
    if (pattern !== "") return pattern;
  }
  return "";
}

/**
 * A parsed row's screen over what prints of it: its fields in the order the
 * human line joins them, then each field as the string of its own the JSON
 * document carries, where a pattern anchored to a line's start can match a
 * field it misses in the middle of the bullet.
 */
function screenInboxRow(row: InboxRow): string {
  return screenInboxFields([
    `${row.severity} · ${row.location} · ${row.description}${row.tag === null ? "" : ` · ${row.tag}`}`,
    row.severity,
    row.location,
    row.description,
    row.source,
    row.ref ?? "",
    row.tag ?? "",
  ]);
}

/**
 * A refused read. Its `next` leads with what the caller must not do: a refusal
 * is no licence to read the file whole by another route, which would hand a
 * run the unscreened text this query exists to screen (a writer can force the
 * refusal by padding the file or replacing it with a link). The refusal is
 * reported as a finding instead.
 */
function inboxRefusal(message: string, why: string): CliFailure {
  return new CliFailure({
    code: "VALIDATION_ERROR",
    message,
    why,
    next: `do not read ${STATE_DIR}/inbox.md whole in this query's place, since a whole read is unscreened; report this refusal as a finding; the query runs again once the inbox is a regular file of at most ${INBOX_READ_MAX_BYTES} bytes inside the repository`,
  });
}

/**
 * The inbox's text, or null when there is none. Each segment is `lstat`ed top
 * down, so a link at `.stamity` or at the inbox is refused rather than read
 * through, and the open takes `O_NOFOLLOW` where the platform has it, so a
 * leaf swapped for a link after the walk is refused too.
 */
async function readInbox(rootDir: string, inboxPath: string): Promise<string | null> {
  let walked = rootDir;
  let leaf: Stats | null = null;
  for (const segment of inboxPath.split("/")) {
    walked = join(walked, segment);
    try {
      // eslint-disable-next-line no-await-in-loop -- top-down on purpose: the first bad segment is the one named
      leaf = await lstat(walked);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw inboxRefusal(`ledger inbox cannot read ${inboxPath}`, cause instanceof Error ? cause.message : String(cause));
    }
    if (leaf.isSymbolicLink()) {
      throw inboxRefusal(
        `ledger inbox refused ${inboxPath}: ${segment} is a symbolic link`,
        "the inbox is read only as a regular file inside the repository, never through a link",
      );
    }
  }
  const tooLarge = (size: number): CliFailure =>
    inboxRefusal(
      `ledger inbox refused ${inboxPath}: it is ${size} bytes, over the ${INBOX_READ_MAX_BYTES} byte ceiling`,
      "the inbox's rows are printed into a run's context, so its size is bounded",
    );
  const notFile = inboxRefusal(
    `ledger inbox refused ${inboxPath}: it is not a regular file`,
    "the inbox is one markdown file of rows",
  );
  if (leaf === null || !leaf.isFile()) throw notFile;
  if (leaf.size > INBOX_READ_MAX_BYTES) throw tooLarge(leaf.size);

  const handle = await open(walked, FS.O_RDONLY | (FS.O_NOFOLLOW ?? 0));
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) throw notFile;
    if (stats.size > INBOX_READ_MAX_BYTES) throw tooLarge(stats.size);
    return await handle.readFile({ encoding: "utf8" });
  } finally {
    await handle.close();
  }
}

/**
 * A row as the JSON document carries it: every text field sanitised.
 * `withheld` is null on a clean row and the pattern id on a withheld one,
 * whose description, writer and `Ref:` are null rather than empty.
 */
function inboxRowJson(row: InboxRow, matchedBy: MatchedBy, withheld: string | null): Record<string, unknown> {
  return {
    line: row.line,
    severity: sanitizeLabel(row.severity),
    location: sanitizeLabel(row.location),
    description: withheld === null ? sanitizeLabel(row.description) : null,
    source: withheld === null ? sanitizeLabel(row.source) : null,
    ref: withheld === null && row.ref !== null ? sanitizeLabel(row.ref) : null,
    tag: row.tag === null ? null : sanitizeLabel(row.tag),
    matchedBy,
    withheld,
  };
}

/** A matched row's human line; a withheld row's names the pattern where its description would stand. */
function inboxRowLine(row: InboxRow, matchedBy: MatchedBy, withheld: string | null): string {
  const body = withheld === null ? row.description : `withheld by the screen (${withheld}); read it by hand`;
  return sanitizeLabel(
    `${row.line} ${row.severity} · ${row.location} · ${body}${row.tag === null ? "" : ` · ${row.tag}`} (${matchedBy})`,
  );
}

/**
 * `ledger inbox`: the deferral inbox's rows a change touches — by `--paths`,
 * by `--plan`, by `--area` word for a row naming no path, every row tagged
 * `critical-deferred` or `decision-waiting`, and every row when no filter is
 * given. The inbox is user-tier state any writer can author and these lines
 * land in a run's context, so every bullet, parsed or not, is screened before
 * anything of it prints, as written and as it prints: the bullet first, then
 * a parsed row's printed fields and an unparsed line's message. A bullet past
 * {@link INBOX_BULLET_MAX_CHARS} is skipped unscreened. A hit prints
 * `skipped: <line> (<pattern id>)` and never the row's text nor its parse
 * message.
 *
 * One hit prints more. A row that parses, and whose severity and location each
 * pass the screen alone, is withheld rather than dropped: a copy holding only
 * its line, severity and location goes to the match, with its tag when that is
 * an always-shown word, so the row still matches by its location and still
 * shows by that tag. Matched, it prints `<line> <severity> · <location> ·
 * withheld by the screen (<pattern id>); read it by hand` in place of its skip
 * line; its description, writer and `Ref:` never reach the match or the
 * output. A deferral whose text the screen refuses still comes back to the
 * run that touches its file, for a person to read.
 *
 * Every printed field is sanitised. Each bullet counts once under matched,
 * unmatched, unparsed or skipped, but for a matched withheld row, which counts
 * under matched and skipped both; a skip line prints whatever the query, and
 * the JSON `skipped` lists every screened bullet, a matched withheld row
 * included. The JSON `counts` tallies the matched rows by severity. Reads
 * only; `--dry-run` is accepted and changes nothing, so it prints no dry-run
 * line.
 */
async function runInbox(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
  const rootDir = ctx.app.runtime.cwd;
  await requireStateDir(rootDir, "to read the deferral inbox from");
  const { inboxStore } = ctx.engine.runs;
  const counts: Record<string, number> = Object.fromEntries(inboxStore.INBOX_SEVERITIES.map((severity) => [severity, 0]));

  const inboxText = await readInbox(rootDir, inboxStore.INBOX_PATH);
  if (inboxText === null) {
    ctx.io.out("inbox: absent\n");
    return {
      exitCode: 0,
      json: { inbox: inboxStore.INBOX_PATH, total: 0, matched: [], counts, unmatched: 0, problems: [], skipped: [] },
    };
  }

  // Each bullet's own verdict, before anything of it is read further: its length, then the screen.
  const bulletScreen = new Map<number, string>();
  inboxText.split("\n").forEach((raw, index) => {
    if (!raw.startsWith("- ")) return;
    bulletScreen.set(index + 1, raw.length > INBOX_BULLET_MAX_CHARS ? INBOX_OVER_LENGTH : screenInboxLine(raw));
  });

  const parsed = inboxStore.parseInbox(inboxText);
  const skipped: { line: number; pattern: string }[] = [];
  const withheld = new Map<number, string>();
  const alwaysShown: readonly string[] = inboxStore.ALWAYS_SHOW_TAGS;
  const rows: InboxRow[] = [];
  for (const row of parsed.rows) {
    const bullet = bulletScreen.get(row.line) ?? "";
    const pattern = bullet === "" ? screenInboxRow(row) : bullet;
    if (pattern === "") {
      rows.push(row);
      continue;
    }
    skipped.push({ line: row.line, pattern });
    if (pattern === INBOX_OVER_LENGTH) continue;
    if (screenInboxFields([row.severity, row.location, `${row.severity} · ${row.location}`]) !== "") continue;
    const tag = row.tag !== null && alwaysShown.includes(row.tag) && screenInboxLine(row.tag) === "" ? row.tag : null;
    withheld.set(row.line, pattern);
    rows.push({ line: row.line, severity: row.severity, location: row.location, description: "", source: "", ref: null, tag });
  }
  const problems: InboxProblem[] = [];
  for (const problem of parsed.problems) {
    const bullet = bulletScreen.get(problem.line) ?? "";
    const pattern = bullet === "" ? screenInboxLine(problem.message) : bullet;
    if (pattern === "") problems.push(problem);
    else skipped.push({ line: problem.line, pattern });
  }
  skipped.sort((a, b) => a.line - b.line);
  const paths = Array.isArray(opts["paths"]) ? (opts["paths"] as string[]) : [];
  const area = Array.isArray(opts["area"]) ? (opts["area"] as string[]) : undefined;
  const plan = text(opts, "plan");
  const result = inboxStore.matchInbox(rows, {
    paths,
    ...(plan === undefined ? {} : { plan }),
    ...(area === undefined ? {} : { area }),
  });
  for (const { row } of result.matched) counts[row.severity] = (counts[row.severity] ?? 0) + 1;
  const total = parsed.rows.length + parsed.problems.length;
  // A withheld row is counted under `skipped`, matched or not, so `unmatched` counts the clean rows alone.
  const shown = new Set(result.matched.filter(({ row }) => withheld.has(row.line)).map(({ row }) => row.line));
  const unmatched = result.unmatched - (withheld.size - shown.size);

  const lines = [
    `inbox: ${total} rows · ${result.matched.length} matched · ${unmatched} unmatched · ${problems.length} unparsed · ${skipped.length} skipped`,
    ...result.matched.map(({ row, matchedBy }) => inboxRowLine(row, matchedBy, withheld.get(row.line) ?? null)),
    ...problems.map((problem) => sanitizeLabel(`unparsed: ${problem.line}: ${problem.message}`)),
    ...skipped.filter((skip) => !shown.has(skip.line)).map((skip) => `skipped: ${skip.line} (${skip.pattern})`),
  ];
  ctx.io.out(`${lines.join("\n")}\n`);

  return {
    exitCode: 0,
    json: {
      inbox: inboxStore.INBOX_PATH,
      total,
      matched: result.matched.map(({ row, matchedBy }) => inboxRowJson(row, matchedBy, withheld.get(row.line) ?? null)),
      counts,
      unmatched,
      problems: problems.map((problem) => ({ line: problem.line, message: sanitizeLabel(problem.message) })),
      skipped,
    },
  };
}

export const ledgerCommand: CommandModule = {
  name: "ledger",
  summary:
    "append findings to a run's ledger, close its rows, print its resume card, and read the deferral inbox (plumbing)",
  hidden: true,
  mutating: true,

  configure(cmd: Command): void {
    cmd
      .addArgument(new Argument("<subcommand>", "which ledger action to run").choices([APPEND, CLOSE, STATUS, INBOX]))
      .option("--run <run-id>", "the run folder's name under .stamity/runs/")
      .option("--phase <phase>", "the phase the rows are filed under, a lowercase slug (review, build)")
      .option("--source <role>", "the role whose findings these are, a lowercase slug (reviewer)")
      .option("--report <path>", "a report inside the run's reports/ folder")
      .option("--stdin", "read the findings block from stdin")
      .option("--ids <ledger-ids>", "the comma-separated ledger ids handed to this re-review")
      .option("--id <ledger-id>", "the one row a manual close or a retirement moves")
      .addOption(
        new Option("--state <state>", "the state a manual close sets").choices([...MANUAL_STATES]),
      )
      .option("--rationale <text>", "why a manual close moves the row, recorded on it")
      .option(
        "--retired <disposition>",
        "retire a deferred row whose inbox row left: keeps its state and records the date and this disposition",
      )
      .option("--paths <paths...>", "the paths a change touches; the inbox rows naming them are printed")
      .option("--plan <path>", "a plan path; the inbox rows whose Ref: or location names it are printed")
      .option("--area <words...>", "whole words matched in an inbox row that names no path");
  },

  async run(ctx, opts, args): Promise<CommandResult> {
    // Commander's `choices()` already refused every other subcommand at parse time.
    const subcommand = args[0] === CLOSE || args[0] === STATUS || args[0] === INBOX ? args[0] : APPEND;
    refuseForeignFlags(subcommand, opts);
    if (subcommand === INBOX) return await runInbox(ctx, opts);
    if (subcommand === STATUS) return await runStatus(ctx, opts);
    return subcommand === CLOSE ? await runClose(ctx, opts) : await runAppend(ctx, opts);
  },
};
