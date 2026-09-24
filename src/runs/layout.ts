import { EngineError } from "../types/errors.ts";
import { STATE_DIR } from "../types/markers.ts";

/**
 * The on-disk shape of a work run, in one place: where runs live, what a run id
 * looks like, the three files a run folder carries, the grammar of a persisted
 * role report, the fences a report's machine-readable blocks open with, the
 * record-head lines a resumed session reads, and the bounds and fixed words of
 * the resume card.
 *
 * Every consumer reads these values from here rather than restating them. The
 * resume card has two twins — the plain-JS copy the session-start hook embeds
 * (`./cardSource.ts`) and the engine's own reader — and both take every constant
 * below through this module, the hook copy by `JSON.stringify` at render time,
 * so a change here moves both at once instead of leaving one behind.
 *
 * Pure data and two small helpers; nothing here touches the filesystem.
 */

/** Where runs live, as segments under the repository root. */
export const RUNS_SEGMENTS: readonly [string, string] = [STATE_DIR, "runs"];

/** A run folder's name: its UTC date, an underscore, then a lower-case slug. */
export const RUN_ID_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}_[a-z0-9-]+$/;

/** The run folder's report directory, git-ignored, one full role report per file. */
export const REPORTS_DIR = "reports";
/** The run's findings ledger, one JSON row per line. */
export const LEDGER_FILE = "ledger.jsonl";
/** The run record, whose first lines name the status, the plan and the invocation. */
export const RECORD_FILE = "record.md";

/** The roles that persist a full report; the `<role>` segment of a report name. */
export const REPORT_ROLES = [
  "implementer",
  "fixer",
  "reviewer",
  "security",
  "performance",
  "design-quality",
  "test-runner",
  "spec-author",
] as const;

/**
 * A persisted report's file name: `<pass>-<role>-r<N>.md`.
 *
 * The negative lookahead is not style. Claude Code refuses a sub-agent's write
 * whose basename starts with one of those four words (learning
 * `claude-code-refuses-sub-agent-report-file-names`), so a name the pattern
 * admitted but the client refused would be a report nobody could write.
 */
export const REPORT_NAME_PATTERN: RegExp = new RegExp(
  `^(?!(?:report|summary|findings|analysis))[a-z0-9][a-z0-9-]*-(?:${REPORT_ROLES.join("|")})-r[1-9][0-9]*\\.md$`,
);

const REPORT_ROLE_SUFFIX = new RegExp(`-(${REPORT_ROLES.join("|")})-r[1-9][0-9]*\\.md$`);

/**
 * The `<role>` segment of a report name, or null when `name` is not one. No
 * role is a suffix of another, so the role just before `-r<N>.md` is the only
 * reading, whatever role tokens the pass slug holds.
 */
export function reportNameRole(name: string): string | null {
  if (!REPORT_NAME_PATTERN.test(name)) return null;
  return REPORT_ROLE_SUFFIX.exec(name)?.[1] ?? null;
}

/** The info string of a report's findings block. */
export const FINDINGS_FENCE = "stamity-findings";
/** The info string of a re-review's closures block. */
export const CLOSURES_FENCE = "stamity-closures";

/** The opening line of a fenced block whose info string is exactly `info`. */
export function fenceOpenPattern(info: string): RegExp {
  return new RegExp("^ {0,3}```" + info + "[ \\t]*$");
}

/** The closing line of a fenced block. */
export const FENCE_CLOSE_PATTERN = /^ {0,3}```[ \t]*$/;

/** The record head's status line; the run is in progress while the value says so. */
export const RECORD_STATUS_PATTERN = /^status:\s*(.*)$/i;
/** The record head's plan line: the repo-relative plan path. */
export const RECORD_PLAN_PATTERN = /^plan:\s*(.+)$/i;
/** The record head's invocation line: the exact command the run was started with. */
export const RECORD_INVOCATION_PATTERN = /^invocation:\s*(.+)$/i;
/** What a status value says while the run is open, in any case and any decoration. */
export const IN_PROGRESS_PATTERN = /\bin progress\b/i;

/** How many lines of the record count as its head. */
export const RECORD_HEAD_LINES = 15;
/** How much of the record is read to find those lines; a head never needs more. */
export const RECORD_HEAD_READ_BYTES = 65_536;
/**
 * Past this size a report is not read: it is listed as unledgered, because its
 * findings cannot be ruled out without reading it.
 */
export const REPORT_READ_MAX_BYTES = 1_048_576;
/**
 * Past this size a git metadata file the card reads (the `.git` pointer, a
 * worktree's `commondir`, `gitdir` and `HEAD`) is not read: git writes each as
 * one path or one ref, and a path longer than this is not one any platform opens.
 */
export const GIT_METADATA_MAX_BYTES = 4_096;
/**
 * Ceiling on a rationale the ledger records — a manual close's `--rationale` or
 * a closure's optional `rationale` — in characters (code points), counted after
 * the text is stripped and trimmed.
 */
export const RATIONALE_MAX = 2_000;
/** The card's ceiling, all lines joined by newlines. */
export const CARD_MAX_CHARS = 2_000;
/** Items a card list names before it shrinks. */
export const CARD_LIST_MAX = 10;
/** One printed field's ceiling, the ellipsis included. */
export const CARD_FIELD_MAX = 200;

/**
 * The characters a printed or recorded field drops: the C0 and C1 controls,
 * DEL, the Arabic letter mark, the zero-width marks, the line and paragraph
 * separators, the bidi controls and the byte-order mark. Text read from a
 * committed file (a ledger id, a record line, a branch) or written into one (a
 * finding's locator and summary) would otherwise reach a terminal as an escape
 * sequence, or a context or a diff reordered or broken across lines. The
 * Unicode tag block is deliberately NOT here: the screens'
 * `unicode-tag-smuggling` row refuses a payload by those characters, and
 * stripping them first would launder it. Global and Unicode-aware, for
 * `String.prototype.replace`; the hook's card and guard embed it by source and flags.
 */
// oxlint-disable-next-line no-control-regex -- matching control characters IS the point
export const UNPRINTABLE_CHARS = /[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu;

/**
 * The Unicode tag block, U+E0000 to U+E007F: invisible characters that can spell
 * a whole instruction. Kept out of {@link UNPRINTABLE_CHARS} so the screens still
 * see a payload; stripped only where no screen runs before the text is
 * committed — `ledger append`'s locator and summary — and said so there.
 */
export const UNICODE_TAG_CHARS = /[\u{E0000}-\u{E007F}]/gu;

/** The card's fixed words. */
export const CARD_RECOVERY_NOTE = "the ledger is the recovery point";
export const CARD_NEXT_LINE = "next: read the open rows and the listed reports before dispatching anything";
export const CARD_NOT_RECORDED = "(not recorded)";
/**
 * What the ledger line says instead of a count when a ledger is there but
 * cannot be read (not absent: a permission, a link, a folder in its place), so
 * a resumed session is never told a run it cannot see has nothing open.
 */
export const CARD_LEDGER_UNREADABLE = "could not be read";
/**
 * The label of the count of `.md` files in `reports/` whose names are not
 * report names. Only a report name is ever listed: any other name is
 * text a steered role chose, and the card would carry it into context.
 */
export const CARD_NOT_REPORT_NAMED = "not report-named";

/** Whether `value` is a run folder's name. */
export function isRunId(value: string): boolean {
  return RUN_ID_PATTERN.test(value);
}

/**
 * The repo-relative POSIX path of a run folder or a file in it. Printed and
 * stored paths are always this literal, never a native join, so a path written
 * on Windows reads the same as one written anywhere else.
 */
export function runRelPath(runId: string, ...segments: string[]): string {
  if (!isRunId(runId)) {
    throw new EngineError(`${JSON.stringify(runId)} is not a run id`, {
      code: "VALIDATION_ERROR",
      why: `a run id matches ${RUN_ID_PATTERN.source}`,
    });
  }
  return [...RUNS_SEGMENTS, runId, ...segments].join("/");
}
