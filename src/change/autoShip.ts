/**
 * The auto-ship rules (REQ-FLOW-152): whether a change fits what
 * `autonomy.autoShip` declares, so `run land` may merge it onto a deploying
 * branch with nobody asked. Every rule holds, or the land asks and names each
 * one that did not; what cannot be read counts as not holding.
 *
 * Pure: no filesystem, no git. Beside the types, one import, the classifier's
 * matcher, so `paths` reads as every other path glob here does. The classifier
 * must not import this module: CI loads its closure with no install.
 */
import type { AutoShipConfig } from "../types/manifest.ts";
import { matchGlob, type ClassifyResult } from "./classify.ts";

export type AutoShipRules = AutoShipConfig;

/** What the change is, read from the range that merges. */
export interface AutoShipFacts {
  result: ClassifyResult;
  files: number;
  /** Added plus removed lines; `null` when a file gave no count. */
  lines: number | null;
  /** Whether every changed file was read and classified. */
  complete: boolean;
}

export type AutoShipVerdict = { eligible: true; evidence: string } | { eligible: false; reasons: string[] };

/** At most this many paths are named in one reason; the rest are counted. */
const PATHS_NAMED = 5;

/**
 * The endings a `docs` path may carry with nobody asked. The class takes any file
 * that is not code or config, a served page included, and it now grants a merge,
 * so here it means plain text, whatever `classes` and `paths` declare.
 */
const PLAIN_TEXT_ENDINGS = [".md", ".txt"];

function isPlainText(path: string): boolean {
  const lowered = path.toLowerCase();
  return PLAIN_TEXT_ENDINGS.some((ending) => lowered.endsWith(ending));
}

function namedPaths(paths: readonly string[], where: string): string {
  const named = paths.slice(0, PATHS_NAMED).join(", ");
  if (paths.length > PATHS_NAMED) return `${named} and ${paths.length - PATHS_NAMED} more are ${where}`;
  return `${named} ${paths.length === 1 ? "is" : "are"} ${where}`;
}

/** The file limit's reason, one wording for this verdict and for a land that stops on GitHub's count before any read. */
export function filesOverLimit(files: number, maxFiles: number): string {
  return `${files} files are over autonomy.autoShip.maxFiles (${maxFiles})`;
}

/**
 * Every rule the change fails, or the evidence naming each one it met. The class
 * rule reads `result.class` beside each path's class, since a crossing rename or
 * an unscanned file raises the change above all of its paths. Paths match case by
 * case and literally: a `byPath` name is git's, and neither folding case nor
 * reading a backslash as a separator may bring a path inside the limit. `files`
 * counts as `byPath` does, a rename's two sides as two: a count that disagrees
 * means one of the two reads is wrong, so neither vouches for the change.
 */
export function autoShipVerdict(facts: AutoShipFacts, rules: AutoShipRules | null): AutoShipVerdict {
  if (rules === null) return { eligible: false, reasons: ["autonomy.autoShip is off"] };
  const { result, files, lines, complete } = facts;
  const { maxFiles, maxLines, classes, paths } = rules;
  const reasons: string[] = [];
  if (!complete) reasons.push("the classification is incomplete");
  if (lines === null) reasons.push("the line count is incomplete");
  else if (!Number.isFinite(lines)) reasons.push("the line count is not a finite number");
  else if (lines > maxLines) reasons.push(`${lines} lines are over autonomy.autoShip.maxLines (${maxLines})`);
  const empty = files === 0 || result.byPath.length === 0;
  if (empty) reasons.push("the change is empty");
  else if (files !== result.byPath.length) reasons.push(`the file count (${files}) disagrees with the classified paths (${result.byPath.length})`);
  if (files > maxFiles) reasons.push(filesOverLimit(files, maxFiles));
  const seen = [...new Set([result.class, ...result.byPath.map((entry) => entry.class)])];
  const unnamed = seen.filter((name) => !classes.includes(name));
  // An empty change reads `product` only because nothing was named, so its own reason stands alone.
  if (!empty && unnamed.length > 0) reasons.push(`${unnamed.join(", ")} ${unnamed.length === 1 ? "is" : "are"} outside autonomy.autoShip.classes (${classes.join(", ")})`);
  const notPlain = result.byPath.filter((entry) => entry.class === "docs" && !isPlainText(entry.path)).map((entry) => entry.path);
  if (notPlain.length > 0) reasons.push(namedPaths(notPlain, `docs-class but not plain text (${PLAIN_TEXT_ENDINGS.join(", ")})`));
  if (paths !== undefined) {
    const outside = result.byPath.map((entry) => entry.path).filter((path) => !paths.some((glob) => matchGlob(path, glob, { literal: true })));
    if (outside.length > 0) reasons.push(namedPaths(outside, "outside autonomy.autoShip.paths"));
  }
  if (result.lenses.length > 0) reasons.push(`a specialist lens is asked for: ${result.lenses.join(", ")}`);
  if (reasons.length > 0 || lines === null) return { eligible: false, reasons };
  const under = paths === undefined ? "" : `every path under ${paths.join(", ")}; `;
  return {
    eligible: true,
    evidence: `auto-ship rules met: ${files} of at most ${maxFiles} files; ${lines} of at most ${maxLines} lines; class ${seen.join(", ")} among ${classes.join(", ")}; ${under}no specialist lens`,
  };
}
