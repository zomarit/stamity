import { linesPastCap, scanAddedLines } from "../change/scan.ts";
import { EngineError } from "../types/errors.ts";
import { printableText, quoteReportText } from "./blocks.ts";
import { FENCE_CLOSE_PATTERN, fenceOpenPattern, isRunId, runRelPath, UNICODE_TAG_CHARS } from "./layout.ts";
import type { PrereqRow } from "./prerequisites.ts";
import { runMarker } from "./pullRequest.ts";

/**
 * The morning list (REQ-FLOW-094): what an unattended run leaves for the
 * person who reads it next, at `.stamity/runs/<run-id>/morning.md`, and the
 * source the run's pull request body is made from.
 *
 * The shape, one level-2 section each, in this order:
 *
 *     # Morning list — <run-id>
 *     ## Refused            (only on a pre-flight or plan-check refusal, then first)
 *     ## For you to check
 *     ## Decisions
 *     ## Prerequisites
 *     ## Person's calls held
 *     ## Not done:
 *     ## How to answer
 *     ```stamity-morning
 *     {"id":"Q1","kind":"qa","question":"…","options":["…","…"],"default":1,"source":"…"}
 *     ```
 *
 * The fenced block, inside `## How to answer`, holds one question per line:
 * what the morning walk (REQ-FLOW-095) puts through the client's question tool
 * and what a person answers in one comment as `Q1→2, Q3→1`. A section with no
 * rows reads `none`.
 *
 * Every text the run sends out — a body, a comment, a reply — passes
 * {@link screenOutbound} first (REQ-FLOW-103), which runs the change scan's own
 * patterns and reports a line and a rule, never any part of a value.
 *
 * Pure: text in, text or verdict out. Nothing here touches the filesystem.
 */

/** The morning list's file name inside its run folder. */
export const MORNING_FILE = "morning.md";
/** The info string of the questions block. */
export const MORNING_FENCE = "stamity-morning";
/** The section a refusal opens the list with. */
export const MORNING_REFUSED = "Refused";
/** The sections every morning list carries, in order. */
export const MORNING_SECTIONS = [
  "For you to check",
  "Decisions",
  "Prerequisites",
  "Person's calls held",
  "Not done:",
  "How to answer",
] as const;
/** What a section with no rows reads. */
export const MORNING_EMPTY = "none";
/** The pull request body's default ceiling, under GitHub's 65,536-character limit. */
export const PR_BODY_MAX_CHARS = 60_000;
/** The smallest ceiling {@link prBodyFrom} accepts. */
export const PR_BODY_MIN_CHARS = 1_000;
/** The rule an outbound line past the scan's cap is reported under: not read, so not clean. */
export const OUTBOUND_LINE_PAST_CAP = "line-past-cap";
/** At most this many `qa` questions: the person's QA rows (REQ-FLOW-094). */
export const MORNING_QA_MAX = 3;

export type MorningKind = "qa" | "decision" | "prerequisite" | "held";

export interface MorningQuestion {
  /** `Q<n>`, unique in the list. */
  readonly id: string;
  readonly kind: MorningKind;
  readonly question: string;
  /** Two to nine numbered options, 1-based. */
  readonly options: readonly string[];
  /** The option number that applies when nobody answers. */
  readonly default: number;
  /** Where the question came from: a record line, a ledger row, a plan section. */
  readonly source: string;
}

export type MorningParse =
  | {
      readonly ok: true;
      /** The run the title names. */
      readonly runId: string;
      /** Each section's text, trimmed of blank edge lines, {@link MORNING_EMPTY} when it has none; `Refused` first when present. */
      readonly sections: Record<string, string>;
      readonly questions: readonly MorningQuestion[];
    }
  | { readonly ok: false; readonly problems: readonly string[] };

const TITLE = /^# Morning list — (\S+)[ \t]*$/;
const HEADING = /^##(?!#)[ \t]+(.*?)[ \t]*$/;
const OTHER_FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const KINDS: readonly MorningKind[] = ["qa", "decision", "prerequisite", "held"];
const QUESTION_KEYS: ReadonlySet<string> = new Set(["id", "kind", "question", "options", "default", "source"]);
const QUESTION_ID = /^Q[1-9][0-9]*$/;
const OPTIONS_MIN = 2;
const OPTIONS_MAX = 9;
const TEXT_CAPS = { question: 500, option: 200, source: 300 } as const;
const HOW_TO_ANSWER: string = MORNING_SECTIONS[5];
const PREREQUISITES: string = MORNING_SECTIONS[2];
const NOT_DONE: string = MORNING_SECTIONS[4];

const sectionName = (name: string): string => `\`## ${name}\``;

/** Whether `line` closes a fence opened by the marker run `open` (three or more of one character). */
function closesFence(open: string, line: string): boolean {
  return new RegExp(`^ {0,3}${open.charAt(0) === "`" ? "`" : "~"}{${open.length},}[ \\t]*$`).test(line);
}

/**
 * One line as the pull request body prints it: {@link printableText}, then the
 * Unicode tag block stripped, which `printableText` keeps for the screens and
 * no injection screen reads before the body posts.
 */
function bodyText(line: string): string {
  return printableText(line).replace(UNICODE_TAG_CHARS, "");
}

/** Read a morning list strictly: every problem is named, and any problem refuses the whole list. */
export function parseMorning(text: string): MorningParse {
  const lines = text.split(/\r?\n/);
  const problems: string[] = [];

  const titleAt = lines.findIndex((line) => line.trim() !== "");
  if (titleAt === -1) return { ok: false, problems: ["the text is empty; a morning list opens with `# Morning list — <run-id>`"] };
  const titleRun = TITLE.exec(lines[titleAt] ?? "")?.[1];
  const runId = titleRun !== undefined && isRunId(titleRun) ? titleRun : null;
  if (runId === null) problems.push(`line ${titleAt + 1}: the title is not \`# Morning list — <run-id>\``);

  const known: ReadonlySet<string> = new Set([MORNING_REFUSED, ...MORNING_SECTIONS]);
  const bodies = new Map<string, string[]>();
  const blockLines: { readonly raw: string; readonly line: number }[] = [];
  const morningOpen = fenceOpenPattern(MORNING_FENCE);
  let current: string | null = null; // null before the first section, "" inside an unknown one
  let inBlock = false; // inside a stamity-morning block
  let blockOpenedAt = 0;
  let otherFence: string | null = null; // the marker run of any other open fence, whose lines are section text
  let blocks = 0;
  let strayReported = false;

  for (let index = titleAt + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNo = index + 1;
    if (inBlock) {
      if (FENCE_CLOSE_PATTERN.test(line)) inBlock = false;
      else if (blocks === 1) blockLines.push({ raw: line, line: lineNo });
      continue;
    }
    if (otherFence !== null) {
      if (closesFence(otherFence, line)) otherFence = null;
      if (current !== null && current !== "") bodies.get(current)?.push(line);
      continue;
    }
    if (morningOpen.test(line)) {
      blocks += 1;
      if (blocks > 1) problems.push(`line ${lineNo}: a second \`${MORNING_FENCE}\` block; the list carries exactly one`);
      else if (current !== HOW_TO_ANSWER) problems.push(`line ${lineNo}: the \`${MORNING_FENCE}\` block sits outside ${sectionName(HOW_TO_ANSWER)}`);
      inBlock = true;
      blockOpenedAt = lineNo;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      const name = heading[1] ?? "";
      if (!known.has(name)) {
        problems.push(`line ${lineNo}: unknown section ${quoteReportText(name)}`);
        current = "";
      } else if (bodies.has(name)) {
        problems.push(`line ${lineNo}: section ${sectionName(name)} appears twice`);
        current = "";
      } else {
        bodies.set(name, []);
        current = name;
      }
      continue;
    }
    const other = OTHER_FENCE_OPEN.exec(line);
    if (other !== null) otherFence = other[1] ?? "```";
    if (current === null) {
      if (line.trim() !== "" && !strayReported) {
        problems.push(`line ${lineNo}: text before the first section`);
        strayReported = true;
      }
    } else if (current !== "") {
      bodies.get(current)?.push(line);
    }
  }
  if (inBlock) problems.push(`line ${blockOpenedAt}: the \`${MORNING_FENCE}\` block opened here is never closed`);

  for (const name of MORNING_SECTIONS) if (!bodies.has(name)) problems.push(`missing section ${sectionName(name)}`);
  const present = [...bodies.keys()];
  if (bodies.has(MORNING_REFUSED) && present[0] !== MORNING_REFUSED) {
    problems.push(`${sectionName(MORNING_REFUSED)} is not the first section`);
  } else {
    const expected = [MORNING_REFUSED, ...MORNING_SECTIONS].filter((name) => bodies.has(name));
    if (expected.some((name, at) => present[at] !== name)) {
      const canonical = [...(bodies.has(MORNING_REFUSED) ? [MORNING_REFUSED] : []), ...MORNING_SECTIONS];
      problems.push(`sections out of order: expected ${canonical.map(sectionName).join(", ")}`);
    }
  }
  if (blocks === 0) problems.push(`no \`${MORNING_FENCE}\` block under ${sectionName(HOW_TO_ANSWER)}`);

  const questions = readQuestions(blockLines, problems);

  if (problems.length > 0 || runId === null) return { ok: false, problems };
  const sections: Record<string, string> = {};
  for (const name of [MORNING_REFUSED, ...MORNING_SECTIONS]) {
    const body = bodies.get(name);
    if (body !== undefined) sections[name] = trimBlankEdges(body);
  }
  return { ok: true, runId, sections, questions };
}

/** The block's question lines, each checked field by field; every problem is pushed onto `problems`. */
function readQuestions(blockLines: readonly { readonly raw: string; readonly line: number }[], problems: string[]): MorningQuestion[] {
  const questions: MorningQuestion[] = [];
  const ids = new Set<string>();
  for (const { raw, line } of blockLines) {
    if (raw.trim() === "") continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      value = undefined;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      problems.push(`line ${line}: not a JSON object`);
      continue;
    }
    const object = value as Record<string, unknown>;
    const own: string[] = [];
    for (const key of Object.keys(object)) if (!QUESTION_KEYS.has(key)) own.push(`unknown key ${quoteReportText(key)}`);
    for (const key of QUESTION_KEYS) if (!Object.hasOwn(object, key)) own.push(`missing ${JSON.stringify(key)}`);

    const id = object["id"];
    if (Object.hasOwn(object, "id")) {
      if (typeof id !== "string" || !QUESTION_ID.test(id)) own.push(`id ${quoteReportText(id)} is not Q<n>`);
      else if (ids.has(id)) own.push(`id ${id} appears twice`);
      else ids.add(id);
    }
    const kind = object["kind"];
    if (Object.hasOwn(object, "kind") && !(KINDS as readonly unknown[]).includes(kind)) {
      own.push(`kind ${quoteReportText(kind)} is not ${KINDS.slice(0, -1).join(", ")} or ${KINDS.at(-1) ?? ""}`);
    }
    if (Object.hasOwn(object, "question")) own.push(...textProblems("question", object["question"], TEXT_CAPS.question));
    if (Object.hasOwn(object, "source")) own.push(...textProblems("source", object["source"], TEXT_CAPS.source));

    const options = object["options"];
    let optionCount: number | null = null;
    if (Object.hasOwn(object, "options")) {
      if (!Array.isArray(options) || options.length < OPTIONS_MIN || options.length > OPTIONS_MAX) {
        own.push(`options is not a list of ${OPTIONS_MIN} to ${OPTIONS_MAX} strings`);
      } else {
        optionCount = options.length;
        options.forEach((option: unknown, at) => own.push(...textProblems(`option ${at + 1}`, option, TEXT_CAPS.option)));
      }
    }
    const fallback = object["default"];
    if (Object.hasOwn(object, "default")) {
      if (typeof fallback !== "number" || !Number.isInteger(fallback)) own.push(`default ${quoteReportText(fallback)} is not a whole number`);
      else if (optionCount !== null && (fallback < 1 || fallback > optionCount)) {
        own.push(`default ${fallback} is not an option number from 1 to ${optionCount}`);
      }
    }

    if (own.length > 0) {
      problems.push(...own.map((problem) => `line ${line}: ${problem}`));
      continue;
    }
    questions.push({
      id: id as string,
      kind: kind as MorningKind,
      question: object["question"] as string,
      options: [...(options as string[])],
      default: fallback as number,
      source: object["source"] as string,
    });
  }
  const qa = questions.filter((question) => question.kind === "qa").length;
  if (qa > MORNING_QA_MAX) problems.push(`${qa} qa questions; the list carries at most ${MORNING_QA_MAX}`);
  return questions;
}

/** The problems of one single-line text field. */
function textProblems(key: string, value: unknown, cap: number): string[] {
  if (typeof value !== "string") return [`${key} is not a string`];
  if (value.trim() === "") return [`${key} is empty`];
  const problems: string[] = [];
  if (/[\r\n]/.test(value)) problems.push(`${key} spans more than one line`);
  const length = Array.from(value).length;
  if (length > cap) problems.push(`${key} is ${length} characters, over the ${cap}-character cap`);
  return problems;
}

/** `lines` joined, with blank lines dropped from both ends; {@link MORNING_EMPTY} when nothing is left. */
function trimBlankEdges(lines: readonly string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] ?? "").trim() === "") start += 1;
  while (end > start && (lines[end - 1] ?? "").trim() === "") end -= 1;
  return start === end ? MORNING_EMPTY : lines.slice(start, end).join("\n");
}

/** One inferred row as the Prerequisites section prints it: kind · name · read where · set by · blocks · verified, never a value. */
function prereqLine(row: PrereqRow): string {
  return `- ${row.kind} · ${row.name} · ${row.where} · set by ${row.setBy} · blocks ${row.blocks} · verified ${row.verified ? "yes" : "no"} · inferred`;
}

/** One question as the body prints it, its default named. */
function questionLine(question: MorningQuestion): string {
  const options = question.options.map((option, at) => `${at + 1}. ${option}${at + 1 === question.default ? " (default)" : ""}`);
  return `- **${question.id}** (${question.kind}) ${question.question} — ${options.join(" · ")} — from ${question.source}`;
}

/** Whether `name` already stands in `text` as a whole word. */
function names(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`).test(text);
}

/**
 * The pull request body made from a morning list: the title, each section (a
 * section with no rows reading `none`), the inferred prerequisite rows the
 * section does not already name, the questions with their option numbers, and
 * `<!-- stamity:run <run-id> -->` as the last line, so a later run recognises
 * its own body (u4's marker rule, u4's {@link runMarker}). Control and bidi
 * characters and the Unicode tag block are dropped.
 *
 * Past `maxChars` ({@link PR_BODY_MAX_CHARS} by default) the body keeps the
 * title, every heading, `## Refused` and `## Not done:` first, then the other
 * sections' first rows, one row of each a round, and names `morning.md` for
 * the rest; a cut section closes any fence its kept rows left open, then ends
 * on `…`, and the marker stays
 * last. A list that does not parse, or that names another run, becomes a
 * `## Not done:` body naming its problems, so a run still hands off. The body
 * is not screened here: the caller runs {@link screenOutbound} on it.
 *
 * Throws when `runId` is not a run id or `maxChars` is under {@link PR_BODY_MIN_CHARS}.
 */
export function prBodyFrom(text: string, runId: string, opts: { inferred?: readonly PrereqRow[]; maxChars?: number } = {}): string {
  const path = runRelPath(runId, MORNING_FILE); // throws on a value that is not a run id, so no text can close the marker early
  const marker = runMarker(runId);
  const maxChars = opts.maxChars ?? PR_BODY_MAX_CHARS;
  if (!Number.isInteger(maxChars) || maxChars < PR_BODY_MIN_CHARS) {
    throw new EngineError(`maxChars ${maxChars} is under ${PR_BODY_MIN_CHARS}`, {
      code: "VALIDATION_ERROR",
      why: "the body must hold the title, every heading, the pointer to morning.md and the marker",
    });
  }
  const title = `# Morning list — ${runId}`;
  const parsed = parseMorning(text);
  const problems = !parsed.ok
    ? parsed.problems
    : parsed.runId !== runId
      ? [`the title names run ${parsed.runId}, not ${runId}`]
      : [];

  const sections: { readonly name: string; readonly lines: readonly string[] }[] = [];
  if (!parsed.ok || problems.length > 0) {
    const lines = [`- \`${path}\` does not parse, so this body carries none of it:`, ...problems.map((problem) => `  - ${problem}`)];
    sections.push({ name: NOT_DONE, lines: lines.map(bodyText) });
  } else {
    for (const [name, body] of Object.entries(parsed.sections)) {
      let lines = body === MORNING_EMPTY ? [] : body.split("\n");
      if (name === PREREQUISITES) {
        const rows = (opts.inferred ?? []).filter((row) => !names(body, row.name)).map(prereqLine);
        lines = rows.length === 0 || lines.length === 0 ? [...lines, ...rows] : [...lines, "", ...rows];
      }
      if (name === HOW_TO_ANSWER && parsed.questions.length > 0) {
        const asked = parsed.questions.map(questionLine);
        lines = lines.length === 0 ? asked : [...lines, "", ...asked];
      }
      sections.push({ name, lines: (lines.length === 0 ? [MORNING_EMPTY] : lines).map(bodyText) });
    }
  }
  return fitBody(title, sections, marker, `_Cut to fit ${maxChars} characters: the whole list is \`${path}\`._`, maxChars);
}

/** The body whole when it fits, else cut as {@link prBodyFrom} names. */
function fitBody(
  title: string,
  sections: readonly { readonly name: string; readonly lines: readonly string[] }[],
  marker: string,
  pointer: string,
  maxChars: number,
): string {
  const render = (kept: readonly (readonly string[])[], cut: readonly boolean[], cutAny: boolean): string => {
    const out = [title, ""];
    sections.forEach((section, at) => out.push(`## ${section.name}`, "", ...(kept[at] ?? []), ...(cut[at] ? ["…"] : []), ""));
    if (cutAny) out.push(pointer, "");
    out.push(marker);
    return out.join("\n");
  };
  const whole = render(
    sections.map((section) => section.lines),
    sections.map(() => false),
    false,
  );
  if (whole.length <= maxChars) return whole;

  // Every line costs its length and one newline; the join drops the last newline.
  const fixed = [title, "", ...sections.flatMap((section) => [`## ${section.name}`, "", "…", ""]), pointer, "", marker];
  let budget = maxChars - (fixed.reduce((sum, line) => sum + line.length + 1, 0) - 1);
  if (budget < 0) {
    throw new EngineError(`maxChars ${maxChars} cannot hold the list's headings`, {
      code: "VALIDATION_ERROR",
      why: "the body must hold the title, every heading, the pointer to morning.md and the marker",
    });
  }

  const kept: string[][] = sections.map(() => []);
  const cut: boolean[] = sections.map(() => false);
  // The marker run of a fence a section's kept rows left open: its closing line is held in reserve
  // from the moment the fence opens, so a cut can always close it before the `…`, the pointer and the marker.
  const fences: (string | null)[] = sections.map(() => null);
  const take = (at: number, line: string): boolean => {
    const open = fences[at] ?? null;
    const next = open === null ? (OTHER_FENCE_OPEN.exec(line)?.[1] ?? null) : closesFence(open, line) ? null : open;
    const reserve = (fence: string | null): number => (fence === null ? 0 : fence.length + 1);
    const cost = line.length + 1 + reserve(next) - reserve(open);
    if (cost > budget) return false;
    kept[at]?.push(line);
    budget -= cost;
    fences[at] = next;
    return true;
  };
  const cutAt = (at: number): void => {
    const open = fences[at] ?? null;
    if (open !== null) kept[at]?.push(open);
    fences[at] = null;
    cut[at] = true;
  };
  // `## Refused` and `## Not done:` first, whole while they fit; the line that does not is cut to what is left.
  const first = sections.flatMap((section, at) => (section.name === MORNING_REFUSED || section.name === NOT_DONE ? [at] : []));
  for (const at of first) {
    for (const line of sections[at]?.lines ?? []) {
      if (cut[at] === true) break;
      if (take(at, line)) continue;
      if (budget >= 2) {
        let head = line.slice(0, budget - 2);
        if (/[\uD800-\uDBFF]$/.test(head)) head = head.slice(0, -1);
        take(at, `${head}…`);
      }
      cutAt(at);
    }
  }
  // Then the other sections' first rows, one row of each section a round, so every section keeps its head.
  const rest = sections.flatMap((_section, at) => (first.includes(at) ? [] : [at]));
  for (let row = 0; rest.some((at) => cut[at] !== true && row < (sections[at]?.lines.length ?? 0)); row += 1) {
    for (const at of rest) {
      const line = sections[at]?.lines[row];
      if (line === undefined || cut[at] === true) continue;
      if (!take(at, line)) cutAt(at);
    }
  }
  return render(kept, cut, true);
}

/**
 * A person's answers to the list's questions: `Q1→2, Q3→1` (`->` too), after
 * an optional `@<agent> answers:` label, pieces split on commas, semicolons
 * and line breaks. A piece that is not `Q<n>→<option>`, names no question,
 * picks an option the question does not have, or answers a question twice
 * (both answers then dropped) is refused with its reason, and never applied.
 */
export function parseAnswers(
  text: string,
  questions: readonly MorningQuestion[],
): { answers: Map<string, number>; refused: { id: string; reason: string }[] } {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const answers = new Map<string, number>();
  const refused: { id: string; reason: string }[] = [];
  const named = new Set<string>(); // ids a well-formed piece answered, in range or not
  const twice = new Set<string>();
  const body = text.trim().replace(/^(?:@[\w-]+\s+)?answers\s*:\s*/i, "");
  for (const raw of body.split(/[,;\r\n]+/)) {
    const piece = raw.trim();
    if (piece === "") continue;
    const match = /^(Q[1-9][0-9]*)\s*(?:→|->)\s*([1-9][0-9]*)$/i.exec(piece);
    if (match === null) {
      refused.push({ id: quoteReportText(printableText(piece)), reason: "not Q<n>→<option>" });
      continue;
    }
    const id = (match[1] ?? "").toUpperCase();
    const option = Number(match[2]);
    const question = byId.get(id);
    if (question === undefined) {
      refused.push({ id, reason: "no such question" });
    } else if (twice.has(id)) {
      continue;
    } else if (named.has(id)) {
      // The repeat is checked before the range, so an out-of-range answer still voids the other one.
      answers.delete(id);
      twice.add(id);
      refused.push({ id, reason: "answered more than once" });
    } else {
      named.add(id);
      if (option > question.options.length) {
        refused.push({ id, reason: `option ${match[2] ?? ""} is not one of 1 to ${question.options.length}` });
      } else {
        answers.set(id, option);
      }
    }
  }
  return { answers, refused };
}

/**
 * The screen an outbound text passes before it posts (REQ-FLOW-103): the
 * change scan's patterns over every line, `label` standing as the path (it
 * picks the scan's file-type rules, so a plain label reads the text as
 * prose). A hit names its 1-based line and rule, never any part of the value;
 * a line past the scan's cap is not read and is reported as
 * {@link OUTBOUND_LINE_PAST_CAP}, so it can never pass as clean.
 */
export function screenOutbound(text: string, label: string): { ok: boolean; hits: { line: number; rule: string }[] } {
  const file = { path: label, added: text.split(/\r?\n/).map((line, at) => ({ line: at + 1, text: line })) };
  const hits = [
    ...scanAddedLines([file]).map(({ line, rule }) => ({ line, rule })),
    ...linesPastCap([file]).map(({ line }) => ({ line, rule: OUTBOUND_LINE_PAST_CAP })),
  ].toSorted((a, b) => a.line - b.line);
  return { ok: hits.length === 0, hits };
}
