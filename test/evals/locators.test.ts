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
