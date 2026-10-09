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
 *     sentence is exercised red on a real body. The security lens applies its Exclusions
 *     first and keeps its out-of-change row (S13), so it carries no `pre-existing:` lead, and
 *     a note with a security consequence is a finding carried in full on `security:`. The
 *     performance and design-quality lenses follow the security lens's shape: Exclusions
 *     first, then the consequence test, the notes counted on the digest. Design-quality keeps
 *     its out-of-change row (S13), and performance's consequence grade stays under its
 *     `Warning` ceiling unless a declared budget is breached: its Return contract says the
 *     budget rule, not the shared scale, decides its levels.
 *   - **(g) The execution roles** (S12, S13). The implementer and the fixer carry the same
 *     consequence test and digest count in their Return contracts, and both lead a recorded
 *     pre-existing defect with `pre-existing:`. The implementer applies a one-line note inside
 *     its own unit's files and counts a larger one, never deferring it; the fixer's "no
 *     opportunistic edits" rule stays byte for byte, and a reviewer's notes are never handed
 *     to it.
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
const SECURITY = "agents/stamity-security.md";
const PERFORMANCE = "agents/stamity-performance.md";
const DESIGN_QUALITY = "agents/stamity-design-quality.md";
const IMPLEMENTER = "agents/stamity-implementer.md";
const FIXER = "agents/stamity-fixer.md";
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
  /*
   * TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, fix round 1 for review
   * p8a–p8c (review/52, W-1, signed off). This pin held "is a `Minor` finding", which graded
   * every note promoted to a finding `Minor`, so one with a Warning or security consequence never
   * reached the human checkpoint or a fix round. It now holds the security lens's wording: the
   * consequence sets the severity.
   */
  {
    relPath: REVIEWER,
    section: "Rubric",
    phrase:
      "A note whose consequence shows once looked at, such as a misleading message a user acts " +
      "on, is a finding at the severity that consequence sets.",
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
  {
    relPath: SECURITY,
    section: "Return contract",
    phrase:
      "Exclusions are applied first: what they remove is out of scope, neither a finding nor a " +
      "note.",
  },
  {
    relPath: SECURITY,
    section: "Return contract",
    phrase:
      "Of the rest, a finding names its consequence: who or what is affected, how, and in which " +
      "use, with its evidence.",
  },
  {
    relPath: SECURITY,
    section: "Return contract",
    phrase:
      "A note with no consequence (wording, comment drift, a \"might\" with no trigger) is not a " +
      "finding: the report lists it and the digest counts it.",
  },
  {
    relPath: SECURITY,
    section: "Return contract",
    phrase:
      "A note whose consequence shows once looked at is a finding at the severity that " +
      "consequence sets, and `security:` carries it in full: a security consequence is never a " +
      "note left out.",
  },
  {
    relPath: SECURITY,
    section: "Return contract",
    phrase: "then the `Minor` count with its ids and locators, ending `notes left out: <n>`;",
  },
  {
    relPath: SECURITY,
    section: "Return contract",
    phrase: "an inline result carries the notes count, never the notes.",
  },
  ...lensCapturePins(PERFORMANCE, "a \"might be slow\" with no input that reaches it", [
    "A note whose consequence shows once looked at is a finding at the severity that " +
      "consequence sets, within the `Warning` ceiling unless a declared budget is breached; a " +
      "security-relevant one is carried on `security:` in full, never a note left out.",
  ]),
  ...lensCapturePins(DESIGN_QUALITY, "a \"might confuse\" with no flow that reaches it", [
    "A note whose consequence shows once looked at is a finding at the severity that " +
      "consequence sets; a security-relevant one is carried on `security:` in full, never a " +
      "note left out.",
  ]),
  ...executionCapturePins(IMPLEMENTER, "A finding names its consequence:", [
    "then the `Minor` count with its ids and locators, ending `notes left out: <n>`;",
  ]),
  {
    relPath: IMPLEMENTER,
    section: "Unit contract",
    phrase:
      "A cleaner structure, a rename or a wording with no consequence, found while building, is " +
      "applied when its fix is one line inside this unit's own files.",
  },
  {
    relPath: IMPLEMENTER,
    section: "Unit contract",
    phrase:
      "A larger one, or one that touches a file outside them, is listed in the report and " +
      "counted as a note left out: not a deferral, and never an edit.",
  },
  {
    relPath: IMPLEMENTER,
    section: "Gates",
    phrase:
      "A pre-existing defect is recorded as a finding only when it names a consequence, its " +
      "`summary` leading `pre-existing:`.",
  },
  ...executionCapturePins(FIXER, "A finding this role raises names its consequence:", [
    "then any new `Critical` or `Warning` as `<id> <locator> — <summary>`, ending " +
      "`notes left out: <n>`;",
  ]),
  {
    relPath: FIXER,
    section: "Return contract",
    phrase: "it is recorded, not applied (No opportunistic edits),",
  },
  {
    relPath: FIXER,
    section: "Return contract",
    phrase: "A reviewer's notes are never handed to this role.",
  },
  {
    relPath: FIXER,
    section: "Gate handback",
    phrase:
      "A pre-existing defect is recorded as a finding only when it names a consequence, its " +
      "`summary` leading `pre-existing:`.",
  },
];

/**
 * The capture sentences the implementer and the fixer share, all in `## Return contract`: the
 * consequence test (its subject differs by role), the no-consequence note, the promoted note's
 * severity, the role's own digest clause and the inline count.
 */
function executionCapturePins(
  relPath: string,
  opening: string,
  digest: readonly string[],
): CapturePin[] {
  return [
    `${opening} who or what is affected, how, and in which use, with its evidence.`,
    "A note with no consequence (wording, naming, style, comment drift, a tidier shape, a " +
      "\"might\" with no trigger) is not a finding:",
    "the report lists it and the digest counts it.",
    "A note whose consequence shows once looked at is a finding at the severity that " +
      "consequence sets.",
    ...digest,
    "an inline result carries the notes count, never the notes.",
  ].map((phrase) => ({ relPath, section: "Return contract", phrase }));
}

/** The fixer's "no opportunistic edits" rule (S12), held byte for byte. */
const FIXER_NO_OPPORTUNISTIC_EDITS =
  "- **No opportunistic edits.** Renames, dependency swaps, formatting sweeps outside the\n" +
  "  finding's lines, and improvements noticed in passing are recorded, not applied.\n";

/** The fixer's round-list rule with its Minor line, which the capture rule leaves as it stands. */
const FIXER_ROUND_LIST_RULE =
  "- **The round's list, nothing else.** Every `Critical` and `Warning` finding in the round\n" +
  "  gets a disposition: fixed, rejected with reasoning, or unresolved with a reason.\n" +
  "  `Minor` findings are ledgered by the reviewer and stay out of this pass.\n";

/**
 * The capture sentences the performance and design-quality lenses share with the security
 * lens's shape, all in `## Return contract`: Exclusions first, the consequence test, the note
 * with its lens-specific "might", the role's own grading sentence, and the digest count.
 */
function lensCapturePins(
  relPath: string,
  might: string,
  grading: readonly string[],
): CapturePin[] {
  return [
    "Exclusions are applied first: what they remove is out of scope, neither a finding nor a " +
      "note.",
    "Of the rest, a finding names its consequence: who or what is affected, how, and in which " +
      "use, with its evidence.",
    `A note with no consequence (naming, comment drift, a tidier shape, ${might}) is not a ` +
      "finding: the report lists it and the digest counts it.",
    ...grading,
    "then the `Minor` count with its ids and locators, ending `notes left out: <n>`;",
    "an inline result carries the notes count, never the notes.",
  ].map((phrase) => ({ relPath, section: "Return contract", phrase }));
}

/**
 * The security lens's out-of-change exclusion (S13): the lens keeps raising what it raised
 * before the capture rule, so a pre-existing condition stays out of scope rather than becoming
 * a `pre-existing:` finding.
 */
const SECURITY_OUT_OF_CHANGE =
  "**Anything outside the change.** A pre-existing condition the change neither introduces " +
  "nor worsens is out of scope for this run.";

/**
 * The design-quality lens's out-of-change exclusion (S13), which stays: a surface the change
 * did not touch is out of scope, never a `pre-existing:` finding.
 */
const DESIGN_OUT_OF_CHANGE =
  "**Surfaces the change did not touch.** A pre-existing surface the change neither renders " +
  "differently nor newly reaches is out of scope for this run.";

/**
 * The performance lens's precedence over the shared scale (review p8a–c, W-2): the scale stays
 * byte-identical (S11), so the lens's budget rule says outside it that it decides the levels.
 */
const PERFORMANCE_PRECEDENCE =
  "Where the `## Severity` scale below reads otherwise, this budget rule decides the lens's " +
  "levels: `Critical` only on a breached declared budget, and with no declared budget over the " +
  "surface the strongest finding is a `Warning`, as `/st-work`'s Specialist pass states.";

/** Why the performance body fails the precedence rule, or `undefined` when it holds. */
function precedenceDefect(file: CorpusFile): string | undefined {
  if (!flat(sectionText(file, "Return contract") ?? "").includes(PERFORMANCE_PRECEDENCE)) {
    return `${file.relPath}: no budget-rule precedence in the Return contract`;
  }
  if (flat(sectionText(file, "Severity") ?? "").includes("budget")) {
    return `${file.relPath}: the precedence sits inside the shared scale`;
  }
  return undefined;
}

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
    // TEST CHANGE, justified: 2026-10-09, review/52 rewrapped the Rubric paragraph, so the lead
    // now sits on one line; the cut is the same words, matched where they now lie.
    const noLead = corpusFileOf(
      reviewer.relPath,
      reviewer.raw.replace("its `summary` leading `pre-existing:`", "its `summary` as usual"),
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

describe("capture by consequence — the security lens keeps its exclusions and counts its notes", () => {
  it("(f) the security digest counts the notes on the `findings:` line, before `security:`", async () => {
    const contract = flat(sectionText(await load(SECURITY), "Return contract") ?? "");
    const findings = contract.indexOf("`findings:`");
    const notes = contract.indexOf("`notes left out: <n>`");

    expect(findings).toBeGreaterThan(-1);
    expect(notes).toBeGreaterThan(findings);
    expect(contract.indexOf("`security:`", findings)).toBeGreaterThan(notes);
  });

  it("(f) keeps the out-of-change exclusion and four or more rows, and no `pre-existing:` lead (S13)", async () => {
    const security = await load(SECURITY);
    const exclusions = flat(sectionText(security, "Exclusions") ?? "");

    expect(exclusions).toContain(SECURITY_OUT_OF_CHANGE);
    expect(exclusions.match(/- \*\*/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(security.raw).not.toContain("`pre-existing:`");
  });

  it("(f) fails when the lens drops the exclusions-first sentence or the notes count", async () => {
    const security = await load(SECURITY);
    const noExclusions = corpusFileOf(
      security.relPath,
      security.raw.replace(
        "- Exclusions are applied first: what they remove is out of scope, neither a finding nor a note.\n  Of the rest, a finding",
        "- A finding",
      ),
    );
    const noCount = corpusFileOf(
      security.relPath,
      security.raw.replace(", ending\n  `notes left out: <n>`;", ";"),
    );

    expect(captureGaps(noExclusions)).toEqual([
      "Return contract: Exclusions are applied first: what they remove is out of scope, neither " +
        "a finding nor a note.",
      "Return contract: Of the rest, a finding names its consequence: who or what is affected, " +
        "how, and in which use, with its evidence.",
    ]);
    expect(captureGaps(noCount)).toEqual([
      "Return contract: then the `Minor` count with its ids and locators, ending " +
        "`notes left out: <n>`;",
    ]);
  });
});

describe("capture by consequence — the performance and design-quality lenses", () => {
  it.each([PERFORMANCE, DESIGN_QUALITY])(
    "(f) %s counts the notes on the `findings:` line, before `security:`",
    async (relPath) => {
      const contract = flat(sectionText(await load(relPath), "Return contract") ?? "");
      const findings = contract.indexOf("`findings:`");
      const notes = contract.indexOf("`notes left out: <n>`");

      expect(findings).toBeGreaterThan(-1);
      expect(notes).toBeGreaterThan(findings);
      expect(contract.indexOf("`security:`", findings)).toBeGreaterThan(notes);
    },
  );

  it.each([PERFORMANCE, DESIGN_QUALITY])(
    "(f) %s keeps an exclusion table that holds \"out of scope\" with four or more rows, and no `pre-existing:` lead",
    async (relPath) => {
      const file = await load(relPath);
      const exclusions = flat(sectionText(file, "Exclusions") ?? "");

      expect(exclusions).toContain("out of scope");
      expect(exclusions.match(/- \*\*/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
      expect(file.raw).not.toContain("`pre-existing:`");
    },
  );

  it("(f) design-quality keeps its out-of-change exclusion (S13)", async () => {
    const exclusions = flat(sectionText(await load(DESIGN_QUALITY), "Exclusions") ?? "");

    expect(exclusions).toContain(DESIGN_OUT_OF_CHANGE);
  });

  it("(f) performance still blocks only on a breached declared budget", async () => {
    const performance = await load(PERFORMANCE);
    const budgets = flat(sectionText(performance, "Advisory unless budgets") ?? "");
    const contract = flat(sectionText(performance, "Return contract") ?? "");

    expect(budgets).toContain("A change measured past one is `Critical`");
    expect(budgets).toContain("**Everything else caps at `Warning`.**");
    expect(contract).toContain(
      "`Critical` requires a breached declared budget; without one the run's ceiling is `Warning`.",
    );
  });

  it("(f) performance states that its budget rule, not the shared scale, decides its levels", async () => {
    const performance = await load(PERFORMANCE);
    const dropped = corpusFileOf(
      performance.relPath,
      performance.raw.replace("`## Severity` scale below reads otherwise", "body"),
    );

    expect(precedenceDefect(performance)).toBeUndefined();
    expect(precedenceDefect(dropped)).toBe(
      `${performance.relPath}: no budget-rule precedence in the Return contract`,
    );
  });

  it("(f) fails when a lens drops the exclusions-first sentence or the notes count", async () => {
    const performance = await load(PERFORMANCE);
    const design = await load(DESIGN_QUALITY);
    const noExclusions = corpusFileOf(
      performance.relPath,
      performance.raw.replace(
        "- Exclusions are applied first: what they remove is out of scope, neither a finding nor a note.\n  Of the rest, a finding",
        "- A finding",
      ),
    );
    const noCount = corpusFileOf(
      design.relPath,
      design.raw.replace(", ending\n  `notes left out: <n>`;", ";"),
    );

    expect(captureGaps(noExclusions)).toEqual([
      "Return contract: Exclusions are applied first: what they remove is out of scope, neither " +
        "a finding nor a note.",
      "Return contract: Of the rest, a finding names its consequence: who or what is affected, " +
        "how, and in which use, with its evidence.",
    ]);
    expect(captureGaps(noCount)).toEqual([
      "Return contract: then the `Minor` count with its ids and locators, ending " +
        "`notes left out: <n>`;",
    ]);
  });
});

describe("capture by consequence — the implementer and the fixer", () => {
  it.each([IMPLEMENTER, FIXER])(
    "(g) %s counts the notes on the `findings:` line, before `security:`",
    async (relPath) => {
      const contract = flat(sectionText(await load(relPath), "Return contract") ?? "");
      const findings = contract.indexOf("`findings:`");
      const notes = contract.indexOf("`notes left out: <n>`");

      expect(findings).toBeGreaterThan(-1);
      expect(notes).toBeGreaterThan(findings);
      expect(contract.indexOf("`security:`", findings)).toBeGreaterThan(notes);
    },
  );

  it("(g) the implementer counts a larger note rather than deferring it", async () => {
    const unit = flat(sectionText(await load(IMPLEMENTER), "Unit contract") ?? "");

    // The S12 rule replaces the old one: an adjacent improvement no longer goes to deferrals.
    expect(unit).not.toContain("goes into the result's deferrals");
  });

  it("(g) the fixer keeps its round-list and no-opportunistic-edits rules byte for byte", async () => {
    const fixer = await load(FIXER);

    expect(fixer.raw).toContain(FIXER_ROUND_LIST_RULE);
    expect(fixer.raw).toContain(FIXER_NO_OPPORTUNISTIC_EDITS);
  });

  it("(g) fails when a role drops the one-line rule, the `pre-existing:` lead or the notes count", async () => {
    const implementer = await load(IMPLEMENTER);
    const fixer = await load(FIXER);
    const noOneLine = corpusFileOf(
      implementer.relPath,
      implementer.raw.replace("is applied when its fix is one line\n  inside", "is deferred, not applied,\n  inside"),
    );
    const noLead = corpusFileOf(
      fixer.relPath,
      fixer.raw.replace("its `summary` leading\n  `pre-existing:`", "its `summary` as usual"),
    );
    const noCount = corpusFileOf(
      implementer.relPath,
      implementer.raw.replace("locators, ending `notes left out: <n>`;", "locators;"),
    );

    expect(captureGaps(noOneLine)).toEqual([
      "Unit contract: A cleaner structure, a rename or a wording with no consequence, found " +
        "while building, is applied when its fix is one line inside this unit's own files.",
    ]);
    expect(captureGaps(noLead)).toEqual([
      "Gate handback: A pre-existing defect is recorded as a finding only when it names a " +
        "consequence, its `summary` leading `pre-existing:`.",
    ]);
    expect(captureGaps(noCount)).toEqual([
      "Return contract: then the `Minor` count with its ids and locators, ending " +
        "`notes left out: <n>`;",
    ]);
  });
});
