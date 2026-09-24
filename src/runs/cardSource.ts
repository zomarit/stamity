import {
  CARD_FIELD_MAX,
  CARD_LEDGER_UNREADABLE,
  CARD_LIST_MAX,
  CARD_MAX_CHARS,
  CARD_NEXT_LINE,
  CARD_NOT_RECORDED,
  CARD_NOT_REPORT_NAMED,
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
  REPORT_NAME_PATTERN,
  REPORT_READ_MAX_BYTES,
  REPORTS_DIR,
  RUN_ID_PATTERN,
  RUNS_SEGMENTS,
  UNPRINTABLE_CHARS,
} from "./layout.ts";

/**
 * The resume card, as plain JavaScript a generated hook embeds.
 *
 * A session that was compacted mid-run has lost the run's working state from
 * its context, and the disk still holds all of it: the run record's head names
 * the plan and the command, the ledger holds the open findings, the reports
 * folder holds any report whose findings never reached the ledger, and the git
 * common dir lists the lanes. The card reads those four places and prints
 * counts and pointers — never a finding's text — so the resumed session knows
 * where to look before it dispatches anything.
 *
 * Returned as source rather than called, because a hook is a standalone module
 * with no import of the engine to reach for. The body is a function of its
 * arguments and the disk; it spawns nothing (a lane is read off the git common
 * dir with `node:fs`, not by asking git), writes nothing, and every read that
 * fails degrades to less card rather than to a failed session start.
 *
 * The host supplies the names in {@link RESUME_CARD_HOST_NAMES} through its own
 * import lines, plus `screenHit(text)`: the session-start screen, returning the
 * first matching pattern id or `""`. The card is screened whole, and a hit
 * replaces it with one line naming the pattern — the text that matched is never
 * printed, the same rule the loader's skip lines follow.
 *
 * Every constant comes from `./layout.ts` through `JSON.stringify`, regexes as
 * their source and flags, so this copy and the engine's own reader cannot hold
 * two values for one bound.
 */

/** The `node:fs` and `node:path` names the embedded body calls, for the host's import lines. */
export const RESUME_CARD_HOST_NAMES: { readonly fs: readonly string[]; readonly path: readonly string[] } = {
  fs: ["closeSync", "lstatSync", "openSync", "readFileSync", "readSync", "readdirSync"],
  path: ["dirname", "isAbsolute", "join", "resolve"],
};

function json(value: unknown): string {
  return JSON.stringify(value);
}

/** A regex as a constructor call over its own source and flags. */
function regex(pattern: RegExp): string {
  return `new RegExp(${json(pattern.source)}, ${json(pattern.flags)})`;
}

/**
 * The card's source text. Declares `resumeCardLines(rootDir, stateRoot, nowMs)`,
 * which returns the card's lines, or `null` when no run is in progress. Every
 * top-level name it declares starts with `CARD_` or `card`, so it cannot collide
 * with a name its host declares.
 */
export function buildResumeCardSource(): string {
  // String.raw keeps the body's own escapes (`\r?\n`, `\u0000`) as written, so
  // the text below reads exactly as the emitted script does.
  return String.raw`const CARD_RUNS_DIR = ${json(RUNS_SEGMENTS[1])};
const CARD_RUNS_REL = ${json(RUNS_SEGMENTS.join("/"))};
const CARD_RUN_ID = ${regex(RUN_ID_PATTERN)};
const CARD_REPORTS_DIR = ${json(REPORTS_DIR)};
const CARD_REPORT_NAME = ${regex(REPORT_NAME_PATTERN)};
const CARD_LEDGER_FILE = ${json(LEDGER_FILE)};
const CARD_RECORD_FILE = ${json(RECORD_FILE)};
const CARD_FINDINGS_OPEN = ${regex(fenceOpenPattern(FINDINGS_FENCE))};
const CARD_FENCE_CLOSE = ${regex(FENCE_CLOSE_PATTERN)};
const CARD_STATUS = ${regex(RECORD_STATUS_PATTERN)};
const CARD_PLAN = ${regex(RECORD_PLAN_PATTERN)};
const CARD_INVOCATION = ${regex(RECORD_INVOCATION_PATTERN)};
const CARD_IN_PROGRESS = ${regex(IN_PROGRESS_PATTERN)};
const CARD_HEAD_LINES = ${json(RECORD_HEAD_LINES)};
const CARD_HEAD_READ_BYTES = ${json(RECORD_HEAD_READ_BYTES)};
const CARD_REPORT_MAX_BYTES = ${json(REPORT_READ_MAX_BYTES)};
const CARD_GIT_MAX_BYTES = ${json(GIT_METADATA_MAX_BYTES)};
const CARD_MAX_CHARS = ${json(CARD_MAX_CHARS)};
const CARD_LIST_MAX = ${json(CARD_LIST_MAX)};
const CARD_FIELD_MAX = ${json(CARD_FIELD_MAX)};
const CARD_UNPRINTABLE = ${regex(UNPRINTABLE_CHARS)};
const CARD_RECOVERY_NOTE = ${json(CARD_RECOVERY_NOTE)};
const CARD_NEXT_LINE = ${json(CARD_NEXT_LINE)};
const CARD_NOT_RECORDED = ${json(CARD_NOT_RECORDED)};
const CARD_LEDGER_UNREADABLE = ${json(CARD_LEDGER_UNREADABLE)};
const CARD_NOT_REPORT_NAMED = ${json(CARD_NOT_REPORT_NAMED)};

/** A regular file, never through a link. Absent or unreadable reads as not one. */
function cardRegularFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

/** A real directory, never through a link. Absent or unreadable reads as not one. */
function cardRealDir(path) {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Whether anything, a dangling link included, sits at path. */
function cardExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * A git metadata file's text, trimmed: only a regular file (never through a
 * link) of at most CARD_GIT_MAX_BYTES bytes. Null otherwise, or when unreadable.
 */
function cardGitText(path) {
  try {
    const stats = lstatSync(path);
    if (!stats.isFile() || stats.size > CARD_GIT_MAX_BYTES) return null;
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}

/**
 * The record's head: its first CARD_HEAD_LINES lines, from at most
 * CARD_HEAD_READ_BYTES bytes, BOM stripped. The first status, plan and
 * invocation line each win. Null when the record is absent, a link, or
 * unreadable.
 */
function cardRecordHead(path) {
  if (!cardRegularFile(path)) return null;
  let raw = "";
  let fd = -1;
  try {
    fd = openSync(path, "r");
    const buffer = Buffer.alloc(CARD_HEAD_READ_BYTES);
    let filled = 0;
    while (filled < buffer.length) {
      const read = readSync(fd, buffer, filled, buffer.length - filled, filled);
      if (read === 0) break;
      filled += read;
    }
    raw = buffer.toString("utf8", 0, filled);
  } catch {
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
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const head = { status: null, plan: "", invocation: "" };
  for (const line of text.split(/\r?\n/).slice(0, CARD_HEAD_LINES)) {
    const status = CARD_STATUS.exec(line);
    if (status !== null && head.status === null) head.status = status[1];
    const plan = CARD_PLAN.exec(line);
    if (plan !== null && head.plan === "") head.plan = plan[1];
    const invocation = CARD_INVOCATION.exec(line);
    if (invocation !== null && head.invocation === "") head.invocation = invocation[1];
  }
  return {
    inProgress: head.status !== null && CARD_IN_PROGRESS.test(head.status),
    plan: head.plan,
    invocation: head.invocation,
  };
}

/**
 * Open row ids in file order, and every report path a row carries. Bad lines
 * are skipped. "failed" when a ledger is there but is not read — a link, anything
 * else that is not a regular file, or a read that fails — so the card never
 * counts it as empty; an absent ledger is a run with no rows yet.
 */
function cardLedger(path) {
  const open = [];
  const ledgered = new Set();
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    // ENOENT is no ledger yet; any other lstat failure is one that cannot be read.
    return { open, ledgered, failed: !(error && error.code === "ENOENT") };
  }
  if (!stats.isFile()) return { open, ledgered, failed: true };
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    // EACCES, EBUSY and the rest: there, but not read.
    return { open, ledgered, failed: true };
  }
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      // One torn or hand-mangled line; the rows around it still count.
      continue;
    }
    if (row === null || typeof row !== "object" || Array.isArray(row)) continue;
    if (typeof row.id === "string" && row.state === "open") open.push(row.id);
    if (typeof row.report === "string") ledgered.add(row.report);
  }
  return { open, ledgered, failed: false };
}

/** Whether the first findings block holds at least one non-blank line before it closes. */
function cardHasFindings(raw) {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((line) => CARD_FINDINGS_OPEN.test(line));
  if (start === -1) return false;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (CARD_FENCE_CLOSE.test(lines[index])) return false;
    if (lines[index].trim() !== "") return true;
  }
  return false;
}

/**
 * Reports that hold findings no ledger row points at, as repo-relative paths,
 * and the count of .md files whose names are not report names. A report too
 * large to read, or one that cannot be read, is listed: its findings cannot be
 * ruled out. Any other name is counted and never listed, because its text is
 * whatever the writer chose. A linked reports folder is not read at all.
 */
function cardUnledgered(runDir, run, ledgered) {
  const none = { listed: [], other: 0 };
  const reportsDir = join(runDir, CARD_REPORTS_DIR);
  if (!cardRealDir(reportsDir)) return none;
  let entries;
  try {
    entries = readdirSync(reportsDir, { withFileTypes: true });
  } catch {
    return none;
  }
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
  const out = [];
  let other = 0;
  for (const name of names) {
    if (!CARD_REPORT_NAME.test(name)) {
      other += 1;
      continue;
    }
    const rel = CARD_RUNS_REL + "/" + run + "/" + CARD_REPORTS_DIR + "/" + name;
    if (ledgered.has(rel)) continue;
    const path = join(runDir, CARD_REPORTS_DIR, name);
    let size;
    try {
      const stats = lstatSync(path);
      if (!stats.isFile()) continue;
      size = stats.size;
    } catch {
      continue;
    }
    if (size > CARD_REPORT_MAX_BYTES) {
      out.push(rel);
      continue;
    }
    let raw;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      // Unreadable is not empty: what it holds cannot be ruled out.
      out.push(rel);
      continue;
    }
    if (cardHasFindings(raw)) out.push(rel);
  }
  return { listed: out, other };
}

/** A worktree HEAD as the branch it names. */
function cardBranch(head) {
  if (head.startsWith("ref: refs/heads/")) return head.slice("ref: refs/heads/".length);
  if (head.startsWith("ref: ")) return head.slice("ref: ".length);
  if (/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(head)) return "detached " + head.slice(0, 7);
  return "unknown";
}

/**
 * The git common dir: .git itself when it is a directory, or, when .git is the
 * pointer file a linked worktree carries, the directory it names followed
 * through its commondir. Null when neither holds, or when the pointer or the
 * commondir is a link, too large, or unreadable.
 */
function cardCommonDir(rootDir) {
  const dotGit = join(rootDir, ".git");
  try {
    const stats = lstatSync(dotGit);
    if (stats.isDirectory()) return dotGit;
    if (!stats.isFile()) return null;
    const text = cardGitText(dotGit);
    if (text === null) return null;
    const pointer = /^gitdir:[ \t]*(.+)$/.exec(text.split(/\r?\n/)[0].trim());
    if (pointer === null) return null;
    const target = pointer[1].trim();
    // Git resolves a relative pointer against the directory holding .git.
    const gitDir = isAbsolute(target) ? target : resolve(dirname(dotGit), target);
    // No commondir: the pointer names the common dir itself.
    let common = "";
    const commondir = join(gitDir, "commondir");
    if (cardExists(commondir)) {
      const named = cardGitText(commondir);
      if (named === null) return null;
      common = named;
    }
    return resolve(gitDir, common);
  } catch {
    return null;
  }
}

/**
 * Linked worktrees as "<path> [<branch>]", sorted. The main checkout is not a
 * lane, and neither is one whose gitdir is empty or names nothing on disk any
 * more: git calls that lane prunable, and it holds no work to resume. A linked
 * worktrees folder is not listed at all.
 */
function cardLanes(rootDir) {
  const common = cardCommonDir(rootDir);
  if (common === null) return [];
  const worktrees = join(common, "worktrees");
  if (!cardRealDir(worktrees)) return [];
  let admins;
  try {
    admins = readdirSync(worktrees, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
  const out = [];
  for (const name of admins) {
    const admin = join(worktrees, name);
    const gitdir = cardGitText(join(admin, "gitdir"));
    if (gitdir === null || gitdir === "") continue;
    const target = isAbsolute(gitdir) ? gitdir : resolve(admin, gitdir);
    if (!cardExists(target)) continue;
    const located = target.replace(/[\\/]\.git$/, "").replaceAll("\\", "/");
    const head = cardGitText(join(admin, "HEAD"));
    out.push(located + " [" + (head === null ? "unknown" : cardBranch(head)) + "]");
  }
  return out.sort();
}

/**
 * One field as one bounded line: control characters to spaces, then the C1
 * controls, bidi controls and zero-width marks dropped (never the tag block,
 * which the screen must still see), whitespace collapsed, capped.
 */
function cardFlat(value) {
  const flat = String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(CARD_UNPRINTABLE, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > CARD_FIELD_MAX ? flat.slice(0, CARD_FIELD_MAX - 1) + "…" : flat;
}

/** " (<first k>, … +<rest> more)", or "" for an empty list. */
function cardList(items, k) {
  if (items.length === 0) return "";
  const shown = items.slice(0, k).map(cardFlat);
  if (items.length > k) shown.push("… +" + (items.length - k) + " more");
  return " (" + shown.join(", ") + ")";
}

function cardRender(run, head, ledger, reports, lanes, nowMs, k) {
  const plan = cardFlat(head.plan);
  const invocation = cardFlat(head.invocation);
  const open = ledger.open;
  const unledgered = reports.listed;
  return [
    "stamity resume card — run " + run + " (as of " + new Date(nowMs).toISOString().slice(0, 16) + "Z)",
    "plan: " + (plan === "" ? CARD_NOT_RECORDED : plan) +
      "  ·  invocation: " + (invocation === "" ? CARD_NOT_RECORDED : invocation),
    "ledger: " + (ledger.failed ? CARD_LEDGER_UNREADABLE : open.length + " open rows" + cardList(open, k)) +
      "  ·  " + CARD_RECOVERY_NOTE,
    "reports without a ledger row: " + unledgered.length + cardList(unledgered, k) +
      (reports.other > 0 ? "  ·  " + CARD_NOT_REPORT_NAMED + ": " + reports.other : ""),
    "lanes: " + lanes.length + cardList(lanes, k),
    CARD_NEXT_LINE,
  ];
}

/**
 * The resume card of the newest run in progress, or null when none is. Lists
 * shrink until the card fits CARD_MAX_CHARS; with every list at zero it always
 * does. A card whose text trips the screen is withheld whole.
 */
function resumeCardLines(rootDir, stateRoot, nowMs) {
  const runsDir = join(stateRoot, CARD_RUNS_DIR);
  // A linked runs folder is not this repo's runs: nothing in it is read.
  if (!cardRealDir(runsDir)) return null;
  let entries;
  try {
    entries = readdirSync(runsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  let chosen = null;
  for (const entry of entries) {
    // A link to a directory is not a directory here: a run is never followed out of the tree.
    if (!entry.isDirectory() || !CARD_RUN_ID.test(entry.name)) continue;
    const head = cardRecordHead(join(runsDir, entry.name, CARD_RECORD_FILE));
    if (head === null || !head.inProgress) continue;
    if (chosen === null || entry.name > chosen.run) chosen = { run: entry.name, head };
  }
  if (chosen === null) return null;

  const runDir = join(runsDir, chosen.run);
  const ledger = cardLedger(join(runDir, CARD_LEDGER_FILE));
  const reports = cardUnledgered(runDir, chosen.run, ledger.ledgered);
  const lanes = cardLanes(rootDir);

  let lines = [];
  for (let k = CARD_LIST_MAX; k >= 0; k -= 1) {
    lines = cardRender(chosen.run, chosen.head, ledger, reports, lanes, nowMs, k);
    if (lines.join("\n").length <= CARD_MAX_CHARS) break;
  }
  const hit = screenHit(lines.join("\n"));
  if (hit !== "") {
    return [
      "stamity resume card — run " + chosen.run + " withheld: its text matched screen pattern " + hit + "; " +
        CARD_RECOVERY_NOTE,
    ];
  }
  return lines;
}`;
}
