import { FENCE_CLOSE_PATTERN, FINDINGS_FENCE, fenceOpenPattern } from "./layout.ts";

/**
 * The strict reader of a role report's machine-readable findings block (C2).
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
 * A value read from the report as a problem message quotes it: a string is cut
 * at {@link QUOTED_MAX} code points plus `…` and then JSON-quoted; anything
 * else is JSON-spelled and that spelling cut the same way. A key, an id or a
 * severity is report-authored text of any length, and a refusal names every
 * problem, so an uncut quote would let one report size the refusal's output.
 */
function quoted(value: unknown): string {
  const cut = (text: string): string => {
    const points = Array.from(text);
    return points.length <= QUOTED_MAX ? text : `${points.slice(0, QUOTED_MAX).join("")}…`;
  };
  return typeof value === "string" ? JSON.stringify(cut(value)) : cut(String(JSON.stringify(value)));
}

/**
 * Where the one block sits: its opening line and closing line (0-based), or the
 * structural problem that stops the parse before any line is read.
 */
function locateBlock(
  lines: readonly string[],
): { readonly open: number; readonly close: number } | BlockProblem {
  const openPattern = fenceOpenPattern(FINDINGS_FENCE);
  const opens: number[] = [];
  for (const [index, line] of lines.entries()) if (openPattern.test(line)) opens.push(index);
  const first = opens[0];
  if (first === undefined) return { line: 0, message: `no ${FINDINGS_FENCE} block` };
  const second = opens[1];
  if (second !== undefined) {
    return {
      line: second + 1,
      message: `a second ${FINDINGS_FENCE} block (the first opens at line ${first + 1}); a report carries exactly one`,
    };
  }
  for (let index = first + 1; index < lines.length; index += 1) {
    if (FENCE_CLOSE_PATTERN.test(lines[index] ?? "")) return { open: first, close: index };
  }
  return { line: first + 1, message: `the ${FINDINGS_FENCE} block opened here is never closed` };
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
function readFindingLine(
  raw: string,
  line: number,
): {
  readonly finding: Finding | null;
  readonly id: string | null;
  readonly problems: readonly string[];
} {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { finding: null, id: null, problems: [`not JSON (${reason})`] };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { finding: null, id: null, problems: ["not a JSON object"] };
  }
  const object = value as Record<string, unknown>;
  const problems: string[] = [];

  for (const key of Object.keys(object)) {
    if (!ALLOWED_KEYS.has(key)) problems.push(`unknown key ${quoted(key)}`);
  }
  for (const key of REQUIRED_KEYS) {
    if (!Object.hasOwn(object, key)) problems.push(`missing ${JSON.stringify(key)}`);
  }

  const severity = object["severity"];
  const severityOk =
    typeof severity === "string" && (SEVERITIES as readonly string[]).includes(severity);
  if (Object.hasOwn(object, "severity") && !severityOk) {
    problems.push(`severity ${quoted(severity)} is not Critical, Warning or Minor`);
  }

  const id = object["id"];
  if (Object.hasOwn(object, "id")) {
    const match = typeof id === "string" ? FINDING_ID_PATTERN.exec(id) : null;
    if (match === null) {
      problems.push(`id ${quoted(id)} is not C-<n>, W-<n> or M-<n>`);
    } else if (severityOk && match[1] !== severity.charAt(0)) {
      problems.push(`id ${quoted(id)} does not match severity ${severity}`);
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
  if (problems.length > 0) return { finding: null, id: idText, problems };
  return {
    finding: {
      id: id as string,
      severity: severity as FindingSeverity,
      locator: object["locator"] as string,
      summary: object["summary"] as string,
      decisionNeeded: object["decision_needed"] === true,
      security: object["security"] === true,
      line,
    },
    id: idText,
    problems: [],
  };
}

/**
 * Parse the one `stamity-findings` block of `text`.
 *
 * An empty block is `ok` with zero items: a pass that found nothing says so with
 * an empty block, and that is a valid answer, not a malformed one. No block, a
 * second block and an unclosed block are refusals of the whole text.
 */
export function parseFindingsBlock(text: string): BlockParse<Finding> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const located = locateBlock(lines);
  if ("message" in located) return { ok: false, problems: [located] };

  const items: Finding[] = [];
  const problems: BlockProblem[] = [];
  const firstLineOfId = new Map<string, number>();
  for (let index = located.open + 1; index < located.close; index += 1) {
    const raw = lines[index] ?? "";
    if (raw.trim() === "") continue;
    const line = index + 1;
    const read = readFindingLine(raw, line);
    for (const message of read.problems) problems.push({ line, message });
    // Uniqueness is checked on every string id, not only on clean lines, so a
    // repeat is named in the same pass as the other problems of its line.
    if (read.id !== null) {
      const earlier = firstLineOfId.get(read.id);
      if (earlier !== undefined) {
        problems.push({ line, message: `id ${quoted(read.id)} repeats line ${earlier}` });
        continue;
      }
      firstLineOfId.set(read.id, line);
    }
    if (read.finding !== null) items.push(read.finding);
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, items };
}
