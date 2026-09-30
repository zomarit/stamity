import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { CORPUS_ROOT } from "./harness.ts";

/**
 * Run records are written with the file tools (REQ-FLOW-025).
 *
 * A shell write into the state directory — a redirect, a heredoc, `tee` —
 * costs a permission prompt on every client that gates the shell, and it is
 * the one path no file-tool guard sees. `/st-work` therefore tells the agent
 * to create and extend its records with the client's file write and edit
 * tools and to move ledger rows only through the CLI; no allowlist is emitted
 * to paper over the prompts. The checks below are:
 *
 *   (a) `/st-work`'s Frame step names the file tools and forbids the shell
 *       forms for records, and its pointer dispatch says the report is
 *       written with the file write tool;
 *   (b) no line of any file under `content/` writes under `.stamity/` with a
 *       shell redirect, a heredoc or `tee` — the lint names file and line.
 *
 * The lint reads one line at a time: a heredoc opened on one line and aimed
 * at a variable set on another is outside what a line lint can see, so the
 * rule it pairs with is the Frame text, not this test alone.
 */

/** The work command, corpus-relative. */
const WORK_PATH = "commands/st-work.md";

/** Where records live; a shell write aimed anywhere under it is a finding. */
const STATE_DIR = ".stamity/";

/**
 * A shell redirect (`>`, `>>`, `>|`, `2>`, `&>`) whose target path reaches the
 * state directory. The operator must follow whitespace, a line start or a
 * shell separator, so a template path such as `<run-id>/record.md` is not read
 * as a redirect; a target opening with a backtick is a markdown code span (a
 * blockquote such as "> `.stamity/…`"), not a shell path.
 */
const REDIRECT_INTO_STATE = /(?:^|[\s;&(]|\s\d)>>?\|?\s*["']?[^\s"'|;&`]*\.stamity\//;

/** `tee` (any flags) whose first operand reaches the state directory. */
const TEE_INTO_STATE = /\btee(?:\s+-{1,2}[\w-]+)*\s+["']?[^\s"'|;&]*\.stamity\//;

/** A heredoc opener (`<<EOF`, `<<-'EOF'`, `<< "END"`); flagged when the line also names the state directory. */
const HEREDOC_OPENER = /<<-?\s*["']?[A-Za-z_]\w*/;

interface ShellWrite {
  /** 1-based line number. */
  line: number;
  /** Which shell form matched. */
  form: "redirect" | "tee" | "heredoc";
}

/** Every line of `raw` that writes under the state directory from the shell. */
function shellWrites(raw: string): ShellWrite[] {
  const found: ShellWrite[] = [];
  raw.split(/\r?\n/).forEach((text, index) => {
    if (!text.includes(STATE_DIR)) return;
    const line = index + 1;
    if (REDIRECT_INTO_STATE.test(text)) found.push({ line, form: "redirect" });
    else if (TEE_INTO_STATE.test(text)) found.push({ line, form: "tee" });
    else if (HEREDOC_OPENER.test(text)) found.push({ line, form: "heredoc" });
  });
  return found;
}

/** The findings for a set of files, one `path:line (form)` string each. */
function lint(files: readonly { relPath: string; raw: string }[]): string[] {
  return files.flatMap(({ relPath, raw }) =>
    shellWrites(raw).map(({ line, form }) => `${relPath}:${line} (${form})`),
  );
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

/** One `##`-level section of `raw`, whitespace-collapsed for prose matching across wraps. */
function collapsedSection(raw: string, heading: string): string {
  const start = raw.indexOf(`\n${heading}\n`);
  if (start === -1) throw new Error(`${WORK_PATH}: heading not found: ${heading}`);
  const rest = raw.slice(start + heading.length + 2);
  const next = rest.search(/^## /m);
  return (next === -1 ? rest : rest.slice(0, next)).replaceAll(/\s+/g, " ");
}

const corpus = allCorpusFiles();

async function workRaw(): Promise<string> {
  const file = (await corpus).find((candidate) => candidate.relPath === WORK_PATH);
  if (file === undefined) throw new Error(`${WORK_PATH}: not present under the corpus root`);
  return file.raw;
}

describe("run records are written with the file tools", () => {
  it("names the file tools at Frame and forbids the shell forms for records", async () => {
    const frame = collapsedSection(await workRaw(), "## Phase 0 — Frame");
    // The plan cell's wording named the verb as `stamity ledger`; the body points at the
    // Ledger writes bullet instead, because the CLI-calls definition must precede the first
    // `stamity ledger` call (test/corpus/commands/work.test.ts, REQ-FLOW-002).
    expect(frame).toContain(
      "Records are files: create and extend `record.md`, `plan.md`, reports and the inbox with the client's file write and edit tools — never a shell redirect, a heredoc or `cat >` — and move ledger rows only through the `ledger` verb under Ledger writes.",
    );
  });

  it("says the dispatched report path is written with the file write tool", async () => {
    const dispatch = collapsedSection(await workRaw(), "## Dispatch contract");
    expect(dispatch).toContain("the report path, written with the file write tool;");
  });

  it("fixture: flags each shell form aimed at the state directory, naming the line", () => {
    const sample = [
      "Open `.stamity/runs/<run-id>/record.md` with three lines.",
      "cat > .stamity/runs/x/record.md <<EOF",
      "echo '- note' >> \".stamity/runs/x/record.md\"",
      "printf '%s\\n' row 2>/dev/null >.stamity/inbox.md",
      "npm test | tee -a .stamity/runs/x/reports/gate.log",
      "cat <<'EOF' | node scripts/x.mjs .stamity/runs/x/plan.md",
      "echo done > build/out.txt",
      "Reports land in `<root>/.stamity/runs/<run-id>/reports/`.",
      "> `.stamity/runs/<run-id>/record.md` is the run's head.",
    ].join("\n");

    expect(shellWrites(sample)).toEqual([
      { line: 2, form: "redirect" },
      { line: 3, form: "redirect" },
      { line: 4, form: "redirect" },
      { line: 5, form: "tee" },
      { line: 6, form: "heredoc" },
    ]);
    // The lint's message leads with the file and the line.
    expect(lint([{ relPath: "commands/st-fixture.md", raw: sample }])[0]).toBe(
      "commands/st-fixture.md:2 (redirect)",
    );
  });

  it("finds no shell write under the state directory anywhere in content/", async () => {
    const files = await corpus;
    // Control: the walk reached the corpus, so an empty result is not an empty walk.
    expect(files.some((file) => file.relPath === WORK_PATH)).toBe(true);
    expect(lint(files)).toEqual([]);
  });
});
