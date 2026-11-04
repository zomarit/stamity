import { createHash } from "node:crypto";
import { stringify } from "yaml";
import { scanNormalized } from "../denyscan/denyScan.ts";
import { LEARNINGS_SCREEN_PATTERNS, printableText } from "../learnings/validation.ts";
import { parsePlanUnits } from "./planCoverage.ts";
import { RUN_CONTRACT_VERSION } from "./runContract.ts";

/**
 * A ready item, read (REQ-FLOW-155): a filed body's parts and the run contract `stamity run
 * contract` makes of them. A body with a plan runs summary, `## Acceptance criteria`, `Branch:`,
 * `Plan:`, `Ref:`, marker; a plain item keeps its old body, criteria, `Ref:`, marker, and reads
 * with no plan, which the verb refuses. Links count only in the block closing the body, and a
 * repeated or malformed one reads as absent, so a body cannot point past its own last lines.
 *
 * The text above the links is read as a person sees it on the page: control and invisible
 * characters stripped, then HTML comments dropped, in that order, since a stripped character can
 * complete an opener and a comment can hide a heading. The criteria stop at the next heading.
 * Pure, erasable syntax only.
 */

/** GitHub's bound on a body, 65,536 characters of at most four bytes each. */
export const ITEM_BODY_MAX_BYTES = 262_144;
/** The most criteria {@link criteriaHits} reads: on a run of blank lines the scan takes about three seconds here and over three minutes at the body's bound. */
export const CRITERIA_MAX_BYTES = 16_384;

export interface ItemBody {
  summary: string;
  acceptance: string;
  branch: string | null;
  plan: { path: string; hash: string } | null;
  ref: string | null;
}

const HEADING = /^## Acceptance criteria$/i;
const CLOSING_LINE = /^(?:(?:Branch|Plan|Ref):|<!-- stamity:item .+ -->$|$)/;
const PLAN_LINK = /^(docs\/plans\/[A-Za-z0-9][A-Za-z0-9._-]*\.md)\s+([0-9a-f]{12})$/;
const BRANCH_LINK = /^\S{1,255}$/;
/** A word of a `files` cell that names a path: it holds a slash, or ends in a file extension. */
const PATH_WORD = /^[\w\p{L}\p{N}.*@<>/()[\]+$-]*(?:\/[\w\p{L}\p{N}.*@<>/()[\]+$-]*|\.\w+)$/u;
/** What parts a `files` cell's words: a comma or a space, and a bracket only where it opens or closes a word, so `(generated)` parts and `src/(auth)/a.ts` holds. */
const FILES_WORD_BREAK = /[\s,;]+|(?<![^\s])\(|\)(?![^\s,;.:])/;
const NEXT_HEADING = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const LIST_ITEM = /^\s*(?:[-*+]|[0-9]+[.)])\s/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** Blank lines off both ends; an indent and every inner line stay as written. No regex: `\s+$` is quadratic on a body of spaces. */
const verbatim = (lines: readonly string[]): string => lines.slice(Math.max(lines.findIndex((line) => line.trim() !== ""), 0)).join("\n").trimEnd();

/**
 * `text` with each HTML comment replaced by a space; one with no end runs to the end, as the page hides it. The space
 * keeps two halves of an opener from closing up where a comment sat. No regex: a lazy match is quadratic on a body of openers.
 */
function withoutComments(text: string): string {
  let kept = "";
  let from = 0;
  for (let open = text.indexOf("<!--"); open >= 0; open = text.indexOf("<!--", from)) {
    kept += `${text.slice(from, open)} `;
    const close = text.indexOf("-->", open + 2);
    if (close < 0) return kept;
    from = close + 3;
  }
  return kept + text.slice(from);
}

/** `lines` up to the next heading, `#` or underlined, outside a fence. A rule under a list item is no underline. */
function untilHeading(lines: readonly string[]): readonly string[] {
  let fence = "";
  const end = lines.findIndex((line, at) => {
    const mark = FENCE.exec(line)?.[1] ?? "";
    if (fence !== "") {
      if (mark.startsWith(fence) && line.trim() === mark) fence = "";
      return false;
    }
    fence = mark;
    if (mark !== "") return false;
    return NEXT_HEADING.test(line) || (line.trim() !== "" && !LIST_ITEM.test(line) && UNDERLINE.test(lines[at + 1] ?? ""));
  });
  return end < 0 ? lines : lines.slice(0, end);
}

/** A planned body with no heading has no line between summary and criteria, so none of it counts as criteria. */
export function parseItemBody(body: string): ItemBody {
  const lines = body.split(/\r?\n/);
  const end = lines.findLastIndex((line) => !CLOSING_LINE.test(line.trim())) + 1;
  const links = lines.slice(end).map((line) => line.trim());
  const link = (label: string): string | null => {
    const [value, ...more] = links.filter((line) => line.startsWith(`${label}:`)).map((line) => line.slice(label.length + 1).trim());
    return value === undefined || value === "" || more.length > 0 ? null : value;
  };
  const plan = PLAN_LINK.exec(link("Plan") ?? "");
  const branch = link("Branch");
  const shown = withoutComments(printableText(lines.slice(0, end).join("\n"), "\t\n")).split("\n");
  const heading = shown.findIndex((line) => HEADING.test(line.trim()));
  const acceptance = heading >= 0 ? shown.slice(heading + 1) : plan === null ? shown : [];
  return {
    summary: verbatim(shown.slice(0, Math.max(heading, 0))),
    acceptance: verbatim(untilHeading(acceptance)),
    branch: branch !== null && BRANCH_LINK.test(branch) ? branch : null,
    plan: plan === null ? null : { path: plan[1] ?? "", hash: plan[2] ?? "" },
    ref: link("Ref"),
  };
}

/**
 * The block rows `acceptance` hits, by pattern id, sorted and unique: the ids alone, since the text is what the scan
 * caught. The learnings' screen, because this text re-enters an agent's context as a learning does; raw and folded, as
 * every gate on untrusted text reads it. Call it on what {@link parseItemBody} returns, which is already stripped.
 */
export function criteriaHits(acceptance: string): string[] {
  const blocked = scanNormalized(acceptance, LEARNINGS_SCREEN_PATTERNS).filter((hit) => hit.severity === "block");
  return [...new Set(blocked.map((hit) => hit.patternId))].toSorted();
}

/** The first twelve hex digits of the sha256 of a plan's text, as a `Plan:` line carries them. */
export function planHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/** The union of a plan's units' `files`, each path once. The cells are prose, so the paths are read out of their words. */
export function planFiles(planText: string): string[] {
  const words = parsePlanUnits(planText).flatMap((unit) => (unit.fields["files"] ?? "").split(FILES_WORD_BREAK));
  return [...new Set(words.map((word) => word.replace(/[.:]+$/, "")).filter((word) => PATH_WORD.test(word)))];
}

/** The contract's text. Of the item it takes the criteria and the `Plan:` path alone, and no summary. */
export function contractFromItem(item: ItemBody, facts: { base: string; files: string[]; itemRef: string; author: string }): string {
  if (item.plan === null) throw new Error("an item with no `Plan:` line makes no contract");
  return stringify(
    {
      "run-contract": RUN_CONTRACT_VERSION,
      plan: item.plan.path,
      item: facts.itemRef,
      base: facts.base,
      acceptance: item.acceptance,
      scope: { in: facts.files },
      answerer: `@${facts.author}`,
    },
    { lineWidth: 0 },
  );
}
