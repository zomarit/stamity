import { describe, expect, it } from "vitest";
import { corpusFileOf, walkAllMarkdown, type CorpusFile } from "../harness.ts";

/**
 * One severity scale in every role that raises findings (REQ-FLOW-073), as a contract over
 * the shipped bodies.
 *
 *   - **(a) One section, byte-identical.** The reviewer, the three lenses, the implementer
 *     and the fixer each end on a `## Severity` section whose text is
 *     {@link SEVERITY_SECTION}, byte for byte. Raw bytes are compared, not a flattened view:
 *     the section is one constant copied into six files, so any difference is drift.
 *   - **(b) The last section.** The section is appended as each body's last `## ` section,
 *     so no eval range in the six bodies moves, and it appears once.
 *   - **(c) The scale's shape.** Critical, Warning and Minor, each set by its consequence
 *     with one example, then the no-findings sentence.
 *   - **(d) What stays.** The reviewer's own Warning rule in `## Critical rows` stays word
 *     for word, and `/st-rework`'s severity vocabulary keeps its three lines (20–22).
 *   - **(e) Red checks.** The checker is pure over a {@link CorpusFile}, so a reworded,
 *     missing or misplaced section is exercised on real bodies with one edit each.
 *   - **(f) Capture by consequence** (REQ-FLOW-072, REQ-CTX-002). A role records a finding
 *     only when it names a consequence; a note with none is listed in the report and counted
 *     on the digest's `findings:` line as `notes left out: <n>`; a pre-existing defect that
 *     passes the test leads its `summary` with `pre-existing:`. {@link CAPTURE_PINS} holds
 *     each role's sentences by section, and {@link captureGaps} reads them, so a dropped
 *     sentence is exercised red on a real body.
 */

/** The `## Severity` section every finding-raising role carries, heading through EOF. */
export const SEVERITY_SECTION =
  "## Severity\n" +
  "\n" +
  "- **Critical**: a defect that breaks a supported use, loses data or opens a security hole on\n" +
  "  the change's path. Example: a write whose path comes from user input lands outside the\n" +
  "  project root.\n" +
  "- **Warning**: wrong or missing behaviour a user or maintainer meets in a supported use, or a\n" +
  "  change that makes an existing instance worse. Example: a command exits `0` after a failed\n" +
  "  write, so the script that called it carries on.\n" +
  "- **Minor**: a true defect with a small, named consequence. Example: an error message names a\n" +
  "  flag the command renamed, so the reader tries the old flag first.\n" +
  "\n" +
  "A note with no consequence is not a finding; no findings is a good result.\n";

/** The six roles that raise findings and so carry the scale. */
const SEVERITY_ROLES: readonly string[] = [
  "agents/stamity-reviewer.md",
  "agents/stamity-security.md",
  "agents/stamity-performance.md",
  "agents/stamity-design-quality.md",
  "agents/stamity-implementer.md",
  "agents/stamity-fixer.md",
];

const REVIEWER = "agents/stamity-reviewer.md";
const REWORK = "commands/st-rework.md";

/** The reviewer's own Warning rule (`## Critical rows`), which the scale does not replace. */
const REVIEWER_WARNING_RULE =
  "These fail a review on their own, whatever the lens weighting says. Each is a blocking " +
  "finding when it appears in the change, and a `Warning` when the change makes an existing " +
  "instance worse without introducing it:";

/** One capture sentence a role carries, whitespace-collapsed, inside one `## ` section. */
interface CapturePin {
  readonly relPath: string;
  readonly section: string;
  readonly phrase: string;
}

/** The capture-by-consequence sentences, by role and section (check (f)). */
const CAPTURE_PINS: readonly CapturePin[] = [
  {
    relPath: REVIEWER,
    section: "Rubric",
    phrase:
      "A finding names its consequence: who or what is affected, how, and in which use, with " +
      "its evidence.",
  },
  {
    relPath: REVIEWER,
    section: "Rubric",
    phrase:
      "A note with no consequence (wording, naming, style, comment drift, a tidier shape, a " +
      "\"might\" with no trigger) is not a finding: the report lists it and the digest counts it.",
  },
  {
    relPath: REVIEWER,
    section: "Rubric",
    phrase:
      "A note whose consequence shows once looked at, such as a misleading message a user acts " +
      "on, is a `Minor` finding.",
  },
  {
    relPath: REVIEWER,
    section: "Rubric",
    phrase:
      "A pre-existing defect is recorded only when it passes this test, its `summary` leading " +
      "`pre-existing:`.",
  },
  {
    relPath: REVIEWER,
    section: "Nit policy",
    phrase: "A naming preference is a note, not a finding (Rubric), so it never starts a fix round.",
  },
  {
    relPath: REVIEWER,
    section: "Return contract",
    phrase: "then the `Minor` count with its ids and locators, ending `notes left out: <n>`;",
  },
  {
    relPath: REVIEWER,
    section: "Return contract",
    phrase: "an inline result carries the notes count, never the notes.",
  },
];

/** The text of one top-level `## <heading>` section, up to the next one, or `undefined`. */
function sectionText(file: CorpusFile, heading: string): string | undefined {
  const marker = `\n## ${heading}\n`;
  const start = file.raw.indexOf(marker);
  if (start === -1) return undefined;
  const rest = file.raw.slice(start + marker.length);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

/** Every capture pin of `file`'s role its body lacks, as `<section>: <phrase>`; empty when whole. */
function captureGaps(file: CorpusFile): string[] {
  return CAPTURE_PINS.filter((pin) => pin.relPath === file.relPath)
    .filter((pin) => !flat(sectionText(file, pin.section) ?? "").includes(pin.phrase))
    .map((pin) => `${pin.section}: ${pin.phrase}`);
}

/** One walk for the whole suite; the corpus does not change under it. */
const corpus = walkAllMarkdown();

async function load(relPath: string): Promise<CorpusFile> {
  const file = (await corpus).find((candidate) => candidate.relPath === relPath);
  if (file === undefined) {
    throw new Error(`${relPath}: not present under the corpus root`);
  }
  return file;
}

function flat(text: string): string {
  return text.replace(/\s+/g, " ");
}

/** What checks (a) and (b) find wrong with one body, or `undefined` when it holds. */
function severityDefect(file: CorpusFile): string | undefined {
  const marker = "\n## Severity\n";
  const count = file.raw.split(marker).length - 1;
  if (count === 0) return `${file.relPath}: no "## Severity" section`;
  if (count > 1) return `${file.relPath}: ${count} "## Severity" sections`;
  const section = file.raw.slice(file.raw.indexOf(marker) + 1);
  if (/\n## /.test(section)) return `${file.relPath}: "## Severity" is not the last section`;
  if (section !== SEVERITY_SECTION) {
    return `${file.relPath}: the "## Severity" section is not byte-identical to the scale`;
  }
  return undefined;
}

describe("severity scale — one `## Severity` section in the six finding-raising roles", () => {
  it.each(SEVERITY_ROLES)("%s ends on the scale, byte-identical", async (relPath) => {
    expect(severityDefect(await load(relPath))).toBeUndefined();
  });

  it("(c) defines each level by its consequence, with exactly one example each", () => {
    const levels = SEVERITY_SECTION.split("\n- ").slice(1);

    expect(levels.map((level) => /^\*\*(\w+)\*\*:/.exec(level)?.[1])).toEqual([
      "Critical",
      "Warning",
      "Minor",
    ]);
    for (const level of levels) {
      expect(level.split("Example:").length - 1).toBe(1);
    }
    expect(flat(SEVERITY_SECTION)).toContain(
      "**Critical**: a defect that breaks a supported use, loses data or opens a security hole " +
        "on the change's path.",
    );
    expect(flat(SEVERITY_SECTION)).toContain(
      "**Warning**: wrong or missing behaviour a user or maintainer meets in a supported use, " +
        "or a change that makes an existing instance worse.",
    );
    expect(flat(SEVERITY_SECTION)).toContain(
      "**Minor**: a true defect with a small, named consequence.",
    );
    expect(SEVERITY_SECTION.endsWith(
      "\n\nA note with no consequence is not a finding; no findings is a good result.\n",
    )).toBe(true);
  });

  it("(d) keeps the reviewer's own Warning rule word for word", async () => {
    const reviewer = await load(REVIEWER);

    expect(flat(reviewer.raw)).toContain(REVIEWER_WARNING_RULE);
  });

  it("(d) aligns /st-rework's severity vocabulary in the same three lines, 20–22", async () => {
    const lines = (await load(REWORK)).raw.split("\n");
    const paragraph = lines.slice(19, 22).join("\n");

    expect(lines[18]).toBe("");
    expect(lines[19]?.startsWith("**Severity vocabulary**, used by every table below")).toBe(true);
    expect(lines[22]).toBe("");
    expect(flat(paragraph)).toContain(
      "**Minor** (a true defect with a small, named consequence)",
    );
    expect(flat(paragraph)).toContain("**Critical** (breaks a supported use");
    expect(flat(paragraph)).toContain("**Warning** (wrong or missing behavior a user or maintainer meets)");
  });

  it("(e) fails when one word of the section is reworded", async () => {
    const fixer = await load("agents/stamity-fixer.md");
    const reworded = corpusFileOf(
      fixer.relPath,
      fixer.raw.replace("no findings is a good result", "no findings is an acceptable result"),
    );

    expect(severityDefect(reworded)).toBe(
      `${fixer.relPath}: the "## Severity" section is not byte-identical to the scale`,
    );
  });

  it("(e) fails when the section is missing or not last", async () => {
    const reviewer = await load(REVIEWER);
    const cut = corpusFileOf(reviewer.relPath, reviewer.raw.replace(`\n${SEVERITY_SECTION}`, ""));
    const trailing = corpusFileOf(reviewer.relPath, `${reviewer.raw}\n## Afterword\n\nText.\n`);
    const twice = corpusFileOf(reviewer.relPath, `${reviewer.raw}\n${SEVERITY_SECTION}`);

    expect(severityDefect(cut)).toBe(`${reviewer.relPath}: no "## Severity" section`);
    expect(severityDefect(trailing)).toBe(
      `${reviewer.relPath}: "## Severity" is not the last section`,
    );
    expect(severityDefect(twice)).toBe(`${reviewer.relPath}: 2 "## Severity" sections`);
  });
});

describe("capture by consequence — a finding names its consequence, a note is counted", () => {
  const roles = [...new Set(CAPTURE_PINS.map((pin) => pin.relPath))];

  it.each(roles)("(f) %s carries every capture sentence in its section", async (relPath) => {
    expect(captureGaps(await load(relPath))).toEqual([]);
  });

  it("(f) the reviewer's digest counts the notes on the `findings:` line, before `security:`", async () => {
    const contract = flat(sectionText(await load(REVIEWER), "Return contract") ?? "");
    const findings = contract.indexOf("`findings:`");
    const notes = contract.indexOf("`notes left out: <n>`");

    expect(findings).toBeGreaterThan(-1);
    expect(notes).toBeGreaterThan(findings);
    expect(contract.indexOf("`security:`", findings)).toBeGreaterThan(notes);
  });

  it("(f) fails when the reviewer drops the `pre-existing:` lead or the notes count", async () => {
    const reviewer = await load(REVIEWER);
    const noLead = corpusFileOf(
      reviewer.relPath,
      reviewer.raw.replace("its\n`summary` leading `pre-existing:`", "its `summary` as usual"),
    );
    const noCount = corpusFileOf(
      reviewer.relPath,
      reviewer.raw.replace(", ending\n  `notes left out: <n>`;", ";"),
    );

    expect(captureGaps(noLead)).toEqual([
      "Rubric: A pre-existing defect is recorded only when it passes this test, its `summary` " +
        "leading `pre-existing:`.",
    ]);
    expect(captureGaps(noCount)).toEqual([
      "Return contract: then the `Minor` count with its ids and locators, ending " +
        "`notes left out: <n>`;",
    ]);
  });
});
