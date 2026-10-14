import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

/**
 * The page readers `test/docsPages.test.ts` and `test/records/docsPages.test.ts` share: a heading's
 * section of a page, and the two texts that state the release eval rule — the release checklist's
 * eval line and SET-v7's incremental section — with the path readers those texts are held through.
 *
 * ADDED 2026-10-14 (run 2026-10-13_records-branch, ledger build/10): the records suite held copies
 * of these six helpers when the cases that read the run of record's records moved there, so the
 * two copies could drift apart. They live here once, unchanged, and both files import them.
 */

/** Repo root, resolved from this file rather than from the process cwd. */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const read = (relPath: string): string => readFileSync(join(REPO_ROOT, relPath), "utf-8");

const lines = (text: string): string[] => text.replace(/\n$/, "").split("\n");

const collapsed = (text: string): string => text.replace(/\s+/g, " ");

/**
 * One heading's section of a page: from the heading line to the next heading of the same or a
 * higher level, or the page's end. Lines inside a fenced block are never read as headings, so a
 * shell comment in a command block cannot end a section early. Empty when the heading is absent,
 * so a pin reading it fails on its own non-empty assertion rather than on a thrown index.
 */
export function sectionOf(text: string, heading: string): string {
  const all = lines(text);
  const start = all.indexOf(heading);
  if (start === -1) return "";
  const level = (/^#+/.exec(heading)?.[0] ?? "").length;
  let fenced = false;
  for (let at = start + 1; at < all.length; at += 1) {
    const line = all[at] ?? "";
    if (line.startsWith("```")) fenced = !fenced;
    const depth = fenced ? 0 : (/^(#+) /.exec(line)?.[1] ?? "").length;
    if (depth > 0 && depth <= level) return all.slice(start, at).join("\n");
  }
  return all.slice(start).join("\n");
}

// ADDED 2026-10-08 (unit c3-release-rules). REQ-PROVE-033: the trigger list is stated in two places
// a person reads — the release checklist's eval line and SET-v7's incremental section.
export const RELEASE_CHECKLIST = ".github/release-controls-checklist.md";
export const EVAL_SET = "evals/SET-v7.md";
/** A per-release line opens "One line …" or "A <ordinal> line …" in the checklist's section. */
const PER_RELEASE_LEAD = /^(?:One|A [a-z]+) line\b/;

/** A section of a file read through `sectionOf`, refused when the heading is absent. */
export const fileSection = (path: string, heading: string): string => {
  const section = sectionOf(read(path), heading);
  expect(section, `${path} has no "${heading}" section`).not.toBe("");
  return section;
};

/** Each per-release line with the paragraphs that follow it up to the next line. */
export const perReleaseLines = (): string[] => {
  const found: string[] = [];
  for (const paragraph of fileSection(RELEASE_CHECKLIST, "## Per-release record currency").split(
    /\n\s*\n/,
  )) {
    const text = paragraph.trim();
    if (PER_RELEASE_LEAD.test(text)) found.push(text);
    else if (found.length > 0) found[found.length - 1] = `${found.at(-1) ?? ""}\n\n${text}`;
  }
  return found;
};

/** The two texts that state the release rule, whitespace-collapsed. */
export const releaseRuleTexts = (): ReadonlyArray<readonly [string, string]> => {
  const evalLine = perReleaseLines().find((line) => line.startsWith("A second line"));
  expect(evalLine, `${RELEASE_CHECKLIST} has no "A second line" (the eval line)`).toBeDefined();
  return [
    [`${RELEASE_CHECKLIST}'s eval line`, collapsed(evalLine ?? "")],
    [
      `${EVAL_SET}'s incremental section`,
      collapsed(fileSection(EVAL_SET, "## Incremental runs — declared 2026-09-15")),
    ],
  ];
};

/** The backticked repository paths a text names. */
export const namedPaths = (text: string): string[] =>
  [...text.matchAll(/`(\.?[\w-]+(?:\/[\w.*-]+)+)`/g)].map((match) => match[1] ?? "");

/** The paths no named path covers; a named `dir/**` covers everything under `dir/`. */
export const uncovered = (paths: Iterable<string>, named: readonly string[]): string[] =>
  [...paths].filter(
    (path) =>
      !named.some((pattern) =>
        pattern.endsWith("/**") ? path.startsWith(pattern.slice(0, -2)) : pattern === path,
      ),
  );
