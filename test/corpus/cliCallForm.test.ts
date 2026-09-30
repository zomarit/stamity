import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_TOKEN } from "../../src/emit/substitution.ts";
import { CORPUS_ROOT, walkAllMarkdown } from "./harness.ts";

/**
 * How a corpus body calls the CLI (REQ-FLOW-002, REQ-FLOW-003).
 *
 * A bare `stamity <verb>` only runs where a global install put `stamity` on the
 * PATH, and an unpinned `npx` call resolves whatever the registry holds today.
 * Every body that runs a verb therefore carries one sentence, byte-identical at
 * each site, naming the two forms that do run: the local `npx stamity <verb>`
 * where the project's `package.json` lists this package, and otherwise the
 * pinned `${STAMITY:CLI} <verb>` the emission renders to the version this setup
 * was generated with. The sentence is the definition that lets the rest of the
 * body keep `stamity <verb>` as shorthand, so the checks below are:
 *
 *   (a) every call site carries the sentence under its label;
 *   (b) no fenced shell line and no `Run`/`Probe` table cell anywhere in
 *       `content/` starts with a bare `stamity ` unless its file carries the
 *       sentence;
 *   (c) no `@latest` anywhere in `content/` outside the sentence itself.
 */

/** The shared sentence, byte-identical at every call site (census S1). */
const RUNNING_CLI_SENTENCE =
  "Every `stamity <verb>` call in this file runs as `npx stamity <verb>` where the project's `package.json` lists this package, and otherwise as `${STAMITY:CLI} <verb>` — the version this setup was generated with; never `@latest`, and never a bare `stamity` that only a global install provides.";

/** The label skills and commands open the sentence with, as a paragraph of its own. */
const RUNNING_CLI_LABEL = "**Running the CLI.** ";

interface CallSite {
  /** Path under the corpus root. */
  relPath: string;
  /** The text the sentence directly follows at this site. */
  label: string;
}

/**
 * Every corpus body that runs a verb. A new site adds one row: `st-work` joins
 * with its own bullet label, `- **CLI calls.** `, when its unit lands.
 */
const CALL_SITES: readonly CallSite[] = [
  { relPath: "skills/st-handoff/SKILL.md", label: RUNNING_CLI_LABEL },
  { relPath: "skills/st-learn/SKILL.md", label: RUNNING_CLI_LABEL },
  { relPath: "commands/st-debug.md", label: RUNNING_CLI_LABEL },
];

/** Header names of the table columns whose cells are commands to run. */
const COMMAND_COLUMNS: ReadonlySet<string> = new Set(["Run", "Probe"]);

const FENCE = /^\s*(?:```|~~~)/;
const TABLE_ROW = /^\s*\|/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}/;
const BARE_SHELL_CALL = /^\s*(?:\$\s+)?stamity\s/;
const BARE_CELL_CALL = /^`stamity\s/;

interface BareCall {
  line: number;
  text: string;
}

/** A table row's cells, split on unescaped pipes, with the outer empties dropped. */
function cells(row: string): string[] {
  const parts = row.trim().split(/(?<!\\)\|/);
  if (parts[0]?.trim() === "") parts.shift();
  if (parts.at(-1)?.trim() === "") parts.pop();
  return parts.map((cell) => cell.trim());
}

/**
 * Every line of `raw` that runs a bare `stamity ` call: a line inside a fenced
 * block that starts with it (a `$ ` prompt allowed), or a cell under a `Run` or
 * `Probe` header whose code span starts with it. Prose mentions are not calls.
 */
function bareCalls(raw: string): BareCall[] {
  const lines = raw.split(/\r?\n/);
  const found: BareCall[] = [];
  let inFence = false;
  let commandColumns: number[] | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]!;
    if (FENCE.test(text)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      if (BARE_SHELL_CALL.test(text)) found.push({ line: index + 1, text });
      continue;
    }
    if (!TABLE_ROW.test(text)) {
      commandColumns = undefined;
      continue;
    }
    if (commandColumns === undefined) {
      // The first row of a table is its header; the columns to read are named there.
      commandColumns = cells(text).flatMap((cell, column) =>
        COMMAND_COLUMNS.has(cell.replace(/[*`]/g, "")) ? [column] : [],
      );
      continue;
    }
    if (TABLE_SEPARATOR.test(text)) continue;
    const row = cells(text);
    if (commandColumns.some((column) => BARE_CELL_CALL.test(row[column] ?? ""))) {
      found.push({ line: index + 1, text });
    }
  }
  return found;
}

/** Every file under the corpus root, any extension, as a root-relative posix path. */
async function allCorpusFiles(): Promise<{ relPath: string; raw: string }[]> {
  const entries = await readdir(CORPUS_ROOT, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  return Promise.all(
    files.map(async (entry) => {
      const absPath = join(entry.parentPath, entry.name);
      return {
        relPath: relative(CORPUS_ROOT, absPath).split(sep).join("/"),
        raw: await readFile(absPath, "utf8"),
      };
    }),
  );
}

const corpus = walkAllMarkdown();

describe("the CLI call form", () => {
  it("spells the pinned form with the engine's own token", () => {
    expect(RUNNING_CLI_SENTENCE).toContain(`\`${CLI_TOKEN} <verb>\``);
  });

  it.each(CALL_SITES)("$relPath carries the shared sentence under its label", async (site) => {
    const file = (await corpus).find((candidate) => candidate.relPath === site.relPath);
    expect(file, `${site.relPath}: not present under the corpus root`).toBeDefined();
    expect(file!.raw).toContain(`${site.label}${RUNNING_CLI_SENTENCE}`);
  });

  it("finds a bare call in a fence and in a Run cell, and nothing in prose or other columns", () => {
    const sample = [
      "`stamity check` is named in prose, which runs nothing.",
      "",
      "| Mode | Run | Note |",
      "|---|---|---|",
      "| a | `stamity handoff list` | `stamity check` |",
      "| b | `npx stamity handoff list` | — |",
      "",
      "```bash",
      "$ stamity learn capture \\",
      "npx stamity learn capture",
      "```",
      "",
      "| Note |",
      "|---|",
      "| `stamity check` |",
    ].join("\n");

    expect(bareCalls(sample).map((call) => call.line)).toEqual([5, 9]);
  });

  it("leaves no bare call in a fence or a Run/Probe cell unless the file defines the form", async () => {
    const files = await corpus;
    const withCalls = files
      .map((file) => ({ file, calls: bareCalls(file.raw) }))
      .filter(({ calls }) => calls.length > 0);
    const undefinedForm = withCalls
      .filter(({ file }) => !file.raw.includes(RUNNING_CLI_SENTENCE))
      .map(({ file, calls }) => `${file.relPath}:${calls.map((call) => call.line).join(",")}`);

    // The scan is live: /st-debug keeps its `stamity check` probe cells as the
    // defined shorthand, so at least that file is found and then allowed.
    expect(withCalls.map(({ file }) => file.relPath)).toContain("commands/st-debug.md");
    expect(undefinedForm).toEqual([]);
  });

  it("pins no call to @latest anywhere in content/", async () => {
    const files = await allCorpusFiles();
    const latest = files
      .filter(({ raw }) => raw.split(RUNNING_CLI_SENTENCE).join("").includes("@latest"))
      .map(({ relPath }) => relPath);

    expect(files.length).toBeGreaterThan(CALL_SITES.length);
    expect(latest).toEqual([]);
  });
});
