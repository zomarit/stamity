import { createHash } from "node:crypto";
import { stringify } from "yaml";
import { parsePlanUnits } from "./planCoverage.ts";
import { RUN_CONTRACT_VERSION } from "./runContract.ts";

/**
 * A ready item, read (REQ-FLOW-155): a filed body's parts and the run contract `stamity run
 * contract` makes of them. A body with a plan runs summary, `## Acceptance criteria`, `Branch:`,
 * `Plan:`, `Ref:`, marker; a plain item keeps its old body, criteria, `Ref:`, marker, and reads
 * with no plan, which the verb refuses. Links count only in the block closing the body, and a
 * repeated or malformed one reads as absent, so a body cannot point past its own last lines.
 * Pure, erasable syntax only.
 */

/** GitHub's bound on a body, 65,536 characters of at most four bytes each. */
export const ITEM_BODY_MAX_BYTES = 262_144;

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
const PATH_WORD = /^[\w.*@<>/-]*(?:\/[\w.*@<>/-]*|\.\w+)$/;

/** Blank lines off both ends; an indent and every inner line stay as written. No regex: `\s+$` is quadratic on a body of spaces. */
const verbatim = (lines: readonly string[]): string => lines.slice(Math.max(lines.findIndex((line) => line.trim() !== ""), 0)).join("\n").trimEnd();

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
  const heading = lines.slice(0, end).findIndex((line) => HEADING.test(line.trim()));
  const acceptance = heading >= 0 ? lines.slice(heading + 1, end) : plan === null ? lines.slice(0, end) : [];
  return {
    summary: verbatim(lines.slice(0, Math.max(heading, 0))),
    acceptance: verbatim(acceptance),
    branch: branch !== null && BRANCH_LINK.test(branch) ? branch : null,
    plan: plan === null ? null : { path: plan[1] ?? "", hash: plan[2] ?? "" },
    ref: link("Ref"),
  };
}

/** The first twelve hex digits of the sha256 of a plan's text, as a `Plan:` line carries them. */
export function planHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/** The union of a plan's units' `files`, each path once. The cells are prose, so the paths are read out of their words. */
export function planFiles(planText: string): string[] {
  const words = parsePlanUnits(planText).flatMap((unit) => (unit.fields["files"] ?? "").split(/[\s,;()]+/));
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
