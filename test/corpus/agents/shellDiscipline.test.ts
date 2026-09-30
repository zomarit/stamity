import { describe, expect, it } from "vitest";
import { frontmatterField } from "../../../src/content/frontmatter.ts";
import { corpusFileOf, walkAllMarkdown, type CorpusFile } from "../harness.ts";

/**
 * Shell discipline for the roles that run commands (REQ-FLOW-013, REQ-FLOW-014), as a
 * contract over their shipped bodies and over every shell fence the corpus ships.
 *
 *   - **(a) One paragraph, byte-identical.** Every agent whose `capabilities` include
 *     `execute`, plus `researcher`, carries a `## Shell` section holding
 *     {@link SHELL_PARAGRAPH} verbatim after whitespace flattening. The set is DERIVED from
 *     the frontmatter, so a new executing role that ships without the section is red here
 *     rather than on a list nobody updated. The researcher alone adds
 *     {@link RESEARCHER_LINE}.
 *   - **(b) No non-portable construct in a shell fence.** Every fenced block under
 *     `content/` whose info string is `sh`, `bash`, `shell` or `console` is scanned line by
 *     line against {@link NON_PORTABLE}. Prose is not scanned: the paragraph itself names
 *     the banned constructs, and naming a construct is not running it.
 *   - **(c) Red checks.** The checkers are pure over a {@link CorpusFile}, so the defects
 *     are exercised on fixtures and on a real body with the paragraph cut out.
 */

/** The shared paragraph, flattened to single spaces — every executing body carries it. */
const SHELL_PARAGRAPH =
  "Where this role runs commands, it writes portable POSIX `sh`, so a command runs the same under " +
  "`sh`, `bash`, `dash` or `zsh`: no `PIPESTATUS`, no `[[ … ]]`, no arrays, no `pipefail`, no " +
  "`<( … )`. Each command runs once, as written — no `time`, no `{ …; }` grouping, no redirect " +
  "into a temp file, no `echo $?`, no pipe into `tail` or `head` — and its exit code is read from " +
  "the tool result. A code the tool did not show is `unknown`, never a pass. A long command is " +
  "waited on in the foreground under the tool's own timeout, never polled with `sleep`.";

/** The one line only the researcher adds: it runs commands but never a gate. */
const RESEARCHER_LINE =
  "This role runs no verification gate; gate evidence is the test-runner's.";

const RESEARCHER = "agents/stamity-researcher.md";

/** Info strings that mark a fence as shell the reader may paste and run. */
const SHELL_INFO_STRINGS: ReadonlySet<string> = new Set(["sh", "bash", "shell", "console"]);

/**
 * Constructs that do not run the same under `sh`, `dash` and `zsh`, or that hide a
 * command's own exit code: bash's status array, `[[`, `pipefail`, process substitution,
 * polling with `sleep`, `echo $?`, a pipe into `tail`/`head`, a `time` prefix, and array
 * assignment.
 */
const NON_PORTABLE =
  /PIPESTATUS|\[\[|pipefail|<\(|\bsleep\b|echo \$\?|\|\s*(tail|head)\b|^\s*time\s|=\(/;

/** One walk for the whole suite; the corpus does not change under it. */
const corpus = walkAllMarkdown();

function flat(text: string): string {
  return text.replace(/\s+/g, " ");
}

/** The text of the top-level `## <heading>` section, or `undefined` when it is absent. */
function sectionOf(file: CorpusFile, heading: string): string | undefined {
  const marker = `\n## ${heading}\n`;
  const start = file.parsed.body.indexOf(marker);
  if (start < 0) return undefined;
  const rest = file.parsed.body.slice(start + marker.length);
  const end = rest.indexOf("\n## ");
  return end < 0 ? rest : rest.slice(0, end);
}

/** What check (a) finds wrong with one body, or `undefined` when it holds. */
function shellSectionDefect(file: CorpusFile): string | undefined {
  const shell = sectionOf(file, "Shell");
  if (shell === undefined) return `${file.relPath}: no "## Shell" section`;
  if (!flat(shell).includes(SHELL_PARAGRAPH)) {
    return `${file.relPath}: the "## Shell" section does not hold the shared paragraph verbatim`;
  }
  return undefined;
}

/** Every agent body check (a) binds: `execute` in `capabilities`, plus the researcher. */
function shellBoundAgents(files: readonly CorpusFile[]): CorpusFile[] {
  return files.filter((file) => {
    if (!file.relPath.startsWith("agents/")) return false;
    if (file.relPath === RESEARCHER) return true;
    const capabilities = frontmatterField(file.parsed, "capabilities");
    return Array.isArray(capabilities) && capabilities.includes("execute");
  });
}

interface ShellFenceScan {
  /** Shell fences found, so a green scan can be told apart from an empty one. */
  fences: number;
  /** `<relPath>:<line>: <text>` for each offending line. */
  violations: string[];
}

/** Check (b) over one file: every line inside a shell fence against {@link NON_PORTABLE}. */
function scanShellFences(file: CorpusFile): ShellFenceScan {
  const scan: ShellFenceScan = { fences: 0, violations: [] };
  let open: { char: string; length: number; shell: boolean } | undefined;
  file.raw.split("\n").forEach((line, index) => {
    const fence = /^\s*(`{3,}|~{3,})\s*([^\s`]*)/.exec(line);
    if (open === undefined) {
      if (fence === null) return;
      const marker = fence[1] ?? "";
      const shell = SHELL_INFO_STRINGS.has((fence[2] ?? "").toLowerCase());
      open = { char: marker.charAt(0), length: marker.length, shell };
      if (shell) scan.fences += 1;
      return;
    }
    const closing = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
    const marker = closing?.[1] ?? "";
    if (marker.charAt(0) === open.char && marker.length >= open.length) {
      open = undefined;
      return;
    }
    if (open.shell && NON_PORTABLE.test(line)) {
      scan.violations.push(`${file.relPath}:${index + 1}: ${line}`);
    }
  });
  return scan;
}

describe("shell discipline — every role that runs commands carries the Shell paragraph", () => {
  it("derives the bound set from capabilities, and it is not empty", async () => {
    const bound = shellBoundAgents(await corpus).map((file) => file.relPath);

    // Non-vacuous: the three executing roles today, plus the researcher by name.
    expect(bound).toEqual(
      expect.arrayContaining([
        "agents/stamity-fixer.md",
        "agents/stamity-implementer.md",
        RESEARCHER,
        "agents/stamity-test-runner.md",
      ]),
    );
  });

  it("(a) holds the shared paragraph verbatim in a `## Shell` section of every bound body", async () => {
    const defects = shellBoundAgents(await corpus)
      .map(shellSectionDefect)
      .filter((defect) => defect !== undefined);

    expect(defects).toEqual([]);
  });

  it("gives the researcher its one extra line: no verification gate", async () => {
    const researcher = (await corpus).find((file) => file.relPath === RESEARCHER);
    expect(researcher, `${RESEARCHER}: not present under the corpus root`).toBeDefined();
    if (researcher === undefined) return;

    expect(flat(sectionOf(researcher, "Shell") ?? "")).toContain(RESEARCHER_LINE);
  });

  it("has the implementer run each gate once, as resolved, reading the tool's exit code", async () => {
    const implementer = (await corpus).find(
      (file) => file.relPath === "agents/stamity-implementer.md",
    );
    expect(implementer).toBeDefined();
    if (implementer === undefined) return;

    expect(flat(sectionOf(implementer, "Gates") ?? "")).toContain(
      "— each run once, as resolved, its exit code read from the tool (Shell).",
    );
  });

  it("(c) fails (a) when the paragraph is deleted from one real body", async () => {
    const runner = (await corpus).find((file) => file.relPath === "agents/stamity-test-runner.md");
    expect(runner).toBeDefined();
    if (runner === undefined) return;

    const shell = sectionOf(runner, "Shell") ?? "";
    expect(shell.trim().length).toBeGreaterThan(0);
    const cut = corpusFileOf(runner.relPath, runner.raw.replace(shell, "\n"));

    expect(shellSectionDefect(runner)).toBeUndefined();
    expect(shellSectionDefect(cut)).toBe(
      `${runner.relPath}: the "## Shell" section does not hold the shared paragraph verbatim`,
    );
  });

  it("(c) fails (a) when the section itself is missing", () => {
    const fixture = corpusFileOf(
      "agents/stamity-fixture.md",
      "---\nid: fixture\n---\n\n# fixture\n\n## Return contract\n\n- **status:** `DONE`.\n",
    );

    expect(shellSectionDefect(fixture)).toBe('agents/stamity-fixture.md: no "## Shell" section');
  });
});

describe("shell discipline — shell fences in the corpus are portable", () => {
  it("(b) finds no non-portable construct in any `sh`, `bash`, `shell` or `console` fence", async () => {
    const scans = (await corpus).map(scanShellFences);
    const fences = scans.reduce((total, scan) => total + scan.fences, 0);

    // Non-vacuous: the corpus ships shell fences today, so a scan that found none is a
    // broken parser rather than a clean corpus.
    expect(fences).toBeGreaterThan(0);
    expect(scans.flatMap((scan) => scan.violations)).toEqual([]);
  });

  it("(b) names the file and line of a status-array read inside a bash fence", () => {
    const fixture = corpusFileOf(
      "skills/st-fixture/SKILL.md",
      [
        "---",
        "id: st-fixture",
        "---",
        "",
        "Run it:",
        "",
        "```bash",
        "npm run test | tail -5",
        "echo ${PIPESTATUS[0]}",
        "```",
        "",
      ].join("\n"),
    );

    expect(scanShellFences(fixture)).toEqual({
      fences: 1,
      violations: [
        "skills/st-fixture/SKILL.md:8: npm run test | tail -5",
        "skills/st-fixture/SKILL.md:9: echo ${PIPESTATUS[0]}",
      ],
    });
  });

  it("(b) leaves prose and non-shell fences alone, and passes a portable shell fence", () => {
    const fixture = corpusFileOf(
      "agents/stamity-fixture.md",
      [
        "---",
        "id: fixture",
        "---",
        "",
        "No `PIPESTATUS`, no `pipefail`, never polled with `sleep`.",
        "",
        "```text",
        "echo $?",
        "```",
        "",
        "```sh",
        "npm run lint && npm run typecheck && npm run test",
        "```",
        "",
      ].join("\n"),
    );

    expect(scanShellFences(fixture)).toEqual({ fences: 1, violations: [] });
  });
});
