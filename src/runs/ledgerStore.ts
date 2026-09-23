import { constants as FS, type Stats } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { acquireWriteLock, atomicWriteFileUnlocked } from "../merge/atomicWrite.ts";
import { EngineError } from "../types/errors.ts";
import type { Finding, FindingSeverity } from "./blocks.ts";
import {
  isRunId,
  LEDGER_FILE,
  REPORT_NAME_PATTERN,
  REPORT_READ_MAX_BYTES,
  REPORTS_DIR,
  RUN_ID_PATTERN,
  RUNS_SEGMENTS,
  runRelPath,
} from "./layout.ts";

/**
 * The run ledger's one serialized writer (C3, C7): where a run folder is, which
 * report paths belong to it, how the next row id is numbered, and the append
 * that turns a parsed findings block into `open` rows.
 *
 * **The existing bytes are never rewritten.** An append reads the ledger under
 * the engine's write lock (`acquireWriteLock`, a lock directory beside the file
 * that goes stale after 15 s), keeps every byte already there — legacy rows
 * spelled with `", "` spacing, a hand-edited line that is not a row — and adds
 * its rows after them, then lands the whole text through the temp-and-rename
 * writer. A reader sees the old ledger or the new one, never half of each, and
 * two appends on one run queue rather than interleave, so their id ranges are
 * disjoint.
 *
 * **Every stored path is a POSIX literal** built by `runRelPath` from validated
 * segments, so a row written on Windows reads the same as one written anywhere
 * else; real filesystem paths are composed with `node:path`.
 *
 * **Nothing is followed through a link.** A report path is refused when any of
 * its five segments under the repository root is a symbolic link, the ledger is
 * refused when it is one, and the reports folder's ignore file is created with
 * an exclusive create that fails rather than writing through a planted link.
 */

/**
 * One ledger row. Only `id` is verified as a string by {@link parseLedgerText};
 * every other field is what the line holds, and the full shape of a committed
 * ledger is the records gate's to check (`test/records/ledgers.test.ts`).
 */
export interface LedgerRow {
  readonly id: string;
  readonly phase: string;
  readonly source: string;
  readonly severity: string;
  readonly evidence: string;
  readonly state: string;
  readonly rationale: string;
  readonly retired?: string;
  readonly report?: string;
  readonly decision_needed?: true;
}

export interface ParsedLedger {
  /** The text's lines, their EOLs removed; a final EOL leaves no empty last line. */
  readonly lines: readonly string[];
  /** CRLF when the first line ends `\r\n`. */
  readonly eol: "\n" | "\r\n";
  /** Rows keyed by 0-based line. */
  readonly rows: ReadonlyMap<number, LedgerRow>;
  /** 1-based lines that are non-blank but not an object carrying a string `id`. */
  readonly unreadable: readonly number[];
}

/** Read a ledger's text into its lines and rows. Never throws on a bad line. */
export function parseLedgerText(text: string): ParsedLedger {
  const eol = /^[^\n]*\r\n/.test(text) ? "\r\n" : "\n";
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  if (text.endsWith("\n") || text === "") lines.pop();
  const rows = new Map<number, LedgerRow>();
  const unreadable: number[] = [];
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (cause) {
      // Not a row. Kept byte for byte by every writer and reported by line, so
      // the cause is not carried: the line number is what a person fixes.
      void cause;
      unreadable.push(index + 1);
      continue;
    }
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof (value as { id?: unknown }).id === "string"
    ) {
      rows.set(index, value as LedgerRow);
    } else {
      unreadable.push(index + 1);
    }
  }
  return { lines, eol, rows, unreadable };
}

/** A `--phase` or `--source` value: the vocabulary a ledger id segment admits. */
export const LEDGER_SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;

function refuseRunId(runId: string): EngineError {
  return new EngineError(`${JSON.stringify(runId)} is not a run id`, {
    code: "VALIDATION_ERROR",
    why: `a run id matches ${RUN_ID_PATTERN.source}`,
  });
}

/** The real path of a run folder. Throws on a value that is not a run id. */
export function runDir(rootDir: string, runId: string): string {
  if (!isRunId(runId)) throw refuseRunId(runId);
  return join(rootDir, ...RUNS_SEGMENTS, runId);
}

/** `lstat`, with a missing entry as `null` rather than a throw. */
async function lstatOrNull(path: string): Promise<Stats | null> {
  try {
    return await lstat(path);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw cause;
  }
}

/**
 * The run folder, as a real directory reached through no link. A missing folder
 * and one reached through a symbolic link are the same refusal: neither is a run
 * folder this command may write into.
 */
export async function requireRunDir(rootDir: string, runId: string): Promise<string> {
  const dir = runDir(rootDir, runId);
  const refusal = (why: string): EngineError =>
    new EngineError(`there is no run folder ${runRelPath(runId)}/`, {
      code: "VALIDATION_ERROR",
      why,
      next: "name a run that exists under .stamity/runs/, or create its folder at the run's Frame step",
    });
  let walked = rootDir;
  for (const segment of [...RUNS_SEGMENTS, runId]) {
    walked = join(walked, segment);
    // eslint-disable-next-line no-await-in-loop -- top-down on purpose: the first bad segment is the one named
    const stats = await lstatOrNull(walked);
    if (stats === null) throw refusal(`${segment} does not exist`);
    if (stats.isSymbolicLink()) throw refusal(`${segment} is a symbolic link`);
    if (!stats.isDirectory()) throw refusal(`${segment} is not a directory`);
  }
  return dir;
}

/** A link where the reports folder or its ignore file should be. */
function linkedIgnoreRefusal(what: string): EngineError {
  return new EngineError(`${what} is a symbolic link; the run's reports cannot be kept out of git`, {
    code: "FS_ERROR",
    next: `replace ${what} with a real ${what.endsWith(".gitignore") ? "file" : "folder"}, then re-run`,
  });
}

/** The one line a run's `reports/.gitignore` holds: ignore everything in it. */
const REPORTS_IGNORE_TEXT = "*\n";

/**
 * Make sure the run's `reports/` folder exists and carries a `.gitignore`
 * holding exactly `*`, so a report is never committed whatever the repository's
 * root `.gitignore` says (plan resolution R20: a consumer repository's root file
 * is not the engine's to edit).
 *
 * Created when absent; an existing regular file is left byte for byte as it is,
 * whatever it says, because the Frame step or a person may have written it. A
 * symbolic link at `reports/` or at the ignore file is refused: git does not
 * follow a linked `.gitignore`, so a link there would leave reports tracked
 * while this function reported them ignored.
 */
export async function ensureReportsIgnore(rootDir: string, runId: string): Promise<void> {
  const reports = join(runDir(rootDir, runId), REPORTS_DIR);
  const relReports = runRelPath(runId, REPORTS_DIR);

  const folder = await lstatOrNull(reports);
  if (folder === null) {
    try {
      await mkdir(reports);
    } catch (cause) {
      // A concurrent append made it first; the lstat below judges what is there.
      if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
    }
  }
  const made = await lstat(reports);
  if (made.isSymbolicLink()) throw linkedIgnoreRefusal(relReports);
  if (!made.isDirectory()) {
    throw new EngineError(`${relReports} is not a folder`, {
      code: "FS_ERROR",
      next: `move that file aside so ${relReports}/ can hold the run's reports, then re-run`,
    });
  }

  const ignorePath = join(reports, ".gitignore");
  const existing = await lstatOrNull(ignorePath);
  if (existing?.isSymbolicLink() === true) throw linkedIgnoreRefusal(`${relReports}/.gitignore`);
  if (existing !== null) return;
  try {
    // O_CREAT | O_EXCL: fails on anything already at the name, a link included,
    // so this never writes through one planted between the lstat and here.
    await writeFile(ignorePath, REPORTS_IGNORE_TEXT, { flag: "wx" });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
    // A concurrent append wrote it first; judge what landed like any other.
    if ((await lstat(ignorePath)).isSymbolicLink()) throw linkedIgnoreRefusal(`${relReports}/.gitignore`);
  }
}

export interface ResolvedReport {
  /** The real path the text was read from. */
  readonly absolute: string;
  /** `.stamity/runs/<run>/reports/<name>`, POSIX, whatever the spelling given. */
  readonly relative: string;
  readonly text: string;
}

/** Whether `child` is one plain segment directly inside `parent`. */
function directlyInside(parent: string, child: string): string | null {
  const rel = relative(parent, child);
  if (rel === "" || isAbsolute(rel) || /[\\/]/.test(rel) || rel === "..") return null;
  return rel;
}

/**
 * Resolve a `--report` value to a report of this run and read it.
 *
 * A relative value is taken against the repository root, with either separator
 * (a Windows `.stamity\runs\…` spelling resolves the same as the POSIX one); an
 * absolute value must land directly inside the run's `reports/`, spelled either
 * through the root as given or through its real path (a temp root under a
 * linked `/var` is the common case). The name must be a C1 report name, each of
 * the five segments under the root must be a real entry rather than a link, and
 * the leaf a regular file of at most {@link REPORT_READ_MAX_BYTES}.
 */
export async function resolveReportPath(
  rootDir: string,
  runId: string,
  given: string,
): Promise<ResolvedReport> {
  const refuse = (reason: string): EngineError =>
    new EngineError(`--report ${given} is not a report of run ${runId}: ${reason}`, {
      code: "VALIDATION_ERROR",
      next: `name a file directly inside ${runRelPath(runId, REPORTS_DIR)}/, or pipe the block with --stdin`,
    });

  if (given.split(/[\\/]+/).includes("..")) throw refuse('it has a ".." segment');
  const spelled = isAbsolute(given) ? given : given.replaceAll("\\", "/");
  const resolved = resolve(rootDir, spelled);
  const expected = join(runDir(rootDir, runId), REPORTS_DIR);
  let name = directlyInside(expected, resolved);
  if (name === null && isAbsolute(given)) {
    const realRoot = await realpath(rootDir);
    name = directlyInside(join(realRoot, ...RUNS_SEGMENTS, runId, REPORTS_DIR), resolved);
  }
  if (name === null) {
    throw refuse(`it is not directly inside ${runRelPath(runId, REPORTS_DIR)}/`);
  }
  if (!REPORT_NAME_PATTERN.test(name)) {
    throw refuse(
      "its name is not <pass>-<role>-r<N>.md (a name starting report, summary, findings or analysis is refused by Claude Code)",
    );
  }

  let walked = rootDir;
  let leaf: Stats | null = null;
  for (const segment of [...RUNS_SEGMENTS, runId, REPORTS_DIR, name]) {
    walked = join(walked, segment);
    // eslint-disable-next-line no-await-in-loop -- top-down on purpose: the first bad segment is the one named
    leaf = await lstatOrNull(walked);
    if (leaf === null) throw refuse("it does not exist");
    if (leaf.isSymbolicLink()) throw refuse(`${segment} is a symbolic link`);
  }
  if (leaf === null || !leaf.isFile()) throw refuse("it is not a regular file");
  if (leaf.size > REPORT_READ_MAX_BYTES) throw refuse(`it is over ${REPORT_READ_MAX_BYTES} bytes`);

  // O_NOFOLLOW where the platform has it (0 on Windows): a leaf swapped for a
  // link after the walk above is refused by the open rather than read through.
  const handle = await open(walked, FS.O_RDONLY | (FS.O_NOFOLLOW ?? 0));
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) throw refuse("it is not a regular file");
    if (stats.size > REPORT_READ_MAX_BYTES) {
      throw refuse(`it is over ${REPORT_READ_MAX_BYTES} bytes`);
    }
    const text = await handle.readFile({ encoding: "utf8" });
    return { absolute: walked, relative: runRelPath(runId, REPORTS_DIR, name), text };
  } finally {
    await handle.close();
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The next row number of a run and phase: the numeric maximum of `N` over ids
 * spelled `<run>/<phase>/<N>`, plus one; 1 when none match. Numeric, not
 * lexical, so `review/10` counts above `review/9`.
 */
export function nextRowNumber(
  rows: Iterable<{ readonly id: string }>,
  runId: string,
  phase: string,
): number {
  const pattern = new RegExp(`^${escapeRegExp(runId)}/${escapeRegExp(phase)}/([1-9][0-9]*)$`);
  let highest = 0;
  for (const row of rows) {
    const match = pattern.exec(row.id);
    if (match?.[1] !== undefined) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}

export interface AppendedRow {
  readonly ledgerId: string;
  readonly severity: FindingSeverity;
  /** The finding's id inside its report (`C-1`, `W-2`, …). */
  readonly localId: string;
  readonly decisionNeeded: boolean;
}

export interface AppendResult {
  /** The ledger's repo-relative POSIX path. */
  readonly ledger: string;
  readonly rows: readonly AppendedRow[];
  /** 1-based ledger lines that are not rows; kept as they are. */
  readonly unreadableLines: readonly number[];
}

/** The ledger text, or `""` when the ledger does not exist yet. A link is refused. */
async function readLedger(path: string, relPath: string): Promise<string> {
  const stats = await lstatOrNull(path);
  if (stats === null) return "";
  if (!stats.isFile()) {
    throw new EngineError(`${relPath} is not a regular file`, {
      code: "FS_ERROR",
      why: stats.isSymbolicLink()
        ? "it is a symbolic link, and the ledger is written in place, never through a link"
        : "the ledger is one JSON row per line in a regular file",
      next: `replace ${relPath} with the ledger file itself, then re-run`,
    });
  }
  return await readFile(path, "utf8");
}

/**
 * An id read back from the ledger file as a refusal may print it: line breaks
 * and tabs become spaces, and control bytes, the bidi controls and the
 * zero-width marks are dropped. The ledger is a committed file anyone can edit,
 * so an id carrying an escape sequence would otherwise reach the operator's
 * terminal raw. The rule `../cli/kit/prompts.ts::sanitizeLabel` applies,
 * restated here because the engine never imports the CLI layer.
 */
function printableId(id: string): string {
  return id
    .replace(/[\r\n\t]/gu, " ")
    // oxlint-disable-next-line no-control-regex -- stripping control bytes IS the point
    .replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠⁦-⁩﻿]/gu, "");
}

/**
 * Append one `open` row per finding to the run's ledger, under its write lock.
 *
 * Refuses a report the ledger already carries rows from, naming them, so a
 * retried append cannot file the same findings twice. Zero findings take no lock
 * and touch no file but the reports folder's ignore file. A dry run reads,
 * numbers and returns the rows it would append, and writes nothing at all — not
 * the ignore file either, because its line says nothing was written.
 */
export async function appendFindings(req: {
  readonly rootDir: string;
  readonly runId: string;
  readonly phase: string;
  readonly source: string;
  readonly findings: readonly Finding[];
  readonly report: string | null;
  readonly dryRun: boolean;
}): Promise<AppendResult> {
  const dir = runDir(req.rootDir, req.runId);
  const ledgerRel = runRelPath(req.runId, LEDGER_FILE);
  if (!req.dryRun) await ensureReportsIgnore(req.rootDir, req.runId);
  if (req.findings.length === 0) return { ledger: ledgerRel, rows: [], unreadableLines: [] };

  const ledgerPath = join(dir, LEDGER_FILE);
  const release = req.dryRun ? null : await acquireWriteLock(ledgerPath, dir);
  try {
    const existing = await readLedger(ledgerPath, ledgerRel);
    const parsed = parseLedgerText(existing);
    const held = [...parsed.rows.values()];

    if (req.report !== null) {
      const already = held.filter((row) => row.report === req.report).map((row) => row.id);
      if (already.length > 0) {
        throw new EngineError(
          `ledger append refused ${req.report}: the ledger already carries rows from this report (${already.map(printableId).join(", ")})`,
          {
            code: "VALIDATION_ERROR",
            next: "close or amend those rows instead; a report is appended once",
          },
        );
      }
    }

    const first = nextRowNumber(held, req.runId, req.phase);
    const rows: AppendedRow[] = [];
    const lines: string[] = [];
    for (const [offset, finding] of req.findings.entries()) {
      const ledgerId = `${req.runId}/${req.phase}/${first + offset}`;
      lines.push(
        JSON.stringify({
          id: ledgerId,
          phase: req.phase,
          source: req.source,
          severity: finding.severity,
          evidence: `${finding.locator} — ${finding.summary}`,
          state: "open",
          rationale: "",
          ...(req.report === null ? {} : { report: req.report }),
          ...(finding.decisionNeeded ? { decision_needed: true } : {}),
        }),
      );
      rows.push({
        ledgerId,
        severity: finding.severity,
        localId: finding.id,
        decisionNeeded: finding.decisionNeeded,
      });
    }

    if (!req.dryRun) {
      const head = existing === "" || existing.endsWith("\n") ? existing : existing + parsed.eol;
      const text = head + lines.join(parsed.eol) + parsed.eol;
      await atomicWriteFileUnlocked(ledgerPath, text, { boundaryDir: dir });
    }
    return { ledger: ledgerRel, rows, unreadableLines: parsed.unreadable };
  } finally {
    await release?.();
  }
}
