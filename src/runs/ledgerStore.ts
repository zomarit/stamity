import { constants as FS, type Stats } from "node:fs";
import { lstat, mkdir, open, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { acquireWriteLock, atomicWriteFileUnlocked, isSharedRegularFile } from "../merge/atomicWrite.ts";
import { EngineError } from "../types/errors.ts";
import { parseDisposition, SCHEDULE_RULE_FROM } from "./disposition.ts";
import {
  editInboxText,
  INBOX_PATH,
  parseInbox,
  SCHEDULE_RULE_HEADING,
  type InboxEditOutcome,
  type InboxEditProblem,
} from "./inboxStore.ts";
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
  LEDGER_READ_MAX_BYTES,
  RATIONALE_MAX,
  REPORT_NAME_PATTERN,
  REPORT_READ_MAX_BYTES,
  REPORTS_DIR,
  RUN_ID_PATTERN,
  RUNS_SEGMENTS,
  runRelPath,
  UNICODE_TAG_CHARS,
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
  /**
   * The finding already had a row, so none was appended: `ledgerId` names that
   * existing row, and `severity` and `decisionNeeded` are that row's own. Only a report-less (`--stdin`) append sets it; see
   * {@link appendFindings}.
   */
  readonly alreadyFiled: boolean;
}

export interface AppendResult {
  /** The ledger's repo-relative POSIX path. */
  readonly ledger: string;
  readonly rows: readonly AppendedRow[];
  /** 1-based ledger lines that are not rows; kept as they are. */
  readonly unreadableLines: readonly number[];
  /** Ids of rows whose locator or summary carried Unicode tag characters, stripped before the write. */
  readonly tagsStripped: readonly string[];
}

/**
 * Report or caller text as a row records it — a finding's locator and summary,
 * a closure's rationale, a manual `--rationale`: stripped by
 * {@link printableText}, then of the Unicode tag block, which printableText
 * keeps for the screens and no screen reads before the row is written.
 * `tagged` says the second strip removed something.
 */
export function committedText(text: string): { readonly text: string; readonly tagged: boolean } {
  const printable = printableText(text);
  const stripped = printable.replace(UNICODE_TAG_CHARS, "");
  return { text: stripped, tagged: stripped !== printable };
}

/**
 * The ledger text, or `""` when the ledger does not exist yet. A link is
 * refused, and so is a ledger over {@link LEDGER_READ_MAX_BYTES}, the bound the
 * resume card and the inbox write read the same file under. The open is
 * no-follow where the platform has it, the type and size are asked again of the
 * open descriptor, and the read takes at most the bound plus one byte, so a
 * ledger swapped or grown after the `lstat` is refused too.
 */
async function readLedger(path: string, relPath: string): Promise<string> {
  const notFile = (stats: Stats): EngineError =>
    new EngineError(`${relPath} is not a regular file`, {
      code: "FS_ERROR",
      why: stats.isSymbolicLink()
        ? "it is a symbolic link, and the ledger is written in place, never through a link"
        : "the ledger is one JSON row per line in a regular file",
      next: `replace ${relPath} with the ledger file itself, then re-run`,
    });
  const tooLarge = (): EngineError =>
    new EngineError(`${relPath} is over the ${LEDGER_READ_MAX_BYTES} byte read ceiling`, {
      code: "FS_ERROR",
      why: "the ledger is read whole before every append and close, so its size is bounded",
      next: `move the closed rows of ${relPath} out by hand until it is under the ceiling, then re-run`,
    });
  const stats = await lstatOrNull(path);
  if (stats === null) return "";
  if (!stats.isFile()) throw notFile(stats);
  if (stats.size > LEDGER_READ_MAX_BYTES) throw tooLarge();

  const handle = await open(path, FS.O_RDONLY | (FS.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw notFile(opened);
    if (opened.size > LEDGER_READ_MAX_BYTES) throw tooLarge();
    const bytes = Buffer.alloc(LEDGER_READ_MAX_BYTES + 1);
    let filled = 0;
    while (filled < bytes.length) {
      // eslint-disable-next-line no-await-in-loop -- one descriptor read in order: each read starts where the last one ended
      const { bytesRead } = await handle.read(bytes, filled, bytes.length - filled, null);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    if (filled > LEDGER_READ_MAX_BYTES) throw tooLarge();
    return bytes.toString("utf8", 0, filled);
  } finally {
    await handle.close();
  }
}

/** A row an `already-filed` line describes: its id and its own flags, never the incoming finding's. */
interface FiledRow {
  readonly id: string;
  readonly severity: FindingSeverity;
  readonly decisionNeeded: boolean;
}

function isFindingSeverity(value: unknown): value is FindingSeverity {
  return value === "Critical" || value === "Warning" || value === "Minor";
}

/**
 * The existing rows a report-less append matches its findings against: each
 * `evidence` string of a row of this run filed under `phase` and `source`,
 * mapped to those rows in row order. A row whose id is not of this run (a
 * hand-planted foreign row, which `ledger close` would refuse by that id), whose
 * evidence is not a string, or whose severity is not one a finding carries
 * matches nothing, so every match is a row this run can close and print as it is.
 */
function filedEvidence(
  held: readonly LedgerRow[],
  runId: string,
  phase: string,
  source: string,
): Map<string, FiledRow[]> {
  const ownRun = `${runId}/`;
  const filed = new Map<string, FiledRow[]>();
  for (const row of held) {
    if (row.phase !== phase || row.source !== source || typeof row.evidence !== "string") continue;
    if (!row.id.startsWith(ownRun) || !isFindingSeverity(row.severity)) continue;
    const entry = { id: row.id, severity: row.severity, decisionNeeded: row.decision_needed === true };
    const rows = filed.get(row.evidence);
    if (rows === undefined) filed.set(row.evidence, [entry]);
    else rows.push(entry);
  }
  return filed;
}

/**
 * Append one `open` row per finding to the run's ledger, under its write lock.
 *
 * Refuses a report the ledger already carries rows from, naming them, so a
 * retried append cannot file the same findings twice. A report-less (`--stdin`)
 * append names no report to refuse, so it matches each finding instead
 * (REQ-CTX-005): a finding whose phase, source and stored evidence
 * (`<locator> — <summary>`, after the same strip a row gets) equal an existing
 * row's is not appended, and comes back `alreadyFiled` under that row's id,
 * with that row's own severity and `decision_needed` — the incoming finding's
 * may differ, and the row, not the block, is what a close or a sign-off reads.
 * Matching is one-to-one in row order — the k-th finding carrying one evidence
 * string names the k-th row carrying it — and a finding with no such row left
 * is appended, so a re-piped block files nothing and names each original id
 * once. Only rows already in the ledger are matched, never the block's own
 * earlier findings, and the ledger is read under the lock, so two concurrent
 * appends of one block file it once. Zero findings take no lock
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
  if (req.findings.length === 0) return { ledger: ledgerRel, rows: [], unreadableLines: [], tagsStripped: [] };

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

    // A report-less append's matches; a report's repeats were refused above.
    const filed =
      req.report === null ? filedEvidence(held, req.runId, req.phase, req.source) : new Map<string, FiledRow[]>();
    let next = nextRowNumber(held, req.runId, req.phase);
    const rows: AppendedRow[] = [];
    const lines: string[] = [];
    const tagsStripped: string[] = [];
    for (const finding of req.findings) {
      const locator = committedText(finding.locator);
      const summary = committedText(finding.summary);
      // Stripped before the row is built: the ledger is committed and diffed,
      // so a bidi override or a line separator would spoof the line it lands on,
      // and a tag-block payload would return to context with the open rows.
      const evidence = `${locator.text} — ${summary.text}`;
      const match = filed.get(evidence)?.shift();
      if (match !== undefined) {
        rows.push({
          ledgerId: match.id,
          severity: match.severity,
          localId: finding.id,
          decisionNeeded: match.decisionNeeded,
          alreadyFiled: true,
        });
        continue;
      }
      const shared = { severity: finding.severity, localId: finding.id, decisionNeeded: finding.decisionNeeded };
      const ledgerId = `${req.runId}/${req.phase}/${next}`;
      next += 1;
      if (locator.tagged || summary.tagged) tagsStripped.push(ledgerId);
      lines.push(
        JSON.stringify({
          id: ledgerId,
          phase: req.phase,
          source: req.source,
          severity: finding.severity,
          evidence,
          state: "open",
          rationale: "",
          ...(req.report === null ? {} : { report: req.report }),
          ...(finding.decisionNeeded ? { decision_needed: true } : {}),
        }),
      );
      rows.push({ ledgerId, ...shared, alreadyFiled: false });
    }

    // Every finding already filed: nothing to add, so the ledger is not rewritten.
    if (!req.dryRun && lines.length > 0) {
      const head = existing === "" || existing.endsWith("\n") ? existing : existing + parsed.eol;
      const text = head + lines.join(parsed.eol) + parsed.eol;
      await atomicWriteFileUnlocked(ledgerPath, text, { boundaryDir: dir });
    }
    return { ledger: ledgerRel, rows, unreadableLines: parsed.unreadable, tagsStripped };
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

/**
 * The `--id` of a manual close or a retirement, read through
 * {@link qualifyLedgerId} (REQ-CTX-008): `<phase>/<n>` names this run's row,
 * and an id naming another run is refused before the lock is taken.
 */
function ownLedgerId(runId: string, given: string): string {
  const qualified = qualifyLedgerId(runId, given);
  if (qualified.foreignRun !== null) {
    throw new EngineError(
      `ledger close refused: --id names ${printableText(cutReportText(given))}, a row of run ${qualified.foreignRun}, not ${runId}`,
      {
        code: "VALIDATION_ERROR",
        why: "a close moves only the rows of the run it names, so no row changed",
        next: `name a row of ${runId}, or close the other run's row with its own --run`,
      },
    );
  }
  return qualified.id;
}

/** The next step of an `--id` that is not a row: either spelling of a ledger id. */
const NOT_A_ROW_NEXT = "name a ledger id as `ledger append` printed it, or its short form <phase>/<n>";

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
  /** A retirement's `retired` value, the one written or the one already there; absent on any other change. */
  readonly retired?: string;
}

export interface CloseResult {
  /** The ledger's repo-relative POSIX path. */
  readonly ledger: string;
  /** One entry per applied closure, in block order, or the one manual transition. */
  readonly changes: readonly CloseChange[];
  /** 1-based ledger lines that are not rows; kept as they are. */
  readonly unreadableLines: readonly number[];
  /** Ids of rows written with a rationale or disposition that carried Unicode tag characters, stripped first. */
  readonly tagsStripped: readonly string[];
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
  /** Rewritten rows whose rationale had Unicode tag characters stripped. */
  readonly tagsStripped?: readonly string[];
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
    const { changes, rewrites, tagsStripped = [] } = decide(parsed, ledgerRel);
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
    return { ledger: ledgerRel, changes, unreadableLines: parsed.unreadable, tagsStripped };
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
    return { ledger: runRelPath(req.runId, LEDGER_FILE), changes: [], unreadableLines: [], tagsStripped: [] };
  }
  return await rewriteRows(req, (parsed, ledgerRel) => {
    const indexOf = rowIndex(parsed);
    const problems: BlockProblem[] = [];
    const changes: CloseChange[] = [];
    const rewrites = new Map<number, LedgerRow>();
    const closedAt = new Map<string, number>();
    const tagsStripped: string[] = [];
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
      // The parser already stripped and bounded it; the tag block goes here, where the row is written.
      const reason = closure.rationale === null ? null : committedText(closure.rationale);
      const reasonText = reason?.text.trim() ?? "";
      if (reason?.tagged === true) tagsStripped.push(ledgerId);
      const recorded = reasonText === "" ? note : `${note} — ${reasonText}`;
      rewrites.set(index, { ...row, state: to, rationale: extendRationale(prior, recorded) });
      changes.push({ ledgerId, from, to, status, unchanged: false });
    }
    if (problems.length > 0) throw new ClosuresRefused(req.report, problems);
    return { changes, rewrites, tagsStripped };
  });
}

/**
 * Apply one manual transition (`ledger close --id`): set `state` and append
 * the rationale — stripped by `committedText` (printableText, then the Unicode
 * tag block), then trimmed, before the cap and the write — by the same rule as
 * a closure's note. Any prior state
 * may move; an id that is not a row is refused, and a row already in `state`
 * whose rationale carries the text is `unchanged`. The id is read through
 * {@link qualifyLedgerId}, so `<phase>/<n>` names this run's row and an id of
 * another run is refused; the change names the row by its full id.
 */
export async function closeRow(req: {
  readonly rootDir: string;
  readonly runId: string;
  readonly ledgerId: string;
  readonly state: ManualState;
  readonly rationale: string;
  readonly dryRun: boolean;
}): Promise<CloseResult> {
  const cleaned = committedText(req.rationale);
  const text = cleaned.text.trim();
  const length = Array.from(text).length;
  if (text === "" || length > RATIONALE_MAX) {
    throw new EngineError(
      `ledger close --id needs a non-empty --rationale of at most ${RATIONALE_MAX} characters; this one is ${length} characters`,
      {
        code: "VALIDATION_ERROR",
        why: "a manual transition is the one ledger move no report explains, so its reason is recorded on the row",
      },
    );
  }
  const ledgerId = ownLedgerId(req.runId, req.ledgerId);
  return await rewriteRows(req, (parsed, ledgerRel) => {
    const index = rowIndex(parsed).get(ledgerId);
    const row = index === undefined ? undefined : parsed.rows.get(index);
    if (index === undefined || row === undefined) {
      throw new EngineError(
        `ledger close refused: ${printableText(cutReportText(ledgerId))} is not a row of ${ledgerRel}`,
        { code: "VALIDATION_ERROR", next: NOT_A_ROW_NEXT },
      );
    }
    const from = fieldText(row, "state");
    const prior = fieldText(row, "rationale");
    if (from === req.state && prior.includes(text)) {
      return {
        changes: [{ ledgerId, from, to: from, status: null, unchanged: true }],
        rewrites: new Map(),
      };
    }
    return {
      changes: [{ ledgerId, from, to: req.state, status: null, unchanged: false }],
      rewrites: new Map([[index, { ...row, state: req.state, rationale: extendRationale(prior, text) }]]),
      tagsStripped: cleaned.tagged ? [ledgerId] : [],
    };
  });
}

/** The date half of a `retired` value: the UTC calendar day of `now`, `YYYY-MM-DD`. */
function retiredDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** A `retired` value's disposition: the text after its leading date, or the whole value without one. */
function retiredDisposition(value: string): string {
  return value.replace(/^\d{4}-\d{2}-\d{2}\s+/, "");
}

/** What a refused retirement names as the next step: the grammar's three shapes. */
const RETIRE_NEXT = "write fixed <ref>, cut <reason>, or scheduled <place> · by <YYYY-MM-DD> | when <trigger>";

/**
 * Retire one `deferred` row whose inbox row left (`ledger close --id --retired`,
 * REQ-FLOW-024): the row keeps its state and gains the optional `retired`
 * field, `<UTC YYYY-MM-DD of now> <disposition>`, the shape the records gate
 * reads. The disposition is stripped by `committedText`, trimmed and capped as a
 * manual close's rationale is. `now` is the caller's clock, so the date is
 * testable and never read off the wall here.
 *
 * From {@link SCHEDULE_RULE_FROM} (UTC, by `now`) a new value must also parse
 * under the schedule rule's grammar (REQ-FLOW-076, `./disposition.ts`): `fixed
 * <ref>`, `cut <reason>`, or `scheduled <place> · by <YYYY-MM-DD> | when
 * <trigger>`; anything else is refused with the grammar's problem and nothing
 * is written. The check runs after the `unchanged` answer, so a re-run of a
 * value recorded before the cutover still reads as `unchanged`.
 *
 * Only a `deferred` row is retired; an id that is not a row is refused, and
 * the id is read as a manual close reads it (`<phase>/<n>` names this run's
 * row, an id of another run is refused). A row
 * whose `retired` value already states this disposition is `unchanged`, on a
 * later day too, so a re-run never re-dates a retirement; a row retired with
 * another disposition is refused, naming the value it carries. Every other
 * line stays byte for byte, through the same lock, ignore file and writer as a
 * manual close — an earlier run's missing `reports/.gitignore` included.
 */
export async function retireRow(req: {
  readonly rootDir: string;
  readonly runId: string;
  readonly ledgerId: string;
  readonly disposition: string;
  readonly now: Date;
  readonly dryRun: boolean;
}): Promise<CloseResult> {
  const cleaned = committedText(req.disposition);
  const text = cleaned.text.trim();
  if (text === "" || Array.from(text).length > RATIONALE_MAX) {
    throw new EngineError(
      `ledger close --retired needs a non-empty disposition of at most ${RATIONALE_MAX} characters`,
      {
        code: "VALIDATION_ERROR",
        why: "a retirement records what happened to the deferral — fixed in a commit, cut with a reason, or scheduled — beside its date",
        next: `${RETIRE_NEXT}, in at most ${RATIONALE_MAX} characters`,
      },
    );
  }
  const value = `${retiredDate(req.now)} ${text}`;
  const ledgerId = ownLedgerId(req.runId, req.ledgerId);
  return await rewriteRows(req, (parsed, ledgerRel) => {
    const index = rowIndex(parsed).get(ledgerId);
    const row = index === undefined ? undefined : parsed.rows.get(index);
    const shown = printableText(cutReportText(ledgerId));
    if (index === undefined || row === undefined) {
      throw new EngineError(`ledger close refused: ${shown} is not a row of ${ledgerRel}`, {
        code: "VALIDATION_ERROR",
        next: NOT_A_ROW_NEXT,
      });
    }
    const from = fieldText(row, "state");
    if (from !== "deferred") {
      throw new EngineError(
        `ledger close refused: ${shown} is ${printableText(cutReportText(from))}, not deferred; only a deferred row is retired`,
        {
          code: "VALIDATION_ERROR",
          why: "`retired` records when a deferral's inbox row left; a row in any other state has no inbox row",
          next: "close the row with --state and --rationale instead",
        },
      );
    }
    const prior: unknown = row.retired;
    if (prior !== undefined) {
      const recorded = typeof prior === "string" ? prior : String(JSON.stringify(prior));
      if (retiredDisposition(recorded) === text) {
        return {
          changes: [{ ledgerId, from, to: from, status: null, unchanged: true, retired: recorded }],
          rewrites: new Map(),
        };
      }
      throw new EngineError(
        `ledger close refused: ${shown} is already retired (${printableText(cutReportText(recorded))})`,
        {
          code: "VALIDATION_ERROR",
          why: "a deferral leaves the inbox once, so its retirement is recorded once",
          next: "leave the row as it is; its `retired` value already states how the deferral left",
        },
      );
    }
    if (retiredDate(req.now) >= SCHEDULE_RULE_FROM) {
      const grammar = parseDisposition(text);
      if (!grammar.ok) {
        throw new EngineError(`ledger close --retired refused: ${grammar.problem}`, {
          code: "VALIDATION_ERROR",
          why: `from ${SCHEDULE_RULE_FROM} a retirement names how the deferral left: fixed, cut, or scheduled to a place with a date or a trigger`,
          next: RETIRE_NEXT,
        });
      }
    }
    return {
      changes: [{ ledgerId, from, to: from, status: null, unchanged: false, retired: value }],
      rewrites: new Map([[index, { ...row, retired: value }]]),
      tagsStripped: cleaned.tagged ? [ledgerId] : [],
    };
  });
}

/**
 * An inbox write at least one of whose rows or removals cannot apply. Carries
 * every problem, each placed among the rows, the removals or the inbox's own
 * lines ({@link InboxEditProblem}), so the caller lists them the way it lists
 * a block that does not parse; nothing was written. No message quotes a row's
 * text, a `Ref:` value or a path a `Ref:` names, beyond a handed row's own
 * parse message, which the caller has screened before this is reached.
 */
export class InboxWriteRefused extends EngineError {
  readonly problems: readonly InboxEditProblem[];

  constructor(problems: readonly InboxEditProblem[]) {
    super(`ledger inbox-write refused: ${problems.length} problem(s), so nothing was written`, {
      code: "VALIDATION_ERROR",
      next: "fix the rows or the removals named, then re-run the write",
    });
    this.problems = problems;
  }
}

/**
 * One bullet of the block an inbox write lands its rows in, as the file reads
 * after the edit: its 1-based line, its text without the line end, and, for a
 * row this write appends, that row's `Ref:` (null for a bullet already there).
 */
export interface InboxLandingBullet {
  readonly line: number;
  readonly text: string;
  readonly appended: string | null;
}

/**
 * The bullets of the block the appended rows land in, as `text` reads after
 * the edit: from the nearest line above the first appended row that is
 * neither a bullet nor blank (the block's head, or the heading) to the end of
 * the file. Empty when nothing is appended.
 */
function landingBlock(text: string, outcomes: readonly InboxEditOutcome[]): InboxLandingBullet[] {
  const appended = new Map(outcomes.flatMap((outcome) => (outcome.kind === "appended" ? [[outcome.line, outcome.ref] as const] : [])));
  if (appended.size === 0) return [];
  const lines = text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  let start = Math.min(...appended.keys()) - 1;
  while (start > 0 && (lines[start - 1]?.startsWith("- ") === true || lines[start - 1]?.trim() === "")) start -= 1;
  return lines.slice(start).flatMap((line, offset) => {
    if (!line.startsWith("- ")) return [];
    const at = start + offset + 1;
    return [{ line: at, text: line, appended: appended.get(at) ?? null }];
  });
}

export interface InboxWriteResult {
  /** The inbox's repo-relative POSIX path. */
  readonly inbox: string;
  /** The edit's outcomes: removals, then the heading where it was added, then each row in the order handed in. */
  readonly outcomes: readonly InboxEditOutcome[];
}

/** The states a ledger row is in by the close's grammar, which a refusal may name as they are. */
const KNOWN_STATES: ReadonlySet<string> = new Set(["open", "fixed", "rejected", "deferred"]);

/** A `Ref:` naming a row of a run's ledger: `.stamity/runs/<run id>/ledger.jsonl#<row id>`. */
const LEDGER_REF = new RegExp(`^${escapeRegExp(`${RUNS_SEGMENTS.join("/")}/`)}([^/#]+)/${escapeRegExp(LEDGER_FILE)}#(.+)$`);

/** A ledger as {@link writeInbox} reads it: its rows, none at all, or the reason it is refused. */
type HeldLedger = { readonly rows: readonly LedgerRow[] } | { readonly refused: string };

/**
 * One run's ledger, read by the inbox read's no-follow, size-bounded rules
 * (review/55): each folder from the repository root to the run's must be a
 * real directory, and the ledger a regular file with one link, so neither a
 * symbolic link nor a hard link is read through, of at most
 * {@link LEDGER_READ_MAX_BYTES}, the bound the resume card reads the same file
 * under. The open is no-follow where the platform has it, the type, the link
 * count and the size are asked again of the open descriptor, and the read
 * takes at most the bound plus one byte from it, so a ledger swapped or grown
 * after the checks is refused too. A missing folder or ledger holds no rows.
 * The refusal names no path, since the run id came from a row's `Ref:`. This
 * read is the inbox write's own; `ledger append` and `ledger close` keep
 * {@link readLedger}.
 */
async function heldLedger(rootDir: string, runId: string): Promise<HeldLedger> {
  let walked = rootDir;
  for (const segment of [...RUNS_SEGMENTS, runId]) {
    walked = join(walked, segment);
    // eslint-disable-next-line no-await-in-loop -- top-down on purpose: the first bad segment is the one refused
    const stats = await lstatOrNull(walked);
    if (stats === null) return { rows: [] };
    if (stats.isSymbolicLink()) return { refused: "is reached through a folder that is a symbolic link" };
    if (!stats.isDirectory()) return { refused: "is reached through a path that is not a folder" };
  }
  const path = join(walked, LEDGER_FILE);
  const unreadable = (stats: Stats): string | null => {
    if (stats.isSymbolicLink()) return "is a symbolic link";
    if (!stats.isFile()) return "is not a regular file";
    if (isSharedRegularFile(stats)) return "is a hard link";
    if (stats.size > LEDGER_READ_MAX_BYTES) return `is over the ${LEDGER_READ_MAX_BYTES} byte read ceiling`;
    return null;
  };
  const leaf = await lstatOrNull(path);
  if (leaf === null) return { rows: [] };
  const refused = unreadable(leaf);
  if (refused !== null) return { refused };

  const handle = await open(path, FS.O_RDONLY | (FS.O_NOFOLLOW ?? 0));
  try {
    const opened = unreadable(await handle.stat());
    if (opened !== null) return { refused: opened };
    const bytes = Buffer.alloc(LEDGER_READ_MAX_BYTES + 1);
    let filled = 0;
    while (filled < bytes.length) {
      // eslint-disable-next-line no-await-in-loop -- one descriptor read in order: each read starts where the last one ended
      const { bytesRead } = await handle.read(bytes, filled, bytes.length - filled, null);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    if (filled > LEDGER_READ_MAX_BYTES) return { refused: `is over the ${LEDGER_READ_MAX_BYTES} byte read ceiling` };
    return { rows: [...parseLedgerText(bytes.toString("utf8", 0, filled)).rows.values()] };
  } finally {
    await handle.close();
  }
}

/**
 * The ledger cross-check of one inbox write (REQ-FLOW-078): every appended
 * row's `Ref:` and every removal's, against the ledgers they name, read once
 * each. An appended row's ledger `Ref:` names an existing `deferred` row with
 * no `retired` value, in any run's ledger; a `Ref:` that is no ledger row's is
 * appended only as a re-date, removed in the same call. A removal's ledger row
 * is no longer `deferred`, or carries `retired`, unless the call re-appends its
 * `Ref:`; a removal naming a row that is not there leaves a dangling bullet,
 * and is admitted.
 */
async function ledgerProblems(
  rootDir: string,
  rows: readonly string[],
  remove: readonly string[],
): Promise<InboxEditProblem[]> {
  const ledgers = new Map<string, HeldLedger>();
  const ledgerOf = async (runId: string): Promise<HeldLedger> => {
    const known = ledgers.get(runId);
    if (known !== undefined) return known;
    const read = await heldLedger(rootDir, runId);
    ledgers.set(runId, read);
    return read;
  };
  /** The row a ledger `Ref:` names, null where it names none, a string where its ledger is refused; undefined for no ledger `Ref:`. */
  const rowOf = async (ref: string): Promise<LedgerRow | null | string | undefined> => {
    const match = LEDGER_REF.exec(ref);
    if (match === null || !isRunId(match[1] ?? "")) return undefined;
    const ledger = await ledgerOf(match[1] ?? "");
    if ("refused" in ledger) return ledger.refused;
    return ledger.rows.find((row) => row.id === match[2]) ?? null;
  };

  const problems: InboxEditProblem[] = [];
  const removed = new Set(remove);
  // Handed rows are read below the heading, as the edit reads them: line k + 1 is row k.
  const handed = parseInbox([SCHEDULE_RULE_HEADING, ...rows.map((row) => (/[\r\n]/.test(row) ? "" : row))].join("\n")).rows;
  const appended = new Set(handed.flatMap((row) => (row.ref === null ? [] : [row.ref])));
  for (const row of handed) {
    if (row.ref === null) continue;
    const at = row.line - 1;
    // eslint-disable-next-line no-await-in-loop -- one ledger read per run, cached; the rows are few
    const named = await rowOf(row.ref);
    if (named === undefined) {
      if (!removed.has(row.ref)) {
        problems.push({
          where: "row",
          line: at,
          message: "names a `Ref:` that is not a ledger row, which only a re-date in the same call (`--remove` of that `Ref:`) may append",
        });
      }
    } else if (typeof named === "string") {
      problems.push({ where: "row", line: at, message: `the ledger its \`Ref:\` names ${named}` });
    } else if (named === null) {
      problems.push({ where: "row", line: at, message: "the ledger row its `Ref:` names is not a row of that ledger" });
    } else if (named.state !== "deferred") {
      const state = typeof named.state === "string" && KNOWN_STATES.has(named.state) ? `${named.state}, ` : "";
      problems.push({
        where: "row",
        line: at,
        message: `the ledger row its \`Ref:\` names is ${state}not deferred; only a deferral is filed in the inbox`,
      });
    } else if (named.retired !== undefined) {
      problems.push({
        where: "row",
        line: at,
        message: "the ledger row its `Ref:` names is already retired, so its deferral has left the inbox",
      });
    }
  }
  for (const [index, ref] of [...removed].entries()) {
    if (appended.has(ref)) continue;
    // eslint-disable-next-line no-await-in-loop -- one ledger read per run, cached; the removals are few
    const named = await rowOf(ref);
    if (typeof named === "string") {
      problems.push({ where: "remove", line: index + 1, message: `the ledger it names ${named}` });
    } else if (named !== null && named !== undefined && named.state === "deferred" && named.retired === undefined) {
      problems.push({
        where: "remove",
        line: index + 1,
        message: "the ledger row it names is still deferred and not retired; retire it with `ledger close --retired` first, or re-append its `Ref:` in the same call",
      });
    }
  }
  return problems;
}

/**
 * The ledgers one inbox write's `Ref:` values name — its rows' and its
 * removals' — that it locks (S25): each as its file and its run folder, sorted
 * by the file's path, so two writes take them in one order. A run whose
 * folders are not all real directories down from the repository root is left
 * out: {@link heldLedger} reads no rows there, or refuses the ledger, and a
 * lock would make a folder or follow a link.
 */
async function referencedLedgers(
  rootDir: string,
  rows: readonly string[],
  remove: readonly string[],
): Promise<{ readonly path: string; readonly dir: string }[]> {
  const handed = parseInbox([SCHEDULE_RULE_HEADING, ...rows.map((row) => (/[\r\n]/.test(row) ? "" : row))].join("\n")).rows;
  const runIds = new Set<string>();
  for (const ref of [...handed.flatMap((row) => (row.ref === null ? [] : [row.ref])), ...remove]) {
    const runId = LEDGER_REF.exec(ref)?.[1] ?? "";
    if (isRunId(runId)) runIds.add(runId);
  }
  const ledgers: { path: string; dir: string }[] = [];
  for (const runId of runIds) {
    let walked = rootDir;
    let real = true;
    for (const segment of [...RUNS_SEGMENTS, runId]) {
      walked = join(walked, segment);
      // eslint-disable-next-line no-await-in-loop -- top-down on purpose: a link at any folder leaves the run out
      const stats = await lstatOrNull(walked);
      if (stats === null || stats.isSymbolicLink() || !stats.isDirectory()) {
        real = false;
        break;
      }
    }
    if (real) ledgers.push({ path: join(walked, LEDGER_FILE), dir: walked });
  }
  return ledgers.toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The deferral inbox's one engine write (`stamity ledger inbox-write`,
 * REQ-FLOW-078): append the rows handed in, remove the bullets the removal
 * `Ref:` values name, both in one locked, atomic write, and create an absent
 * inbox holding the heading and the rows (S9). The edit is
 * {@link editInboxText}'s; this adds the reads and the write around it.
 *
 * `read` is the caller's no-follow reader of the inbox — null for an absent
 * file, a throw for a link, a hard link or an oversized file — handed in as
 * `isShared` is to the query, so the refusal is worded where it prints. It
 * runs once before the lock, so a link is refused before a lock is made
 * beside it, and again under the lock, whose text is the one edited. The lock
 * and the write stay inside `.stamity/`: `acquireWriteLock` takes a lock on a
 * path that does not exist yet, and `atomicWriteFileUnlocked` lands the text
 * by temp-and-rename, so a planted link at the name is replaced, never
 * written through.
 *
 * After the inbox's lock, the write takes the lock of each ledger a `Ref:`
 * names ({@link referencedLedgers}), in path order, and holds them until the
 * inbox has landed (S25): the ledger cross-check reads each referenced row
 * under its ledger's lock, so a concurrent `ledger close` cannot move it
 * between that check and the write. Nothing takes the inbox's lock while
 * holding a ledger's, so the order forms no cycle. A ledger lock that cannot
 * be taken refuses the call, naming no path, since the run came from a
 * `Ref:`.
 *
 * All or nothing: the ledger cross-check ({@link ledgerProblems}) and the
 * edit's own problems are gathered, and any one refuses the call with all of
 * them ({@link InboxWriteRefused}). `screen` is the caller's screen of the
 * block the rows land in, read as the edited text holds it ({@link
 * landingBlock}), under the lock, so the bullets already in that block are
 * read beside the new ones; any problem it returns refuses the call too. A
 * text over `maxBytes` is refused, so the query can still read what the write
 * leaves. A dry run reads and answers as a write would, takes no lock, and
 * writes nothing.
 */
export async function writeInbox(req: {
  readonly rootDir: string;
  readonly runId: string;
  readonly rows: readonly string[];
  readonly remove: readonly string[];
  readonly today: string;
  readonly maxBytes: number;
  readonly dryRun: boolean;
  readonly read: () => Promise<string | null>;
  readonly screen?: (block: readonly InboxLandingBullet[]) => readonly InboxEditProblem[];
}): Promise<InboxWriteResult> {
  if (!isRunId(req.runId)) throw refuseRunId(req.runId);
  const stateDir = join(req.rootDir, RUNS_SEGMENTS[0]);
  const inboxPath = join(req.rootDir, ...INBOX_PATH.split("/"));
  await req.read();
  const release = req.dryRun ? null : await acquireWriteLock(inboxPath, stateDir);
  const ledgerReleases: (() => Promise<void>)[] = [];
  try {
    if (!req.dryRun) {
      for (const ledger of await referencedLedgers(req.rootDir, req.rows, req.remove)) {
        try {
          // eslint-disable-next-line no-await-in-loop -- one at a time, in path order, so two writes never cross
          ledgerReleases.push(await acquireWriteLock(ledger.path, ledger.dir));
        } catch (cause) {
          throw new EngineError("ledger inbox-write refused: the lock on a ledger a `Ref:` names could not be taken, so nothing was written", {
            code: "VALIDATION_ERROR",
            why: "the write reads each referenced ledger row under that ledger's lock, so a concurrent close cannot move it before the inbox lands",
            next: "re-run the write once the other ledger write has finished; if it is refused again, check the run folders' lock names for a planted link",
            cause,
          });
        }
      }
    }
    const text = await req.read();
    const problems = await ledgerProblems(req.rootDir, req.rows, req.remove);
    const edit = editInboxText(text, { rows: req.rows, remove: req.remove, runId: req.runId, today: req.today });
    if ("problems" in edit) problems.push(...edit.problems);
    if (problems.length > 0 || "problems" in edit) throw new InboxWriteRefused(problems);
    const screened = req.screen?.(landingBlock(edit.text, edit.outcomes)) ?? [];
    if (screened.length > 0) throw new InboxWriteRefused(screened);
    const bytes = Buffer.byteLength(edit.text, "utf8");
    if (bytes > req.maxBytes) {
      throw new EngineError(
        `ledger inbox-write refused ${INBOX_PATH}: the write would make it ${bytes} bytes, over the ${req.maxBytes} byte ceiling`,
        {
          code: "VALIDATION_ERROR",
          why: "the inbox query reads at most that much, so a larger inbox could no longer be read",
          next: "remove the rows that have left first, then re-run the write",
        },
      );
    }
    const changed = edit.outcomes.some((outcome) => outcome.kind !== "already-filed");
    if (!req.dryRun && changed) await atomicWriteFileUnlocked(inboxPath, edit.text, { boundaryDir: stateDir });
    return { inbox: INBOX_PATH, outcomes: edit.outcomes };
  } finally {
    // eslint-disable-next-line no-await-in-loop -- released in the reverse of the order taken
    for (const releaseLedger of ledgerReleases.toReversed()) await releaseLedger();
    await release?.();
  }
}
