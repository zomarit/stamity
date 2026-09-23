import {
  CLOSURES_FENCE,
  FENCE_CLOSE_PATTERN,
  FINDINGS_FENCE,
  fenceOpenPattern,
  RATIONALE_MAX,
  UNPRINTABLE_CHARS,
} from "./layout.ts";

/**
 * The strict readers of a role report's machine-readable blocks: the findings
 * block (C2) and a re-review's closures block (C9).
 *
 * A full report, or a verdict return delivered inline, carries exactly one
 * fenced block whose info string is `stamity-findings`, one JSON object per
 * line. `stamity ledger append` turns each object into one ledger row, so this
 * reader is the gate between free prose and the durable record: every bad line
 * refuses the whole block, and every problem is collected rather than the first,
 * so the writer of the report fixes them in one pass.
 *
 * Deliberately stricter than the resume card's own look at the same block (the
 * card counts non-blank lines, so a malformed block still surfaces there as a
 * report nobody has ledgered): here the id letter must match the severity and
 * `locator` and `summary` are single lines, because they become one ledger
 * row's `evidence`.
 *
 * The closures block follows the same rules — one block, one JSON object per
 * line, every bad line named, an empty block a valid answer — and is what
 * `stamity ledger close --report` reads to move the rows a re-review verified.
 *
 * Pure: text in, verdict out. Nothing here touches the filesystem.
 */

export type FindingSeverity = "Critical" | "Warning" | "Minor";

export interface Finding {
  /** Report-local id, `C-<n>`, `W-<n>` or `M-<n>`, its letter the severity's initial. */
  readonly id: string;
  readonly severity: FindingSeverity;
  /** `path:line`, `path:line-line`, or a gate command. */
  readonly locator: string;
  /** One line: the failure scenario. */
  readonly summary: string;
  /** The fix changes a shared contract or needs a product choice. */
  readonly decisionNeeded: boolean;
  /** A security-relevant finding. Read by the digest, never stored in the ledger. */
  readonly security: boolean;
  /** The 1-based physical line of the text the object sits on. */
  readonly line: number;
}

export interface BlockProblem {
  /** 1-based physical line; 0 means the whole text. */
  readonly line: number;
  readonly message: string;
}

export type BlockParse<T> =
  | { readonly ok: true; readonly items: readonly T[] }
  | { readonly ok: false; readonly problems: readonly BlockProblem[] };

/** Ceiling on `locator` and on `summary`, in characters (code points). */
export const FINDING_TEXT_MAX = 300;

const SEVERITIES: readonly FindingSeverity[] = ["Critical", "Warning", "Minor"];
const REQUIRED_KEYS = ["id", "severity", "locator", "summary"] as const;
const OPTIONAL_KEYS = ["decision_needed", "security"] as const;
const ALLOWED_KEYS: ReadonlySet<string> = new Set<string>([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);
const FINDING_ID_PATTERN = /^([CWM])-[1-9][0-9]*$/;

/** Longest fragment of report text a problem message quotes back, in code points. */
const QUOTED_MAX = 60;

/**
 * Report-authored text as a problem message carries it: cut at
 * {@link QUOTED_MAX} code points plus `…`. A key, an id or a status is text of
 * any length, and a refusal names every problem, so an uncut fragment would let
 * one report size the refusal's output.
 */
export function cutReportText(text: string): string {
  const points = Array.from(text);
  return points.length <= QUOTED_MAX ? text : `${points.slice(0, QUOTED_MAX).join("")}…`;
}

/**
 * A value read from the report as a problem message quotes it: a string is cut
 * by {@link cutReportText} and then JSON-quoted; anything else is JSON-spelled
 * and that spelling cut the same way.
 */
export function quoteReportText(value: unknown): string {
  return typeof value === "string"
    ? JSON.stringify(cutReportText(value))
    : cutReportText(String(JSON.stringify(value)));
}

/**
 * Text read from a report or the ledger as it may be printed or recorded: line
 * breaks and tabs become spaces, and control bytes, the bidi controls and the
 * zero-width marks are dropped. The ledger is a committed file anyone can edit
 * and diff, so an id or a rationale carrying an escape sequence or a bidi
 * override would otherwise reach a terminal raw, or land reordered in a diffed
 * line. The rule `../cli/kit/prompts.ts::sanitizeLabel` applies, restated here
 * because the engine never imports the CLI layer.
 */
export function printableText(text: string): string {
  return text
    .replace(/[\r\n\t]/gu, " ")
    .replace(UNPRINTABLE_CHARS, "");
}

/**
 * Where the one `fence` block sits: its opening line and closing line (0-based),
 * or the structural problem that stops the parse before any line is read.
 */
function locateBlock(
  lines: readonly string[],
  fence: string,
): { readonly open: number; readonly close: number } | BlockProblem {
  const openPattern = fenceOpenPattern(fence);
  const opens: number[] = [];
  for (const [index, line] of lines.entries()) if (openPattern.test(line)) opens.push(index);
  const first = opens[0];
  if (first === undefined) return { line: 0, message: `no ${fence} block` };
  const second = opens[1];
  if (second !== undefined) {
    return {
      line: second + 1,
      message: `a second ${fence} block (the first opens at line ${first + 1}); a report carries exactly one`,
    };
  }
  for (let index = first + 1; index < lines.length; index += 1) {
    if (FENCE_CLOSE_PATTERN.test(lines[index] ?? "")) return { open: first, close: index };
  }
  return { line: first + 1, message: `the ${fence} block opened here is never closed` };
}

/** The problems of one text field (`locator` or `summary`) that is already a string. */
function textProblems(key: string, value: string): string[] {
  if (value.trim() === "") return [`${key} is empty`];
  const problems: string[] = [];
  if (/[\r\n]/.test(value)) problems.push(`${key} spans more than one line`);
  if (Array.from(value).length > FINDING_TEXT_MAX) {
    problems.push(`${key} is over ${FINDING_TEXT_MAX} characters`);
  }
  return problems;
}

/**
 * One inner line's object, checked field by field. Returns the finding when the
 * line is clean, and every problem it carries otherwise.
 */
function readFindingLine(raw: string, line: number): LineRead<Finding> {
  const object = readObject(raw);
  if (typeof object === "string") return { item: null, key: null, problems: [object] };
  const problems: string[] = [];

  for (const key of Object.keys(object)) {
    if (!ALLOWED_KEYS.has(key)) problems.push(`unknown key ${quoteReportText(key)}`);
  }
  for (const key of REQUIRED_KEYS) {
    if (!Object.hasOwn(object, key)) problems.push(`missing ${JSON.stringify(key)}`);
  }

  const severity = object["severity"];
  const severityOk =
    typeof severity === "string" && (SEVERITIES as readonly string[]).includes(severity);
  if (Object.hasOwn(object, "severity") && !severityOk) {
    problems.push(`severity ${quoteReportText(severity)} is not Critical, Warning or Minor`);
  }

  const id = object["id"];
  if (Object.hasOwn(object, "id")) {
    const match = typeof id === "string" ? FINDING_ID_PATTERN.exec(id) : null;
    if (match === null) {
      problems.push(`id ${quoteReportText(id)} is not C-<n>, W-<n> or M-<n>`);
    } else if (severityOk && match[1] !== severity.charAt(0)) {
      problems.push(`id ${quoteReportText(id)} does not match severity ${severity}`);
    }
  }

  for (const key of ["locator", "summary"] as const) {
    if (!Object.hasOwn(object, key)) continue;
    const text = object[key];
    // Not in the C7 message list, which names no message for a non-string text
    // field; "is empty" would misdescribe a number, so the type is named.
    if (typeof text !== "string") problems.push(`${key} is not a string`);
    else problems.push(...textProblems(key, text));
  }

  for (const key of OPTIONAL_KEYS) {
    if (Object.hasOwn(object, key) && typeof object[key] !== "boolean") {
      problems.push(`${key} is not a boolean`);
    }
  }

  const idText = typeof id === "string" ? id : null;
  if (problems.length > 0) return { item: null, key: idText, problems };
  return {
    item: {
      id: id as string,
      severity: severity as FindingSeverity,
      locator: object["locator"] as string,
      summary: object["summary"] as string,
      decisionNeeded: object["decision_needed"] === true,
      security: object["security"] === true,
      line,
    },
    key: idText,
    problems: [],
  };
}

/** What one inner line's reader returns: its item when clean, its key for the
 *  uniqueness check whenever the key is a string, and every problem it carries. */
interface LineRead<T> {
  readonly item: T | null;
  readonly key: string | null;
  readonly problems: readonly string[];
}

/**
 * The walk both blocks share: locate the one `fence` block, read every
 * non-blank inner line, and refuse the whole block when any line has a
 * problem. `keyName` names the field whose repeat is a problem.
 */
function parseBlock<T>(
  text: string,
  fence: string,
  keyName: string,
  readLine: (raw: string, line: number) => LineRead<T>,
): BlockParse<T> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const located = locateBlock(lines, fence);
  if ("message" in located) return { ok: false, problems: [located] };

  const items: T[] = [];
  const problems: BlockProblem[] = [];
  const firstLineOfKey = new Map<string, number>();
  for (let index = located.open + 1; index < located.close; index += 1) {
    const raw = lines[index] ?? "";
    if (raw.trim() === "") continue;
    const line = index + 1;
    const read = readLine(raw, line);
    for (const message of read.problems) problems.push({ line, message });
    // Uniqueness is checked on every string key, not only on clean lines, so a
    // repeat is named in the same pass as the other problems of its line.
    if (read.key !== null) {
      const earlier = firstLineOfKey.get(read.key);
      if (earlier !== undefined) {
        problems.push({ line, message: `${keyName} ${quoteReportText(read.key)} repeats line ${earlier}` });
        continue;
      }
      firstLineOfKey.set(read.key, line);
    }
    if (read.item !== null) items.push(read.item);
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, items };
}

/** One inner line as a JSON object, or the one problem that stops its reading. */
function readObject(raw: string): Record<string, unknown> | string {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return `not JSON (${reason})`;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "not a JSON object";
  }
  return value as Record<string, unknown>;
}

/**
 * Parse the one `stamity-findings` block of `text`.
 *
 * An empty block is `ok` with zero items: a pass that found nothing says so with
 * an empty block, and that is a valid answer, not a malformed one. No block, a
 * second block and an unclosed block are refusals of the whole text.
 */
export function parseFindingsBlock(text: string): BlockParse<Finding> {
  return parseBlock(text, FINDINGS_FENCE, "id", readFindingLine);
}

/** What a re-review says about one prior finding (C9). */
export type ClosureStatus =
  | "fixed"
  | "not-fixed"
  | "regressed"
  | "rejection-upheld"
  | "rejection-overturned";

export interface Closure {
  /** The ledger id the re-review was handed, `<run>/<phase>/<n>`. */
  readonly ledgerId: string;
  readonly status: ClosureStatus;
  /**
   * The re-review's optional one-line reason, stripped by {@link printableText}
   * and trimmed; `null` when the closure carries none.
   */
  readonly rationale: string | null;
  /** The 1-based physical line of the text the object sits on. */
  readonly line: number;
}

const CLOSURE_STATUSES: readonly ClosureStatus[] = [
  "fixed",
  "not-fixed",
  "regressed",
  "rejection-upheld",
  "rejection-overturned",
];
const CLOSURE_KEYS = ["ledger_id", "status"] as const;
const CLOSURE_KEY_SET: ReadonlySet<string> = new Set<string>([...CLOSURE_KEYS, "rationale"]);

/**
 * A closure's `rationale`, read: the raw value must be a string on one line; it
 * is stripped by {@link printableText} and trimmed before the blank check and
 * the {@link RATIONALE_MAX} cap, so an invisible character neither fills the
 * cap nor passes for text.
 */
function readRationale(value: unknown): { readonly text: string; readonly problems: string[] } {
  if (typeof value !== "string") return { text: "", problems: ["rationale is not a string"] };
  const text = printableText(value).trim();
  if (text === "") return { text, problems: ["rationale is empty"] };
  const problems: string[] = [];
  if (/[\r\n]/.test(value)) problems.push("rationale spans more than one line");
  if (Array.from(text).length > RATIONALE_MAX) {
    problems.push(`rationale is over ${RATIONALE_MAX} characters`);
  }
  return { text, problems };
}

function readClosureLine(raw: string, line: number): LineRead<Closure> {
  const object = readObject(raw);
  if (typeof object === "string") return { item: null, key: null, problems: [object] };
  const problems: string[] = [];

  for (const key of Object.keys(object)) {
    if (!CLOSURE_KEY_SET.has(key)) problems.push(`unknown key ${quoteReportText(key)}`);
  }
  for (const key of CLOSURE_KEYS) {
    if (!Object.hasOwn(object, key)) problems.push(`missing ${JSON.stringify(key)}`);
  }

  const status = object["status"];
  if (
    Object.hasOwn(object, "status") &&
    !(typeof status === "string" && (CLOSURE_STATUSES as readonly string[]).includes(status))
  ) {
    problems.push(
      `status ${quoteReportText(status)} is not fixed, not-fixed, regressed, rejection-upheld or rejection-overturned`,
    );
  }

  const ledgerId = object["ledger_id"];
  if (Object.hasOwn(object, "ledger_id")) {
    if (typeof ledgerId !== "string") problems.push("ledger_id is not a string");
    else if (ledgerId.trim() === "") problems.push("ledger_id is empty");
    else if (/[\r\n]/.test(ledgerId)) problems.push("ledger_id spans more than one line");
  }

  let rationale: string | null = null;
  if (Object.hasOwn(object, "rationale")) {
    const read = readRationale(object["rationale"]);
    problems.push(...read.problems);
    rationale = read.text;
  }

  const key = typeof ledgerId === "string" ? ledgerId : null;
  if (problems.length > 0) return { item: null, key, problems };
  return {
    item: { ledgerId: ledgerId as string, status: status as ClosureStatus, rationale, line },
    key,
    problems: [],
  };
}

/**
 * Parse the one `stamity-closures` block of a re-review.
 *
 * Each object carries `ledger_id` and `status`, and may carry a one-line
 * `rationale` of at most {@link RATIONALE_MAX} characters; any other key is a
 * problem. A ledger id closed twice
 * is a problem, because two answers about one row cannot both be applied. An
 * empty block is `ok` with zero items.
 */
export function parseClosuresBlock(text: string): BlockParse<Closure> {
  return parseBlock(text, CLOSURES_FENCE, "ledger_id", readClosureLine);
}
