import { constants as FS, type Stats } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { acquireWriteLock, atomicWriteFileUnlocked } from "../merge/atomicWrite.ts";
import { EngineError } from "../types/errors.ts";
import {
  cutReportText,
  printableText,
  quoteReportText,
  type BlockProblem,
  type Closure,
  type ClosureStatus,
  type Finding,
  type FindingSeverity,
} from "./blocks.ts";
import {
  isRunId,
  LEDGER_FILE,
  RATIONALE_MAX,
  REPORT_NAME_PATTERN,
  REPORT_READ_MAX_BYTES,
  REPORTS_DIR,
  RUN_ID_PATTERN,
  RUNS_SEGMENTS,
  runRelPath,
} from "./layout.ts";

/**
 * The run ledger's one serialized writer (C3, C7): where a run folder is, which
 * report paths belong to it, how the next row id is numbered, the append that
 * turns a parsed findings block into `open` rows, and the close that moves rows
 * on a re-review's closures (C9) or one manual transition.
 *
 * **An append never rewrites the existing bytes.** It reads the ledger under
 * the engine's write lock (`acquireWriteLock`, a lock directory beside the file
 * that goes stale after 15 s), keeps every byte already there — legacy rows
 * spelled with `", "` spacing, a hand-edited line that is not a row — and adds
 * its rows after them, then lands the whole text through the temp-and-rename
 * writer. A reader sees the old ledger or the new one, never half of each, and
 * two appends on one run queue rather than interleave, so their id ranges are
 * disjoint. **A close rewrites only the rows it moves**, each re-stringified
 * with its key order and every other key kept and its own line end; every other
 * line stays byte for byte, through the same lock and the same writer.
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
    new EngineError(`--report ${printableText(given)} is not a report of run ${runId}: ${reason}`, {
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
          `ledger append refused ${req.report}: the ledger already carries rows from this report (${already.map(printableText).join(", ")})`,
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
          // Stripped before the row is built: the ledger is committed and diffed,
          // so a bidi override or a line separator would spoof the line it lands on.
          evidence: `${printableText(finding.locator)} — ${printableText(finding.summary)}`,
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

/** A ledger id's short form, `<phase>/<n>`, as a re-review may spell it. */
const SHORT_LEDGER_ID = new RegExp(`^${LEDGER_SLUG_PATTERN.source.slice(1, -1)}/[1-9][0-9]*$`);

/**
 * A ledger id as `ledger close` matches it: `<phase>/<n>` qualified with the
 * run's id (C7, ledger row build/264), any other spelling as given. `foreignRun`
 * names the run an id belongs to when that is not this run, which refuses the
 * whole close rather than leaving a row of this run unmatched.
 */
export function qualifyLedgerId(
  runId: string,
  given: string,
): { readonly id: string; readonly foreignRun: string | null } {
  if (SHORT_LEDGER_ID.test(given)) return { id: `${runId}/${given}`, foreignRun: null };
  const slash = given.indexOf("/");
  const named = slash < 0 ? "" : given.slice(0, slash);
  return { id: given, foreignRun: isRunId(named) && named !== runId ? named : null };
}

/** Where each closure status leaves its row (C9). */
export const CLOSURE_TARGET: Readonly<Record<ClosureStatus, "fixed" | "rejected" | "open">> = {
  fixed: "fixed",
  "not-fixed": "open",
  regressed: "open",
  "rejection-upheld": "rejected",
  "rejection-overturned": "open",
};

/** The states a manual close (`ledger close --id`) may set. */
export type ManualState = "fixed" | "rejected" | "deferred";

export interface CloseChange {
  readonly ledgerId: string;
  readonly from: string;
  readonly to: string;
  /** The closure's status; `null` for a manual transition. */
  readonly status: ClosureStatus | null;
  /** The row already records this closure or transition; nothing moved. */
  readonly unchanged: boolean;
}

export interface CloseResult {
  /** The ledger's repo-relative POSIX path. */
  readonly ledger: string;
  /** One entry per applied closure, in block order, or the one manual transition. */
  readonly changes: readonly CloseChange[];
  /** 1-based ledger lines that are not rows; kept as they are. */
  readonly unreadableLines: readonly number[];
}

/**
 * A closures block at least one of whose closures cannot apply. Carries every
 * problem, each at the report line of its closure, so the caller lists them
 * the way it lists a block that does not parse; nothing was written.
 *
 * The messages quote report text cut at 60 code points but are not stripped
 * of control characters: that is the render site's job, as for a parse refusal.
 */
export class ClosuresRefused extends EngineError {
  readonly problems: readonly BlockProblem[];

  constructor(report: string, problems: readonly BlockProblem[]) {
    super(
      `ledger close refused ${report}: ${problems.length} closure(s) cannot apply, so no row changed`,
      {
        code: "VALIDATION_ERROR",
        next: "fix the closures named, or the --ids handed, then re-run the close",
      },
    );
    this.problems = problems;
  }
}

/** A row field as text: a string as it is, anything else as its JSON spelling. */
function fieldText(row: LedgerRow, key: "state" | "rationale"): string {
  const value: unknown = row[key];
  if (typeof value === "string") return value;
  return value === undefined ? "" : String(JSON.stringify(value));
}

/** `text` appended to a rationale: alone when the prior one is blank, else after ` | `. */
function extendRationale(prior: string, text: string): string {
  return prior.trim() === "" ? text : `${prior} | ${text}`;
}

/** Each row id's 0-based line; the first line wins when a hand-edit repeats an id. */
function rowIndex(parsed: ParsedLedger): ReadonlyMap<string, number> {
  const index = new Map<string, number>();
  for (const [line, row] of parsed.rows) if (!index.has(row.id)) index.set(row.id, line);
  return index;
}

interface RowRewrite {
  readonly changes: readonly CloseChange[];
  /** New row objects keyed by 0-based line. */
  readonly rewrites: ReadonlyMap<number, LedgerRow>;
}

/**
 * The close's one write path, shared by both forms: the same ignore file, lock,
 * link refusal and temp-and-rename writer as an append. `decide` reads the
 * parsed ledger and names the rows to rewrite, or throws to refuse the whole
 * close; only the named lines change, each keeping its own line end (`\r\n` in
 * a CRLF file), and no write happens when nothing moved.
 */
async function rewriteRows(
  req: { readonly rootDir: string; readonly runId: string; readonly dryRun: boolean },
  decide: (parsed: ParsedLedger, ledgerRel: string) => RowRewrite,
): Promise<CloseResult> {
  const dir = runDir(req.rootDir, req.runId);
  const ledgerRel = runRelPath(req.runId, LEDGER_FILE);
  if (!req.dryRun) await ensureReportsIgnore(req.rootDir, req.runId);

  const ledgerPath = join(dir, LEDGER_FILE);
  const release = req.dryRun ? null : await acquireWriteLock(ledgerPath, dir);
  try {
    const existing = await readLedger(ledgerPath, ledgerRel);
    const parsed = parseLedgerText(existing);
    const { changes, rewrites } = decide(parsed, ledgerRel);
    if (!req.dryRun && rewrites.size > 0) {
      // The same split as parseLedgerText's, so indices agree; each raw line
      // keeps its trailing `\r`, and a final EOL (or its absence) is untouched.
      const raw = existing.split("\n");
      for (const [index, row] of rewrites) {
        const ending = (raw[index] ?? "").endsWith("\r") ? "\r" : "";
        raw[index] = JSON.stringify(row) + ending;
      }
      await atomicWriteFileUnlocked(ledgerPath, raw.join("\n"), { boundaryDir: dir });
    }
    return { ledger: ledgerRel, changes, unreadableLines: parsed.unreadable };
  } finally {
    await release?.();
  }
}

/**
 * Apply a re-review's closures block (C9) to the run's ledger, under its lock.
 *
 * `handedIds` are the ledger ids the re-review was handed (`--ids`, plan
 * resolution R38). A closure is refused when its id was not handed — checked
 * first, so no row, a `decision_needed` one included, is moved by a closure its
 * re-review was not asked about — when its id is not a row, or when its row is
 * neither `open` nor a `fixed` row taking `regressed`. Any refusal refuses the
 * whole close with every problem listed ({@link ClosuresRefused}) and nothing
 * written. A row whose rationale already carries the closure's note
 * (`re-review <status>: <report>`) and whose state is already the closure's
 * target is `unchanged`, so a re-run is a no-op; a note already there on a row
 * in any other state — a stale re-run after a later re-review reopened it, or a
 * hand-planted note — is refused, because the closure cannot hold. An applied
 * closure appends its note, then ` — <rationale>` when it carries one; the note
 * alone is the idempotency key. A handed id with no closure is left as it is.
 * Every id, handed or closed, is read through {@link qualifyLedgerId} first:
 * `<phase>/<n>` names this run's row, and an id naming another run refuses the
 * whole close; one row closed through both spellings is refused as a repeat.
 */
export async function applyClosures(req: {
  readonly rootDir: string;
  readonly runId: string;
  readonly closures: readonly Closure[];
  readonly handedIds: readonly string[];
  readonly report: string;
  readonly dryRun: boolean;
}): Promise<CloseResult> {
  const handed = new Set<string>();
  for (const given of req.handedIds) {
    const qualified = qualifyLedgerId(req.runId, given);
    if (qualified.foreignRun !== null) {
      throw new EngineError(
        `ledger close refused: --ids names ${printableText(cutReportText(given))}, a row of run ${qualified.foreignRun}, not ${req.runId}`,
        {
          code: "VALIDATION_ERROR",
          why: "a close moves only the rows of the run it names, so no row changed",
          next: `hand only rows of ${req.runId}, or close the other run's rows with its own --run`,
        },
      );
    }
    handed.add(qualified.id);
  }
  if (req.closures.length === 0) {
    runDir(req.rootDir, req.runId);
    if (!req.dryRun) await ensureReportsIgnore(req.rootDir, req.runId);
    return { ledger: runRelPath(req.runId, LEDGER_FILE), changes: [], unreadableLines: [] };
  }
  return await rewriteRows(req, (parsed, ledgerRel) => {
    const indexOf = rowIndex(parsed);
    const problems: BlockProblem[] = [];
    const changes: CloseChange[] = [];
    const rewrites = new Map<number, LedgerRow>();
    const closedAt = new Map<string, number>();
    for (const closure of req.closures) {
      const { status, line } = closure;
      const qualified = qualifyLedgerId(req.runId, closure.ledgerId);
      if (qualified.foreignRun !== null) {
        problems.push({
          line,
          message: `ledger_id ${quoteReportText(closure.ledgerId)} names run ${qualified.foreignRun}, not ${req.runId}; a close moves only its own run's rows`,
        });
        continue;
      }
      const ledgerId = qualified.id;
      const earlier = closedAt.get(ledgerId);
      if (earlier !== undefined) {
        // The parser refuses one spelling twice; this is the same row through its two spellings.
        problems.push({
          line,
          message: `ledger_id ${quoteReportText(closure.ledgerId)} is ${cutReportText(ledgerId)}, which line ${earlier} already closes`,
        });
        continue;
      }
      closedAt.set(ledgerId, line);
      if (!handed.has(ledgerId)) {
        problems.push({
          line,
          message: `ledger_id ${quoteReportText(ledgerId)} was not handed to this re-review (not in --ids)`,
        });
        continue;
      }
      const index = indexOf.get(ledgerId);
      const row = index === undefined ? undefined : parsed.rows.get(index);
      if (index === undefined || row === undefined) {
        problems.push({
          line,
          message: `ledger_id ${quoteReportText(ledgerId)} is not a row of ${ledgerRel}`,
        });
        continue;
      }
      const note = `re-review ${status}: ${req.report}`;
      const from = fieldText(row, "state");
      const prior = fieldText(row, "rationale");
      const to = CLOSURE_TARGET[status];
      if (prior.includes(note)) {
        if (from === to) {
          changes.push({ ledgerId, from, to: from, status, unchanged: true });
        } else {
          problems.push({
            line,
            message: `${cutReportText(ledgerId)} is ${cutReportText(from)}, not ${to}, but its rationale already records ${note}; a closure is applied once`,
          });
        }
        continue;
      }
      if (from !== "open" && !(from === "fixed" && status === "regressed")) {
        problems.push({
          line,
          message: `${cutReportText(ledgerId)} is ${cutReportText(from)}, not open; only an open row takes a closure (a regressed closure also reopens a fixed row)`,
        });
        continue;
      }
      const recorded = closure.rationale === null ? note : `${note} — ${closure.rationale}`;
      rewrites.set(index, { ...row, state: to, rationale: extendRationale(prior, recorded) });
      changes.push({ ledgerId, from, to, status, unchanged: false });
    }
    if (problems.length > 0) throw new ClosuresRefused(req.report, problems);
    return { changes, rewrites };
  });
}

/**
 * Apply one manual transition (`ledger close --id`): set `state` and append
 * the rationale — stripped by `printableText`, then trimmed, before the cap and
 * the write — by the same rule as a closure's note. Any prior state
 * may move; an id that is not a row is refused, and a row already in `state`
 * whose rationale carries the text is `unchanged`.
 */
export async function closeRow(req: {
  readonly rootDir: string;
  readonly runId: string;
  readonly ledgerId: string;
  readonly state: ManualState;
  readonly rationale: string;
  readonly dryRun: boolean;
}): Promise<CloseResult> {
  const text = printableText(req.rationale).trim();
  if (text === "" || Array.from(text).length > RATIONALE_MAX) {
    throw new EngineError(
      `ledger close --id needs a non-empty --rationale of at most ${RATIONALE_MAX} characters`,
      {
        code: "VALIDATION_ERROR",
        why: "a manual transition is the one ledger move no report explains, so its reason is recorded on the row",
      },
    );
  }
  return await rewriteRows(req, (parsed, ledgerRel) => {
    const index = rowIndex(parsed).get(req.ledgerId);
    const row = index === undefined ? undefined : parsed.rows.get(index);
    if (index === undefined || row === undefined) {
      throw new EngineError(
        `ledger close refused: ${printableText(cutReportText(req.ledgerId))} is not a row of ${ledgerRel}`,
        {
          code: "VALIDATION_ERROR",
          next: "name a ledger id exactly as `ledger append` printed it",
        },
      );
    }
    const from = fieldText(row, "state");
    const prior = fieldText(row, "rationale");
    if (from === req.state && prior.includes(text)) {
      return {
        changes: [{ ledgerId: req.ledgerId, from, to: from, status: null, unchanged: true }],
        rewrites: new Map(),
      };
    }
    return {
      changes: [{ ledgerId: req.ledgerId, from, to: req.state, status: null, unchanged: false }],
      rewrites: new Map([[index, { ...row, state: req.state, rationale: extendRationale(prior, text) }]]),
    };
  });
}
