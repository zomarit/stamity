import { closeSync, lstatSync, openSync, readdirSync, readFileSync, readSync, type Dirent } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { INVISIBLE_SMUGGLING_CHARS, normalizeForDenyScan } from "../denyscan/denyScan.ts";
import { SESSION_START_SCREEN } from "../hooks/scripts.ts";
import {
  CARD_FIELD_MAX,
  CARD_LIST_MAX,
  CARD_MAX_CHARS,
  CARD_NEXT_LINE,
  CARD_NOT_RECORDED,
  CARD_RECOVERY_NOTE,
  FENCE_CLOSE_PATTERN,
  FINDINGS_FENCE,
  fenceOpenPattern,
  GIT_METADATA_MAX_BYTES,
  IN_PROGRESS_PATTERN,
  LEDGER_FILE,
  RECORD_FILE,
  RECORD_HEAD_LINES,
  RECORD_HEAD_READ_BYTES,
  RECORD_INVOCATION_PATTERN,
  RECORD_PLAN_PATTERN,
  RECORD_STATUS_PATTERN,
  REPORT_READ_MAX_BYTES,
  REPORTS_DIR,
  RUN_ID_PATTERN,
  RUNS_SEGMENTS,
  UNPRINTABLE_CHARS,
} from "./layout.ts";

/**
 * The resume card, as the engine reads it: the twin of the plain-JS body the
 * session-start hook embeds (`./cardSource.ts`), for `stamity ledger status`
 * on every client, including the ones whose hooks never print it.
 *
 * The two twins must print the same bytes for the same disk, so this file
 * restates the hook's steps rather than inventing its own: synchronous
 * `node:fs` reads only, `lstat` before every read so no symbolic link is
 * followed, every bound and fixed word taken from `./layout.ts`, and every read
 * that fails degrading to less card rather than to an error. The parity suite
 * (`test/runs/resumeCardParity.test.ts`) runs the generated hook and this
 * reader over the same fixtures and compares the lines byte for byte, so a
 * step changed in one twin and not the other goes red there.
 *
 * What this twin adds is only what a command needs and a hook does not: a
 * named run (`runId`), the record head as data, the lists behind the counts,
 * and the number of ledger lines that are not rows, for the command's warning.
 * It never prints a finding's text, and it writes nothing.
 */

/** A run record's head, as the card reads it. */
export interface RecordHead {
  readonly status: string | null;
  readonly inProgress: boolean;
  readonly plan: string | null;
  readonly invocation: string | null;
}

/** One run's card, with the lists behind its counts. */
export interface ResumeCard {
  readonly runId: string;
  readonly inProgress: boolean;
  /** The printed lines: the six card lines, or the one withheld line. */
  readonly lines: readonly string[];
  /** The three lists in full, each item flattened as the card prints it. */
  readonly openRowIds: readonly string[];
  readonly unledgeredReports: readonly string[];
  readonly lanes: readonly string[];
  /** The screen pattern id the card's text matched, or null when it printed. */
  readonly withheld: string | null;
  /**
   * The screen pattern id the three full lists matched, or null. The card
   * names at most CARD_LIST_MAX items of each, so an item past them is screened
   * here, never in `lines`; a caller that echoes the lists checks this first.
   */
  readonly listsWithheld: string | null;
  /** Non-blank ledger lines that are not JSON objects. */
  readonly unreadableLedgerLines: number;
}

const FINDINGS_OPEN = fenceOpenPattern(FINDINGS_FENCE);
const GIT_POINTER = /^gitdir:[ \t]*(.+)$/;
const HEX_HEAD = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const HEADS_PREFIX = "ref: refs/heads/";
const REF_PREFIX = "ref: ";

/**
 * The session-start screen as private copies: a `g`-flagged row carries
 * `lastIndex` between calls, and the engine's own catalog objects are shared
 * with every other scan in the process, so this reader resets its own copies
 * rather than mutating theirs.
 */
const SCREEN: readonly { readonly id: string; readonly re: RegExp }[] = SESSION_START_SCREEN.map((entry) => ({
  id: entry.id,
  re: new RegExp(entry.pattern.source, entry.pattern.flags),
}));

/** A regular file, never through a link. Absent or unreadable reads as not one. */
function regularFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    // ENOENT, EACCES and the rest: none of them is a regular file this card may read.
    return false;
  }
}

/** A real directory, never through a link. Absent or unreadable reads as not one. */
function realDir(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    // ENOENT, EACCES and the rest: none of them is a directory this card may list.
    return false;
  }
}

/** Whether anything, a dangling link included, sits at path. */
function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    // An lstat that fails is nothing at that path, as far as a lane can tell.
    return false;
  }
}

/** A directory's entries, or null when it cannot be listed. */
function listDir(path: string): Dirent[] | null {
  try {
    return readdirSync(path, { withFileTypes: true });
  } catch {
    // A listing that fails lists nothing; the card prints less, never an error.
    return null;
  }
}

/**
 * A git metadata file's text, trimmed: only a regular file (never through a
 * link) of at most GIT_METADATA_MAX_BYTES bytes. Null otherwise, or when unreadable.
 */
function gitText(path: string): string | null {
  try {
    const stats = lstatSync(path);
    if (!stats.isFile() || stats.size > GIT_METADATA_MAX_BYTES) return null;
    return readFileSync(path, "utf8").trim();
  } catch {
    // Absent, unreadable or vanished between the lstat and the read: no git text.
    return null;
  }
}

/**
 * A run record's head: its first RECORD_HEAD_LINES lines, BOM stripped; the
 * first status, plan and invocation line each win.
 */
export function readRecordHead(text: string): RecordHead {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let status: string | null = null;
  let plan: string | null = null;
  let invocation: string | null = null;
  for (const line of body.split(/\r?\n/).slice(0, RECORD_HEAD_LINES)) {
    status ??= RECORD_STATUS_PATTERN.exec(line)?.[1] ?? null;
    plan ??= RECORD_PLAN_PATTERN.exec(line)?.[1] ?? null;
    invocation ??= RECORD_INVOCATION_PATTERN.exec(line)?.[1] ?? null;
  }
  return { status, inProgress: status !== null && IN_PROGRESS_PATTERN.test(status), plan, invocation };
}

/** The record's head from at most RECORD_HEAD_READ_BYTES bytes; null when absent, a link, or unreadable. */
function readRecordHeadFile(path: string): RecordHead | null {
  if (!regularFile(path)) return null;
  let raw: string;
  let fd = -1;
  try {
    fd = openSync(path, "r");
    const buffer = Buffer.alloc(RECORD_HEAD_READ_BYTES);
    let filled = 0;
    while (filled < buffer.length) {
      const read = readSync(fd, buffer, filled, buffer.length - filled, filled);
      if (read === 0) break;
      filled += read;
    }
    raw = buffer.toString("utf8", 0, filled);
  } catch {
    // An open or read that fails leaves the run with no head, so it is never picked.
    return null;
  } finally {
    if (fd !== -1) {
      try {
        closeSync(fd);
      } catch {
        // The bytes are already read; a failed close changes nothing printed.
      }
    }
  }
  return readRecordHead(raw);
}

/** The runs folder under `rootDir`. */
function runsDirOf(rootDir: string): string {
  return join(rootDir, ...RUNS_SEGMENTS);
}

/**
 * The lexicographically greatest run folder whose record head says it is in
 * progress, or null. A linked runs folder, a linked run folder, a name that is
 * not a run id and a record that is a link are all passed over.
 */
export function findInProgressRun(rootDir: string): string | null {
  const runsDir = runsDirOf(rootDir);
  // A linked runs folder is not this repo's runs: nothing in it is read.
  if (!realDir(runsDir)) return null;
  const entries = listDir(runsDir);
  if (entries === null) return null;
  let chosen: string | null = null;
  for (const entry of entries) {
    // A link to a directory is not a directory here: a run is never followed out of the tree.
    if (!entry.isDirectory() || !RUN_ID_PATTERN.test(entry.name)) continue;
    const head = readRecordHeadFile(join(runsDir, entry.name, RECORD_FILE));
    if (head === null || !head.inProgress) continue;
    if (chosen === null || entry.name > chosen) chosen = entry.name;
  }
  return chosen;
}

interface LedgerRead {
  readonly open: string[];
  readonly ledgered: Set<string>;
  readonly unreadable: number;
}

/** Open row ids in file order, every report path a row carries, and the lines that are not rows. */
function readLedger(path: string): LedgerRead {
  const read: LedgerRead = { open: [], ledgered: new Set(), unreadable: 0 };
  if (!regularFile(path)) return read;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    // An unreadable ledger reads as empty: the card says 0 open rows rather than failing.
    return read;
  }
  let unreadable = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      // One torn or hand-mangled line; it is counted, and the rows around it still count.
      unreadable += 1;
      continue;
    }
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      unreadable += 1;
      continue;
    }
    const fields = row as Record<string, unknown>;
    if (typeof fields["id"] === "string" && fields["state"] === "open") read.open.push(fields["id"]);
    if (typeof fields["report"] === "string") read.ledgered.add(fields["report"]);
  }
  return { ...read, unreadable };
}

/** Whether the first findings block holds at least one non-blank line before it closes. */
function hasFindings(raw: string): boolean {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((line) => FINDINGS_OPEN.test(line));
  if (start === -1) return false;
  for (const line of lines.slice(start + 1)) {
    if (FENCE_CLOSE_PATTERN.test(line)) return false;
    if (line.trim() !== "") return true;
  }
  return false;
}

/**
 * Reports that hold findings no ledger row points at, as repo-relative paths.
 * A report too large to read, or one that cannot be read, is listed: its
 * findings cannot be ruled out. A linked reports folder is not read at all.
 */
function unledgeredReports(runDir: string, runId: string, ledgered: ReadonlySet<string>): string[] {
  const reportsDir = join(runDir, REPORTS_DIR);
  if (!realDir(reportsDir)) return [];
  const entries = listDir(reportsDir);
  if (entries === null) return [];
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .toSorted();
  const out: string[] = [];
  for (const name of names) {
    const rel = [...RUNS_SEGMENTS, runId, REPORTS_DIR, name].join("/");
    if (ledgered.has(rel)) continue;
    const path = join(reportsDir, name);
    let size: number;
    try {
      const stats = lstatSync(path);
      if (!stats.isFile()) continue;
      size = stats.size;
    } catch {
      // Gone between the listing and the lstat: nothing left to list.
      continue;
    }
    if (size > REPORT_READ_MAX_BYTES) {
      out.push(rel);
      continue;
    }
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      // Unreadable is not empty: what it holds cannot be ruled out.
      out.push(rel);
      continue;
    }
    if (hasFindings(raw)) out.push(rel);
  }
  return out;
}

/** A worktree HEAD as the branch it names. */
function branchOf(head: string): string {
  if (head.startsWith(HEADS_PREFIX)) return head.slice(HEADS_PREFIX.length);
  if (head.startsWith(REF_PREFIX)) return head.slice(REF_PREFIX.length);
  if (HEX_HEAD.test(head)) return `detached ${head.slice(0, 7)}`;
  return "unknown";
}

/**
 * The git common dir: .git itself when it is a directory, or, when .git is the
 * pointer file a linked worktree carries, the directory it names followed
 * through its commondir. Null when neither holds, or when the pointer or the
 * commondir is a link, too large, or unreadable.
 */
function commonDir(rootDir: string): string | null {
  const dotGit = join(rootDir, ".git");
  let isDirectory: boolean;
  let isFile: boolean;
  try {
    const stats = lstatSync(dotGit);
    isDirectory = stats.isDirectory();
    isFile = stats.isFile();
  } catch {
    // No .git at all (or none this process may see): no lanes.
    return null;
  }
  if (isDirectory) return dotGit;
  if (!isFile) return null;
  const text = gitText(dotGit);
  if (text === null) return null;
  const pointer = GIT_POINTER.exec((text.split(/\r?\n/)[0] ?? "").trim());
  const named = pointer?.[1];
  if (named === undefined) return null;
  const target = named.trim();
  // Git resolves a relative pointer against the directory holding .git.
  const gitDir = isAbsolute(target) ? target : resolve(dirname(dotGit), target);
  // No commondir: the pointer names the common dir itself.
  const commondir = join(gitDir, "commondir");
  if (!exists(commondir)) return resolve(gitDir, "");
  const common = gitText(commondir);
  return common === null ? null : resolve(gitDir, common);
}

/**
 * Linked worktrees as "<path> [<branch>]", sorted. The main checkout is not a
 * lane, and neither is one whose gitdir is empty or names nothing on disk any
 * more: git calls that lane prunable, and it holds no work to resume. A linked
 * worktrees folder is not listed at all.
 */
function lanesOf(rootDir: string): string[] {
  const common = commonDir(rootDir);
  if (common === null) return [];
  const worktrees = join(common, "worktrees");
  if (!realDir(worktrees)) return [];
  const entries = listDir(worktrees);
  if (entries === null) return [];
  const admins = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
  const out: string[] = [];
  for (const name of admins) {
    const admin = join(worktrees, name);
    const gitdir = gitText(join(admin, "gitdir"));
    if (gitdir === null || gitdir === "") continue;
    const target = isAbsolute(gitdir) ? gitdir : resolve(admin, gitdir);
    if (!exists(target)) continue;
    const located = target.replace(/[\\/]\.git$/, "").replaceAll("\\", "/");
    const head = gitText(join(admin, "HEAD"));
    out.push(`${located} [${head === null ? "unknown" : branchOf(head)}]`);
  }
  return out.toSorted();
}

/**
 * One field as one bounded line: control characters to spaces, then the C1
 * controls, bidi controls and zero-width marks dropped (never the tag block,
 * which the screen must still see), whitespace collapsed, capped.
 */
function flat(value: string): string {
  const line = value
    // oxlint-disable-next-line no-control-regex -- turning control bytes into spaces IS the point
    .replace(/[\x00-\x1f\x7f]+/g, " ")
    .replace(UNPRINTABLE_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
  return line.length > CARD_FIELD_MAX ? `${line.slice(0, CARD_FIELD_MAX - 1)}…` : line;
}

/** " (<first k>, … +<rest> more)", or "" for an empty list. */
function listPart(items: readonly string[], k: number): string {
  if (items.length === 0) return "";
  const shown = items.slice(0, k).map(flat);
  if (items.length > k) shown.push(`… +${items.length - k} more`);
  return ` (${shown.join(", ")})`;
}

function renderAt(
  parts: Parameters<typeof renderResumeCard>[0],
  now: Date,
  k: number,
): string[] {
  const plan = flat(parts.plan ?? "");
  const invocation = flat(parts.invocation ?? "");
  return [
    `stamity resume card — run ${parts.runId} (as of ${now.toISOString().slice(0, 16)}Z)`,
    `plan: ${plan === "" ? CARD_NOT_RECORDED : plan}  ·  invocation: ${invocation === "" ? CARD_NOT_RECORDED : invocation}`,
    `ledger: ${parts.openRowIds.length} open rows${listPart(parts.openRowIds, k)}  ·  ${CARD_RECOVERY_NOTE}`,
    `reports without a ledger row: ${parts.unledgeredReports.length}${listPart(parts.unledgeredReports, k)}`,
    `lanes: ${parts.lanes.length}${listPart(parts.lanes, k)}`,
    CARD_NEXT_LINE,
  ];
}

/**
 * The six card lines, every list shrunk from CARD_LIST_MAX items down until the
 * joined text fits CARD_MAX_CHARS; with every list at zero it always does.
 */
export function renderResumeCard(
  parts: {
    readonly runId: string;
    readonly plan: string | null;
    readonly invocation: string | null;
    readonly openRowIds: readonly string[];
    readonly unledgeredReports: readonly string[];
    readonly lanes: readonly string[];
  },
  now: Date,
): string[] {
  let lines: string[] = [];
  for (let k = CARD_LIST_MAX; k >= 0; k -= 1) {
    lines = renderAt(parts, now, k);
    if (lines.join("\n").length <= CARD_MAX_CHARS) break;
  }
  return lines;
}

/**
 * The first session-start screen id, in list order, whose pattern matches the
 * raw text, the text with invisible smuggling characters stripped, or the
 * normalized form of the stripped text; "" when none does. The same union the
 * hook scans, so a card the hook withholds is withheld here too.
 */
export function screenCard(text: string): string {
  const stripped = text.replace(INVISIBLE_SMUGGLING_CHARS, "");
  const copies = [text, stripped, normalizeForDenyScan(stripped)];
  const hit = SCREEN.find((entry) =>
    copies.some((copy) => {
      entry.re.lastIndex = 0;
      return entry.re.test(copy);
    }),
  );
  return hit === undefined ? "" : hit.id;
}

/**
 * The resume card of a run, recomputed from disk. With no `runId`, the run in
 * progress (the greatest by name), or null when none is; with one, that run
 * whether or not it is in progress, or null when it is not a real run folder
 * under a real runs folder.
 */
export function collectResumeCard(opts: {
  readonly rootDir: string;
  readonly runId?: string;
  readonly now: Date;
}): ResumeCard | null {
  const runsDir = runsDirOf(opts.rootDir);
  if (!realDir(runsDir)) return null;
  const runId = opts.runId ?? findInProgressRun(opts.rootDir);
  if (runId === null || !RUN_ID_PATTERN.test(runId)) return null;
  const runDir = join(runsDir, runId);
  if (!realDir(runDir)) return null;

  const head = readRecordHeadFile(join(runDir, RECORD_FILE));
  const ledger = readLedger(join(runDir, LEDGER_FILE));
  const unledgered = unledgeredReports(runDir, runId, ledger.ledgered);
  const lanes = lanesOf(opts.rootDir);

  const card = renderResumeCard(
    {
      runId,
      plan: head?.plan ?? null,
      invocation: head?.invocation ?? null,
      openRowIds: ledger.open,
      unledgeredReports: unledgered,
      lanes,
    },
    opts.now,
  );
  const withheld = screenCard(card.join("\n"));
  const openRowIds = ledger.open.map(flat);
  const reports = unledgered.map(flat);
  const laneItems = lanes.map(flat);
  const listsWithheld = screenCard([...openRowIds, ...reports, ...laneItems].join("\n"));
  const lines =
    withheld === ""
      ? card
      : [
          `stamity resume card — run ${runId} withheld: its text matched screen pattern ${withheld}; ${CARD_RECOVERY_NOTE}`,
        ];
  return {
    runId,
    inProgress: head?.inProgress ?? false,
    lines,
    openRowIds,
    unledgeredReports: reports,
    lanes: laneItems,
    withheld: withheld === "" ? null : withheld,
    listsWithheld: listsWithheld === "" ? null : listsWithheld,
    unreadableLedgerLines: ledger.unreadable,
  };
}
