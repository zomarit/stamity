// The eval-locator gate: a sealed brief quotes text the corpus still carries.
//
// A case's `source:` is a literal, not a derivation, and its inlined governing text is a
// copy. Both drift the moment the corpus moves, and both drift silently — a stale brief
// still runs, still scores, and measures a version of the product that no longer exists.
// v3 found 22 of the 35 carried cases in exactly that state. This gate is why the next
// one is a red test instead of a discovery.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CASES_DIR, REPO_ROOT, caseFiles, parseSource } from "./support.ts";

/** The frontmatter contract: five required keys, one optional, nothing else. */
const REQUIRED_KEYS = ["id", "class", "claim", "source", "metric"] as const;
const OPTIONAL_KEYS = ["floor"] as const;
const CLASSES = new Set(["golden", "adversarial", "probe"]);
const METRICS = new Set(["rubric", "refusal", "classification"]);

const cases = caseFiles();
const fileCache = new Map<string, string[]>();

const linesOf = (relPath: string): string[] => {
  const cached = fileCache.get(relPath);
  if (cached) return cached;
  const lines = readFileSync(join(REPO_ROOT, ...relPath.split("/")), "utf8").split("\n");
  fileCache.set(relPath, lines);
  return lines;
};

interface GoverningBlock {
  /** The corpus file the block's heading names. */
  readonly target: string;
  /** True when the heading names the case's own source path, so the range applies. */
  readonly restricted: boolean;
  /** 1-indexed line of the opening fence, for the failure message. */
  readonly fenceLine: number;
  readonly body: readonly string[];
}

/**
 * A governing block is a ```text fence whose heading paragraph names a corpus path —
 * either explicitly, in backticks, or by the phrase "the same file", which means the
 * case's own `source:` path. Fences with no such heading are scenario fixtures (a handed
 * file, a tool result, a refused draft) and are not corpus quotes, so they are not checked
 * against the corpus.
 */
const governingBlocks = (bodyLines: readonly string[], sourcePath: string): GoverningBlock[] => {
  const blocks: GoverningBlock[] = [];
  const at = (position: number): string => bodyLines[position] ?? "";
  for (let index = 0; index < bodyLines.length; index += 1) {
    if (at(index).trim() !== "```text") continue;
    let cursor = index - 1;
    while (cursor >= 0 && at(cursor).trim() === "") cursor -= 1;
    const heading: string[] = [];
    while (cursor >= 0 && at(cursor).trim() !== "") {
      heading.unshift(at(cursor));
      cursor -= 1;
    }
    const headingText = heading.join(" ");
    const named = /`(content\/[^`]+\.md)`/.exec(headingText);
    let target: string | null = null;
    if (named) target = named[1] ?? null;
    else if (/Governing text\s+—\s+the same file/.test(headingText)) target = sourcePath;
    if (target === null) continue;
    const body: string[] = [];
    let end = index + 1;
    while (end < bodyLines.length && at(end).trim() !== "```") {
      body.push(at(end));
      end += 1;
    }
    blocks.push({ target, restricted: target === sourcePath, fenceLine: index + 1, body });
  }
  return blocks;
};

/** The case-side inputs the range anchor check reads, so a synthetic case can be held to it. */
interface AnchoredCase {
  readonly path: string;
  readonly source: string;
  readonly bodyLines: readonly string[];
}

/**
 * True when a block line quoting with `[...]` elisions quotes this very corpus line: its opening
 * fragment is the line's own start, and every later fragment follows in order. A quote that opens
 * on an elision carries no start and anchors nothing — the elision is the verbatim gate's quote
 * form, not a way around this check.
 */
const elidedQuoteOf = (quote: string, line: string): boolean => {
  const [head = "", ...rest] = quote.split("[...]");
  const opening = head.trimEnd();
  if (opening.trim() === "" || !line.startsWith(opening)) return false;
  let cursor = opening.length;
  for (const part of rest) {
    const fragment = part.trim();
    if (fragment === "") continue;
    const found = line.indexOf(fragment, cursor);
    if (found === -1) return false;
    cursor = found + fragment.length;
  }
  return true;
};

/**
 * Every `source:` range has to start where the case says it does: the first non-blank line of
 * each range must appear (a) in a governing block restricted to the case's own source path,
 * (b) as a line of the case body once a leading `> ` is stripped — a scenario that blockquotes
 * its governing fence — or (c), for a range that opens on a frontmatter `description:` line, as
 * that description verbatim in the body. The verbatim gate above reads quoted blocks only, so a
 * case with no restricted block could carry a stale range and stay green; this one reads every
 * range of every case. Returns one message per unanchored range, each naming the case and range.
 */
const unanchoredRanges = (input: AnchoredCase, sourceLines: readonly string[]): string[] => {
  const parsed = parseSource(input.source);
  if (!parsed) return [`${input.path}: unparsable source \`${input.source}\``];
  const restrictedLines = governingBlocks(input.bodyLines, parsed.path)
    .filter((block) => block.restricted)
    .flatMap((block) => block.body);
  const restricted = new Set(restrictedLines);
  const elided = restrictedLines.filter((line) => line.includes("[...]"));
  const unquoted = new Set(input.bodyLines.map((line) => line.replace(/^> /, "")));
  const bodyText = input.bodyLines.join("\n");
  const frontmatterEnd = sourceLines[0] === "---" ? sourceLines.indexOf("---", 1) : -1;
  const failures: string[] = [];
  for (const [from, to] of parsed.ranges) {
    let index = from - 1;
    while (index < to && index < sourceLines.length && (sourceLines[index] ?? "").trim() === "") {
      index += 1;
    }
    const first = index < to ? sourceLines[index] : undefined;
    const label = `${parsed.path}:${from}-${to}`;
    if (first === undefined) {
      failures.push(`${input.path}: source range ${label} carries no non-blank line`);
      continue;
    }
    if (restricted.has(first) || unquoted.has(first)) continue;
    if (elided.some((quote) => elidedQuoteOf(quote, first))) continue;
    const description = /^description:[ \t]*(.*)$/.exec(first);
    if (description && index < frontmatterEnd) {
      const value = (description[1] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2");
      if (value.length > 0 && bodyText.includes(value)) continue;
    }
    failures.push(
      `${input.path}: source range ${label} opens on line ${index + 1}, ${JSON.stringify(first)}, which no restricted governing block, no body line and no quoted description carries`,
    );
  }
  return failures;
};

describe("eval case locators — the roster is not vacuous", () => {
  it("reads case files out of every class directory", () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
    for (const group of ["golden", "adversarial", "probes"]) {
      expect(
        cases.filter((file) => file.group === group).length,
        `no case files found under ${CASES_DIR}/${group}`,
      ).toBeGreaterThan(0);
    }
  });

  it("finds at least one governing block to check", () => {
    const total = cases.reduce((sum, file) => {
      const parsed = parseSource(file.frontmatter.get("source") ?? "");
      if (!parsed) return sum;
      return sum + governingBlocks(file.bodyLines, parsed.path).length;
    }, 0);
    expect(total, "no governing blocks were found — the heading parser has stopped matching").toBeGreaterThan(20);
  });
});

/**
 * The range anchor check against inline cases. A synthetic case stands in for a stale one
 * because no real case may be stale at HEAD; it lives here as a string, never under `evals/`,
 * so the roster and the case index never see it.
 */
describe("eval case locators — the range anchor check is not vacuous", () => {
  const SOURCE_PATH = "content/commands/st-synthetic.md";
  // The corpus file after a one-line insert above the governed text: the two governed lines
  // moved from 3-4 to 4-5.
  const SOURCE_LINES = [
    "# Synthetic command",
    "Intro line.",
    "A line inserted above the governed text.",
    "Run every gate before done.",
    "Report each gate with its exit code.",
    "",
  ];
  const BODY = [
    "## Brief",
    "",
    `Governing text — \`${SOURCE_PATH}\`:`,
    "",
    "```text",
    "Run every gate before done.",
    "Report each gate with its exit code.",
    "```",
    "",
  ].join("\n");
  const synthetic = (source: string, body: string = BODY): AnchoredCase => ({
    path: "synthetic/stale-range.md",
    source,
    bodyLines: body.split("\n"),
  });

  it("fails a range left one line off, naming the case and the range", () => {
    const failures = unanchoredRanges(synthetic(`${SOURCE_PATH}:3-4`), SOURCE_LINES);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("synthetic/stale-range.md");
    expect(failures[0]).toContain(`${SOURCE_PATH}:3-4`);
  });

  it("passes the same case once its range is re-anchored", () => {
    expect(unanchoredRanges(synthetic(`${SOURCE_PATH}:4-5`), SOURCE_LINES)).toEqual([]);
  });

  it("fails only the stale range of a multi-range source", () => {
    const failures = unanchoredRanges(synthetic(`${SOURCE_PATH}:4-5,2-2`), SOURCE_LINES);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("2-2");
  });

  it("anchors a range in a blockquoted fence once the leading `> ` is stripped", () => {
    const quoted = [
      "Scenario state:",
      "",
      "> ```text",
      "> Run every gate before done.",
      "> Report each gate with its exit code.",
      "> ```",
    ].join("\n");
    expect(unanchoredRanges(synthetic(`${SOURCE_PATH}:4-5`, quoted), SOURCE_LINES)).toEqual([]);
    expect(unanchoredRanges(synthetic(`${SOURCE_PATH}:3-4`, quoted), SOURCE_LINES)).toHaveLength(
      1,
    );
  });

  it("anchors a range whose first line a restricted block quotes with an elision", () => {
    const elidedBlock = (line: string): string =>
      [`Governing text — \`${SOURCE_PATH}\`:`, "", "```text", line, "```"].join("\n");
    const anchored = elidedBlock("Run every [...] before done.");
    expect(unanchoredRanges(synthetic(`${SOURCE_PATH}:4-5`, anchored), SOURCE_LINES)).toEqual([]);
    // A quote that opens on the elision carries no line start.
    const headless = elidedBlock("[...] gate before done.");
    expect(unanchoredRanges(synthetic(`${SOURCE_PATH}:4-5`, headless), SOURCE_LINES)).toHaveLength(
      1,
    );
    // The same elided quote does not anchor the line above it.
    expect(unanchoredRanges(synthetic(`${SOURCE_PATH}:3-4`, anchored), SOURCE_LINES)).toHaveLength(
      1,
    );
  });

  it("anchors a frontmatter description line by its value, verbatim in the body", () => {
    const skillPath = "content/skills/st-synthetic/SKILL.md";
    const skill = [
      "---",
      "id: synthetic",
      'description: "Checks one thing. Triggers when someone asks for it."',
      "load: on-demand",
      "---",
      "",
    ];
    const surface = 'st-synthetic — "Checks one thing. Triggers when someone asks for it."';
    expect(unanchoredRanges(synthetic(`${skillPath}:3-3`, surface), skill)).toEqual([]);
    // One line off lands on the frontmatter's `load:` key, which no body carries.
    expect(unanchoredRanges(synthetic(`${skillPath}:4-4`, surface), skill)).toHaveLength(1);
    // A description the body no longer quotes verbatim does not anchor.
    const reworded = 'st-synthetic — "Checks one thing."';
    expect(unanchoredRanges(synthetic(`${skillPath}:3-3`, reworded), skill)).toHaveLength(1);
  });
});

for (const file of cases) {
  describe(`eval case ${file.basename}`, () => {
    it("carries exactly the contract's frontmatter keys, indent-free", () => {
      const keys = [...file.frontmatter.keys()];
      const malformed = keys.filter((key) => key.startsWith("__malformed__"));
      expect(malformed, `${file.path}: frontmatter lines that are not \`key: value\``).toEqual([]);
      for (const key of REQUIRED_KEYS) {
        expect(keys, `${file.path}: missing required frontmatter key \`${key}\``).toContain(key);
      }
      const allowed = new Set<string>([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);
      const unexpected = keys.filter((key) => !allowed.has(key));
      expect(unexpected, `${file.path}: frontmatter keys outside the contract`).toEqual([]);
      expect(CLASSES.has(file.frontmatter.get("class") ?? "")).toBe(true);
      expect(METRICS.has(file.frontmatter.get("metric") ?? "")).toBe(true);
      if (file.frontmatter.has("floor")) {
        expect(file.frontmatter.get("floor"), `${file.path}: \`floor\` is true or absent`).toBe(
          "true",
        );
      }
      expect(file.frontmatter.get("claim")?.length ?? 0).toBeGreaterThan(0);
    });

    it("declares an id equal to its filename", () => {
      expect(file.frontmatter.get("id"), `${file.path}: id does not equal the filename`).toBe(
        file.basename,
      );
    });

    it("sources a path that exists, with ranges inside it", () => {
      const raw = file.frontmatter.get("source") ?? "";
      const parsed = parseSource(raw);
      expect(parsed, `${file.path}: unparsable source \`${raw}\``).not.toBeNull();
      if (!parsed) return;
      const abs = join(REPO_ROOT, ...parsed.path.split("/"));
      expect(existsSync(abs), `${file.path}: source path ${parsed.path} does not exist`).toBe(true);
      const total = linesOf(parsed.path).length;
      for (const [from, to] of parsed.ranges) {
        expect(
          from >= 1 && to >= from && to <= total,
          `${file.path}: source range ${from}-${to} lies outside ${parsed.path} (${total} lines)`,
        ).toBe(true);
      }
    });

    it("anchors the first line of every source range in the case body", () => {
      const source = file.frontmatter.get("source") ?? "";
      const parsed = parseSource(source);
      if (!parsed) return;
      if (!existsSync(join(REPO_ROOT, ...parsed.path.split("/")))) return;
      const failures = unanchoredRanges(
        { path: file.path, source, bodyLines: file.bodyLines },
        linesOf(parsed.path),
      );
      expect(failures, `${file.path}: source ranges the case body does not anchor`).toEqual([]);
    });

    it("quotes its governing text verbatim from the file its heading names", () => {
      const parsed = parseSource(file.frontmatter.get("source") ?? "");
      if (!parsed) return;
      for (const block of governingBlocks(file.bodyLines, parsed.path)) {
        expect(
          existsSync(join(REPO_ROOT, ...block.target.split("/"))),
          `${file.path}: block at line ${block.fenceLine} names ${block.target}, which does not exist`,
        ).toBe(true);
        const targetLines = linesOf(block.target);
        // A block headed with the case's own source path is held to the declared
        // range; one naming another corpus file is held to that whole file.
        const pool = block.restricted
          ? parsed.ranges.flatMap(([from, to]) => targetLines.slice(from - 1, to))
          : targetLines;
        const poolSet = new Set(pool);
        const poolText = pool.join("\n");
        const scope = block.restricted ? ` within ${file.frontmatter.get("source")}` : "";
        for (const line of block.body) {
          if (line.includes("[...]")) {
            // An elision marker: whatever survives on either side of it still has to
            // be text the corpus carries, so the surviving fragments are checked as
            // substrings rather than as whole lines.
            const fragments = line
              .split("[...]")
              .map((part) => part.trim())
              .filter((part) => part.length > 0);
            const missing = fragments.find((fragment) => !poolText.includes(fragment));
            expect(
              missing,
              `${file.path}: block at line ${block.fenceLine} quoting ${block.target}${scope} — this fragment is not in the file: ${JSON.stringify(missing)}`,
            ).toBeUndefined();
            continue;
          }
          expect(
            poolSet.has(line),
            `${file.path}: block at line ${block.fenceLine} quoting ${block.target}${scope} — first line that is not verbatim: ${JSON.stringify(line)}`,
          ).toBe(true);
          if (!poolSet.has(line)) return;
        }
      }
    });
  });
}
