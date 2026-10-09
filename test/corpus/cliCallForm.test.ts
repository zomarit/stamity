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
 * each site, naming the two forms that do run: `npx --no stamity <verb>`, which
 * runs an installed copy and never downloads one (a bare `npx stamity` would
 * fall through to whatever the registry serves under the unscoped name), and
 * where npm refuses, the pinned `${STAMITY:CLI} <verb>` the emission renders to
 * the version this setup was generated with. The sentence is the definition
 * that lets a body keep `stamity <verb>` as shorthand in its `Probe` cells, so
 * the checks below are:
 *
 *   (a) every call site carries the sentence under its label, and its
 *       REQ-FLOW-003 fallback line;
 *   (b) no fenced shell line and no `Run` cell anywhere in `content/` starts
 *       with a bare `stamity `, and a `Probe` cell does only in a file that
 *       carries the sentence;
 *   (c) no `@latest` anywhere in `content/` outside the sentence itself;
 *   (d) no `npx` call of the bare `stamity` name anywhere in `content/`
 *       without `--no`.
 */

/** The shared sentence, byte-identical at every call site (census S1). */
const RUNNING_CLI_SENTENCE =
  "Every `stamity <verb>` call in this file runs as `npx --no stamity <verb>`, which runs an installed copy — a `stamity` bin the project's own `package.json` declares, one in `node_modules/.bin` here or in a parent folder, or a global one — and never downloads a package; where npm refuses because no copy is installed, the call runs as `${STAMITY:CLI} <verb>`, the version this setup was generated with. Never `@latest`, and never `stamity <verb>` typed bare at the shell.";

/** The label skills and commands open the sentence with, as a paragraph of its own. */
const RUNNING_CLI_LABEL = "**Running the CLI.** ";

interface CallSite {
  /** Path under the corpus root. */
  relPath: string;
  /** The text the sentence directly follows at this site. */
  label: string;
  /** The site's REQ-FLOW-003 line: what the flow says when neither form runs. */
  fallback: string;
}

/**
 * Every corpus body that runs a verb. A new site adds one row. `st-work`
 * carries the sentence as a Dispatch-contract bullet, so its label is the
 * bullet's own, `- **CLI calls.** `, and its fallback is the one writer's
 * by-hand ledger edit (unit work-cli-call-form).
 */
const CALL_SITES: readonly CallSite[] = [
  {
    relPath: "skills/st-handoff/SKILL.md",
    label: RUNNING_CLI_LABEL,
    fallback:
      "When neither form runs, no handoff file is written by hand; the eight sections go into the closing message under `Not done: handoff not written — CLI unavailable`",
  },
  {
    relPath: "skills/st-learn/SKILL.md",
    label: RUNNING_CLI_LABEL,
    fallback:
      "When neither form runs, the finding is not written with a file tool; the closing message carries its title, summary, confidence and body under `Not done: learning not captured — CLI unavailable`",
  },
  {
    relPath: "commands/st-debug.md",
    label: RUNNING_CLI_LABEL,
    fallback: "A `not-runnable` result on both names the install as the unresolved input.",
  },
  {
    relPath: "commands/st-work.md",
    label: "- **CLI calls.** ",
    fallback:
      "When neither form runs, the orchestrator, still the one writer, edits `ledger.jsonl` by hand in the row grammar under Proof block and records `ledger: by hand (no CLI)`.",
  },
  {
    // The quick lane's gate runs `gate scan` and `gate classify` (unit p3b-quick-gates); with
    // neither form, the batch takes the full gate and says the scan did not run.
    relPath: "commands/st-quick.md",
    label: RUNNING_CLI_LABEL,
    fallback:
      "When neither form runs, the batch runs `${STAMITY:VERIFY_GATE_ALL}` and the report lists `secret scan: not run` under `Not done:`.",
  },
  {
    // The plan's `threat` row runs `gate classify --paths` over a unit's files (unit p5d-threat-note);
    // with neither form no unit's class can be read, so every unit carries the row.
    relPath: "commands/st-plan.md",
    label: RUNNING_CLI_LABEL,
    fallback:
      "When neither form runs, no unit's class can be read, so every unit carries the `threat` row.",
  },
];

/** The one column whose cells may keep the defined `stamity <verb>` shorthand. */
const SHORTHAND_COLUMN = "Probe";

/** Header names of the table columns whose cells are commands to run. */
const COMMAND_COLUMNS: ReadonlySet<string> = new Set(["Run", SHORTHAND_COLUMN]);

/** An `npx` call of the bare `stamity` name, its flags captured (a scoped spec is not matched). */
const NPX_BARE_NAME = /\bnpx((?:\s+-[-\w]+)*)\s+stamity\b/g;

const FENCE = /^\s*(?:```|~~~)/;
const TABLE_ROW = /^\s*\|/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}/;
const BARE_SHELL_CALL = /^\s*(?:\$\s+)?stamity\s/;
const BARE_CELL_CALL = /^`stamity\s/;

interface BareCall {
  line: number;
  text: string;
  /** `fence` for a fenced shell line, otherwise the header of the cell's column. */
  where: string;
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
  let commandColumns: { column: number; name: string }[] | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]!;
    if (FENCE.test(text)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      if (BARE_SHELL_CALL.test(text)) found.push({ line: index + 1, text, where: "fence" });
      continue;
    }
    if (!TABLE_ROW.test(text)) {
      commandColumns = undefined;
      continue;
    }
    if (commandColumns === undefined) {
      // The first row of a table is its header; the columns to read are named there.
      commandColumns = cells(text).flatMap((cell, column) => {
        const name = cell.replace(/[*`]/g, "");
        return COMMAND_COLUMNS.has(name) ? [{ column, name }] : [];
      });
      continue;
    }
    if (TABLE_SEPARATOR.test(text)) continue;
    const row = cells(text);
    for (const { column, name } of commandColumns) {
      if (BARE_CELL_CALL.test(row[column] ?? "")) found.push({ line: index + 1, text, where: name });
    }
  }
  return found;
}

/**
 * The bare calls `raw` may not keep: every fenced line and `Run` cell, and a
 * `Probe` cell unless the file carries the sentence that defines the shorthand.
 */
function disallowedCalls(raw: string): BareCall[] {
  const defined = raw.includes(RUNNING_CLI_SENTENCE);
  return bareCalls(raw).filter((call) => !(defined && call.where === SHORTHAND_COLUMN));
}

/** Every `npx` call of the bare `stamity` name in `raw` that lacks `--no`, as matched text. */
function fetchingNpxCalls(raw: string): string[] {
  return [...raw.matchAll(NPX_BARE_NAME)]
    .filter((match) => !/(?:^|\s)--no(?:\s|$)/.test(`${match[1] ?? ""} `))
    .map((match) => match[0]);
}

/** The files of `files` that carry `@latest` outside the shared sentence. */
function latestPins(files: readonly { relPath: string; raw: string }[]): string[] {
  return files
    .filter(({ raw }) => raw.split(RUNNING_CLI_SENTENCE).join("").includes("@latest"))
    .map(({ relPath }) => relPath);
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

  it.each(CALL_SITES)("$relPath says what it does when neither form runs", async (site) => {
    const file = (await corpus).find((candidate) => candidate.relPath === site.relPath);
    expect(file, `${site.relPath}: not present under the corpus root`).toBeDefined();
    expect(file!.raw).toContain(site.fallback);
  });

  it("finds a bare call in a fence and in a Run cell, and nothing in prose or other columns", () => {
    const sample = [
      "`stamity check` is named in prose, which runs nothing.",
      "",
      "| Mode | Run | Note |",
      "|---|---|---|",
      "| a | `stamity handoff list` | `stamity check` |",
      "| b | `npx --no stamity handoff list` | — |",
      "",
      "```bash",
      "$ stamity learn capture \\",
      "npx --no stamity learn capture",
      "```",
      "",
      "| Note |",
      "|---|",
      "| `stamity check` |",
    ].join("\n");

    expect(bareCalls(sample).map((call) => call.line)).toEqual([5, 9]);
  });

  it("allows the defined shorthand in a Probe cell only, and only where the sentence is", () => {
    const body = [
      "| Signal | Probe |",
      "|---|---|",
      "| drift | `stamity check` |",
      "",
      "| Mode | Run |",
      "|---|---|",
      "| list | `stamity handoff list` |",
      "",
      "```bash",
      "stamity learn capture",
      "```",
    ];
    const defined = [`${RUNNING_CLI_LABEL}${RUNNING_CLI_SENTENCE}`, "", ...body].join("\n");

    // The sentence excuses the Probe cell (line 5) and nothing else.
    expect(disallowedCalls(defined).map((call) => call.line)).toEqual([9, 12]);
    // Without the sentence the Probe cell is a bare call too.
    expect(disallowedCalls(body.join("\n")).map((call) => call.line)).toEqual([3, 7, 10]);
  });

  it("leaves no bare call in a fence or a Run cell, and none in a Probe cell the sentence does not define", async () => {
    const files = await corpus;
    const withCalls = files
      .map((file) => ({ file, calls: bareCalls(file.raw) }))
      .filter(({ calls }) => calls.length > 0);
    const disallowed = files
      .map((file) => ({ file, calls: disallowedCalls(file.raw) }))
      .filter(({ calls }) => calls.length > 0)
      .map(({ file, calls }) => `${file.relPath}:${calls.map((call) => call.line).join(",")}`);

    // The scan is live: /st-debug keeps its `stamity check` probe cells as the
    // defined shorthand, so at least that file is found and then allowed.
    expect(withCalls.map(({ file }) => file.relPath)).toContain("commands/st-debug.md");
    expect(disallowed).toEqual([]);
  });

  it("finds an npx call of the bare name without --no, and passes one with it or a scoped spec", () => {
    const sample = [
      "run `npx stamity check` here",
      "run `npx -y stamity check` here",
      "run `npx --no stamity check` here",
      "run `npx --no -y stamity check` here",
      "run `npx -y @zomarit/stamity@1.10.0 check` here",
    ].join("\n");

    expect(fetchingNpxCalls(sample)).toEqual(["npx stamity", "npx -y stamity"]);
  });

  it("never tells an agent to run npx on the bare name without --no", async () => {
    expect(fetchingNpxCalls(RUNNING_CLI_SENTENCE)).toEqual([]);
    expect(RUNNING_CLI_SENTENCE).toContain("`npx --no stamity <verb>`");

    const files = await allCorpusFiles();
    const fetching = files
      .filter(({ raw }) => fetchingNpxCalls(raw).length > 0)
      .map(({ relPath }) => relPath);
    expect(fetching).toEqual([]);
  });

  it("finds @latest outside the sentence and ignores the sentence's own mention", () => {
    const sample = [
      { relPath: "defined.md", raw: `${RUNNING_CLI_LABEL}${RUNNING_CLI_SENTENCE}` },
      { relPath: "pinned.md", raw: "run `npx -y @zomarit/stamity@latest check`" },
    ];

    expect(latestPins(sample)).toEqual(["pinned.md"]);
  });

  it("pins no call to @latest anywhere in content/", async () => {
    const files = await allCorpusFiles();

    expect(files.length).toBeGreaterThan(CALL_SITES.length);
    expect(latestPins(files)).toEqual([]);
  });
});
